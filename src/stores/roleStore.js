/**
 * Role Store
 * 사용자 권한을 관리합니다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Role Enum
export const Role = Object.freeze({
  START: 'START',
  MID: 'MID',
  FINAL: 'FINAL',
  START_REVIEW: 'START_REVIEW',
  MID_REVIEW: 'MID_REVIEW',
  FINAL_REVIEW: 'FINAL_REVIEW',
});

// 검수자인지 확인
export const isReviewer = (role) => 
  role?.endsWith('_REVIEW');

// 검수자의 기본 역할 가져오기 (화면 결정용)
export const getBaseRole = (role) => {
  if (role === Role.START_REVIEW) return Role.START;
  if (role === Role.MID_REVIEW) return Role.MID;
  if (role === Role.FINAL_REVIEW) return Role.FINAL;
  return role;
};

// 권한 등급 맵 (숫자가 클수록 높은 등급)
export const ROLE_LEVEL = {
  [Role.START]: 1,
  [Role.MID]: 2,
  [Role.FINAL]: 3,
};

// 권한 등급 비교: target이 current보다 높으면 true
export const isHigherRole = (targetRole, currentRole) => {
  const targetLevel = ROLE_LEVEL[getBaseRole(targetRole)] || 0;
  const currentLevel = ROLE_LEVEL[getBaseRole(currentRole)] || 0;
  return targetLevel > currentLevel;
};

// Role 정보 (i18n 키 기반)
export const ROLE_INFO = {
  [Role.START]: {
    nameKey: 'role.startName',
    descKey: 'role.startDesc',
    icon: '✏️',
  },
  [Role.MID]: {
    nameKey: 'role.midName',
    descKey: 'role.midDesc',
    icon: '🌐',
  },
  [Role.FINAL]: {
    nameKey: 'role.finalName',
    descKey: 'role.finalDesc',
    icon: '🌐',
  },
  [Role.START_REVIEW]: {
    nameKey: 'role.startReviewName',
    descKey: 'role.startReviewDesc',
    icon: '✅',
  },
  [Role.MID_REVIEW]: {
    nameKey: 'role.midReviewName',
    descKey: 'role.midReviewDesc',
    icon: '✅',
  },
  [Role.FINAL_REVIEW]: {
    nameKey: 'role.finalReviewName',
    descKey: 'role.finalReviewDesc',
    icon: '✅',
  },
};

export const useRoleStore = create(
  persist(
    (set, get) => ({
      // 현재 권한 (기본값: START)
      role: Role.MID,

      // ========== 액션 ==========

      // 권한 설정
      setRole: (role) => {
        if (Object.values(Role).includes(role)) {
          set({ role });
        } else {
          console.warn(`Invalid role: ${role}`);
        }
      },

      // 권한 확인
      hasRole: (requiredRole) => {
        return get().role === requiredRole;
      },

      // 현재 권한이 특정 권한 중 하나인지 확인
      hasAnyRole: (roles) => {
        return roles.includes(get().role);
      },

      // 권한 초기화 (START로)
      resetRole: () => {
        set({ role: Role.START });
      },

      // 현재 권한 정보 가져오기
      getRoleInfo: () => {
        const { role } = get();
        return ROLE_INFO[role] || ROLE_INFO[Role.START];
      },
    }),
    {
      name: 'app-role', // localStorage 키 이름
      // localStorage에서 복원된 role이 유효하지 않으면 기본값으로 초기화
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState };
        if (!Object.values(Role).includes(merged.role)) {
          console.warn(`[roleStore] Invalid persisted role: ${merged.role}, resetting to ${Role.START}`);
          merged.role = Role.START;
        }
        return merged;
      },
    }
  )
);
