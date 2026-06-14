/**
 * 연수(Trainee) 본인용 API
 *
 * 스펙: work-bo/docs/todo/training-assignment-spec.md §4.4
 *
 * Endpoints (TRAINEE 본인 또는 ADMIN):
 *   GET  /v9/api/training/me/assignments
 *   GET  /v9/api/training/me/assignments/{assignmentStudentId}
 *   GET  /v9/api/training/me/assignments/{assignmentStudentId}/works/latest
 *   POST /v9/api/training/me/assignments/{assignmentStudentId}/works
 *   GET  /v9/api/training/me/assignments/{assignmentStudentId}/answer    (SUBMIT 직전 채점용)
 *   POST /v9/api/training/me/assignments/{assignmentStudentId}/submit
 *   GET  /v9/api/training/me/assignments/{assignmentStudentId}/evaluation
 */
import { apiRequest } from '../client';

const BASE = '/v9/api/training/me/assignments';

function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * 본인 배정 목록 (status 필터 옵션)
 * @param {{status?: 'ASSIGNED'|'IN_PROGRESS'|'SUBMITTED'|'SCORED', page?: number, size?: number, keyword?: string}} params
 */
export async function listMyAssignments(params = {}) {
  const qs = buildQueryString(params);
  return apiRequest(`${BASE}${qs}`, { method: 'GET' });
}

/**
 * 본인 배정 상세 (training_file 정보 + 진행 상태)
 */
export async function getMyAssignment(assignmentStudentId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentStudentId)}`,
    { method: 'GET' },
  );
}

/**
 * 최신 WORK revision 자막 조회
 */
export async function getMyLatestWork(assignmentStudentId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentStudentId)}/works/latest`,
    { method: 'GET' },
  );
}

/**
 * WORK 저장 (revision 누적)
 * @param {string|number} assignmentStudentId
 * @param {{subtitle: string}} body  subtitle JSON 문자열
 */
export async function saveMyWork(assignmentStudentId, body) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentStudentId)}/works`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
    },
  );
}

/**
 * 채점용 정답지 1회 조회 (SUBMIT 직전 프론트 채점 전용)
 *
 * 보안 주의: 1차 구현 한정 — 노출 후 즉시 사용 후 폐기. 화면에 표시 금지.
 */
export async function getMyAnswerForGrading(assignmentStudentId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentStudentId)}/answer`,
    {
      method: 'GET',
      // 브라우저 / 중간 캐시가 정답지를 저장하지 않도록 명시
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    },
  );
}

/**
 * SUBMIT + 채점 결과 동시 전송
 *
 * @param {string|number} assignmentStudentId
 * @param {{
 *   subtitle: string,           // 학생 자막 JSON 문자열
 *   accuracy: number,           // 0~100 (소수점 2자리)
 *   errorCount: number,
 *   formErrorCount: number,
 *   reason?: string,            // AccuracyModal reason JSON 문자열
 * }} body
 */
export async function submitMyAssignment(assignmentStudentId, body) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentStudentId)}/submit`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
      // 제출은 멱등하지 않으므로 자동 재시도 비활성화 (client.js 의 RETRYABLE_METHODS 와 별도 안전장치)
      retry: 0,
    },
  );
}

/**
 * 본인 채점 결과 조회 (SUBMIT 완료 후)
 */
export async function getMyEvaluation(assignmentStudentId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentStudentId)}/evaluation`,
    { method: 'GET' },
  );
}

export default {
  listMyAssignments,
  getMyAssignment,
  getMyLatestWork,
  saveMyWork,
  getMyAnswerForGrading,
  submitMyAssignment,
  getMyEvaluation,
};
