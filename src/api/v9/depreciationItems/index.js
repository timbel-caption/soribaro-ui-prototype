/**
 * Depreciation Items API (V9)
 * 감가 항목 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  DEPRECIATION_ITEMS: '/v9/api/depreciation-items',
  DEPRECIATION_ITEM_BY_ID: (id) => `/v9/api/depreciation-items/${id}`,
};

/**
 * 감가 항목 목록 조회 (감가표별)
 * @param {Object} params
 * @param {number} params.depreciationTableId - 감가표 ID (필수)
 */
export async function getDepreciationItems(params = {}) {
  return get(ENDPOINTS.DEPRECIATION_ITEMS, params);
}

/** 감가 항목 상세 조회 */
export async function getDepreciationItem(id) {
  return get(ENDPOINTS.DEPRECIATION_ITEM_BY_ID(id));
}

/**
 * 감가 항목 등록
 * @param {Object} data
 * @param {number} data.depreciationTableId - 감가표 ID
 * @param {number} data.accuracyMin - 정확도 구간 최솟값 (포함, %)
 * @param {number} data.accuracyMax - 정확도 구간 최댓값 (미포함, %)
 * @param {number} data.payRate - 지급비율 (%)
 */
export async function createDepreciationItem(data) {
  return post(ENDPOINTS.DEPRECIATION_ITEMS, data);
}

/** 감가 항목 수정 */
export async function updateDepreciationItem(id, data) {
  return put(ENDPOINTS.DEPRECIATION_ITEM_BY_ID(id), data);
}

/** 감가 항목 삭제 */
export async function deleteDepreciationItem(id) {
  return del(ENDPOINTS.DEPRECIATION_ITEM_BY_ID(id));
}

export default {
  getDepreciationItems,
  getDepreciationItem,
  createDepreciationItem,
  updateDepreciationItem,
  deleteDepreciationItem,
};
