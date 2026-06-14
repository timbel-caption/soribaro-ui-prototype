import { create } from 'zustand';
import { runNetflixQC, LANGUAGE_SETTINGS, NETFLIX_QC_RULES } from '../utils/netflixQCRules';

/**
 * Netflix QC 상태 관리 Store
 */
export const useNetflixQCStore = create((set, get) => ({
  // ===== 검수 상태 =====
  qcState: 'idle', // 'idle' | 'running' | 'completed' | 'aborted'
  progress: 0,
  currentIndex: 0,
  totalCount: 0,
  
  // ===== 검수 결과 =====
  results: [],
  lastQCTime: null,
  
  // ===== 설정 =====
  language: 'korean',
  frameRate: 29.97,
  enabledRules: { ...NETFLIX_QC_RULES },
  
  // ===== Actions =====
  setLanguage: (language) => set({ language }),
  setFrameRate: (frameRate) => set({ frameRate }),
  
  toggleRule: (ruleId) => set((state) => ({
    enabledRules: {
      ...state.enabledRules,
      [ruleId]: {
        ...state.enabledRules[ruleId],
        enabled: !state.enabledRules[ruleId].enabled,
      },
    },
  })),
  
  /**
   * Netflix QC 시작
   */
  startQC: async (subtitles) => {
    const { language, frameRate, enabledRules } = get();
    
    set({
      qcState: 'running',
      progress: 0,
      currentIndex: 0,
      totalCount: subtitles.length,
      results: [],
    });
    
    try {
      const results = await runNetflixQC(
        subtitles,
        language,
        frameRate,
        (progress, current, total) => {
          set({
            progress,
            currentIndex: current,
            totalCount: total,
          });
        },
        enabledRules
      );
      
      set({
        qcState: 'completed',
        results,
        lastQCTime: new Date().toISOString(),
        progress: 100,
      });
    } catch (error) {
      console.error('Netflix QC error:', error);
      set({ qcState: 'idle' });
    }
  },
  
  /**
   * 검수 중단
   */
  abortQC: () => {
    set({ qcState: 'aborted' });
  },
  
  /**
   * 검수 초기화
   */
  resetQC: () => {
    set({
      qcState: 'idle',
      progress: 0,
      currentIndex: 0,
      totalCount: 0,
      results: [],
      lastQCTime: null,
    });
  },
  
  /**
   * 특정 자막의 QC 결과 가져오기
   */
  getResultsForSubtitle: (subtitleId) => {
    const { results } = get();
    return results.filter(r => r.subtitleId === subtitleId);
  },
  
  /**
   * 결과 업데이트 (수정 적용 후)
   */
  updateResult: (resultIndex, update) => set((state) => {
    const newResults = [...state.results];
    if (newResults[resultIndex]) {
      newResults[resultIndex] = { ...newResults[resultIndex], ...update };
    }
    return { results: newResults };
  }),
  
  /**
   * 결과 삭제 (수정 완료 후)
   */
  removeResult: (resultIndex) => set((state) => ({
    results: state.results.filter((_, idx) => idx !== resultIndex),
  })),
}));

