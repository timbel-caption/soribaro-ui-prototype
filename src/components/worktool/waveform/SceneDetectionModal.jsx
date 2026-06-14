import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import './SceneDetectionModal.css';

export default function SceneDetectionModal({
  isOpen,
  progress,
  status, // 'settings', 'detecting', 'saving', 'loading', 'complete'
  sceneCount,
  onCancel,
  onClose,
  onStart,
  cacheHit,
  initialThreshold = 30,
}) {
  const { t } = useTranslation('worktool');
  const [threshold, setThreshold] = useState(initialThreshold);

  // threshold 초기값 동기화
  useEffect(() => {
    setThreshold(initialThreshold);
  }, [initialThreshold]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && status !== 'detecting') {
        onClose?.();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, status, onClose]);

  if (!isOpen) return null;

  const getStatusMessage = () => {
    switch (status) {
      case 'settings':
        return t('sceneDetection.setSensitivity');
      case 'loading':
        return t('sceneDetection.checkingCache');
      case 'detecting':
        return t('sceneDetection.detecting');
      case 'saving':
        return t('sceneDetection.savingCache');
      case 'complete':
        return cacheHit ? t('sceneDetection.loadedFromCache') : t('sceneDetection.detectionComplete');
      default:
        return t('sceneDetection.processing');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'settings':
        return '⚙️';
      case 'loading':
        return '🔍';
      case 'detecting':
        return '🎬';
      case 'saving':
        return '💾';
      case 'complete':
        return cacheHit ? '⚡' : '✅';
      default:
        return '⏳';
    }
  };

  const handleStart = () => {
    onStart?.(threshold);
  };

  return createPortal(
    <div className="scene-modal-overlay">
      <div className="scene-modal">
        <div className="scene-modal-header">
          <span className="scene-modal-icon">{getStatusIcon()}</span>
          <h3>{t('sceneDetection.title')}</h3>
          {status === 'settings' && (
            <button onClick={onClose} className="scene-modal-close">✕</button>
          )}
        </div>
        
        <div className="scene-modal-content">
          {status === 'settings' ? (
            <div className="scene-modal-settings">
              <p className="settings-description" dangerouslySetInnerHTML={{ __html: t('sceneDetection.description') }} />
              <div className="threshold-setting">
                <label>{t('sceneDetection.sensitivity')}</label>
                <div className="threshold-slider-wrapper">
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="threshold-slider"
                  />
                  <div className="threshold-labels">
                    <span>{t('sceneDetection.low')}</span>
                    <span className="threshold-value">{threshold}</span>
                    <span>{t('sceneDetection.high')}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="scene-modal-status">
                {getStatusMessage()}
              </div>
              
              {status === 'detecting' && (
                <>
                  <div className="scene-modal-progress-bar">
                    <div 
                      className="scene-modal-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="scene-modal-progress-text">
                    {progress}%
                  </div>
                </>
              )}
              
              {status === 'complete' && (
                <div className="scene-modal-result">
                  <span className="result-count">{sceneCount}</span>
                  <span className="result-label">{t('sceneDetection.detectedCount')}</span>
                  {cacheHit && (
                    <span className="cache-badge">⚡ {t('sceneDetection.loadFromCache')}</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="scene-modal-actions">
          {status === 'settings' ? (
            <>
              <button onClick={onClose} className="scene-modal-btn cancel">
                {t('common.cancel')}
              </button>
              <button onClick={handleStart} className="scene-modal-btn confirm">
                🎬 {t('sceneDetection.startDetection')}
              </button>
            </>
          ) : status === 'detecting' ? (
            <button onClick={onCancel} className="scene-modal-btn cancel">
              ✕ {t('common.cancel')}
            </button>
          ) : status === 'complete' ? (
            <button onClick={onClose} className="scene-modal-btn confirm">
              {t('common.confirm')}
            </button>
          ) : (
            <div className="scene-modal-spinner" />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

