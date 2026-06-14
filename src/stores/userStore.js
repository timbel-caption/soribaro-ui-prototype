/**
 * User Store
 * 로그인한 사용자 정보를 관리합니다.
 */
import { create } from 'zustand';
import { getMe, login as authLogin, logout as authLogout } from '../api/v9/auth';
import {
  schedulePreemptiveRefresh,
  cancelPreemptiveRefresh,
} from '../api/v9/client';

/**
 * @typedef {Object} UserInfo
 * @property {number} membNo - 회원 번호
 * @property {string} membId - 회원 ID (이메일)
 * @property {string} membNm - 회원 이름
 * @property {string} membTp - 회원 유형 (A: 관리자 등)
 * @property {string} membLvl - 회원 레벨
 * @property {string[]} roles - 역할 목록 (ROLE_SUPER 등)
 */

export const useUserStore = create((set, get) => ({
  // ========== 상태 ==========
  
  /** @type {UserInfo|null} 사용자 정보 */
  user: null,
  
  /** @type {boolean} 로딩 중 여부 */
  isLoading: false,
  
  /** @type {boolean} 인증 여부 */
  isAuthenticated: false,
  
  /** @type {string|null} 에러 메시지 */
  error: null,

  // ========== 액션 ==========

  /**
   * 사용자 정보 조회 (API 호출)
   * @returns {Promise<boolean>} 성공 여부
   */
  fetchUser: async () => {
    if (localStorage.getItem('loggedOut') === 'true') {
      set({ user: null, isAuthenticated: false, isLoading: false, error: null });
      return false;
    }

    set({ isLoading: true, error: null });
    
    try {
      const response = await getMe();

      if (response?.status === 'SUCCESS' && response?.data) {
        // membId 에 trailing/leading space 가 섞여 들어오는 케이스를 차단.
        // (DB 회원 row 의 컬럼에 공백이 끼어있으면 이후 코멘트 created_by 등
        //  본인 비교에서 String.equals 실패 → "관리자" 폴백으로 빠지는 회귀가 있었음)
        const raw = response.data;
        const cleaned =
          typeof raw?.membId === 'string'
            ? { ...raw, membId: raw.membId.trim() }
            : raw;
        set({
          user: cleaned,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });

        return true;
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: response?.message || '사용자 정보를 불러올 수 없습니다.',
        });
        return false;
      }
    } catch (error) {
      console.error('사용자 정보 조회 실패:', error);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error.message || '사용자 정보 조회에 실패했습니다.',
      });
      return false;
    }
  },

  /**
   * 로그인 (v9 Auth API)
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  login: async (email, password) => {
    try {
      const response = await authLogin(email, password);

      if (response?.status === 'SUCCESS' && response?.data) {
        const { accessToken, refreshToken } = response.data;
        localStorage.removeItem('loggedOut');
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        // 새 accessToken 의 만료 기준으로 선제 갱신 타이머 등록
        schedulePreemptiveRefresh();

        const ok = await get().fetchUser();
        return ok
          ? { success: true }
          : { success: false, message: '사용자 정보를 불러올 수 없습니다.' };
      }

      return { success: false, message: response?.message || '로그인에 실패했습니다.' };
    } catch (error) {
      console.error('로그인 실패:', error);
      return { success: false, message: error?.data?.message || error.message || '로그인에 실패했습니다.' };
    }
  },

  /**
   * 로그아웃 (v9 Auth API + 토큰 제거)
   */
  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      const email = get().user?.membId;
      if (refreshToken && email) {
        await authLogout(refreshToken, email);
      }
    } catch (error) {
      console.error('로그아웃 API 실패 (무시):', error);
    } finally {
      // 진행 중인 선제 갱신 타이머를 해제 — 로그아웃 후 의도치 않은 refresh 차단
      cancelPreemptiveRefresh();
      localStorage.setItem('loggedOut', 'true');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  /**
   * 사용자 정보 초기화 (로그아웃 시)
   */
  clearUser: () => {
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  /**
   * 에러 초기화
   */
  clearError: () => {
    set({ error: null });
  },

  // ========== Getter ==========

  /**
   * 회원 번호 가져오기
   * @returns {number|null}
   */
  getMembNo: () => get().user?.membNo ?? null,

  /**
   * 회원 이름 가져오기
   * @returns {string|null}
   */
  getMembNm: () => get().user?.membNm ?? null,

  /**
   * 역할 확인
   * @param {string} role - 확인할 역할 (예: 'ROLE_SUPER')
   * @returns {boolean}
   */
  hasRole: (role) => {
    const roles = get().user?.roles ?? [];
    return roles.includes(role);
  },

  /**
   * 관리자 여부 확인
   * @returns {boolean}
   */
  isAdmin: () => {
    const membLvl = String(get().user?.membLvl ?? '');
    return get().hasRole('ROLE_ADMIN') || get().hasRole('ROLE_SUPER') || membLvl === '2' || membLvl === '4';
  },

  /**
   * 수강생 여부 확인 (TRAINEE 전용 메뉴/라우팅 가드용)
   * - roles 배열에 ROLE_TRAINEE 가 포함되어 있거나
   * - membLvl === '5' (USER_LEVEL 의 "수강생" 코드) 인 경우
   *
   * 관리자(ROLE_ADMIN/SUPER)는 동시에 TRAINEE 일 수 있는데, 권한 라우팅에서는
   * 관리자가 우선되어야 하므로 isTrainee 호출부에서 isAdmin() 우선 분기할 것.
   * 여기서는 raw 한 "수강생 권한 보유" 여부만 반환한다.
   * @returns {boolean}
   */
  isTrainee: () => {
    const membLvl = String(get().user?.membLvl ?? '');
    return get().hasRole('ROLE_TRAINEE') || membLvl === '5';
  },

  /**
   * 오직 수강생인지 (관리자 권한이 없는 순수 TRAINEE)
   * - 사이드바 / 라우팅 가드의 결정 기준
   * @returns {boolean}
   */
  isTraineeOnly: () => {
    return get().isTrainee() && !get().isAdmin();
  },
}));
