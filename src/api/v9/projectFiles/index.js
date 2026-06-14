/**
 * Project Files API (V9 경로)
 * 프로젝트 파일 관리 API
 */
import { get, post, put, patch, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  PROJECT_FILES: '/v9/api/project-files',
  PROJECT_FILE_BY_ID: (id) => `/v9/api/project-files/${id}`,
  WORKER_ID: (id) => `/v9/api/project-files/${id}/worker-id`,
  CHECKER_ID: (id) => `/v9/api/project-files/${id}/checker-id`,
  WORK_TIME: (id) => `/v9/api/project-files/${id}/work-time`,
  PROJECT_FILE_INFO: '/v9/api/project-files/info',
  MY_TASKS: '/v9/api/project-files/my-tasks',
  BY_MEMBER: '/v9/api/project-files/by-member',
  PROJECT_FILES_BATCH: '/v9/api/project-files/batch',
};

/**
 * @typedef {Object} ProjectFile
 * @property {string} id - 프로젝트 파일 ID (UUID v4)
 * @property {string} projectId - 프로젝트 ID (projects FK)
 * @property {number} fileNo - 파일 번호 (TB_FILE FK)
 * @property {string|null} workerId - 작업자 ID
 * @property {string|null} checkerId - 검수자 ID
 * @property {string} status - 상태 (STANDBY, WORKING, DONE)
 * @property {boolean} isSplit - 분할 여부
 * @property {number} startSec - 시작 초
 * @property {number} endSec - 종료 초
 * @property {number} commentCnt - 댓글 수
 * @property {number} reviewTagCnt - 리뷰 태그 수
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 */

/**
 * @typedef {Object} ProjectFileCreateInput
 * @property {string} projectId - 프로젝트 ID (필수)
 * @property {number} fileNo - 파일 번호 (필수)
 * @property {string} [workerId] - 작업자 ID
 * @property {string} [checkerId] - 검수자 ID
 * @property {string} [status='STANDBY'] - 상태
 * @property {boolean} [isSplit=false] - 분할 여부
 * @property {number} [splitSeq=1] - 구간 순번 (분할 시 필수, 1부터 시작)
 * @property {number} [startSec=0] - 시작 초
 * @property {number} [endSec=0] - 종료 초
 */

/**
 * @typedef {Object} ProjectFileUpdateInput
 * @property {string} [workerId] - 작업자 ID
 * @property {string} [checkerId] - 검수자 ID
 * @property {string} [status] - 상태 (STANDBY, WORKING, DONE)
 * @property {number} [startSec] - 시작 초
 * @property {number} [endSec] - 종료 초
 */

/**
 * @typedef {Object} ProjectFileInfo
 * @property {string} projectFileId - 프로젝트 파일 ID (project_files.id)
 * @property {number} fileNo - 파일 번호
 * @property {string} lang - 언어 코드 (projects.lang)
 * @property {string} type - 프로젝트 유형 (projects.type)
 * @property {boolean} isSplit - 분할 여부
 * @property {number} startSec - 시작 초
 * @property {number} endSec - 종료 초
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
 * 프로젝트 파일 추가
 * - id는 UUID v4로 자동 생성
 *
 * @param {ProjectFileCreateInput} data - 추가할 프로젝트 파일 데이터
 * @returns {Promise<ApiResponse<ProjectFile>>} 생성된 프로젝트 파일 응답
 */
export async function createProjectFile(data) {
  return post(ENDPOINTS.PROJECT_FILES, data);
}

/**
 * 프로젝트 파일 일괄 추가 (배열 직접 전송)
 * - 전체가 하나의 트랜잭션으로 처리, 하나라도 실패 시 전체 롤백
 * @param {Array<{projectId: string, fileNo: number, isSplit?: boolean, splitSeq?: number, startSec?: number, endSec?: number}>} items
 * @returns {Promise<ApiResponse<ProjectFile[]>>} 생성된 프로젝트 파일 목록
 */
export async function createProjectFiles(items) {
  return post(ENDPOINTS.PROJECT_FILES_BATCH, items);
}

/**
 * 프로젝트 파일 단건 조회
 * @param {string} id - 프로젝트 파일 ID (UUID)
 * @returns {Promise<ApiResponse<ProjectFile>>} 프로젝트 파일 상세 응답
 */
export async function getProjectFileById(id) {
  return get(ENDPOINTS.PROJECT_FILE_BY_ID(id));
}

/**
 * 프로젝트별 파일 목록 조회
 * - 비페이징, created_at 오름차순 (등록순)
 *
 * @param {string} projectId - 프로젝트 ID (필수)
 * @returns {Promise<ApiResponse<ProjectFile[]>>} 프로젝트 파일 목록 응답
 */
export async function getProjectFilesByProjectId(projectId) {
  return get(ENDPOINTS.PROJECT_FILES, { project_id: projectId });
}

/**
 * 프로젝트 파일 수정 (부분 수정 지원)
 * - null이 아닌 필드만 업데이트
 *
 * @param {string} id - 프로젝트 파일 ID (UUID)
 * @param {ProjectFileUpdateInput} data - 수정할 프로젝트 파일 데이터
 * @returns {Promise<ApiResponse<ProjectFile>>} 수정된 프로젝트 파일 응답
 */
export async function updateProjectFile(id, data) {
  return put(ENDPOINTS.PROJECT_FILE_BY_ID(id), data);
}

