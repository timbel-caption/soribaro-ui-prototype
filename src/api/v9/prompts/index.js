/**
 * Prompts API (V9 경로)
 * 프롬프트 관리 API - 다중 태그 지원
 */
import { get, post, put, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  PROMPTS: '/v9/api/prompts',
  PROMPT_BY_ID: (id) => `/v9/api/prompts/${id}`,
};

/**
 * @typedef {Object} Tag
 * @property {string} id - 태그 ID (UUID)
 * @property {string} name - 태그 이름
 * @property {string} [description] - 태그 설명
 * @property {string} [createdAt] - 생성일시
 * @property {string} [updatedAt] - 수정일시
 * @property {number} [createdBy] - 생성자
 * @property {number} [updatedBy] - 수정자
 * @property {number} [isDeleted] - 삭제 여부 (0: 미삭제, 1: 삭제)
 */

/**
 * @typedef {Object} Prompt
 * @property {string} id - 프롬프트 ID (UUID)
 * @property {string} name - 프롬프트 이름
 * @property {string} description - 설명
 * @property {string} prompt - 프롬프트 내용
 * @property {Tag[]} tags - 연결된 태그 목록
 * @property {string} model - 모델명
 * @property {string} sourceLang - 원본 언어
 * @property {string} targetLang - 대상 언어
 * @property {string} params - JSON 문자열 형태의 파라미터
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 * @property {number} createdBy - 생성자
 * @property {number} updatedBy - 수정자
 * @property {number} isDeleted - 삭제 여부 (0: 미삭제, 1: 삭제)
 */

/**
 * @typedef {Object} PromptCreateInput
 * @property {string} name - 프롬프트 이름
 * @property {string} [description] - 설명
 * @property {string} prompt - 프롬프트 내용
 * @property {string[]} [tagIds] - 태그 ID 배열 (다중 태그 지원)
 * @property {string} model - 모델명
 * @property {string} sourceLang - 원본 언어
 * @property {string} targetLang - 대상 언어
 * @property {string} [params] - JSON 문자열 형태의 파라미터
 */

/**
 * @typedef {Object} PromptUpdateInput
 * @property {string} [name] - 프롬프트 이름
 * @property {string} [description] - 설명
 * @property {string} [prompt] - 프롬프트 내용
 * @property {string[]} [tagIds] - 태그 ID 배열 (다중 태그 지원)
 * @property {string} [model] - 모델명
 * @property {string} [sourceLang] - 원본 언어
 * @property {string} [targetLang] - 대상 언어
 * @property {string} [params] - JSON 문자열 형태의 파라미터
 */

/**
 * @typedef {Object} PromptListParams
 * @property {string} [tag_id] - 프롬프트 태그 ID (특정 태그로 필터링)
 * @property {string} [source_lang] - 원본 언어 (예: ko, en, ja)
 * @property {string} [target_lang] - 대상 언어 (예: ko, en, ja)
 * @property {string} [model] - 모델명 (예: gpt-4, gpt-4o-mini)
 */

/**
 * @typedef {Object} ApiResponse
 * @property {string} status - 상태 (SUCCESS | FAILURE)
 * @property {string} code - 상태 코드
 * @property {*} data - 응답 데이터
 * @property {string} message - 메시지
 * @property {string} timestamp - 타임스탬프
 */

/**
 * 프롬프트 목록 조회
 * @param {PromptListParams} [params={}] - 필터 파라미터
 * @returns {Promise<ApiResponse<Prompt[]>>} 프롬프트 목록 응답
 */
export async function getPrompts(params = {}) {
  return get(ENDPOINTS.PROMPTS, params);
}

/**
 * 프롬프트 상세 조회
 * @param {string} id - 프롬프트 ID (UUID)
 * @returns {Promise<ApiResponse<Prompt>>} 프롬프트 상세 응답
 */
export async function getPromptById(id) {
  return get(ENDPOINTS.PROMPT_BY_ID(id));
}

/**
 * 프롬프트 생성
 * @param {PromptCreateInput} data - 생성할 프롬프트 데이터
 * @returns {Promise<ApiResponse<Prompt>>} 생성된 프롬프트 응답
 */
export async function createPrompt(data) {
  return post(ENDPOINTS.PROMPTS, data);
}

/**
 * 프롬프트 수정
 * @param {string} id - 프롬프트 ID (UUID)
 * @param {PromptUpdateInput} data - 수정할 프롬프트 데이터
 * @returns {Promise<ApiResponse<Prompt>>} 수정된 프롬프트 응답
 */
export async function updatePrompt(id, data) {
  return put(ENDPOINTS.PROMPT_BY_ID(id), data);
}

/**
 * 프롬프트 삭제 (소프트 삭제)
 * @param {string} id - 프롬프트 ID (UUID)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deletePrompt(id) {
  return del(ENDPOINTS.PROMPT_BY_ID(id));
}

export default {
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
};
