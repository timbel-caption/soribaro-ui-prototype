import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const STEP_ORDER = ['encoding', 'waveform', 'uploading', 'waveform_upload'];

function getStepLabel(step, t) {
  const map = {
    encoding: t('requestRegister.processing.encoding'),
    waveform: t('requestRegister.processing.waveform'),
    uploading: t('requestRegister.processing.uploading'),
    waveform_upload: t('requestRegister.processing.waveformUpload'),
  };
  return map[step] || step;
}

export default function UploadProgressOverlay({
  isProcessing,
  files,
  overallProgress,
  currentFileIndex,
  totalFiles,
  onCancel,
}) {
  const { t } = useTranslation('common');

  const handleCancel = useCallback(() => {
    if (window.confirm(t('requestRegister.processing.cancelConfirm'))) {
      onCancel?.();
    }
  }, [onCancel, t]);

  if (!isProcessing) return null;

  const completedCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const currentFile = files.find((f) =>
    ['encoding', 'waveform', 'uploading', 'waveform_upload'].includes(f.status)
  );

  return (
    <div className="req-upload-overlay">
      <div className="req-upload-progress-container">
        <h3 className="progress-title">{t('requestRegister.processing.overall')}</h3>

        <div className="progress-bar-wrapper">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(overallProgress, 100)}%` }}
            />
          </div>
          <span className="progress-percent">{Math.round(overallProgress)}%</span>
        </div>

        <p className="progress-file-info">
          {t('requestRegister.processing.fileProgress', {
            current: completedCount + (currentFile ? 1 : 0),
            total: totalFiles,
          })}
        </p>

        {currentFile && (
          <div className="current-file-info">
            <span className="current-file-name" title={currentFile.name}>
              {currentFile.name}
            </span>
            <div className="step-indicators">
              {STEP_ORDER.map((step) => {
                const isCurrent = currentFile.status === step;
                const stepIdx = STEP_ORDER.indexOf(step);
                const currentIdx = STEP_ORDER.indexOf(currentFile.status);
                const isDone = currentIdx > stepIdx;
                // 인코딩 단계는 필요한 경우만 표시
                if (step === 'encoding' && !currentFile.needsEncoding && !isDone && !isCurrent) {
                  return null;
                }
                return (
                  <span
                    key={step}
                    className={`step-badge${isCurrent ? ' active' : ''}${isDone ? ' done' : ''}`}
                  >
                    {getStepLabel(step, t)}
                    {isCurrent && currentFile.progress > 0 && (
                      <span className="step-progress"> {Math.round(currentFile.progress)}%</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {errorCount > 0 && (
          <p className="progress-error-info">
            {t('requestRegister.processing.failed')}: {errorCount}
          </p>
        )}

        <button className="progress-cancel-btn" onClick={handleCancel}>
          {t('requestRegister.processing.cancelProcessing')}
        </button>
      </div>
    </div>
  );
}
