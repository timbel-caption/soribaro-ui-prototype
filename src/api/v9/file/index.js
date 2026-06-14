import { get, post, put, apiRequest, getToken } from '../client';

const ENDPOINTS = {
  FILES: '/v9/api/file',
  FILE_DIFFICULTY: (fileNo) => `/v9/api/file/${fileNo}/difficulty`,
  ATTACHMENTS: '/v9/api/file/attachments',
  SHARED_FILE_UPLOAD: '/v9/api/file/shared-files/upload',
  SHARED_FILE_DOWNLOAD: (fileNo) => `/v9/api/file/shared-files/download-url/${fileNo}`,
  CUSTOMER_FILE_DOWNLOAD: (fileNo) => `/v9/api/file/customer-files/download-url/${fileNo}`,
  SHARED_FILES: '/v9/api/file/shared-files',
  FILE_DOWNLOAD_URL: (fileNo) => `/v9/api/file/download-url/${fileNo}`,
  FILE_STREAM_URL: (fileNo) => `/v9/api/file/stream-url/${fileNo}`,
  WAVEFORM_DOWNLOAD_URL: (fileNo) => `/v9/api/file/waveform-url/${fileNo}`,
  REQUEST_FILES: '/v9/api/file/request-files',
  FILE_SPLIT_SEGMENTS: (fileNo) => `/v9/api/file/${fileNo}/split-segments`,
  ENTERPRISE_ESTIMATE_UPLOAD: '/v9/api/file/estimate/upload',
  ENTERPRISE_FINAL_UPLOAD: '/v9/api/file/final-output/upload',
  ENTERPRISE_FILE: '/v9/api/file/enterprise',
  ENTERPRISE_NOTIFY: '/v9/api/file/enterprise/notify',
  NORMALIZE_MP3_REPLACE: (fileNo) => `/v9/api/file/${fileNo}/normalize-mp3/replace`,
  NORMALIZE_MP3_ROLLBACK: (fileNo) => `/v9/api/file/${fileNo}/normalize-mp3/rollback`,
  NORMALIZE_MP3_STATUS: (fileNo) => `/v9/api/file/${fileNo}/normalize-mp3/status`,
};

// 엔터프라이즈 회의록 파일 타입 코드
export const ENTERPRISE_FILE_TP = {
  ESTIMATE: '6',
  FINAL: '7',
};

/**
 * @typedef {Object} FileDto
 * @property {number} fileNo - 파일 번호
 * @property {string} fileNm - 파일명
 * @property {string} fileTp - 파일 타입 (VIDEO, SUBTITLE 등)
 * @property {string} sysFileNm - 시스템 파일명
 * @property {string} filePath - 파일 경로
 * @property {number} fileSize - 파일 크기 (bytes)
 * @property {string|null} playTm - 재생 시간 (HH:mm:ss)
 * @property {number|null} prtFileNo - 부모 파일 번호
 * @property {string} regr - 등록자
 * @property {string} regDttm - 등록 일시 (yyyyMMddHHmmss)
 * @property {string} shareYn - 공유 여부 (Y/N)
 * @property {number|null} fileDifficultId - 파일 난이도 ID (file_difficulties FK)
 * @property {string|null} fileDifficultName - 파일 난이도명 (file_difficulties.name)
 * @property {string|null} overallStatus - 파일 종합 상태 (fn_file_overall_status)
 * @property {string|null} splitTp - 분할 타입 (TB_SERV_DTL.SPLIT_TP, '1'=분할)
 * @property {Array<{fileNo: number, splitSeq: number, splitTimeSt: string, splitTimeEd: string, splitTime: number}>} timeSegments - 구간 분할 상세 (TB_SPLIT_DTL)
 */

/**
 * 의뢰 코드별 파일 목록 조회
 * - tb_file + tb_serv_dtl 조인 (file_no 기준, serv_cd 필터)
 * - 페이지네이션 없이 전체 목록 반환
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @returns {Promise<FileDto[]>} 파일 목록
 */
export async function getFilesByServCd(servCd) {
  return get(ENDPOINTS.FILES, { servCd });
}

/**
 * 파일의 난이도 변경
 * @param {number} fileNo - 파일 번호
 * @param {number} fileDifficultId - 난이도 ID (file_difficulties.id)
 * @returns {Promise<Object>} 수정된 FileDto
 */
export async function updateFileDifficultyByFileNo(fileNo, fileDifficultId) {
  return put(ENDPOINTS.FILE_DIFFICULTY(fileNo), { fileDifficultId });
}

