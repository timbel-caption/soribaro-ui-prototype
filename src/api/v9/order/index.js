/**
 * Order API (V9)
 * 의뢰(주문) 등록 API
 *
 * 흐름:
 *  1. getPresignedUrl() → fileNo, presignedUrl, filePath 수신
 *  2. uploadToMinIO()   → presignedUrl로 MinIO에 직접 PUT 업로드
 *  3. create*Service()  → fileList에 업로드 메타 포함하여 접수
 */
import { get, post } from '../client';

const ENDPOINTS = {
  PRESIGNED_URL: '/v9/api/order/presigned-url',
  WAVEFORM_PRESIGNED_URL: '/v9/api/order/waveforms/presigned-url',
  WAVEFORM_META: '/v9/api/order/waveforms',
  WAVEFORM_BY_FILE: (fileNo) => `/v9/api/order/waveforms/${fileNo}`,
  RECORDING: '/v9/api/order/services/recording',
  ENTERPRISE_VOD: '/v9/api/order/services/enterprise/vod',
  ENTERPRISE_MINUTES: '/v9/api/order/services/enterprise/minutes',
  TRANSLATION: '/v9/api/order/services/translation',
};

/**
 * Presigned URL 발행
 * 관리자 membNo는 JWT 토큰에서 서버가 자동 추출
 *
 * @param {Object} params
 * @param {string} params.fileName - 업로드할 파일명
 * @param {string} params.uuid - 파일 고유 식별자 (UUID)
 * @returns {Promise<{status: string, data: {presignedUrl: string, fileNo: number, filePath: string, bucketName: string, expiryMinutes: number}}>}
 */
export async function getPresignedUrl({ fileName, uuid }) {
  return get(ENDPOINTS.PRESIGNED_URL, { fileName, uuid });
}

/**
 * MinIO에 파일 직접 PUT 업로드
 * XMLHttpRequest를 사용하여 진행률 추적
 *
 * @param {string} presignedUrl - MinIO presigned PUT URL
 * @param {File|Blob} file - 업로드할 파일
 * @param {function} [onProgress] - 진행률 콜백 (0-100)
 * @returns {Promise<void>}
 */
export function uploadToMinIO(presignedUrl, file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('업로드 취소됨', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`MinIO 업로드 실패 (HTTP ${xhr.status})`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('MinIO 업로드 네트워크 오류')));
    xhr.addEventListener('abort', () => reject(new DOMException('업로드 취소됨', 'AbortError')));

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * Waveform(.dat) 업로드용 Presigned URL 발행
 * waveform 버킷에 저장, 관리자 membNo 기준 경로 생성
 *
 * @param {Object} params
 * @param {string} params.fileName - waveform 파일명 (예: audio.dat)
 * @param {string} params.uuid - 파일 고유 식별자
 * @returns {Promise<{status: string, data: {presignedUrl: string, fileNo: null, filePath: string, bucketName: string, expiryMinutes: number}}>}
 */
export async function getWaveformPresignedUrl({ fileName, uuid }) {
  return get(ENDPOINTS.WAVEFORM_PRESIGNED_URL, { fileName, uuid });
}

/**
 * Waveform 메타 저장
 * 업로드 완료된 waveform 파일의 메타 정보를 file_waveforms 테이블에 저장
 *
 * @param {Object} body
 * @param {number} body.fileNo - 원본 파일 번호 (TB_FILE FK)
 * @param {string} body.fileName - waveform 파일명 (예: audio.dat)
 * @param {string} body.filePath - presigned-url 응답의 MinIO 경로
 * @param {string} body.systemFileName - presigned-url에서 사용한 UUID
 * @param {number} body.fileSize - 업로드된 파일 크기 (byte)
 * @returns {Promise<Object>}
 */
export async function saveWaveformMeta(body) {
  return post(ENDPOINTS.WAVEFORM_META, body);
}

/**
 * Waveform 조회
 * 원본 파일 번호(fileNo)로 waveform 정보 조회
 *
 * @param {number} fileNo - 원본 파일 번호
 * @returns {Promise<Object>}
 */
export async function getWaveformByFileNo(fileNo) {
  return get(ENDPOINTS.WAVEFORM_BY_FILE(fileNo));
}

/**
 * 녹취록 서비스 접수
 * SERV_TP='1', VIDEO_YN='N', TRNS_YN='N'
 *
 * @param {Object} body
 * @param {string} body.serviceTitle - 서비스 제목
 * @param {number} [body.clientMembNo] - 의뢰자 회원번호 (clientEmail과 택1 필수)
 * @param {string} [body.clientEmail] - 의뢰자 이메일 (clientMembNo과 택1 필수)
 * @param {string} [body.remark] - 비고
 * @param {Array} body.fileList - 파일 목록
 * @returns {Promise<Object>}
 */
export async function createRecordingService(body) {
  return post(ENDPOINTS.RECORDING, body);
}

/**
 * 엔터프라이즈 서비스 접수
 *
 * @param {'vod'|'minutes'} subType - VOD 또는 회의록
 * @param {Object} body - 요청 바디 (createRecordingService와 동일 구조)
 * @returns {Promise<Object>}
 */
export async function createEnterpriseService(subType, body) {
  const endpoint = subType === 'vod' ? ENDPOINTS.ENTERPRISE_VOD : ENDPOINTS.ENTERPRISE_MINUTES;
  return post(endpoint, body);
}

/**
 * 번역 서비스 접수
 * TRNS_YN='Y'
 *
 * @param {Object} body
 * @param {string} body.serviceTitle - 서비스 제목
 * @param {number} [body.clientMembNo] - 의뢰자 회원번호
 * @param {string} [body.clientEmail] - 의뢰자 이메일
 * @param {string} body.sourceLanguageCode - 원본 언어 코드 (예: KOR)
 * @param {Array} body.translationLanguageList - 번역 대상 언어 목록
 * @param {Array} body.fileList - 파일 목록
 * @param {Array} [body.attachmentList] - 첨부파일 목록
 * @param {string} [body.remark] - 비고
 * @returns {Promise<Object>}
 */
export async function createTranslationService(body) {
  return post(ENDPOINTS.TRANSLATION, body);
}

export default {
  getPresignedUrl,
  getWaveformPresignedUrl,
  saveWaveformMeta,
  getWaveformByFileNo,
  uploadToMinIO,
  createRecordingService,
  createEnterpriseService,
  createTranslationService,
};
