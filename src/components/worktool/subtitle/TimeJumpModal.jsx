import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './TimeJumpModal.css';

export default function TimeJumpModal({ isOpen, onClose, onJump }) {
  const { t } = useTranslation('worktool');
  const [hh, setHh] = useState('');
  const [mm, setMm] = useState('');
  const [ss, setSs] = useState('');
  const [error, setError] = useState('');
  const hhRef = useRef(null);
  const mmRef = useRef(null);
  const ssRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setHh('');
      setMm('');
      setSs('');
      setError('');
      setTimeout(() => hhRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleJump = () => {
    const hours = parseInt(hh || '0', 10);
    const minutes = parseInt(mm || '0', 10);
    const seconds = parseInt(ss || '0', 10);

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
      setError(t('timeJump.numberOnly'));
      return;
    }
    if (minutes > 59 || seconds > 59) {
      setError(t('timeJump.rangeError'));
      return;
    }

    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    onJump(totalSeconds);
    onClose();
  };

  const handleInputChange = (value, setter, nextRef, max) => {
    const num = value.replace(/\D/g, '');
    setter(num);
    setError('');
    if (num.length >= 2 && nextRef?.current) {
      nextRef.current.focus();
      nextRef.current.select();
    }
  };

  const handleKeyDown = (e, prevRef) => {
    if (e.key === 'Enter') {
      handleJump();
    } else if (e.key === 'Backspace' && e.target.value === '' && prevRef?.current) {
      prevRef.current.focus();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="timejump-modal-overlay">
      <div className="timejump-modal">
        <div className="timejump-modal-header">
          <h3>{t('timeJump.title')}</h3>
          <button onClick={onClose} className="timejump-modal-close">✕</button>
        </div>

        <div className="timejump-modal-content">
          <label className="timejump-label">{t('timeJump.description')}</label>
          <div className="timejump-fields">
            <div className="timejump-field">
              <input
                ref={hhRef}
                type="text"
                className={`timejump-input ${error ? 'has-error' : ''}`}
                value={hh}
                onChange={(e) => handleInputChange(e.target.value, setHh, mmRef)}
                onKeyDown={(e) => handleKeyDown(e, null)}
                placeholder="00"
                maxLength={2}
              />
              <span className="timejump-field-label">{t('timeJump.hours')}</span>
            </div>
            <span className="timejump-separator">:</span>
            <div className="timejump-field">
              <input
                ref={mmRef}
                type="text"
                className={`timejump-input ${error ? 'has-error' : ''}`}
                value={mm}
                onChange={(e) => handleInputChange(e.target.value, setMm, ssRef)}
                onKeyDown={(e) => handleKeyDown(e, hhRef)}
                placeholder="00"
                maxLength={2}
              />
              <span className="timejump-field-label">{t('timeJump.minutes')}</span>
            </div>
            <span className="timejump-separator">:</span>
            <div className="timejump-field">
              <input
                ref={ssRef}
                type="text"
                className={`timejump-input ${error ? 'has-error' : ''}`}
                value={ss}
                onChange={(e) => handleInputChange(e.target.value, setSs, null)}
                onKeyDown={(e) => handleKeyDown(e, mmRef)}
                placeholder="00"
                maxLength={2}
              />
              <span className="timejump-field-label">{t('timeJump.seconds')}</span>
            </div>
          </div>
          {error && <span className="timejump-error">{error}</span>}
        </div>

        <div className="timejump-modal-footer">
          <button className="timejump-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="timejump-btn-jump" onClick={handleJump}>{t('timeJump.jumpButton')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
