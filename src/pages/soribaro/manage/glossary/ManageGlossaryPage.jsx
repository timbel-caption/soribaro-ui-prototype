import { useState } from 'react';
import '../../../../styles/notion-list.css';
import './ManageGlossaryPage.css';

// ── 더미 데이터 ────────────────────────────────────────────────────────────

const GLOSSARY_LIST = [
  { id: 1, name: 'VOD 공통 용어집',   type: 'VOD',    scope: '전체',     termCount: 42, pendingCount: 3,  updatedAt: '2026-06-20' },
  { id: 2, name: 'SDH 공통 용어집',   type: 'SDH',    scope: '전체',     termCount: 67, pendingCount: 0,  updatedAt: '2026-06-18' },
  { id: 3, name: '미디어 공통 용어집', type: '미디어', scope: '전체',     termCount: 31, pendingCount: 1,  updatedAt: '2026-06-15' },
  { id: 4, name: '회의록 공통 용어집', type: '회의록', scope: '전체',     termCount: 88, pendingCount: 5,  updatedAt: '2026-06-25' },
  { id: 5, name: '녹취록 공통 용어집', type: '공통',   scope: '전체',     termCount: 24, pendingCount: 0,  updatedAt: '2026-06-10' },
  { id: 6, name: '○○시의회 전용',     type: '고객사별', scope: '특정 고객사', termCount: 55, pendingCount: 2, updatedAt: '2026-06-22' },
  { id: 7, name: 'A사 전용 용어집',   type: '고객사별', scope: '특정 고객사', termCount: 19, pendingCount: 0, updatedAt: '2026-05-30' },
];

const TERMS_BY_GLOSSARY = {
  1: [
    { id: 't1', term: '학습정리',  recommended: '학습정리',  forbidden: '학습 정리',   category: 'VOD 용어', desc: '붙여쓰기 주의',         status: '승인', sourceProject: 'VOD 공통', updatedAt: '2026-06-20' },
    { id: 't2', term: '강의자료',  recommended: '강의자료',  forbidden: '강의 자료',   category: 'VOD 용어', desc: '붙여쓰기',              status: '승인', sourceProject: 'VOD 공통', updatedAt: '2026-06-20' },
    { id: 't3', term: '오리엔테이션', recommended: '오리엔테이션', forbidden: '오리엔테션',  category: 'VOD 용어', desc: '외래어 표기 주의',      status: '승인', sourceProject: 'VOD 공통', updatedAt: '2026-06-19' },
    { id: 't4', term: '차시',      recommended: '차시',      forbidden: '-',           category: 'VOD 용어', desc: '강의 단위 표현',         status: '승인', sourceProject: 'VOD 공통', updatedAt: '2026-06-18' },
    { id: 't5', term: '교수자',    recommended: '교수자',    forbidden: '교수님',       category: 'VOD 용어', desc: '표기 통일',             status: '대기', sourceProject: 'VOD-2026-05', updatedAt: '2026-06-21' },
    { id: 't6', term: '퀴즈',      recommended: '퀴즈',      forbidden: 'quiz',        category: 'VOD 용어', desc: '한글 표기 우선',         status: '승인', sourceProject: 'VOD 공통', updatedAt: '2026-06-17' },
  ],
  4: [
    { id: 'm1', term: '위원장',    recommended: '위원장',    forbidden: '-',           category: '직책',     desc: '표기 통일',             status: '승인', sourceProject: '회의록 공통', updatedAt: '2026-06-25' },
    { id: 'm2', term: '부위원장',  recommended: '부위원장',  forbidden: '부 위원장',   category: '직책',     desc: '붙여쓰기',              status: '승인', sourceProject: '회의록 공통', updatedAt: '2026-06-25' },
    { id: 'm3', term: '원안 가결', recommended: '원안 가결', forbidden: '원안가결',    category: '회의 용어', desc: '띄어쓰기 주의',          status: '승인', sourceProject: '회의록 공통', updatedAt: '2026-06-24' },
    { id: 'm4', term: '수정 가결', recommended: '수정 가결', forbidden: '수정가결',    category: '회의 용어', desc: '띄어쓰기 주의',          status: '승인', sourceProject: '회의록 공통', updatedAt: '2026-06-24' },
    { id: 'm5', term: '이의 없음', recommended: '이의 없음', forbidden: '이의없음',    category: '회의 용어', desc: '띄어쓰기 주의',          status: '승인', sourceProject: '회의록 공통', updatedAt: '2026-06-23' },
    { id: 'm6', term: '상정',      recommended: '상정',      forbidden: '-',           category: '행정 용어', desc: '안건 상정 표기',         status: '대기', sourceProject: '○○시의회-2026-06', updatedAt: '2026-06-25' },
    { id: 'm7', term: '간사',      recommended: '간사',      forbidden: '-',           category: '직책',     desc: '회의록 직책',           status: '승인', sourceProject: '회의록 공통', updatedAt: '2026-06-22' },
    { id: 'm8', term: '의결',      recommended: '의결',      forbidden: '-',           category: '회의 용어', desc: '표기 통일',             status: '대기', sourceProject: '○○시의회-2026-06', updatedAt: '2026-06-25' },
  ],
  2: [
    { id: 's1', term: '[웃음]',    recommended: '[웃음]',    forbidden: '웃음 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',    status: '승인', sourceProject: 'SDH 공통', updatedAt: '2026-06-18' },
    { id: 's2', term: '[박수]',    recommended: '[박수]',    forbidden: '박수 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',    status: '승인', sourceProject: 'SDH 공통', updatedAt: '2026-06-18' },
    { id: 's3', term: '[음악]',    recommended: '[음악]',    forbidden: '음악 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',    status: '승인', sourceProject: 'SDH 공통', updatedAt: '2026-06-17' },
    { id: 's4', term: '[한숨]',    recommended: '[한숨]',    forbidden: '한숨 소리',   category: 'SDH 효과음', desc: 'SDH 상태 설명 표기',    status: '승인', sourceProject: 'SDH 공통', updatedAt: '2026-06-17' },
    { id: 's5', term: '[발소리]',  recommended: '[발소리]',  forbidden: '[발 소리]',   category: 'SDH 효과음', desc: '붙여쓰기',              status: '대기', sourceProject: 'SDH-드라마-2026-06', updatedAt: '2026-06-18' },
  ],
};

