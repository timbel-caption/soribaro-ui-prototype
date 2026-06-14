/**
 * Depreciation Tables API (V9)
 * 감가표 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  DEPRECIATION_TABLES: '/v9/api/depreciation-tables',
  DEPRECIATION_TABLE_BY_ID: (id) => `/v9/api/depreciation-tables/${id}`,
  DEPRECIATION_TABLE_BY_BSS_TYPE: '/v9/api/depreciation-tables/by-bss-type',
};

/** 감가표 목록 조회 */
export async function getDepreciationTables() {
  return get(ENDPOINTS.DEPRECIATION_TABLES);
}

/** 감가표 상세 조회 */
export async function getDepreciationTable(id) {
  return get(ENDPOINTS.DEPRECIATION_TABLE_BY_ID(id));
}

/** BSS_TYPE 기반 감가표 조회 (정산용) */
export async function getDepreciationTableByBssType(bssType) {
  return get(ENDPOINTS.DEPRECIATION_TABLE_BY_BSS_TYPE, { bssType });
}

/**
 * 감가표 등록
 * @param {Object} data
 * @param {string} data.name - 감가표명
 * @param {string} data.bssType - 의뢰 유형 코드 (필수)
 * @param {string} [data.description] - 설명
 */
export async function createDepreciationTable(data) {
  return post(ENDPOINTS.DEPRECIATION_TABLES, data);
}

/** 감가표 수정 */
export async function updateDepreciationTable(id, data) {
  return put(ENDPOINTS.DEPRECIATION_TABLE_BY_ID(id), data);
}

/** 감가표 삭제 */
export async function deleteDepreciationTable(id) {
  return del(ENDPOINTS.DEPRECIATION_TABLE_BY_ID(id));
}

export default {
  getDepreciationTables,
  getDepreciationTable,
  getDepreciationTableByBssType,
  createDepreciationTable,
  updateDepreciationTable,
  deleteDepreciationTable,
};
