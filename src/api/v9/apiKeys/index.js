/**
 * API Keys API (V9)
 * 외부 API Key 관리
 *
 * 기본 경로: /v9/api/api-keys
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  API_KEYS: '/v9/api/api-keys',
  API_KEY_BY_ID: (id) => `/v9/api/api-keys/${id}`,
  SEARCH: '/v9/api/api-keys/search',
};

/** API Key 전체 목록 조회 */
export async function getApiKeys() {
  return get(ENDPOINTS.API_KEYS);
}

/** API Key 단건 조회 */
export async function getApiKey(id) {
  return get(ENDPOINTS.API_KEY_BY_ID(id));
}

/**
 * API Key 조건 검색
 * @param {Object} [params={}]
 * @param {string} [params.provider] - 제공자 (OPENAI, GOOGLE, CLAUDE, CLOVA, ELEVENLABS 등)
 * @param {string} [params.serviceType] - 서비스 유형 (LLM, STT, TTS 등)
 */
export async function searchApiKeys(params = {}) {
  return get(ENDPOINTS.SEARCH, params);
}

/** API Key 등록 */
export async function createApiKey(data) {
  return post(ENDPOINTS.API_KEYS, data);
}

/** API Key 수정 */
export async function updateApiKey(id, data) {
  return put(ENDPOINTS.API_KEY_BY_ID(id), data);
}

/** API Key 삭제 */
export async function deleteApiKey(id) {
  return del(ENDPOINTS.API_KEY_BY_ID(id));
}

export default {
  getApiKeys,
  getApiKey,
  searchApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
};
