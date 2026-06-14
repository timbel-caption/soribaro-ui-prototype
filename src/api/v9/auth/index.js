/**
 * Auth API (V9 경로)
 * 인증 관련 API — work-bo V9AuthController (/v9/api/auth/*)
 * 발급되는 JWT 는 V8/V9 API 공용이므로 기존 v8 API 호출에도 그대로 사용된다.
 */
import { get, post } from '../client';

// 엔드포인트
const ENDPOINTS = {
  LOGIN: '/v9/api/auth/login',
  REFRESH: '/v9/api/auth/refresh',
  STATUS: '/v9/api/auth/status',
  ME: '/v9/api/auth/me',
  LOGOUT: '/v9/api/auth/logout',
};

/**
 * @typedef {Object} User
 * @property {number} membNo - 회원 번호
 * @property {string} email - 이메일
 * @property {string} name - 이름
 * @property {string[]} roles - 역할 목록
 */

/**
 * @typedef {Object} LoginData
 * @property {string} accessToken - JWT Access Token
 * @property {string} refreshToken - JWT Refresh Token
 * @property {string} tokenType - 토큰 타입 (Bearer)
 * @property {number} expiresIn - 만료 시간 (초)
 * @property {User} user - 사용자 정보
 */

/**
 * @typedef {Object} RefreshData
 * @property {string} accessToken - JWT Access Token
 * @property {string} refreshToken - JWT Refresh Token
 * @property {string} tokenType - 토큰 타입 (Bearer)
 * @property {number} expiresIn - 만료 시간 (초)
 */

/**
 * @typedef {Object} AuthStatusData
 * @property {boolean} valid - 토큰 유효 여부
 * @property {string} message - 메시지
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
 * 로그인
 * @param {string} email - 이메일
 * @param {string} password - 비밀번호
 * @returns {Promise<ApiResponse<LoginData>>} 로그인 응답
 */
export async function login(email, password) {
  return post(ENDPOINTS.LOGIN, { email, password }, { skipAuth: true });
}

/**
 * 토큰 갱신
 * @param {string} refreshToken - Refresh Token
 * @returns {Promise<ApiResponse<RefreshData>>} 토큰 갱신 응답
 */
export async function refresh(refreshToken) {
  return post(ENDPOINTS.REFRESH, { refreshToken }, { skipAuth: true });
}

/**
 * 토큰 상태 확인
 * @returns {Promise<ApiResponse<AuthStatusData>>} 토큰 상태 응답
 */
export async function getAuthStatus() {
  return get(ENDPOINTS.STATUS);
}

/**
 * 사용자 정보 조회
 * @returns {Promise<ApiResponse<User>>} 사용자 정보 응답
 */
export async function getMe() {
  return get(ENDPOINTS.ME);
}

/**
 * 로그아웃
 * @param {string} refreshToken - Refresh Token
 * @param {string} email - 이메일
 * @returns {Promise<ApiResponse<null>>} 로그아웃 응답
 */
export async function logout(refreshToken, email) {
  return post(ENDPOINTS.LOGOUT, { refreshToken, email });
}

export default {
  login,
  refresh,
  getAuthStatus,
  getMe,
  logout,
};
