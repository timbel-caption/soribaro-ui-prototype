/**
 * Worksfy Projects API (V9 경로)
 * 웍스파이 프로젝트 및 신청자 관리 API
 *
 * 기본 경로: /v9/api/worksfy/projects
 * 인증: JWT 토큰 (Authorization: Bearer {token})
 */
import { get, post, put, del } from '../client';

// ============================================================================
// 엔드포인트
// ============================================================================

const ENDPOINTS = {
  /** 프로젝트 목록 / 생성 */
  PROJECTS: '/v9/api/worksfy/projects',
  /** 프로젝트 단건 (상세조회, 수정, 삭제) */
  PROJECT_BY_ID: (prjId) => `/v9/api/worksfy/projects/${prjId}`,
  /** 프로젝트 마감 */
  PROJECT_CLOSE: (prjId) => `/v9/api/worksfy/projects/${prjId}/close`,
  /** 신청자 목록 */
  APPLICANTS: (prjId) => `/v9/api/worksfy/projects/${prjId}/applicants`,
  /** 신청자 승인 */
  APPLICANTS_APPROVE: (prjId) => `/v9/api/worksfy/projects/${prjId}/applicants/approve`,
  /** 신청자 승인해제 */
  APPLICANTS_UNAPPROVE: (prjId) => `/v9/api/worksfy/projects/${prjId}/applicants/unapprove`,
  /** 작업자 목록 */
  WORKERS: '/v9/api/worksfy/projects/workers',
};

// ============================================================================
// 공통 응답 타입
// ============================================================================

/**
 * @typedef {Object} V8ApiResponse
 * @property {string} status - 응답 상태: "SUCCESS", "FAILURE", "ERROR"
 * @property {string} code - 상태 코드: "200", "500" 등
 * @property {*} data - 응답 데이터
 * @property {string} message - 응답 메시지
 * @property {string} timestamp - 응답 타임스탬프
 */

// ============================================================================
// 프로젝트 타입 정의
// ============================================================================

/**
 * @typedef {Object} WorksfyProjectDto
 * @property {string} id - 프로젝트 ID (yyyyMMdd0001 형식 자동 생성)
 * @property {string|null} prjNo - 프로젝트 번호 e.g. "PJ20250115001"
 * @property {string} type - 프로젝트 타입: "PROJECT" | "EMPLOY"
 * @property {string} title - 프로젝트명
 * @property {string|null} contents - 프로젝트 설명 (HTML)
 * @property {string} svcTp - 서비스 타입 코드
 * @property {string|null} svcNm - 서비스명 (코드 조인 결과)
 * @property {string|null} fixYn - 고정 여부 "Y" | "N"
 * @property {string|null} applStrtDt - 모집 시작일시 (yyyyMMddHHmm)
 * @property {string|null} applEndDt - 모집 종료일시 (yyyyMMddHHmm)
 * @property {string|null} wrkStrtDt - 작업 시작일 (yyyyMMdd)
 * @property {string|null} wrkEndDt - 작업 종료일 (yyyyMMdd)
 * @property {string|null} applQualCd - 지원 자격 코드
 * @property {string|null} applQualNm - 지원 자격 이름 (코드 조인 결과)
 * @property {string|null} applCnt - 모집 인원
 * @property {string|null} unitPric - 단가
 * @property {boolean|null} isApplicable - 신청 가능 여부
 * @property {string|null} projectSource - 프로젝트 소스: "INTERNAL" | "EXTERNAL_SORIBARO" | "EXTERNAL_CLIPDESK" | "EXTERNAL_API"
 * @property {number|null} viewCnt - 조회수
 * @property {number|null} workerCnt - 신청자 수
 */

/**
 * @typedef {Object} WorksfyProjectListResponse
 * @property {WorksfyProjectDto[]} projects - 프로젝트 목록
 * @property {number} totalElements - 전체 항목 수
 * @property {number} totalPages - 전체 페이지 수
 * @property {number} page - 현재 페이지 번호 (0부터 시작)
 * @property {number} size - 페이지 크기
 */

