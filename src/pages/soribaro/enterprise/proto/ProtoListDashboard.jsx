import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateSampleSpecialNote, updateSampleSubfileStatus } from './protoStore';

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

const SEARCH_FIELDS = [
  { value: 'contractType', label: '계약구분' },
  { value: 'dueDate', label: '납품기한' },
  { value: 'membNm', label: '의뢰자명' },
  { value: 'round', label: '회차' },
  { value: 'worker', label: '작업자명' },
];

function computeStats(samples) {
  const total = samples.length;
  const working  = samples.filter((s) => s.overallStatus === 'WORKING').length;
  const checking = samples.filter((s) => s.overallStatus === 'CHECKING').length;
  const deliveryDone = samples.flatMap((s) => s.deliveries).filter((d) => d.status === '납품완료').length;
  const settleWait   = samples.filter((s) => ['정산대기', '부분정산'].includes(s.settlement.status)).length;
  return { total, working, checking, deliveryDone, settleWait };
}

function matchesSearch(s, field, text) {
  if (!text.trim()) return true;
  const q = text.trim().toLowerCase();
  if (field === 'contractType') return (s.contractType || '').toLowerCase().includes(q);
  if (field === 'dueDate') return (s.dueDate || '').includes(q);
  if (field === 'membNm') return (s.membNm || '').toLowerCase().includes(q);
  if (field === 'round') return String(s.round ?? '').includes(q);
  if (field === 'worker') return (s.assignments || []).some((a) => (a.worker || '').toLowerCase().includes(q));
  return true;
}

export default function ProtoListDashboard({ samples, onSamplesChange }) {
  const navigate = useNavigate();
  const [searchField, setSearchField] = useState('contractType');
  const [searchText, setSearchText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteInput, setNoteInput] = useState('');

  const handleSearchFieldChange = (field) => {
    setSearchField(field);
    setSearchText('');
  };

  const filtered = samples.filter((s) => matchesSearch(s, searchField, searchText));
  const st = computeStats(samples);

  const statCards = [
    { label: '전체 프로젝트', value: st.total,       color: 'var(--accent-color)' },
    { label: '작업중',        value: st.working,      color: '#f87171' },
    { label: '검수중',        value: st.checking,     color: '#fbbf24' },
    { label: '납품 완료',     value: st.deliveryDone, color: '#4ade80' },
    { label: '정산 대기',     value: st.settleWait,   color: '#a78bfa' },
  ];

  const maxBarValue = Math.max(st.working, st.checking, st.deliveryDone, st.settleWait, 1);
  const statusBars = [
    { label: '작업중',   value: st.working,      color: '#f87171' },
    { label: '검수중',   value: st.checking,     color: '#fbbf24' },
    { label: '납품완료', value: st.deliveryDone, color: '#4ade80' },
    { label: '정산대기', value: st.settleWait,   color: '#a78bfa' },
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <p className="proto-dash-section-title" style={{ margin: 0 }}>최근 프로젝트</p>
          <div className="proto-search-bar">
            <select
              className="proto-search-select"
              value={searchField}
              onChange={(e) => handleSearchFieldChange(e.target.value)}
            >
              {SEARCH_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <input
              className="proto-search-input"
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="검색어 입력"
            />
          </div>
        </div>
        <div className="proto-table-wrap" style={{ marginBottom: 0 }}>
          <table className="proto-table">
            <thead>
              <tr>
                <th>업체명</th>
                <th>프로젝트명</th>
                <th className="text-center">작업유형</th>
                <th className="text-center">납품기한</th>
                <th className="text-center">상태</th>
                <th className="text-center">정산</th>
                <th className="text-center">서브파일요청</th>
                <th style={{ minWidth: '140px' }}>특이사항</th>
                <th className="text-center" style={{ width: '72px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>검색 결과가 없습니다.</td></tr>
              ) : (
                filtered.map((s) => {
                  const subStatus = s.subfileStatus || '미요청';
                  const isEditingNote = editingNoteId === s.id;
                  return (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(s.protoPath)}>
                      <td style={{ fontWeight: 600 }}>{s.entNm}</td>
                      <td style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{s.servTitle}</td>
                      <td className="text-center">{s.bssTypeName}</td>
                      <td className="text-center">{s.dueDate}</td>
                      <td className="text-center">{statusBadge(s.overallStatus)}</td>
                      <td className="text-center">{settleBadge(s.settlement.status)}</td>
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
        <p className="proto-dash-section-title">상태별 현황</p>
        <div className="proto-dash-status-grid">
          {statusBars.map((b) => (
            <div key={b.label} className="proto-dash-status-item">
              <span className="proto-dash-status-label">{b.label}</span>
              <div className="proto-dash-status-bar-bg">
                <div
                  className="proto-dash-status-bar-fill"
                  style={{ width: `${(b.value / maxBarValue) * 100}%`, background: b.color }}
                />
              </div>
              <span className="proto-dash-status-count" style={{ color: b.value > 0 ? b.color : 'var(--text-muted)' }}>
                {b.value}건
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
