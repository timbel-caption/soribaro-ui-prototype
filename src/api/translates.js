/**
 * 번역 데이터 처리 API
 * 번역 결과 저장 및 조회를 처리합니다.
 */
import { get, post } from './client';

// 엔드포인트
const ENDPOINTS = {
  TRANSLATES: '/api/translates',
  SUBTITLES: '/api/subtitles',
  PROMPTS: '/api/prompts',
};

/**
 * @typedef {Object} TranslateSegment
 * @property {number} [speaker] - 화자 번호
 * @property {string} start - 시작 시간 (hh:mm:ss.xxx)
 * @property {string} end - 종료 시간 (hh:mm:ss.xxx)
 * @property {string} text - 번역된 텍스트
 * @property {string} [align] - 정렬 (기본: bottomCenter)
 */

/**
 * @typedef {Object} CreateTranslateDto
 * @property {string} fileId - 파일 ID
 * @property {string} lang - 언어 코드
 * @property {TranslateSegment[]} segments - 번역된 자막 목록
 */

/**
 * @typedef {Object} TranslateResponse
 * @property {boolean} success - 성공 여부
 * @property {Object} data - 응답 데이터
 * @property {string} data.fileId - 파일 ID
 * @property {string} data.lang - 언어 코드
 * @property {number} data.step - Step 번호
 * @property {number} data.revision - Revision 번호
 * @property {number} data.translateCount - 저장된 번역 수
 */

/**
 * 번역 결과 저장
 * @param {CreateTranslateDto} dto - 번역 데이터
 * @returns {Promise<TranslateResponse>}
 */
export async function saveTranslation(dto) {
  return post(ENDPOINTS.TRANSLATES, dto);
}

/**
 * 번역 데이터 조회
 * @param {string} fileId - 파일 ID
 * @param {Object} [options] - 옵션
 * @param {string} [options.lang] - 언어 코드
 * @param {number} [options.step] - Step 번호
 * @param {number} [options.revision] - Revision 번호
 * @returns {Promise<Object>}
 */
export async function getTranslation(fileId, options = {}) {
  const params = {};
  if (options.lang) params.lang = options.lang;
  if (options.step) params.step = options.step;
  if (options.revision) params.revision = options.revision;

  return get(`${ENDPOINTS.TRANSLATES}/${fileId}`, params);
}

/**
 * 파일의 사용 가능한 언어 목록 조회
 * @param {string} fileId - 파일 ID
 * @returns {Promise<Object>}
 */
export async function getAvailableLangs(fileId) {
  return get(`${ENDPOINTS.TRANSLATES}/${fileId}/langs`);
}

/**
 * 번역 원본 자막 데이터 조회
 * sourceLang에 따라 조회 테이블이 달라집니다.
 * - ko: subtitles 테이블 (원본 자막)
 * - 그 외: translates 테이블 (번역된 자막)
 * 
 * @param {string} fileId - 파일 ID
 * @param {string} sourceLang - 원본 언어 코드 (필수)
 * @param {Object} [options] - 옵션
 * @param {number} [options.revision] - 리비전 번호 (없으면 최신)
 * @param {number} [options.step] - Step 번호 (translates용)
 * @returns {Promise<Object>}
 */
export async function getSourceSubtitles(fileId, sourceLang, options = {}) {
  const { revision, step } = options;

  if (sourceLang === 'ko') {
    // 한국어 원본: subtitles 테이블에서 조회
    const params = {};
    if (revision !== undefined) params.revision = revision;
    return get(`${ENDPOINTS.SUBTITLES}/${fileId}`, params);
  } else {
    // 번역된 자막: translates 테이블에서 조회
    const params = { lang: sourceLang };
    if (revision !== undefined) params.revision = revision;
    if (step !== undefined) params.step = step;
    return get(`${ENDPOINTS.TRANSLATES}/${fileId}`, params);
  }
}

/**
 * 원본 자막 데이터 조회 (레거시 - subtitles 테이블 전용)
 * @param {string} fileId - 파일 ID
 * @param {Object} [options] - 옵션
 * @param {number} [options.revision] - 리비전 번호 (없으면 최신)
 * @returns {Promise<Object>}
 */
export async function getSubtitles(fileId, options = {}) {
  const params = {};
  if (options.revision !== undefined) params.revision = options.revision;
  return get(`${ENDPOINTS.SUBTITLES}/${fileId}`, params);
}

/**
 * 시스템 프롬프트 조회
 * @param {string} promptId - 프롬프트 ID
 * @returns {Promise<Object>}
 */
export async function getPrompt(promptId) {
  return get(`${ENDPOINTS.PROMPTS}/${promptId}`);
}

export default {
  saveTranslation,
  getTranslation,
  getAvailableLangs,
  getSubtitles,
  getSourceSubtitles,
  getPrompt,
};
