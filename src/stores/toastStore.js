/**
 * Toast 알림 Store
 * 공통으로 사용할 수 있는 토스트 알림 시스템
 */
import { create } from 'zustand';

let toastId = 0;

export const useToastStore = create((set, get) => ({
  toasts: [],
  
  // 토스트 추가
  addToast: ({ message, type = 'info', duration = 3000 }) => {
    const id = ++toastId;
    
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));
    
    // 자동 제거 타이머
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
    
    return id;
  },
  
  // 토스트 제거
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  
  // 모든 토스트 제거
  clearAll: () => {
    set({ toasts: [] });
  },
}));

// 편의 함수들
export const toast = {
  success: (message, duration = 3000) => {
    return useToastStore.getState().addToast({ message, type: 'success', duration });
  },
  
  error: (message, duration = 5000) => {
    return useToastStore.getState().addToast({ message, type: 'error', duration });
  },
  
  info: (message, duration = 3000) => {
    return useToastStore.getState().addToast({ message, type: 'info', duration });
  },
  
  warning: (message, duration = 4000) => {
    return useToastStore.getState().addToast({ message, type: 'warning', duration });
  },
};
