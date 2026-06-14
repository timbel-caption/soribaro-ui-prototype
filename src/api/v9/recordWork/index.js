/**
 * Record Work API (V9)
 * 녹취록 작업관리 API (SERV_TP != '3', TRNS_YN != 'Y')
 *
 * 기본 경로: /v9/api/record-work
 */
import { get, put } from '../client';

const ENDPOINTS = {
  REQUESTS: '/v9/api/record-work/requests',
  REQUEST_DETAIL: (servCd) => `/v9/api/record-work/requests/${servCd}`,
  REQUEST_CONFIRM: (servCd) => `/v9/api/record-work/requests/${servCd}/confirm`,
  WORKS: '/v9/api/record-work/works',
  REQUEST_PRICE: (servCd) => `/v9/api/record-work/requests/${servCd}/price`,
  FILE_PRICES: (servCd) => `/v9/api/record-work/requests/${servCd}/file-prices`,
  WORK_DETAIL: (servCd) => `/v9/api/record-work/works/${servCd}`,
  STENO_MEMO: (servCd) => `/v9/api/record-work/requests/${servCd}/steno-memo`,
  ADMIN_MEMO: (servCd) => `/v9/api/record-work/requests/${servCd}/admin-memo`,
  ATTACHMENT_SHARE: (servCd) => `/v9/api/record-work/requests/${servCd}/attachment-share`,
};

/**
 * 의뢰현황 목록 조회 (WORK_STAT='1', SERV_CD 단위)
 *
 * @param {Object} params
 * @param {string} [params.startDate] - 시작일 (YYYY-MM-DD)
 * @param {string} [params.endDate] - 종료일 (YYYY-MM-DD)
 * @param {number} [params.page=1] - 페이지 번호 (1부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @param {string} [params.searchType] - 검색 타입 (servCd, memberName, phone)
 * @param {string} [params.searchText] - 검색어
 * @param {string} [params.servTp] - 의뢰 타입 (1=통화기록, 2=다기록)
 * @param {string} [params.payTp] - 결제 타입
 * @param {string} [params.cnlYn] - 취소 여부 (Y/N)
 * @returns {Promise<Object>} V8PageResponse
 */
export async function getRecordWorkRequests(params) {
  return get(ENDPOINTS.REQUESTS, params);
}

/**
 * 작업현황 목록 조회 (WORK_STAT!='1', SERV_CD 단위)
 *
 * @param {Object} params
 * @param {string} [params.startDate] - 시작일 (YYYY-MM-DD)
 * @param {string} [params.endDate] - 종료일 (YYYY-MM-DD)
 * @param {number} [params.page=1] - 페이지 번호 (1부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @param {string} [params.searchType] - 검색 타입 (servCd, title, memberName, phone, workerName)
 * @param {string} [params.searchText] - 검색어
 * @param {string} [params.workStat] - 작업 상태 필터
 * @param {string} [params.servTp] - 의뢰 타입 (1=통화기록, 2=다기록)
 * @param {string} [params.payTp] - 결제 타입
 * @returns {Promise<Object>} V8PageResponse (content[].overallStatus: 서비스 종합 상태)
 */
export async function getRecordWorkWorks(params) {
  return get(ENDPOINTS.WORKS, params);
}

/**
 * 의뢰현황 상세 조회
 *
 * @param {string} servCd - 의뢰 코드
 * @returns {Promise<Object>} 의뢰 기본 정보 + 금액
 */
export async function getRecordWorkRequestDetail(servCd) {
  return get(ENDPOINTS.REQUEST_DETAIL(servCd));
}

/**
 * 의뢰 확정 (WORK_STAT 1→2 작업준비 상태로 전환)
 *
 * @param {string} servCd - 의뢰 코드
 * @returns {Promise<Object>}
 */
export async function confirmRecordWorkRequest(servCd, servTitle) {
  return put(ENDPOINTS.REQUEST_CONFIRM(servCd), servTitle ? { servTitle } : {});
}

/**
 * 전체 확정 금액 수정 (TB_SERV.FIX_PRICE)
 *
 * @param {string} servCd - 의뢰 코드
 * @param {number} fixPrice - 확정 금액
 * @returns {Promise<Object>}
 */
export async function updateRecordWorkRequestPrice(servCd, fixPrice) {
  return put(ENDPOINTS.REQUEST_PRICE(servCd), { fixPrice });
}

/**
 * 파일별 확정 금액 수정 (TB_SERV_DTL.FIX_PRICE)
 *
 * @param {string} servCd - 의뢰 코드
 * @param {Array<{fileNo: string, fixPrice: number}>} filePrices - 파일별 가격 배열
 * @returns {Promise<Object>}
 */
export async function updateRecordWorkFilesPrices(servCd, filePrices) {
  return put(ENDPOINTS.FILE_PRICES(servCd), filePrices);
}

/**
 * 작업현황 상세 조회 (commInfo + projects)
 *
 * @param {string} servCd - 의뢰 코드
 * @returns {Promise<Object>} { commInfo (overallStatus 포함), projects }
 */
export async function getRecordWorkWorkDetail(servCd) {
  return get(ENDPOINTS.WORK_DETAIL(servCd));
}

/**
 * 작업자 공유 세부사항(STENO_MEMO) 저장
 *
 * @param {string} servCd - 의뢰 코드
 * @param {string} memo - 작업자에게 공유할 세부사항 텍스트
 * @returns {Promise<Object>}
 */
export async function updateStenoMemo(servCd, memo) {
  return put(ENDPOINTS.STENO_MEMO(servCd), { memo });
}

/**
 * 관리자 내부 메모(ADMIN_MEMO) 저장
 *
 * @param {string} servCd - 의뢰 코드
 * @param {string} memo - 관리자 내부 메모 텍스트
 * @returns {Promise<Object>}
 */
export async function updateAdminMemo(servCd, memo) {
  return put(ENDPOINTS.ADMIN_MEMO(servCd), { memo });
}

/**
 * 첨부파일 공유 설정 일괄 변경 (SHARE_YN)
 *
 * @param {string} servCd - 의뢰 코드
 * @param {Array<{fileNo: number, shareYn: string}>} files - 파일별 공유 설정
 * @returns {Promise<Object>}
 */
export async function updateAttachmentShare(servCd, files) {
  return put(ENDPOINTS.ATTACHMENT_SHARE(servCd), { files });
}

export default {
  getRecordWorkRequests,
  getRecordWorkWorks,
  getRecordWorkRequestDetail,
  confirmRecordWorkRequest,
  updateRecordWorkRequestPrice,
  updateRecordWorkFilesPrices,
  getRecordWorkWorkDetail,
  updateStenoMemo,
  updateAdminMemo,
  updateAttachmentShare,
};
