/**
 * CPS 계산을 위한 문자 수 계산 유틸리티
 *
 * 프리셋별 계산 방식:
 *   simple             — 모든 글자 = 1, 공백 제외
 *   simpleWithSpaces   — 모든 글자 = 1, 공백 = 1
 *   cjkWeighted        — CJK = 1.0, 반각 = 0.5, 공백 제외
 *   cjkWeightedWithSpaces — CJK = 1.0, 반각(공백 포함) = 0.5
 *
 * 공통 전처리 (모든 프리셋):
 *   - HTML 태그 제거
 *   - 이모지는 1자로 계산 (grapheme 단위)
 *   - 제어 문자 제외
 *   - Zero-width / 방향 제어 문자 제외
 */

export const CHAR_COUNT_PRESETS = {
  simple: 'simple',
  simpleWithSpaces: 'simpleWithSpaces',
  cjkWeighted: 'cjkWeighted',
  cjkWeightedWithSpaces: 'cjkWeightedWithSpaces',
};

/**
 * 항상 제외할 제어/비표시 문자인지 확인
 */
function isControlChar(char) {
  const code = char.charCodeAt(0);

  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  if (code === 0x200b || code === 0xfeff) return true;
  if (code === 0x200e || code === 0x200f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;

  return false;
}

/**
 * CJK (전각) 문자인지 확인
 */
function isCjkChar(char) {
  const code = char.charCodeAt(0);

  if (code >= 0xac00 && code <= 0xd7af) return true;
  if (code >= 0x1100 && code <= 0x11ff) return true;
  if (code >= 0x3130 && code <= 0x318f) return true;
  if (code >= 0x4e00 && code <= 0x9fff) return true;
  if (code >= 0x3400 && code <= 0x4dbf) return true;
  if (code >= 0x3040 && code <= 0x309f) return true;
  if (code >= 0x30a0 && code <= 0x30ff) return true;
  if (code >= 0x3000 && code <= 0x303f) return true;
  if (code >= 0xff00 && code <= 0xffef) return true;
  if (code >= 0x2e80 && code <= 0x2eff) return true;
  if (code >= 0x2f00 && code <= 0x2fdf) return true;
  if (code >= 0x3200 && code <= 0x32ff) return true;
  if (code >= 0x3300 && code <= 0x33ff) return true;

  return false;
}

/**
 * 프리셋에 따른 단일 문자 처리 전략을 반환
 */
function getCharStrategy(preset) {
  const includeSpaces =
    preset === CHAR_COUNT_PRESETS.simpleWithSpaces ||
    preset === CHAR_COUNT_PRESETS.cjkWeightedWithSpaces;

  const useWeight =
    preset === CHAR_COUNT_PRESETS.cjkWeighted ||
    preset === CHAR_COUNT_PRESETS.cjkWeightedWithSpaces;

  return (char) => {
    if (isControlChar(char)) return 0;
    if (char === ' ') return includeSpaces ? (useWeight ? 0.5 : 1) : 0;
    return useWeight ? (isCjkChar(char) ? 1.0 : 0.5) : 1;
  };
}

/**
 * CPS 계산을 위한 문자 수 계산
 * @param {string} text - 자막 텍스트
 * @param {string} [preset='cjkWeighted'] - 카운트 프리셋
 * @returns {number} 가중치가 적용된 문자 수
 */
export function countCharactersForCps(text, preset = CHAR_COUNT_PRESETS.cjkWeighted) {
  if (!text) return 0;

  const s = text.replace(/<[^>]*>/g, '');
  const weightOf = getCharStrategy(preset);
  let count = 0;

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    for (const { segment } of segmenter.segment(s)) {
      if (segment === '\r\n') continue;

      if (segment.length === 1) {
        count += weightOf(segment);
      } else {
        count += 1;
      }
    }
  } else {
    for (const segment of [...s]) {
      if (segment === '\r' || segment === '\n') continue;

      if (segment.length === 1) {
        count += weightOf(segment);
      } else {
        count += 1;
      }
    }
  }

  return count;
}
