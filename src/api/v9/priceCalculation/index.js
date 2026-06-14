/**
 * Price Calculation API (V9 경로)
 * 분당 단가 계산 API
 *
 * 계산 공식: 분당 단가 = 기업단가(entPrice) + 작업자 단가(workerPrice)
 *
 * 조회 흐름:
 * 1. 기업단가: servCd → tb_serv.memb_no → tb_memb.ent_no → tb_ent.ent_price
 * 2. 작업자 단가: fileNo → file_difficult_id, workerId → worker_level_id → price_table_id → price_items.price
 */
import { get } from '../client';

// 엔드포인트
const ENDPOINTS = {
  PRICE_CALCULATION: '/v9/api/price-calculation',
};

/**
 * @typedef {Object} PriceCalculationResult
 * @property {number} pricePerMinute - 분당 단가 (기업단가 + 작업자 단가)
 * @property {number} entPrice - 기업단가
 * @property {number} workerPrice - 작업자 단가
 * @property {string} entNm - 기업명
 * @property {number} fileNo - 파일 번호
 * @property {number} fileDifficultId - 파일 난이도 ID
 * @property {string} fileDifficultName - 파일 난이도명
 * @property {number} workerLevelId - 작업자 등급 ID
 * @property {string} workerLevelName - 작업자 등급명
 * @property {number} priceTableId - 단가표 ID
 * @property {string} bssType - 의뢰 유형
 */

/**
 * @typedef {Object} ApiResponse
 * @property {string} status - 상태 (SUCCESS | FAILURE)
 * @property {string} code - 상태 코드
 * @property {*} data - 응답 데이터
 * @property {string} message - 메시지
 */

/**
 * 분당 단가 계산
 *
 * @param {Object} params - 계산 조건 (모두 필수)
 * @param {number|string} params.fileNo - 파일 번호 (난이도 조회)
 * @param {string} params.servCd - 의뢰 코드 (기업단가 조회)
 * @param {string} params.bssType - 의뢰 유형 (BSS_TYPE, member_worker_levels 등급 매칭용)
 * @param {string} params.workerId - 작업자 회원 ID (membId, 이메일)
 * @returns {Promise<ApiResponse<PriceCalculationResult>>} 분당 단가 계산 결과
 */
export async function calculatePrice(params) {
  return get(ENDPOINTS.PRICE_CALCULATION, params);
}

export default {
  calculatePrice,
};
