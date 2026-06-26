/**
 * 목(mock) 디스패처 — 백엔드 없는 화면 프로토타입의 핵심
 *
 * 모든 API 클라이언트(api/v9/client, api/v8/client, api/client)의 apiRequest 가
 * 실제 fetch 대신 이 함수를 호출합니다. 따라서 어떤 페이지가 어떤 엔드포인트를
 * 호출하든, 네트워크 없이 표준 응답 `{ status:'SUCCESS', data }` 을 받습니다.
 *
 * 동작 순서:
 *   1) REGISTRY 의 큐레이션 핸들러를 순서대로 검사 — 경로가 매칭되면 그 data 반환
 *   2) 매칭 실패 시 범용 폴백:
 *        - GET 목록/모호  → 속성이 붙은 배열(아래 listData) 반환
 *        - GET 단일(숫자 id) → 대표 객체 반환
 *        - 그 외 메서드      → 요청 바디를 그대로 에코 + 임의 id
 *
 * 새 화면에 더 그럴듯한 데이터가 필요하면 fixtures 에 샘플을 추가하고
 * REGISTRY 에 `{ test, handler }` 한 줄을 더하세요.
 */

import {
  MOCK_USER,
  COMMON_CODES,
  ENTERPRISE_ROWS,
  recordRows,
  workerRows,
  settlementRows,
  projectRows,
  noticeRows,
} from './fixtures/index.js';

// ─── 엔터프라이즈 업체 인메모리 스토어 ───────────────────────────────────────
let _enterprises = ENTERPRISE_ROWS.map((r) => ({ ...r }));
let _entSeq = Math.max(...ENTERPRISE_ROWS.map((r) => r.entNo)) + 1;

// ─── 엔터프라이즈 고객(사용자) 인메모리 스토어 ──────────────────────────────
let _entCustomers = [
  { membNo: 101, platform: '소리바로', membId: 'user_seoul_a@council.seoul.go.kr', membNm: '김유빈', entNo: 1, entNm: '서울시의회',       mblTelNo: '070-1234-5678', status: '정상', regDttm: '2026-03-01 09:00', chgDttm: null, recvEmail: 'user_seoul_a@council.seoul.go.kr', zipCd: '', baseAddr: '서울특별시 중구 태평로1가 60', dtlAddr: '' },
  { membNo: 102, platform: '소리바로', membId: 'user_seoul_b@council.seoul.go.kr', membNm: '김유리', entNo: 1, entNm: '서울시의회',       mblTelNo: '070-6788-4728', status: '정상', regDttm: '2026-03-05 10:00', chgDttm: null, recvEmail: 'user_seoul_b@council.seoul.go.kr', zipCd: '', baseAddr: '서울특별시 중구 태평로1가 60', dtlAddr: '' },
  { membNo: 103, platform: '소리바로', membId: 'user_edu_a@sen.go.kr',             membNm: '이민호', entNo: 2, entNm: '서울특별시교육청', mblTelNo: '02-2222-3001',   status: '정상', regDttm: '2026-03-10 09:00', chgDttm: null, recvEmail: 'user_edu_a@sen.go.kr',             zipCd: '', baseAddr: '서울특별시 종로구 송월길 48', dtlAddr: '' },
  { membNo: 104, platform: '소리바로', membId: 'user_kbs_a@kbs.co.kr',             membNm: '정유진', entNo: 3, entNm: '한국방송공사',     mblTelNo: '02-3333-5001',   status: '정상', regDttm: '2026-04-01 09:00', chgDttm: null, recvEmail: 'user_kbs_a@kbs.co.kr',             zipCd: '', baseAddr: '서울특별시 영등포구 여의공원로 13', dtlAddr: '' },
  { membNo: 105, platform: '소리바로', membId: 'user_na_a@na.go.kr',               membNm: '홍길동', entNo: 4, entNm: '국회사무처',       mblTelNo: '02-4444-5001',   status: '정상', regDttm: '2026-04-10 09:00', chgDttm: null, recvEmail: 'user_na_a@na.go.kr',               zipCd: '', baseAddr: '서울특별시 영등포구 의사당대로 1', dtlAddr: '' },
  { membNo: 106, platform: '소리바로', membId: 'user_na_b@na.go.kr',               membNm: '김영희', entNo: 4, entNm: '국회사무처',       mblTelNo: '02-4444-5002',   status: '대기', regDttm: '2026-05-01 09:00', chgDttm: null, recvEmail: 'user_na_b@na.go.kr',               zipCd: '', baseAddr: '',                                dtlAddr: '' },
  { membNo: 107, platform: '소리바로', membId: 'user_busan_a@council.busan.go.kr', membNm: '이철호', entNo: 5, entNm: '부산광역시의회',   mblTelNo: '051-5555-5001',  status: '정상', regDttm: '2026-05-15 09:00', chgDttm: null, recvEmail: 'user_busan_a@council.busan.go.kr', zipCd: '', baseAddr: '부산광역시 연제구 중앙대로 1001', dtlAddr: '' },
];
let _custSeq = 200;

