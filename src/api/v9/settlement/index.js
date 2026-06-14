/**
 * Settlement API (V9 경로)
 * 정산서 관리 API
 *
 * 상태 흐름: 발행 → 집행(execute) → 확인(confirm) 또는 반려(reject) → 확인완료(CONFIRMED)
 */
import { get, post, put, del, getToken } from '../client';

const getBaseUrl = () => import.meta.env.VITE_V9_API_URL || '';

// 엔드포인트
const ENDPOINTS = {
  SETTLEMENT: '/v9/api/settlement',
  SETTLEMENT_BY_ID: (id) => `/v9/api/settlement/${id}`,
  WORKER: (id) => `/v9/api/settlement/${id}/worker`,
  EXECUTE: (id) => `/v9/api/settlement/${id}/execute`,
  REJECT: (id) => `/v9/api/settlement/${id}/reject`,
  CONFIRM: (id) => `/v9/api/settlement/${id}/confirm`,
  PAID: (id) => `/v9/api/settlement/${id}/paid`,
  RE_EXECUTE: (id) => `/v9/api/settlement/${id}/re-execute`,
  REVERT_PAYMENT: (id) => `/v9/api/settlement/${id}/revert-payment`,
  SEND_ALIMTALK: (id) => `/v9/api/settlement/${id}/send-alimtalk`,
  PENDING: '/v9/api/settlement/pending',
  BY_STATUS: '/v9/api/settlement/by-status',
  AGGREGATION: '/v9/api/settlement/aggregation',
  MY_MONTHLY_SUMMARY: '/v9/api/settlement/my-monthly-summary',
  BY_STATUS_EXCEL: '/v9/api/settlement/by-status/excel-download',
  AGGREGATION_EXCEL: '/v9/api/settlement/aggregation/excel-download',
  PREVIEW_PAY: '/v9/api/settlement/preview-pay',
};

/**
 * @typedef {Object} Settlement
 * @property {string} id - 정산서 ID (UUID v4)
 * @property {number} fileNo - 파일 번호
 * @property {string} servCd - 의뢰 코드
 * @property {string} bssType - 업무 유형
 * @property {number} workDuration - 작업 시간
 * @property {string} projectFileId - 프로젝트 파일 ID
 * @property {string} workerId - 작업자 ID
 * @property {string} executorId - 집행자 ID
 * @property {string} workerName - 작업자명
 * @property {string} executorName - 집행자명
 * @property {string} fileName - 파일명
 * @property {string} servTitle - 의뢰 타이틀
 * @property {string|null} entNm - 업체명 (발행 시점 스냅샷, 개인 의뢰는 null)
 * @property {string} projectTitle - 프로젝트 타이틀
 * @property {string} workerLevelName - 작업자 등급명
 * @property {string} fileDifficultName - 파일 난이도명
 * @property {string} bssTypeName - 업무 유형명
 * @property {number} price - 단가
 * @property {number} penalty - 페널티
 * @property {number} pay - 지급액
 * @property {number} taxRate - 세율
 * @property {boolean} isMessageSent - 메시지 발송 여부
 * @property {string|null} messageSentAt - 메시지 발송 일시
 * @property {string|null} executorDescription - 집행자 설명
 * @property {string|null} workerDescription - 작업자 설명
 * @property {boolean} isExecutorConfirmed - 집행 여부
 * @property {string|null} executorConfirmedAt - 집행 일시
 * @property {boolean} isWorkerReject - 반려 여부
 * @property {string|null} workerRejectedAt - 반려 일시
 * @property {boolean} isWorkerConfirmed - 확인 여부
 * @property {string|null} workerConfirmedAt - 확인 일시
 * @property {boolean} isPaid - 입금 여부
 * @property {string|null} paidAt - 입금 일시
 * @property {string|null} confirmedAt - 최종 확인 일시
 * @property {number|null} [accuracy] - 정확도 (%)
 * @property {number|null} [errorCount] - 오류 건수
 * @property {string} createdAt - 생성일시
 * @property {string} updatedAt - 수정일시
 */

