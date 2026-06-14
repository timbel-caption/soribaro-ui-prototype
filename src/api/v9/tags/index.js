/**
 * Tags API (V9 경로)
 * 태그 관리 API
 */
import { get, post, put, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  TAGS: '/v9/api/tags',
  TAGS_ALL: '/v9/api/tags/all',
  TAG_BY_ID: (id) => `/v9/api/tags/${id}`,
};

/**
 * @typedef {Object} Tag
 * @property {string} id - 태그 ID (UUID)
 * @property {string} name - 태그 이름
 * @property {string} [description] - 태그 설명
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 * @property {number} createdBy - 생성자
 * @property {number} updatedBy - 수정자
 * @property {number} isDeleted - 삭제 여부 (0: 미삭제, 1: 삭제)
 * @property {number} [promptCount] - 연결된 프롬프트 수
 */

/**
 * @typedef {Object} TagCreateInput
 * @property {string} name - 태그 이름 (필수)
 * @property {string} [description] - 태그 설명
 */

/**
 * @typedef {Object} TagUpdateInput
 * @property {string} [name] - 태그 이름
 * @property {string} [description] - 태그 설명
 */

/**
 * @typedef {Object} TagListParams
 * @property {string} [keyword] - 검색어 (이름, 설명에서 검색)
 * @property {number} [page] - 페이지 번호 (0부터 시작)
 * @property {number} [size] - 페이지 크기 (기본값: 20)
 */

/**
 * @typedef {Object} PagedTagResponse
 * @property {Tag[]} content - 태그 목록
 * @property {number} totalElements - 전체 개수
 * @property {number} totalPages - 전체 페이지 수
 * @property {number} page - 현재 페이지
 * @property {number} size - 페이지 크기
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
 * 태그 목록 조회 (페이징)
 * @param {TagListParams} [params={}] - 조회 파라미터
 * @returns {Promise<ApiResponse<PagedTagResponse>>} 태그 목록 응답
 */
export async function getTags(params = {}) {
  return get(ENDPOINTS.TAGS, params);
}

/**
 * 모든 태그 목록 조회 (페이징 없음)
 * - 셀렉트박스, 태그 선택 UI 등에서 사용
 * @returns {Promise<ApiResponse<Tag[]>>} 전체 태그 목록 응답
 */
export async function getAllTags() {
  return get(ENDPOINTS.TAGS_ALL);
}

/**
 * 태그 상세 조회
 * @param {string} id - 태그 ID (UUID)
 * @returns {Promise<ApiResponse<Tag>>} 태그 상세 응답
 */
export async function getTagById(id) {
  return get(ENDPOINTS.TAG_BY_ID(id));
}

/**
 * 태그 생성
 * @param {TagCreateInput} data - 생성할 태그 데이터
 * @returns {Promise<ApiResponse<Tag>>} 생성된 태그 응답
 */
export async function createTag(data) {
  return post(ENDPOINTS.TAGS, data);
}

/**
 * 태그 수정
 * @param {string} id - 태그 ID (UUID)
 * @param {TagUpdateInput} data - 수정할 태그 데이터
 * @returns {Promise<ApiResponse<Tag>>} 수정된 태그 응답
 */
export async function updateTag(id, data) {
  return put(ENDPOINTS.TAG_BY_ID(id), data);
}

/**
 * 태그 삭제 (소프트 삭제)
 * @param {string} id - 태그 ID (UUID)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteTag(id) {
  return del(ENDPOINTS.TAG_BY_ID(id));
}

export default {
  getTags,
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
};
