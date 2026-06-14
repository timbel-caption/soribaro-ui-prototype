/**
 * Project File Evaluation API (V9 경로)
 * 프로젝트 파일 평가 관리 API
 */
import { get, post, patch, del } from '../client';

const ENDPOINTS = {
  EVALUATIONS: '/v9/api/project-file-evaluations',
  EVALUATION_BY_ID: (projectFileId) => `/v9/api/project-file-evaluations/${projectFileId}`,
  EVALUATION_METRICS: (projectFileId) => `/v9/api/project-file-evaluations/${projectFileId}/metrics`,
  SEARCH: '/v9/api/project-file-evaluations/search',
};

/**
 * @typedef {Object} ProjectFileEvaluation
 * @property {string} projectFileId - 프로젝트 파일 ID (PK)
 * @property {number} workRevision - 작업 리비전
 * @property {number} checkRevision - 검수 리비전
 * @property {number} accuracy - 정확도 (퍼센트, 예: 99.2, 기본값 100)
 * @property {number} errorCount - 오류 건수 (기본값 0)
 * @property {number} formErrorCount - 양식 오류 건수 (기본값 0)
 * @property {string|null} reason - 오류/제외 항목 상세 (JSON 문자열)
 * @property {string} createdBy - 작성자
 * @property {string} createdAt - 생성일
 * @property {string} updatedAt - 수정일
 */

/**
 * @typedef {Object} ProjectFileEvaluationInput
 * @property {string} projectFileId - 프로젝트 파일 ID (필수)
 * @property {number} workRevision - 작업 리비전 (필수)
 * @property {number} checkRevision - 검수 리비전 (필수)
 * @property {string} createdBy - 작성자 (필수)
 * @property {number} [accuracy=100] - 정확도 (퍼센트, 예: 99.2)
 * @property {number} [errorCount=0] - 오류 건수
 * @property {number} [formErrorCount=0] - 양식 오류 건수
 * @property {string} [reason] - 오류 상세 정보 (JSON 문자열: { errors: [...], excluded: [...] })
 */

/**
 * @typedef {Object} ProjectFileEvaluationSearchParams
 * @property {string} [workerId] - 작업자 ID 또는 이름
 * @property {string} [checkerId] - 검수자 ID 또는 이름
 * @property {string} [projectId] - 프로젝트 ID
 * @property {string} [createdAtFrom] - 작업일 시작 (yyyy-MM-dd)
 * @property {string} [createdAtTo] - 작업일 종료 (yyyy-MM-dd)
 * @property {number} [page=0] - 페이지 번호 (0-based)
 * @property {number} [size=20] - 페이지 크기
 */

/**
 * @typedef {Object} ProjectFileEvaluationSearchItem
 * @property {string} workerId - 작업자 ID
 * @property {string|null} workerName - 작업자 이름
 * @property {string} checkerId - 검수자 ID
 * @property {string|null} checkerName - 검수자 이름
 * @property {string} projectId - 프로젝트 ID
 * @property {string} projectTitle - 프로젝트 제목
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} fileName - 파일명
 * @property {number|null} accuracy - 정확도
 * @property {number} errorCount - 오류 건수
 * @property {number} formErrorCount - 양식 오류 건수
 * @property {string} createdAt - 작업일시
 */

/**
 * 평가 데이터 생성/수정 (upsert)
 * - project_file_id가 존재하지 않으면 INSERT
 * - project_file_id가 이미 존재하면 work_revision, check_revision, accuracy, error_count, reason, updated_at만 UPDATE
 *
 * @param {ProjectFileEvaluationInput} data
 * @returns {Promise<ApiResponse<ProjectFileEvaluation>>}
 */
export async function upsertProjectFileEvaluation(data) {
  return post(ENDPOINTS.EVALUATIONS, data);
}

/**
 * 평가 목록 검색 (페이지네이션)
 * - 작업자, 검수자, 프로젝트, 작업일 범위로 필터링
 * - 작업일시 내림차순 (최신순)
 *
 * @param {ProjectFileEvaluationSearchParams} [params={}]
 * @returns {Promise<ApiResponse<{page, size, totalElements, totalPages, first, last, content: ProjectFileEvaluationSearchItem[]}>>}
 */
export async function searchProjectFileEvaluations(params = {}) {
  return get(ENDPOINTS.SEARCH, params);
}

/**
 * 평가 데이터 조회
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @returns {Promise<ApiResponse<ProjectFileEvaluation>>}
 */
export async function getProjectFileEvaluation(projectFileId) {
  return get(ENDPOINTS.EVALUATION_BY_ID(projectFileId));
}

/**
 * 평가 지표 부분 수정 (정산서 발행 등)
 * - accuracy, error_count, form_error_count 만 UPDATE — 리비전/reason 보존
 * - 평가 행이 없으면 404
 *
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @param {{accuracy: number, errorCount: number, formErrorCount: number, updatedBy: string}} data
 * @returns {Promise<ApiResponse<ProjectFileEvaluation>>}
 */
export async function updateProjectFileEvaluationMetrics(projectFileId, data) {
  return patch(ENDPOINTS.EVALUATION_METRICS(projectFileId), data);
}

/**
 * 평가 데이터 삭제 (물리 삭제)
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @returns {Promise<ApiResponse<null>>}
 */
export async function deleteProjectFileEvaluation(projectFileId) {
  return del(ENDPOINTS.EVALUATION_BY_ID(projectFileId));
}

export default {
  upsertProjectFileEvaluation,
  searchProjectFileEvaluations,
  getProjectFileEvaluation,
  updateProjectFileEvaluationMetrics,
  deleteProjectFileEvaluation,
};
