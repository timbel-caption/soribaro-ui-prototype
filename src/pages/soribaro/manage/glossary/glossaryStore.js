// glossaryStore.js — 공통 용어집 인메모리 스토어 (manageProtoStore.js 패턴 동일)

let _seq = 200;
const uid = (prefix) => `${prefix}-${++_seq}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

// ── 공통 용어집 목록 ──────────────────────────────────────────────────────
let _glossaries = [
  { id: 'gl-1', name: 'VOD 공통 용어집',    type: 'VOD',     scope: '전체',        updatedAt: '2026-06-20' },
  { id: 'gl-2', name: 'SDH 공통 용어집',    type: 'SDH',     scope: '전체',        updatedAt: '2026-06-18' },
  { id: 'gl-3', name: '미디어 공통 용어집',  type: '미디어',  scope: '전체',        updatedAt: '2026-06-15' },
  { id: 'gl-4', name: '회의록 공통 용어집',  type: '회의록',  scope: '전체',        updatedAt: '2026-06-25' },
  { id: 'gl-5', name: '녹취록 공통 용어집',  type: '공통',    scope: '전체',        updatedAt: '2026-06-10' },
  { id: 'gl-6', name: '○○시의회 전용',      type: '고객사별', scope: '특정 고객사', updatedAt: '2026-06-22' },
  { id: 'gl-7', name: 'A사 전용 용어집',    type: '고객사별', scope: '특정 고객사', updatedAt: '2026-05-30' },
];

// ── 용어 항목 (glossaryId 별) ─────────────────────────────────────────────
let _terms = {
  'gl-1': [
    { id: 't1', term: '학습정리',      recommended: '학습정리',      forbidden: '학습 정리',   category: 'VOD 용어',   desc: '붙여쓰기 주의',        status: '승인', sourceProject: 'VOD 공통',          updatedAt: '2026-06-20' },
    { id: 't2', term: '강의자료',      recommended: '강의자료',      forbidden: '강의 자료',   category: 'VOD 용어',   desc: '붙여쓰기',             status: '승인', sourceProject: 'VOD 공통',          updatedAt: '2026-06-20' },
    { id: 't3', term: '오리엔테이션',  recommended: '오리엔테이션',  forbidden: '오리엔테션',  category: 'VOD 용어',   desc: '외래어 표기 주의',     status: '승인', sourceProject: 'VOD 공통',          updatedAt: '2026-06-19' },
    { id: 't4', term: '차시',          recommended: '차시',          forbidden: '-',           category: 'VOD 용어',   desc: '강의 단위 표현',       status: '승인', sourceProject: 'VOD 공통',          updatedAt: '2026-06-18' },
    { id: 't5', term: '교수자',        recommended: '교수자',        forbidden: '교수님',      category: 'VOD 용어',   desc: '표기 통일',            status: '대기', sourceProject: 'VOD-2026-05',       updatedAt: '2026-06-21' },
    { id: 't6', term: '퀴즈',          recommended: '퀴즈',          forbidden: 'quiz',        category: 'VOD 용어',   desc: '한글 표기 우선',       status: '승인', sourceProject: 'VOD 공통',          updatedAt: '2026-06-17' },
  ],
  'gl-2': [
    { id: 's1', term: '[웃음]',        recommended: '[웃음]',        forbidden: '웃음 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',   status: '승인', sourceProject: 'SDH 공통',          updatedAt: '2026-06-18' },
    { id: 's2', term: '[박수]',        recommended: '[박수]',        forbidden: '박수 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',   status: '승인', sourceProject: 'SDH 공통',          updatedAt: '2026-06-18' },
    { id: 's3', term: '[음악]',        recommended: '[음악]',        forbidden: '음악 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',   status: '승인', sourceProject: 'SDH 공통',          updatedAt: '2026-06-17' },
    { id: 's4', term: '[한숨]',        recommended: '[한숨]',        forbidden: '한숨 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',   status: '승인', sourceProject: 'SDH 공통',          updatedAt: '2026-06-17' },
    { id: 's5', term: '[발소리]',      recommended: '[발소리]',      forbidden: '[발 소리]',   category: 'SDH 효과음', desc: '붙여쓰기',              status: '대기', sourceProject: 'SDH-드라마-2026-06', updatedAt: '2026-06-18' },
  ],
  'gl-3': [
    { id: 'x1', term: '예고편',        recommended: '예고편',        forbidden: '-',           category: '방송 용어', desc: '표기 통일',             status: '승인', sourceProject: '미디어 공통',        updatedAt: '2026-06-15' },
    { id: 'x2', term: '최종본',        recommended: '최종본',        forbidden: '파이널본',    category: '납품 용어', desc: '한글 우선',             status: '승인', sourceProject: '미디어 공통',        updatedAt: '2026-06-15' },
    { id: 'x3', term: '부착본',        recommended: '부착본',        forbidden: '-',           category: '납품 용어', desc: '표기 통일',             status: '대기', sourceProject: '미디어-C사-0620',    updatedAt: '2026-06-20' },
  ],
  'gl-4': [
    { id: 'm1', term: '위원장',        recommended: '위원장',        forbidden: '-',           category: '직책',      desc: '표기 통일',             status: '승인', sourceProject: '회의록 공통',        updatedAt: '2026-06-25' },
    { id: 'm2', term: '부위원장',      recommended: '부위원장',      forbidden: '부 위원장',   category: '직책',      desc: '붙여쓰기',              status: '승인', sourceProject: '회의록 공통',        updatedAt: '2026-06-25' },
    { id: 'm3', term: '원안 가결',     recommended: '원안 가결',     forbidden: '원안가결',    category: '회의 용어', desc: '띄어쓰기 주의',         status: '승인', sourceProject: '회의록 공통',        updatedAt: '2026-06-24' },
    { id: 'm4', term: '수정 가결',     recommended: '수정 가결',     forbidden: '수정가결',    category: '회의 용어', desc: '띄어쓰기 주의',         status: '승인', sourceProject: '회의록 공통',        updatedAt: '2026-06-24' },
    { id: 'm5', term: '이의 없음',     recommended: '이의 없음',     forbidden: '이의없음',    category: '회의 용어', desc: '띄어쓰기 주의',         status: '승인', sourceProject: '회의록 공통',        updatedAt: '2026-06-23' },
    { id: 'm6', term: '상정',          recommended: '상정',          forbidden: '-',           category: '행정 용어', desc: '안건 상정 표기',        status: '대기', sourceProject: '○○시의회-2026-06',  updatedAt: '2026-06-25' },
    { id: 'm7', term: '간사',          recommended: '간사',          forbidden: '-',           category: '직책',      desc: '회의록 직책',           status: '승인', sourceProject: '회의록 공통',        updatedAt: '2026-06-22' },
    { id: 'm8', term: '의결',          recommended: '의결',          forbidden: '-',           category: '회의 용어', desc: '표기 통일',             status: '대기', sourceProject: '○○시의회-2026-06',  updatedAt: '2026-06-25' },
  ],
  'gl-5': [
    { id: 'r1', term: '녹취록',        recommended: '녹취록',        forbidden: '-',           category: '문서 용어', desc: '표기 통일',             status: '승인', sourceProject: '녹취록 공통',        updatedAt: '2026-06-10' },
    { id: 'r2', term: '청취자',        recommended: '청취자',        forbidden: '듣는 사람',   category: '문서 용어', desc: '표기 통일',             status: '승인', sourceProject: '녹취록 공통',        updatedAt: '2026-06-10' },
  ],
  'gl-6': [
    { id: 'c1', term: '제1차 본회의',  recommended: '제1차 본회의',  forbidden: '1차 본회의',  category: '회의명',    desc: '한자 표기 유지',        status: '승인', sourceProject: '○○시의회 공통',     updatedAt: '2026-06-22' },
    { id: 'c2', term: '○○시의회',     recommended: '○○시의회',     forbidden: '○○ 시의회',  category: '기관명',    desc: '붙여쓰기',              status: '승인', sourceProject: '○○시의회 공통',     updatedAt: '2026-06-22' },
  ],
};

// ── 프로젝트 추출 용어 후보 ───────────────────────────────────────────────
let _extracted = [
  { id: 'e1', term: '분과위원회',  recommended: '분과위원회',  forbidden: '-', category: '행정 용어',  desc: '',  sourceProject: '○○시의회-2026-06', type: '회의록', round: '2026-06-25', file: '본회의_0625.txt',  duplicate: '신규', targetGlossaryId: 'gl-4', status: '대기' },
  { id: 'e2', term: '속기록',      recommended: '속기록',      forbidden: '-', category: '행정 용어',  desc: '',  sourceProject: '○○시의회-2026-06', type: '회의록', round: '2026-06-25', file: '본회의_0625.txt',  duplicate: '신규', targetGlossaryId: 'gl-4', status: '대기' },
  { id: 'e3', term: '주차',        recommended: '주차',        forbidden: '-', category: 'VOD 용어',   desc: '',  sourceProject: 'VOD-2026-06-A',    type: 'VOD',   round: '3주차',       file: '3주차_강의.txt',   duplicate: '중복', targetGlossaryId: 'gl-1', status: '대기' },
  { id: 'e4', term: '수강생',      recommended: '수강생',      forbidden: '-', category: 'VOD 용어',   desc: '',  sourceProject: 'VOD-2026-06-A',    type: 'VOD',   round: '3주차',       file: '3주차_강의.txt',   duplicate: '신규', targetGlossaryId: 'gl-1', status: '대기' },
  { id: 'e5', term: '[통화음]',    recommended: '[통화 연결음]', forbidden: '-', category: 'SDH 효과음', desc: '', sourceProject: 'SDH-드라마-B',     type: 'SDH',   round: 'EP.04',       file: 'EP04_final.txt',  duplicate: '유사', targetGlossaryId: 'gl-2', status: '대기' },
  { id: 'e6', term: '부착본',      recommended: '부착본',      forbidden: '-', category: '납품 용어',  desc: '',  sourceProject: '미디어-C사-0620',  type: '미디어', round: '-',           file: '납품본_0620.txt', duplicate: '중복', targetGlossaryId: 'gl-3', status: '승인' },
  { id: 'e7', term: '등급고지',    recommended: '등급고지',    forbidden: '-', category: '납품 용어',  desc: '',  sourceProject: '미디어-C사-0620',  type: '미디어', round: '-',           file: '납품본_0620.txt', duplicate: '중복', targetGlossaryId: 'gl-3', status: '제외' },
];

// ── 공통 용어집 CRUD ──────────────────────────────────────────────────────
export const getGlossaries = () => [..._glossaries];
export const getGlossaryById = (id) => _glossaries.find((g) => g.id === id) || null;

export const addGlossary = ({ name, type, scope }) => {
  const g = { id: uid('gl'), name, type, scope, updatedAt: todayStr() };
  _glossaries = [..._glossaries, g];
  return g;
};

export const updateGlossary = (id, updates) => {
  _glossaries = _glossaries.map((g) =>
    g.id === id ? { ...g, ...updates, updatedAt: todayStr() } : g
  );
};

export const deleteGlossary = (id) => {
  _glossaries = _glossaries.filter((g) => g.id !== id);
  delete _terms[id];
};

// ── 용어 항목 CRUD ────────────────────────────────────────────────────────
export const getTerms = (glossaryId) => [...(_terms[glossaryId] || [])];

export const getTermStats = (glossaryId) => {
  const list = _terms[glossaryId] || [];
  return { termCount: list.length, pendingCount: list.filter((t) => t.status === '대기').length };
};

export const addTerm = (glossaryId, termData) => {
  const t = { id: uid('t'), ...termData, updatedAt: todayStr() };
  _terms[glossaryId] = [...(_terms[glossaryId] || []), t];
  _glossaries = _glossaries.map((g) => g.id === glossaryId ? { ...g, updatedAt: todayStr() } : g);
  return t;
};

export const updateTerm = (glossaryId, termId, updates) => {
  _terms[glossaryId] = (_terms[glossaryId] || []).map((t) =>
    t.id === termId ? { ...t, ...updates, updatedAt: todayStr() } : t
  );
  _glossaries = _glossaries.map((g) => g.id === glossaryId ? { ...g, updatedAt: todayStr() } : g);
};

export const deleteTerm = (glossaryId, termId) => {
  _terms[glossaryId] = (_terms[glossaryId] || []).filter((t) => t.id !== termId);
  _glossaries = _glossaries.map((g) => g.id === glossaryId ? { ...g, updatedAt: todayStr() } : g);
};

// ── 프로젝트 추출 용어 ────────────────────────────────────────────────────
export const getExtracted = () => [..._extracted];

export const approveExtracted = (id) => {
  const e = _extracted.find((x) => x.id === id);
  if (!e || e.status !== '대기') return;
  // 추천 반영 용어집에 실제 등록
  addTerm(e.targetGlossaryId, {
    term: e.term,
    recommended: e.recommended,
    forbidden: e.forbidden || '-',
    category: e.category,
    desc: e.desc || '',
    status: '승인',
    sourceProject: e.sourceProject,
  });
  _extracted = _extracted.map((x) => x.id === id ? { ...x, status: '승인' } : x);
};

export const excludeExtracted = (id) => {
  _extracted = _extracted.map((x) => x.id === id ? { ...x, status: '제외' } : x);
};

export const updateExtracted = (id, updates) => {
  _extracted = _extracted.map((x) => x.id === id ? { ...x, ...updates } : x);
};

export const resetExtracted = (id) => {
  _extracted = _extracted.map((x) => x.id === id ? { ...x, status: '대기' } : x);
};
