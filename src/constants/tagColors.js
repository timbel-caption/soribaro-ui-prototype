/**
 * 태그명 → 고유 색상 매핑
 * 프롬프트 관리/상세 페이지에서 공유
 */
const TAG_COLOR_MAP = {
  '기본':       { color: '#1976d2', border: '#64b5f6' },
  '비디오':     { color: '#0097a7', border: '#4dd0e1' },
  '오디오':     { color: '#7b1fa2', border: '#ba68c8' },
  '영화':       { color: '#f57c00', border: '#ffb74d' },
  '강의':       { color: '#388e3c', border: '#81c784' },
  '뉴스':       { color: '#c62828', border: '#ef9a9a' },
  '회의':       { color: '#3949ab', border: '#7986cb' },
  '다큐멘터리': { color: '#e0a040', border: '#e0a040' },
};

const FALLBACK_COLOR = { color: 'var(--text-secondary)', border: 'var(--border-color)' };

export function getTagColor(tagName) {
  return TAG_COLOR_MAP[tagName] || FALLBACK_COLOR;
}

export default TAG_COLOR_MAP;
