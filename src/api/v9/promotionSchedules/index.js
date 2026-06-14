/**
 * Promotion Schedule API (V9 경로)
 * 프로모션 스케줄 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  SCHEDULES: '/v9/api/promotion-schedules',
  SCHEDULE_BY_ID: (id) => `/v9/api/promotion-schedules/${id}`,
  CANCEL: (id) => `/v9/api/promotion-schedules/${id}/cancel`,
  SEARCH: '/v9/api/promotion-schedules/search',
  APPLY: (id) => `/v9/api/promotion-schedules/${id}/apply`,
  ROLLBACK: (id) => `/v9/api/promotion-schedules/${id}/rollback`,
  WORKER_STATISTICS: '/v9/api/promotion-schedules/worker-statistics',
  WORKER_MONTHLY_DETAILS: '/v9/api/promotion-schedules/worker-monthly-details',
  AUTO_APPLY: '/v9/api/promotion-schedules/auto-apply',
};

/**
 * @typedef {Object} PromotionSchedule
 * @property {string} id - 스케줄 ID (UUID)
 * @property {string} workerId - 작업자 ID
 * @property {string} status - 상태 (STANDBY | CANCELED | DONE | ERROR)
 * @property {number} fromLevel - 현재 레벨
 * @property {string|null} fromLevelName - 현재 레벨명
 * @property {number} toLevel - 변경 레벨
 * @property {string|null} toLevelName - 변경 레벨명
 * @property {boolean} isPromote - 승급 여부
 * @property {string} description - 설명
 * @property {string} createdBy - 등록자 ID
 * @property {string} effectedAt - 적용일 (yyyy-MM-dd)
 * @property {string} effectiveTarget - 적용 대상 날짜 (예: 2026-03)
 * @property {string} createdAt - 등록일
 * @property {string} updatedAt - 수정일
 */

/**
 * @typedef {Object} PromotionScheduleInput
 * @property {string} workerId - 작업자 ID (필수)
 * @property {number} fromLevel - 현재 레벨 (필수)
 * @property {number} toLevel - 변경 레벨 (필수)
 * @property {string} createdBy - 등록자 ID (필수)
 * @property {string} effectedAt - 적용일 (yyyy-MM-dd, 필수)
 * @property {string} effectiveTarget - 적용 대상 날짜 (예: 2026-03, 필수)
 * @property {boolean} [isPromote=true] - 승급 여부
 * @property {string} [description] - 설명
 */

/**
 * @typedef {Object} PromotionScheduleSearchParams
 * @property {string} [createdAtFrom] - 등록일 시작 (yyyy-MM-dd)
 * @property {string} [createdAtTo] - 등록일 종료 (yyyy-MM-dd)
 * @property {string} [workerId] - 작업자 ID
 * @property {string} [createdBy] - 등록자 ID
 * @property {string} [status] - 상태 (STANDBY | CANCELED | DONE | ERROR)
 * @property {string} [effectedAt] - 적용일 (yyyy-MM-dd)
 * @property {string} [effectiveTarget] - 적용 대상 월 (YYYY-MM)
 * @property {boolean} [isPromote] - 승급 여부 (true=승급, false=강등)
 */

/**
 * @typedef {Object} PromotionScheduleSearchItem
 * @property {string} id - 스케줄 ID (UUID)
 * @property {string} workerId - 작업자 ID
 * @property {string} status - 상태 (STANDBY | CANCELED | DONE | ERROR)
 * @property {number} fromLevel - 현재 레벨
 * @property {string} fromLevelName - 현재 레벨명
 * @property {number} toLevel - 변경 레벨
 * @property {string} toLevelName - 변경 레벨명
 * @property {boolean} isPromote - 승급 여부
 * @property {string} description - 설명
 * @property {string} createdBy - 등록자 ID
 * @property {string} effectedAt - 적용일
 * @property {string} effectiveTarget - 적용 대상 날짜
 * @property {string} createdAt - 등록일
 * @property {string} updatedAt - 수정일
 */

/**
 * @typedef {Object} WorkerStatisticsParams
 * @property {string} startDate - 작업 시작일 (yyyy-MM-dd, 필수)
 * @property {string} endDate - 작업 종료일 (yyyy-MM-dd, 필수)
 */

/**
 * @typedef {Object} WorkerStatisticsItem
 * @property {string} workerId - 작업자 ID
 * @property {string} workerName - 작업자 이름
 * @property {number} workCount - 작업 건수
 * @property {number} accuracyAvg - 정확도 평균
 * @property {number} errorCountAvg - 오류 수 평균
 * @property {string} workerLevel - 작업자 레벨 ID 목록(콤마 구분)
 * @property {string} workerLevelName - 작업자 레벨명 목록(콤마 구분)
 */

/**
 * 프로모션 스케줄 등록
 * - ID는 UUID v4로 자동 생성
 * - 상태는 STANDBY로 자동 설정
 * - 동일 workerId + effectiveTarget 조합이 존재하면 자동 삭제 후 재생성
 *
 * @param {PromotionScheduleInput} data
 * @returns {Promise<ApiResponse<PromotionSchedule>>}
 */