/**
 * 의뢰 코드별 첨부파일 목록 조회
 * - 고객 첨부파일(fileTp='9') + 작업자 공유파일(fileTp='10')
 * - fileTp 오름차순, regDttm 내림차순 정렬
 *
 * @param {string} servCd - 의뢰 코드 (필수)
 * @returns {Promise<Object>} 첨부파일 목록
 */
export async function getAttachmentsByServCd(servCd) {
  return get(ENDPOINTS.ATTACHMENTS, { servCd });
}

/**
 * 작업자 공유파일 업로드
 * MinIO에 파일을 업로드하고 TB_FILE에 메타데이터를 저장
 * 서버에서 의뢰 내 가장 빠른 fileNo를 부모파일(PRT_FILE_NO)로 자동 결정
 *
 * @param {File} file - 업로드할 파일
 * @param {string} servCd - 서비스 코드
 * @param {Object} [options] - 추가 옵션
 * @param {string} [options.shareYn] - 공유 여부 (Y/N)
 * @returns {Promise<Object>} { fileNo, fileNm }
 */
export async function uploadSharedFile(file, servCd, options = {}) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.SHARED_FILE_UPLOAD}`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('servCd', String(servCd));
  if (options.shareYn) formData.append('shareYn', options.shareYn);

  const token = getToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `업로드 실패 (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * 작업자 공유파일 Presigned 다운로드 URL 생성
 * @param {number|string} downloadFileNo - 다운로드 대상 파일 번호 (fileTp='10')
 * @returns {Promise<Object>} { downloadUrl, fileName, expiresIn }
 */
export async function getSharedFileDownloadUrl(downloadFileNo) {
  return get(ENDPOINTS.SHARED_FILE_DOWNLOAD(downloadFileNo));
}

/**
 * 고객 첨부파일 Presigned 다운로드 URL 생성
 * @param {number|string} downloadFileNo - 다운로드 대상 파일 번호 (fileTp='9')
 * @returns {Promise<Object>} { downloadUrl, fileName, expiresIn }
 */
export async function getCustomerFileDownloadUrl(downloadFileNo) {
  return get(ENDPOINTS.CUSTOMER_FILE_DOWNLOAD(downloadFileNo));
}

/**
 * 작업자 공유파일 삭제
 * MinIO 물리 파일 + TB_FILE 레코드 삭제
 *
 * @param {string[]} fileNos - 삭제할 파일 번호 배열
 * @returns {Promise<Object>} { deletedCount }
 */
export async function deleteSharedFiles(fileNos) {
  return apiRequest(ENDPOINTS.SHARED_FILES, {
    method: 'DELETE',
    body: JSON.stringify({ fileNos }),
  });
}

/**
 * 범용 파일 다운로드 URL 생성 (관리자 전용)
 * fileTp 무관, Content-Disposition: attachment
 *
 * @param {number|string} fileNo - 파일 번호
 * @returns {Promise<Object>} { url, fileName, expiresIn }
 */
export async function getFileDownloadUrl(fileNo) {
  return get(ENDPOINTS.FILE_DOWNLOAD_URL(fileNo));
}

/**
 * 파일 스트리밍 URL 생성
 * fileTp 무관, Content-Disposition: inline (브라우저 재생)
 *
 * @param {number|string} fileNo - 파일 번호
 * @returns {Promise<Object>} { url, fileName, expiresIn }
 */
export async function getFileStreamUrl(fileNo) {
  return get(ENDPOINTS.FILE_STREAM_URL(fileNo));
}

/**
 * Waveform 다운로드 URL 생성
 * 원본 파일 번호(fileNo)로 file_waveforms 조회 후 waveform 버킷의 Presigned URL 반환
 * 404 시 해당 파일에 파형 데이터가 없음을 의미
 *
 * @param {number|string} fileNo - 원본 파일 번호 (TB_FILE.FILE_NO)
 * @returns {Promise<Object>} { url, fileName, expiresIn }
 */
export async function getWaveformDownloadUrl(fileNo) {
  return get(ENDPOINTS.WAVEFORM_DOWNLOAD_URL(fileNo));
}

/**
 * 의뢰파일 추가
 * 기존 서비스(servCd)에 파일 메타데이터를 추가 (TB_FILE + TB_SERV_DTL INSERT)
 * presigned-url로 MinIO 업로드 완료 후 호출
 *
 * @param {Object} params
 * @param {string} params.servCd - 서비스 코드 (필수)
 * @param {Array<{fileNo: number, fileName: string, systemFileName: string, filePath: string, fileSize: number, fileType: string, playTime: number}>} params.fileList - 파일 목록 (필수)
 * @param {string} [params.remark] - 비고
 * @returns {Promise<{status: string, data: {addedFileCount: number, fileNos: number[]}}>}
 */
export async function addRequestFiles({ servCd, fileList, remark }) {
  return post(ENDPOINTS.REQUEST_FILES, { servCd, fileList, remark });
}

/**
 * 의뢰파일 삭제 (관리자 전용)
 * 의뢰(servCd) 내 의뢰파일(FILE_TP='1')을 cascade 로 삭제합니다.
 * - 기본: STANDBY 상태 + 자막 미생성 파일만 허용
 * - force=true: 작업 진행/완료 파일 + 자막 보유 파일도 강제 삭제
 *
 * @param {Object} params
 * @param {string} params.servCd
 * @param {Array<number>} params.fileNos
 * @param {boolean} [params.force=false]
 * @returns {Promise<{status:string, data:{deletedCount:number, deletedFileNos:number[], skipped:Array<{fileNo:number, reason:string}>}}>}
 */
export async function deleteRequestFiles({ servCd, fileNos, force = false }) {
  return apiRequest(ENDPOINTS.REQUEST_FILES, {
    method: 'DELETE',
    body: JSON.stringify({ servCd, fileNos, force }),
  });
}

/**
 * 파일 분할 구간 정보 저장
 * - 기존 TB_SPLIT_DTL 전체 삭제 후 새로 INSERT
 * - TB_SERV_DTL.SPLIT_TP를 '1'로 자동 업데이트
 * - project_files / subtitle_works / 분할 파생 TB_SERV_DIST 흔적 중 하나라도 있으면 400 으로 차단
 *
 * @param {number} fileNo - 파일 번호 (필수)
 * @param {string} servCd - 서비스 코드 (필수, 분할 파생 TB_SERV_DIST 검증용)
 * @param {Array<{splitSeq: number, splitTimeSt: string, splitTimeEd: string, splitTime: number}>} segments - 구간 목록
 * @returns {Promise<Object>} 저장된 구간 목록
 */
export async function updateFileSplitSegments(fileNo, servCd, segments) {
  return post(ENDPOINTS.FILE_SPLIT_SEGMENTS(fileNo), { servCd, segments });
}

/**
 * 파일 분할 해제 (TB_SPLIT_DTL 전체 삭제 + TB_SERV_DTL.SPLIT_TP='0').
 * 이미 미분할 상태인 경우 no-op 응답(200) 으로 idempotent.
 * project_files / subtitle_works / 분할 파생 TB_SERV_DIST 흔적 중 하나라도 있으면 400 으로 차단.
 *
 * @param {number} fileNo - 파일 번호 (필수)
 * @param {string} servCd - 서비스 코드 (필수)
 * @returns {Promise<Object>} { fileNo, message }
 */
export async function cancelFileSplit(fileNo, servCd) {
  return apiRequest(
    `${ENDPOINTS.FILE_SPLIT_SEGMENTS(fileNo)}?servCd=${encodeURIComponent(servCd)}`,
    { method: "DELETE" }
  );
}

/**
 * 엔터프라이즈 회의록 파일 업로드 (공통 헬퍼)
 * @param {string} endpoint - 업로드 엔드포인트
 * @param {File} file - 업로드 파일
 * @param {string} servCd - 의뢰 코드
 * @returns {Promise<Object>} { status, data: { fileNo, fileNm, fileTp } }
 */
async function uploadEnterpriseFileMultipart(endpoint, file, servCd) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('servCd', String(servCd));

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `업로드 실패 (HTTP ${response.status})`);
  }
  return response.json();
}

