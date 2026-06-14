/**
 * Enterprise Customer API (V9)
 * 엔터프라이즈 고객관리 API
 *
 * 기본 경로: /v9/api/enterprise-customer
 */
import { get, put, getToken } from '../client';

const getBaseUrl = () => import.meta.env.VITE_V9_API_URL || '';

const ENDPOINTS = {
  LIST: '/v9/api/enterprise-customer',
  DETAIL: (membNo) => `/v9/api/enterprise-customer/${membNo}`,
  EXCEL: '/v9/api/enterprise-customer/excel',
};

/**
 * 고객 목록 조회 (페이징)
 *
 * @param {Object} params
 * @param {number} [params.page=1] - 페이지 번호 (1부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @param {string} [params.platform] - 소리바로 / 클립데스크
 * @param {string} [params.status] - 정상 / 대기 / 탈퇴
 * @param {string} [params.searchText] - 이름/아이디/기업명칭 통합 검색
 * @returns {Promise<Object>} V8PageResponse
 */
export async function getEnterpriseCustomerList(params) {
  return get(ENDPOINTS.LIST, params);
}

/**
 * 고객 상세 조회
 *
 * @param {number|string} membNo - 회원번호
 * @returns {Promise<Object>}
 */
export async function getEnterpriseCustomerDetail(membNo) {
  return get(ENDPOINTS.DETAIL(membNo));
}

/**
 * 고객 정보 수정 (null이 아닌 필드만 업데이트)
 *
 * @param {number|string} membNo - 회원번호
 * @param {Object} data - 수정할 필드 (membNm, mblTelNo, recvEmail, zipCd, baseAddr, dtlAddr, wdlRsn)
 * @returns {Promise<Object>}
 */
export async function updateEnterpriseCustomer(membNo, data) {
  return put(ENDPOINTS.DETAIL(membNo), data);
}

/**
 * 고객 목록 엑셀 다운로드
 *
 * @param {Object} [params={}] - 검색 조건 (platform, status, searchText)
 * @returns {Promise<void>} 파일 다운로드 트리거
 */
export async function downloadEnterpriseCustomerExcel(params = {}) {
  const baseUrl = getBaseUrl();
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${baseUrl}${ENDPOINTS.EXCEL}${query ? `?${query}` : ''}`;

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { method: 'POST', headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `엑셀 다운로드 실패 (HTTP ${response.status})`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  let fileName = '엔터프라이즈_고객_목록.xlsx';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/i);
  if (match) fileName = decodeURIComponent(match[1].replace(/["']/g, ''));

  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export default {
  getEnterpriseCustomerList,
  getEnterpriseCustomerDetail,
  updateEnterpriseCustomer,
  downloadEnterpriseCustomerExcel,
};
