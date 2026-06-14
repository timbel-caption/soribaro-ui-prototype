/**
 * Tools API (V9)
 * HWP 내보내기 등 도구 관련 API
 */
import { getToken } from '../client';

const ENDPOINTS = {
  HWP_EXPORT: '/v9/api/tools/hwp/export',
  HWP_EXPORT_RAW: '/v9/api/tools/hwp/export-raw',
};

/**
 * HWP 내보내기
 * HWP 템플릿 파일과 projectFileId를 전송하여 자막이 삽입된 HWP 파일을 반환받는다.
 *
 * @param {File} file - HWP 템플릿 파일 (.hwp)
 * @param {string} projectFileId - 프로젝트 파일 ID
 * @returns {Promise<Blob>} HWP 바이너리 Blob
 * @throws {Error} 에러 시 서버 메시지 포함
 */
export async function exportHwp(file, projectFileId) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.HWP_EXPORT}?projectFileId=${encodeURIComponent(projectFileId)}`;

  const formData = new FormData();
  formData.append('file', file);

  const headers = {};
  const token = getToken();
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
    throw new Error(errorData.message || `HWP 내보내기 실패 (HTTP ${response.status})`);
  }

  return response.blob();
}

/**
 * HWP 내보내기 (JSON 직접 전달)
 * 자막 JSON을 직접 전달하여 HWP 템플릿에 삽입된 파일을 반환받는다.
 *
 * @param {File} file - HWP 템플릿 파일 (.hwp)
 * @param {Array} subtitles - 자막 배열 [{start, end, speaker, speakerName, text}, ...]
 * @returns {Promise<Blob>} HWP 바이너리 Blob
 * @throws {Error} 에러 시 서버 메시지 포함
 */
export async function exportHwpRaw(file, subtitles) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${ENDPOINTS.HWP_EXPORT_RAW}`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('subtitleJson', JSON.stringify(subtitles));

  const headers = {};
  const token = getToken();
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
    throw new Error(errorData.message || `HWP 내보내기 실패 (HTTP ${response.status})`);
  }

  return response.blob();
}

export default { exportHwp, exportHwpRaw };