// 응답 지연(ms) — 로딩 스피너가 자연스럽게 보이도록 약간의 지연을 둔다.
const MOCK_DELAY_MS = 120;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let idSeq = 1000;
const nextId = () => ++idSeq;

/**
 * 목록형 응답 data 를 만든다.
 * 반환값은 "배열"이지만 content/totalElements 등 페이지네이션 속성도 함께 갖는다.
 * → `data.map(...)`, `data.content.map(...)`, `data.content || []` 모두 동작.
 * @param {any[]} rows
 * @param {object} [opts] { page, size }
 */
function listData(rows, opts = {}) {
  const size = Number(opts.size) || rows.length || 10;
  const page = Number(opts.page) || 0;
  const arr = [...rows];
  arr.content = rows;
  arr.list = rows;
  arr.items = rows;
  arr.rows = rows;
  arr.totalElements = rows.length;
  arr.totalCount = rows.length;
  arr.totalPages = Math.max(1, Math.ceil(rows.length / size));
  arr.page = page;
  arr.number = page;
  arr.size = size;
  arr.first = page === 0;
  arr.last = true;
  arr.empty = rows.length === 0;
  return arr;
}

/** 범용 단일 리소스 객체 — 화면에서 자주 읽는 필드를 두루 채운다. */
function genericObject(idLike) {
  const id = Number(idLike) || nextId();
  return {
    id,
    no: id,
    seq: id,
    membNo: id,
    membId: `user${id}@soribaro.com`,
    membNm: '샘플 사용자',
    email: `user${id}@soribaro.com`,
    name: `샘플 ${id}`,
    title: `샘플 항목 ${id}`,
    servCd: `SV${100000 + id}`,
    servTitle: `샘플 서비스 ${id}`,
    status: '00',
    statusNm: '대기',
    overallStatus: '00',
    useYn: 'Y',
    regDttm: '2026-06-01 09:00:00',
    chgDttm: '2026-06-05 18:00:00',
    content: '',
    description: '프로토타입 샘플 상세 데이터입니다.',
  };
}

