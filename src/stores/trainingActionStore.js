/**
 * 연수(Training) UI 액션 전달용 ephemeral store.
 *
 * SubtitleList toolbar 의 [제출] 버튼이 TrainingWorktoolOverlay 의 제출 로직과
 * 결과 모달을 호출하기 위한 단방향 트리거 채널.
 *
 * - submitNonce: 증가하면 TrainingWorktoolOverlay 가 STUDENT 제출 로직 실행
 * - showResultNonce: 증가하면 TrainingWorktoolOverlay 가 결과 모달 표시
 *
 * persist 하지 않음 — 페이지가 새로 열릴 때 0 으로 시작.
 */
import { create } from 'zustand';

export const useTrainingActionStore = create((set) => ({
  submitNonce: 0,
  showResultNonce: 0,
  // Overlay → SubtitleList: STUDENT 제출 완료 여부 / 결과 보유 여부 publish
  studentSubmitted: false,
  studentHasResult: false,
  requestSubmit: () => set((s) => ({ submitNonce: s.submitNonce + 1 })),
  requestShowResult: () => set((s) => ({ showResultNonce: s.showResultNonce + 1 })),
  setStudentSubmitted: (value) => set({ studentSubmitted: !!value }),
  setStudentHasResult: (value) => set({ studentHasResult: !!value }),
  reset: () => set({
    submitNonce: 0,
    showResultNonce: 0,
    studentSubmitted: false,
    studentHasResult: false,
  }),
}));
