/**
 * projectStatus.json 기반 프로젝트/파일 상태 표시 유틸
 */
import PROJECT_STATUS_LIST from '../constants/projectStatus.json';

const DEFAULT_COLOR = '#757575';
const WORK_START_BLOCKED_STATUSES = new Set(['REVIEWING', 'REVIEW_DONE', 'READONLY']);
const REVIEW_START_BLOCKED_STATUSES = new Set(['STANDBY', 'WORKING']);

const statusMap = PROJECT_STATUS_LIST.reduce((acc, item) => {
  acc[item.status] = item;
  return acc;
}, {});

/**
 * 상태 코드에 해당하는 한글 name 반환 (fallback용)
 * @param {string} [status] - 상태 코드
 * @returns {string} name 또는 status 그대로 (없을 때)
 */
export function getProjectStatusName(status) {
  if (status == null || status === '') return '-';
  const item = statusMap[status];
  return item ? item.name : status;
}

/**
 * 상태 코드에 대응하는 i18n 키 반환 (soribaro 네임스페이스 common 섹션)
 * @param {string} [status] - 상태 코드 (STANDBY, WORKING, ...)
 * @returns {string} i18n 키 (예: "common.status_STANDBY")
 */
export function getStatusI18nKey(status) {
  if (status == null || status === '') return '';
  return `common.status_${status}`;
}

/**
 * 상태 코드에 해당하는 색상(hex) 반환
 * @param {string} [status] - 상태 코드
 * @returns {string} hex 색상
 */
export function getProjectStatusColor(status) {
  if (status == null || status === '') return DEFAULT_COLOR;
  const item = statusMap[status];
  return item ? item.color : DEFAULT_COLOR;
}

/**
 * hex 색상을 rgba 문자열로 변환
 * @param {string} hex - #rrggbb
 * @param {number} alpha - 0~1
 */
function hexToRgba(hex, alpha) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 현재 테마가 어두운 계열인지 반환
 */
function isDarkTheme() {
  const theme = document.documentElement.getAttribute('data-theme') || 'default';
  return theme !== 'light';
}

/**
 * 색상(hex)으로부터 테마 대응 Chip sx 객체 반환
 * @param {string} color - hex 색상
 * @returns {{ backgroundColor: string, color: string, borderColor: string }}
 */
export function getChipSxFromColor(color) {
  const dark = isDarkTheme();
  return {
    backgroundColor: hexToRgba(color, dark ? 0.22 : 0.12),
    color,
    borderColor: hexToRgba(color, dark ? 0.5 : 0.4),
  };
}

/**
 * Chip 등에서 사용할 sx 색상 객체 반환 (배경/글자/테두리)
 * @param {string} [status] - 상태 코드
 * @returns {{ backgroundColor: string, color: string, borderColor: string }}
 */
export function getProjectStatusChipSx(status) {
  const color = getProjectStatusColor(status);
  return getChipSxFromColor(color);
}

/**
 * 작업자의 작업시작을 차단해야 하는 상태인지 반환
 * @param {string} [status] - 상태 코드
 * @returns {boolean}
 */
export function isWorkStartBlockedStatus(status) {
  if (status == null || status === '') return false;
  const normalizedStatus = String(status).trim().toUpperCase();
  return WORK_START_BLOCKED_STATUSES.has(normalizedStatus);
}

/**
 * 검수자의 검수시작을 차단해야 하는 상태인지 반환
 * @param {string} [status] - 상태 코드
 * @returns {boolean}
 */
export function isReviewStartBlockedStatus(status) {
  if (status == null || status === '') return false;
  const normalizedStatus = String(status).trim().toUpperCase();
  return REVIEW_START_BLOCKED_STATUSES.has(normalizedStatus);
}
