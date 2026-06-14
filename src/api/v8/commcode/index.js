/**
 * CommCode API (V8)
 * 공통코드 관리 API (그룹코드/상세코드 CRUD)
 *
 * 기본 경로: /v8/api/commcode
 */
import { get, post, del } from '../client';

const ENDPOINTS = {
  GROUP_LIST: '/v8/api/commcode/group/list',
  GROUP: '/v8/api/commcode/group',
  GROUP_BY_CD: (grpCd) => `/v8/api/commcode/group/${grpCd}`,
  DETAIL_BY_GRP: (grpCd) => `/v8/api/commcode/detail/${grpCd}`,
  DETAIL: '/v8/api/commcode/detail',
  DETAIL_BY_CD: (grpCd, dtlCd) => `/v8/api/commcode/detail/${grpCd}/${dtlCd}`,
};

/**
 * 상세코드 목록 조회
 * @param {string} grpCd - 그룹코드
 * @returns {Promise<Object>} 상세코드 목록
 */
export async function getCodeDetails(grpCd) {
  return get(ENDPOINTS.DETAIL_BY_GRP(grpCd));
}

/**
 * 상세코드 등록/수정 (Upsert)
 * @param {Object} data
 * @param {string} data.grpCd - 그룹코드
 * @param {string} data.dtlCd - 상세코드
 * @param {string} data.dtlCdNm - 상세코드명
 * @param {string} [data.dtlDesc] - 상세코드 설명
 * @param {string} [data.useYn='Y'] - 사용여부
 * @param {number} [data.ordNo] - 정렬순서
 * @returns {Promise<Object>}
 */
export async function upsertCodeDetail(data) {
  return post(ENDPOINTS.DETAIL, data);
}

/**
 * 상세코드 삭제
 * @param {string} grpCd - 그룹코드
 * @param {string} dtlCd - 상세코드
 * @returns {Promise<Object>}
 */
export async function deleteCodeDetail(grpCd, dtlCd) {
  return del(ENDPOINTS.DETAIL_BY_CD(grpCd, dtlCd));
}

export default {
  getCodeDetails,
  upsertCodeDetail,
  deleteCodeDetail,
};
