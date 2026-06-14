/**
 * Subtitle Review Tags API (V9 경로)
 * 자막 리뷰 태그 관리 API
 */
import { get, post, del } from '../client';

const ENDPOINTS = {
  SUBTITLE_REVIEW_TAGS: '/v9/api/subtitle-review-tags',
  SUBTITLE_REVIEW_TAG_BY_ID: (id) => `/v9/api/subtitle-review-tags/${id}`,
};

/**
 * @typedef {Object} SubtitleReviewTag
 * @property {string} id - 리뷰 태그 ID (UUID v4)
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} itemId - 항목 ID
 * @property {string} reviewTagId - 리뷰 태그 ID
 * @property {string} createdBy - 작성자
 * @property {string} createdAt - 생성일
 * @property {string} updatedAt - 수정일
 */

/**
 * @typedef {Object} SubtitleReviewTagCreateInput
 * @property {string} projectFileId - 프로젝트 파일 ID (필수)
 * @property {string} itemId - 항목 ID (필수)
 * @property {string} reviewTagId - 리뷰 태그 ID (필수)
 * @property {string} createdBy - 작성자 (필수)
 */

/**
 * 자막 리뷰 태그 목록 조회 (project_file_id 기반, created_at ASC)
 * @param {string} projectFileId - 프로젝트 파일 ID (필수)
 * @returns {Promise<ApiResponse<SubtitleReviewTag[]>>}
 */
export async function getSubtitleReviewTags(projectFileId) {
  return get(ENDPOINTS.SUBTITLE_REVIEW_TAGS, { projectFileId });
}

/**
 * 자막 리뷰 태그 생성
 * @param {SubtitleReviewTagCreateInput} data - 리뷰 태그 데이터
 * @returns {Promise<ApiResponse<SubtitleReviewTag>>}
 */
export async function createSubtitleReviewTag(data) {
  return post(ENDPOINTS.SUBTITLE_REVIEW_TAGS, data);
}

/**
 * 자막 리뷰 태그 삭제 (물리 삭제)
 * @param {string} id - 리뷰 태그 ID (UUID)
 * @returns {Promise<ApiResponse<null>>}
 */
export async function deleteSubtitleReviewTag(id) {
  return del(ENDPOINTS.SUBTITLE_REVIEW_TAG_BY_ID(id));
}

export default {
  getSubtitleReviewTags,
  createSubtitleReviewTag,
  deleteSubtitleReviewTag,
};