/**
 * 엔터프라이즈 회의록 견적서 업로드 (FILE_TP='6', ADMIN 전용)
 * - 선행조건: 의뢰에 MERGED 상태의 subtitle_works 존재
 * @param {File} file
 * @param {string} servCd
 */
export async function uploadEnterpriseEstimateFile(file, servCd) {
  return uploadEnterpriseFileMultipart(ENDPOINTS.ENTERPRISE_ESTIMATE_UPLOAD, file, servCd);
}

/**
 * 엔터프라이즈 회의록 최종산출물 업로드 (FILE_TP='7', ADMIN 전용)
 * - 선행조건: 의뢰에 MERGED 상태의 subtitle_works 존재
 * @param {File} file
 * @param {string} servCd
 */
export async function uploadEnterpriseFinalFile(file, servCd) {
  return uploadEnterpriseFileMultipart(ENDPOINTS.ENTERPRISE_FINAL_UPLOAD, file, servCd);
}

/**
 * 엔터프라이즈 회의록 파일 메타데이터 조회 (ADMIN 전용)
 * 실제 다운로드 URL은 {@link getFileDownloadUrl}로 조회
 * @param {string} servCd
 * @param {string} fileTp - ENTERPRISE_FILE_TP.ESTIMATE('6') | ENTERPRISE_FILE_TP.FINAL('7')
 * @returns {Promise<Object>} { status, data: { fileNo, fileNm, ... } }
 */
