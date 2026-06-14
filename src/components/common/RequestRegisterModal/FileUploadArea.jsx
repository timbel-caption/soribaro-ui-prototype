import { useState, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ACCEPT_TYPES = 'audio/*,video/*,.mp3,.mp4,.wav,.flac,.aac,.ogg,.mov,.avi,.mkv,.webm,.m4a,.wma';

export default function FileUploadArea({ files, onFilesAdd, disabled }) {
  const { t } = useTranslation('common');
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const handleFiles = useCallback((fileList) => {
    if (disabled) return;
    const mediaFiles = Array.from(fileList).filter((f) =>
      f.type.startsWith('audio/') || f.type.startsWith('video/')
    );
    if (mediaFiles.length > 0) {
      onFilesAdd(mediaFiles);
    }
  }, [onFilesAdd, disabled]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const handleInputChange = useCallback((e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  }, [handleFiles]);

  return (
    <div
      className={`req-file-upload-area${isDragOver ? ' drag-over' : ''}${disabled ? ' disabled' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_TYPES}
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
      <Upload size={28} strokeWidth={1.5} className="upload-icon" />
      <p className="upload-main-text">
        {isDragOver
          ? t('requestRegister.dragActive')
          : t('requestRegister.dragAndDrop')}
      </p>
      <p className="upload-sub-text">{t('requestRegister.acceptedFormats')}</p>
      {files.length > 0 && (
        <p className="upload-file-count">
          {t('requestRegister.fileCount', { count: files.length })}
        </p>
      )}
    </div>
  );
}
