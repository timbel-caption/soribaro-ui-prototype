/**
 * 검수 Store
 * 검수 상태, 진행률, 결과를 관리합니다.
 */
import { create } from 'zustand';
import { validateSubtitle, validateByMinute, getHighestSeverity } from '../utils/validationRules';

export const useValidationStore = create((set, get) => ({
  // ===== 검수 상태 =====
  isValidating: false,        // 검수 진행 중
  progress: 0,                // 진행률 (0-100)
  currentIndex: 0,            // 현재 검수 중인 자막 인덱스
  totalCount: 0,              // 전체 자막 수
  
  // ===== 검수 결과 =====
  results: {},                // { subtitleId: { issues: [], severity: 'error'|'warning'|null } }
  minuteResults: [],          // 분 단위 검사 결과 (WPM 등)
  lastValidatedAt: null,      // 마지막 검수 시간
  
  // ===== 통계 =====
  stats: {
    total: 0,
    passed: 0,
    failed: 0,
    errors: 0,
    warnings: 0,
  },

  // ===== 액션 =====
  
  /**
   * 검수 시작
   * @param {Object[]} subtitles - 자막 배열
   * @param {Object} settings - 환경설정 (general)
   * @param {Function} onProgress - 진행률 콜백 (optional)
   */
  startValidation: async (subtitles, settings, onProgress) => {
    const { isValidating } = get();
    if (isValidating) return;

    set({
      isValidating: true,
      progress: 0,
      currentIndex: 0,
      totalCount: subtitles.length,
      results: {},
      minuteResults: [],
    });

    const results = {};
    let errorCount = 0;
    let warningCount = 0;
    let passedCount = 0;

    // 개별 자막 검수 (한 건씩 처리하며 progress 업데이트)
    for (let i = 0; i < subtitles.length; i++) {
      const subtitle = subtitles[i];
      const issues = validateSubtitle(subtitle, i, subtitles, settings);
      const severity = getHighestSeverity(issues);
      
      results[subtitle.id] = {
        issues,
        severity,
        validatedAt: Date.now(),
      };

      // 통계 업데이트
      if (issues.length === 0) {
        passedCount++;
      } else {
        issues.forEach(issue => {
          if (issue.rule.severity === 'error') errorCount++;
          else if (issue.rule.severity === 'warning') warningCount++;
        });
      }

      // 진행률 업데이트
      const progress = Math.round(((i + 1) / subtitles.length) * 100);
      set({
        currentIndex: i,
        progress,
        results: { ...results },
      });

      // 콜백 호출
      if (onProgress) {
        onProgress(progress, i + 1, subtitles.length);
      }

      // UI 업데이트를 위한 짧은 딜레이 (시각적 피드백)
      if (subtitles.length > 10) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // 분 단위 검수 (WPM 등)
    const minuteResults = validateByMinute(subtitles, settings);
    warningCount += minuteResults.length;

    // 최종 상태 업데이트
    set({
      isValidating: false,
      progress: 100,
      results,
      minuteResults,
      lastValidatedAt: Date.now(),
      stats: {
        total: subtitles.length,
        passed: passedCount,
        failed: subtitles.length - passedCount,
        errors: errorCount,
        warnings: warningCount,
      },
    });

    return { results, minuteResults };
  },

  /**
   * 검수 중지
   */
  stopValidation: () => {
    set({
      isValidating: false,
    });
  },

  /**
   * 특정 자막의 검수 결과 가져오기
   * @param {string} subtitleId 
   * @returns {Object|null}
   */
  getResultById: (subtitleId) => {
    return get().results[subtitleId] || null;
  },

  /**
   * 특정 자막 재검수
   * @param {Object} subtitle 
   * @param {number} index 
   * @param {Object[]} allSubtitles 
   * @param {Object} settings 
   */
  revalidateSubtitle: (subtitle, index, allSubtitles, settings) => {
    const issues = validateSubtitle(subtitle, index, allSubtitles, settings);
    const severity = getHighestSeverity(issues);
    
    set((state) => ({
      results: {
        ...state.results,
        [subtitle.id]: {
          issues,
          severity,
          validatedAt: Date.now(),
        },
      },
    }));

    // 통계 재계산
    get().recalculateStats();
  },

  /**
   * 통계 재계산
   */
  recalculateStats: () => {
    const { results, minuteResults } = get();
    let passed = 0;
    let errorCount = 0;
    let warningCount = 0;

    Object.values(results).forEach(result => {
      if (!result.issues || result.issues.length === 0) {
        passed++;
      } else {
        result.issues.forEach(issue => {
          if (issue.rule.severity === 'error') errorCount++;
          else if (issue.rule.severity === 'warning') warningCount++;
        });
      }
    });

    warningCount += minuteResults.length;
    const total = Object.keys(results).length;

    set({
      stats: {
        total,
        passed,
        failed: total - passed,
        errors: errorCount,
        warnings: warningCount,
      },
    });
  },

  /**
   * 결과 초기화
   */
  clearResults: () => {
    set({
      isValidating: false,
      progress: 0,
      currentIndex: 0,
      totalCount: 0,
      results: {},
      minuteResults: [],
      lastValidatedAt: null,
      stats: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        warnings: 0,
      },
    });
  },

  /**
   * 검수 결과가 있는지 확인
   */
  hasResults: () => {
    return Object.keys(get().results).length > 0;
  },
}));

