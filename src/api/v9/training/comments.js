/**
 * 연수(Training) 자막 코멘트 API
 *   GET    /v9/api/training/comments?assignmentStudentId=
 *   POST   /v9/api/training/comments
 *   PUT    /v9/api/training/comments/{id}
 *   DELETE /v9/api/training/comments/{id}
 *
 * subtitleComments 시스템(projectFileId 기준)의 연수 버전 — assignment_student_id 기준.
 */
import { get, post, put, del } from '../client';

const BASE = '/v9/api/training/comments';

/**
 * @typedef {Object} TrainingComment
 * @property {string} id - 코멘트 ID (UUID)
 * @property {number} assignmentStudentId - 연수 배정(학생 제출물) ID
 * @property {string} itemId - 자막 라인 ID
 * @property {string} comments - 코멘트 내용
 * @property {string} createdBy - 작성자
 * @property {string} createdAt - 생성일
 * @property {string} updatedAt - 수정일
 */

/**
 * 연수 코멘트 목록 조회 (assignment_student_id 기준, created_at ASC)
 * @param {number|string} assignmentStudentId - 연수 배정 ID (필수)
 * @returns {Promise<ApiResponse<TrainingComment[]>>}
 */
export async function getTrainingComments(assignmentStudentId) {
  return get(BASE, { assignmentStudentId });
}

/**
 * 연수 코멘트 작성
 * @param {{assignmentStudentId: number|string, itemId: string, comments: string, createdBy: string}} data
 * @returns {Promise<ApiResponse<TrainingComment>>}
 */
export async function createTrainingComment(data) {
  return post(BASE, data);
}

/**
 * 연수 코멘트 수정
 * @param {string} id - 코멘트 ID
 * @param {{comments: string}} data
 * @returns {Promise<ApiResponse<TrainingComment>>}
 */
export async function updateTrainingComment(id, data) {
  return put(`${BASE}/${id}`, data);
}

/**
 * 연수 코멘트 삭제 (물리 삭제)
 * @param {string} id - 코멘트 ID
 * @returns {Promise<ApiResponse<null>>}
 */
export async function deleteTrainingComment(id) {
  return del(`${BASE}/${id}`);
}

export default { getTrainingComments, createTrainingComment, updateTrainingComment, deleteTrainingComment };