/**
 * @typedef {Object} SettlementCreateInput
 * @property {number} fileNo - 파일 번호 (필수)
 * @property {string} servCd - 의뢰 코드 (필수)
 * @property {string} bssType - 업무 유형 (필수)
 * @property {number} workDuration - 작업 시간 (필수)
 * @property {string} projectFileId - 프로젝트 파일 ID (필수)
 * @property {string} workerId - 작업자 ID (필수)
 * @property {string} executorId - 집행자 ID (필수)
 * @property {string} workerName - 작업자명 (필수)
 * @property {string} executorName - 집행자명 (필수)
 * @property {string} fileName - 파일명 (필수)
 * @property {string} servTitle - 의뢰 타이틀 (필수)
 * @property {string} projectTitle - 프로젝트 타이틀 (필수)
 * @property {string} workerLevelName - 작업자 등급명 (필수)
 * @property {string} fileDifficultName - 파일 난이도명 (필수)
 * @property {string} bssTypeName - 업무 유형명 (필수)
 * @property {number} price - 단가 (필수)
 * @property {number} penalty - 페널티 (필수)
 * @property {number} pay - 지급액 (필수)
 * @property {number} taxRate - 세율 (필수)
 * @property {number|null} [accuracy] - 정확도 (%) — 백엔드 수용 예정
 * @property {number|null} [errorCount] - 오류 건수 — 백엔드 수용 예정
 */

/**
 * @typedef {Object} SettlementUpdateInput
 * @property {number} [price] - 단가
 * @property {number} [penalty] - 페널티
 * @property {number} [pay] - 지급액
 * @property {number} [taxRate] - 세율
 * @property {string} [executorDescription] - 집행자 설명
 */

/**
 * @typedef {Object} SettlementWorkerUpdateInput
 * @property {string} [workerDescription] - 작업자 설명
 */

/**
 * @typedef {Object} PendingItem
 * @property {string} id - 프로젝트 파일 ID
 * @property {string} title - 프로젝트 타이틀
 * @property {string} servCd - 의뢰 코드
 * @property {string} servTitle - 의뢰 타이틀
 * @property {string|null} entNm - 업체명 (tb_ent.ENT_NM, 개인 의뢰는 null)
 * @property {string} projectTitle - 프로젝트 타이틀
 * @property {string} requestMemberName - 의뢰자명
 * @property {string} bssType - 업무 유형
 * @property {number} fileNo - 파일 번호
 * @property {string} fileNm - 파일명
 * @property {string} fileDifficultId - 파일 난이도 ID
 * @property {string} fileDifficultName - 파일 난이도명
 * @property {number} requesterId - 의뢰자 ID
 * @property {string} workerLevelId - 작업자 등급 ID(호환용 단일/콤마 구분)
 * @property {string} workerLevelName - 작업자 등급명(단일 또는 콤마 구분)
 * @property {string} workerId - 작업자 ID
 * @property {string} workerName - 작업자명
 * @property {string} checkerId - 검수자 ID
 * @property {string} checkerName - 검수자명
 * @property {string} checkerLevelId - 검수자 등급 ID(호환용 단일/콤마 구분)
 * @property {string} checkerLevelName - 검수자 등급명(단일 또는 콤마 구분)
 * @property {number} duration - 영상 길이 (초) - 원본/분할 구간
 * @property {number|null} workTime - 작업시간 (초) - project_files.work_time
 * @property {boolean} isSplit - 분할 여부
 * @property {number|null} startSec - 분할 시작 시간 (초)
 * @property {number|null} endSec - 분할 종료 시간 (초)
 * @property {string} workType - 작업 유형
 * @property {string} status - 상태
 * @property {string} requestedDate - 의뢰일시 (ISO 8601)
 * @property {string} workedDate - 작업완료일시 (ISO 8601)
 */

/**
 * @typedef {Object} PageResponse
 * @property {number} page - 현재 페이지
 * @property {number} size - 페이지 크기
 * @property {number} totalElements - 전체 항목 수
 * @property {number} totalPages - 전체 페이지 수
 * @property {boolean} first - 첫 페이지 여부
 * @property {boolean} last - 마지막 페이지 여부
 * @property {Array} content - 항목 목록
 */

