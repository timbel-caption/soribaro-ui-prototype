/**
 * Profile API (V9)
 * 회원 프로필 조회 API
 *
 * 기본 경로: /v9/api/profile
 *
 * 캐싱:
 *  - 서버: EhCache profileCache (TTL 10분)
 *  - 클라이언트: 인메모리 Map 캐시 (TTL 5분) + 동시 요청 중복 방지
 *
 * 응답 필드:
 *  - membNo: 회원 번호
 *  - membId: 회원 ID (이메일)
 *  - membNm: 회원명
 *  - membLvl: 회원 등급
 *  - mblRecvYn: 문자 수신 여부 (Y/N)
 *  - mblNotiYn: 알림 수신 여부 (Y/N)
 */
import { get } from '../client';

const ENDPOINTS = {
  PROFILE: '/v9/api/profile',
};

const cache = new Map();
const pending = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 이메일로 회원 프로필 조회 (캐시 적용)
 * @param {string} email - 조회할 회원 이메일 (필수)
 * @returns {Promise<{status: string, code: number, data: Object, message: string}>}
 */
export async function getProfile(email) {
  const cached = cache.get(email);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  if (pending.has(email)) {
    return pending.get(email);
  }
  const promise = get(ENDPOINTS.PROFILE, { email }).then((res) => {
    if (res?.status === 'SUCCESS') {
      cache.set(email, { data: res, timestamp: Date.now() });
    }
    pending.delete(email);
    return res;
  }).catch((err) => {
    pending.delete(email);
    throw err;
  });
  pending.set(email, promise);
  return promise;
}

/**
 * 프로필 캐시 무효화
 * @param {string} [email] - 특정 email 캐시만 삭제. 생략 시 전체 캐시 초기화
 */
export function clearProfileCache(email) {
  if (email) cache.delete(email);
  else cache.clear();
}

export default {
  getProfile,
  clearProfileCache,
};
