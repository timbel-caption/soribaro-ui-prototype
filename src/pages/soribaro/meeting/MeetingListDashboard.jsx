import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateSampleSpecialNote, updateSampleSubfileStatus } from '../enterprise/proto/protoStore';

const STATUS_LABEL = {
  WORKING:  { label: '작업중',  cls: 'proto-status-working' },
  CHECKING: { label: '검수중',  cls: 'proto-status-checking' },
  DONE:     { label: '완료',    cls: 'proto-status-done' },
};

function statusBadge(s) {
  const m = STATUS_LABEL[s] ?? { label: s, cls: 'proto-status-done' };
  return <span className={`proto-status-badge ${m.cls}`} style={{ fontSize: '11px', padding: '2px 8px' }}>{m.label}</span>;
}

function settleBadge(s) {
  if (s === '정산완료') return <span className="proto-settle-badge-done" style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '정산대기') return <span className="proto-settle-badge-wait" style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '부분정산') return <span className="proto-settle-badge-partial" style={{ fontSize: '11px' }}>{s}</span>;
  return <span className="proto-settle-badge-pre" style={{ fontSize: '11px' }}>{s}</span>;
}

const SUBFILE_CYCLE = ['미요청', '요청', '수령'];
const SUBFILE_ICON = { '미요청': '□', '요청': '✔', '수령': '⭕' };
const SUBFILE_CLS = { '미요청': 'proto-subfile-none', '요청': 'proto-subfile-req', '수령': 'proto-subfile-recv' };

const CONTRACT_TYPE_OPTIONS = ['학폭위', '교권위', '성고충위', '징계위', '특운위', '시청', '의회', '일반회의'];

function formatRegDate(regDttm) {
  if (!regDttm) return '-';
  return regDttm.replace(/-/g, '').slice(2, 8);
}

function computeStats(samples) {
  const inProgress = samples.filter((s) => s.overallStatus !== 'DONE').length;
  const working    = samples.filter((s) => s.overallStatus === 'WORKING').length;
  const checking   = samples.filter((s) => s.overallStatus === 'CHECKING').length;
  const checkDone  = samples.filter((s) => s.overallStatus === 'DONE').length;
  const settleWait = samples.filter((s) => ['정산대기', '부분정산'].includes(s.settlement.status)).length;
  return { inProgress, working, checking, checkDone, settleWait };
}