/**
 * @typedef {Object} ApiResponse
 * @property {string} status - 상태 (SUCCESS | FAILURE)
 * @property {string} code - 상태 코드
 * @property {*} data - 응답 데이터
 * @property {string} message - 메시지
 * @property {string} timestamp - 타임스탬프
 */

// ─── CRUD ────────────────────────────────────────────

/**
 * 정산서 발행
 * - ID는 UUID v4로 자동 생성
 *
 * @param {SettlementCreateInput} data - 정산서 생성 데이터
 * @returns {Promise<ApiResponse<Settlement>>} 생성된 정산서 응답
 */
export async function createSettlement(data) {
  return post(ENDPOINTS.SETTLEMENT, data);
}

/**
 * 정산서 발행 전 지급액 미리보기
 * - BSS_TYPE + accuracy 기반 감가표 매칭 후 최종 지급액 계산
 * - 감가표가 없거나 accuracy 가 어떤 구간과도 매칭되지 않으면 감가 미적용 결과 반환
 *
 * @param {Object} data
 * @param {string} data.bssType - 업무 유형 (필수)
 * @param {number} data.price - 단가 (필수)
 * @param {number} data.workDuration - 작업시간(분) (필수)
 * @param {number} data.penalty - 페널티 (필수)
 * @param {number} data.taxRate - 세율(%) (필수)
 * @param {number|null} [data.accuracy] - 정확도(%)
 * @returns {Promise<ApiResponse<{depreciationApplied:boolean, payRate:number|null, payBeforeDepreciation:number, pay:number}>>}
 */
export async function previewSettlementPay(data) {
  return post(ENDPOINTS.PREVIEW_PAY, data);
}

/**
 * 정산서 수정
 * - price, penalty, pay, taxRate, executorDescription 수정 가능
 *
 * @param {string} id - 정산서 ID (UUID)
 * @param {SettlementUpdateInput} data - 수정 데이터
 * @returns {Promise<ApiResponse<Settlement>>} 수정된 정산서 응답
 */
export async function updateSettlement(id, data) {
  return put(ENDPOINTS.SETTLEMENT_BY_ID(id), data);
}

/**
 * 정산서 작업자 설명 수정
 * - workerDescription만 수정 가능
 *
 * @param {string} id - 정산서 ID (UUID)
 * @param {SettlementWorkerUpdateInput} data - 작업자 수정 데이터
 * @returns {Promise<ApiResponse<Settlement>>} 수정된 정산서 응답
 */
export async function updateSettlementWorker(id, data) {
  return put(ENDPOINTS.WORKER(id), data);
}

/**
 * 정산서 삭제 (물리 삭제)
 * - 확인완료된 정산서(isWorkerConfirmed=true)는 삭제 불가
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<null>>} 삭제 응답
 */
export async function deleteSettlement(id) {
  return del(ENDPOINTS.SETTLEMENT_BY_ID(id));
}

// ─── 상태 변경 ───────────────────────────────────────

/**
 * 정산서 집행
 * - isExecutorConfirmed를 true로 설정
 * - 이미 집행된 정산서에 대해 재집행 시 400 에러
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<Settlement>>} 집행된 정산서 응답
 */
export async function executeSettlement(id) {
  return put(ENDPOINTS.EXECUTE(id));
}

/**
 * 정산서 반려
 * - isWorkerReject를 true로 설정
 * - 집행된 정산서(isExecutorConfirmed=true)만 반려 가능
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<Settlement>>} 반려된 정산서 응답
 */
export async function rejectSettlement(id, reason) {
  const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  return put(`${ENDPOINTS.REJECT(id)}${params}`);
}

/**
 * 정산서 확인
 * - isWorkerConfirmed를 true로 설정
 * - 집행된 정산서(isExecutorConfirmed=true)만 확인 가능
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<Settlement>>} 확인된 정산서 응답
 */
