/**
 * 연수 과제 (Training Assignment) - 관리자용 API
 *
 * 스펙: work-bo/docs/todo/training-assignment-spec.md §4.1 ~ §4.3
 *
 * Endpoints (관리자 전용):
 *   GET    /v9/api/training/assignments                                  - 과제 목록
 *   POST   /v9/api/training/assignments                                  - 과제 생성
 *   GET    /v9/api/training/assignments/{id}                             - 과제 상세
 *   PUT    /v9/api/training/assignments/{id}                             - 과제 메타 수정
 *   DELETE /v9/api/training/assignments/{id}                             - 과제 삭제
 *   POST   /v9/api/training/assignments/{id}/files                       - 파일 추가
 *   DELETE /v9/api/training/assignments/{id}/files/{trainingFileId}      - 파일 제거
 *   PUT    /v9/api/training/assignments/{id}/answers/{trainingFileId}    - 정답지 upsert
 *   GET    /v9/api/training/assignments/{id}/answers/{trainingFileId}    - 정답지 조회
 *   GET    /v9/api/training/assignments/{id}/students                    - 배정 목록
 *   POST   /v9/api/training/assignments/{id}/students                    - 단건 배정
 *   POST   /v9/api/training/assignments/{id}/students/excel              - 엑셀 일괄 배정 (multipart)
 *   DELETE /v9/api/training/assignments/{id}/students/{assignmentStudentId}
 */
import { apiRequest, getToken } from '../client';

const BASE = '/v9/api/training/assignments';

function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

// ─────────────────────────── 4.1 과제 ───────────────────────────

/**
 * 과제 목록 조회 (페이징)
 * @param {{page?: number, size?: number, keyword?: string, status?: string}} params
 */
export async function listAssignments({ page = 0, size = 20, keyword, status } = {}) {
  const qs = buildQueryString({ page, size, keyword, status });
  return apiRequest(`${BASE}${qs}`, { method: 'GET' });
}

/**
 * 과제 생성
 * @param {{title: string, description?: string, trainingFileIds?: string[]}} body
 *        - 백엔드 TrainingAssignmentCreateRequest 의 필드명이 trainingFileIds 이므로
 *          그대로 전달해야 한다 (fileIds 로 보내면 백엔드에서 인식 못 함).
 */
export async function createAssignment(body) {
  return apiRequest(BASE, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

/**
 * 과제 상세 조회
 * @param {string} assignmentId
 */
export async function getAssignment(assignmentId) {
  return apiRequest(`${BASE}/${encodeURIComponent(assignmentId)}`, { method: 'GET' });
}

/**
 * 과제 메타 수정 (title/description/status)
 * @param {string} assignmentId
 * @param {{title?: string, description?: string, status?: 'OPEN'|'CLOSED'}} body
 */
export async function updateAssignment(assignmentId, body) {
  return apiRequest(`${BASE}/${encodeURIComponent(assignmentId)}`, {
    method: 'PUT',
    body: JSON.stringify(body || {}),
  });
}

/**
 * 과제 삭제 (CASCADE)
 * @param {string} assignmentId
 */
export async function deleteAssignment(assignmentId) {
  return apiRequest(`${BASE}/${encodeURIComponent(assignmentId)}`, {
    method: 'DELETE',
  });
}

/**
 * 과제에 파일 추가 (N개 일괄)
 * @param {string} assignmentId
 * @param {string[]} trainingFileIds
 */
export async function addAssignmentFiles(assignmentId, trainingFileIds) {
  return apiRequest(`${BASE}/${encodeURIComponent(assignmentId)}/files`, {
    method: 'POST',
    body: JSON.stringify({ trainingFileIds: trainingFileIds || [] }),
  });
}

/**
 * 과제에서 파일 제거
 */
export async function removeAssignmentFile(assignmentId, trainingFileId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentId)}/files/${encodeURIComponent(trainingFileId)}`,
    { method: 'DELETE' },
  );
}

// ─────────────────────────── 4.2 정답지 (파일 단위) ───────────────────────────
//
// 정답지는 (file) 단위로 보관 — 같은 파일이 여러 과제에 재사용되어도 정답지는
// 한 번만 작성하면 모든 과제가 공유한다. 엔드포인트는 /v9/api/training-files/{id}/answer.

const FILES_BASE = '/v9/api/training-files';

/**
 * 정답지 upsert (관리자만, 파일 단위)
 * @param {string} trainingFileId
 * @param {{subtitle: string, format?: string}} body
 */
export async function upsertAnswer(trainingFileId, body) {
  return apiRequest(
    `${FILES_BASE}/${encodeURIComponent(trainingFileId)}/answer`,
    {
      method: 'PUT',
      body: JSON.stringify(body || {}),
    },
  );
}

/**
 * 정답지 조회 (관리자만, 파일 단위)
 */
export async function getAnswer(trainingFileId) {
  return apiRequest(
    `${FILES_BASE}/${encodeURIComponent(trainingFileId)}/answer`,
    { method: 'GET' },
  );
}

// ─────────────────────────── 4.3 배정 ───────────────────────────

/**
 * 과제별 배정 목록 (관리자)
 */
export async function listAssignmentStudents(assignmentId, { page = 0, size = 100, status } = {}) {
  const qs = buildQueryString({ page, size, status });
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentId)}/students${qs}`,
    { method: 'GET' },
  );
}

