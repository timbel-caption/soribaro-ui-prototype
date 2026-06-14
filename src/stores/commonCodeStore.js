/**
 * Common Code Store
 * 공통코드를 앱 시작 시 일괄 조회하여 관리합니다.
 * 그룹코드(grpCd)를 키로 사용하여 어디에서든 쉽게 접근할 수 있습니다.
 */
import { create } from 'zustand';
import { getCommonCode } from '../api/v8/common';

// ========== 조회할 그룹코드 목록 ==========
// 새 그룹코드가 필요하면 이 배열에 추가하세요.
const GROUP_CODES = [
  'WORK_STATUS',
  'USER_LEVEL',
  'TRNS_LANG_CD',
  'FILE_TP',
  'BSS_TYPE',
  'NOTI_TP',
  'MEMB_TP',
];

export const useCommonCodeStore = create((set, get) => ({
  // ========== 상태 ==========

  /**
   * 그룹코드별 상세코드 맵
   * @type {{ [grpCd: string]: import('../api/v8/common').CommonCodeItem[] }}
   */
  codes: {},

  /** @type {boolean} 로딩 중 여부 */
  isLoading: false,

  /** @type {string|null} 에러 메시지 */
  error: null,

  // ========== 액션 ==========

  /**
   * GROUP_CODES에 선언된 모든 그룹코드를 병렬 조회하여 저장
   * @returns {Promise<void>}
   */
  fetchAllCodes: async () => {
    set({ isLoading: true, error: null });

    try {
      const results = await Promise.allSettled(
        GROUP_CODES.map((grpCd) => getCommonCode(grpCd))
      );

      const codesMap = {};

      results.forEach((result, index) => {
        const grpCd = GROUP_CODES[index];
        if (result.status === 'fulfilled' && result.value?.status === 'SUCCESS') {
          codesMap[grpCd] = result.value.data || [];
        } else {
          console.warn(`[commonCodeStore] ${grpCd} 조회 실패:`, result.reason || result.value?.message);
          codesMap[grpCd] = [];
        }
      });

      set({
        codes: codesMap,
        isLoading: false,
        error: null,
      });

    } catch (error) {
      console.error('[commonCodeStore] fetchAllCodes 실패:', error);
      set({
        isLoading: false,
        error: error.message || '공통코드 조회에 실패했습니다.',
      });
    }
  },

  /**
   * 단일 그룹코드 조회 (동적으로 추가 조회 필요 시 사용)
   * @param {string} grpCd - 그룹코드
   * @returns {Promise<import('../api/v8/common').CommonCodeItem[]>}
   */
  fetchCode: async (grpCd) => {
    try {
      const response = await getCommonCode(grpCd);
      if (response?.status === 'SUCCESS') {
        const items = response.data || [];
        set((state) => ({
          codes: { ...state.codes, [grpCd]: items },
        }));
        return items;
      }
      return [];
    } catch (error) {
      console.error(`[commonCodeStore] ${grpCd} 조회 실패:`, error);
      return [];
    }
  },

  // ========== Getter ==========

  /**
   * 그룹코드에 해당하는 상세코드 배열 반환
   * @param {string} grpCd - 그룹코드 (예: 'WORK_STATUS')
   * @returns {import('../api/v8/common').CommonCodeItem[]}
   */
  getCodesByGroup: (grpCd) => {
    return get().codes[grpCd] || [];
  },

  /**
   * 특정 상세코드의 이름(dtlCdNm) 반환
   * @param {string} grpCd - 그룹코드
   * @param {string} dtlCd - 상세코드
   * @returns {string} 상세코드명 (없으면 dtlCd 그대로 반환)
   */
  getCodeLabel: (grpCd, dtlCd) => {
    const codes = get().codes[grpCd] || [];
    const val = String(dtlCd ?? '');
    const found = codes.find((c) => c.dtlCd === val) || codes.find((c) => c.dtlCd?.toUpperCase() === val.toUpperCase());
    return found?.dtlCdNm ?? dtlCd;
  },

  /**
   * 셀렉트박스/드롭다운용 옵션 배열 반환
   * @param {string} grpCd - 그룹코드
   * @returns {{ value: string, label: string }[]}
   */
  getCodeOptions: (grpCd) => {
    const codes = get().codes[grpCd] || [];
    return codes.map((c) => ({
      value: c.dtlCd,
      label: c.dtlCdNm,
    }));
  },
}));
