import { useCallback } from 'react';
import { X, FileAudio, FileVideo, Loader, Check, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STATUS_ICONS = {
  pending: null,
  waveform: Loader,
  encoding: Loader,
  uploading: Loader,
  done: Check,
  error: AlertCircle,
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getStatusLabel(status, t) {
  const labels = {
    pending: '',
    waveform: t('requestRegister.processing.waveform'),
    encoding: t('requestRegister.processing.encoding'),
    uploading: t('requestRegister.processing.uploading'),
    done: t('requestRegister.processing.completed'),
    error: t('requestRegister.processing.failed'),
  };
  return labels[status] || '';
}

function FileItem({ file, onRemove, isProcessing }) {
  const { t } = useTranslation('common');
  const isVideo = file.file?.type?.startsWith('video/');
  const FileIcon = isVideo ? FileVideo : FileAudio;
  const StatusIcon = STATUS_ICONS[file.status];
  const isSpinning = ['waveform', 'encoding', 'uploading'].includes(file.status);

  const handleRemove = useCallback(() => {
    onRemove(file.id);
  }, [file.id, onRemove]);

  return (
    <div className={`req-file-item${file.status === 'error' ? ' error' : ''}${file.status === 'done' ? ' done' : ''}`}>
      <FileIcon size={16} className="file-type-icon" />
      <div className="file-info">
        <span className="file-name" title={file.name}>{file.name}</span>
        <span className="file-size">{formatFileSize(file.size)}</span>
      </div>
      {file.status !== 'pending' && (
        <div className="file-status">
          {StatusIcon && (
            <StatusIcon size={14} className={`status-icon${isSpinning ? ' spinning' : ''}`} />
          )}
          <span className="status-label">{getStatusLabel(file.status, t)}</span>
          {file.progress > 0 && file.progress < 100 && file.status !== 'done' && (
            <span className="status-progress">{Math.round(file.progress)}%</span>
          )}
        </div>
      )}
      {file.error && (
        <span className="file-error-msg" title={file.error}>{file.error}</span>
      )}
      {!isProcessing && (file.status === 'pending' || file.status === 'error') && (
        <button className="file-remove-btn" onClick={handleRemove} title={t('requestRegister.removeFile')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default function FileList({ files, onRemove, isProcessing }) {
  if (files.length === 0) return null;

  return (
    <div className="req-file-list">
      {files.map((file) => (
        <FileItem
          key={file.id}
          file={file}
          onRemove={onRemove}
          isProcessing={isProcessing}
        />
      ))}
    </div>
  );
}
