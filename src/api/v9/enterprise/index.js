/**
 * Enterprise API (V9 경로)
 * 엔터프라이즈 업체 관리 API
 *
 * 기본 경로: /v9/api/enterprise
 * 권한: ROLE_ADMIN 필요
 */
import { get, post, put, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  ENTERPRISE: '/v9/api/enterprise',
  ENTERPRISE_BY_ID: (entNo) => `/v9/api/enterprise/${entNo}`,
  EXCEL_DOWNLOAD: '/v9/api/enterprise/excel-download',
  IMAGE_PRESIGNED_URL: '/v9/api/enterprise/image/presigned-url',
  IMAGE_DOWNLOAD_URL: (entNo) => `/v9/api/enterprise/${entNo}/image/download-url`,
};

/**
 * @typedef {Object} EnterpriseListParams
 * @property {number} [page=0] - 페이지 번호 (0부터 시작)
 * @property {number} [size=20] - 페이지 크기
 * @property {string} [searchTxt] - 검색어 (업체명)
 * @property {string} [bssType] - 사업자 구분 코드
 * @property {string} [useYn] - 사용 여부 ("Y" | "N")
 */

/**
 * @typedef {Object} EnterpriseDto
 * @property {number} entNo - 업체번호
 * @property {string} entNm - 업체명
 * @property {string|null} entDomain - 업체 도메인
 * @property {string|null} entDesc - 업체 설명
 * @property {string|null} bssType - 사업자 구분 코드
 * @property {string|null} bssTypeNm - 사업자 구분명
 * @property {string|null} picTelNo - 담당자 전화번호
 * @property {string} useYn - 사용 여부 ("Y" | "N")
 * @property {string|null} regr - 등록자
 * @property {string|null} regDttm - 등록일시
 * @property {string|null} chgr - 수정자
 * @property {string|null} chgDttm - 수정일시
 * @property {string|null} entThumbFileNm - 썸네일 파일명
 * @property {string|null} entFilePath - 파일 경로
 * @property {string|null} entFileNm - 파일명
 */

/**
 * 업체 목록 조회 (페이징)
 * @param {EnterpriseListParams} [params={}] - 조회 파라미터
 * @returns {Promise<Object>} 업체 목록 응답
 */
export async function getEnterpriseList(params = {}) {
  return get(ENDPOINTS.ENTERPRISE, {
    page: params.page ?? 0,
    size: params.size ?? 20,
    ...params,
  });
}

/**
 * 업체 상세 조회
 * @param {number} entNo - 업체번호
 * @returns {Promise<Object>} 업체 상세 응답
 */
export async function getEnterpriseDetail(entNo) {
  return get(ENDPOINTS.ENTERPRISE_BY_ID(entNo));
}

/**
 * 업체 등록
 * @param {Object} data - 등록 데이터
 * @param {string} data.entNm - 업체명 (필수)
 * @param {string} data.entDomain - 업체 도메인 (필수)
 * @param {string} [data.entDesc] - 업체 설명
 * @param {string} [data.bssType] - 사업자 구분 코드
 * @param {string} [data.picTelNo] - 담당자 전화번호
 * @param {string} [data.useYn] - 사용 여부
 * @returns {Promise<Object>} 등록된 업체 응답
 */
export async function createEnterprise(data) {
  return post(ENDPOINTS.ENTERPRISE, data);
}

/**
 * 업체 수정
 * @param {number} entNo - 업체번호
 * @param {Object} data - 수정 데이터
 * @returns {Promise<Object>} 수정된 업체 응답
 */
export async function updateEnterprise(entNo, data) {
  return put(ENDPOINTS.ENTERPRISE_BY_ID(entNo), data);
}

/**
 * 업체 삭제
 * @param {number} entNo - 업체번호
 * @returns {Promise<Object>} 삭제 응답
 */
export async function deleteEnterprise(entNo) {
  return del(ENDPOINTS.ENTERPRISE_BY_ID(entNo));
}

/**
 * 이미지 업로드용 Presigned URL 생성
 * @param {string} fileName - 파일명
 * @param {string} uuid - UUID
 * @returns {Promise<Object>} Presigned URL 응답
 */
export async function getImagePresignedUrl(fileName, uuid) {
  return get(ENDPOINTS.IMAGE_PRESIGNED_URL, { fileName, uuid });
}

/**
 * 이미지 다운로드 URL 생성
 * @param {number} entNo - 업체번호
 * @returns {Promise<Object>} 다운로드 URL 응답
 */
export async function getImageDownloadUrl(entNo) {
  return get(ENDPOINTS.IMAGE_DOWNLOAD_URL(entNo));
}

export default {
  getEnterpriseList,
  getEnterpriseDetail,
  createEnterprise,
  updateEnterprise,
  deleteEnterprise,
  getImagePresignedUrl,
  getImageDownloadUrl,
};
