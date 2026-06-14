/**
 * API 클라이언트 기본 설정
 * 모든 API 요청의 기반이 되는 공통 함수들
 */

// [프로토타입] 백엔드 미연동 — 모든 요청을 목 디스패처로 처리
import { mockRequest } from '../mocks/mockDispatcher';

// 기본 API URL (환경변수에서 가져옴)
const getBaseUrl = () => {
  return import.meta.env.VITE_API_URL || '';
};

/**
 * API 요청을 위한 공통 fetch 함수
 * @param {string} endpoint - API 엔드포인트 (예: '/api/translation-work')
 * @param {object} options - fetch 옵션
 * @returns {Promise<any>} API 응답 데이터
 */
export async function apiRequest(endpoint, options = {}) {
  // [프로토타입] 실제 네트워크 대신 목 응답 반환
  return mockRequest(endpoint, options);

  // eslint-disable-next-line no-unreachable
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `HTTP error! status: ${response.status}`,
        response.status,
        errorData
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // 에러 유형별 처리
    if (error.name === 'AbortError') {
      throw new ApiError('요청이 취소되었습니다.', -1, { type: 'abort' });
    }
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new ApiError('네트워크 연결을 확인해주세요.', -2, { type: 'network' });
    }
    
    throw new ApiError(error.message || 'Unknown error', 0, { type: 'unknown' });
  }
}

/**
 * GET 요청
 * @param {string} endpoint - API 엔드포인트
 * @param {object} params - 쿼리 파라미터
 * @returns {Promise<any>}
 */
export async function get(endpoint, params = {}) {
  const queryString = buildQueryString(params);
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;
  
  return apiRequest(url, {
    method: 'GET',
  });
}

/**
 * POST 요청
 * @param {string} endpoint - API 엔드포인트
 * @param {object} data - 요청 바디
 * @returns {Promise<any>}
 */
export async function post(endpoint, data = {}) {
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * PUT 요청
 * @param {string} endpoint - API 엔드포인트
 * @param {object} data - 요청 바디
 * @returns {Promise<any>}
 */
export async function put(endpoint, data = {}) {
  return apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * DELETE 요청
 * @param {string} endpoint - API 엔드포인트
 * @returns {Promise<any>}
 */
export async function del(endpoint) {
  return apiRequest(endpoint, {
    method: 'DELETE',
  });
}

/**
 * 쿼리 스트링 생성
 * @param {object} params - 파라미터 객체
 * @returns {string} 쿼리 스트링
 */
function buildQueryString(params) {
  const filteredParams = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  
  return filteredParams.join('&');
}

/**
 * API 에러 클래스
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export default {
  get,
  post,
  put,
  del,
  apiRequest,
  ApiError,
};
