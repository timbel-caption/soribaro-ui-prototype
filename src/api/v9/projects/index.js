/**
 * Projects API (V9 경로)
 * 프로젝트 관리 API
 */
import { get, post, put, patch, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  PROJECTS: '/v9/api/projects',
  MY_PROJECTS: '/v9/api/projects/my',
  BY_WORKER: '/v9/api/projects/by-worker',
  PROJECT_BY_ID: (id) => `/v9/api/projects/${id}`,
  ADMIN_MESSAGE: (id) => `/v9/api/projects/${id}/admin-message`,
  WORKER_MESSAGE: (id) => `/v9/api/projects/${id}/worker-message`,
  CHECKER_MESSAGE: (id) => `/v9/api/projects/${id}/checker-message`,
};

/**
 * @typedef {Object} Project
 * @property {string} id - 프로젝트 ID (UUID v4)
 * @property {string} servCd - 의뢰 코드 (TB_SERV FK)
 * @property {string|null} type - 프로젝트 유형 (TRANSLATION, SUBTITLE 등)
 * @property {string|null} lang - 언어 코드 (ko, en 등)
 * @property {number|null} worksfyProjectKey - 웍스파이 프로젝트 키
 * @property {string} title - 프로젝트명
 * @property {string|null} description - 프로젝트 설명
 * @property {number} workerCnt - 작업자 수
 * @property {number} price - 단가
 * @property {string|null} recruitStart - 모집 시작 일시 (ISO 8601)
 * @property {string|null} recruitEnd - 모집 종료 일시 (ISO 8601)
 * @property {string|null} workStart - 작업 시작 일시 (ISO 8601)
 * @property {string|null} workEnd - 작업 종료 일시 (ISO 8601)
 * @property {boolean} isImportant - 중요 여부
 * @property {boolean} isAnyWorker - 누구나 지원 가능 여부
 * @property {string|null} adminMessage - 관리자 메시지
 * @property {string|null} workerMessage - 작업자 메시지
 * @property {string|null} checkerMessage - 검수자 메시지
 * @property {number} createdBy - 생성자 (회원번호)
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 */

/**
 * @typedef {Object} ProjectCreateInput
 * @property {string} servCd - 의뢰 코드 (필수)
 * @property {string} [type] - 프로젝트 유형 (TRANSLATION, SUBTITLE 등)
 * @property {string} [lang] - 언어 코드 (ko, en 등)
 * @property {string} title - 프로젝트명 (필수)
 * @property {string} [description] - 프로젝트 설명
 * @property {number} [worksfyProjectKey] - 웍스파이 프로젝트 키
 * @property {number} [workerCnt] - 작업자 수
 * @property {string} [price] - 단가 (숫자 또는 "추후협의" 등 문자열)
 * @property {string} [recruitStart] - 모집 시작 일시 (ISO 8601)
 * @property {string} [recruitEnd] - 모집 종료 일시 (ISO 8601)
 * @property {string} [workStart] - 작업 시작 일시 (ISO 8601)
 * @property {string} [workEnd] - 작업 종료 일시 (ISO 8601)
 * @property {boolean} [isImportant=false] - 중요 여부
 * @property {boolean} [isAnyWorker=true] - 누구나 지원 가능 여부
 * @property {string} [adminMessage] - 관리자 메시지
 * @property {string} [workerMessage] - 작업자 메시지
 * @property {string} [checkerMessage] - 검수자 메시지
 */