const DEFAULT_TERMS = [
  { id: 'x1', term: '예고편',   recommended: '예고편',   forbidden: '-',         category: '방송 용어', desc: '표기 통일',  status: '승인', sourceProject: '공통', updatedAt: '2026-06-15' },
  { id: 'x2', term: '최종본',   recommended: '최종본',   forbidden: '파이널본',   category: '납품 용어', desc: '한글 우선',  status: '승인', sourceProject: '공통', updatedAt: '2026-06-15' },
];

const EXTRACTED_TERMS = [
  { id: 'e1', term: '분과위원회', recommended: '분과위원회', sourceProject: '○○시의회-2026-06', type: '회의록', round: '2026-06-25', file: '본회의_0625.txt',  isDuplicate: false, targetGlossary: '회의록 공통 용어집', status: '대기' },
  { id: 'e2', term: '속기록',     recommended: '속기록',     sourceProject: '○○시의회-2026-06', type: '회의록', round: '2026-06-25', file: '본회의_0625.txt',  isDuplicate: false, targetGlossary: '회의록 공통 용어집', status: '대기' },
  { id: 'e3', term: '주차',       recommended: '주차',       sourceProject: 'VOD-2026-06-A',   type: 'VOD',   round: '3주차',       file: '3주차_강의.txt',   isDuplicate: true,  targetGlossary: 'VOD 공통 용어집',   status: '대기' },
  { id: 'e4', term: '수강생',     recommended: '수강생',     sourceProject: 'VOD-2026-06-A',   type: 'VOD',   round: '3주차',       file: '3주차_강의.txt',   isDuplicate: false, targetGlossary: 'VOD 공통 용어집',   status: '대기' },
  { id: 'e5', term: '[통화음]',   recommended: '[통화 연결음]', sourceProject: 'SDH-드라마-B',  type: 'SDH',   round: 'EP.04',       file: 'EP04_final.txt',  isDuplicate: false, targetGlossary: 'SDH 공통 용어집',   status: '대기' },
  { id: 'e6', term: '부착본',     recommended: '부착본',     sourceProject: '미디어-C사-0620', type: '미디어', round: '-',           file: '납품본_0620.txt', isDuplicate: false, targetGlossary: '미디어 공통 용어집', status: '승인' },
  { id: 'e7', term: '등급고지',   recommended: '등급고지',   sourceProject: '미디어-C사-0620', type: '미디어', round: '-',           file: '납품본_0620.txt', isDuplicate: true,  targetGlossary: '미디어 공통 용어집', status: '제외' },
];

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls =
    status === '승인' ? 'gloss-badge gloss-badge-approved'
    : status === '대기' ? 'gloss-badge gloss-badge-pending'
    : 'gloss-badge gloss-badge-excluded';
  return <span className={cls}>{status}</span>;
}

// ── 탭 1: 공통 용어집 목록 ───────────────────────────────────────────────

