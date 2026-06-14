/**
 * Subtitle Works API (V9 경로)
 * 자막 작업 관리 API
 */
import { get, post, del } from '../client';

// 엔드포인트
const ENDPOINTS = {
  SUBTITLE_WORKS: '/v9/api/subtitle-works',
  SUBTITLE_WORK_BY_REVISION: (revision) => `/v9/api/subtitle-works/${revision}`,
  LATEST: '/v9/api/subtitle-works/latest',
  LATEST_MERGED: '/v9/api/subtitle-works/latest/merged',
  LATEST_WORK_ORIGINAL: '/v9/api/subtitle-works/latest/work-original',
  LATEST_FOR_REVIEW: '/v9/api/subtitle-works/latest/for-review',
  LATEST_FOR_WORKER: '/v9/api/subtitle-works/latest/for-worker',
  LOCKED_OTHERS: '/v9/api/subtitle-works/locked-others',
};

/**
 * @typedef {Object} SubtitleWork
 * @property {number} revision - 리비전 번호 (PK, 시퀀스 자동 생성)
 * @property {string|null} servCd - 의뢰 코드
 * @property {number|null} fileNo - 파일 번호
 * @property {string} projectFileId - 프로젝트 파일 ID (project_files FK)
 * @property {string|null} workerId - 작업자 ID
 * @property {string|null} lang - 언어 코드
 * @property {string} workType - 작업 유형 (TRANSCRIPTION, REVIEW, TRANSLATION 등)
 * @property {string} status - 상태 (WORKING, DONE 등)
 * @property {string|null} subtitle - 자막 내용
 * @property {boolean} isChecked - 검수 완료 여부
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 */

/**
 * @typedef {Object} SubtitleWorkCreateInput
 * @property {string} projectFileId - 프로젝트 파일 ID (필수)
 * @property {string} workType - 작업 유형 (필수)
 * @property {string} status - 상태 (필수)
 * @property {string} [servCd] - 의뢰 코드
 * @property {number} [fileNo] - 파일 번호
 * @property {string} [workerId] - 작업자 ID
 * @property {string} [lang] - 언어 코드
 * @property {string} [subtitle] - 자막 내용
 * @property {boolean} [isChecked=false] - 검수 완료 여부
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
 * 자막 작업 생성
 * - revision은 subtitle_works_revision_seq 시퀀스에서 자동 생성
 *
 * @param {SubtitleWorkCreateInput} data - 생성할 자막 작업 데이터
 * @returns {Promise<ApiResponse<SubtitleWork>>} 생성된 자막 작업 응답
 */
export async function createSubtitleWork(data) {
  return post(ENDPOINTS.SUBTITLE_WORKS, data);
}

/**
 * 자막 작업 조회 (revision)
 * @param {number|string} revision - 리비전 번호 (PK)
 * @returns {Promise<ApiResponse<SubtitleWork>>} 자막 작업 상세 응답
 */
export async function getSubtitleWorkByRevision(revision) {
  return get(ENDPOINTS.SUBTITLE_WORK_BY_REVISION(revision));
}

/**
 * 최신 자막 작업 조회 (project_file_id 기준)
 * - revision이 가장 높은 최신 자막 작업 반환
 *
 * @param {string} projectFileId - 프로젝트 파일 ID (필수)
 * @returns {Promise<ApiResponse<SubtitleWork>>} 최신 자막 작업 응답
 */
export async function getLatestSubtitleWork(projectFileId) {
  return get(ENDPOINTS.LATEST, { project_file_id: projectFileId });
}

/**
 * 최신 자막 작업 조회 (project_file_id + isChecked + status 기준)
 * - revision이 가장 높은 최신 자막 작업 반환
 * - isChecked, status 파라미터로 필터링
 *
 * @param {string} projectFileId - 프로젝트 파일 ID (필수)
 * @param {boolean} isChecked - 검수 완료 여부 (필수)
 * @param {string} [status] - 작업 상태 필터 (WORKING, WORK_DONE, REVIEWING, REVIEW_DONE 등)
 * @returns {Promise<ApiResponse<SubtitleWork>>} 최신 자막 작업 응답
 */
/**
 * 최신 병합 자막 작업 조회 (serv_cd 기준, work_type=MERGED)
 * - /v9/api/subtitle-works/latest/merged?serv_cd=XX
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @returns {Promise<ApiResponse<SubtitleWork>>} 최신 병합 자막 작업 응답
 */
export async function getLatestMergedSubtitleWork(servCd) {
  return get(ENDPOINTS.LATEST_MERGED, { serv_cd: servCd });
}

export async function getLatestCheckedSubtitleWork(projectFileId, isChecked, status) {
  const params = { project_file_id: projectFileId, is_checked: isChecked };
  if (status) params.status = status;
  return get(ENDPOINTS.LATEST, params);
}

/**
 * 작업파일 원본 조회 (project_file_id 기준)
 * - WORK_DONE 자막이 있으면 그 중 가장 최신, 없으면 가장 최근 WORKING 으로 fallback
 * - is_checked = 0 (작업자 자막) 한정
 *
 * @param {string} projectFileId - 프로젝트 파일 ID (필수)
 * @returns {Promise<ApiResponse<SubtitleWork>>} 작업파일 원본 응답
 */
