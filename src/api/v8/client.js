/**
 * V8 API 클라이언트
 * VITE_V8_API_URL을 baseUrl로 사용하고,
 * localStorage 우선, 쿠키(shared_access_token) fallback으로 인증
 */

import { getAccessToken } from '../../utils/cookieAuth';
// [프로토타입] 백엔드 미연동 — 모든 요청을 목 디스패처로 처리
import { mockRequest } from '../../mocks/mockDispatcher';

/**
 * 인증 토큰 조회
 * localStorage accessToken → 쿠키 shared_access_token 순
 * @returns {string|null} 토큰
 */
export const getToken = () => {
  const localToken = localStorage.getItem('accessToken');
  if (localToken) {
    console.log('[getToken] source: localStorage');
    return localToken;
  }
  const cookieToken = getAccessToken();
  if (cookieToken) {
    console.log('[getToken] source: cookie (shared_access_token)');
    return cookieToken;
  }
  console.log('[getToken] source: none');
  return null;
};

/**
 * V8 API baseUrl 조회
 * @returns {string} baseUrl
 */
const getBaseUrl = () => {
  return import.meta.env.VITE_V8_API_URL || import.meta.env.VITE_API_URL || '';
};

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
 * API 요청을 위한 공통 fetch 함수
 * @param {string} endpoint - API 엔드포인트
 * @param {object} options - fetch 옵션
 * @param {boolean} [options.skipAuth=false] - 인증 헤더 생략 여부
 * @returns {Promise<any>} API 응답 데이터
 */
export async function apiRequest(endpoint, options = {}) {
  // [프로토타입] 실제 네트워크 대신 목 응답 반환
  return mockRequest(endpoint, options);

  // eslint-disable-next-line no-unreachable
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const { skipAuth = false, ...fetchOptions } = options;

  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  // 인증 토큰 추가 (skipAuth가 false인 경우)
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const config = {
    ...fetchOptions,
    headers: {
      ...defaultHeaders,
      ...fetchOptions.headers,
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
 * @param {object} [params={}] - 쿼리 파라미터
 * @param {object} [options={}] - 추가 옵션 (skipAuth 등)
 * @returns {Promise<any>}
 */
export async function get(endpoint, params = {}, options = {}) {
  const queryString = buildQueryString(params);
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;
  
  return apiRequest(url, {
    method: 'GET',
    ...options,
  });
}

/**
 * POST 요청
 * @param {string} endpoint - API 엔드포인트
 * @param {object} [data={}] - 요청 바디
 * @param {object} [options={}] - 추가 옵션 (skipAuth 등)
 * @returns {Promise<any>}
 */
export async function post(endpoint, data = {}, options = {}) {
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
    ...options,
  });
}

/**
 * PUT 요청
 * @param {string} endpoint - API 엔드포인트
 * @param {object} [data={}] - 요청 바디
 * @param {object} [options={}] - 추가 옵션 (skipAuth 등)
 * @returns {Promise<any>}
 */
export async function put(endpoint, data = {}, options = {}) {
  return apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...options,
  });
}

/**
 * DELETE 요청
 * @param {string} endpoint - API 엔드포인트
 * @param {object} [options={}] - 추가 옵션 (skipAuth 등)
 * @returns {Promise<any>}
 */
export async function del(endpoint, options = {}) {
  return apiRequest(endpoint, {
    method: 'DELETE',
    ...options,
  });
}

/**
 * PATCH 요청
 * @param {string} endpoint - API 엔드포인트
 * @param {object} [data={}] - 요청 바디
 * @param {object} [options={}] - 추가 옵션 (skipAuth 등)
 * @returns {Promise<any>}
 */
export async function patch(endpoint, data = {}, options = {}) {
  return apiRequest(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
    ...options,
  });
}

export default {
  get,
  post,
  put,
  del,
  patch,
  apiRequest,
  getToken,
  ApiError,
};
