/**
 * V9 API 클라이언트
 * VITE_V9_API_URL을 baseUrl로 사용하고,
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
 * V9 API baseUrl 조회
 * @returns {string} baseUrl
 */
const getBaseUrl = () => {
  return import.meta.env.VITE_V9_API_URL || '';
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
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined && v !== null && v !== '') {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
        }
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

// 기본 fetch 타임아웃 (ms). 운영에서 자막 저장이 30s 이상 걸릴 일은 없고,
// 응답이 도착하지 않는 케이스(네트워크 끊김, LB 침묵)에서 무한 대기를 막는다.
const DEFAULT_TIMEOUT_MS = 30_000;

// 토큰 갱신 엔드포인트. apiRequest 재귀를 피하기 위해 raw fetch 로 직접 호출한다.
const REFRESH_ENDPOINT = '/v9/api/auth/refresh';

// 동시 다발 401 요청들이 같은 refresh 를 공유하도록 in-flight Promise 를 모듈 스코프에 둔다.
let refreshInFlight = null;

// 선제 갱신: 만료 ~5 분 전에 자동으로 새 토큰을 받아 두면 사용자는 401 자체를
// 마주칠 일이 없다. 401 인터셉터(아래)와 중복되지 않게 함께 동작한다.
const PREEMPTIVE_REFRESH_SAFETY_MS = 5 * 60 * 1000;
let preemptiveRefreshTimer = null;

/**
 * JWT 의 exp 클레임을 ms 단위 epoch 으로 디코드. 실패 시 null.
 * 페이로드는 base64url. exp 는 숫자라 ASCII-safe 하므로 atob 만으로 충분.
 */
