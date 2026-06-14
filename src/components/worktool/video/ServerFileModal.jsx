import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { storageApi } from '../../../services/storage/storageApi';
import './ServerFileModal.css';

export default function ServerFileModal({ isOpen, onClose, onSelect }) {
  const { t } = useTranslation('worktool');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen]);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await storageApi.listFiles();
      setFiles(response.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async () => {
    if (!selectedFile) return;

    try {
      setLoading(true);
      // Pre-signed URL 가져오기
      const urlResponse = await storageApi.getPresignedUrl(selectedFile.name);
      const fileInfo = await storageApi.getFileInfo(selectedFile.name);

      onSelect({
        name: selectedFile.name,
        url: urlResponse.data.url,
        size: fileInfo.data.size,
        contentType: fileInfo.data.contentType,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ko-KR');
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'ogg', 'aac'].includes(ext)) return '🎵';
    return '📄';
  };

  if (!isOpen) return null;

  return (
    <div className="server-file-modal-overlay">
      <div className="server-file-modal">
        <div className="modal-header">
          <h2>{t('serverFile.title')}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-content">
          {loading && !files.length && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>{t('serverFile.loading')}</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>⚠️ {error}</p>
              <button onClick={loadFiles}>{t('serverFile.retry')}</button>
            </div>
          )}

          {!loading && !error && files.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <p>{t('serverFile.noFiles')}</p>
            </div>
          )}

          {files.length > 0 && (
            <div className="file-list">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>{t('serverFile.fileName')}</th>
                    <th>{t('serverFile.fileSize')}</th>
                    <th>{t('serverFile.modifiedDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr
                      key={file.name}
                      className={selectedFile?.name === file.name ? 'selected' : ''}
                      onClick={() => setSelectedFile(file)}
                      onDoubleClick={() => {
                        setSelectedFile(file);
                        handleSelect();
                      }}
                    >
                      <td className="file-icon">{getFileIcon(file.name)}</td>
                      <td className="file-name">{file.name}</td>
                      <td className="file-size">{formatFileSize(file.size)}</td>
                      <td className="file-date">{formatDate(file.lastModified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-select"
            onClick={handleSelect}
            disabled={!selectedFile || loading}
          >
            {loading ? t('serverFile.loadingButton') : t('common.select')}
          </button>
        </div>
      </div>
    </div>
  );
}
