/**
 * Worker Levels API (V9)
 * 작업자 등급 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  WORKER_LEVELS: '/v9/api/worker-levels',
  WORKER_LEVEL_BY_ID: (id) => `/v9/api/worker-levels/${id}`,
};

/** 작업자 등급 목록 조회 */
export async function getWorkerLevels() {
  return get(ENDPOINTS.WORKER_LEVELS);
}

/** 작업자 등급 상세 조회 */
export async function getWorkerLevel(id) {
  return get(ENDPOINTS.WORKER_LEVEL_BY_ID(id));
}

/** 작업자 등급 등록 */
export async function createWorkerLevel(data) {
  return post(ENDPOINTS.WORKER_LEVELS, data);
}

/** 작업자 등급 수정 */
export async function updateWorkerLevel(id, data) {
  return put(ENDPOINTS.WORKER_LEVEL_BY_ID(id), data);
}

/** 작업자 등급 삭제 */
export async function deleteWorkerLevel(id) {
  return del(ENDPOINTS.WORKER_LEVEL_BY_ID(id));
}

export default {
  getWorkerLevels,
  getWorkerLevel,
  createWorkerLevel,
  updateWorkerLevel,
  deleteWorkerLevel,
};
