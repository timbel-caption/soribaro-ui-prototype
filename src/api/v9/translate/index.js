import { get } from '../client';

const ENDPOINTS = {
  TRANSLATES: '/v9/api/translate',
  TRANSLATE_DETAIL: (servCd) => `/v9/api/translate/${servCd}`,
  TRANSLATE_REQ_DTL: '/v9/api/translate/req-dtl',
};

/**
 * @template T
 * @typedef {Object} ApiResponse
 * @property {string} status - 응답 상태 (SUCCESS/FAILURE)
 * @property {string} code - 응답 코드
 * @property {T} data - 응답 데이터
 * @property {string} message - 응답 메시지
 * @property {string} timestamp - 응답 시각
 */

/**
 * @typedef {Object} TranslatePageResponse
 * @property {TranslateDto[]} content - 목록 데이터
 * @property {number} totalElements - 전체 건수
 * @property {number} totalPages - 전체 페이지 수
 * @property {number} page - 현재 페이지
 * @property {number} size - 페이지 크기
 * @property {boolean} first - 첫 페이지 여부
 * @property {boolean} last - 마지막 페이지 여부
 */

/**
 * @typedef {Object} TranslateDto
 * @property {string} servCd - 의뢰 코드 (PK)
 * @property {string} servTitle - 의뢰 제목
 * @property {number} durationSec - 총 재생시간(초)
 * @property {number} membNo - 회원 번호
 * @property {string} membNm - 회원명
 * @property {string} membTelNo - 연락처
 * @property {number} workPrice - 작업 금액
 * @property {number} fixPrice - 확정 금액
 * @property {string} workStat - 작업 상태
 * @property {string} videoYn - 영상 여부 (Y/N)
 * @property {string} payTp - 결제 수단 (CARD/BANK 등)
 * @property {string} payStat - 결제 상태 (PAID/WAIT 등)
 * @property {string|null} payApplNum - 결제 승인번호
 * @property {string|null} payDttm - 결제 일시 (yyyyMMddHHmmss)
 * @property {string|null} payTid - 결제 TID
 * @property {string} payerNm - 결제자명
 * @property {number} usePoint - 사용 포인트
 * @property {string|null} compDttm - 완료 일시 (yyyyMMddHHmmss)
 * @property {string} regDttm - 등록 일시 (yyyyMMddHHmmss)
 * @property {string|null} chgDttm - 수정 일시 (yyyyMMddHHmmss)
 * @property {string} cnlYn - 취소 여부 (Y/N)
 * @property {string} delYn - 삭제 여부 (Y/N)
 * @property {string} trnsYn - 번역 여부 (항상 Y)
 * @property {string} ottYn - OTT 여부 (Y/N)
 * @property {string|null} overallStatus - 서비스 종합 상태 (fn_serv_overall_status)
 */

/**
 * @typedef {Object} TranslateReqDtlDto
 * @property {number} reqSeq - 요청 순번
 * @property {number} fileNo - 파일 번호 (File API의 조회 키로 활용)
 * @property {string} fileNm - 파일명 (tb_file JOIN)
 * @property {string} trnsLangCd - 번역 언어 코드 (TRN0024 등)
 * @property {string} trnsLangNm - 번역 언어명 (한글, 영어 등)
 * @property {string} midLangYn - 중간 언어 여부 (Y/N)
 * @property {string} startLangYn - 출발 언어 여부 (Y/N)
 * @property {string} trnsTopLangCd - 출발어 언어 코드
 * @property {string} trnsTopLangNm - 출발어 언어명 (한글)
 * @property {string} workerId - 배정 작업자 ID
 * @property {string} workerNm - 배정 작업자명
 */

/**
 * @typedef {Object} TranslateSearchParams
 * @property {string} [workStat] - 작업 상태 (일치 검색)
 * @property {string} [payStat] - 결제 상태 (일치 검색)
 * @property {string} [cnlYn] - 취소 여부 (Y/N)
 * @property {string} [delYn] - 삭제 여부 (Y/N)
 * @property {string} [videoYn] - 영상 여부 (Y/N)
 * @property {string} [ottYn] - OTT 여부 (Y/N)
 * @property {string} [regDttmFrom] - 등록일 시작 (yyyyMMddHHmmss)
 * @property {string} [regDttmTo] - 등록일 종료 (yyyyMMddHHmmss)
 * @property {string} [compDttmFrom] - 완료일 시작 (yyyyMMddHHmmss)
 * @property {string} [compDttmTo] - 완료일 종료 (yyyyMMddHHmmss)
 * @property {string} [servTitle] - 의뢰 제목 (LIKE 부분검색)
 * @property {string} [membNm] - 의뢰자명 (LIKE 부분검색)
 * @property {string} [membTelNo] - 연락처 (LIKE 부분검색)
 * @property {number} [page=0] - 페이지 번호 (0부터 시작)
 * @property {number} [size=20] - 페이지 크기
 */

/**
 * 번역 의뢰 목록 조회 (페이징)
 * - tb_serv (trns_yn='Y') + tb_memb 조인
 * - reg_dttm DESC 정렬
 *
 * @param {TranslateSearchParams} [params={}] - 검색 필터 + 페이징 파라미터
 * @returns {Promise<ApiResponse<TranslatePageResponse>>}
 */
export async function getTranslates(params = {}) {
  const { page = 0, size = 20, ...rest } = params;
  return get(ENDPOINTS.TRANSLATES, { ...rest, page, size });
}

/**
 * 번역 요청 상세 목록 조회
 * - tb_trns_req_dtl (del_yn != 'Y')
 * - req_seq 오름차순 정렬
 * - 페이지네이션 없이 전체 목록 반환
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @returns {Promise<ApiResponse<TranslateReqDtlDto[]>>} 번역 요청 상세 목록
 */
export async function getTranslateReqDtl(servCd) {
  if (!servCd) {
    throw new Error('의뢰 코드(servCd)는 필수입니다.');
  }
  return get(ENDPOINTS.TRANSLATE_REQ_DTL, { servCd });
}

/**
 * 번역 작업 상세 조회
 * - servInfo, files (+ timeSegments), attachments, speakers 포함
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @returns {Promise<ApiResponse<{servInfo: Object, files: Object[], attachments: Object[], speakers: Object[]}>>}
 */
export async function getTranslateDetail(servCd) {
  if (!servCd) {
    throw new Error('의뢰 코드(servCd)는 필수입니다.');
  }
  return get(ENDPOINTS.TRANSLATE_DETAIL(servCd));
}

export default { getTranslates, getTranslateReqDtl, getTranslateDetail };
