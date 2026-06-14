import i18n from '../i18n';
import LANGUAGES from '../constants/language.json';

const legacyCodeMap = LANGUAGES.reduce((acc, lang) => {
  if (lang.legacyCode) acc[lang.legacyCode] = lang;
  return acc;
}, {});

const isoCodeMap = LANGUAGES.reduce((acc, lang) => {
  if (lang.code) acc[lang.code] = lang;
  return acc;
}, {});

/**
 * 현재 i18n 언어에 따라 적절한 언어 이름을 반환
 * @param {{ name: string, enName?: string }} lang - language.json 항목
 * @returns {string}
 */
export function getLanguageDisplayName(lang) {
  if (!lang) return '';
  const currentLang = i18n.language || 'ko';
  if (currentLang === 'ko') return lang.name;
  return lang.enName || lang.name;
}

/**
 * 레거시 언어 코드(TRNS_LANG_CD)로 현재 언어에 맞는 이름 반환
 * @param {string} legacyCode - 예: "TRN0001"
 * @param {string} [fallback] - 매핑 실패 시 반환값
 * @returns {string}
 */
export function getLanguageNameByLegacyCode(legacyCode, fallback) {
  const lang = legacyCodeMap[legacyCode];
  if (!lang) return fallback || legacyCode || '';
  return getLanguageDisplayName(lang);
}

/**
 * ISO 언어 코드로 현재 언어에 맞는 이름 반환
 * @param {string} isoCode - 예: "ko", "en"
 * @param {string} [fallback] - 매핑 실패 시 반환값
 * @returns {string}
 */
export function getLanguageNameByCode(isoCode, fallback) {
  const lang = isoCodeMap[isoCode];
  if (!lang) return fallback || isoCode || '';
  return getLanguageDisplayName(lang);
}