/**
 * 단건 배정 (학생 + 파일 N개)
 * @param {string} assignmentId
 * @param {{studentMembId: string, trainingFileIds: string[]}} body
 *   - studentMembId: TB_MEMB.MEMB_ID (이메일/로그인 ID) — 필수
 */
export async function assignStudent(assignmentId, body) {
  return apiRequest(`${BASE}/${encodeURIComponent(assignmentId)}/students`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

/**
 * 엑셀 일괄 배정 (multipart)
 *
 * - XHR 로 직접 전송 — fetch 의 multipart 표준 처리는 동일하지만, 진행률 콜백 일관성을 위해 XHR 사용.
 *
 * @param {string} assignmentId
 * @param {File} file
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<{status, code, data}>} 엔벨로프
 */
export async function assignStudentsExcel(assignmentId, file, onProgress) {
  const baseUrl = import.meta.env.VITE_V9_API_URL || '';
  const url = `${baseUrl}${BASE}/${encodeURIComponent(assignmentId)}/students/excel`;

  const fd = new FormData();
  fd.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (typeof onProgress === 'function' && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      const status = xhr.status;
      let parsed = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      if (status >= 200 && status < 300) {
        resolve(parsed);
      } else {
        const err = new Error(parsed?.message || `엑셀 일괄 배정 실패 (HTTP ${status})`);
        err.status = status;
        err.data = parsed;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('네트워크 오류로 엑셀 업로드에 실패했습니다.'));
    xhr.onabort = () => reject(new Error('업로드가 취소되었습니다.'));
    xhr.send(fd);
  });
}

/**
 * 배정 제거
 */
export async function removeAssignmentStudent(assignmentId, assignmentStudentId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(assignmentStudentId)}`,
    { method: 'DELETE' },
  );
}

/**
 * 수강생 자동완성 검색 (배정용).
 * 백엔드: GET /v9/api/training/assignments/students/search?keyword=&limit=
 *
 * - TB_MEMB.MEMB_LVL='7' (수강생) 만 검색됨
 * - 응답: { status, code, data: [{ membId, membNm, mblTelNo }] }
 *
 * @param {string} keyword - MEMB_ID 또는 MEMB_NM LIKE 검색어
 * @param {number} [limit=10] - 최대 반환 행 수 (1~50)
 */
export async function searchTrainees(keyword, limit = 10) {
  const qs = buildQueryString({ keyword, limit });
  return apiRequest(`${BASE}/students/search${qs}`, { method: 'GET' });
}

/**
 * 관리자가 학생의 작업 자막을 읽기 전용으로 조회 (worktool 검수 모드용).
 * SUBMIT revision 이 있으면 그것을, 없으면 최신 WORK 를 반환.
 * 백엔드: GET /v9/api/training/assignments/{id}/students/{asid}/work
 *
 * @param {string} assignmentId
 * @param {number|string} assignmentStudentId
 */
export async function getStudentReviewWork(assignmentId, assignmentStudentId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(assignmentStudentId)}/work`,
    { method: 'GET' },
  );
}

/**
 * 연수 과정 일괄 종료 — 그룹 A 모든 활성 row 를 soft delete.
 * 백엔드: POST /v9/api/training/assignments/archive-all
 *
 * @returns {Promise<{ status, data: { assignments, files, students, subtitleWorks, evaluations } }>}
 */
export async function archiveAllAssignments() {
  return apiRequest(`${BASE}/archive-all`, { method: 'POST' });
}

export default {
  listAssignments,
  createAssignment,
  getAssignment,
  updateAssignment,
  deleteAssignment,
  addAssignmentFiles,
  removeAssignmentFile,
  upsertAnswer,
  getAnswer,
  listAssignmentStudents,
  assignStudent,
  assignStudentsExcel,
  removeAssignmentStudent,
  searchTrainees,
  getStudentReviewWork,
};