/** 표준 성공 응답 봉투 */
function ok(data, extra = {}) {
  return {
    status: 'SUCCESS',
    code: '200',
    message: 'OK',
    data,
    timestamp: '2026-06-11T00:00:00Z',
    ...extra,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 큐레이션 핸들러 레지스트리 (위에서부터 먼저 매칭)
//   handler(ctx) → data (봉투는 mockRequest 가 씌움). null 반환 시 다음으로 넘어감.
//   ctx = { path, method, params, body, match }
// ────────────────────────────────────────────────────────────────────────────
const REGISTRY = [
  // ── 인증 ──────────────────────────────────────────────────────────────
  { test: /\/auth\/me$/, handler: () => MOCK_USER },
  {
    test: /\/auth\/login$/,
    handler: () => ({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: MOCK_USER,
    }),
  },
  {
    test: /\/auth\/refresh$/,
    handler: () => ({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    }),
  },
  { test: /\/auth\/status$/, handler: () => ({ valid: true, message: 'OK' }) },
  { test: /\/auth\/logout$/, handler: () => null },

  // ── 공통코드: /v8/api/common/code/{grpCd} ────────────────────────────
  {
    test: /\/common\/code\/([A-Z0-9_]+)$/i,
    handler: ({ match }) => COMMON_CODES[match[1]] || [],
  },

  // ── 녹취록 의뢰/작업 목록 ────────────────────────────────────────────
  {
    test: /\/record-?work\/(requests|works)$/i,
    handler: ({ params }) => listData(recordRows(8), params),
  },

  // ── 정산 ─────────────────────────────────────────────────────────────
  {
    test: /\/settlement/i,
    handler: ({ params, method }) =>
      method === 'GET' ? listData(settlementRows(8), params) : null,
  },

  // ── 내 프로젝트(마이페이지 대시보드) ─────────────────────────────────
  {
    test: /\/projects?\/(my|me)/i,
    handler: ({ params }) => listData(projectRows(6), params),
  },

  // ── 작업자/회원 목록 (GET) / 회원 등록 (POST) ────────────────────────
  {
    test: /\/(workers?|members?)$/i,
    handler: ({ method, params, body }) => {
      if (method === 'GET') return listData(workerRows(8), params);
      if (method === 'POST') {
        const entRow = _enterprises.find((e) => String(e.entNo) === String(body.entNo));
        const newCust = { ...body, membNo: _custSeq++, entNm: entRow?.entNm || '', platform: '소리바로', status: '정상', regDttm: '2026-06-25 09:00:00', chgDttm: null };
        _entCustomers = [..._entCustomers, newCust];
        return newCust;
      }
      return null;
    },
  },

  // ── 공지 ─────────────────────────────────────────────────────────────
  {
    test: /\/notices?$/i,
    handler: ({ params, method }) =>
      method === 'GET' ? listData(noticeRows(8), params) : null,
  },

  // ── 엔터프라이즈 업체 상세 (PUT/DELETE) ──────────────────────────────
  {
    test: /\/enterprise\/(\d+)$/i,
    handler: ({ method, match, body }) => {
      const entNo = Number(match[1]);
      if (method === 'GET') {
        return _enterprises.find((e) => e.entNo === entNo) || null;
      }
      if (method === 'PUT') {
        _enterprises = _enterprises.map((e) =>
          e.entNo === entNo ? { ...e, ...body, entNo, chgDttm: '2026-06-25 12:00:00' } : e
        );
        return _enterprises.find((e) => e.entNo === entNo);
      }
      if (method === 'DELETE') {
        _enterprises = _enterprises.filter((e) => e.entNo !== entNo);
        return { entNo };
      }
      return null;
    },
  },

  // ── 엔터프라이즈 업체 목록/등록 ──────────────────────────────────────
  {
    test: /\/enterprise$/i,
    handler: ({ method, params, body }) => {
      if (method === 'GET') {
        const txt = (params.searchTxt || '').toLowerCase();
        const rows = txt
          ? _enterprises.filter((e) => e.entNm.toLowerCase().includes(txt))
          : _enterprises;
        return listData(rows, params);
      }
      if (method === 'POST') {
        const newEnt = { ...body, entNo: _entSeq++, useYn: body.useYn || 'Y', regDttm: '2026-06-25 09:00:00', chgDttm: null, regr: '정윤실', chgr: null };
        _enterprises = [..._enterprises, newEnt];
        return newEnt;
      }
      return null;
    },
  },

  // ── 엔터프라이즈 고객 상세/수정 ───────────────────────────────────────
  {
    test: /\/enterprise-customer\/(\d+)$/i,
    handler: ({ method, match, body }) => {
      const membNo = Number(match[1]);
      if (method === 'GET') {
        return _entCustomers.find((c) => c.membNo === membNo) || null;
      }
      if (method === 'PUT') {
        _entCustomers = _entCustomers.map((c) =>
          c.membNo === membNo ? { ...c, ...body, membNo, chgDttm: '2026-06-25 12:00:00' } : c
        );
        return _entCustomers.find((c) => c.membNo === membNo);
      }
      return null;
    },
  },

  // ── 엔터프라이즈 고객 목록/등록 ──────────────────────────────────────
  {
    test: /\/enterprise-customer$/i,
    handler: ({ method, params, body }) => {
      if (method === 'GET') {
        const txt = (params.searchText || '').toLowerCase();
        const st  = params.status || '';
        let rows = _entCustomers;
        if (txt) rows = rows.filter((c) => c.membNm.toLowerCase().includes(txt) || c.membId.toLowerCase().includes(txt) || (c.entNm || '').toLowerCase().includes(txt));
        if (st)  rows = rows.filter((c) => c.status === st);
        return listData(rows, params);
      }
      if (method === 'POST') {
        const entRow = _enterprises.find((e) => String(e.entNo) === String(body.entNo));
        const newCust = { ...body, membNo: _custSeq++, entNm: entRow?.entNm || '', platform: '소리바로', status: '정상', regDttm: '2026-06-25 09:00:00', chgDttm: null };
        _entCustomers = [..._entCustomers, newCust];
        return newCust;
      }
      return null;
    },
  },

  // ── 기업 옵션(사용자 추가 모달 업체 드롭다운) ─────────────────────────
  {
    test: /\/member\/company-options$/i,
    handler: () => _enterprises.map((e) => ({ entNo: e.entNo, entNm: e.entNm })),
  },
];

// 경로 끝이 숫자 id 면 단일 리소스로 간주
const SINGLE_RESOURCE_RE = /\/(\d+)$/;

/**
 * 목 요청 처리.
 * @param {string} endpoint - 쿼리스트링이 포함될 수 있는 엔드포인트
 * @param {object} options  - fetch 옵션 (method, body 등)
 * @returns {Promise<object>} 표준 응답 봉투
 */
export async function mockRequest(endpoint, options = {}) {
  await delay(MOCK_DELAY_MS);

  const method = (options.method || 'GET').toUpperCase();
  const [rawPath, queryString = ''] = String(endpoint).split('?');
  const path = rawPath;

  // 쿼리 파라미터 파싱
  const params = {};
  if (queryString) {
    for (const part of queryString.split('&')) {
      if (!part) continue;
      const [k, v = ''] = part.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }

  // 바디 파싱
  let body = {};
  if (options.body) {
    try {
      body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    } catch {
      body = {};
    }
  }

  // 1) 큐레이션 핸들러
  for (const entry of REGISTRY) {
    const match = path.match(entry.test);
    if (match) {
      const data = entry.handler({ path, method, params, body, match });
      if (data !== null && data !== undefined) {
        return ok(data);
      }
    }
  }

  // 2) 범용 폴백
  if (method === 'GET') {
    const single = path.match(SINGLE_RESOURCE_RE);
    if (single) {
      return ok(genericObject(single[1]));
    }
    // 목록/모호 — 비어 보이지 않게 일반 샘플 행 제공
    return ok(listData(workerRows(6), params));
  }

  // 쓰기 계열 — 요청을 성공으로 에코
  return ok({ ...body, id: nextId(), success: true });
}

export default { mockRequest };