export async function confirmSettlement(id) {
  return put(ENDPOINTS.CONFIRM(id));
}

/**
 * 정산서 입금 처리
 * - isPaid를 true로 설정
 * - 이미 입금 완료된 정산서에 대해 재입금 시 400 에러
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<Settlement>>} 입금 처리된 정산서 응답
 */
export async function paidSettlement(id) {
  return put(ENDPOINTS.PAID(id));
}

/**
 * 정산서 재집행 (반려 → 확인대기)
 * - 반려된 정산서(isWorkerReject=true)에 대해서만 가능
 * - isWorkerReject → false, workerRejectedAt → null 리셋
 * - executorConfirmedAt 갱신, 상태가 WAITING_CONFIRM으로 전환
 *
 * 프론트 연동 흐름:
 * 1. updateSettlement(id, { price, penalty, pay, taxRate }) 로 금액 수정
 * 2. reExecuteSettlement(id) 로 재집행
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<Settlement>>} 재집행된 정산서 응답
 */
export async function reExecuteSettlement(id) {
  return put(ENDPOINTS.RE_EXECUTE(id));
}

/**
 * 정산서 입금대기 → 작업자 확인대기 복귀
 * - 입금대기(WAITING_PAYMENT) 상태에서만 호출 가능
 * - 이미 입금 완료된 정산서(isPaid=true)는 되돌릴 수 없음
 * - is_worker_confirmed/worker_confirmed_at/confirmed_at/is_worker_reject/
 *   worker_rejected_at/worker_reject_reason을 초기화하고 WAITING_CONFIRM으로 전환
 * - 사유는 서버 로그에만 기록 (DB 저장 없음)
 *
 * @param {string} id - 정산서 ID (UUID)
 * @param {string} [reason] - 복귀 사유 (선택)
 * @returns {Promise<ApiResponse<Settlement>>}
 */
export async function revertPaymentSettlement(id, reason) {
  const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  return put(`${ENDPOINTS.REVERT_PAYMENT(id)}${params}`);
}

/**
 * 정산서 알림톡 수동 발송
 * - 집행된 정산서(isExecutorConfirmed=true)에 대해서만 발송 가능
 * - 성공 시 isMessageSent=true, messageSentAt 기록
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<null>>}
 */
export async function sendAlimtalk(id) {
  return post(ENDPOINTS.SEND_ALIMTALK(id));
}

// ─── 조회 ────────────────────────────────────────────

/**
 * 정산서 단건 조회
 *
 * @param {string} id - 정산서 ID (UUID)
 * @returns {Promise<ApiResponse<Settlement>>} 정산서 상세 응답
 */
export async function getSettlement(id) {
  return get(ENDPOINTS.SETTLEMENT_BY_ID(id));
}

/**
 * 정산서 목록 조회/검색
 * - created_at 내림차순 (최신순)
 *
 * @param {Object} [params={}] - 검색 조건
 * @param {number} [params.fileNo] - 파일 번호
 * @param {string} [params.servCd] - 의뢰 코드
 * @param {string} [params.bssType] - 업무 유형
 * @param {string} [params.workerId] - 작업자 ID
 * @param {string} [params.executorId] - 집행자 ID
 * @param {string} [params.yearMonth] - 정산 년월 (yyyy-MM, 작업자 확인일 기준)
 * @param {boolean} [params.confirmedOnly] - 확인 완료분(집행자+작업자)만 조회
 * @param {number} [params.page=0] - 페이지 번호 (0부터)
 * @param {number} [params.size=10] - 페이지 크기
 * @returns {Promise<ApiResponse<PageResponse<Settlement>>>} 정산서 목록 응답
 */
export async function getSettlements(params = {}) {
  return get(ENDPOINTS.SETTLEMENT, params);
}

