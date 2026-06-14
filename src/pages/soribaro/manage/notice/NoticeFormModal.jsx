import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';
import { getNoticeDetail, createNotice, updateNotice, deleteNotice } from '../../../../api/v8/notice';
import { toast } from '../../../../stores/toastStore';
import './NoticeFormModal.css';

const formatDate = (value) => {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
};

const formatFileSize = (bytes) => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const INITIAL_FORM = {
  notiSubj: '',
  notiCont: '',
  notiTp: '',
  lang: 'kr',
  notiMembTp: '',
  notiUpYn: 'N',
  popupYn: 'N',
  popupStDt: '',
  popupEdDt: '',
};

export default function NoticeFormModal({ open, mode: initialMode, notiNo, onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const getCodeOptions = useCommonCodeStore((s) => s.getCodeOptions);

  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState(INITIAL_FORM);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const notiTpOptions = useMemo(() => getCodeOptions('NOTI_TP'), [getCodeOptions]);
  const membTpOptions = useMemo(() => getCodeOptions('MEMB_TP'), [getCodeOptions]);

  const isView = mode === 'view';
  const isCreate = mode === 'create';
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setDetail(null);
    setForm(INITIAL_FORM);

    if ((initialMode === 'view' || initialMode === 'edit') && notiNo) {
      setLoading(true);
      getNoticeDetail(notiNo)
        .then((res) => {
          if (res.status === 'SUCCESS' && res.data) {
            setDetail(res.data);
            setForm({
              notiSubj: res.data.notiSubj || '',
              notiCont: res.data.notiCont || '',
              notiTp: res.data.notiTp || '',
              lang: res.data.lang || 'kr',
              notiMembTp: res.data.notiMembTp || '',
              notiUpYn: res.data.notiUpYn || 'N',
              popupYn: res.data.popupYn || 'N',
              popupStDt: res.data.popupStDt || '',
              popupEdDt: res.data.popupEdDt || '',
            });
          }
        })
        .catch((err) => {
          toast.error(err.message);
        })
        .finally(() => setLoading(false));
    }
  }, [open, initialMode, notiNo]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.notiSubj.trim()) {
      toast.error(t('manage.notice.form.placeholderNotiSubj'));
      return;
    }
    setProcessing(true);
    try {
      const payload = { ...form };
      if (payload.popupYn !== 'Y') {
        payload.popupStDt = null;
        payload.popupEdDt = null;
      }

      let res;
      if (isCreate) {
        res = await createNotice(payload);
      } else {
        res = await updateNotice(notiNo, payload);
      }

      if (res.status === 'SUCCESS') {
        toast.success(t(isCreate ? 'manage.notice.form.alertCreated' : 'manage.notice.form.alertUpdated'));
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || t(isCreate ? 'manage.notice.form.alertCreateFailed' : 'manage.notice.form.alertUpdateFailed'));
      }
    } catch (err) {
      toast.error(err.message || t(isCreate ? 'manage.notice.form.alertCreateFailed' : 'manage.notice.form.alertUpdateFailed'));
    } finally {
      setProcessing(false);
    }
  }, [form, isCreate, notiNo, onClose, onSuccess, t]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(t('manage.notice.form.confirmDelete'))) return;
    setProcessing(true);
    try {
      const res = await deleteNotice(notiNo);
      if (res.status === 'SUCCESS') {
        toast.success(t('manage.notice.form.alertDeleted'));
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || t('manage.notice.form.alertDeleteFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.notice.form.alertDeleteFailed'));
    } finally {
      setProcessing(false);
    }
  }, [notiNo, onClose, onSuccess, t]);

  const handleSwitchToEdit = useCallback(() => {
    setMode('edit');
  }, []);

  if (!open) return null;

  const title = isCreate
    ? t('manage.notice.form.titleCreate')
    : isEdit
      ? t('manage.notice.form.titleEdit')
      : t('manage.notice.form.titleView');

  const files = detail?.files || [];

  const renderViewBody = () => {
    if (!detail) return null;
    const badges = [];
    if (detail.notiTpNm) badges.push({ label: detail.notiTpNm, cls: 'badge-type' });
    if (form.lang) badges.push({ label: form.lang.toUpperCase(), cls: 'badge-lang' });
    if (detail.notiMembTpNm) badges.push({ label: detail.notiMembTpNm, cls: 'badge-location' });
    if (form.notiUpYn === 'Y') badges.push({ label: t('manage.notice.notiUpYn.Y'), cls: 'badge-pinned' });
    if (form.popupYn === 'Y') {
      const period = form.popupStDt && form.popupEdDt ? ` (${form.popupStDt} ~ ${form.popupEdDt})` : '';
      badges.push({ label: `${t('manage.notice.columns.popupYn')}${period}`, cls: 'badge-popup' });
    }

    return (
      <div className="notice-view">
        {badges.length > 0 && (
          <div className="notice-view-badges">
            {badges.map((b, i) => (
              <span key={i} className={`nv-badge ${b.cls}`}>{b.label}</span>
            ))}
          </div>
        )}

        <h2 className="notice-view-title">{form.notiSubj}</h2>

        <div className="notice-view-meta">
          <span>{detail.regr || '-'}</span>
          <span className="meta-dot" />
          <span>{formatDate(detail.regDttm)}</span>
          <span className="meta-dot" />
          <span>{t('manage.notice.form.labelViewCnt')} {detail.viewCnt ?? 0}</span>
        </div>

        <div className="notice-view-divider" />

        <div className="notice-view-content" dangerouslySetInnerHTML={{ __html: form.notiCont }} />

        {(files.length > 0 || detail.chgr || detail.chgDttm) && (
          <>
            <div className="notice-view-divider" />
            <div className="notice-view-footer">
              {files.length > 0 && (
                <div className="notice-view-files">
                  <span className="nv-footer-label">{t('manage.notice.form.files')}</span>
                  <ul className="notice-file-list">
                    {files.map((f) => (
                      <li key={f.boardFileNo} className="notice-file-item">
                        <span className="file-name">{f.boardFileOriNm}</span>
                        <span className="file-size">{formatFileSize(f.boardFileSize)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(detail.chgr || detail.chgDttm) && (
                <p className="notice-view-modified">
                  {t('manage.notice.form.labelChgr')} {detail.chgr || '-'} &middot; {formatDate(detail.chgDttm)}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderFormBody = () => (
    <>
      <div className="form-group">
        <label>{t('manage.notice.form.labelNotiSubj')}</label>
        <input
          type="text"
          value={form.notiSubj}
          onChange={(e) => handleChange('notiSubj', e.target.value)}
          placeholder={t('manage.notice.form.placeholderNotiSubj')}
        />
      </div>

      <div className="form-group">
        <label>{t('manage.notice.form.labelNotiCont')}</label>
        <textarea
          rows={6}
          value={form.notiCont}
          onChange={(e) => handleChange('notiCont', e.target.value)}
          placeholder={t('manage.notice.form.placeholderNotiCont')}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t('manage.notice.form.labelNotiTp')}</label>
          <select value={form.notiTp} onChange={(e) => handleChange('notiTp', e.target.value)}>
            <option value="">{t('manage.notice.form.selectNone')}</option>
            {notiTpOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>{t('manage.notice.form.labelLang')}</label>
          <select value={form.lang} onChange={(e) => handleChange('lang', e.target.value)}>
            <option value="kr">한국어</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t('manage.notice.form.labelNotiMembTp')}</label>
          <select value={form.notiMembTp} onChange={(e) => handleChange('notiMembTp', e.target.value)}>
            <option value="">{t('manage.notice.form.selectNone')}</option>
            {membTpOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>{t('manage.notice.form.labelNotiUpYn')}</label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.notiUpYn === 'Y'}
              onChange={(e) => handleChange('notiUpYn', e.target.checked ? 'Y' : 'N')}
            />
            <span>{t('manage.notice.form.labelNotiUpYn')}</span>
          </label>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t('manage.notice.form.labelPopupYn')}</label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.popupYn === 'Y'}
              onChange={(e) => handleChange('popupYn', e.target.checked ? 'Y' : 'N')}
            />
            <span>{t('manage.notice.form.labelPopupYn')}</span>
          </label>
        </div>
        {form.popupYn === 'Y' && (
          <>
            <div className="form-group">
              <label>{t('manage.notice.form.labelPopupStDt')}</label>
              <input
                type="date"
                value={form.popupStDt || ''}
                onChange={(e) => handleChange('popupStDt', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t('manage.notice.form.labelPopupEdDt')}</label>
              <input
                type="date"
                value={form.popupEdDt || ''}
                onChange={(e) => handleChange('popupEdDt', e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </>
  );

  const modalClass = `notion-modal notice-form-modal${isView ? ' notice-form-modal--view' : ' notion-modal-lg'}`;

  return (
    <div className="notion-modal-overlay" onClick={onClose}>
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="notion-modal-header">
          <h3>{title}</h3>
          <button className="notion-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="notion-modal-body">
          {loading ? (
            <p className="text-muted">{t('manage.common.loadingData')}</p>
          ) : isView ? renderViewBody() : renderFormBody()}
        </div>

        {/* Footer */}
        <div className="notion-modal-footer">
          {isView && (
            <>
              <button className="btn-primary" onClick={handleSwitchToEdit} disabled={processing}>
                {t('manage.common.edit')}
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={processing}>
                {processing ? t('manage.common.processing') : t('manage.common.delete')}
              </button>
            </>
          )}
          {(isCreate || isEdit) && (
            <button className="btn-primary" onClick={handleSave} disabled={processing}>
              {processing ? t('manage.common.saving') : t('manage.common.save')}
            </button>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={processing}>
            {t('manage.common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
