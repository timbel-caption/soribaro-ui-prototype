/**
 * STT 작업 상태 관리
 * STT 처리 진행 상황과 결과를 관리합니다.
 */
import { create } from 'zustand';

/**
 * 작업 단계 정의
 */
const STEPS = {
  IDLE: { id: 0, label: '대기', progress: 0 },
  DOWNLOADING: { id: 1, label: '파일 다운로드', progress: 5 },
  CONVERTING: { id: 2, label: '오디오 변환', progress: 15 },
  SPLITTING: { id: 3, label: '파일 분할', progress: 25 },
  STT_PROCESSING: { id: 4, label: 'STT 처리', progress: 35 },
  MERGING: { id: 5, label: '자막 병합', progress: 85 },
  SAVING: { id: 6, label: '저장 중', progress: 90 },
  COMPLETED: { id: 7, label: '완료', progress: 100 },
  FAILED: { id: -1, label: '실패', progress: 0 },
};

export const useSttJobStore = create((set, get) => ({
  // ==================== 상태 ====================
  currentStep: STEPS.IDLE,
  progress: 0,
  detailProgress: 0,
  error: null,

  // ==================== 분할 모드 상태 ====================
  isSplitMode: false,
  totalChunks: 0,
  completedChunks: 0,
  chunkProgresses: [],

  // ==================== 결과 데이터 ====================
  subtitles: [],
  overlaps: [],

  // ==================== 원본 파일 정보 ====================
  fileName: null,

  // ==================== 액션 ====================
  
  setStep: (step) =>
    set({
      currentStep: step,
      progress: step.progress,
      detailProgress: 0,
    }),

  setDetailProgress: (progress) => set({ detailProgress: progress }),

  setError: (error) =>
    set({
      currentStep: STEPS.FAILED,
      error,
    }),

  setSubtitles: (subtitles) => set({ subtitles }),

  setOverlaps: (overlaps) => set({ overlaps }),

  setFileName: (fileName) => set({ fileName }),

  /**
   * 분할 모드 초기화
   * @param {number} totalChunks - 총 청크 수
   */
  initSplitMode: (totalChunks) =>
    set({
      isSplitMode: true,
      totalChunks,
      completedChunks: 0,
      chunkProgresses: new Array(totalChunks).fill(0),
    }),

  /**
   * 개별 청크 진행률 업데이트
   * @param {number} chunkIndex - 청크 인덱스
   * @param {number} progress - 0-100
   */
  setChunkProgress: (chunkIndex, progress) => {
    const { chunkProgresses } = get();
    const updated = [...chunkProgresses];
    updated[chunkIndex] = progress;
    const completedChunks = updated.filter((p) => p >= 100).length;
    const avgProgress = updated.reduce((sum, p) => sum + p, 0) / updated.length;
    set({
      chunkProgresses: updated,
      completedChunks,
      detailProgress: Math.round(avgProgress),
    });
  },

  reset: () =>
    set({
      currentStep: STEPS.IDLE,
      progress: 0,
      detailProgress: 0,
      error: null,
      isSplitMode: false,
      totalChunks: 0,
      completedChunks: 0,
      chunkProgresses: [],
      subtitles: [],
      overlaps: [],
      fileName: null,
    }),

  getTotalProgress: () => {
    const { currentStep, detailProgress } = get();
    const stepIds = Object.values(STEPS)
      .filter((s) => s.id >= 0)
      .map((s) => s.id)
      .sort((a, b) => a - b);
    
    const currentIndex = stepIds.indexOf(currentStep.id);
    if (currentIndex === -1 || currentIndex === stepIds.length - 1) {
      return currentStep.progress;
    }

    const nextStep = Object.values(STEPS).find((s) => s.id === stepIds[currentIndex + 1]);
    const stepRange = nextStep.progress - currentStep.progress;
    
    return currentStep.progress + (detailProgress / 100) * stepRange;
  },

  isProcessing: () => {
    const { currentStep } = get();
    return currentStep.id > 0 && currentStep.id < STEPS.COMPLETED.id;
  },
}));

export { STEPS };
