import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import LANGUAGES from '../../../constants/language.json';
import { getEnterpriseList } from '../../../api/v9/enterprise';
import { getEnterpriseCustomerList } from '../../../api/v9/enterpriseCustomer';
import {
  createRecordingService,
  createEnterpriseService,
  createTranslationService,
} from '../../../api/v9/order';
import useMediaProcessor from '../../../hooks/useMediaProcessor';
import FileUploadArea from './FileUploadArea';
import FileList from './FileList';
import UploadProgressOverlay from './UploadProgressOverlay';
import 'flag-icons/css/flag-icons.min.css';
import './RequestRegisterModal.css';

function toLegacyCode(code) {
  return LANGUAGES.find((l) => l.code === code)?.legacyCode || code;
}

function formatDateCompact(dateStr) {
  return dateStr ? dateStr.replace(/-/g, '') : '';
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Function} props.onSubmit
 * @param {'translation'|'enterprise'|'recording'} props.type
 * @param {string} [props.videoYn] - enterprise 타입에서 'Y'(VOD) 또는 'N'(회의록)
 */
export default function RequestRegisterModal({ open, onClose, onSubmit, type, videoYn }) {
  const { t } = useTranslation('common');

  const [form, setForm] = useState({
    serviceTitle: '',
    entNo: '',
    clientMembNo: '',
    clientEmail: '',
    isEmailMode: false,
    sourceLang: '',
    targetLangs: [],
    targetLangSelect: '',
    recordingDate: '',
    recordingPlace: '',
  });

  const [enterprises, setEnterprises] = useState([]);
  const [enterprisesLoading, setEnterprisesLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  const {
    files, isProcessing, overallProgress,
    addFiles, removeFile, processFiles, cancel, reset: resetProcessor,
  } = useMediaProcessor();

  const [submitting, setSubmitting] = useState(false);
  const disabled = isProcessing || submitting;

  useEffect(() => {
    if (!open) return;
    setForm({
      serviceTitle: '', entNo: '', clientMembNo: '', clientEmail: '',
      isEmailMode: false, sourceLang: '', targetLangs: [], targetLangSelect: '',
      recordingDate: '', recordingPlace: '',
    });
    setCustomers([]);
    resetProcessor();
    setSubmitting(false);
  }, [open, resetProcessor]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEnterprisesLoading(true);
    getEnterpriseList({ page: 0, size: 1000, useYn: 'Y' })
      .then((res) => {
        if (!cancelled && res?.status === 'SUCCESS') {
          setEnterprises((res.data?.content || []).sort((a, b) => (a.entNm || '').localeCompare(b.entNm || '', 'ko')));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEnterprisesLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!form.entNo) { setCustomers([]); return; }
    let cancelled = false;
    setCustomersLoading(true);
    getEnterpriseCustomerList({ page: 1, size: 1000, searchText: '' })
      .then((res) => {
        if (!cancelled && res?.status === 'SUCCESS') {
          const list = res.data?.content || res.data?.list || [];
          const entNoNum = Number(form.entNo);
          const filtered = list.filter((m) => Number(m.entNo) === entNoNum);
          setCustomers(filtered);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCustomersLoading(false); });
    return () => { cancelled = true; };
  }, [form.entNo]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !disabled) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, disabled]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'entNo') {
        next.clientMembNo = '';
        next.clientEmail = '';
      }
      return next;
    });
  }, []);

  const addTargetLang = useCallback(() => {
    setForm((prev) => {
      if (!prev.targetLangSelect || prev.targetLangs.some((l) => l.code === prev.targetLangSelect)) return prev;
      const lang = LANGUAGES.find((l) => l.code === prev.targetLangSelect);
      if (!lang) return prev;
      return {
        ...prev,
        targetLangs: [...prev.targetLangs, { code: lang.code, name: lang.name, country: lang.country }],
        targetLangSelect: '',
      };
    });
  }, []);

  const removeTargetLang = useCallback((code) => {
    setForm((prev) => ({
      ...prev,
      targetLangs: prev.targetLangs.filter((l) => l.code !== code),
    }));
  }, []);

  const validate = useCallback(() => {
    if (!form.serviceTitle.trim()) return t('requestRegister.requiredField');
    if (!form.entNo) return t('requestRegister.requiredField');
    if (!form.clientMembNo) return t('requestRegister.requiredField');
    if (type === 'translation') {
      if (!form.sourceLang) return t('requestRegister.requiredField');
      if (form.targetLangs.length === 0) return t('requestRegister.noTargetLanguage');
      if (form.targetLangs.some((l) => l.code === form.sourceLang)) return t('requestRegister.sameLanguageError');
    }
    if ((type === 'enterprise' || type === 'recording') && videoYn !== 'Y' && !form.recordingDate) {
      return t('requestRegister.requiredField');
    }
    if (files.length === 0) return t('requestRegister.noFiles');
    return null;
  }, [form, type, files.length, t]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const error = validate();
    if (error) { alert(error); return; }

    setSubmitting(true);
    try {
      const pendingFiles = files.filter((f) => f.status === 'pending');
      const uploadResults = await processFiles(pendingFiles);

      if (uploadResults.length === 0) {
        throw new Error('파일 업로드에 실패했습니다.');
      }

      const fileList = uploadResults.map((r) => ({
        fileNo: r.fileNo,
        fileName: r.fileName,
        systemFileName: r.systemFileName,
        filePath: r.filePath,
        fileSize: r.fileSize,
        fileType: r.fileType,
        playTime: r.playTime,
        ...(type !== 'translation' && videoYn !== 'Y' && {
          recordingDate: formatDateCompact(form.recordingDate),
          recordingPlace: form.recordingPlace.trim(),
        }),
      }));

      const baseBody = {
        serviceTitle: form.serviceTitle.trim(),
        entNo: Number(form.entNo),
        clientMembNo: Number(form.clientMembNo),
        remark: '',
        fileList,
      };

      let result;
      if (type === 'recording') {
        result = await createRecordingService(baseBody);
      } else if (type === 'enterprise') {
        const subType = videoYn === 'Y' ? 'vod' : 'minutes';
        result = await createEnterpriseService(subType, baseBody);
      } else {
        result = await createTranslationService({
          ...baseBody,
          sourceLanguageCode: toLegacyCode(form.sourceLang),
          translationLanguageList: form.targetLangs.map((lang) => ({
            translationLanguageCode: toLegacyCode(lang.code),
            translationLanguageName: lang.name,
            translationMidLanguageYn: false,
          })),
        });
      }

      onSubmit?.(result);
      onClose();
    } catch (err) {
      console.error('의뢰 등록 실패:', err);
      alert(err.message || '의뢰 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [validate, files, processFiles, form, type, videoYn, onSubmit, onClose]);

  const handleCancel = useCallback(() => { cancel(); setSubmitting(false); }, [cancel]);

  if (!open) return null;

  const isTranslation = type === 'translation';
  const typeLabel = t(`requestRegister.typeLabel.${type}`);

  return (
    <div className="req-register-overlay">
      <div className="req-register-modal" onClick={(e) => e.stopPropagation()}>
        <div className="req-register-header">
          <div className="req-register-header-left">
            <h3>{t('requestRegister.title')}</h3>
            <span className="req-type-badge">{typeLabel}</span>
          </div>
          <button className="req-modal-close-btn" onClick={onClose} disabled={disabled}>✕</button>
        </div>

        <form className="req-register-body" onSubmit={handleSubmit}>
          {/* 서비스 제목 */}
          <div className="req-form-row">
            <div className="req-form-group">
              <label>{t('requestRegister.serviceTitle')} *</label>
              <input
                type="text"
                value={form.serviceTitle}
                onChange={(e) => handleChange('serviceTitle', e.target.value)}
                placeholder={t('requestRegister.serviceTitlePlaceholder')}
                disabled={disabled}
                required
              />
            </div>
          </div>

          {/* 업체 / 의뢰자 */}
          <div className="req-form-row two-cols">
            <div className="req-form-group">
              <label>{t('requestRegister.selectCompany')} *</label>
              <select
                value={form.entNo}
                onChange={(e) => handleChange('entNo', e.target.value)}
                disabled={disabled || enterprisesLoading}
                required
              >
                <option value="">
                  {enterprisesLoading ? t('requestRegister.loadingCompanies') : t('requestRegister.selectCompanyPlaceholder')}
                </option>
                {enterprises.map((ent) => (
                  <option key={ent.entNo} value={ent.entNo}>{ent.entNm}</option>
                ))}
              </select>
            </div>
            <div className="req-form-group">
              <label>{t('requestRegister.requester')} *</label>
              <select
                value={form.clientMembNo}
                onChange={(e) => handleChange('clientMembNo', e.target.value)}
                disabled={disabled || customersLoading || !form.entNo}
                required
              >
                <option value="">
                  {!form.entNo
                    ? t('requestRegister.selectCompanyFirst')
                    : customersLoading
                      ? t('requestRegister.loadingCustomers')
                      : customers.length === 0
                        ? t('requestRegister.noCustomers')
                        : t('requestRegister.selectRequesterPlaceholder')}
                </option>
                {customers.map((c) => (
                  <option key={c.membNo} value={c.membNo}>
                    {c.membNm} ({c.membId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 번역: 출발어 + 도착어(다수) */}
          {isTranslation && (
            <>
              <div className="req-form-row">
                <div className="req-form-group">
                  <label>{t('requestRegister.sourceLanguage')} *</label>
                  <div className="req-lang-select-wrapper">
                    {form.sourceLang && (
                      <span className={`fi fi-${LANGUAGES.find((l) => l.code === form.sourceLang)?.country?.toLowerCase()}`} />
                    )}
                    <select
                      value={form.sourceLang}
                      onChange={(e) => handleChange('sourceLang', e.target.value)}
                      disabled={disabled}
                      required
                    >
                      <option value="">{t('requestRegister.selectLanguage')}</option>
                      {LANGUAGES.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name} ({lang.code.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="req-form-row">
                <div className="req-form-group">
                  <label>{t('requestRegister.targetLanguages')} *</label>
                  <div className="req-target-lang-area">
                    <div className="req-target-lang-input-row">
                      <div className="req-lang-select-wrapper">
                        {form.targetLangSelect && (
                          <span className={`fi fi-${LANGUAGES.find((l) => l.code === form.targetLangSelect)?.country?.toLowerCase()}`} />
                        )}
                        <select
                          value={form.targetLangSelect}
                          onChange={(e) => handleChange('targetLangSelect', e.target.value)}
                          disabled={disabled}
                        >
                          <option value="">{t('requestRegister.selectLanguage')}</option>
                          {LANGUAGES.filter((l) => l.code !== form.sourceLang && !form.targetLangs.some((tl) => tl.code === l.code))
                            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                            .map((lang) => (
                              <option key={lang.code} value={lang.code}>
                                {lang.name} ({lang.code.toUpperCase()})
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        className="req-add-lang-btn"
                        onClick={addTargetLang}
                        disabled={disabled || !form.targetLangSelect}
                      >
                        {t('requestRegister.addTargetLanguage')}
                      </button>
                    </div>
                    {form.targetLangs.length > 0 && (
                      <div className="req-lang-chips">
                        {form.targetLangs.map((lang) => (
                          <span key={lang.code} className="req-lang-chip">
                            <span className={`fi fi-${lang.country?.toLowerCase()}`} />
                            {lang.name}
                            <button
                              type="button"
                              className="req-chip-remove"
                              onClick={() => removeTargetLang(lang.code)}
                              disabled={disabled}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 엔터프라이즈/녹취록: 녹음일/녹음장소 (VOD 제외) */}
          {!isTranslation && videoYn !== 'Y' && (
            <div className="req-form-row two-cols">
              <div className="req-form-group">
                <label>{t('requestRegister.recordingDate')} *</label>
                <input
                  type="date"
                  value={form.recordingDate}
                  onChange={(e) => handleChange('recordingDate', e.target.value)}
                  disabled={disabled}
                  required
                />
              </div>
              <div className="req-form-group">
                <label>{t('requestRegister.recordingPlace')}</label>
                <input
                  type="text"
                  value={form.recordingPlace}
                  onChange={(e) => handleChange('recordingPlace', e.target.value)}
                  placeholder={t('requestRegister.recordingPlacePlaceholder')}
                  disabled={disabled}
                />
              </div>
            </div>
          )}

          {/* 파일 업로드 */}
          <div className="req-form-section">
            <label className="req-section-label">{t('requestRegister.uploadFiles')} *</label>
            <FileUploadArea files={files} onFilesAdd={addFiles} disabled={disabled} />
            <FileList files={files} onRemove={removeFile} isProcessing={disabled} />
          </div>

          {/* 푸터 */}
          <div className="req-register-footer">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={disabled}>
              {t('requestRegister.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={disabled || files.length === 0}>
              {submitting ? t('requestRegister.submitting') : t('requestRegister.register')}
            </button>
          </div>
        </form>

        <UploadProgressOverlay
          isProcessing={isProcessing}
          files={files}
          overallProgress={overallProgress}
          currentFileIndex={files.findIndex((f) => ['encoding', 'waveform', 'uploading', 'waveform_upload'].includes(f.status))}
          totalFiles={files.length}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
