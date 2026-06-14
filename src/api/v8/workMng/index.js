/**
 * WorkMng API (V8 경로)
 * 작업 관리 API - 파일 다운로드 URL 생성 등
 */
import { post } from '../client';

// 엔드포인트
const ENDPOINTS = {
  PRESIGNED_DOWNLOAD: '/v8/api/workMng/getpresignedUrl/downloadFile',
};

/**
 * 버킷 타입
 * @typedef {'order' | 'complete'} BucketType
 * - order: 원본 파일 (주문 시 업로드된 파일)
 * - complete: 산출물 파일 (작업 완료 후 생성된 파일)
 */

/**
 * @typedef {Object} PresignedDownloadRequest
 * @property {string} fileNo - 파일 번호
 * @property {BucketType} bucketType - 버킷 타입
 */

/**
 * @typedef {Object} PresignedDownloadData
 * @property {string} downloadUrl - MinIO Presigned URL (1시간 유효)
 * @property {string} downloadFileName - 원본 파일명
 */

/**
 * @typedef {Object} ApiResponse
 * @property {string} status - 상태 (success | error)
 * @property {string} code - 상태 코드
 * @property {*} data - 응답 데이터
 * @property {string} message - 메시지
 */

/**
 * 작업 파일 다운로드 URL 생성 (Presigned URL)
 * @param {string} fileNo - 파일 번호 (필수)
 * @param {BucketType} [bucketType='order'] - 버킷 타입 (order: 원본, complete: 산출물)
 * @returns {Promise<ApiResponse<PresignedDownloadData>>} Presigned URL 응답
 * 
 * @example
 * // 원본 파일 다운로드 URL 생성
 * const response = await getPresignedDownloadUrl('12345', 'order');
 * console.log(response.data.downloadUrl);
 * 
 * @example
 * // 산출물 파일 다운로드 URL 생성
 * const response = await getPresignedDownloadUrl('12345', 'complete');
 * window.open(response.data.downloadUrl, '_blank');
 */
export async function getPresignedDownloadUrl(fileNo, bucketType = 'order') {
  if (!fileNo) {
    throw new Error('fileNo is required');
  }
  
  const validBucketTypes = ['order', 'complete'];
  if (!validBucketTypes.includes(bucketType)) {
    throw new Error(`bucketType must be one of: ${validBucketTypes.join(', ')}`);
  }
  
  return post(ENDPOINTS.PRESIGNED_DOWNLOAD, {
    fileNo: String(fileNo),
    bucketType,
  });
}

export default {
  getPresignedDownloadUrl,
};
