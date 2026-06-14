/**
 * Subtitle Revisions API (V9 경로)
 * 자막 작업 이력 관리 API
 */
import { get, put } from '../client';

// 엔드포인트
const ENDPOINTS = {
  REVISIONS_BY_PROJECT_FILE: (projectFileId) => `/v9/api/subtitle-revisions/project-file/${projectFileId}`,
  REVISIONS_BY_WORKER: (workerId) => `/v9/api/subtitle-revisions/worker/${workerId}`,
  LATEST_BY_PROJECT_FILE: (projectFileId) => `/v9/api/subtitle-revisions/project-file/${projectFileId}/latest`,
  LATEST_BY_WORK_TYPE: (projectFileId, workType) => `/v9/api/subtitle-revisions/project-file/${projectFileId}/work-type/${workType}/latest`,
  CHECK_REVISION: (revision) => `/v9/api/subtitle-revisions/${revision}/check`,
};

/**
 * @typedef {Object} SubtitleRevision
 * @property {number} revision - 리비전 번호
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} workerId - 작업자 ID
 * @property {string} lang - 언어 코드
 * @property {string} workType - 작업 유형 (START, MID, END)
 * @property {string} status - 상태 (CREATED 등)
 * @property {boolean} isChecked - 검수 완료 여부
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 */

/**
 * @typedef {Object} CheckRevisionInput
 * @property {boolean} isChecked - 검수 완료 여부
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
 * 프로젝트 파일별 작업 이력 조회
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @returns {Promise<ApiResponse<SubtitleRevision[]>>} 작업 이력 목록 응답
 */
export async function getRevisionsByProjectFileId(projectFileId) {
  return get(ENDPOINTS.REVISIONS_BY_PROJECT_FILE(projectFileId));
}

/**
 * 사용자별 작업 이력 조회
 * @param {string} workerId - 작업자 ID
 * @returns {Promise<ApiResponse<SubtitleRevision[]>>} 작업 이력 목록 응답
 */
export async function getRevisionsByWorkerId(workerId) {
  return get(ENDPOINTS.REVISIONS_BY_WORKER(workerId));
}

/**
 * 가장 최근 작업 이력 조회
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @returns {Promise<ApiResponse<SubtitleRevision>>} 최근 작업 이력 응답
 */
export async function getLatestRevisionByProjectFileId(projectFileId) {
  return get(ENDPOINTS.LATEST_BY_PROJECT_FILE(projectFileId));
}

/**
 * 작업 타입별 최근 이력 조회
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @param {string} workType - 작업 유형 (START, MID, END)
 * @returns {Promise<ApiResponse<SubtitleRevision>>} 작업 이력 응답
 */
export async function getLatestRevisionByWorkType(projectFileId, workType) {
  return get(ENDPOINTS.LATEST_BY_WORK_TYPE(projectFileId, workType));
}

/**
 * 검수 처리
 * @param {number|string} revision - 리비전 번호
 * @param {CheckRevisionInput} data - 검수 데이터
 * @returns {Promise<ApiResponse<SubtitleRevision>>} 업데이트된 작업 이력 응답
 */
export async function checkRevision(revision, data) {
  return put(ENDPOINTS.CHECK_REVISION(revision), data);
}

export default {
  getRevisionsByProjectFileId,
  getRevisionsByWorkerId,
  getLatestRevisionByProjectFileId,
  getLatestRevisionByWorkType,
  checkRevision,
};
