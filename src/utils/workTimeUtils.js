// 정산서 작업시간(분) ↔ 시·분 변환 유틸
// 저장 포맷은 항상 분(정수). UI 표시/입력 레이어에서만 시·분으로 분해/재조합한다.

/**
 * 총 분 → { h, m } 분해
 * @param {number|string} totalMin
 * @returns {{ h: number, m: number }}
 */
export const minutesToHM = (totalMin) => {
  const n = Math.max(0, Math.floor(Number(totalMin) || 0));
  return { h: Math.floor(n / 60), m: n % 60 };
};

/**
 * 시·분 → 총 분 재조합 (분이 60 이상이어도 그대로 합산)
 * @param {number|string} h
 * @param {number|string} m
 * @returns {number}
 */
export const hmToMinutes = (h, m) => {
  const hh = Math.max(0, Math.floor(Number(h) || 0));
  const mm = Math.max(0, Math.floor(Number(m) || 0));
  return hh * 60 + mm;
};

/**
 * 총 분 → 읽기용 표시 문자열
 * - hm: "1시간 30분" / "45분" / "2시간"
 * - min: "90분"
 * @param {number|string} totalMin
 * @param {'min'|'hm'} mode
 * @param {(key: string) => string} t  i18n (soribaro 네임스페이스)
 * @returns {string}
 */
export const formatWorkTime = (totalMin, mode, t) => {
  const n = Math.max(0, Math.floor(Number(totalMin) || 0));
  const minUnit = t('common.minuteUnit');
  if (mode !== 'hm') return `${n}${minUnit}`;

  const { h, m } = minutesToHM(n);
  const hourUnit = t('common.hourUnit');
  if (h > 0 && m > 0) return `${h}${hourUnit} ${m}${minUnit}`;
  if (h > 0) return `${h}${hourUnit}`;
  return `${m}${minUnit}`;
};
