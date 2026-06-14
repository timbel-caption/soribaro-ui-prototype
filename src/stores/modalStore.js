import { create } from 'zustand';
import i18next from 'i18next';

export const useModalStore = create((set, get) => ({
  // 확인/알림 모달 상태
  isOpen: false,
  type: 'confirm', // 'confirm', 'alert'
  title: '',
  message: '',
  confirmText: i18next.t('common.confirm', { ns: 'worktool' }),
  cancelText: i18next.t('common.cancel', { ns: 'worktool' }),
  onConfirm: null,
  onCancel: null,
  
  // 검수 모달 상태
  isValidationOpen: false,
  openValidation: () => set({ isValidationOpen: true }),
  closeValidation: () => set({ isValidationOpen: false }),
  
  // Netflix QC 모달 상태
  isNetflixQCOpen: false,
  openNetflixQC: () => set({ isNetflixQCOpen: true }),
  closeNetflixQC: () => set({ isNetflixQCOpen: false }),
  
  // 확인 모달 열기
  openConfirm: ({ title = i18next.t('common.confirm', { ns: 'worktool' }), message, confirmText = i18next.t('common.confirm', { ns: 'worktool' }), cancelText = i18next.t('common.cancel', { ns: 'worktool' }) }) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        onConfirm: () => {
          set({ isOpen: false });
          resolve(true);
        },
        onCancel: () => {
          set({ isOpen: false });
          resolve(false);
        },
      });
    });
  },
  
  // 알림 모달 열기
  openAlert: ({ title = i18next.t('common.confirm', { ns: 'worktool' }), message, confirmText = i18next.t('common.confirm', { ns: 'worktool' }) }) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        type: 'alert',
        title,
        message,
        confirmText,
        cancelText: '',
        onConfirm: () => {
          set({ isOpen: false });
          resolve(true);
        },
        onCancel: null,
      });
    });
  },
  
  // 모달 닫기
  close: () => {
    const { onCancel } = get();
    if (onCancel) {
      onCancel();
    } else {
      set({ isOpen: false });
    }
  },
}));

// 편의 함수들
export const confirm = (message, options = {}) => {
  return useModalStore.getState().openConfirm({ message, ...options });
};

export const alert = (message, options = {}) => {
  return useModalStore.getState().openAlert({ message, ...options });
};

