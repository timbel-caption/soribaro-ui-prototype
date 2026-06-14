/**
 * 프롬프트 캐시 상태 관리
 * API 실패 시 LocalStorage 폴백 및 Import/Export 기능 지원
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import defaultPromptsData from '../constants/defaultPrompts.json';

/**
 * Import JSON 데이터 검증
 * @param {Object} jsonData - 파싱된 JSON 객체
 * @returns {{ valid: boolean, error?: string }}
 */
function validateImportData(jsonData) {
  if (!jsonData || typeof jsonData !== 'object') {
    return { valid: false, error: '유효하지 않은 JSON 형식입니다.' };
  }

  if (!Array.isArray(jsonData.prompts)) {
    return { valid: false, error: 'prompts 배열이 존재하지 않습니다.' };
  }

  for (let i = 0; i < jsonData.prompts.length; i++) {
    const prompt = jsonData.prompts[i];
    if (!prompt.name) {
      return { valid: false, error: `prompts[${i}]: name 필드가 누락되었습니다.` };
    }
    if (!prompt.prompt) {
      return { valid: false, error: `prompts[${i}]: prompt 필드가 누락되었습니다.` };
    }
  }

  if (jsonData.tags && !Array.isArray(jsonData.tags)) {
    return { valid: false, error: 'tags가 배열 형식이 아닙니다.' };
  }

  return { valid: true };
}

