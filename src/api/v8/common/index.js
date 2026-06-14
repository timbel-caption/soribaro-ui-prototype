/**
 * Common Code API (V8 경로)
 * 공통코드 단순 조회 API
 */
import { get } from '../client';

const ENDPOINTS = {
  COMMON_CODE: '/v8/api/common/code',
};

/**
 * @typedef {Object} CommonCodeItem
 * @property {string} grpCd - 그룹코드
 * @property {string} dtlCd - 상세코드 (실제 코드값)
 * @property {string} dtlCdNm - 상세코드명 (화면 표시용)
 * @property {string} dtlNm - 상세코드명 (별칭)
 * @property {string|null} dtlDesc - 상세코드 설명
 * @property {string|null} dtlValue1 - 확장 값1
 * @property {string|null} dtlValue2 - 확장 값2
 * @property {string|null} dtlValue3 - 확장 값3
 * @property {string|null} dtlValue4 - 확장 값4
 * @property {string|null} dtlValue5 - 확장 값5
 * @property {string|null} dtlValueDesc5 - 확장 값5 설명
 * @property {number} ordNo - 정렬순서
 * @property {string} useYn - 사용여부
 * @property {string} regr - 등록자
 * @property {string} regDttm - 등록일시
 * @property {string|null} chgr - 수정자
 * @property {string|null} chgDttm - 수정일시
 */

/**
 * @typedef {Object} ApiResponse
 * @property {string} status - 상태 (SUCCESS | FAILURE | ERROR)
 * @property {string} code - 상태 코드
 * @property {*} data - 응답 데이터
 * @property {string} message - 메시지
 * @property {string} timestamp - 타임스탬프
 */

/**
 * 공통코드 단순 조회
 * @param {string} grpCd - 그룹코드 (예: 'SERV_TP', 'WORK_STAT')
 * @returns {Promise<ApiResponse & { data: CommonCodeItem[] }>}
 */
export async function getCommonCode(grpCd) {
  if (!grpCd) {
    throw new Error('grpCd is required');
  }
  return get(`${ENDPOINTS.COMMON_CODE}/${grpCd}`);
}

export default { getCommonCode };
