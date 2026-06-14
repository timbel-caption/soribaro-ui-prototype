/**
 * 쿠키 기반 인증 유틸 (COOKIE_GUIDE §3)
 * Editor 측: 쿠키에서 Access Token 읽기 전용 (COOKIE_GUIDE §4, work_fo 호환)
 */

import { COOKIE_ACCESS_TOKEN } from '../constants/auth';

/**
 * 쿠키 값을 읽습니다.
 * @param {string} name - 쿠키 이름
 * @returns {string|null} 쿠키 값 또는 null
 */
function getCookie(name) {
  const encoded = encodeURIComponent(name);
  const cookies = document.cookie.split('; ');

  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split('=');
    if (key === encoded) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

/**
 * 쿠키에서 Access Token을 읽습니다.
 * dev-editor.soribaro.com에서 호출 (COOKIE_GUIDE §3)
 * @returns {string|null} Access Token 또는 null
 */
export function getAccessToken() {
  const token = getCookie(COOKIE_ACCESS_TOKEN);
  console.log('[cookieAuth] getAccessToken:', token ? 'present' : 'absent');
  return token;
}
