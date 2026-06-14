import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useMediaProcessor from '../../../hooks/useMediaProcessor';
import { addRequestFiles } from '../../../api/v9/file';
import FileUploadArea from '../RequestRegisterModal/FileUploadArea';
import FileList from '../RequestRegisterModal/FileList';
import UploadProgressOverlay from '../RequestRegisterModal/UploadProgressOverlay';
import './RequestFileAddModal.css';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {string} props.servCd
 * @param {Function} props.onClose
 * @param {Function} props.onSuccess
 */
export default function RequestFileAddModal({ open, servCd, onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');

  const {
    files, isProcessing, overallProgress,
    addFiles, removeFile, processFiles, cancel, reset: resetProcessor,
  } = useMediaProcessor();

  const [submitting, setSubmitting] = useState(false);
  const disabled = isProcessing || submitting;

  useEffect(() => {
    if (!open) return;
    resetProcessor();
    setSubmitting(false);
  }, [open, resetProcessor]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !disabled) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, disabled]);

  const handleSubmit = useCallback(async () => {
    if (files.length === 0) {
      alert(t('common.addRequestFileNoFiles'));
      return;
    }

    setSubmitting(true);
    try {
      const pendingFiles = files.filter((f) => f.status === 'pending');
      const uploadResults = await processFiles(pendingFiles);

      if (uploadResults.length === 0) {
        throw new Error(t('common.addRequestFileFailed'));
      }

      const fileList = uploadResults.map((r) => ({
        fileNo: r.fileNo,
        fileName: r.fileName,
        systemFileName: r.systemFileName,
        filePath: r.filePath,
        fileSize: r.fileSize,
        fileType: r.fileType,
        playTime: r.playTime,
      }));

      const result = await addRequestFiles({ servCd, fileList });

      if (result.status === 'SUCCESS') {
        onSuccess?.();
        onClose();
      } else {
        throw new Error(result.message || t('common.addRequestFileFailed'));
      }
    } catch (err) {
      console.error('의뢰파일 추가 실패:', err);
      alert(err.message || t('common.addRequestFileFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [files, processFiles, servCd, onSuccess, onClose, t]);

  const handleCancel = useCallback(() => {
    cancel();
    setSubmitting(false);
  }, [cancel]);

  if (!open) return null;

  return (
    <div className="rfa-overlay" onClick={!disabled ? onClose : undefined}>
      <div className="rfa-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rfa-header">
          <h3>{t('common.addRequestFileTitle')}</h3>
          <button className="rfa-close-btn" onClick={onClose} disabled={disabled}>✕</button>
        </div>

        <div className="rfa-body">
          <FileUploadArea files={files} onFilesAdd={addFiles} disabled={disabled} />
          <FileList files={files} onRemove={removeFile} isProcessing={disabled} />
        </div>

        <div className="rfa-footer">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={disabled}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={disabled || files.length === 0}
          >
            {submitting ? t('common.addRequestFileSubmitting') : t('common.addRequestFileUpload')}
          </button>
        </div>

        <UploadProgressOverlay
          isProcessing={isProcessing}
          files={files}
          overallProgress={overallProgress}
          currentFileIndex={files.findIndex((f) => ['waveform', 'encoding', 'uploading'].includes(f.status))}
          totalFiles={files.length}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
