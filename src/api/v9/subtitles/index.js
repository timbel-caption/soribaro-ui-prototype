/**
 * Subtitles API (V9 경로)
 * 자막 관리 API
 */
import { get, post, put, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  SUBTITLES: '/v9/api/subtitles',
  SUBTITLE_BY_ID: (id) => `/v9/api/subtitles/${id}`,
  SUBTITLES_BY_PROJECT_FILE: (projectFileId) => `/v9/api/subtitles/project-file/${projectFileId}`,
  SUBTITLES_BY_REVISION: (revision) => `/v9/api/subtitles/revision/${revision}`,
  SUBTITLES_BY_PROJECT_FILE_AND_WORK_TYPE: (projectFileId, workType) => `/v9/api/subtitles/project-file/${projectFileId}/work-type/${workType}`,
};

/**
 * @typedef {Object} Subtitle
 * @property {string} id - 자막 ID (UUID)
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} speaker - 화자
 * @property {string} start - 시작 시간 (HH:MM:SS.mmm)
 * @property {string} end - 종료 시간 (HH:MM:SS.mmm)
 * @property {string} text - 자막 텍스트
 * @property {string} align - 정렬 (center 등)
 * @property {string} firstWorker - 최초 작업자
 * @property {string} lastWorker - 최종 작업자
 * @property {number} revision - 리비전 번호
 * @property {string} lang - 언어 코드
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 * @property {number} createdBy - 생성자
 * @property {number} updatedBy - 수정자
 * @property {number} isDeleted - 삭제 여부 (0: 미삭제, 1: 삭제)
 */

/**
 * @typedef {Object} SubtitleItem
 * @property {string} speaker - 화자
 * @property {string} start - 시작 시간 (HH:MM:SS.mmm)
 * @property {string} end - 종료 시간 (HH:MM:SS.mmm)
 * @property {string} text - 자막 텍스트
 * @property {string} [align] - 정렬 (center 등)
 */

/**
 * @typedef {Object} SubtitleBatchCreateInput
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} [lang] - 언어 코드
 * @property {string} [firstWorker] - 최초 작업자
 * @property {string} [workType] - 작업 유형 (START: 최초 작업, MID: 중간 작업, END: 최종 작업)
 * @property {boolean} [isChecked=false] - 검수 완료 여부
 * @property {SubtitleItem[]} subtitles - 자막 목록
 */

/**
 * @typedef {Object} SubtitleUpdateInput
 * @property {string} [speaker] - 화자
 * @property {string} [start] - 시작 시간 (HH:MM:SS.mmm)
 * @property {string} [end] - 종료 시간 (HH:MM:SS.mmm)
 * @property {string} [text] - 자막 텍스트
 * @property {string} [align] - 정렬 (center 등)
 * @property {string} [lastWorker] - 최종 작업자
 * @property {string} [lang] - 언어 코드
 */

/**
 * @typedef {Object} SubtitleListParams
 * @property {string} [project_file_id] - 프로젝트 파일 ID
 * @property {number|string} [revision] - 리비전 번호
 * @property {string} [lang] - 언어 코드
 * @property {string} [speaker] - 화자
 * @property {boolean|string} [include_deleted] - 삭제된 항목 포함 여부
 */

/**
 * @typedef {Object} ApiResponse
 * @property {string} status - 상태 (SUCCESS | FAILURE)
 * @property {string} code - 상태 코드
 * @property {*} data - 응답 데이터
 * @property {string} message - 메시지
 * @property {string} timestamp - 타임스탬프
 */

/**
 * @typedef {Object} SubtitleRevision
 * @property {number} revision - 리비전 번호
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} workerId - 작업자 ID
 * @property {string} lang - 언어 코드
 * @property {string} workType - 작업 유형 (START, MID, END)
 * @property {string} status - 상태 (CREATED 등)
 * @property {boolean} isChecked - 검수 완료 여부
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 */

/**
 * @typedef {Object} SubtitlesByWorkTypeResponse
 * @property {SubtitleRevision|null} revisionInfo - 리비전 정보 (없으면 null)
 * @property {Subtitle[]} subtitles - 자막 목록
 */

/**
 * 자막 배치 생성
 * @param {SubtitleBatchCreateInput} data - 배치 생성 데이터
 * @returns {Promise<ApiResponse<Subtitle[]>>} 생성된 자막 목록 응답
 */
export async function createSubtitlesBatch(data) {
  const payload = { isChecked: false, ...data };
  return post(ENDPOINTS.SUBTITLES, payload);
}

/**
 * ID로 자막 조회
 * @param {string} id - 자막 ID (UUID)
 * @returns {Promise<ApiResponse<Subtitle>>} 자막 상세 응답
 */
export async function getSubtitleById(id) {
  return get(ENDPOINTS.SUBTITLE_BY_ID(id));
}

/**
 * 자막 목록 조회 (필터)
 * @param {SubtitleListParams} [params={}] - 필터 파라미터
 * @returns {Promise<ApiResponse<Subtitle[]>>} 자막 목록 응답
 */
export async function getSubtitles(params = {}) {
  return get(ENDPOINTS.SUBTITLES, params);
}

/**
 * 프로젝트 파일별 자막 조회
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @returns {Promise<ApiResponse<Subtitle[]>>} 자막 목록 응답
 */
export async function getSubtitlesByProjectFileId(projectFileId) {
  return get(ENDPOINTS.SUBTITLES_BY_PROJECT_FILE(projectFileId));
}

/**
 * revision으로 자막 조회
 * @param {number|string} revision - 리비전 번호
 * @returns {Promise<ApiResponse<Subtitle[]>>} 자막 목록 응답
 */
export async function getSubtitlesByRevision(revision) {
  return get(ENDPOINTS.SUBTITLES_BY_REVISION(revision));
}

/**
 * 프로젝트 파일별 작업타입별 최신 자막 조회
 * subtitle_revision 테이블에서 해당 project_file_id, work_type의 최신 revision을 찾아 자막과 리비전 정보를 반환
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @param {string} workType - 작업 유형 (START, MID, END)
 * @returns {Promise<ApiResponse<SubtitlesByWorkTypeResponse>>} 리비전 정보와 자막 목록 응답
 */
export async function getSubtitlesByProjectFileIdAndWorkType(projectFileId, workType) {
  return get(ENDPOINTS.SUBTITLES_BY_PROJECT_FILE_AND_WORK_TYPE(projectFileId, workType));
}

/**
 * 자막 수정
 * @param {string} id - 자막 ID (UUID)
 * @param {SubtitleUpdateInput} data - 수정할 자막 데이터
 * @returns {Promise<ApiResponse<Subtitle>>} 수정된 자막 응답
 */
export async function updateSubtitle(id, data) {
  return put(ENDPOINTS.SUBTITLE_BY_ID(id), data);
}

/**
 * 자막 삭제 (단건, 소프트 삭제)
 * @param {string} id - 자막 ID (UUID)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteSubtitle(id) {
  return del(ENDPOINTS.SUBTITLE_BY_ID(id));
}

/**
 * 프로젝트 파일별 자막 전체 삭제 (소프트 삭제)
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteSubtitlesByProjectFileId(projectFileId) {
  return del(ENDPOINTS.SUBTITLES_BY_PROJECT_FILE(projectFileId));
}

export default {
  createSubtitlesBatch,
  getSubtitleById,
  getSubtitles,
  getSubtitlesByProjectFileId,
  getSubtitlesByRevision,
  getSubtitlesByProjectFileIdAndWorkType,
  updateSubtitle,
  deleteSubtitle,
  deleteSubtitlesByProjectFileId,
};
