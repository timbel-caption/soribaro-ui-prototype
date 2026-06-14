/**
 * 프롬프트 검색 유틸리티
 * 언어 조합에 따른 프롬프트 검색 및 Fallback 로직 처리
 */
import { getPrompts } from '../api/v9/prompts';
import { usePromptsStore } from '../stores/promptsStore';

/**
 * 로컬 store에서 언어 조합 기반 프롬프트 검색 (API 대체용)
 * @param {string} sourceLang - 원본 언어 코드
 * @param {string} targetLang - 대상 언어 코드
 * @returns {Object|null} 검색된 프롬프트 또는 null
 */
function searchPromptFromStore(sourceLang, targetLang) {
  const store = usePromptsStore.getState();

  // 검색 우선순위 정의
  const searchCombinations = [
    { source_lang: sourceLang, target_lang: targetLang },
    { source_lang: sourceLang, target_lang: 'ALL' },
    { source_lang: 'ALL', target_lang: targetLang },
    { source_lang: 'ALL', target_lang: 'ALL' },
  ];

  for (const params of searchCombinations) {
    const results = store.searchPrompts(params);
    if (results.length > 0) {
      const prompt = results[0];
      console.log(`프롬프트 로컬 검색 성공: ${params.source_lang} → ${params.target_lang}`, prompt.name);
      return prompt;
    }
  }

  return null;
}

/**
 * 언어 조합으로 프롬프트 검색
 * 검색 우선순위:
 * 1. sourceLang + targetLang 정확히 일치
 * 2. sourceLang + targetLang: 'ALL'
 * 3. sourceLang: 'ALL' + targetLang
 * 4. sourceLang: 'ALL' + targetLang: 'ALL'
 * 
 * API 실패 상태이면 LocalStorage 캐시에서 검색
 * 
 * @param {string} sourceLang - 원본 언어 코드 (예: 'ko', 'en')
 * @param {string} targetLang - 대상 언어 코드 (예: 'en', 'ja')
 * @returns {Promise<Object|null>} 검색된 프롬프트 또는 null
 */
export async function searchPromptByLanguages(sourceLang, targetLang) {
  // API 실패 상태이면 로컬 store에서 검색
  const { isApiFailed } = usePromptsStore.getState();
  if (isApiFailed) {
    console.log('API 실패 상태 — 로컬 store에서 프롬프트 검색');
    const localResult = searchPromptFromStore(sourceLang, targetLang);
    if (localResult) return localResult;
    console.log('로컬 store에서도 매칭되는 프롬프트 없음, 기본 프롬프트 사용');
    return null;
  }

  // 검색 우선순위 정의
  const searchCombinations = [
    { source_lang: sourceLang, target_lang: targetLang },
    { source_lang: sourceLang, target_lang: 'ALL' },
    { source_lang: 'ALL', target_lang: targetLang },
    { source_lang: 'ALL', target_lang: 'ALL' },
  ];

  for (const params of searchCombinations) {
    try {
      const response = await getPrompts(params);
      
      if (response.status === 'SUCCESS' && response.data && response.data.length > 0) {
        // 첫 번째 매칭 프롬프트 반환
        const prompt = response.data[0];
        console.log(`프롬프트 검색 성공: ${params.source_lang} → ${params.target_lang}`, prompt.name);
        return prompt;
      }
    } catch (err) {
      console.warn(`프롬프트 검색 실패 (${params.source_lang} → ${params.target_lang}):`, err.message);
    }
  }

  // API에서 못 찾은 경우 로컬 store에서도 시도
  const localResult = searchPromptFromStore(sourceLang, targetLang);
  if (localResult) return localResult;

  console.log('매칭되는 프롬프트 없음, 기본 프롬프트 사용');
  return null;
}

/**
 * 프롬프트의 params JSON 문자열을 파싱하여 옵션 객체로 변환
 * @param {Object} prompt - 프롬프트 객체
 * @returns {Object} 파싱된 파라미터 객체
 */
export function parsePromptParams(prompt) {
  if (!prompt) return {};

  const result = {
    model: prompt.model || null,
    promptId: prompt.id || null,
    customPrompt: prompt.prompt || null,
  };

  // params JSON 파싱
  if (prompt.params) {
    try {
      const parsedParams = typeof prompt.params === 'string' 
        ? JSON.parse(prompt.params) 
        : prompt.params;

      // 파라미터 매핑
      if (parsedParams.temperature !== undefined) {
        result.temperature = parsedParams.temperature;
      }
      if (parsedParams.max_tokens !== undefined) {
        result.maxTokens = parsedParams.max_tokens;
      }
      if (parsedParams.top_p !== undefined) {
        result.topP = parsedParams.top_p;
      }
      if (parsedParams.top_k !== undefined) {
        result.topK = parsedParams.top_k;
      }
      if (parsedParams.presence_penalty !== undefined) {
        result.presencePenalty = parsedParams.presence_penalty;
      }
      if (parsedParams.frequency_penalty !== undefined) {
        result.frequencyPenalty = parsedParams.frequency_penalty;
      }
      if (parsedParams.chunk_size !== undefined) {
        result.chunkSize = parsedParams.chunk_size;
      }
    } catch (err) {
      console.warn('프롬프트 params 파싱 실패:', err.message);
    }
  }

  return result;
}

/**
 * 언어 조합으로 프롬프트를 검색하고 파라미터를 추출
 * @param {string} sourceLang - 원본 언어 코드
 * @param {string} targetLang - 대상 언어 코드
 * @returns {Promise<Object>} 번역 옵션 객체 (프롬프트 정보 포함)
 */
export async function getTranslateOptionsFromPrompt(sourceLang, targetLang) {
  const prompt = await searchPromptByLanguages(sourceLang, targetLang);
  
  if (!prompt) {
    return {
      hasPrompt: false,
      sourceLang,
      targetLang,
    };
  }

  const params = parsePromptParams(prompt);

  return {
    hasPrompt: true,
    promptId: prompt.id,
    promptName: prompt.name,
    customPrompt: prompt.prompt,
    sourceLang,
    targetLang,
    ...params,
  };
}

export default {
  searchPromptByLanguages,
  parsePromptParams,
  getTranslateOptionsFromPrompt,
};