export async function createPromotionSchedule(data) {
  return post(ENDPOINTS.SCHEDULES, data);
}

/**
 * 프로모션 스케줄 취소 (STANDBY → CANCELED)
 * - STANDBY 상태인 스케줄만 취소 가능
 *
 * @param {string} id - 스케줄 ID (UUID)
 * @returns {Promise<ApiResponse<PromotionSchedule>>}
 */
export async function cancelPromotionSchedule(id) {
  return put(ENDPOINTS.CANCEL(id));
}

/**
 * 프로모션 스케줄 삭제 (물리 삭제)
 *
 * @param {string} id - 스케줄 ID (UUID)
 * @returns {Promise<ApiResponse<null>>}
 */
export async function deletePromotionSchedule(id) {
  return del(ENDPOINTS.SCHEDULE_BY_ID(id));
}

/**
 * 프로모션 스케줄 목록 검색 (전체 목록)
 * - 모든 파라미터는 선택사항
 *
 * @param {PromotionScheduleSearchParams} params
 * @returns {Promise<ApiResponse<PromotionScheduleSearchItem[]>>}
 */
export async function searchPromotionSchedules(params = {}) {
  return get(ENDPOINTS.SEARCH, params);
}

/**
 * 작업자 통계 조회 (전체 목록)
 * - 작업 기간 범위로 작업자별 통계 집계
 *
 * @param {WorkerStatisticsParams} params
 * @returns {Promise<ApiResponse<WorkerStatisticsItem[]>>}
 */
export async function getWorkerStatistics(params) {
  return get(ENDPOINTS.WORKER_STATISTICS, params);
}

/**
 * 작업자 월별 작업 상세 조회
 * @param {{ workerId: string, startDate: string, endDate: string, bssType?: string }} params
 * @returns {Promise<ApiResponse<Object[]>>}
 */
export async function getWorkerMonthlyDetails(params) {
  return get(ENDPOINTS.WORKER_MONTHLY_DETAILS, params);
}

/**
 * 수동 등급 조정 (STANDBY → DONE)
 * - 작업자의 등급을 toLevel로 변경하고 스케줄 상태를 DONE으로 변경
 * - STANDBY 상태인 스케줄만 적용 가능
 *
 * @param {string} id - 스케줄 ID (UUID)
 * @returns {Promise<ApiResponse<PromotionSchedule>>}
 */
export async function applyPromotionSchedule(id) {
  return put(ENDPOINTS.APPLY(id));
}

/**
 * 등급 롤백 (DONE → STANDBY)
 * - 작업자의 등급을 적용 전(fromLevel)으로 되돌리고 스케줄 상태를 STANDBY로 변경
 * - DONE 상태인 스케줄만 롤백 가능
 * - 작업자의 현재 등급이 적용된 등급(toLevel)과 일치할 때만 허용
 *
 * @param {string} id - 스케줄 ID (UUID)
 * @returns {Promise<ApiResponse<PromotionSchedule>>}
 */
export async function rollbackPromotionSchedule(id) {
  return put(ENDPOINTS.ROLLBACK(id));
}

/**
 * @typedef {Object} AutoApplyParams
 * @property {string} [effectiveTarget] - 적용 대상 월 (yyyy-MM, 미입력 시 현재 연월)
 */

/**
 * @typedef {Object} AutoApplyDetail
 * @property {string} id - 스케줄 ID
 * @property {string} workerId - 작업자 ID
 * @property {number} toLevel - 변경 레벨
 * @property {string} status - 결과 상태 (DONE | ERROR)
 * @property {string} [reason] - 실패 사유
 */

/**
 * @typedef {Object} AutoApplyResult
 * @property {string} effectiveTarget - 적용 대상 월
 * @property {number} totalCount - 총 처리 건수
 * @property {number} successCount - 성공 건수
 * @property {number} failureCount - 실패 건수
 * @property {AutoApplyDetail[]} details - 처리 상세
 */

/**
 * 자동 등급 심사 수동 실행
 * - STANDBY/ERROR 상태인 프로모션 스케줄을 일괄 적용
 * - effectiveTarget 미입력 시 현재 연월이 기본값
 *
 * @param {AutoApplyParams} [params={}]
 * @returns {Promise<ApiResponse<AutoApplyResult>>}
 */
export async function autoApplyPromotionSchedules(params = {}) {
  const query = params.effectiveTarget ? `?effectiveTarget=${params.effectiveTarget}` : '';
  return post(`${ENDPOINTS.AUTO_APPLY}${query}`);
}

export default {
  createPromotionSchedule,
  cancelPromotionSchedule,
  deletePromotionSchedule,
  searchPromotionSchedules,
  getWorkerStatistics,
  getWorkerMonthlyDetails,
  applyPromotionSchedule,
  rollbackPromotionSchedule,
  autoApplyPromotionSchedules,
};
