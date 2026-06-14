/**
 * Training (연수) 파일 API
 *
 * - GET    /v9/api/training-files
 * - GET    /v9/api/training-files/{id}
 * - POST   /v9/api/training-files       (multipart: file + meta JSON)
 * - DELETE /v9/api/training-files/{id}
 * - GET    /v9/api/training-files/{id}/playback-url
 *
 * Waveform:
 * - GET    /v9/api/training-files/waveforms/presigned-url
 * - POST   /v9/api/training-files/{id}/waveforms
 * - GET    /v9/api/training-files/{id}/waveforms
 * - GET    /v9/api/training-files/{id}/waveform-url
 *
 * 응답 envelope: { status, code, message, data, timestamp }
 */
import { apiRequest, getToken } from '../client';

const ENDPOINTS = {
  TRAINING_FILES: '/v9/api/training-files',
  TRAINING_FILE: (id) => `/v9/api/training-files/${id}`,
  TRAINING_FILE_PLAYBACK: (id) => `/v9/api/training-files/${id}/playback-url`,
  TRAINING_WAVEFORM_PRESIGNED_URL: '/v9/api/training-files/waveforms/presigned-url',
  TRAINING_WAVEFORM_META: (id) => `/v9/api/training-files/${id}/waveforms`,
  TRAINING_WAVEFORM_DOWNLOAD: (id) => `/v9/api/training-files/${id}/waveform-url`,
};

/**
 * @typedef {Object} TrainingFileDto
 * @property {string} id          - UUID
 * @property {string} name        - 원본 파일명
 * @property {string} title       - 제목
 * @property {string|null} description
 * @property {string} format      - 확장자 (mp4, mp3 등)
 * @property {number} size        - 바이트
 * @property {number|null} duration - 초 단위 정수
 * @property {string} storagePath
 * @property {string|null} createdBy
 * @property {string|null} updatedBy
 * @property {string} createdAt
 * @property {string} updatedAt
 */

function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * 연수 파일 목록 조회 (서버 페이징)
 *
 * @param {Object} params
 * @param {number} [params.page=0]
 * @param {number} [params.size=20]
 * @param {string} [params.keyword]
 * @returns {Promise<Object>} envelope { status, data: { content, totalElements, ... } | content[] }
 */
export async function listTrainingFiles({ page = 0, size = 20, keyword } = {}) {
  const qs = buildQueryString({ page, size, keyword });
  return apiRequest(`${ENDPOINTS.TRAINING_FILES}${qs}`, { method: 'GET' });
}

/**
 * 연수 파일 단건 조회
 * @param {string} id - UUID
 * @returns {Promise<Object>} envelope { status, data: TrainingFileDto }
 */
export async function getTrainingFile(id) {
  return apiRequest(ENDPOINTS.TRAINING_FILE(id), { method: 'GET' });
}

/**
 * 연수 파일 업로드 (multipart)
 *
 * @param {Object} params
 * @param {File} params.file
 * @param {{title: string, description?: string, duration?: number}} params.meta
 * @param {(percent: number) => void} [params.onProgress] - 진행률 콜백 (0~100)
 * @returns {Promise<Object>} envelope
 */
export async function uploadTrainingFile({ file, meta, onProgress }) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.TRAINING_FILES}`;

  const fd = new FormData();
  fd.append('file', file);
  fd.append(
    'meta',
    new Blob([JSON.stringify(meta)], { type: 'application/json' })
  );

  // XHR 사용 - fetch는 업로드 진행률 콜백 미지원
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    const token = getToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (typeof onProgress === 'function' && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      const status = xhr.status;
      let parsed = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      if (status >= 200 && status < 300) {
        resolve(parsed);
      } else {
        const message = parsed?.message || `업로드 실패 (HTTP ${status})`;
        const err = new Error(message);
        err.status = status;
        err.data = parsed;
        reject(err);
      }
    };

    xhr.onerror = () => {
      reject(new Error('네트워크 오류로 업로드에 실패했습니다.'));
    };

    xhr.onabort = () => {
      reject(new Error('업로드가 취소되었습니다.'));
    };

    xhr.send(fd);
  });
}

/**
 * 연수 파일 삭제
 * @param {string} id - UUID
 */
export async function deleteTrainingFile(id) {
  return apiRequest(ENDPOINTS.TRAINING_FILE(id), { method: 'DELETE' });
}

/**
 * 연수 파일 재생 URL 발급
 * @param {string} id - UUID
 * @returns {Promise<Object>} envelope { data: { id, playbackUrl, expiresInSec, format, name } }
 */
export async function getTrainingFilePlaybackUrl(id) {
  return apiRequest(ENDPOINTS.TRAINING_FILE_PLAYBACK(id), { method: 'GET' });
}

// ─────────────────────────── Waveform ───────────────────────────

/**
 * 연수 파일 waveform 업로드용 Presigned URL 발급
 *
 * @param {Object} params
 * @param {string} params.fileName - waveform 파일명 (예: <uuid>.dat)
 * @param {string} params.uuid - 파일 고유 식별자
 * @returns {Promise<{status: string, data: {presignedUrl: string, filePath: string, bucketName?: string, expiryMinutes?: number}}>}
 */
export async function getTrainingWaveformPresignedUrl({ fileName, uuid }) {
  const qs = buildQueryString({ fileName, uuid });
  return apiRequest(`${ENDPOINTS.TRAINING_WAVEFORM_PRESIGNED_URL}${qs}`, {
    method: 'GET',
  });
}

/**
 * 연수 파일 waveform 메타 저장
 *
 * @param {string} trainingFileId - 연수 파일 UUID
 * @param {Object} body
 * @param {string} body.fileName - waveform 파일명 (예: <uuid>.dat)
 * @param {string} body.filePath - presigned-url 응답의 MinIO 경로
 * @param {string} body.systemFileName - presigned-url 에서 사용한 UUID
 * @param {number} body.fileSize - 업로드된 파일 크기 (byte)
 * @returns {Promise<Object>}
 */
export async function saveTrainingWaveformMeta(trainingFileId, body) {
  return apiRequest(ENDPOINTS.TRAINING_WAVEFORM_META(trainingFileId), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 연수 파일 waveform 메타 조회
 *
 * @param {string} trainingFileId - 연수 파일 UUID
 * @returns {Promise<Object>}
 */
export async function getTrainingWaveformMeta(trainingFileId) {
  return apiRequest(ENDPOINTS.TRAINING_WAVEFORM_META(trainingFileId), {
    method: 'GET',
  });
}

/**
 * 연수 파일 waveform 다운로드 presigned URL 발급
 *
 * @param {string} trainingFileId - 연수 파일 UUID
 * @returns {Promise<{status: string, data: {url: string, fileName?: string, expiresIn?: number}}>}
 */
export async function getTrainingWaveformDownloadUrl(trainingFileId) {
  return apiRequest(ENDPOINTS.TRAINING_WAVEFORM_DOWNLOAD(trainingFileId), {
    method: 'GET',
  });
}

export default {
  listTrainingFiles,
  getTrainingFile,
  uploadTrainingFile,
  deleteTrainingFile,
  getTrainingFilePlaybackUrl,
  getTrainingWaveformPresignedUrl,
  saveTrainingWaveformMeta,
  getTrainingWaveformMeta,
  getTrainingWaveformDownloadUrl,
};