/**
 * @typedef {Object} WorksfyProjectCreateRequest
 * @property {string} title - 프로젝트명 (필수)
 * @property {string} contents - 프로젝트 설명 - HTML 가능 (필수)
 * @property {string} svcTp - 서비스 타입 코드 (필수) e.g. "06"=클립데스크, "01"=소리바로
 * @property {string} svcNm - 서비스명 (필수) e.g. "클립데스크", "소리바로"
 * @property {string} applStrtDt - 모집 시작일시 (필수) 형식: yyyyMMddHHmm
 * @property {string} applEndDt - 모집 종료일시 (필수) 형식: yyyyMMddHHmm
 * @property {string} wrkStrtDt - 작업 시작일 (필수) 형식: yyyyMMdd
 * @property {string} wrkEndDt - 작업 종료일 (필수) 형식: yyyyMMdd
 * @property {string} applQualCd - 지원 자격 코드 (필수) "anyone"=누구나, "01"=속기사
 * @property {string} applCnt - 모집 인원 (필수) e.g. "3"
 * @property {string} unitPric - 단가 (필수) e.g. "300000"
 * @property {string} fixYn - 고정 여부 (필수) "Y" | "N"
 * @property {boolean} isApplicable - 신청 가능 여부 (필수)
 */

/**
 * @typedef {Object} WorksfyProjectUpdateRequest
 * @property {string} [title] - 프로젝트명
 * @property {string} [contents] - 프로젝트 설명 - HTML 가능
 * @property {string} [applStrtDt] - 모집 시작일시 형식: yyyyMMddHHmm
 * @property {string} [applEndDt] - 모집 종료일시 형식: yyyyMMddHHmm
 * @property {string} [wrkStrtDt] - 작업 시작일 형식: yyyyMMdd
 * @property {string} [wrkEndDt] - 작업 종료일 형식: yyyyMMdd
 * @property {string} [applQualCd] - 지원 자격 코드 "anyone"=누구나, "01"=속기사
 * @property {string} [applCnt] - 모집 인원
 * @property {string} [unitPric] - 단가
 * @property {string} [fixYn] - 고정 여부 "Y" | "N"
 * @property {boolean} [isApplicable] - 신청 가능 여부
 */

// ============================================================================
// 신청자 타입 정의
// ============================================================================

/**
 * @typedef {Object} WorksfyApplicantDto
 * @property {string} workerId - 작업자 ID (UUID)
 * @property {string|null} workerName - 작업자 이름
 * @property {string|null} email - 이메일
 * @property {boolean|null} approved - 승인 여부
 * @property {boolean|null} cancelled - 취소 여부
 * @property {string|null} sexCd - 성별 코드
 * @property {string|null} mblTelNo - 휴대전화번호
 * @property {string|null} birthYmd - 생년월일
 * @property {string|null} kbdCd - 키보드 코드
 * @property {string|null} korchamStnoLvl - 대한상공회의소 속기 레벨
 * @property {string|null} aiStnoMemLvlCd - AI 속기 회원 레벨 코드
 * @property {string|null} baseAddr - 기본주소 (코드 → 이름 변환)
 * @property {string|null} dtlAddr - 상세주소 (코드 → 이름 변환)
 * @property {string|null} soribaroMembNo - 소리바로 회원번호 (SSO 매핑)
 */

/**
 * @typedef {Object} WorksfyApplicantListResponse
 * @property {WorksfyApplicantDto[]} applicants - 신청자 목록
 * @property {number} totalCount - 전체 신청자 수
 */

/**
 * @typedef {Object} WorksfyApplicantApprovalRequest
 * @property {string[]} workerIds - 승인/승인해제할 작업자 ID 목록 (UUID 문자열)
 */

/**
 * 신청자 상태 필터
 * @typedef {'all' | 'approved' | 'unapproved' | 'cancelled'} ApplicantStatusFilter
 */

/**
 * @typedef {Object} WorksfyProjectListParams
 * @property {number} [page] - 페이지 번호 (0부터 시작, 기본 0)
 * @property {number} [size] - 페이지 크기 (기본 10)
 * @property {string} [search] - 검색어
 */

// ============================================================================
// 작업자 타입 정의
// ============================================================================

/**
 * @typedef {Object} WorksfyWorkerDto
 * @property {string} wrkrId - 작업자 ID (UUID)
 * @property {string|null} wrkrNm - 작업자 이름
 * @property {string|null} email - 이메일
 * @property {string|null} mblTelNo - 휴대전화번호
 */

/**
 * @typedef {Object} WorksfyWorkerListResponse
 * @property {WorksfyWorkerDto[]} workers - 작업자 목록
 * @property {number} totalElements - 전체 항목 수
 * @property {number} totalPages - 전체 페이지 수
 * @property {number} page - 현재 페이지 번호 (0부터 시작)
 * @property {number} size - 페이지 크기
 */

/**
 * @typedef {Object} WorksfyWorkerListParams
 * @property {number} [page] - 페이지 번호 (0부터 시작, 기본 0)
 * @property {number} [size] - 페이지 크기 (기본 10)
 * @property {string} [search] - 검색어 (이름, 이메일, 전화번호)
 */

// ============================================================================
// 프로젝트 API 함수
// ============================================================================