/**
 * 정산대기 목록 조회
 * - 검수 완료(isChecked=true)되었으나 아직 정산서가 발행되지 않은 항목
 * - file_no 내림차순
 * - 날짜 필터는 부모 서비스(tb_serv)의 등록일(REG_DTTM) 기준 범위 검색
 *
 * @param {Object} [params={}] - 검색 조건
 * @param {string} [params.bssType] - 업무 유형 (완전 일치)
 * @param {string} [params.memberKeyword] - 작업자/검수자 ID 또는 이름 (통합 LIKE 검색 - workerId, workerName, checkerId, checkerName OR 조건)
 * @param {string} [params.requesterKeyword] - 의뢰자명 (LIKE 검색)
 * @param {string} [params.servCd] - 의뢰 코드 (완전 일치)
 * @param {string} [params.servTitle] - 의뢰 타이틀 (LIKE 검색)
 * @param {string} [params.title] - 프로젝트 타이틀 (LIKE 검색)
 * @param {string} [params.dateFrom] - 서비스 등록일 검색 시작 (YYYY-MM-DD, 기준: tb_serv.REG_DTTM)
 * @param {string} [params.dateTo] - 서비스 등록일 검색 종료 (YYYY-MM-DD, 기준: tb_serv.REG_DTTM)
 * @param {number} [params.page=0] - 페이지 번호 (0부터)
 * @param {number} [params.size=10] - 페이지 크기
 * @returns {Promise<ApiResponse<PageResponse<PendingItem>>>} 정산대기 목록 응답
 */
export async function getPendingSettlements(params = {}) {
  return get(ENDPOINTS.PENDING, params);
}

/**
 * 상태별 정산서 목록 조회
 * - 상태에 따라 서버에서 해당 조건의 정산서를 필터링하여 반환
 * - 각 상태별로 해당하는 날짜 컬럼에 대해 범위 검색 적용
 *   - ISSUED: created_at
 *   - WAITING_CONFIRM: executor_confirmed_at
 *   - REJECTED: worker_rejected_at
 *   - WAITING_PAYMENT: worker_confirmed_at
 *   - PAID: paid_at
 *
 * @param {Object} params - 검색 조건
 * @param {string} params.status - 정산서 상태 (필수: ISSUED | WAITING_CONFIRM | REJECTED | WAITING_PAYMENT | PAID)
 * @param {string} [params.workerId] - 작업자 ID (tb_memb.MEMB_ID)
 * @param {string} [params.dateFrom] - 검색 시작일 (YYYY-MM-DD)
 * @param {string} [params.dateTo] - 검색 종료일 (YYYY-MM-DD)
 * @param {string} [params.title] - 프로젝트 타이틀 (LIKE 검색)
 * @param {string} [params.servTitle] - 의뢰 타이틀 (LIKE 검색)
 * @param {string} [params.bssType] - 업무 유형 (완전 일치)
 * @param {string} [params.servCd] - 의뢰 코드 (완전 일치)
 * @param {string} [params.memberKeyword] - 작업자/검수자 ID 또는 이름 (통합 LIKE 검색)
 * @param {string} [params.requesterKeyword] - 의뢰자명 (LIKE 검색)
 * @param {number} [params.page=0] - 페이지 번호 (0부터)
 * @param {number} [params.size=10] - 페이지 크기
 * @returns {Promise<ApiResponse<PageResponse<Settlement>>>} 상태별 정산서 목록 응답
 */
export async function getSettlementsByStatus(params = {}) {
  return get(ENDPOINTS.BY_STATUS, params);
}

/**
 * 정산 집계 조회 (작업자별 월별)
 * - 작업자 확인 완료된 정산서만 집계 대상
 *
 * @param {Object} [params={}] - 검색 조건
 * @param {string} [params.yearMonth] - 정산 년월 (yyyy-MM)
 * @param {string} [params.bssType] - 업무 유형 (완전 일치)
 * @param {string} [params.memberKeyword] - 작업자 ID 또는 이름 (통합 LIKE 검색)
 * @param {number} [params.page=0] - 페이지 번호 (0부터)
 * @param {number} [params.size=20] - 페이지 크기
 * @returns {Promise<ApiResponse<PageResponse<{workerId, workerName, yearMonth, totalCount, totalPay, totalPenalty, totalTax}>>>}
 */
