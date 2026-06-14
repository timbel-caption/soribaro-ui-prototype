/**
 * Review Tag Groups API (V9 경로)
 * 리뷰 태그 그룹 관리 API
 */
import { get, post, put, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  GROUPS: '/v9/api/review-tag-groups',
  GROUPS_ALL: '/v9/api/review-tag-groups/all',
  GROUP_BY_ID: (id) => `/v9/api/review-tag-groups/${id}`,
};

/**
 * @typedef {Object} ReviewTagGroup
 * @property {string} id - 그룹 ID (UUID v4)
 * @property {string} name - 그룹명
 * @property {string} description - 설명
 * @property {string} createdAt - 생성일
 * @property {string} updatedAt - 수정일
 */

/**
 * @typedef {Object} ReviewTagGroupCreateInput
 * @property {string} name - 그룹명 (필수, 중복 불가)
 * @property {string} [id] - 그룹 ID (미지정 시 UUID 자동 생성)
 * @property {string} [description] - 설명
 */

/**
 * @typedef {Object} ReviewTagGroupUpdateInput
 * @property {string} name - 그룹명 (필수, 중복 불가)
 * @property {string} [description] - 설명
 */

/**
 * @typedef {Object} ReviewTagGroupListParams
 * @property {string} [keyword] - 검색어 (그룹명, 설명에서 LIKE 검색)
 * @property {number} [page=0] - 페이지 번호 (0부터 시작)
 * @property {number} [size=20] - 페이지 크기
 */

/**
 * @typedef {Object} PagedReviewTagGroupResponse
 * @property {ReviewTagGroup[]} content - 그룹 목록
 * @property {number} totalElements - 전체 개수
 * @property {number} totalPages - 전체 페이지 수
 * @property {number} page - 현재 페이지
 * @property {number} size - 페이지 크기
 * @property {boolean} first - 첫 페이지 여부
 * @property {boolean} last - 마지막 페이지 여부
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
 * 리뷰 태그 그룹 목록 조회 (페이징)
 * @param {ReviewTagGroupListParams} [params={}] - 조회 파라미터
 * @returns {Promise<ApiResponse<PagedReviewTagGroupResponse>>}
 */
export async function getReviewTagGroups(params = {}) {
  return get(ENDPOINTS.GROUPS, params);
}

/**
 * 모든 리뷰 태그 그룹 조회 (페이징 없음)
 * @returns {Promise<ApiResponse<ReviewTagGroup[]>>}
 */
export async function getAllReviewTagGroups() {
  return get(ENDPOINTS.GROUPS_ALL);
}

/**
 * 리뷰 태그 그룹 상세 조회
 * @param {string} id - 그룹 ID (UUID)
 * @returns {Promise<ApiResponse<ReviewTagGroup>>}
 */
export async function getReviewTagGroupById(id) {
  return get(ENDPOINTS.GROUP_BY_ID(id));
}

/**
 * 리뷰 태그 그룹 생성
 * @param {ReviewTagGroupCreateInput} data
 * @returns {Promise<ApiResponse<ReviewTagGroup>>}
 */
export async function createReviewTagGroup(data) {
  return post(ENDPOINTS.GROUPS, data);
}

/**
 * 리뷰 태그 그룹 수정
 * @param {string} id - 그룹 ID (UUID)
 * @param {ReviewTagGroupUpdateInput} data
 * @returns {Promise<ApiResponse<ReviewTagGroup>>}
 */
export async function updateReviewTagGroup(id, data) {
  return put(ENDPOINTS.GROUP_BY_ID(id), data);
}

/**
 * 리뷰 태그 그룹 삭제 (물리 삭제, 하위 태그도 함께 삭제)
 * @param {string} id - 그룹 ID (UUID)
 * @returns {Promise<ApiResponse<null>>}
 */
export async function deleteReviewTagGroup(id) {
  return del(ENDPOINTS.GROUP_BY_ID(id));
}

export default {
  getReviewTagGroups,
  getAllReviewTagGroups,
  getReviewTagGroupById,
  createReviewTagGroup,
  updateReviewTagGroup,
  deleteReviewTagGroup,
};
