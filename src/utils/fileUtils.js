/**
 * 파일명에서 이모지 등 4바이트 UTF-8 문자를 제거한다.
 * DB 컬럼이 utf8(3바이트)인 경우 이모지가 포함되면 INSERT 실패하므로
 * 업로드 전에 반드시 sanitize해야 한다.
 *
 * @param {string} name - 원본 파일명
 * @returns {string} sanitize된 파일명
 */
export function sanitizeFileName(name) {
  if (!name) return 'untitled';

  const dotIdx = name.lastIndexOf('.');
  const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;

  const sanitized = base.replace(
    /[\u{10000}-\u{10FFFF}]|[\uD800-\uDFFF]/gu,
    '',
  ).trim();

  return (sanitized || 'untitled') + ext;
}
