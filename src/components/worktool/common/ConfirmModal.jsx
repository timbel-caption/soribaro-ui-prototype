import { useEffect, useRef } from 'react';
import { useModalStore } from '../../../stores/modalStore';
import './ConfirmModal.css';

export default function ConfirmModal() {
  const {
    isOpen,
    type,
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
  } = useModalStore();
  
  const confirmBtnRef = useRef(null);
  const modalRef = useRef(null);

  // 모달이 열릴 때 확인 버튼에 포커스
  useEffect(() => {
    if (isOpen && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [isOpen]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        if (type === 'confirm' && onCancel) {
          onCancel();
        } else if (onConfirm) {
          onConfirm();
        }
      } else if (e.key === 'Enter') {
        if (onConfirm) {
          onConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, type, onConfirm, onCancel]);

  if (!isOpen) return null;

  const handleClose = type === 'confirm' && onCancel ? onCancel : onConfirm;

  const handleBackdropClick = (e) => {
    if (e.target === modalRef.current) handleClose();
  };

  return (
    <div 
      ref={modalRef}
      className="confirm-modal-backdrop" 
      onClick={handleBackdropClick}
    >
      <div className="confirm-modal">
        <div className="confirm-modal-header">
          <h3 className="confirm-modal-title">{title}</h3>
          <button className="confirm-modal-close" onClick={handleClose}>
            <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        
        <div className="confirm-modal-body">
          <p className="confirm-modal-message">{message}</p>
        </div>
        
        <div className="confirm-modal-footer">
          {type === 'confirm' && onCancel && (
            <button 
              className="confirm-modal-btn cancel"
              onClick={onCancel}
            >
              {cancelText}
            </button>
          )}
          <button 
            ref={confirmBtnRef}
            className={`confirm-modal-btn confirm ${type}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}



