/**
 * 번역 작업 상태 관리
 * 번역 처리 진행 상황과 결과를 관리합니다.
 */
import { create } from 'zustand';

/**
 * 작업 단계 정의
 */
const STEPS = {
  IDLE: { id: 0, label: '대기', progress: 0 },
  LOADING: { id: 1, label: '데이터 로드', progress: 10 },
  SPLITTING: { id: 2, label: '문맥 분할 분석', progress: 20 },
  TRANSLATING: { id: 3, label: '번역 중', progress: 30 },
  SAVING: { id: 4, label: '저장 중', progress: 90 },
  COMPLETED: { id: 5, label: '완료', progress: 100 },
  FAILED: { id: -1, label: '실패', progress: 0 },
};

export const useTranslateJobStore = create((set, get) => ({
  // ==================== 상태 ====================
  currentStep: STEPS.IDLE,
  progress: 0,
  detailProgress: 0, // 각 단계 내 세부 진행률
  error: null,

  // ==================== 청크 관리 ====================
  totalChunks: 0,
  completedChunks: 0,
  failedChunks: [], // 실패한 청크 인덱스 배열
  chunkResults: [], // 청크별 번역 결과 (메모리에서 관리)

  // ==================== 결과 데이터 ====================
  translatedSegments: [], // 최종 번역 결과

  // ==================== 원본 데이터 정보 ====================
  fileId: null,
  sourceLang: null,
  targetLang: null,

  // ==================== 액션 ====================

  /**
   * 현재 단계 설정
   * @param {object} step - STEPS 객체 중 하나
   */
  setStep: (step) =>
    set({
      currentStep: step,
      progress: step.progress,
      detailProgress: 0,
    }),

  /**
   * 세부 진행률 설정 (각 단계 내)
   * @param {number} progress - 0-100
   */
  setDetailProgress: (progress) => set({ detailProgress: progress }),

  /**
   * 에러 설정
   * @param {string} error - 에러 메시지
   */
  setError: (error) =>
    set({
      currentStep: STEPS.FAILED,
      error,
    }),

  /**
   * 청크 정보 초기화
   * @param {number} total - 총 청크 수
   */
  initChunks: (total) =>
    set({
      totalChunks: total,
      completedChunks: 0,
      failedChunks: [],
      chunkResults: new Array(total).fill(null),
    }),

  /**
   * 청크 완료 처리
   * @param {number} chunkIndex - 청크 인덱스
   * @param {Array} result - 번역 결과
   */
  setChunkCompleted: (chunkIndex, result) =>
    set((state) => {
      const newResults = [...state.chunkResults];
      newResults[chunkIndex] = result;

      const newCompleted = state.completedChunks + 1;
      const progress = Math.round((newCompleted / state.totalChunks) * 100);

      return {
        chunkResults: newResults,
        completedChunks: newCompleted,
        detailProgress: progress,
        // 실패 목록에서 제거 (재시도 성공 시)
        failedChunks: state.failedChunks.filter((i) => i !== chunkIndex),
      };
    }),

  /**
   * 청크 실패 처리
   * @param {number} chunkIndex - 청크 인덱스
   */
  setChunkFailed: (chunkIndex) =>
    set((state) => ({
      failedChunks: state.failedChunks.includes(chunkIndex)
        ? state.failedChunks
        : [...state.failedChunks, chunkIndex],
    })),

  /**
   * 번역 결과 설정 (최종)
   * @param {Array} segments - 번역된 자막 배열
   */
  setTranslatedSegments: (segments) => set({ translatedSegments: segments }),

  /**
   * 파일 정보 설정
   * @param {object} info - { fileId, sourceLang, targetLang }
   */
  setFileInfo: (info) =>
    set({
      fileId: info.fileId,
      sourceLang: info.sourceLang,
      targetLang: info.targetLang,
    }),

  /**
   * 상태 초기화
   */
  reset: () =>
    set({
      currentStep: STEPS.IDLE,
      progress: 0,
      detailProgress: 0,
      error: null,
      totalChunks: 0,
      completedChunks: 0,
      failedChunks: [],
      chunkResults: [],
      translatedSegments: [],
      fileId: null,
      sourceLang: null,
      targetLang: null,
    }),

  /**
   * 전체 진행률 계산 (단계 진행률 + 세부 진행률)
   * @returns {number} 0-100
   */
  getTotalProgress: () => {
    const { currentStep, detailProgress } = get();
    // 현재 단계의 진행률 + 다음 단계까지의 비율 * 세부 진행률
    const stepIds = Object.values(STEPS)
      .filter((s) => s.id >= 0)
      .map((s) => s.id)
      .sort((a, b) => a - b);

    const currentIndex = stepIds.indexOf(currentStep.id);
    if (currentIndex === -1 || currentIndex === stepIds.length - 1) {
      return currentStep.progress;
    }

    const nextStep = Object.values(STEPS).find(
      (s) => s.id === stepIds[currentIndex + 1]
    );
    const stepRange = nextStep.progress - currentStep.progress;

    return currentStep.progress + (detailProgress / 100) * stepRange;
  },

  /**
   * 작업 진행 중인지 확인
   * @returns {boolean}
   */
  isProcessing: () => {
    const { currentStep } = get();
    return currentStep.id > 0 && currentStep.id < 4;
  },

  /**
   * 모든 청크가 완료되었는지 확인
   * @returns {boolean}
   */
  isAllChunksCompleted: () => {
    const { totalChunks, completedChunks, failedChunks } = get();
    return completedChunks + failedChunks.length === totalChunks;
  },

  /**
   * 청크 결과 병합하여 최종 결과 반환
   * @returns {Array}
   */
  getMergedResults: () => {
    const { chunkResults } = get();
    return chunkResults.flat().filter(Boolean);
  },
}));

export { STEPS };