export async function getLatestEnterpriseFile(servCd, fileTp) {
  return get(ENDPOINTS.ENTERPRISE_FILE, { servCd, fileTp });
}

/**
 * 엔터프라이즈 알림 발송 (ADMIN 전용)
 * - WORK_STAT='3'(초안완성)로 전이 + Aligo SMS 발송 시도
 * - SMS 실패 시에도 상태 전이는 유지. 응답 data.smsSent 로 결과 확인
 * @param {string} servCd
 * @param {string} sendType Aligo 알림 템플릿 코드 (예: "11"=B2C 녹취록, "23"=B2B 회의록)
 * @returns {Promise<Object>} { status, data: { smsSent, smsResultCode, smsMessage } }
 */
export async function sendEnterpriseNotification(servCd, sendType) {
  return post(ENDPOINTS.ENTERPRISE_NOTIFY, { servCd, sendType });
}

/**
 * VBR mp3 를 CBR 로 정규화한 결과를 백엔드에 업로드해 minIO 원본을 교체 (ADMIN 전용)
 * 원본은 같은 bucket 의 *.vbr.bak 으로 server-side copy 백업됨. DB 메타데이터는 변경되지 않음.
 *
 * @param {number|string} fileNo
 * @param {Blob} blob - 클라이언트(ffmpeg.wasm) 가 CBR 변환한 mp3 Blob
 * @param {string} [filename] - multipart filename (정보 표시용, 서버는 원본 path 만 사용)
 * @returns {Promise<Object>} { status, data: { fileNo, bucket, objectPath, backupPath, backupAlreadyExisted, originalSizeBytes, newSizeBytes } }
 */
export async function replaceMp3WithNormalized(fileNo, blob, filename = 'normalized.mp3') {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.NORMALIZE_MP3_REPLACE(fileNo)}`;

  const formData = new FormData();
  formData.append('file', blob, filename);

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `mp3 정규화 교체 실패 (HTTP ${response.status})`);
  }
  return response.json();
}

/**
 * mp3 정규화 롤백 — *.vbr.bak 백업을 원본 위치로 복구 (ADMIN 전용)
 * @param {number|string} fileNo
 * @returns {Promise<Object>}
 */
export async function rollbackMp3Normalization(fileNo) {
  return post(ENDPOINTS.NORMALIZE_MP3_ROLLBACK(fileNo));
}

/**
 * mp3 정규화 상태 조회 — 백업 존재 여부 (ADMIN 전용)
 * @param {number|string} fileNo
 * @returns {Promise<Object>} { status, data: { fileNo, bucket, objectPath, backupPath, backupExists, backupSizeBytes } }
 */
export async function getMp3NormalizationStatus(fileNo) {
  return get(ENDPOINTS.NORMALIZE_MP3_STATUS(fileNo));
}

export default {
  getFilesByServCd,
  updateFileDifficultyByFileNo,
  getAttachmentsByServCd,
  uploadSharedFile,
  getSharedFileDownloadUrl,
  getCustomerFileDownloadUrl,
  deleteSharedFiles,
  getFileDownloadUrl,
  getFileStreamUrl,
  getWaveformDownloadUrl,
  addRequestFiles,
  deleteRequestFiles,
  updateFileSplitSegments,
  cancelFileSplit,
  uploadEnterpriseEstimateFile,
  uploadEnterpriseFinalFile,
  getLatestEnterpriseFile,
  sendEnterpriseNotification,
  replaceMp3WithNormalized,
  rollbackMp3Normalization,
  getMp3NormalizationStatus,
};
