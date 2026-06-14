/**
 * Notice API (V8)
 * 공지사항 관리 API (CRUD + 사용여부 변경)
 *
 * 기본 경로: /v8/api/notice
 */
import { get, post, put, del, patch } from '../client';

const ENDPOINTS = {
  LIST: '/v8/api/notice/list',
  BASE: '/v8/api/notice',
  DETAIL: (notiNo) => `/v8/api/notice/${notiNo}`,
  USE_YN: (notiNo) => `/v8/api/notice/${notiNo}/use-yn`,
};

/**
 * @typedef {Object} V8NoticeFileDto
 * @property {number} boardFileNo - 첨부파일 번호
 * @property {number} notiNo - 공지사항 번호
 * @property {string} boardFileNm - 저장 파일명
 * @property {string} boardFileOriNm - 원본 파일명
 * @property {string} boardFilePath - 파일 경로
 * @property {number} boardFileSize - 파일 크기 (bytes)
 * @property {string} boardFileExt - 파일 확장자
 */

/**
 * @typedef {Object} V8NoticeDto
 * @property {number} notiNo - 공지사항 번호
 * @property {string} notiSubj - 제목
 * @property {string} notiCont - 내용 (HTML)
 * @property {string} notiTp - 공지사항 유형 코드 (그룹코드: NOTI_TP)
 * @property {string|null} notiTpNm - 공지사항 유형명
 * @property {string} lang - 언어 (kr/en)
 * @property {string} notiMembTp - 회원 구분 코드 (그룹코드: MEMB_TP)
 * @property {string|null} notiMembTpNm - 회원 구분명
 * @property {string} notiUpYn - 상단 고정 여부 (Y/N)
 * @property {string} popupYn - 팝업 여부 (Y/N)
 * @property {string|null} popupStDt - 팝업 시작일자
 * @property {string|null} popupEdDt - 팝업 종료일자
 * @property {number|null} viewCnt - 조회수
 * @property {string} delYn - 삭제 여부 (Y/N)
 * @property {string|null} regr - 등록자
 * @property {string|null} regDttm - 등록일시
 * @property {string|null} chgr - 수정자
 * @property {string|null} chgDttm - 수정일시
 * @property {V8NoticeFileDto[]|null} files - 첨부파일 목록
 */

/**
 * @typedef {Object} V8PageResponse
 * @property {number} page - 현재 페이지 (0-based)
 * @property {number} size - 페이지 크기
 * @property {number} totalElements - 전체 데이터 수
 * @property {number} totalPages - 전체 페이지 수
 * @property {boolean} first - 첫 페이지 여부
 * @property {boolean} last - 마지막 페이지 여부
 * @property {V8NoticeDto[]} content - 데이터 목록
 */

/**
 * @typedef {Object} V8ApiResponse
 * @property {string} status - 상태 (SUCCESS | FAILURE | ERROR)
 * @property {string} code - 상태 코드
 * @property {*} data - 응답 데이터
 * @property {string} message - 메시지
 * @property {string} timestamp - 타임스탬프
 */

/**
 * @typedef {Object} NoticeListParams
 * @property {number} [pageNo=1] - 페이지 번호 (1부터 시작)
 * @property {number} [recordCountPerPage=10] - 페이지당 레코드 수
 * @property {string} [searchTxt] - 검색어 (제목 검색)
 * @property {string} [notiTp] - 공지사항 유형 코드
 * @property {string} [lang] - 언어 (kr/en)
 * @property {string} [notiMembTp] - 회원 구분 코드
 * @property {string} [notiUpYn] - 상단 고정 여부 (Y/N)
 */

/**
 * @typedef {Object} NoticeCreateRequest
 * @property {string} notiSubj - 공지사항 제목 (필수)
 * @property {string} notiCont - 공지사항 내용, HTML 가능 (필수)
 * @property {string} [notiTp] - 공지사항 유형 코드
 * @property {string} [lang] - 언어 (kr/en)
 * @property {string} [notiMembTp] - 회원 구분 코드
 * @property {string} [notiUpYn='N'] - 상단 고정 여부
 * @property {string} [popupYn='N'] - 팝업 여부
 * @property {string|null} [popupStDt] - 팝업 시작일자 (popupYn=Y인 경우)
 * @property {string|null} [popupEdDt] - 팝업 종료일자 (popupYn=Y인 경우)
 */

/**
 * 공지사항 목록 조회 (페이징)
 * @param {NoticeListParams} [params={}] - 조회 파라미터
 * @returns {Promise<V8ApiResponse & { data: V8PageResponse }>}
 */
export async function getNoticeList(params = {}) {
  return get(ENDPOINTS.LIST, params);
}

/**
 * 공지사항 상세 조회
 * @param {number|string} notiNo - 공지사항 번호
 * @returns {Promise<V8ApiResponse & { data: V8NoticeDto }>}
 */
export async function getNoticeDetail(notiNo) {
  if (!notiNo) {
    throw new Error('notiNo is required');
  }
  return get(ENDPOINTS.DETAIL(notiNo));
}

/**
 * 공지사항 등록
 * @param {NoticeCreateRequest} data - 등록 데이터
 * @returns {Promise<V8ApiResponse & { data: V8NoticeDto }>}
 */
export async function createNotice(data) {
  return post(ENDPOINTS.BASE, data);
}

/**
 * 공지사항 수정
 * @param {number|string} notiNo - 공지사항 번호
 * @param {Partial<NoticeCreateRequest>} data - 수정 데이터
 * @returns {Promise<V8ApiResponse & { data: V8NoticeDto }>}
 */
export async function updateNotice(notiNo, data) {
  if (!notiNo) {
    throw new Error('notiNo is required');
  }
  return put(ENDPOINTS.DETAIL(notiNo), data);
}

/**
 * 공지사항 삭제 (소프트 삭제)
 * @param {number|string} notiNo - 공지사항 번호
 * @returns {Promise<V8ApiResponse>}
 */
export async function deleteNotice(notiNo) {
  if (!notiNo) {
    throw new Error('notiNo is required');
  }
  return del(ENDPOINTS.DETAIL(notiNo));
}

/**
 * 공지사항 사용여부 변경
 * @param {number|string} notiNo - 공지사항 번호
 * @param {string} useYn - 사용 여부 (Y: 사용/노출, N: 미사용/숨김)
 * @returns {Promise<V8ApiResponse>}
 */
export async function updateNoticeUseYn(notiNo, useYn) {
  if (!notiNo) {
    throw new Error('notiNo is required');
  }
  return patch(ENDPOINTS.USE_YN(notiNo), { useYn });
}

export default {
  getNoticeList,
  getNoticeDetail,
  createNotice,
  updateNotice,
  deleteNotice,
  updateNoticeUseYn,
};
