/**
 * 연수 채점 결과 (관리자) API
 *
 * 스펙: work-bo/docs/todo/training-assignment-spec.md §4.5
 *
 * Endpoints (ADMIN):
 *   GET /v9/api/training/evaluations
 *   GET /v9/api/training/students/{studentMembId}/evaluations
 *   GET /v9/api/training/students/{studentMembId}/summary
 */
import { apiRequest } from '../client';

const EVAL_BASE = '/v9/api/training/evaluations';
const STUDENTS_BASE = '/v9/api/training/students';

function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * 전체 채점 결과 (관리자) - 페이징 + 필터
 * @param {{
 *   page?: number, size?: number, keyword?: string,
 *   assignmentId?: string, studentMembId?: string,
 * }} params
 */
export async function listEvaluations(params = {}) {
  const qs = buildQueryString(params);
  return apiRequest(`${EVAL_BASE}${qs}`, { method: 'GET' });
}

/**
 * 특정 수강생의 모든 채점 결과
 * @param {string} studentMembId TB_MEMB.MEMB_ID (이메일)
 */
export async function listStudentEvaluations(studentMembId, params = {}) {
  const qs = buildQueryString(params);
  return apiRequest(
    `${STUDENTS_BASE}/${encodeURIComponent(studentMembId)}/evaluations${qs}`,
    { method: 'GET' },
  );
}

/**
 * 수강생 요약 통계 (평균 accuracy, 제출/대기 카운트)
 * @param {string} studentMembId TB_MEMB.MEMB_ID (이메일)
 */
export async function getStudentSummary(studentMembId) {
  return apiRequest(
    `${STUDENTS_BASE}/${encodeURIComponent(studentMembId)}/summary`,
    { method: 'GET' },
  );
}

/**
 * 수강생 목록 (페이징) — 수강생 관리 페이지용
 *
 * 백엔드: GET /v9/api/training/students
 *   - MEMB_LVL='7' 회원만 조회
 *   - 각 행에 averageAccuracy / submittedCount / pendingCount 포함
 *
 * @param {{ page?: number, size?: number, keyword?: string }} params
 */
export async function listTraineeStudents(params = {}) {
  const qs = buildQueryString(params);
  return apiRequest(`${STUDENTS_BASE}${qs}`, { method: 'GET' });
}

/**
 * 수강생 등록 — membLvl='7' 은 백엔드에서 강제됨
 *
 * 백엔드: POST /v9/api/training/students
 *
 * @param {{
 *   membId: string,       // 이메일
 *   membNm: string,       // 이름
 *   mblTelNo: string,     // 전화번호
 *   membPwd?: string,     // 미입력 시 전화번호 뒤 8자리
 *   recvEmail?: string,
 *   siteType?: string,    // 기본 'SORI'
 * }} body
 */
export async function createTraineeStudent(body) {
  return apiRequest(STUDENTS_BASE, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 수강생 일괄 비활성화 (soft delete) — MEMB_STAT '1' → '3'
 * 백엔드: POST /v9/api/training/students/deactivate
 *
 * @param {string[]} membIds — 비활성화할 수강생 membId 배열
 * @returns {Promise<{ status, data: { affected: number } }>}
 */
export async function deactivateTrainees(membIds) {
  return apiRequest(`${STUDENTS_BASE}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ membIds: Array.isArray(membIds) ? membIds : [] }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  listEvaluations,
  listStudentEvaluations,
  getStudentSummary,
  listTraineeStudents,
  createTraineeStudent,
};