export async function getLatestWorkOriginal(projectFileId) {
  return get(ENDPOINTS.LATEST_WORK_ORIGINAL, { project_file_id: projectFileId });
}

/**
 * 검수자 진입용 최신 자막 조회 (project_file_id 기준)
 * - REVIEWING / REVIEW_DONE / REVIEW_REJECT 중 가장 최신 revision 우선 반환
 * - 검수 본이 없으면 가장 최신 WORK_DONE 으로 fallback (최초 검수 진입)
 * - 작업자가 재제출(WORK_DONE)해도 검수자가 마지막으로 만진 본을 이어 작업 가능
 *
 * @param {string} projectFileId - 프로젝트 파일 ID (필수)
 * @returns {Promise<ApiResponse<SubtitleWork>>} 검수자 진입용 최신 자막 응답
 */
export async function getLatestSubtitleWorkForReview(projectFileId) {
  return get(ENDPOINTS.LATEST_FOR_REVIEW, { project_file_id: projectFileId });
}

/**
 * 작업자 진입용 최신 자막 조회 (project_file_id 기준)
 * - WORK_DONE / WORKING / REVIEW_DONE / REVIEW_REJECT 중 가장 최신 revision 1건이 기본
 * - REVIEWING 은 검수자 진행본이라 작업자에게 의미 없어 제외
 * - 최신이 REVIEW_REJECT 면 이전 revision 의 WORK_DONE / WORKING 본으로 fallback
 *   → 검수자가 반려한 경우 작업자는 본인이 마지막으로 제출/저장한 본부터 다시 작업
 *
 * @param {string} projectFileId - 프로젝트 파일 ID (필수)
 * @returns {Promise<ApiResponse<SubtitleWork>>} 작업자 진입용 최신 자막 응답
 */
export async function getLatestSubtitleWorkForWorker(projectFileId) {
  return get(ENDPOINTS.LATEST_FOR_WORKER, { project_file_id: projectFileId });
}

/**
 * 최신 자막 작업 조회 (status 기준)
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @param {string} status - 상태 (WORK_DONE, REVIEW_DONE 등)
 * @returns {Promise<ApiResponse<SubtitleWork>>}
 */
export async function getLatestSubtitleWorkByStatus(projectFileId, status) {
  return get(ENDPOINTS.LATEST, { project_file_id: projectFileId, status });
}

/**
 * 작업 타입별 자막 작업 내역 조회
 * - revision 내림차순 (최신순)
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @param {number|string} fileNo - 파일 번호 (필수)
 * @param {string} workType - 작업 유형 (필수)
 * @returns {Promise<ApiResponse<SubtitleWork[]>>} 자막 작업 내역 목록 응답
 */
export async function getSubtitleWorksByWorkType(servCd, fileNo, workType) {
  return get(ENDPOINTS.SUBTITLE_WORKS, { serv_cd: servCd, file_no: fileNo, work_type: workType });
}

/**
 * 자막 작업 삭제 (물리 삭제)
 * @param {number|string} revision - 리비전 번호 (PK)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteSubtitleWork(revision) {
  return del(ENDPOINTS.SUBTITLE_WORK_BY_REVISION(revision));
}

/**
 * @typedef {Object} LockedSubtitle
 * @property {string} projectFileId - 출처 프로젝트 파일 ID
 * @property {number|null} startSec - 분할 시작 초
 * @property {number|null} endSec - 분할 종료 초
 * @property {string} subtitle - 자막 JSON 원문
 */

/**
 * 다른 분할 구간 최신 자막 조회 (VOD 워크툴 readonly 표시용)
 * - 동일 fileNo · 동일 작업 단계(projects.type = 'START'/'MID'/'FINAL')의 다른 분할 구간의
 *   최신 자막(상태 무관, project_file_id 별 MAX(revision)) 목록 반환
 * - excludeProjectFileId(자기 구간)은 결과에서 제외
 * - VOD 한정 보장: 백엔드가 TB_SERV.VIDEO_YN='Y' + SERV_TP='3' 인 의뢰만 결과를 채움
 * - 해당 분할에 자막이 한 건도 없으면 응답에서 빠짐
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @param {'START'|'MID'|'FINAL'} type - 작업 단계 (projects.type 컬럼 값, 필수)
 * @param {number|string} fileNo - 파일 번호 (필수)
 * @param {string} excludeProjectFileId - 현재 진입한 자기 프로젝트 파일 ID (필수)
 * @returns {Promise<ApiResponse<LockedSubtitle[]>>} 다른 분할 자막 목록 응답
 */
export async function getLockedOthers(servCd, type, fileNo, excludeProjectFileId) {
  return get(ENDPOINTS.LOCKED_OTHERS, {
    serv_cd: servCd,
    type,
    file_no: fileNo,
    exclude_project_file_id: excludeProjectFileId,
  });
}

export default {
  createSubtitleWork,
  getSubtitleWorkByRevision,
  getLatestSubtitleWork,
  getLatestMergedSubtitleWork,
  getLatestCheckedSubtitleWork,
  getLatestWorkOriginal,
  getSubtitleWorksByWorkType,
  getLockedOthers,
  deleteSubtitleWork,
};
