/**
 * Price Items API (V9)
 * 단가 항목 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  PRICE_ITEMS: '/v9/api/price-items',
  PRICE_ITEM_BY_ID: (id) => `/v9/api/price-items/${id}`,
};

/**
 * 단가 항목 목록 조회 (단가표별)
 * @param {Object} params
 * @param {number} params.priceTableId - 단가표 ID (필수)
 */
export async function getPriceItems(params = {}) {
  return get(ENDPOINTS.PRICE_ITEMS, params);
}

/** 단가 항목 상세 조회 */
export async function getPriceItem(id) {
  return get(ENDPOINTS.PRICE_ITEM_BY_ID(id));
}

/**
 * 단가 항목 등록
 * @param {Object} data
 * @param {number} data.priceTableId - 단가표 ID
 * @param {number} data.fileDifficultId - 난이도 코드 ID
 * @param {number} data.price - 단가 (원)
 */
export async function createPriceItem(data) {
  return post(ENDPOINTS.PRICE_ITEMS, data);
}

/** 단가 항목 수정 */
export async function updatePriceItem(id, data) {
  return put(ENDPOINTS.PRICE_ITEM_BY_ID(id), data);
}

/** 단가 항목 삭제 */
export async function deletePriceItem(id) {
  return del(ENDPOINTS.PRICE_ITEM_BY_ID(id));
}

export default {
  getPriceItems,
  getPriceItem,
  createPriceItem,
  updatePriceItem,
  deletePriceItem,
};
