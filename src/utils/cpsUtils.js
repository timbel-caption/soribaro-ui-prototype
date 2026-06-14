/**
 * CPS (Characters Per Second) 계산 유틸리티
 *
 * SubtitleList(UI 표시)와 validationRules(검수) 모두 이 모듈을 통해
 * 동일한 방식으로 CPS를 계산합니다.
 *
 * 문자 수 계산은 characterCount.js의 countCharactersForCps를 사용하며,
 * 프리셋에 따라 가중치 방식이 달라집니다.
 * @see characterCount.js - CHAR_COUNT_PRESETS
 */

import { countCharactersForCps, CHAR_COUNT_PRESETS } from './characterCount';

export { countCharactersForCps, CHAR_COUNT_PRESETS };

/**
 * CPS 계산
 * @param {string} text - 자막 텍스트
 * @param {number} duration - 자막 지속 시간 (초)
 * @param {string} [preset] - 카운트 프리셋 (기본: cjkWeighted)
 * @returns {number} CPS 값 (소수점 이하 포함)
 */
export function calculateCps(text, duration, preset) {
  const charCount = countCharactersForCps(text, preset);
  if (duration <= 0 || charCount <= 0) return 0;
  return charCount / duration;
}

/**
 * UI 표시용 CPS 정보 계산
 * @param {string} text - 자막 텍스트
 * @param {number} duration - 자막 지속 시간 (초)
 * @param {string} [preset] - 카운트 프리셋 (기본: cjkWeighted)
 * @returns {{ charCount: number, lineLengths: number[], lineCountsStr: string, cps: number }}
 */
export function getSubtitleCpsInfo(text, duration, preset) {
  const charCount = countCharactersForCps(text, preset);
  const lines = (text || '').split('\n');
  const lineLengths = lines.map((line) => countCharactersForCps(line, preset));
  const cps =
    duration > 0 && charCount > 0
      ? parseFloat((charCount / duration).toFixed(1))
      : 0;

  const formatLen = (l) => (l % 1 === 0 ? l : l.toFixed(1));
  const lineCountsStr =
    lines.length > 1 ? `(${lineLengths.map(formatLen).join('/')})` : '';

  return { charCount, lineLengths, lineCountsStr, cps };
}