/**
 * 2-1. 프로젝트 목록 조회
 * @param {WorksfyProjectListParams} [params={}] - 조회 파라미터
 * @returns {Promise<V8ApiResponse<WorksfyProjectListResponse>>} 프로젝트 목록 응답
 */
export async function getWorksfyProjects(params = {}) {
  return get(ENDPOINTS.PROJECTS, params);
}

/**
 * 2-2. 프로젝트 상세 조회
 * @param {string} prjId - 프로젝트 ID
 * @returns {Promise<V8ApiResponse<WorksfyProjectDto>>} 프로젝트 상세 응답
 */
export async function getWorksfyProject(prjId) {
  return get(ENDPOINTS.PROJECT_BY_ID(prjId));
}

/**
 * 2-3. 프로젝트 생성
 * @param {WorksfyProjectCreateRequest} data - 생성할 프로젝트 데이터
 * @returns {Promise<V8ApiResponse<WorksfyProjectDto>>} 생성된 프로젝트 응답
 */
export async function createWorksfyProject(data) {
  return post(ENDPOINTS.PROJECTS, data);
}

/**
 * 2-4. 프로젝트 수정
 * @param {string} prjId - 프로젝트 ID
 * @param {WorksfyProjectUpdateRequest} data - 수정할 프로젝트 데이터 (전달된 필드만 수정)
 * @returns {Promise<V8ApiResponse<WorksfyProjectDto>>} 수정된 프로젝트 응답
 */
export async function updateWorksfyProject(prjId, data) {
  return put(ENDPOINTS.PROJECT_BY_ID(prjId), data);
}

/**
 * 2-5. 프로젝트 마감
 * @param {string} prjId - 프로젝트 ID
 * @returns {Promise<V8ApiResponse<WorksfyProjectDto>>} 마감된 프로젝트 응답
 */
export async function closeWorksfyProject(prjId) {
  return put(ENDPOINTS.PROJECT_CLOSE(prjId));
}

/**
 * 2-6. 프로젝트 삭제 (소프트 삭제)
 * @param {string} prjId - 프로젝트 ID
 * @returns {Promise<V8ApiResponse<void>>} 삭제 응답
 */
export async function deleteWorksfyProject(prjId) {
  return del(ENDPOINTS.PROJECT_BY_ID(prjId));
}

// ============================================================================
// 신청자 API 함수
// ============================================================================

/**
 * 2-7. 프로젝트 신청자 목록 조회
 * @param {string} prjId - 프로젝트 ID
 * @param {Object} [params={}] - 조회 파라미터
 * @param {ApplicantStatusFilter} [params.status] - 신청자 상태 필터 ("all" | "approved" | "unapproved" | "cancelled")
 * @returns {Promise<V8ApiResponse<WorksfyApplicantListResponse>>} 신청자 목록 응답
 */
export async function getWorksfyApplicants(prjId, params = {}) {
  return get(ENDPOINTS.APPLICANTS(prjId), params);
}

/**
 * 2-8. 신청자 승인
 * @param {string} prjId - 프로젝트 ID
 * @param {WorksfyApplicantApprovalRequest} data - 승인할 작업자 ID 목록
 * @returns {Promise<V8ApiResponse<void>>} 승인 응답
 */
export async function approveWorksfyApplicants(prjId, data) {
  return put(ENDPOINTS.APPLICANTS_APPROVE(prjId), data);
}

/**
 * 2-9. 신청자 승인해제
 * @param {string} prjId - 프로젝트 ID
 * @param {WorksfyApplicantApprovalRequest} data - 승인해제할 작업자 ID 목록
 * @returns {Promise<V8ApiResponse<void>>} 승인해제 응답
 */
export async function unapproveWorksfyApplicants(prjId, data) {
  return put(ENDPOINTS.APPLICANTS_UNAPPROVE(prjId), data);
}

// ============================================================================
// 작업자 API 함수
// ============================================================================

/**
 * 2-10. 작업자 목록 조회
 * @param {WorksfyWorkerListParams} [params={}] - 조회 파라미터
 * @returns {Promise<V8ApiResponse<WorksfyWorkerListResponse>>} 작업자 목록 응답
 */
export async function getWorksfyWorkers(params = {}) {
  return get(ENDPOINTS.WORKERS, params);
}

export default {
  getWorksfyProjects,
  getWorksfyProject,
  createWorksfyProject,
  updateWorksfyProject,
  closeWorksfyProject,
  deleteWorksfyProject,
  getWorksfyApplicants,
  approveWorksfyApplicants,
  unapproveWorksfyApplicants,
  getWorksfyWorkers,
};
