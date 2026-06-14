import { get, patch } from '../client';

const ENDPOINTS = {
  SERV: '/v9/api/serv',
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
 * @typedef {Object} ServDto
 * @property {string} servCd - 서비스 코드 (PK)
 * @property {string} servTitle - 서비스 제목
 * @property {number} durationSec - 총 재생시간(초) (tb_serv_dtl + tb_file SUM)
 * @property {number} membNo - 회원 번호 (FK)
 * @property {string} membNm - 회원명 (tb_memb 서브쿼리)
 * @property {string|null} entNm - 업체명 (tb_memb.ent_no → tb_ent.ent_nm 서브쿼리)
 * @property {string|null} bssType - 의뢰 유형 코드 (tb_memb.ent_no → tb_ent.bss_type 서브쿼리)
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
 * @property {string} trnsYn - 번역 여부 (Y/N)
 * @property {string} ottYn - OTT 여부 (Y/N)
 * @property {string|null} overallStatus - 서비스 종합 상태 (fn_serv_overall_status, DB 함수)
 * @property {string|null} remark - 의뢰자 세부요청사항 (TB_SERV_DTL.REMARK, 첫 번째 파일)
 * @property {string|null} stenoMemo - 작업자 공유 세부사항 (TB_SERV.STENO_MEMO, 관리자 작성/작업자 노출)
 * @property {string|null} adminMemo - 관리자 내부 메모 (TB_SERV.ADMIN_MEMO, 관리자만 열람)
 */

/**
 * @typedef {Object} ServProjectFileDto
 * @property {string} title - 프로젝트명 (projects.title)
 * @property {string} type - 프로젝트 유형 (projects.type)
 * @property {string} fileNm - 파일명 (tb_file.FILE_NM)
 * @property {string|null} workerId - 작업자 ID (project_files.worker_id)
 * @property {string|null} checkerId - 검수자 ID (project_files.checker_id)
 * @property {string} status - 작업 상태 (STANDBY/WORKING/WORK_DONE/REVIEWING/REVIEW_REJECT/REVIEW_DONE/DONE)
 */

/**
 * 서비스 단건 조회
 * - 서비스 코드(servCd)로 서비스 정보를 단건 조회
 * - tb_serv 기본 정보 + 재생시간 합산 (tb_serv_dtl + tb_file) + 회원명 (tb_memb 서브쿼리)
 *
 * 연계 흐름:
 *  1. 번역 서비스 목록 조회 (GET /v9/api/translate) -> servCd 획득
 *  2. 이 API로 서비스 상세 정보 조회
 *  3. 번역 요청 상세 조회 (GET /v9/api/translate/req-dtl?servCd=xxx)
 *  4. 파일 목록 조회 (GET /v9/api/file?servCd=xxx)
 *
 * @param {string} servCd - 서비스 코드 (필수, tb_serv.serv_cd)
 * @returns {Promise<ApiResponse<ServDto>>} 서비스 상세 정보
 */
export async function getServByServCd(servCd) {
  if (!servCd) {
    throw new Error('서비스 코드(servCd)는 필수입니다.');
  }
  return get(`${ENDPOINTS.SERV}/${servCd}`);
}

/**
 * 서비스 작업 상태 변경
 * - tb_serv.work_stat 업데이트
 *
 * @param {string} servCd - 서비스 코드 (필수)
 * @param {string} workStat - 변경할 작업 상태 코드 (필수)
 * @returns {Promise<ApiResponse<null>>}
 */
export async function updateServWorkStat(servCd, workStat) {
  if (!servCd) {
    throw new Error('서비스 코드(servCd)는 필수입니다.');
  }
  if (!workStat) {
    throw new Error('작업 상태(workStat)는 필수입니다.');
  }

  return patch(`${ENDPOINTS.SERV}/${servCd}/work-stat`, { workStat });
}

/**
 * 서비스 프로젝트 파일 목록 조회
 * - 서비스 코드(servCd)에 해당하는 프로젝트 파일 목록을 조회
 * - projects + project_files + tb_file JOIN
 * - 페이지네이션 없이 전체 목록 반환
 *
 * @param {string} servCd - 서비스 코드 (필수, tb_serv.serv_cd)
 * @returns {Promise<ApiResponse<ServProjectFileDto[]>>} 프로젝트 파일 목록
 */
export async function getServProjectFiles(servCd) {
  if (!servCd) {
    throw new Error('서비스 코드(servCd)는 필수입니다.');
  }
  return get(`${ENDPOINTS.SERV}/${servCd}/project-files`);
}

/**
 * 서비스 작업 취소
 * - tb_serv_dtl.cnl_yn = 'Y' (해당 파일) + tb_serv.cnl_yn = 'Y' (해당 서비스)
 * - 트랜잭션으로 원자적 처리
 *
 * @param {string} servCd - 서비스 코드 (필수)
 * @param {string|number} fileNo - 파일 번호 (필수, tb_serv_dtl.file_no)
 * @returns {Promise<ApiResponse<null>>}
 */
export async function cancelServ(servCd, fileNo) {
  if (!servCd) {
    throw new Error('서비스 코드(servCd)는 필수입니다.');
  }
  if (!fileNo) {
    throw new Error('파일 번호(fileNo)는 필수입니다.');
  }
  return patch(`${ENDPOINTS.SERV}/${servCd}/cancel`, { fileNo: String(fileNo) });
}

/**
 * 서비스 의뢰 유형 코드(BSS_TYPE) 변경 (ADMIN 전용)
 * - 파일 난이도/단가 기준을 해당 BSS_TYPE 세트로 전환
 * - 녹취록처럼 업체 미연결 의뢰도 관리자가 명시 지정 가능
 *
 * @param {string} servCd - 서비스 코드 (필수)
 * @param {string} bssType - TB_CD_GRP_DTL 의 GRP_CD='BSS_TYPE' 하위 코드
 * @returns {Promise<ApiResponse<ServDto>>}
 */
export async function updateServBssType(servCd, bssType) {
  if (!servCd) {
    throw new Error('서비스 코드(servCd)는 필수입니다.');
  }
  if (!bssType) {
    throw new Error('의뢰 유형 코드(bssType)는 필수입니다.');
  }
  return patch(`${ENDPOINTS.SERV}/${servCd}/bss-type`, { bssType });
}

export default {
  getServByServCd,
  updateServWorkStat,
  getServProjectFiles,
  cancelServ,
  updateServBssType,
};
