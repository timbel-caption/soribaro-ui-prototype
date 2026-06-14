/**
 * 수강생 엑셀 일괄 업로드 모달 (관리자 전용)
 *
 * - membLvl='7' 고정 / siteType='SORI' 고정 → 사용자가 고를 옵션은 파일뿐
 * - 백엔드 v9 batch member API 재사용 (POST /v9/api/member/batch)
 * - [양식 다운로드] : 클라이언트 ExcelJS 로 즉석 생성
 *
 * 일반 회원 일괄 업로드 모달(BulkMemberUploadModal) 의 단순화 버전.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExcelJS from 'exceljs';
import { batchCreateMembers } from '../../api/v9/member';
import { toast } from '../../stores/toastStore';
import '../../styles/notion-list.css';
import '../../pages/soribaro/manage/BulkMemberUploadModal.css';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const TEMPLATE_HEADERS = [
  '아이디(이메일)*',
  '이름*',
  '전화번호*',
];
const TEMPLATE_SAMPLES = [
  ['trainee1@example.com', '홍길동', '01012345678'],
  ['trainee2@example.com', '김샘플', '01087654321'],
];

function isAcceptedFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

async function buildTemplateBlob() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('trainees');
  sheet.addRow(TEMPLATE_HEADERS);
  TEMPLATE_SAMPLES.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((col) => { col.width = 24; });
  sheet.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export default function TraineeBulkUploadModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation('common');
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);

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
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, submitting]);

  const handleFilePicked = useCallback((picked) => {
    if (!picked) return;
    if (!isAcceptedFile(picked)) {
      toast.error(t('training.studentsBulk.invalidType'));
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      toast.error(t('training.studentsBulk.tooLarge'));
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

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const blob = await buildTemplateBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trainee_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[TraineeBulkUploadModal] download template failed:', err);
      toast.error(err?.message || t('training.errors.downloadFailed'));
    }
  }, [t]);

  const handleSubmit = useCallback(async () => {
    if (!file) {
      toast.error(t('training.studentsBulk.fileRequired'));
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      // membLvl='7' (수강생) 고정, siteType='SORI' 고정. entNo 는 불필요.
      const res = await batchCreateMembers(file, { membLvl: '7', siteType: 'SORI' });
      if (res?.status === 'SUCCESS') {
        setResult(res.data);
        if ((res.data?.successCount ?? 0) > 0) {
          onSuccess?.();
        }
        if ((res.data?.failCount ?? 0) === 0) {
          toast.success(res.message || t('training.studentsBulk.completed'));
        } else {
          toast.warning(res.message || t('training.studentsBulk.completedWithFailures'));
        }
      } else {
        toast.error(res?.message || t('training.studentsBulk.failed'));
      }
    } catch (err) {
      toast.error(err?.data?.message || err?.message || t('training.studentsBulk.failed'));
    } finally {
      setSubmitting(false);
    }
  }, [file, onSuccess, t]);

  if (!open) return null;

  return (
    <div className="notion-modal-overlay" onClick={() => !submitting && onClose?.()}>
      <div
        className="notion-modal bulk-member-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t('training.studentsBulk.title')}</h3>
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
          <div className="bulk-template-row">
            <span className="text-muted">{t('training.studentsBulk.templateHint')}</span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleDownloadTemplate}
              disabled={submitting}
            >
              {t('training.assign.downloadTemplate')}
            </button>
          </div>

          <div className="form-group">
            <label>{t('training.studentsBulk.labelFile')}</label>
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
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={submitting}
                  >
                    {t('training.studentsBulk.removeFile')}
                  </button>
                </div>
              ) : (
                <div className="bulk-dropzone-empty">
                  <div>{t('training.studentsBulk.dropHere')}</div>
                  <div className="text-muted">{t('training.studentsBulk.acceptedFormats')}</div>
                </div>
              )}
            </div>
          </div>

          {result && (
            <div className="bulk-result">
              <div className="bulk-result-summary">
                <span>{t('training.studentsBulk.resultTotal', { count: result.totalCount ?? 0 })}</span>
                <span className="bulk-success">
                  {t('training.studentsBulk.resultSuccess', { count: result.successCount ?? 0 })}
                </span>
                <span className="bulk-fail">
                  {t('training.studentsBulk.resultFail', { count: result.failCount ?? 0 })}
                </span>
              </div>
              {result.failureList?.length > 0 && (
                <div className="bulk-failure-table-wrap">
                  <table className="bulk-failure-table">
                    <thead>
                      <tr>
                        <th>{t('training.studentsBulk.colRow')}</th>
                        <th>{t('training.studentsBulk.colMembId')}</th>
                        <th>{t('training.studentsBulk.colMembNm')}</th>
                        <th>{t('training.studentsBulk.colMblTelNo')}</th>
                        <th>{t('training.studentsBulk.colReason')}</th>
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
            onClick={handleSubmit}
            disabled={submitting || !file}
          >
            {submitting ? t('training.uploading') : t('training.studentsBulk.upload')}
          </button>
        </div>
      </div>
    </div>
  );
}
