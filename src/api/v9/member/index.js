/**
 * Member API (V9)
 * 회원(작업자) 관리 API
 *
 * 기본 경로: /v9/api/member
 * V8 대비 변경: workerLevelIds/workerLevelNames 필드 추가, 목록 엔드포인트 /list 제거
 */
import { get, post, put, del, getToken } from '../client';

const ENDPOINTS = {
  MEMBERS: '/v9/api/member',
  MEMBER_BY_NO: (membNo) => `/v9/api/member/${membNo}`,
  COMPANY_OPTIONS: '/v9/api/member/company-options',
  MEMBER_BY_EMAIL: (membId) => `/v9/api/member/by-email/${membId}`,
  COMMON_CODES: (grpCd) => `/v9/api/member/common-codes/${grpCd}`,
  BATCH: '/v9/api/member/batch',
  WORKER_LEVEL_TEMPLATE: '/v9/api/member/worker-levels/template',
  WORKER_LEVEL_BATCH: '/v9/api/member/worker-levels/batch',
};

/**
 * 회원 목록 조회 (페이징)
 * @param {Object} [params={}]
 * @param {string} [params.searchTxt] - 검색어
 * @param {string} [params.searchType] - 검색 타입 (name/email)
 * @param {string} [params.siteType] - 플랫폼 (ROLE_USER/ROLE_USERC)
 * @param {string} [params.userLvl] - 회원 등급
 * @param {string} [params.membStat] - 회원 상태
 * @param {number} [params.pageNo=1] - 페이지 번호 (1부터)
 * @param {number} [params.recordCountPerPage=10] - 페이지당 건수
 */
export async function getMemberList(params = {}) {
  return get(ENDPOINTS.MEMBERS, {
    pageNo: params.pageNo ?? 1,
    recordCountPerPage: params.recordCountPerPage ?? 10,
    ...params,
  });
}

/**
 * 회원 상세 조회
 * @param {number} membNo - 회원번호
 */
export async function getMember(membNo) {
  return get(ENDPOINTS.MEMBER_BY_NO(membNo));
}

/**
 * 회원 정보 조회 (이메일/ID 기준)
 * @param {string} membId - 회원 아이디(이메일)
 * @returns {Promise<ApiResponse<MemberDto>>}
 */
export async function getMemberByEmail(membId) {
  return get(ENDPOINTS.MEMBER_BY_EMAIL(membId));
}

/**
 * 회원 정보 수정
 * @param {number} membNo - 회원번호
 * @param {Object} data - 수정할 데이터
 * @param {number[]} [data.workerLevelIds] - 작업자 등급 ID 목록
 */
export async function updateMember(membNo, data) {
  return put(ENDPOINTS.MEMBER_BY_NO(membNo), data);
}

/**
 * 회원 탈퇴 처리 (소프트 삭제)
 * MEMB_STAT을 '3'(탈퇴)으로 변경합니다. 관리자 권한 필요.
 * @param {number} membNo - 회원번호
 */
export async function deleteMember(membNo) {
  return del(ENDPOINTS.MEMBER_BY_NO(membNo));
}

/**
 * 회원 단건 등록 (관리자)
 * @param {Object} data
 * @param {string} data.membId - 아이디(이메일) - 필수
 * @param {string} data.membNm - 이름 - 필수
 * @param {string} data.mblTelNo - 전화번호 - 필수
 * @param {string} data.membLvl - 등급 (1=일반, 2=관리자, 3=작업자, 4=시스템관리자, 5=기업) - 필수
 * @param {string} [data.membPwd] - 비밀번호 (미입력 시 전화번호 뒤 8자리)
 * @param {string} [data.entNo] - 기업번호 (membLvl=5 시 필수)
 * @param {string} [data.siteType] - 플랫폼 타입 (SORI/CLIP)
 * @param {string} [data.recvEmail] - 수신 이메일
 */
export async function createMember(data) {
  return post(ENDPOINTS.MEMBERS, data);
}

/**
 * 기업 옵션 목록 조회
 */
export async function getCompanyOptions() {
  return get(ENDPOINTS.COMPANY_OPTIONS);
}

/**
 * 공통 코드 조회
 * @param {string} grpCd - 그룹 코드 (USER_LEVEL, USER_STATUS, SNS_TP 등)
 */
export async function getCommonCodes(grpCd) {
  return get(ENDPOINTS.COMMON_CODES(grpCd));
}

/**
 * 회원 일괄 등록 (Excel/CSV 업로드, 관리자 전용)
 * 백엔드: POST /v9/api/member/batch (multipart/form-data)
 *
 * 컬럼 순서: [0]=membId(이메일), [1]=membNm, [2]=mblTelNo, [3]=membPwd(선택), [4]=recvEmail(선택)
 * 첫 행은 헤더로 간주하고 스킵.
 *
 * @param {File} file - .xlsx | .xls | .csv (≤10MB)
 * @param {Object} options
 * @param {string} options.membLvl - 등급 (2=관리자, 3=작업자, 5=기업고객, 6=검수자)
 * @param {string} options.siteType - 'SORI' | 'CLIP'
 * @param {string} [options.entNo] - 기업번호 (membLvl=5 시 필요)
 * @returns {Promise<{status:string, code:number, message:string, data:{totalCount:number, successCount:number, failCount:number, failureList:Array<{membId:string, membNm:string, mblTelNo:string, reason:string, rowNumber:number}>, message:string}}>}
 */
export async function batchCreateMembers(file, { membLvl, siteType, entNo } = {}) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.BATCH}`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('membLvl', String(membLvl));
  formData.append('siteType', String(siteType));
  if (entNo) formData.append('entNo', String(entNo));

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || `일괄 등록 실패 (HTTP ${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * 작업자 등급 일괄 변경 양식(xlsx) 다운로드
 * 백엔드: GET /v9/api/member/worker-levels/template
 *
 * 헤더: 작업자ID | 작업자명(참고용) | (사업유형 · 작업자) ... | (사업유형 · 검수자) ...
 * 빈 셀 = 해당 매핑 제거 의미.
 */
export async function downloadWorkerLevelTemplate() {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.WORKER_LEVEL_TEMPLATE}`;
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(text || `양식 다운로드 실패 (HTTP ${response.status})`);
    err.status = response.status;
    throw err;
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const fileName = match ? decodeURIComponent(match[1]) : '작업자_등급_일괄변경_양식.xlsx';

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * 작업자 등급 일괄 변경 (xlsx 업로드)
 * 백엔드: POST /v9/api/member/worker-levels/batch (multipart/form-data)
 *
 * 응답 data 형태:
 *  {
 *    totalRows, successCount, failCount,
 *    results: [{ rowNo, status: 'SUCCESS'|'FAIL', membId, reason? }],
 *    message
 *  }
 *
 * @param {File} file - .xlsx (≤10MB, 최대 5,000행)
 */
export async function batchUpdateWorkerLevels(file) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.WORKER_LEVEL_BATCH}`;

  const formData = new FormData();
  formData.append('file', file);

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || `작업자 등급 일괄 변경 실패 (HTTP ${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default {
  getMemberList,
  getMember,
  getMemberByEmail,
  updateMember,
  deleteMember,
  createMember,
  getCompanyOptions,
  getCommonCodes,
  batchCreateMembers,
  downloadWorkerLevelTemplate,
  batchUpdateWorkerLevels,
};
