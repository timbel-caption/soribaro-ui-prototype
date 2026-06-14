/**
 * 엑셀 일괄 배정 모달 (관리자 전용)
 *
 * - [양식 다운로드] — v9 assignStudentsByExcel 가 받는 MEMB_ID 컬럼만 있는
 *   .xlsx 양식을 ExcelJS 로 즉석 생성. 학생은 과제 단위로 배정되며 그 과제의
 *   모든 파일에 자동 매핑된다 (단건 추가 모달과 동일 정책).
 * - 엑셀 파일(.xlsx) 선택 → 업로드 → 응답으로 결과 표시
 * - 응답 포맷: { inserted, skippedDuplicates, notFound: [...], errors: [...] }
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExcelJS from 'exceljs';
import { assignStudentsExcel } from '../../api/v9/training/assignments';
import { toast } from '../../stores/toastStore';
import '../../styles/notion-list.css';

/**
 * v9 백엔드의 assignStudentsByExcel 가 받아들이는 양식을 생성한다.
 * - 시트 'assignments': 헤더 [MEMB_ID] + 예시 행 2건
 */
async function buildTemplateBlob() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('assignments');
  sheet.addRow(['MEMB_ID']);
  sheet.addRow(['student1@example.com']);
  sheet.addRow(['student2@example.com']);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => { col.width = 36; });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export default function AssignmentStudentExcelModal({ open, assignmentId, onClose, onCompleted }) {
  const { t } = useTranslation('common');

  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setSubmitting(false);
      setProgress(0);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleFileChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
  }, []);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const blob = await buildTemplateBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training-assignment-template-${assignmentId || 'new'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[AssignmentStudentExcelModal] download template failed:', err);
      toast.error(err?.message || t('training.errors.downloadFailed'));
    }
  }, [assignmentId, t]);

  const handleUpload = useCallback(async () => {
    if (!file || !assignmentId) return;
    setSubmitting(true);
    setProgress(0);
    setError(null);
    setResult(null);
    try {
      const res = await assignStudentsExcel(assignmentId, file, (p) => setProgress(p));
      const data = res?.data ?? res;
      setResult(data);
      toast.success(t('training.assign.added'));
      if (typeof onCompleted === 'function') onCompleted(data);
    } catch (err) {
      console.error('[AssignmentStudentExcelModal] upload failed:', err);
      const msg = err?.message || t('training.assign.addFailed');
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [file, assignmentId, t, onCompleted]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  if (!open) return null;

  return (
    <div className="notion-modal-overlay" onClick={() => !submitting && onClose?.()}>
      <div
        className="notion-modal"
        style={{ width: 'min(600px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t('training.assign.uploadExcel')}</h3>
          <button
            type="button"
            className="notion-modal-close"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        <div className="notion-modal-body">
          <p className="form-hint" style={{ marginBottom: '8px' }}>
            {t('training.assign.excelHint')}
          </p>

          <div className="form-group">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleDownloadTemplate}
              disabled={submitting}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('training.assign.downloadTemplate')}
            </button>
          </div>

          <div className="form-group">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={submitting}
            />
            {file && (
              <span className="form-hint">{file.name}</span>
            )}
          </div>

          {submitting && (
            <div className="training-upload-progress">
              <div className="training-progress-bar">
                <div
                  className="training-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="form-hint">{progress}%</span>
            </div>
          )}

          {error && (
            <div className="error-banner">
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div style={{ marginTop: '12px', fontSize: '13px' }}>
              <h4 style={{ marginBottom: '6px' }}>{t('training.assign.result')}</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li>{t('training.assign.inserted', { count: result.inserted ?? 0 })}</li>
                <li>
                  {t('training.assign.skipped', {
                    count: result.skippedDuplicates ?? result.skipped ?? 0,
                  })}
                </li>
                <li>
                  {t('training.assign.notFound', {
                    count: (result.notFound || []).length,
                  })}
                </li>
                <li>
                  {t('training.assign.errors', {
                    count: (result.errors || []).length,
                  })}
                </li>
              </ul>
              {(result.notFound || []).length > 0 && (
                <details style={{ marginTop: '6px' }}>
                  <summary>{t('training.assign.notFound', { count: result.notFound.length })}</summary>
                  <pre
                    style={{
                      fontSize: '12px',
                      maxHeight: '120px',
                      overflow: 'auto',
                      background: 'var(--bg-secondary, #1f1f1f)',
                      padding: '6px',
                      borderRadius: '4px',
                    }}
                  >
                    {result.notFound.map((x) => JSON.stringify(x)).join('\n')}
                  </pre>
                </details>
              )}
              {(result.errors || []).length > 0 && (
                <details style={{ marginTop: '6px' }}>
                  <summary>{t('training.assign.errors', { count: result.errors.length })}</summary>
                  <pre
                    style={{
                      fontSize: '12px',
                      maxHeight: '120px',
                      overflow: 'auto',
                      background: 'var(--bg-secondary, #1f1f1f)',
                      padding: '6px',
                      borderRadius: '4px',
                    }}
                  >
                    {result.errors.map((x) => JSON.stringify(x)).join('\n')}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="notion-modal-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
          >
            {t('training.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleUpload}
            disabled={submitting || !file}
          >
            {submitting ? t('training.uploading') : t('training.register')}
          </button>
        </div>
      </div>
    </div>
  );
}
