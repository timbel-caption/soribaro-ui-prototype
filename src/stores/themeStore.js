import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 사용 가능한 테마 목록
export const THEMES = {
  default: {
    name: 'default',
    label: '기본',
    icon: '🌌',
  },
  light: {
    name: 'light',
    label: '라이트',
    icon: '☀️',
  },
  dark: {
    name: 'dark',
    label: '다크',
    icon: '🌙',
  },
};

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'default',
      
      // 테마 변경
      setTheme: (theme) => {
        if (THEMES[theme]) {
          set({ theme });
          // DOM에 테마 적용
          document.documentElement.setAttribute('data-theme', theme);
        }
      },
      
      // 다음 테마로 순환
      cycleTheme: () => {
        const themeKeys = Object.keys(THEMES);
        const currentIndex = themeKeys.indexOf(get().theme);
        const nextIndex = (currentIndex + 1) % themeKeys.length;
        get().setTheme(themeKeys[nextIndex]);
      },
      
      // 현재 테마 정보 가져오기
      getCurrentThemeInfo: () => {
        return THEMES[get().theme] || THEMES.default;
      },
      
      // 초기화 (DOM에 저장된 테마 적용)
      initTheme: () => {
        const { theme } = get();
        document.documentElement.setAttribute('data-theme', theme);
      },
    }),
    {
      name: 'soribaro-theme-storage',
    }
  )
);