function matchesFilters(s, { filterFrom, filterTo, filterStatus, filterSettlement, filterEntNm, filterContractType, searchText, showAll }) {
  if (!showAll && s.overallStatus === 'DONE') return false;
  const date = (s.regDttm || '').slice(0, 10);
  if (filterFrom && date < filterFrom) return false;
  if (filterTo && date > filterTo) return false;
  if (filterStatus && s.overallStatus !== filterStatus) return false;
  if (filterSettlement && s.settlement?.status !== filterSettlement) return false;
  if (filterContractType && s.contractType !== filterContractType) return false;
  if (filterEntNm.trim()) {
    const q = filterEntNm.trim().toLowerCase();
    if (!(s.entNm || '').toLowerCase().includes(q)) return false;
  }
  if (searchText.trim()) {
    const q = searchText.trim().toLowerCase();
    const haystack = [s.entNm, s.contractType, s.membNm, String(s.round ?? ''), s.specialNote]
      .map((v) => (v || '').toLowerCase()).join(' ');
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function computeAlerts(samples) {
  const today = new Date().toISOString().split('T')[0];
  const todayDue = samples.filter((s) => s.dueDate === today && s.overallStatus !== 'DONE').length;
  const overdue  = samples.filter((s) => s.dueDate < today && s.overallStatus !== 'DONE').length;
  return { todayDue, overdue };
}

export default function MeetingListDashboard({ samples, onSamplesChange, showAll }) {
  const navigate = useNavigate();
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSettlement, setFilterSettlement] = useState('');
  const [filterEntNm, setFilterEntNm] = useState('');
  const [filterContractType, setFilterContractType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteInput, setNoteInput] = useState('');

  const handleSearch = () => setSearchText(pendingSearch);

  const filtered = samples.filter((s) =>
    matchesFilters(s, { filterFrom, filterTo, filterStatus, filterSettlement, filterEntNm, filterContractType, searchText, showAll })
  );
  const st = computeStats(samples);
  const alerts = computeAlerts(samples);

  const statCards = [
    { label: '진행 중 의뢰', value: st.inProgress,  color: 'var(--accent-color)' },
    { label: '작업중',        value: st.working,     color: '#f87171' },
    { label: '검수중',        value: st.checking,    color: '#fbbf24' },
    { label: '검수 완료',     value: st.checkDone,   color: '#4ade80' },
    { label: '정산 대기',     value: st.settleWait,  color: '#a78bfa' },
  ];

  const cycleSubfile = (s) => {
    const cur = s.subfileStatus || '미요청';
    const next = SUBFILE_CYCLE[(SUBFILE_CYCLE.indexOf(cur) + 1) % SUBFILE_CYCLE.length];
    updateSampleSubfileStatus(s.id, next);
    onSamplesChange?.();
  };

  const startEditNote = (s, e) => {
    e.stopPropagation();
    setEditingNoteId(s.id);
    setNoteInput(s.specialNote || '');
  };

  const commitNote = (s) => {
    updateSampleSpecialNote(s.id, noteInput);
    onSamplesChange?.();
    setEditingNoteId(null);
  };

  const cancelNote = () => setEditingNoteId(null);

  return (
    <div className="proto-dashboard">
      <div className="proto-dash-header">
        <span className="proto-label-chip">5차 고도화</span>
        <span className="proto-dash-title">프로토타입 샘플 현황</span>
        <span className="proto-notice-chip">실제 데이터 미연동</span>
      </div>

      <div className="proto-dash-cards">
        {statCards.map((c) => (
          <div key={c.label} className="proto-dash-card">
            <span className="proto-dash-value" style={{ color: c.color }}>{c.value}</span>
            <span className="proto-dash-label">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="proto-dash-projects">
        <p className="proto-dash-section-title" style={{ marginBottom: '8px' }}>진행 의뢰 현황</p>
        <div className="filter-bar" style={{ marginBottom: '12px' }}>
          <input
            className="filter-date"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            title="의뢰일 시작"
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>~</span>
          <input
            className="filter-date"
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            title="의뢰일 종료"
          />
          <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">상태 전체</option>
            <option value="WORKING">작업중</option>
            <option value="CHECKING">검수중</option>
            <option value="DONE">완료</option>
          </select>
          <select className="filter-select" value={filterSettlement} onChange={(e) => setFilterSettlement(e.target.value)}>
            <option value="">정산 전체</option>
            <option value="정산전">정산전</option>
            <option value="정산대기">정산대기</option>
            <option value="부분정산">부분정산</option>
            <option value="정산완료">정산완료</option>
          </select>
          <select className="filter-select" value={filterContractType} onChange={(e) => setFilterContractType(e.target.value)}>
            <option value="">계약구분 전체</option>
            {CONTRACT_TYPE_OPTIONS.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
          </select>
          <input
            className="filter-input"
            type="text"
            value={filterEntNm}
            onChange={(e) => setFilterEntNm(e.target.value)}
            placeholder="업체명"
          />
          <input
            className="filter-input"
            type="text"
            value={pendingSearch}
            onChange={(e) => setPendingSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="검색어"
          />
          <button className="btn-primary" style={{ height: '32px', fontSize: '13px', padding: '0 14px' }} onClick={handleSearch}>검색</button>
        </div>
        <div className="proto-table-wrap" style={{ marginBottom: 0 }}>
          <table className="proto-table">
            <thead>
              <tr>
                <th className="text-center">의뢰일자</th>
                <th>업체명</th>
                <th className="text-center">계약구분</th>
                <th className="text-center">회차</th>
                <th className="text-center">의뢰시간</th>
                <th className="text-center">납품기한</th>
                <th className="text-center">서브파일요청</th>
                <th style={{ minWidth: '140px' }}>특이사항</th>
                <th className="text-center">상태</th>
                <th className="text-center">정산</th>
                <th className="text-center" style={{ width: '72px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>검색 결과가 없습니다.</td></tr>
              ) : (
                filtered.map((s) => {
                  const subStatus = s.subfileStatus || '미요청';
                  const isEditingNote = editingNoteId === s.id;
                  return (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(s.protoPath)}>
                      <td className="text-center">{formatRegDate(s.regDttm)}</td>
                      <td style={{ fontWeight: 600 }}>{s.entNm}</td>
                      <td className="text-center">{s.contractType || '-'}</td>
                      <td className="text-center">{s.round != null ? `제${s.round}차` : '-'}</td>
                      <td className="text-center">{s.totalPlayTm || '-'}</td>
                      <td className="text-center">{s.dueDate}</td>
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          className={`proto-subfile-btn ${SUBFILE_CLS[subStatus]}`}
                          onClick={() => cycleSubfile(s)}
                          title={`현재: ${subStatus} (클릭하여 변경)`}
                        >
                          {SUBFILE_ICON[subStatus]} {subStatus}
                        </button>
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ maxWidth: '180px' }}>
                        {isEditingNote ? (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                              className="proto-note-inline-input"
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitNote(s); if (e.key === 'Escape') cancelNote(); }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button className="proto-note-save-btn" onClick={() => commitNote(s)}>✓</button>
                            <button className="proto-note-cancel-btn" onClick={cancelNote}>✕</button>
                          </div>
                        ) : (
                          <div
                            className="proto-note-cell"
                            title={s.specialNote || ''}
                            onClick={(e) => startEditNote(s, e)}
                          >
                            {s.specialNote || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>입력</span>}
                          </div>
                        )}
                      </td>
                      <td className="text-center">{statusBadge(s.overallStatus)}</td>
                      <td className="text-center">{settleBadge(s.settlement.status)}</td>
                      <td className="text-center">
                        <button
                          className="proto-dash-detail-btn"
                          onClick={(e) => { e.stopPropagation(); navigate(s.protoPath); }}
                        >
                          상세보기
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="proto-dash-status-bottom">
        <p className="proto-dash-section-title">긴급 알림</p>
        <div className="proto-alert-list">
          <div className="proto-alert-item proto-alert-urgent">
            <span className="proto-alert-icon">⚠️</span>
            <span className="proto-alert-text">오늘 마감</span>
            <span className="proto-alert-count">{alerts.todayDue}건</span>
          </div>
          <div className="proto-alert-item proto-alert-delay">
            <span className="proto-alert-icon">🔔</span>
            <span className="proto-alert-text">납품 지연</span>
            <span className="proto-alert-count">{alerts.overdue}건</span>
          </div>
        </div>
      </div>
    </div>
  );
}
