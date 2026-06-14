export const WORK_STAT_CODES = Object.freeze({
  ASSIGN_WAITING: '00',
  RECEIVED: '01',
  WORKING_DRAFT: '02',
  DRAFT_DONE: '03',
  DRAFT_REVISING: '04',
  DRAFT_REVISED: '05',
  DRAFT_APPROVED: '06',
  WORKING_FINAL: '07',
  FINAL_DRAFT_DONE: '08',
  FINAL_REVISING: '09',
  FINAL_REVISED: '10',
  FINAL_APPROVED: '11',
});

const REVIEW_SUFFIX = '_REVIEW';

export function normalizeWorkStat(workStat) {
  if (workStat === null || workStat === undefined || workStat === '') return null;
  const asString = String(workStat);
  return asString.length === 1 ? asString.padStart(2, '0') : asString;
}

export function getBaseRoleFromWorkRole(role) {
  if (!role) return null;
  const upper = String(role).toUpperCase();
  return upper.endsWith(REVIEW_SUFFIX) ? upper.replace(REVIEW_SUFFIX, '') : upper;
}

export function getEntryWorkStatByRole(role) {
  const baseRole = getBaseRoleFromWorkRole(role);
  return baseRole === 'START'
    ? WORK_STAT_CODES.WORKING_DRAFT
    : WORK_STAT_CODES.WORKING_FINAL;
}

export function getWorkStatOnSave({ role, isReviewerRole, isReject, currentWorkStat }) {
  const baseRole = getBaseRoleFromWorkRole(role);
  const current = normalizeWorkStat(currentWorkStat);
  const isDraftFlow = baseRole === 'START';

  if (isReject) {
    return isDraftFlow ? WORK_STAT_CODES.DRAFT_REVISING : WORK_STAT_CODES.FINAL_REVISING;
  }

  if (isReviewerRole) {
    return isDraftFlow ? WORK_STAT_CODES.DRAFT_APPROVED : WORK_STAT_CODES.FINAL_APPROVED;
  }

  if (isDraftFlow) {
    if (current === WORK_STAT_CODES.DRAFT_REVISING) return WORK_STAT_CODES.DRAFT_REVISED;
    // 작업완료(03) 상태에서 다시 일반 저장(WORKING) 하면 작업중(02)으로 회귀.
    // 검수 측은 WORK_DONE 본을 기준으로 보고 있으므로 새 WORKING 본은 작업자 전용 임시본.
    if (current === WORK_STAT_CODES.DRAFT_DONE) return WORK_STAT_CODES.WORKING_DRAFT;
    return WORK_STAT_CODES.DRAFT_DONE;
  }

  if (current === WORK_STAT_CODES.FINAL_REVISING) return WORK_STAT_CODES.FINAL_REVISED;
  // 초안완료(08) → 본작업중(07) 회귀. 위와 동일한 이유.
  if (current === WORK_STAT_CODES.FINAL_DRAFT_DONE) return WORK_STAT_CODES.WORKING_FINAL;
  return WORK_STAT_CODES.FINAL_DRAFT_DONE;
}

export function isWorkStatTransitionAllowed(currentWorkStat, nextWorkStat) {
  const current = normalizeWorkStat(currentWorkStat);
  const next = normalizeWorkStat(nextWorkStat);

  if (!next) return false;
  if (!current || current === next) return true;

  const allowedNextMap = {
    '00': ['01', '02'],
    '01': ['02'],
    '02': ['03', '04'],
    // 03 → 02 : 작업완료(WORK_DONE 제출) 후 작업자가 다시 일반 저장하면 작업중으로 회귀
    '03': ['04', '06', '02'],
    '04': ['05'],
    '05': ['06', '04'],
    '06': ['07', '04'],
    '07': ['08', '09'],
    // 08 → 07 : 초안완료 후 다시 일반 저장하면 본작업중으로 회귀 (위와 대칭)
    '08': ['09', '11', '07'],
    '09': ['10'],
    '10': ['11', '09'],
    '11': ['09'],
  };

  return (allowedNextMap[current] || []).includes(next);
}
