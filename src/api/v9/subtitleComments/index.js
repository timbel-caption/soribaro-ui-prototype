/**
 * Subtitle Comments API (V9 경로)
 * 자막 코멘트 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  SUBTITLE_COMMENTS: '/v9/api/subtitle-comments',
  SUBTITLE_COMMENT_BY_ID: (id) => `/v9/api/subtitle-comments/${id}`,
};

/**
 * @typedef {Object} SubtitleComment
 * @property {string} id - 코멘트 ID (UUID v4)
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} itemId - 항목 ID
 * @property {string} comments - 코멘트 내용
 * @property {string} createdBy - 작성자
 * @property {string} createdAt - 생성일
 * @property {string} updatedAt - 수정일
 */

/**
 * @typedef {Object} SubtitleCommentCreateInput
 * @property {string} projectFileId - 프로젝트 파일 ID (필수)
 * @property {string} itemId - 항목 ID (필수)
 * @property {string} createdBy - 작성자 (필수)
 * @property {string} [comments] - 코멘트 내용
 */

/**
 * @typedef {Object} SubtitleCommentUpdateInput
 * @property {string} comments - 코멘트 내용
 */

/**
 * 자막 코멘트 목록 조회 (project_file_id 기반, created_at ASC)
 * @param {string} projectFileId - 프로젝트 파일 ID (필수)
 * @returns {Promise<ApiResponse<SubtitleComment[]>>}
 */
export async function getSubtitleComments(projectFileId) {
  return get(ENDPOINTS.SUBTITLE_COMMENTS, { projectFileId });
}

/**
 * 자막 코멘트 작성
 * @param {SubtitleCommentCreateInput} data - 코멘트 데이터
 * @returns {Promise<ApiResponse<SubtitleComment>>}
 */
export async function createSubtitleComment(data) {
  return post(ENDPOINTS.SUBTITLE_COMMENTS, data);
}

/**
 * 자막 코멘트 수정
 * @param {string} id - 코멘트 ID (UUID)
 * @param {SubtitleCommentUpdateInput} data - 수정할 데이터
 * @returns {Promise<ApiResponse<SubtitleComment>>}
 */
export async function updateSubtitleComment(id, data) {
  return put(ENDPOINTS.SUBTITLE_COMMENT_BY_ID(id), data);
}

/**
 * 자막 코멘트 삭제 (물리 삭제)
 * @param {string} id - 코멘트 ID (UUID)
 * @returns {Promise<ApiResponse<null>>}
 */
export async function deleteSubtitleComment(id) {
  return del(ENDPOINTS.SUBTITLE_COMMENT_BY_ID(id));
}

export default {
  getSubtitleComments,
  createSubtitleComment,
  updateSubtitleComment,
  deleteSubtitleComment,
};
