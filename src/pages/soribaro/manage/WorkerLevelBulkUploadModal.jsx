import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { batchUpdateWorkerLevels, downloadWorkerLevelTemplate } from '../../../api/v9/member';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';
import './BulkMemberUploadModal.css';

const ACCEPTED_EXTENSIONS = ['.xlsx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isAcceptedFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function WorkerLevelBulkUploadModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);

  const prefix = 'manage.worker.workerLevelBulkModal';

  const reset = useCallback(() => {
    setFile(null);
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
    handleFilePicked(e.dataTransfer?.files?.[0]);
  }, [handleFilePicked, submitting]);

  const handleDownloadTemplate = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadWorkerLevelTemplate();
    } catch (err) {
      toast.error(err.message || t(`${prefix}.alertTemplateFailed`));
    } finally {
      setDownloading(false);
    }
  }, [t]);

  const handleSubmit = useCallback(async () => {
    if (!file) {
      toast.error(t(`${prefix}.alertFileRequired`));
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await batchUpdateWorkerLevels(file);
      if (res.status === 'SUCCESS') {
        setResult(res.data);
        if ((res.data?.successCount ?? 0) > 0) onSuccess?.();
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
  }, [file, onSuccess, t]);

  if (!open) return null;

  const failRows = (result?.results || []).filter((r) => r.status === 'FAIL');

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
            <button className="btn-ghost btn-sm" onClick={handleDownloadTemplate} disabled={submitting || downloading}>
              {downloading ? t(`${prefix}.downloading`) : t(`${prefix}.downloadTemplate`)}
            </button>
          </div>

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
                accept=".xlsx"
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
                <span>{t(`${prefix}.resultTotal`, { count: result.totalRows ?? 0 })}</span>
                <span className="bulk-success">{t(`${prefix}.resultSuccess`, { count: result.successCount ?? 0 })}</span>
                <span className="bulk-fail">{t(`${prefix}.resultFail`, { count: result.failCount ?? 0 })}</span>
              </div>
              {failRows.length > 0 && (
                <div className="bulk-failure-table-wrap">
                  <table className="bulk-failure-table">
                    <thead>
                      <tr>
                        <th>{t(`${prefix}.colRow`)}</th>
                        <th>{t(`${prefix}.colMembId`)}</th>
                        <th>{t(`${prefix}.colReason`)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failRows.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.rowNo}</td>
                          <td>{row.membId}</td>
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
