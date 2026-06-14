import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ExcelJS from 'exceljs';
import { batchCreateMembers, getCompanyOptions } from '../../../api/v9/member';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';
import './BulkMemberUploadModal.css';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const MEMB_LVL_OPTIONS = [
  { value: '2', key: 'membLvl2' },
  { value: '3', key: 'membLvl3' },
  { value: '5', key: 'membLvl5' },
  { value: '6', key: 'membLvl6' },
];

const SITE_TYPE_OPTIONS = [
  { value: 'SORI', key: 'siteTypeSori' },
  { value: 'CLIP', key: 'siteTypeClip' },
];

const TEMPLATE_HEADERS = [
  '아이디(이메일)*',
  '이름*',
  '전화번호*',
  '비밀번호(기업고객용)',
  '수신이메일(기업고객용)',
];
const TEMPLATE_SAMPLES = [
  ['user@example.com', '홍길동', '01012345678', '', ''],
  ['sample@test.com', '김샘플', '01087654321', '', ''],
];

function isAcceptedFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

async function downloadTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('members');
  sheet.addRow(TEMPLATE_HEADERS);
  TEMPLATE_SAMPLES.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((col) => { col.width = 22; });
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'member_template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkMemberUploadModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [membLvl, setMembLvl] = useState('3');
  const [siteType, setSiteType] = useState('SORI');
  const [entNo, setEntNo] = useState('');
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);

  const reset = useCallback(() => {
    setFile(null);
    setMembLvl('3');
    setSiteType('SORI');
    setEntNo('');
    setSubmitting(false);
    setDragOver(false);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, submitting]);

  // 기업고객(membLvl=5) 선택 시 기업 옵션 로드
  useEffect(() => {
    if (!open || membLvl !== '5' || companyOptions.length > 0) return;
    let cancelled = false;
    (async () => {
      setCompanyLoading(true);
      try {
        const res = await getCompanyOptions();
        if (!cancelled && res.status === 'SUCCESS') {
          setCompanyOptions(res.data || []);
        }
      } catch {
        // 무시 — 사용자가 다시 select 하면 재시도 가능
      } finally {
        if (!cancelled) setCompanyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, membLvl, companyOptions.length]);

  const prefix = 'manage.worker.bulkUploadModal';

  const handleFilePicked = useCallback((picked) => {
    if (!picked) return;
    if (!isAcceptedFile(picked)) {
      toast.error(t(`${prefix}.alertInvalidFileType`));
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      toast.error(t(`${prefix}.alertFileTooLarge`));
      return;
    }
    setFile(picked);
    setResult(null);
  }, [t]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (submitting) return;
    const dropped = e.dataTransfer?.files?.[0];
    handleFilePicked(dropped);
  }, [handleFilePicked, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!file) {
      toast.error(t(`${prefix}.alertFileRequired`));
      return;
    }
    if (!membLvl) {
      toast.error(t(`${prefix}.alertMembLvlRequired`));
      return;
    }
    if (!siteType) {
      toast.error(t(`${prefix}.alertSiteTypeRequired`));
      return;
    }
    if (membLvl === '5' && !entNo) {
      toast.error(t(`${prefix}.alertEntNoRequired`));
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const res = await batchCreateMembers(file, { membLvl, siteType, entNo: entNo || undefined });
      if (res.status === 'SUCCESS') {
        setResult(res.data);
        if ((res.data?.successCount ?? 0) > 0) {
          onSuccess?.();
        }
        if ((res.data?.failCount ?? 0) === 0) {
          toast.success(res.message || t(`${prefix}.alertCompleted`));
        } else {
          toast.warning(res.message || t(`${prefix}.alertCompletedWithFailures`));
        }
      } else {
        toast.error(res.message || t(`${prefix}.alertFailed`));
      }
    } catch (err) {
      toast.error(err.data?.message || err.message || t(`${prefix}.alertFailed`));
    } finally {
      setSubmitting(false);
    }
  }, [file, membLvl, siteType, entNo, onSuccess, t]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      await downloadTemplate();
    } catch (err) {
      toast.error(t(`${prefix}.alertTemplateFailed`));
    }
  }, [t]);

  if (!open) return null;

  return (
    <div className="notion-modal-overlay" onClick={() => !submitting && onClose()}>
      <div className="notion-modal bulk-member-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-header">
          <h3>{t(`${prefix}.title`)}</h3>
          <button className="notion-modal-close" onClick={onClose} disabled={submitting}>&times;</button>
        </div>

        <div className="notion-modal-body">
          <div className="bulk-template-row">
            <span className="text-muted">{t(`${prefix}.templateHint`)}</span>
            <button className="btn-ghost btn-sm" onClick={handleDownloadTemplate} disabled={submitting}>
              {t(`${prefix}.downloadTemplate`)}
            </button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t(`${prefix}.labelMembLvl`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
              <select
                value={membLvl}
                onChange={(e) => setMembLvl(e.target.value)}
                disabled={submitting}
              >
                {MEMB_LVL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(`${prefix}.${o.key}`)}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t(`${prefix}.labelSiteType`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
              <select
                value={siteType}
                onChange={(e) => setSiteType(e.target.value)}
                disabled={submitting}
              >
                {SITE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(`${prefix}.${o.key}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {membLvl === '5' && (
            <div className="form-group">
              <label>{t(`${prefix}.labelEntNo`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
              <select
                value={entNo}
                onChange={(e) => setEntNo(e.target.value)}
                disabled={submitting || companyLoading}
              >
                <option value="">{companyLoading ? '...' : t(`${prefix}.selectEntNo`)}</option>
                {companyOptions.map((c) => (
                  <option key={c.entNo} value={String(c.entNo)}>{c.entNm}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>{t(`${prefix}.labelFile`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
            <div
              className={`bulk-dropzone${dragOver ? ' is-dragover' : ''}${file ? ' has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (!submitting) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !submitting && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => handleFilePicked(e.target.files?.[0])}
              />
              {file ? (
                <div className="bulk-dropzone-file">
                  <strong>{file.name}</strong>
                  <span className="text-muted">{(file.size / 1024).toFixed(1)} KB</span>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    disabled={submitting}
                  >
                    {t(`${prefix}.removeFile`)}
                  </button>
                </div>
              ) : (
                <div className="bulk-dropzone-empty">
                  <div>{t(`${prefix}.dropHere`)}</div>
                  <div className="text-muted">{t(`${prefix}.acceptedFormats`)}</div>
                </div>
              )}
            </div>
          </div>

          {result && (
            <div className="bulk-result">
              <div className="bulk-result-summary">
                <span>{t(`${prefix}.resultTotal`, { count: result.totalCount ?? 0 })}</span>
                <span className="bulk-success">{t(`${prefix}.resultSuccess`, { count: result.successCount ?? 0 })}</span>
                <span className="bulk-fail">{t(`${prefix}.resultFail`, { count: result.failCount ?? 0 })}</span>
              </div>
              {result.failureList?.length > 0 && (
                <div className="bulk-failure-table-wrap">
                  <table className="bulk-failure-table">
                    <thead>
                      <tr>
                        <th>{t(`${prefix}.colRow`)}</th>
                        <th>{t(`${prefix}.colMembId`)}</th>
                        <th>{t(`${prefix}.colMembNm`)}</th>
                        <th>{t(`${prefix}.colMblTelNo`)}</th>
                        <th>{t(`${prefix}.colReason`)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failureList.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.rowNumber}</td>
                          <td>{row.membId}</td>
                          <td>{row.membNm}</td>
                          <td>{row.mblTelNo}</td>
                          <td className="bulk-fail">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="notion-modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={submitting}>
            {t(`${prefix}.close`)}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !file}>
            {submitting ? t(`${prefix}.uploading`) : t(`${prefix}.upload`)}
          </button>
        </div>
      </div>
    </div>
  );
}