/**
 * 프로젝트 파일 삭제 (물리 삭제)
 * @param {string} id - 프로젝트 파일 ID (UUID)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteProjectFile(id) {
  return del(ENDPOINTS.PROJECT_FILE_BY_ID(id));
}

/**
 * 작업자 ID 수정
 * - 해당 프로젝트 파일의 workerId만 개별 수정
 * - null 전송 시 작업자 해제
 *
 * @param {string} id - 프로젝트 파일 ID (UUID)
 * @param {string|null} workerId - 작업자 ID
 * @returns {Promise<ApiResponse<ProjectFile>>} 수정된 프로젝트 파일 응답
 */
export async function updateProjectFileWorkerId(id, workerId) {
  return patch(ENDPOINTS.WORKER_ID(id), { workerId });
}

/**
 * 검수자 ID 수정
 * - 해당 프로젝트 파일의 checkerId만 개별 수정
 * - null 전송 시 검수자 해제
 *
 * @param {string} id - 프로젝트 파일 ID (UUID)
 * @param {string|null} checkerId - 검수자 ID
 * @returns {Promise<ApiResponse<ProjectFile>>} 수정된 프로젝트 파일 응답
 */
export async function updateProjectFileCheckerId(id, checkerId) {
  return patch(ENDPOINTS.CHECKER_ID(id), { checkerId });
}

/**
 * 작업시간(work_time, 초) 수정 (관리자 전용)
 * - 연결된 미입금(is_paid=false) 정산서가 있으면 work_duration/pay가 자동 재계산됨.
 * - 입금완료 정산서는 변경되지 않음.
 *
 * @param {string} id - 프로젝트 파일 ID (UUID)
 * @param {number} workTime - 작업시간(초, 0 이상)
 * @returns {Promise<ApiResponse<ProjectFile>>} 수정된 프로젝트 파일 응답
 */
export async function updateProjectFileWorkTime(id, workTime) {
  return patch(ENDPOINTS.WORK_TIME(id), { workTime });
}

/**
 * 프로젝트 파일 정보 조회 (의뢰코드+유형+파일번호)
 * - projects와 project_files JOIN 조회
 * - start_sec 오름차순 정렬
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @param {string} type - 프로젝트 유형 (필수)
 * @param {number|string} fileNo - 파일 번호 (필수)
 * @returns {Promise<ApiResponse<ProjectFileInfo[]>>} 프로젝트 파일 정보 목록 응답
 */
export async function getProjectFileInfo(servCd, type, fileNo) {
  return get(ENDPOINTS.PROJECT_FILE_INFO, { serv_cd: servCd, type, file_no: fileNo });
}

/**
 * 사용자 할당 작업 파일 목록 조회
 * JWT 인증 기반으로 현재 로그인 사용자에게 배정된 프로젝트 파일을 조회
 *
 * @param {Object} params
 * @param {'worker'|'checker'} params.role - 배정 역할 (필수)
 * @param {string|string[]} params.status - 작업 상태 (필수). 단일 문자열 또는 배열로 복수 지정 가능
 *   - 단일: 'STANDBY'|'WORKING'|'WORK_DONE'|'REVIEWING'|'REVIEW_REJECT'|'REVIEW_DONE'|'READONLY'
 *   - 복수: ['REVIEW_DONE', 'READONLY'] → ?status=REVIEW_DONE&status=READONLY
 * @param {'record'|'enterprise_audio'|'enterprise_video'|'translate'} [params.type] - 프로젝트 타입 필터
 * @param {number} [params.page=1] - 페이지 번호 (1부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @returns {Promise<ApiResponse>} 페이징된 프로젝트 파일 목록
 */
export async function getMyTaskFiles(params) {
  return get(ENDPOINTS.MY_TASKS, params);
}

/**
 * 회원별 할당 작업 파일 목록 조회 (관리자 전용)
 * membId를 파라미터로 받아 해당 회원에게 배정된 프로젝트 파일을 조회
 *
 * @param {Object} params
 * @param {string} params.membId - 회원 ID (필수)
 * @param {'worker'|'checker'} params.role - 배정 역할 (필수)
 * @param {string|string[]} params.status - 작업 상태 (필수). 단일 문자열 또는 배열로 복수 지정 가능
 *   - 단일: 'STANDBY'|'WORKING'|'WORK_DONE'|'REVIEWING'|'REVIEW_REJECT'|'REVIEW_DONE'|'READONLY'
 *   - 복수: ['REVIEW_DONE', 'READONLY'] → ?status=REVIEW_DONE&status=READONLY
 * @param {'record'|'enterprise_audio'|'enterprise_video'|'translate'} [params.type] - 프로젝트 타입 필터
 * @param {number} [params.page=1] - 페이지 번호 (1부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @returns {Promise<ApiResponse>} 페이징된 프로젝트 파일 목록
 */
export async function getTaskFilesByMembId(params) {
  return get(ENDPOINTS.BY_MEMBER, params);
}

export default {
  createProjectFile,
  createProjectFiles,
  getProjectFileById,
  getProjectFilesByProjectId,
  updateProjectFile,
  deleteProjectFile,
  updateProjectFileWorkerId,
  updateProjectFileCheckerId,
  updateProjectFileWorkTime,
  getProjectFileInfo,
  getMyTaskFiles,
  getTaskFilesByMembId,
};
