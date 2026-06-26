import { useState, useCallback } from 'react';
import * as store from './glossaryStore';
import '../../../../styles/notion-list.css';
import './ManageGlossaryPage.css';

// ── 상수 ──────────────────────────────────────────────────────────────────
const TYPE_OPTIONS   = ['VOD', 'SDH', '미디어', '회의록', '공통', '고객사별'];
const SCOPE_OPTIONS  = ['전체', 'VOD', 'SDH', '미디어', '회의록', '특정 고객사', '특정 프로젝트'];
const STATUS_OPTIONS = ['승인', '대기', '제외'];
const DUP_LABEL      = { 신규: 'gloss-dup-new', 중복: 'gloss-dup-dup', 유사: 'gloss-dup-similar' };

// ── 공통 서브컴포넌트 ─────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cls = status === '승인' ? 'gloss-badge-approved'
            : status === '대기' ? 'gloss-badge-pending'
            : 'gloss-badge-excluded';
  return <span className={`gloss-badge ${cls}`}>{status}</span>;
}

// ── 용어집 생성/수정 모달 ─────────────────────────────────────────────────
const EMPTY_GLOSSARY = { name: '', type: 'VOD', scope: '전체' };

function GlossaryFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? EMPTY_GLOSSARY);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.name.trim().length > 0;

  return (
    <div className="gloss-overlay" onClick={onClose}>
      <div className="gloss-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gloss-modal-hd">
          <span className="gloss-modal-title">{initial ? '용어집 수정' : '용어집 추가'}</span>
          <button className="gloss-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="gloss-modal-body">
          <div className="gloss-field">
            <label className="gloss-label">용어집명 *</label>
            <input className="gloss-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="예) VOD 공통 용어집" autoFocus />
          </div>
          <div className="gloss-field-row">
            <div className="gloss-field">
              <label className="gloss-label">업무 유형</label>
              <select className="gloss-select" value={form.type} onChange={(e) => set('type', e.target.value)}>
                {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="gloss-field">
              <label className="gloss-label">적용 범위</label>
              <select className="gloss-select" value={form.scope} onChange={(e) => set('scope', e.target.value)}>
                {SCOPE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="gloss-modal-ft">
          <button className="gloss-btn" onClick={onClose}>취소</button>
          <button className="gloss-btn gloss-btn-primary" onClick={() => valid && onSave(form)} disabled={!valid}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ── 용어 항목 생성/수정 모달 ──────────────────────────────────────────────
const EMPTY_TERM = { term: '', recommended: '', forbidden: '-', category: '', desc: '', status: '승인', sourceProject: '' };

function TermFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? EMPTY_TERM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.term.trim() && form.recommended.trim();

  return (
    <div className="gloss-overlay" onClick={onClose}>
      <div className="gloss-modal gloss-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="gloss-modal-hd">
          <span className="gloss-modal-title">{initial ? '용어 수정' : '용어 추가'}</span>
          <button className="gloss-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="gloss-modal-body">
          <div className="gloss-field-row">
            <div className="gloss-field">
              <label className="gloss-label">용어 *</label>
              <input className="gloss-input" value={form.term} onChange={(e) => set('term', e.target.value)} placeholder="예) 원안 가결" autoFocus />
            </div>
            <div className="gloss-field">
              <label className="gloss-label">권장 표기 *</label>
              <input className="gloss-input" value={form.recommended} onChange={(e) => set('recommended', e.target.value)} placeholder="예) 원안 가결" />
            </div>
            <div className="gloss-field">
              <label className="gloss-label">금지 표기</label>
              <input className="gloss-input" value={form.forbidden} onChange={(e) => set('forbidden', e.target.value)} placeholder="예) 원안가결 (없으면 -)" />
            </div>
          </div>
          <div className="gloss-field-row">
            <div className="gloss-field">
              <label className="gloss-label">카테고리</label>
              <input className="gloss-input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="예) 회의 용어" />
            </div>
            <div className="gloss-field">
              <label className="gloss-label">상태</label>
              <select className="gloss-select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="gloss-field">
              <label className="gloss-label">출처 프로젝트</label>
              <input className="gloss-input" value={form.sourceProject} onChange={(e) => set('sourceProject', e.target.value)} placeholder="예) 회의록 공통" />
            </div>
          </div>
          <div className="gloss-field">
            <label className="gloss-label">설명</label>
            <input className="gloss-input" value={form.desc} onChange={(e) => set('desc', e.target.value)} placeholder="예) 띄어쓰기 주의" />
          </div>
        </div>
        <div className="gloss-modal-ft">
          <button className="gloss-btn" onClick={onClose}>취소</button>
          <button className="gloss-btn gloss-btn-primary" onClick={() => valid && onSave(form)} disabled={!valid}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ── 추출 용어 수정 모달 ───────────────────────────────────────────────────
function ExtractedEditModal({ item, glossaries, onSave, onClose }) {
  const [form, setForm] = useState({
    term: item.term,
    recommended: item.recommended,
    forbidden: item.forbidden || '-',
    category: item.category,
    desc: item.desc || '',
    targetGlossaryId: item.targetGlossaryId,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="gloss-overlay" onClick={onClose}>
      <div className="gloss-modal gloss-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="gloss-modal-hd">
          <span className="gloss-modal-title">추출 용어 수정 후 승인</span>
          <button className="gloss-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="gloss-modal-body">
          <div className="gloss-extracted-info">
            <span className="gloss-info-chip">출처: {item.sourceProject}</span>
            <span className="gloss-info-chip">파일: {item.file}</span>
            <span className="gloss-info-chip">유형: {item.type}</span>
          </div>
          <div className="gloss-field-row">
            <div className="gloss-field">
              <label className="gloss-label">용어 *</label>
              <input className="gloss-input" value={form.term} onChange={(e) => set('term', e.target.value)} autoFocus />
            </div>
            <div className="gloss-field">
              <label className="gloss-label">권장 표기 *</label>
              <input className="gloss-input" value={form.recommended} onChange={(e) => set('recommended', e.target.value)} />
            </div>
            <div className="gloss-field">
              <label className="gloss-label">금지 표기</label>
              <input className="gloss-input" value={form.forbidden} onChange={(e) => set('forbidden', e.target.value)} />
            </div>
          </div>
          <div className="gloss-field-row">
            <div className="gloss-field">
              <label className="gloss-label">카테고리</label>
              <input className="gloss-input" value={form.category} onChange={(e) => set('category', e.target.value)} />
            </div>
            <div className="gloss-field">
              <label className="gloss-label">설명</label>
              <input className="gloss-input" value={form.desc} onChange={(e) => set('desc', e.target.value)} />
            </div>
          </div>
          <div className="gloss-field">
            <label className="gloss-label">반영할 용어집</label>
            <select className="gloss-select" value={form.targetGlossaryId} onChange={(e) => set('targetGlossaryId', e.target.value)}>
              {glossaries.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="gloss-extracted-note">
            ✓ 저장 후 승인하면 선택한 용어집에 위 정보로 용어가 등록됩니다.
          </div>
        </div>
        <div className="gloss-modal-ft">
          <button className="gloss-btn" onClick={onClose}>취소</button>
          <button className="gloss-btn gloss-btn-primary" onClick={() => onSave(form)}>수정 후 승인</button>
        </div>
      </div>
    </div>
  );
}

// ── 탭 1: 공통 용어집 목록 ────────────────────────────────────────────────
function GlossaryListTab({ glossaries, onSelectGlossary, selectedId, onRefresh }) {
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch]       = useState('');
  const [formModal, setFormModal] = useState(null); // null | 'new' | glossaryObj

  const filtered = glossaries.filter((g) => {
    if (typeFilter && g.type !== typeFilter) return false;
    if (search && !g.name.includes(search)) return false;
    return true;
  });

  const handleSave = (form) => {
    if (formModal === 'new') {
      store.addGlossary(form);
    } else {
      store.updateGlossary(formModal.id, form);
    }
    setFormModal(null);
    onRefresh();
  };

  const handleDelete = (e, g) => {
    e.stopPropagation();
    if (!window.confirm(`"${g.name}" 용어집을 삭제하면 포함된 모든 용어도 삭제됩니다. 계속하시겠습니까?`)) return;
    store.deleteGlossary(g.id);
    onRefresh();
  };

  return (
    <div className="gloss-tab-body">
      {formModal && (
        <GlossaryFormModal
          initial={formModal === 'new' ? null : { name: formModal.name, type: formModal.type, scope: formModal.scope }}
          onSave={handleSave}
          onClose={() => setFormModal(null)}
        />
      )}

      <div className="filter-bar">
        <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">업무 유형 전체</option>
          {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <div className="filter-search">
          <input className="filter-search-input" placeholder="용어집명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-primary" onClick={() => setFormModal('new')}>+ 용어집 추가</button>
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
            {filtered.map((g) => {
              const stats = store.getTermStats(g.id);
              return (
                <tr key={g.id} className={`gloss-row${selectedId === g.id ? ' gloss-row-selected' : ''}`} onClick={() => onSelectGlossary(g)}>
                  <td><span className="gloss-name-link">{g.name}</span></td>
                  <td className="text-center"><span className="gloss-type-badge">{g.type}</span></td>
                  <td className="text-center">{g.scope}</td>
                  <td className="text-center">{stats.termCount}</td>
                  <td className="text-center">
                    {stats.pendingCount > 0
                      ? <span className="gloss-pending-count">{stats.pendingCount}</span>
                      : <span className="text-muted-cell">-</span>}
                  </td>
                  <td className="text-center">{g.updatedAt}</td>
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="gloss-action-btns">
                      <button className="gloss-btn gloss-btn-sm" onClick={() => setFormModal(g)}>수정</button>
                      <button className="gloss-btn gloss-btn-sm gloss-btn-danger" onClick={(e) => handleDelete(e, g)}>삭제</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr className="empty-row"><td colSpan={7}>검색 결과가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 탭 2: 용어 항목 관리 ──────────────────────────────────────────────────
function TermsTab({ selectedGlossary, onRefresh }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [termModal, setTermModal]       = useState(null); // null | 'new' | termObj
  const [terms, setTerms]               = useState(() => selectedGlossary ? store.getTerms(selectedGlossary.id) : []);

  const reload = useCallback(() => {
    if (selectedGlossary) setTerms(store.getTerms(selectedGlossary.id));
    onRefresh();
  }, [selectedGlossary, onRefresh]);

  // selectedGlossary가 바뀌면 용어 목록 다시 로드
  const [prevId, setPrevId] = useState(selectedGlossary?.id);
  if (selectedGlossary?.id !== prevId) {
    setPrevId(selectedGlossary?.id);
    setTerms(selectedGlossary ? store.getTerms(selectedGlossary.id) : []);
  }

  const filtered = terms.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search && !t.term.includes(search) && !t.recommended.includes(search)) return false;
    return true;
  });

  const handleSave = (form) => {
    if (termModal === 'new') {
      store.addTerm(selectedGlossary.id, form);
    } else {
      store.updateTerm(selectedGlossary.id, termModal.id, form);
    }
    setTermModal(null);
    reload();
  };

  const handleDelete = (t) => {
    if (!window.confirm(`"${t.term}" 용어를 삭제하시겠습니까?`)) return;
    store.deleteTerm(selectedGlossary.id, t.id);
    reload();
  };

  const handleStatusChange = (id, newStatus) => {
    store.updateTerm(selectedGlossary.id, id, { status: newStatus });
    reload();
  };

  if (!selectedGlossary) {
    return <div className="gloss-empty-hint">왼쪽 <strong>공통 용어집 목록</strong>에서 용어집을 선택하면 용어 항목이 표시됩니다.</div>;
  }

  return (
    <div className="gloss-tab-body">
      {termModal && (
        <TermFormModal
          initial={termModal === 'new' ? null : termModal}
          onSave={handleSave}
          onClose={() => setTermModal(null)}
        />
      )}

      <div className="gloss-selected-label">
        <span className="gloss-type-badge">{selectedGlossary.type}</span>
        <strong>{selectedGlossary.name}</strong>
        <span className="gloss-term-count-label">용어 {terms.length}개</span>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">상태 전체</option>
          {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="filter-search">
          <input className="filter-search-input" placeholder="용어 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-primary" onClick={() => setTermModal('new')}>+ 용어 추가</button>
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
                <td className="text-center"><span className="gloss-category-tag">{t.category}</span></td>
                <td className="gloss-desc">{t.desc}</td>
                <td className="text-center"><StatusBadge status={t.status} /></td>
                <td className="gloss-source">{t.sourceProject}</td>
                <td className="text-center">{t.updatedAt}</td>
                <td className="text-center">
                  <div className="gloss-action-btns">
                    <button className="gloss-btn gloss-btn-sm" onClick={() => setTermModal(t)}>수정</button>
                    {t.status !== '승인' && (
                      <button className="gloss-btn gloss-btn-sm gloss-btn-approve" onClick={() => handleStatusChange(t.id, '승인')}>승인</button>
                    )}
                    <button className="gloss-btn gloss-btn-sm gloss-btn-danger" onClick={() => handleDelete(t)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr className="empty-row"><td colSpan={9}>용어 항목이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 탭 3: 프로젝트 추출 용어 검토 ────────────────────────────────────────
function ExtractedTermsTab({ glossaries, onRefresh }) {
  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('대기');
  const [extracted, setExtracted]       = useState(() => store.getExtracted());
  const [editModal, setEditModal]       = useState(null);

  const reload = () => {
    setExtracted(store.getExtracted());
    onRefresh();
  };

  const handleApprove = (id) => {
    store.approveExtracted(id);
    reload();
  };

  const handleExclude = (id) => {
    store.excludeExtracted(id);
    reload();
  };

  const handleReset = (id) => {
    store.resetExtracted(id);
    reload();
  };

  const handleEditSave = (form) => {
    store.updateExtracted(editModal.id, form);
    store.approveExtracted(editModal.id);
    setEditModal(null);
    reload();
  };

  const filtered = extracted.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    return true;
  });

  const pendingCount = extracted.filter((e) => e.status === '대기').length;

  return (
    <div className="gloss-tab-body">
      {editModal && (
        <ExtractedEditModal
          item={editModal}
          glossaries={glossaries}
          onSave={handleEditSave}
          onClose={() => setEditModal(null)}
        />
      )}

      <div className="gloss-guide-banner">
        <p className="gloss-guide-text">
          검수 완료된 프로젝트에서 추출된 용어 후보입니다.<br />
          <strong>승인</strong>하면 추천 반영 용어집에 추가되고, <strong>제외</strong>하면 공통 용어집에 반영되지 않습니다.
        </p>
        {pendingCount > 0 && <span className="gloss-pending-badge">검토 대기 {pendingCount}건</span>}
      </div>

      <div className="gloss-flow-banner">
        <div className="gloss-flow-steps">
          {['검수 완료', '용어 추출', '중복 비교', '검토 대기 표시', '관리자 검토 ◀', '공통 용어집 반영'].map((step, i, arr) => (
            <span key={step} className="gloss-flow-step">
              <span className={`gloss-flow-label${i === 4 ? ' active' : ''}`}>{step}</span>
              {i < arr.length - 1 && <span className="gloss-flow-arrow">›</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">업무 유형 전체</option>
          {['VOD', 'SDH', '미디어', '회의록'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
            {filtered.map((e) => {
              const targetName = glossaries.find((g) => g.id === e.targetGlossaryId)?.name || e.targetGlossaryId;
              return (
                <tr key={e.id}>
                  <td><strong>{e.term}</strong></td>
                  <td className="gloss-recommended">{e.recommended}</td>
                  <td className="gloss-source">{e.sourceProject}</td>
                  <td className="text-center"><span className="gloss-type-badge">{e.type}</span></td>
                  <td className="text-center">{e.round}</td>
                  <td className="gloss-file">{e.file}</td>
                  <td className="text-center">
                    <span className={`gloss-dup-badge ${DUP_LABEL[e.duplicate] || ''}`}>{e.duplicate}</span>
                  </td>
                  <td className="gloss-source">{targetName}</td>
                  <td className="text-center"><StatusBadge status={e.status} /></td>
                  <td className="text-center">
                    {e.status === '대기' && (
                      <div className="gloss-action-btns">
                        <button className="gloss-btn gloss-btn-sm gloss-btn-approve" onClick={() => handleApprove(e.id)}>승인</button>
                        <button className="gloss-btn gloss-btn-sm" onClick={() => setEditModal(e)}>수정</button>
                        <button className="gloss-btn gloss-btn-sm gloss-btn-danger" onClick={() => handleExclude(e.id)}>제외</button>
                      </div>
                    )}
                    {e.status !== '대기' && (
                      <button className="gloss-btn gloss-btn-sm" onClick={() => handleReset(e.id)}>되돌리기</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr className="empty-row"><td colSpan={10}>추출 용어가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────
const TABS = ['공통 용어집 목록', '용어 항목 관리', '프로젝트 추출 용어 검토'];

export default function ManageGlossaryPage() {
  const [tabIndex, setTabIndex]             = useState(0);
  const [glossaries, setGlossaries]         = useState(() => store.getGlossaries());
  const [selectedGlossary, setSelectedGlossary] = useState(null);

  const refresh = useCallback(() => setGlossaries(store.getGlossaries()), []);

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
          <button key={label} className={`gloss-tab-btn${tabIndex === i ? ' active' : ''}`} onClick={() => setTabIndex(i)}>
            {label}
          </button>
        ))}
      </div>

      {tabIndex === 0 && (
        <GlossaryListTab
          glossaries={glossaries}
          onSelectGlossary={handleSelectGlossary}
          selectedId={selectedGlossary?.id}
          onRefresh={refresh}
        />
      )}
      {tabIndex === 1 && (
        <TermsTab
          selectedGlossary={selectedGlossary}
          onRefresh={refresh}
        />
      )}
      {tabIndex === 2 && (
        <ExtractedTermsTab
          glossaries={glossaries}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
