/**
 * 언어 코드 -> 영어 이름 매핑
 * language.json의 enName을 기반으로 변환
 * 프롬프트 템플릿의 {source_lang}, {target_lang} 치환에 사용
 */
import languages from './language.json';

const LANG_ENGLISH_NAMES = Object.fromEntries(
  languages.map((lang) => [lang.code.toLowerCase(), lang.enName])
);

/**
 * 언어 코드를 영어 이름으로 변환
 * @param {string} code - 언어 코드 (예: 'ko', 'en')
 * @returns {string} 영어 이름 (예: 'Korean', 'English'), 매핑 없으면 코드 그대로 반환
 */
export function getLangEnglishName(code) {
  if (!code) return '';
  return LANG_ENGLISH_NAMES[code.toLowerCase()] || code.toUpperCase();
}

export default LANG_ENGLISH_NAMES;
