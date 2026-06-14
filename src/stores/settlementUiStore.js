import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 정산 화면 UI 표시 선호도 (localStorage 영속)
export const useSettlementUiStore = create(
  persist(
    (set) => ({
      // 작업시간 표시 모드: 'min'(분) | 'hm'(시·분). 기본 'min' — 현행 동작 유지
      workTimeDisplayMode: 'min',
      setWorkTimeDisplayMode: (mode) => {
        if (mode === 'min' || mode === 'hm') set({ workTimeDisplayMode: mode });
      },
    }),
    {
      name: 'soribaro-settlement-ui-storage',
    }
  )
);