/**
 * @typedef {Object} ProjectUpdateInput
 * @property {string} [type] - 프로젝트 유형 (TRANSLATION, SUBTITLE 등)
 * @property {string} [lang] - 언어 코드 (ko, en 등)
 * @property {number} [worksfyProjectKey] - 웍스파이 프로젝트 키
 * @property {string} [title] - 프로젝트명
 * @property {string} [description] - 프로젝트 설명
 * @property {number} [workerCnt] - 작업자 수
 * @property {string} [price] - 단가 (숫자 또는 "추후협의" 등 문자열)
 * @property {string} [recruitStart] - 모집 시작 일시 (ISO 8601)
 * @property {string} [recruitEnd] - 모집 종료 일시 (ISO 8601)
 * @property {string} [workStart] - 작업 시작 일시 (ISO 8601)
 * @property {string} [workEnd] - 작업 종료 일시 (ISO 8601)
 * @property {boolean} [isImportant] - 중요 여부
 * @property {boolean} [isAnyWorker] - 누구나 지원 가능 여부
 * @property {string} [adminMessage] - 관리자 메시지
 * @property {string} [workerMessage] - 작업자 메시지
 * @property {string} [checkerMessage] - 검수자 메시지
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
 * 프로젝트 생성
 * - id는 UUID v4로 자동 생성
 * - created_by는 로그인 사용자 회원번호 자동 설정
 *
 * @param {ProjectCreateInput} data - 생성할 프로젝트 데이터
 * @returns {Promise<ApiResponse<Project>>} 생성된 프로젝트 응답
 */
export async function createProject(data) {
  return post(ENDPOINTS.PROJECTS, data);
}

/**
 * 프로젝트 단건 조회
 * @param {string} id - 프로젝트 ID (UUID)
 * @returns {Promise<ApiResponse<Project>>} 프로젝트 상세 응답
 */
export async function getProjectById(id) {
  return get(ENDPOINTS.PROJECT_BY_ID(id));
}

/**
 * 의뢰 코드별 프로젝트 목록 조회
 * - 비페이징, created_at 내림차순 (최신순)
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @returns {Promise<ApiResponse<Project[]>>} 프로젝트 목록 응답
 */
export async function getProjectsByServCd(servCd) {
  return get(ENDPOINTS.PROJECTS, { serv_cd: servCd });
}

/**
 * 프로젝트 수정 (부분 수정 지원)
 * - null이 아닌 필드만 업데이트
 * - id, servCd, createdBy, createdAt은 수정 불가
 *
 * @param {string} id - 프로젝트 ID (UUID)
 * @param {ProjectUpdateInput} data - 수정할 프로젝트 데이터
 * @returns {Promise<ApiResponse<Project>>} 수정된 프로젝트 응답
 */
export async function updateProject(id, data) {
  return put(ENDPOINTS.PROJECT_BY_ID(id), data);
}

/**
 * 프로젝트 삭제 (물리 삭제)
 * @param {string} id - 프로젝트 ID (UUID)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteProject(id) {
  return del(ENDPOINTS.PROJECT_BY_ID(id));
}

/**
 * 관리자 메시지 수정
 * - 해당 프로젝트의 adminMessage만 개별 수정
 * - null 전송 시 메시지 삭제
 *
 * @param {string} id - 프로젝트 ID (UUID)
 * @param {string|null} adminMessage - 관리자 메시지
 * @returns {Promise<ApiResponse<Project>>} 수정된 프로젝트 응답
 */
export async function updateAdminMessage(id, adminMessage) {
  return patch(ENDPOINTS.ADMIN_MESSAGE(id), { adminMessage });
}

/**
 * 작업자 메시지 수정
 * - 해당 프로젝트의 workerMessage만 개별 수정
 * - null 전송 시 메시지 삭제
 *
 * @param {string} id - 프로젝트 ID (UUID)
 * @param {string|null} workerMessage - 작업자 메시지
 * @returns {Promise<ApiResponse<Project>>} 수정된 프로젝트 응답
 */
export async function updateWorkerMessage(id, workerMessage) {
  return patch(ENDPOINTS.WORKER_MESSAGE(id), { workerMessage });
}

/**
 * 검수자 메시지 수정
 * - 해당 프로젝트의 checkerMessage만 개별 수정
 * - null 전송 시 메시지 삭제
 *
 * @param {string} id - 프로젝트 ID (UUID)
 * @param {string|null} checkerMessage - 검수자 메시지
 * @returns {Promise<ApiResponse<Project>>} 수정된 프로젝트 응답
 */
export async function updateCheckerMessage(id, checkerMessage) {
  return patch(ENDPOINTS.CHECKER_MESSAGE(id), { checkerMessage });
}

