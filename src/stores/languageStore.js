import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18next from 'i18next';

export const LANGUAGES = {
  ko: { code: 'ko', label: '한국어', flag: 'kr' },
  en: { code: 'en', label: 'English', flag: 'us' },
  ja: { code: 'ja', label: '日本語', flag: 'jp' },
  zh: { code: 'zh', label: '中文', flag: 'cn' },
  hi: { code: 'hi', label: 'हिन्दी', flag: 'in' },
};

export const useLanguageStore = create(
  persist(
    (set, get) => ({
      language: i18next.language || 'ko',

      setLanguage: (lang) => {
        if (LANGUAGES[lang]) {
          set({ language: lang });
          i18next.changeLanguage(lang);
        }
      },

      initLanguage: () => {
        const { language } = get();
        if (language && LANGUAGES[language]) {
          i18next.changeLanguage(language);
        }
      },
    }),
    {
      name: 'soribaro-language-storage',
      onRehydrateStorage: () => (state) => {
        if (state?.language) {
          i18next.changeLanguage(state.language);
        }
      },
    }
  )
);