function GlossaryListTab({ onSelectGlossary, selectedId }) {
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const TYPE_OPTIONS = ['', 'VOD', 'SDH', '미디어', '회의록', '공통', '고객사별'];

  const filtered = GLOSSARY_LIST.filter((g) => {
    if (typeFilter && g.type !== typeFilter) return false;
    if (search && !g.name.includes(search)) return false;
    return true;
  });

  return (
    <div className="gloss-tab-body">
      <div className="filter-bar">
        <select
          className="filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t || '업무 유형 전체'}</option>
          ))}
        </select>
        <div className="filter-search">
          <input
            className="filter-search-input"
            placeholder="용어집명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-primary">+ 용어집 추가</button>
        </div>
      </div>

      <div className="gloss-table-wrap">
        <table className="notion-simple-table">
          <thead>
            <tr>
              <th>용어집명</th>
              <th className="text-center">업무 유형</th>
              <th className="text-center">적용 범위</th>
              <th className="text-center">용어 수</th>
              <th className="text-center">승인 대기</th>
              <th className="text-center">최종 수정일</th>
              <th className="text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr
                key={g.id}
                className={`gloss-row${selectedId === g.id ? ' gloss-row-selected' : ''}`}
                onClick={() => onSelectGlossary(g)}
              >
                <td>
                  <span className="gloss-name-link">{g.name}</span>
                </td>
                <td className="text-center">
                  <span className="gloss-type-badge">{g.type}</span>
                </td>
                <td className="text-center">{g.scope}</td>
                <td className="text-center">{g.termCount}</td>
                <td className="text-center">
                  {g.pendingCount > 0
                    ? <span className="gloss-pending-count">{g.pendingCount}</span>
                    : <span className="text-muted-cell">-</span>}
                </td>
                <td className="text-center">{g.updatedAt}</td>
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="gloss-action-btns">
                    <button className="gloss-btn gloss-btn-sm">수정</button>
                    <button className="gloss-btn gloss-btn-sm gloss-btn-danger">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}>검색 결과가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 탭 2: 용어 항목 관리 ─────────────────────────────────────────────────