function decodeJwtExpMs(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    payload += '='.repeat((4 - (payload.length % 4)) % 4);
    const json = atob(payload);
    const obj = JSON.parse(json);
    return typeof obj.exp === 'number' ? obj.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * 진행 중인 선제 갱신 타이머를 취소.
 * 로그아웃 시 외부에서 호출한다.
 */
export function cancelPreemptiveRefresh() {
  if (preemptiveRefreshTimer != null) {
    clearTimeout(preemptiveRefreshTimer);
    preemptiveRefreshTimer = null;
  }
}

/**
 * 현재 저장된 accessToken 의 만료 시점을 보고 (만료 - 5 분) 후 refresh 를 호출
 * 한다. refresh 가 끝나면 새 토큰의 만료를 기준으로 자기 자신을 다시 스케줄.
 * 토큰이 없거나 디코드 실패면 아무 일도 하지 않는다.
 *
 * 호출 시점:
 *  - 모듈 로드 직후 (페이지 새로고침/첫 진입)
 *  - 로그인 성공 직후 (userStore.login)
 *  - refresh 성공 직후 (자기 호출)
 */
export function schedulePreemptiveRefresh() {
  cancelPreemptiveRefresh();

  const token = localStorage.getItem('accessToken');
  if (!token) return;

  const expMs = decodeJwtExpMs(token);
  if (expMs == null) return;

  const now = Date.now();
  const delay = expMs - now - PREEMPTIVE_REFRESH_SAFETY_MS;

  const fire = async () => {
    preemptiveRefreshTimer = null;
    // refreshAccessTokenOnce 가 성공하면 그 안에서 schedulePreemptiveRefresh 를
    // 다시 부른다. 실패하면 다음 액션은 401 인터셉터(요청 시점)가 담당.
    await refreshAccessTokenOnce();
  };

  if (delay <= 0) {
    // 이미 5 분 이내거나 만료된 상태 — 즉시 갱신 시도
    fire();
    return;
  }
  preemptiveRefreshTimer = setTimeout(fire, delay);
}

/**
 * accessToken 1회 갱신.
 * - localStorage 의 refreshToken 으로 새 accessToken/refreshToken 을 받아 저장.
 * - 동시에 여러 호출이 와도 진행 중인 갱신을 공유한다.
 * - 실패 시 localStorage 의 토큰을 비우고 false 를 반환.
 * @returns {Promise<boolean>} 갱신 성공 여부
 */
async function refreshAccessTokenOnce() {
  if (refreshInFlight) return refreshInFlight;

  const storedRefresh = localStorage.getItem('refreshToken');
  if (!storedRefresh) return false;

  refreshInFlight = (async () => {
    try {
      const url = `${getBaseUrl()}${REFRESH_ENDPOINT}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });
      if (!res.ok) {
        // refreshToken 자체가 만료/거절된 케이스 — 더 이상 재시도 불가
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        return false;
      }
      const body = await res.json().catch(() => null);
      const data = body?.data;
      if (!data?.accessToken || !data?.refreshToken) {
        console.warn('[apiRequest] refresh 응답 형식이 비정상', body);
        return false;
      }
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      // 새 토큰의 만료 기준으로 다음 선제 갱신을 다시 잡는다.
      // (fire / 401 인터셉터 어느 경로로 들어와도 동일하게 재스케줄)
      schedulePreemptiveRefresh();
      return true;
    } catch (e) {
      console.warn('[apiRequest] refresh 호출 실패', e);
      return false;
    } finally {
      // 다음 401 발생 시 다시 시도할 수 있도록 in-flight 해제
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// 멱등(idempotent) 메서드만 자동 재시도. POST/PATCH 는 동일 요청을 두 번
// 보내면 부수효과가 두 번 발생할 수 있어 위험하므로 제외한다.
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

// 두 AbortSignal 을 OR 로 합쳐 새 signal 을 만든다. 둘 중 하나라도 abort 되면
// 결과 signal 도 abort 된다.
function linkAbortSignals(...signals) {
  const valid = signals.filter(Boolean);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  const ctrl = new AbortController();
  for (const s of valid) {
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}

/**
 * API 요청을 위한 공통 fetch 함수
 * @param {string} endpoint - API 엔드포인트
 * @param {object} options - fetch 옵션
 * @param {boolean} [options.skipAuth=false] - 인증 헤더 생략 여부
 * @param {number} [options.timeoutMs] - 명시적 타임아웃(ms). 기본 30s.
 * @param {number} [options.retry] - 멱등 메서드 한정 자동 재시도 횟수. 기본 1.
 * @returns {Promise<any>} API 응답 데이터
 */
export async function apiRequest(endpoint, options = {}) {
  // [프로토타입] 실제 네트워크 대신 목 응답 반환
  return mockRequest(endpoint, options);

  // eslint-disable-next-line no-unreachable
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const {
    skipAuth = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retry,
    signal: externalSignal,
    _retriedAfterRefresh = false,
    ...fetchOptions
  } = options;

  const method = (fetchOptions.method || 'GET').toUpperCase();
  const isIdempotent = RETRYABLE_METHODS.has(method);
  const maxRetries = retry != null ? retry : isIdempotent ? 1 : 0;

  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const attempt = async () => {
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
    const combinedSignal = linkAbortSignals(externalSignal, timeoutCtrl.signal);

    const config = {
      ...fetchOptions,
      signal: combinedSignal,
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

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;

      // 외부에서 명시적으로 abort 한 경우와 타임아웃은 구분해서 던진다.
      if (error.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw new ApiError('요청이 취소되었습니다.', -1, { type: 'abort' });
        }
        throw new ApiError('요청 시간이 초과되었습니다.', -3, { type: 'timeout', timeoutMs });
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new ApiError('네트워크 연결을 확인해주세요.', -2, { type: 'network' });
      }
      throw new ApiError(error.message || 'Unknown error', 0, { type: 'unknown' });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // 재시도는 외부 abort 가 아닌 일시적 실패(타임아웃·네트워크·5xx)만 대상.
  const isRetryable = (err) => {
    if (!(err instanceof ApiError)) return false;
    if (err.data?.type === 'abort') return false;
    if (err.data?.type === 'timeout') return true;
    if (err.data?.type === 'network') return true;
    if (typeof err.status === 'number' && err.status >= 500) return true;
    return false;
  };

  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;

      // 401 인터셉터: accessToken 만료로 보고 refreshToken 으로 새 토큰을 발급한 뒤
      // 같은 요청을 한 번만 재시도한다. 이전 401 응답은 컨트롤러 진입 전에 거절
      // 됐으므로 POST/PATCH 같은 비멱등 메서드라도 부수효과는 없다(서버 측 처리
      // 자체가 발생하지 않음).
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        !skipAuth &&
        !_retriedAfterRefresh
      ) {
        const refreshed = await refreshAccessTokenOnce();
        if (refreshed) {
          return apiRequest(endpoint, {
            ...options,
            _retriedAfterRefresh: true,
          });
        }
        // refresh 실패: 토큰은 이미 정리됨. 원래 401 을 그대로 던져서
        // 호출부(또는 상위 라우터)에 인증 만료를 알린다.
        throw err;
      }

      if (i >= maxRetries || !isRetryable(err)) throw err;
      // 짧은 백오프 후 재시도. 운영에서 잠시 끊긴 연결에 대해 사용자 체감 없이 복구.
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastError;
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

export default {
  get,
  post,
  put,
  patch,
  del,
  apiRequest,
  getToken,
  ApiError,
  schedulePreemptiveRefresh,
  cancelPreemptiveRefresh,
};

// 모듈 로드 시 한 번 시작. 페이지 새로고침/첫 진입에서 현재 accessToken 의
// 만료를 보고 (만료 - 5 분) 후 자동 갱신을 예약한다. 로그인/로그아웃 흐름은
// userStore 에서 schedulePreemptiveRefresh / cancelPreemptiveRefresh 를 직접 호출.
schedulePreemptiveRefresh();
