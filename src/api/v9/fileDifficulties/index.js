/**
 * File Difficulties API (V9)
 * 파일 난이도 관리 API
 */
import { get, post, put, del } from '../client';

const ENDPOINTS = {
  FILE_DIFFICULTIES: '/v9/api/file-difficulties',
  FILE_DIFFICULTY_BY_ID: (id) => `/v9/api/file-difficulties/${id}`,
};

/**
 * 파일 난이도 목록 조회
 * @param {Object} [params={}]
 * @param {string} [params.bssTypeCd] - 의뢰 유형 코드 필터
 */
export async function getFileDifficulties(params = {}) {
  return get(ENDPOINTS.FILE_DIFFICULTIES, params);
}

/** 파일 난이도 상세 조회 */
export async function getFileDifficulty(id) {
  return get(ENDPOINTS.FILE_DIFFICULTY_BY_ID(id));
}

/** 파일 난이도 등록 */
export async function createFileDifficulty(data) {
  return post(ENDPOINTS.FILE_DIFFICULTIES, data);
}

/** 파일 난이도 수정 */
export async function updateFileDifficulty(id, data) {
  return put(ENDPOINTS.FILE_DIFFICULTY_BY_ID(id), data);
}

/** 파일 난이도 삭제 */
export async function deleteFileDifficulty(id) {
  return del(ENDPOINTS.FILE_DIFFICULTY_BY_ID(id));
}

export default {
  getFileDifficulties,
  getFileDifficulty,
  createFileDifficulty,
  updateFileDifficulty,
  deleteFileDifficulty,
};
