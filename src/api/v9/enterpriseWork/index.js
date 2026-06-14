/**
 * Enterprise Work API (V9)
 * 엔터프라이즈 작업관리 API (servTp='3')
 *
 * 기본 경로: /v9/api/enterprise-work
 */
import { get } from '../client';

const ENDPOINTS = {
  LIST: '/v9/api/enterprise-work',
  DETAIL: (servCd) => `/v9/api/enterprise-work/${servCd}`,
};

/**
 * @typedef {Object} EnterpriseWorkListItem
 * @property {string} servCd - 서비스 코드
 * @property {string} servTitle - 서비스 제목
 * @property {string} servTitleCut - 서비스 제목 (말줄임)
 * @property {string} workStat - 작업 상태 코드
 * @property {string} workStatNm - 작업 상태명
 * @property {string} fileSplitStat - 파일 분할 상태
 * @property {string} cnlYn - 취소 여부 (Y/N)
 * @property {string} membNm - 의뢰자명
 * @property {string} mblTelNo - 연락처
 * @property {string} entNm - 업체명
 * @property {string} regDttm - 등록 일시
 * @property {string} worker - 작업자 (상태 포함)
 * @property {string} workerArr - 작업자 목록 (상태 포함)
 * @property {string} totalPlayTm - 총 재생시간 (HH:mm:ss)
 * @property {number} sttIngCnt - STT 진행중 건수
 * @property {number} sttFailCnt - STT 실패 건수
 * @property {number} sttSuccCnt - STT 성공 건수
 * @property {number} distFileCnt - 배분 파일 건수
 * @property {number} workCompCnt - 작업 완료 건수
 * @property {string} videoYn - 영상 여부 (Y/N)
 * @property {string|null} overallStatus - 서비스 종합 상태 (fn_serv_overall_status)
 */

/**
 * @typedef {Object} EnterpriseWorkDetailCommInfo
 * @property {string} servCd - 서비스 코드
 * @property {string} servTitle - 서비스 제목
 * @property {string} workStat - 작업 상태 코드
 * @property {string} fileSplitStat - 파일 분할 상태
 * @property {string} videoYn - 영상 여부 (Y/N)
 * @property {string} ottYn - OTT 여부 (Y/N)
 * @property {string} stenoMemo - 속기사 메모
 * @property {string} adminMemo - 관리자 메모
 * @property {string} remark - 비고
 * @property {number} reqMembNo - 의뢰자 회원번호
 * @property {string} reqMembNm - 의뢰자명
 * @property {string} finalRstFileNo - 최종 결과 파일 번호
 * @property {number} distFileCnt - 배분 파일 건수
 * @property {number} workCompCnt - 작업 완료 건수
 * @property {number} workInspCnt - 검수 완료 건수
 * @property {number} prtFileNo - 원본 파일 번호
 * @property {string|null} overallStatus - 서비스 종합 상태 (fn_serv_overall_status)
 */

/**
 * @typedef {Object} EnterpriseWorkFileItem
 * @property {string} servCd - 서비스 코드
 * @property {number} number - 순번
 * @property {string} priLev - 우선순위
 * @property {number} fileNo - 파일 번호
 * @property {string} fileNm - 파일명
 * @property {string} playTm - 재생시간 (HH:mm:ss)
 * @property {number} workerCount - 작업자 수
 * @property {string} workerNm - 작업자명 (콤마 구분)
 * @property {string} workStat - 작업 상태 코드
 * @property {string} status - 파일 상태 (inprogress, complete 등)
 */

/**
 * @typedef {Object} EnterpriseWorkManagementItem
 * @property {string} servCd - 서비스 코드
 * @property {number} number - 순번
 * @property {number} fileNo - 원본 파일 번호
 * @property {number} workFileNo - 작업 파일 번호
 * @property {string} fileNm - 파일명
 * @property {string} playTm - 재생시간 (HH:mm:ss)
 * @property {string} splitTimeSt - 분할 시작 시간 (HH:mm:ss)
 * @property {string} splitTimeEd - 분할 종료 시간 (HH:mm:ss)
 * @property {number} membNo - 작업자 회원번호
 * @property {string} membNm - 작업자명
 * @property {string} workStat - 작업 상태 코드
 * @property {number} distNo - 배분 번호
 * @property {number} splitSeq - 분할 순번
 * @property {string} status - 작업 상태 (inprogress, complete 등)
 */

/**
 * 엔터프라이즈 작업 목록 조회 (페이징)
 *
 * @param {Object} params
 * @param {string} [params.startDate] - 시작일 (YYYY-MM-DD)
 * @param {string} [params.endDate] - 종료일 (YYYY-MM-DD)
 * @param {number} [params.page=1] - 페이지 번호
 * @param {number} [params.size=20] - 페이지 크기
 * @param {string} [params.searchType] - 검색 타입 (servCd, title, memberName, phone, workerName)
 * @param {string} [params.searchText] - 검색어
 * @param {string} [params.workStat] - 작업 상태 필터
 * @param {string} [params.company] - 업체 번호 필터
 * @param {string} [params.videoYn] - 영상 여부 (Y/N)
 * @returns {Promise<Object>} V8PageResponse<EnterpriseWorkListItem>
 */
export async function getEnterpriseWorkList(params) {
  return get(ENDPOINTS.LIST, params);
}

/**
 * 엔터프라이즈 작업 상세 조회
 *
 * @param {string} servCd - 의뢰 코드
 * @returns {Promise<Object>} { commInfo: EnterpriseWorkDetailCommInfo, fileList: EnterpriseWorkFileItem[], workManagementList: EnterpriseWorkManagementItem[] }
 */
export async function getEnterpriseWorkDetail(servCd) {
  return get(ENDPOINTS.DETAIL(servCd));
}

export default { getEnterpriseWorkList, getEnterpriseWorkDetail };