function TermsTab({ selectedGlossary }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [terms, setTerms] = useState(null);

  const currentTerms = terms ?? (
    selectedGlossary
      ? (TERMS_BY_GLOSSARY[selectedGlossary.id] ?? DEFAULT_TERMS)
      : []
  );

  const filtered = currentTerms.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search && !t.term.includes(search) && !t.recommended.includes(search)) return false;
    return true;
  });

  const handleStatusChange = (id, newStatus) => {
    const base = terms ?? currentTerms;
    setTerms(base.map((t) => t.id === id ? { ...t, status: newStatus } : t));
  };

  if (!selectedGlossary) {
    return (
      <div className="gloss-empty-hint">
        왼쪽 <strong>공통 용어집 목록</strong>에서 용어집을 선택하면 용어 항목이 표시됩니다.
      </div>
    );
  }

  return (
    <div className="gloss-tab-body">
      <div className="gloss-selected-label">
        <span className="gloss-type-badge">{selectedGlossary.type}</span>
        <strong>{selectedGlossary.name}</strong>
        <span className="gloss-term-count-label">용어 {selectedGlossary.termCount}개</span>
      </div>
      <div className="filter-bar">
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">상태 전체</option>
          <option value="승인">승인</option>
          <option value="대기">대기</option>
          <option value="제외">제외</option>
        </select>
        <div className="filter-search">
          <input
            className="filter-search-input"
            placeholder="용어 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-primary">+ 용어 추가</button>
        </div>
      </div>
      <div className="gloss-table-wrap">
        <table className="notion-simple-table">
          <thead>
            <tr>
              <th>용어</th>
              <th>권장 표기</th>
              <th>금지 표기</th>
              <th className="text-center">카테고리</th>
              <th>설명</th>
              <th className="text-center">상태</th>
              <th>출처 프로젝트</th>
              <th className="text-center">최종 수정일</th>
              <th className="text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.term}</strong></td>
                <td className="gloss-recommended">{t.recommended}</td>
                <td className="gloss-forbidden">{t.forbidden !== '-' ? t.forbidden : <span className="text-muted-cell">-</span>}</td>
                <td className="text-center">
                  <span className="gloss-category-tag">{t.category}</span>
                </td>
                <td className="gloss-desc">{t.desc}</td>
                <td className="text-center"><StatusBadge status={t.status} /></td>
                <td className="gloss-source">{t.sourceProject}</td>
                <td className="text-center">{t.updatedAt}</td>
                <td className="text-center" style={{ whiteSpace: 'nowrap' }}>
                  <div className="gloss-action-btns">
                    <button className="gloss-btn gloss-btn-sm">수정</button>
                    {t.status !== '승인' && (
                      <button className="gloss-btn gloss-btn-sm gloss-btn-approve" onClick={() => handleStatusChange(t.id, '승인')}>승인</button>
                    )}
                    {t.status === '승인' && (
                      <button className="gloss-btn gloss-btn-sm" onClick={() => handleStatusChange(t.id, '대기')}>보류</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr className="empty-row"><td colSpan={9}>용어 항목이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 탭 3: 프로젝트 추출 용어 검토 ────────────────────────────────────────

function ExtractedTermsTab() {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('대기');
  const [extracted, setExtracted] = useState(EXTRACTED_TERMS);

  const TYPE_OPTIONS = ['', 'VOD', 'SDH', '미디어', '회의록'];

  const filtered = extracted.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    return true;
  });

  const handleAction = (id, newStatus) => {
    setExtracted((prev) => prev.map((e) => e.id === id ? { ...e, status: newStatus } : e));
  };

  const pendingCount = extracted.filter((e) => e.status === '대기').length;

  return (
    <div className="gloss-tab-body">
      <div className="gloss-flow-banner">
        <div className="gloss-flow-steps">
          {['검수 완료', '용어 추출', '프로젝트 용어집 반영', '공통 용어집 후보 표시', '관리자 검토', '공통 용어집 등록'].map((step, i, arr) => (
            <span key={step} className="gloss-flow-step">
              <span className={`gloss-flow-label${i === 4 ? ' active' : ''}`}>{step}</span>
              {i < arr.length - 1 && <span className="gloss-flow-arrow">›</span>}
            </span>
          ))}
        </div>
        {pendingCount > 0 && (
          <span className="gloss-pending-badge">검토 대기 {pendingCount}건</span>
        )}
      </div>

      <div className="filter-bar">
        <select
          className="filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t || '업무 유형 전체'}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">상태 전체</option>
          <option value="대기">대기</option>
          <option value="승인">승인</option>
          <option value="제외">제외</option>
        </select>
      </div>

      <div className="gloss-table-wrap">
        <table className="notion-simple-table">
          <thead>
            <tr>
              <th>추출 용어</th>
              <th>추천 표기</th>
              <th>출처 프로젝트</th>
              <th className="text-center">업무 유형</th>
              <th className="text-center">차수/주차</th>
              <th>추출 파일</th>
              <th className="text-center">중복</th>
              <th>추천 반영 용어집</th>
              <th className="text-center">상태</th>
              <th className="text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.term}</strong></td>
                <td className="gloss-recommended">{e.recommended}</td>
                <td className="gloss-source">{e.sourceProject}</td>
                <td className="text-center">
                  <span className="gloss-type-badge">{e.type}</span>
                </td>
                <td className="text-center">{e.round}</td>
                <td className="gloss-file">{e.file}</td>
                <td className="text-center">
                  {e.isDuplicate
                    ? <span className="gloss-dup-badge">중복</span>
                    : <span className="text-muted-cell">-</span>}
                </td>
                <td className="gloss-source">{e.targetGlossary}</td>
                <td className="text-center"><StatusBadge status={e.status} /></td>
                <td className="text-center">
                  {e.status === '대기' && (
                    <div className="gloss-action-btns">
                      <button className="gloss-btn gloss-btn-sm gloss-btn-approve" onClick={() => handleAction(e.id, '승인')}>승인</button>
                      <button className="gloss-btn gloss-btn-sm" onClick={() => handleAction(e.id, '제외')}>제외</button>
                    </div>
                  )}
                  {e.status !== '대기' && (
                    <button className="gloss-btn gloss-btn-sm" onClick={() => handleAction(e.id, '대기')}>되돌리기</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr className="empty-row"><td colSpan={10}>추출 용어가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────

const TABS = ['공통 용어집 목록', '용어 항목 관리', '프로젝트 추출 용어 검토'];

export default function ManageGlossaryPage() {
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedGlossary, setSelectedGlossary] = useState(null);

  const handleSelectGlossary = (g) => {
    setSelectedGlossary(g);
    setTabIndex(1);
  };

  return (
    <div className="notion-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">용어집 관리</h1>
            <p className="page-description">업무 유형별 공통 용어집을 관리하고 프로젝트 추출 용어를 검토·승인합니다.</p>
          </div>
        </div>
      </div>

      <div className="gloss-tabs">
        {TABS.map((label, i) => (
          <button
            key={label}
            className={`gloss-tab-btn${tabIndex === i ? ' active' : ''}`}
            onClick={() => setTabIndex(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {tabIndex === 0 && (
        <GlossaryListTab onSelectGlossary={handleSelectGlossary} selectedId={selectedGlossary?.id} />
      )}
      {tabIndex === 1 && (
        <TermsTab selectedGlossary={selectedGlossary} />
      )}
      {tabIndex === 2 && (
        <ExtractedTermsTab />
      )}
    </div>
  );
}
