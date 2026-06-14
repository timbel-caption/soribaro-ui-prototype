// MinIO Storage API Service
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const storageApi = {
  // 파일 목록 조회
  async listFiles(prefix = '') {
    const url = prefix
      ? `${API_BASE_URL}/storage/files?prefix=${encodeURIComponent(prefix)}`
      : `${API_BASE_URL}/storage/files`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }
    return response.json();
  },

  // Pre-signed URL 조회
  async getPresignedUrl(objectName, expiry = 3600) {
    const response = await fetch(
      `${API_BASE_URL}/storage/url/${encodeURIComponent(objectName)}?expiry=${expiry}`
    );
    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.statusText}`);
    }
    return response.json();
  },

  // 직접 접근 URL 조회
  async getDirectUrl(objectName) {
    const response = await fetch(
      `${API_BASE_URL}/storage/direct-url/${encodeURIComponent(objectName)}`
    );
    if (!response.ok) {
      throw new Error(`Failed to get direct URL: ${response.statusText}`);
    }
    return response.json();
  },

  // 파일 정보 조회
  async getFileInfo(objectName) {
    const response = await fetch(
      `${API_BASE_URL}/storage/info/${encodeURIComponent(objectName)}`
    );
    if (!response.ok) {
      throw new Error(`Failed to get file info: ${response.statusText}`);
    }
    return response.json();
  },

  // 파일 업로드
  async uploadFile(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/storage/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }
    return response.json();
  },

  // 파일 삭제
  async deleteFile(objectName) {
    const response = await fetch(
      `${API_BASE_URL}/storage/${encodeURIComponent(objectName)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      throw new Error(`Failed to delete file: ${response.statusText}`);
    }
    return response.json();
  },
};

export default storageApi;
