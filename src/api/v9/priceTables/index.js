/**
 * Price Tables API (V9)
 * 단가표 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  PRICE_TABLES: '/v9/api/price-tables',
  PRICE_TABLE_BY_ID: (id) => `/v9/api/price-tables/${id}`,
};

/** 단가표 목록 조회 */
export async function getPriceTables() {
  return get(ENDPOINTS.PRICE_TABLES);
}

/** 단가표 상세 조회 */
export async function getPriceTable(id) {
  return get(ENDPOINTS.PRICE_TABLE_BY_ID(id));
}

/**
 * 단가표 등록
 * @param {Object} data
 * @param {string} data.name - 단가표명
 * @param {string} [data.description] - 설명
 * @param {string} data.bssType - 의뢰 유형 코드
 */
export async function createPriceTable(data) {
  return post(ENDPOINTS.PRICE_TABLES, data);
}

/**
 * 단가표 수정
 * @param {number|string} id
 * @param {Object} data
 * @param {string} data.name - 단가표명
 * @param {string} [data.description] - 설명
 * @param {string} data.bssType - 의뢰 유형 코드
 */
export async function updatePriceTable(id, data) {
  return put(ENDPOINTS.PRICE_TABLE_BY_ID(id), data);
}

/**
 * 단가표 삭제
 * @param {number|string} id
 * @param {boolean} [force=false] - true면 참조 해제 후 강제 삭제
 */
export async function deletePriceTable(id, force = false) {
  const url = force ? `${ENDPOINTS.PRICE_TABLE_BY_ID(id)}?force=true` : ENDPOINTS.PRICE_TABLE_BY_ID(id);
  return del(url);
}

export default {
  getPriceTables,
  getPriceTable,
  createPriceTable,
  updatePriceTable,
  deletePriceTable,
};
