/**
 * Review Tags API (V9 경로)
 * 리뷰 태그 관리 API
 */
import { get, post, put, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  REVIEW_TAGS: '/v9/api/review-tags',
  REVIEW_TAGS_ALL: '/v9/api/review-tags/all',
  REVIEW_TAG_BY_ID: (id) => `/v9/api/review-tags/${id}`,
};

/**
 * @typedef {Object} ReviewTag
 * @property {string} id - 리뷰 태그 ID (UUID v4)
 * @property {string} groupId - 소속 그룹 ID (FK → review_tag_groups.id)
 * @property {string} groupName - 소속 그룹명
 * @property {string} tag - 태그명
 * @property {number} score - 점수 (기본값: 0)
 * @property {string} description - 설명
 * @property {string} createdAt - 생성일
 * @property {string} updatedAt - 수정일
 */

/**
 * @typedef {Object} ReviewTagCreateInput
 * @property {string} groupId - 그룹 ID (필수)
 * @property {string} tag - 태그명 (필수, 같은 그룹 내 중복 불가)
 * @property {string} [id] - 리뷰 태그 ID (미지정 시 UUID 자동 생성)
 * @property {number} [score=0] - 점수
 * @property {string} [description] - 설명
 */

/**
 * @typedef {Object} ReviewTagUpdateInput
 * @property {string} groupId - 그룹 ID (필수, 다른 그룹으로 이동 가능)
 * @property {string} tag - 태그명 (필수, 같은 그룹 내 중복 불가)
 * @property {number} [score] - 점수
 * @property {string} [description] - 설명
 */

/**
 * @typedef {Object} ReviewTagListParams
 * @property {string} [groupId] - 그룹 ID 필터
 * @property {string} [keyword] - 검색어 (태그명, 설명에서 LIKE 검색)
 * @property {number} [page=0] - 페이지 번호 (0부터 시작)
 * @property {number} [size=20] - 페이지 크기
 */

/**
 * @typedef {Object} PagedReviewTagResponse
 * @property {ReviewTag[]} content - 리뷰 태그 목록
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
 * 리뷰 태그 목록 조회 (페이징)
 * @param {ReviewTagListParams} [params={}] - 조회 파라미터
 * @returns {Promise<ApiResponse<PagedReviewTagResponse>>} 리뷰 태그 목록 응답
 */
export async function getReviewTags(params = {}) {
  return get(ENDPOINTS.REVIEW_TAGS, params);
}

/**
 * 모든 리뷰 태그 목록 조회 (페이징 없음)
 * - 셀렉트박스, 드롭다운 등에서 사용
 * @returns {Promise<ApiResponse<ReviewTag[]>>} 전체 리뷰 태그 목록 응답
 */
export async function getAllReviewTags() {
  return get(ENDPOINTS.REVIEW_TAGS_ALL);
}

/**
 * 리뷰 태그 단건 조회
 * @param {string} id - 리뷰 태그 ID (UUID)
 * @returns {Promise<ApiResponse<ReviewTag>>} 리뷰 태그 상세 응답
 */
export async function getReviewTagById(id) {
  return get(ENDPOINTS.REVIEW_TAG_BY_ID(id));
}

/**
 * 리뷰 태그 생성
 * - ID 미지정 시 UUID v4 자동 생성
 * - groupId 필수, 같은 그룹 내 태그명 중복 불가
 * @param {ReviewTagCreateInput} data - 생성할 리뷰 태그 데이터
 * @returns {Promise<ApiResponse<ReviewTag>>} 생성된 리뷰 태그 응답
 */
export async function createReviewTag(data) {
  return post(ENDPOINTS.REVIEW_TAGS, data);
}

/**
 * 리뷰 태그 수정
 * - groupId 필수, 다른 그룹으로 이동 가능
 * @param {string} id - 리뷰 태그 ID (UUID)
 * @param {ReviewTagUpdateInput} data - 수정할 리뷰 태그 데이터
 * @returns {Promise<ApiResponse<ReviewTag>>} 수정된 리뷰 태그 응답
 */
export async function updateReviewTag(id, data) {
  return put(ENDPOINTS.REVIEW_TAG_BY_ID(id), data);
}

/**
 * 리뷰 태그 삭제 (물리 삭제)
 * @param {string} id - 리뷰 태그 ID (UUID)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteReviewTag(id) {
  return del(ENDPOINTS.REVIEW_TAG_BY_ID(id));
}

export default {
  getReviewTags,
  getAllReviewTags,
  getReviewTagById,
  createReviewTag,
  updateReviewTag,
  deleteReviewTag,
};