/**
 * @typedef {Object} MyProjectFileItem
 * @property {string} projectFileId - 프로젝트 파일 ID (UUID)
 * @property {string} projectId - 프로젝트 ID (UUID)
 * @property {string} servCd - 서비스 코드
 * @property {string} projectTitle - 프로젝트 제목
 * @property {string} projectType - 프로젝트 유형
 * @property {string} lang - 언어 코드
 * @property {string} servTitle - 서비스 제목 (TB_SERV)
 * @property {string} videoYn - 영상 여부 (Y/N)
 * @property {number} fileNo - 파일 번호
 * @property {string} fileStatus - 파일 상태 (project_files.status)
 * @property {string} overallStatus - 파일 종합 상태 (fn_file_overall_status)
 * @property {string} assignRole - 배정 역할 (WORKER, CHECKER)
 * @property {number} price - 단가
 * @property {string|null} workerMessage - 작업자 메시지
 * @property {string|null} checkerMessage - 검수자 메시지
 * @property {string|null} workStart - 작업 시작일시
 * @property {string|null} workEnd - 작업 종료일시
 * @property {boolean} isSplit - 분할 여부
 * @property {number} startSec - 시작 초
 * @property {number} endSec - 종료 초
 * @property {string|null} totalPlayTm - 총 재생시간
 * @property {number} commentCnt - 댓글 수
 * @property {number} reviewTagCnt - 리뷰 태그 수
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 */

/**
 * 작업자 프로젝트 파일 목록 조회 (내 프로젝트)
 * 현재 로그인한 작업자가 배정된 프로젝트 파일을 타입별로 조회.
 * 개별 project_files 행 단위로 반환됩니다.
 *
 * @param {Object} params
 * @param {string} params.type - 작업 타입 (record / enterprise / translate)
 * @param {number} [params.page=1] - 페이지 번호 (1부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @param {string} [params.startDate] - 시작일 (YYYY-MM-DD)
 * @param {string} [params.endDate] - 종료일 (YYYY-MM-DD)
 * @param {string} [params.searchType] - 검색 타입 (servCd / title)
 * @param {string} [params.searchText] - 검색어
 * @param {string} [params.workStat] - 파일 상태 필터 (STANDBY, WORKING, WORK_DONE, REVIEWING, REVIEW_REJECT, REVIEW_DONE)
 * @returns {Promise<ApiResponse<{content: MyProjectFileItem[], totalElements: number, totalPages: number, page: number, size: number}>>}
 */
export async function getMyProjects(params) {
  return get(ENDPOINTS.MY_PROJECTS, params);
}

/**
 * 회원별 프로젝트 파일 목록 조회 (관리자용)
 * membId를 파라미터로 받아 해당 작업자가 배정된 프로젝트 파일을 타입별로 조회.
 * 개별 project_files 행 단위로 반환됩니다.
 *
 * @param {Object} params
 * @param {string} params.membId - 회원 ID (tb_memb.MEMB_ID, 필수)
 * @param {string} params.type - 작업 타입 (record / enterprise / translate)
 * @param {number} [params.page=1] - 페이지 번호 (1부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @param {string} [params.startDate] - 시작일 (YYYY-MM-DD)
 * @param {string} [params.endDate] - 종료일 (YYYY-MM-DD)
 * @param {string} [params.searchType] - 검색 타입 (servCd / title)
 * @param {string} [params.searchText] - 검색어
 * @param {string} [params.workStat] - 파일 상태 필터 (STANDBY, WORKING, WORK_DONE, REVIEWING, REVIEW_REJECT, REVIEW_DONE)
 * @returns {Promise<ApiResponse<{content: MyProjectFileItem[], totalElements: number, totalPages: number, page: number, size: number}>>}
 */
export async function getWorkerProjectsByMembId(params) {
  return get(ENDPOINTS.BY_WORKER, params);
}

export default {
  createProject,
  getProjectById,
  getProjectsByServCd,
  updateProject,
  deleteProject,
  updateAdminMessage,
  updateWorkerMessage,
  updateCheckerMessage,
  getMyProjects,
  getWorkerProjectsByMembId,
};
