import { memo } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore } from '../../../stores/toastStore';
import './Toast.css';

// 타입별 아이콘
const TOAST_ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

// 개별 토스트 아이템
const ToastItem = memo(function ToastItem({ toast, onClose }) {
  return (
    <div className={`toast-item toast-${toast.type}`}>
      <span className="toast-icon">{TOAST_ICONS[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={() => onClose(toast.id)}>
        ✕
      </button>
    </div>
  );
});

// 토스트 컨테이너
export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  
  if (toasts.length === 0) return null;
  
  return createPortal(
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onClose={removeToast} 
        />
      ))}
    </div>,
    document.body
  );
}

export default ToastContainer;