export async function getSettlementAggregation(params = {}) {
  return get(ENDPOINTS.AGGREGATION, params);
}

/**
 * 작업자 본인 월별 작업 요약 조회 (마이페이지 대시보드)
 * - 발행일(created_at) 월 기준, 전체 상태, 본인(workerId) 정산서 집계
 *
 * @param {Object} params - 조회 조건
 * @param {string} params.workerId - 작업자 ID (필수)
 * @param {string} [params.yearMonth] - 집계 년월 (yyyy-MM, 미지정 시 서버 현재월)
 * @returns {Promise<ApiResponse<{workerId, yearMonth, workDurationTotal:number, count:number, payTotal:number}>>}
 */
export async function getMySettlementMonthlySummary(params = {}) {
  return get(ENDPOINTS.MY_MONTHLY_SUMMARY, params);
}

/**
 * 상태별 정산서 엑셀 다운로드
 *
 * @param {Object} params - 검색 조건 (상태별 조회 API와 동일)
 * @param {string} params.status - 정산서 상태 (필수: WAITING_PAYMENT | PAID 등)
 * @param {string} [params.dateFrom] - 검색 시작일
 * @param {string} [params.dateTo] - 검색 종료일
 * @param {string} [params.title] - 프로젝트 타이틀
 * @param {string} [params.servTitle] - 서비스 타이틀
 * @param {string} [params.bssType] - 업무 유형
 * @param {string} [params.servCd] - 서비스 코드
 * @param {string} [params.memberKeyword] - 작업자 키워드
 * @param {string} [params.requesterKeyword] - 의뢰자명
 * @param {string[]} [params.ids] - 선택된 정산서 ID 목록 (지정 시 해당 ID만 다운로드)
 * @returns {Promise<void>} 파일 다운로드 트리거
 */
export async function downloadSettlementByStatusExcel(params = {}) {
  const baseUrl = getBaseUrl();
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .flatMap(([k, v]) => (
      Array.isArray(v)
        ? v.map((item) => `${encodeURIComponent(k)}=${encodeURIComponent(item)}`)
        : [`${encodeURIComponent(k)}=${encodeURIComponent(v)}`]
    ))
    .join('&');
  const url = `${baseUrl}${ENDPOINTS.BY_STATUS_EXCEL}${query ? `?${query}` : ''}`;

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { method: 'POST', headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `엑셀 다운로드 실패 (HTTP ${response.status})`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  let fileName = '정산.xlsx';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/i);
  if (match) fileName = decodeURIComponent(match[1].replace(/["']/g, ''));

  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/**
 * 정산 집계 엑셀 다운로드
 *
 * @param {Object} [params={}] - 검색 조건
 * @param {string} [params.yearMonth] - 정산 년월 (yyyy-MM)
 * @param {string} [params.bssType] - 업무 유형
 * @param {string} [params.memberKeyword] - 작업자 ID 또는 이름
 * @returns {Promise<void>} 파일 다운로드 트리거
 */
export async function downloadAggregationExcel(params = {}) {
  const baseUrl = getBaseUrl();
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${baseUrl}${ENDPOINTS.AGGREGATION_EXCEL}${query ? `?${query}` : ''}`;

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { method: 'POST', headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `엑셀 다운로드 실패 (HTTP ${response.status})`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  let fileName = '정산_집계.xlsx';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/i);
  if (match) fileName = decodeURIComponent(match[1].replace(/["']/g, ''));

  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export default {
  createSettlement,
  previewSettlementPay,
  updateSettlement,
  updateSettlementWorker,
  deleteSettlement,
  executeSettlement,
  reExecuteSettlement,
  revertPaymentSettlement,
  rejectSettlement,
  confirmSettlement,
  paidSettlement,
  getSettlement,
  getSettlements,
  getPendingSettlements,
  getSettlementsByStatus,
  getSettlementAggregation,
  getMySettlementMonthlySummary,
  downloadSettlementByStatusExcel,
  downloadAggregationExcel,
};
