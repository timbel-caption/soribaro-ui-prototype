import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import koWorktool from './locales/ko/worktool.json';
import enWorktool from './locales/en/worktool.json';
import jaWorktool from './locales/ja/worktool.json';
import zhWorktool from './locales/zh/worktool.json';
import hiWorktool from './locales/hi/worktool.json';

import koSoribaro from './locales/ko/soribaro.json';
import enSoribaro from './locales/en/soribaro.json';
import jaSoribaro from './locales/ja/soribaro.json';
import zhSoribaro from './locales/zh/soribaro.json';
import hiSoribaro from './locales/hi/soribaro.json';

import koCommon from './locales/ko/common.json';
import enCommon from './locales/en/common.json';
import jaCommon from './locales/ja/common.json';
import zhCommon from './locales/zh/common.json';
import hiCommon from './locales/hi/common.json';

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en', 'ja', 'zh', 'hi'],
    ns: ['worktool', 'soribaro', 'common'],
    defaultNS: 'worktool',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'soribaro-language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    resources: {
      ko: { worktool: koWorktool, soribaro: koSoribaro, common: koCommon },
      en: { worktool: enWorktool, soribaro: enSoribaro, common: enCommon },
      ja: { worktool: jaWorktool, soribaro: jaSoribaro, common: jaCommon },
      zh: { worktool: zhWorktool, soribaro: zhSoribaro, common: zhCommon },
      hi: { worktool: hiWorktool, soribaro: hiSoribaro, common: hiCommon },
    },
  });

export default i18next;