export const usePromptsStore = create(
  persist(
    (set, get) => ({
      // ==================== 상태 ====================

      /** 캐시된 프롬프트 목록 (API 응답의 data 배열과 동일한 구조) */
      prompts: defaultPromptsData.prompts || [],

      /** 캐시된 태그 목록 */
      tags: defaultPromptsData.tags || [],

      /** 마지막 API 동기화 시각 */
      lastSyncedAt: null,

      /** API 요청 실패 여부 (persist 제외, 런타임 전용) */
      isApiFailed: false,

      // ==================== 액션 ====================

      /**
       * 프롬프트 목록 저장 (API 성공 시 호출)
       * @param {Array} list - API 응답의 프롬프트 배열
       */
      setPrompts: (list) => {
        set({
          prompts: list || [],
          lastSyncedAt: new Date().toISOString(),
          isApiFailed: false,
        });
      },

      /**
       * 태그 목록 저장 (API 성공 시 호출)
       * @param {Array} list - API 응답의 태그 배열
       */
      setTags: (list) => {
        set({ tags: list || [] });
      },

      /**
       * API 실패 상태 설정
       */
      setApiFailed: () => {
        set({ isApiFailed: true });
      },

      /**
       * API 성공 상태로 복원
       */
      clearApiFailed: () => {
        set({ isApiFailed: false });
      },

      /**
       * 저장된 프롬프트 목록 반환
       * persist 하이드레이션으로 빈 배열이 덮어씌워진 경우 기본값으로 폴백
       * @returns {Array} 프롬프트 배열
       */
      getPrompts: () => {
        const { prompts } = get();
        if (prompts && prompts.length > 0) return prompts;
        // localStorage에 빈 배열이 저장된 경우 기본값 반환
        return defaultPromptsData.prompts || [];
      },

      /**
       * 저장된 태그 목록 반환
       * persist 하이드레이션으로 빈 배열이 덮어씌워진 경우 기본값으로 폴백
       * @returns {Array} 태그 배열
       */
      getTags: () => {
        const { tags } = get();
        if (tags && tags.length > 0) return tags;
        return defaultPromptsData.tags || [];
      },

      /**
       * 저장된 목록에서 필터 조건으로 검색 (API 대체용)
       * @param {Object} filters - 필터 조건
       * @param {string} [filters.source_lang] - 원본 언어
       * @param {string} [filters.target_lang] - 대상 언어
       * @param {string} [filters.model] - 모델명
       * @param {string} [filters.tag_ids] - 태그 ID (쉼표 구분)
       * @returns {Array} 필터링된 프롬프트 배열
       */
      searchPrompts: (filters = {}) => {
        const { prompts } = get();
        if (!prompts || prompts.length === 0) return [];

        return prompts.filter((prompt) => {
          // source_lang 필터
          if (filters.source_lang) {
            const promptSource = (prompt.sourceLang || '').toUpperCase();
            const filterSource = filters.source_lang.toUpperCase();
            if (promptSource !== filterSource && promptSource !== 'ALL') {
              return false;
            }
          }

          // target_lang 필터
          if (filters.target_lang) {
            const promptTarget = (prompt.targetLang || '').toUpperCase();
            const filterTarget = filters.target_lang.toUpperCase();
            if (promptTarget !== filterTarget && promptTarget !== 'ALL') {
              return false;
            }
          }

          // model 필터
          if (filters.model) {
            if (prompt.model !== filters.model) {
              return false;
            }
          }

          // tag_ids 필터 (쉼표 구분 문자열)
          if (filters.tag_ids) {
            const filterTagIds = filters.tag_ids.split(',').map(id => id.trim());
            const promptTagIds = (prompt.tags || []).map(t => t.id);
            const hasMatchingTag = filterTagIds.some(id => promptTagIds.includes(id));
            if (!hasMatchingTag) {
              return false;
            }
          }

          return true;
        });
      },

      /**
       * 저장된 목록에서 ID로 단건 조회 (API 대체용)
       * @param {string} id - 프롬프트 ID (UUID)
       * @returns {Object|null} 프롬프트 객체 또는 null
       */
      getPromptById: (id) => {
        const { prompts } = get();
        return prompts.find(p => p.id === id) || null;
      },

      /**
       * 로컬 Store에서 프롬프트 수정 (로컬모드용)
       * @param {string} id - 프롬프트 ID (UUID)
       * @param {Object} updates - 수정할 필드들
       * @returns {boolean} 수정 성공 여부
       */
      updatePromptLocal: (id, updates) => {
        const { prompts } = get();
        const index = prompts.findIndex(p => p.id === id);
        if (index === -1) return false;

        const updatedPrompts = [...prompts];
        updatedPrompts[index] = {
          ...updatedPrompts[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        set({ prompts: updatedPrompts });
        return true;
      },

      /**
       * 로컬 Store에 프롬프트 추가 (로컬모드 생성용)
       * @param {Object} promptData - 프롬프트 데이터 (id 없으면 자동 생성)
       * @returns {string} 생성된 프롬프트 ID
       */
      addPromptLocal: (promptData) => {
        const id = promptData.id || crypto.randomUUID();
        const now = new Date().toISOString();
        const newPrompt = {
          ...promptData,
          id,
          createdAt: now,
          updatedAt: now,
          isDeleted: 0,
        };
        const { prompts } = get();
        set({ prompts: [newPrompt, ...prompts] });
        return id;
      },

      /**
       * 로컬 Store에서 프롬프트 삭제 (로컬모드용)
       * @param {string} id - 프롬프트 ID (UUID)
       * @returns {boolean} 삭제 성공 여부
       */
      deletePromptLocal: (id) => {
        const { prompts } = get();
        const filtered = prompts.filter(p => p.id !== id);
        if (filtered.length === prompts.length) return false;
        set({ prompts: filtered });
        return true;
      },

      /**
       * JSON 데이터에서 프롬프트 목록 가져오기 (Import)
       * @param {Object} jsonData - 파싱된 JSON 객체
       * @returns {{ success: boolean, error?: string, count?: number }}
       */
      importPrompts: (jsonData) => {
        const validation = validateImportData(jsonData);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }

        const importedPrompts = jsonData.prompts;
        const importedTags = jsonData.tags || [];

        set({
          prompts: importedPrompts,
          tags: importedTags.length > 0 ? importedTags : get().tags,
          lastSyncedAt: new Date().toISOString(),
        });

        return { success: true, count: importedPrompts.length };
      },

      /**
       * 현재 저장된 데이터를 export용 JSON 객체로 반환
       * @returns {Object} Export JSON 객체
       */
      exportPrompts: () => {
        const { prompts, tags } = get();
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          prompts,
          tags,
        };
      },

      /**
       * 저장된 프롬프트/태그 초기화
       */
      clearPrompts: () => {
        set({
          prompts: [],
          tags: [],
          lastSyncedAt: null,
          isApiFailed: false,
        });
      },
    }),
    {
      name: 'prompts-store',
      // isApiFailed는 persist에서 제외 (앱 재시작 시 항상 false)
      partialize: (state) => ({
        prompts: state.prompts,
        tags: state.tags,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
