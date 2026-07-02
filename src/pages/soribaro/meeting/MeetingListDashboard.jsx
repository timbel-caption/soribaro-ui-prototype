import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateSampleSpecialNote, updateSampleSubfileStatus, updateSamplePlayTime, updateStenographyWorkerAssign } from '../enterprise/proto/protoStore';
import StenographyWorkerAssignModal from '../enterprise/proto/StenographyWorkerAssignModal';
import { downloadMeetingWorkExcel, downloadStenographyWorkExcel } from '../../../utils/workManagementExcel';

const STATUS_LABEL = {
  WORKING:  { label: '작업중',  cls: 'mtg-status-working' },
  CHECKING: { label: '검수중',  cls: 'mtg-status-checking' },
  DONE:     { label: '완료',    cls: 'mtg-status-done' },
};

function statusBadge(s) {
  const m = STATUS_LABEL[s] ?? { label: s, cls: 'mtg-status-done' };
  return <span className={`mtg-status-badge ${m.cls}`}>{m.label}</span>;
}

function deriveSettleStatus(settlement) {
  const ws = settlement?.workerSettled || false;
  const cs = settlement?.companySettled || false;
  if (ws && cs)  return '완료';
  if (ws && !cs) return '업체 정산대기';
  if (!ws && cs) return '작업자 정산대기';
  return '정산대기';
}

function settleBadge(s) {
  if (s === '완료')          return <span className="mtg-settle-badge mtg-settle-done">{s}</span>;
  if (s === '업체 정산대기') return <span className="mtg-settle-badge mtg-settle-wait">{s}</span>;
  if (s === '작업자 정산대기') return <span className="mtg-settle-badge mtg-settle-wait">{s}</span>;
  if (s === '정산대기')      return <span className="mtg-settle-badge mtg-settle-wait">{s}</span>;
  if (s === '부분정산')      return <span className="mtg-settle-badge mtg-settle-partial">{s}</span>;
  return <span className="mtg-settle-badge mtg-settle-pre">{s}</span>;
}

const CONTRACT_TYPE_COLOR = {
  '학폭위':   { bg: 'rgba(239,68,68,0.12)',   color: '#f87171',  border: 'rgba(239,68,68,0.4)' },
  '교권위':   { bg: 'rgba(99,102,241,0.12)',  color: '#818cf8',  border: 'rgba(99,102,241,0.4)' },
  '성고충위': { bg: 'rgba(251,146,60,0.12)',  color: '#fb923c',  border: 'rgba(251,146,60,0.4)' },
  '징계위':   { bg: 'rgba(168,85,247,0.12)',  color: '#c084fc',  border: 'rgba(168,85,247,0.4)' },
  '특운위':   { bg: 'rgba(45,212,191,0.12)',  color: '#2dd4bf',  border: 'rgba(45,212,191,0.4)' },
  '시청':     { bg: 'rgba(250,204,21,0.12)',  color: '#facc15',  border: 'rgba(250,204,21,0.4)' },
  '의회':     { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa',  border: 'rgba(96,165,250,0.4)' },
  '일반회의': { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8',  border: 'rgba(148,163,184,0.4)' },
};

function contractBadge(type) {
  if (!type || type === '-') return <span style={{ color: 'var(--text-muted)' }}>-</span>;
  const c = CONTRACT_TYPE_COLOR[type] || { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: 'rgba(148,163,184,0.4)' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {type}
    </span>
  );
}

const SUBFILE_CYCLE = ['미요청', '요청', '수령'];
const SUBFILE_ICON  = { '미요청': '□', '요청': '✓', '수령': '○' };
const SUBFILE_TEXT  = { '미요청': '',   '요청': '요청', '수령': '확인' };
const SUBFILE_CLS   = { '미요청': 'mtg-subfile-none', '요청': 'mtg-subfile-req', '수령': 'mtg-subfile-recv' };

const CONTRACT_TYPE_OPTIONS = ['학폭위', '교권위', '성고충위', '징계위', '특운위', '시청', '의회', '일반회의'];

function formatRegDate(regDttm) {
  if (!regDttm) return '-';
  return regDttm.replace(/-/g, '').slice(2, 8);
}

// 진행의뢰현황 > 상세보기 > 프로젝트 관리(workProgress)의 파일별 진행률을 전체 대비 100 기준으로 환산
function computeOverallProgress(s) {
  if (!s.workProgress || s.workProgress.length === 0) return 0;
  const sum = s.workProgress.reduce((acc, w) => acc + w.progress, 0);
  return Math.round(sum / s.workProgress.length);
}

function computeStats(samples) {
  const inProgress = samples.filter((s) => s.overallStatus !== 'DONE').length;
  const working    = samples.filter((s) => s.overallStatus === 'WORKING').length;
  const checking   = samples.filter((s) => s.overallStatus === 'CHECKING').length;
  const checkDone  = samples.filter((s) => s.overallStatus === 'DONE').length;
  const settleWait = samples.filter((s) => deriveSettleStatus(s.settlement) !== '완료').length;
  return { inProgress, working, checking, checkDone, settleWait };
}

function matchesFilters(s, { filterFrom, filterTo, filterStatus, filterSettlement, filterContractType, searchCondition, searchText, showAll }) {
  if (!showAll && s.overallStatus === 'DONE') return false;
  const date = (s.regDttm || '').slice(0, 10);
  if (filterFrom && date < filterFrom) return false;
  if (filterTo && date > filterTo) return false;
  if (filterStatus && s.overallStatus !== filterStatus) return false;
  if (filterSettlement) {
    const st = deriveSettleStatus(s.settlement);
    if (filterSettlement === '정산대기' && st === '완료') return false;
    if (filterSettlement === '정산완료' && st !== '완료') return false;
    if (filterSettlement !== '정산대기' && filterSettlement !== '정산완료' && st !== filterSettlement) return false;
  }
  if (filterContractType && s.contractType !== filterContractType) return false;
  if (searchText.trim()) {
    const q = searchText.trim().toLowerCase();
    let hay = '';
    if (searchCondition === '업체명')    hay = (s.entNm || '').toLowerCase();
    else if (searchCondition === '작업자명') hay = (s.membNm || '').toLowerCase();
    else if (searchCondition === '회차')    hay = String(s.round ?? '').toLowerCase();
    else if (searchCondition === '담당자명') hay = (s.managerNm || '').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function computeAlerts(samples) {
  const today = new Date().toISOString().split('T')[0];
  const todayDueItems = samples.filter((s) => s.dueDate === today && s.overallStatus !== 'DONE');
  const overdueItems  = samples.filter((s) => s.dueDate < today  && s.overallStatus !== 'DONE');
  return { todayDue: todayDueItems.length, overdue: overdueItems.length, todayDueItems, overdueItems };
}

// 진행 의뢰 현황 + 납품 모니터링 통합 탭
const REQUEST_TABS = [
  { key: 'all', label: '진행 전체' },
  { key: 'today', label: '금일 납품' },
  { key: 'overdue', label: '납품 일정 확인' },
];

export default function MeetingListDashboard({ samples, onSamplesChange, showAll, workType = 'meeting' }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSettlement, setFilterSettlement] = useState('');
  const [filterContractType, setFilterContractType] = useState('');
  const [searchCondition, setSearchCondition] = useState('업체명');
  const [searchText, setSearchText] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteInput, setNoteInput] = useState('');
  const [editingManagerId, setEditingManagerId] = useState(null);
  const [managerInput, setManagerInput] = useState('');
  const [managerOverrides, setManagerOverrides] = useState({});
  const [editingPlayTimeId, setEditingPlayTimeId] = useState(null);
  const [playTimeInput, setPlayTimeInput] = useState('');

  const handleSearch = () => setSearchText(pendingSearch);

  const handleExportExcel = () => {
    if (workType === 'stenography') downloadStenographyWorkExcel(filtered);
    else downloadMeetingWorkExcel(filtered);
  };

  const filtered = samples.filter((s) =>
    matchesFilters(s, { filterFrom, filterTo, filterStatus, filterSettlement, filterContractType, searchCondition, searchText, showAll })
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

  const startEditManager = (s, e) => {
    e.stopPropagation();
    setEditingManagerId(s.id);
    setManagerInput(managerOverrides[s.id] ?? '');
  };

  const commitManager = (s) => {
    setManagerOverrides((prev) => ({ ...prev, [s.id]: managerInput }));
    setEditingManagerId(null);
  };

  const cancelManager = () => setEditingManagerId(null);

  const startEditPlayTime = (s, e) => {
    e.stopPropagation();
    setEditingPlayTimeId(s.id);
    setPlayTimeInput(s.totalPlayTm || '');
  };

  const commitPlayTime = (s) => {
    updateSamplePlayTime(s.id, playTimeInput);
    onSamplesChange?.();
    setEditingPlayTimeId(null);
  };

  const cancelPlayTime = () => setEditingPlayTimeId(null);

  const [assignModal, setAssignModal] = useState(null);
  const [workerOverrides, setWorkerOverrides] = useState({});

  const handleOpenAssign = (e, s) => {
    e.stopPropagation();
    setAssignModal({ id: s.id });
  };

  const handleConfirmAssign = (workerName) => {
    if (!workerName || !assignModal) return;
    setWorkerOverrides((prev) => ({ ...prev, [assignModal.id]: { worker: workerName, status: '배정완료' } }));
    updateStenographyWorkerAssign(assignModal.id, { assignWorker: workerName, assignStatus: '배정완료' });
    setAssignModal(null);
  };

  const handleCancelWorker = (e, s) => {
    e.stopPropagation();
    const effWorker = workerOverrides[s.id]?.worker ?? s.assignWorker;
    setWorkerOverrides((prev) => ({ ...prev, [s.id]: { worker: effWorker, status: '배정취소' } }));
    updateStenographyWorkerAssign(s.id, { assignWorker: effWorker, assignStatus: '배정취소' });
  };

  const toDetailPath = (protoPath) => {
    if (protoPath.startsWith('/soribaro/enterprise/meeting-proto/'))
      return protoPath.replace('/soribaro/enterprise/meeting-proto/', '/soribaro/meeting/detail/');
    return protoPath;
  };

  const searchConditionOptions = ['업체명', '작업자명', '회차', '담당자명'];

  const assignModalJsx = (
    <StenographyWorkerAssignModal
      open={!!assignModal}
      onClose={() => setAssignModal(null)}
      onConfirm={handleConfirmAssign}
    />
  );

  const pagination = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
      <select className="filter-select" style={{ width: '70px', height: '30px' }} defaultValue="20">
        <option value="20">20건</option>
        <option value="50">50건</option>
        <option value="100">100건</option>
      </select>
      <button className="proto-log-btn" style={{ padding: '3px 8px' }}>‹</button>
      {[1,2,3,4,5].map(n => (
        <button key={n} className="proto-log-btn" style={{ padding: '3px 10px', ...(n === 1 ? { background: 'var(--accent-color)', color: '#fff', borderColor: 'var(--accent-color)' } : {}) }}>{n}</button>
      ))}
      <button className="proto-log-btn" style={{ padding: '3px 8px' }}>›</button>
      <button className="proto-log-btn" style={{ padding: '3px 8px' }}>»</button>
      <span style={{ marginLeft: '4px' }}>1/25</span>
    </div>
  );

  const isStenographyType = workType === 'stenography';
  const overdueIdSet = new Set(alerts.overdueItems.map((s) => s.id));

  // 진행 의뢰 현황 탭 공용 테이블 (진행 전체 / 금일 납품 / 납품 일정 확인 공통).
  // - 현장속기는 회차 뒤에 "시작-종료" 컬럼을 추가로 표시한다.
  // - showProgress=true(회의록 납품 일정 확인 탭)일 때만 납품기한 앞에 진행률(바) 컬럼을 표시한다.
  // - markOverdue=true(진행 전체 탭)일 때만 납품 일정 확인 대상 건의 의뢰일자 앞에 📝 메모 아이콘을 표시한다.
  const mergedTable = (items, showProgress, markOverdue = false) => {
    const colCount = 12 + (isStenographyType ? 1 : 0) + (showProgress ? 1 : 0);
    return (
      <div className="proto-table-wrap" style={{ marginBottom: 0 }}>
        <table className="proto-table">
          <thead>
            <tr>
              <th className="text-center">의뢰일자</th>
              <th>업체명</th>
              <th className="text-center">계약구분</th>
              <th className="text-center">회차</th>
              {isStenographyType && <th className="text-center">시작-종료</th>}
              <th className="text-center">의뢰시간</th>
              {showProgress && <th className="text-center">진행률</th>}
              <th className="text-center">납품기한</th>
              <th style={{ minWidth: '100px' }}>검수자</th>
              <th style={{ minWidth: '140px' }}>특이사항</th>
              <th className="text-center">상태</th>
              <th className="text-center">정산</th>
              <th className="text-center">실제 납품일</th>
              <th className="text-center" style={{ minWidth: '90px' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>해당 건이 없습니다.</td></tr>
            ) : (
              items.map((s) => {
                const isEditingNote = editingNoteId === s.id;
                const isEditingManager = editingManagerId === s.id;
                const managerNm = managerOverrides[s.id] ?? '';
                const progress = computeOverallProgress(s);
                return (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(toDetailPath(s.protoPath))}>
                    <td className="text-center">
                      {markOverdue && overdueIdSet.has(s.id) ? `📝 ${formatRegDate(s.regDttm)}` : formatRegDate(s.regDttm)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.entNm}</td>
                    <td className="text-center">{contractBadge(s.contractType)}</td>
                    <td className="text-center">{s.round || '-'}</td>
                    {isStenographyType && <td className="text-center">{s.sessionTime || '-'}</td>}
                    <td className="text-center" style={{ maxWidth: '100px', fontSize: '13px' }}>
                      {s.totalPlayTm || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    {showProgress && (
                      <td>
                        <div className="proto-progress-wrap">
                          <div className="proto-progress-bar">
                            <div className={`proto-progress-fill${progress === 100 ? ' complete' : ''}`} style={{ width: `${progress}%` }} />
                          </div>
                          <span className="proto-progress-text">{progress}%</span>
                        </div>
                      </td>
                    )}
                    <td className="text-center">{s.dueDate}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ maxWidth: '120px' }}>
                      {isEditingManager ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input
                            className="proto-note-inline-input"
                            value={managerInput}
                            onChange={(e) => setManagerInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitManager(s); if (e.key === 'Escape') cancelManager(); }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button className="proto-note-save-btn" onClick={() => commitManager(s)}>✓</button>
                          <button className="proto-note-cancel-btn" onClick={cancelManager}>✕</button>
                        </div>
                      ) : (
                        <div
                          className="proto-note-cell"
                          title={managerNm}
                          onClick={(e) => startEditManager(s, e)}
                        >
                          {managerNm || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>입력</span>}
                        </div>
                      )}
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
                    <td className="text-center">{settleBadge(deriveSettleStatus(s.settlement))}</td>
                    <td className="text-center">{s.actualDeliveryDate || '-'}</td>
                    <td className="text-center" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="mtg-detail-btn" onClick={(e) => { e.stopPropagation(); navigate(toDetailPath(s.protoPath)); }}>상세보기</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const tableBody = (
    <tbody>
      {filtered.length === 0 ? (
        <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>검색 결과가 없습니다.</td></tr>
      ) : (
        filtered.map((s) => {
          const isEditingNote = editingNoteId === s.id;
          const isEditingManager = editingManagerId === s.id;
          const managerNm = managerOverrides[s.id] ?? '';
          const isEditingPlayTime = editingPlayTimeId === s.id;
          const isStenography = s.bssTypeName === '현장속기';
          const effWorker = workerOverrides[s.id]?.worker ?? s.assignWorker;
          const effStatus = workerOverrides[s.id]?.status ?? s.assignStatus;
          const isAssigned = isStenography && effWorker && (effStatus === '배정완료' || effStatus === '업체전달완료');
          const isCancelledWorker = isStenography && effStatus === '배정취소';
          return (
            <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(toDetailPath(s.protoPath))}>
              <td className="text-center">{formatRegDate(s.regDttm)}</td>
              <td style={{ fontWeight: 600 }}>{s.entNm}</td>
              <td className="text-center">{contractBadge(s.contractType)}</td>
              <td className="text-center">{s.round || '-'}</td>
              <td className="text-center" style={{ maxWidth: '100px', fontSize: '13px' }}>
                {s.totalPlayTm || <span style={{ color: 'var(--text-muted)' }}>-</span>}
              </td>
              <td className="text-center">{s.dueDate}</td>
              <td onClick={(e) => e.stopPropagation()} style={{ maxWidth: '120px' }}>
                {isEditingManager ? (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      className="proto-note-inline-input"
                      value={managerInput}
                      onChange={(e) => setManagerInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitManager(s); if (e.key === 'Escape') cancelManager(); }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button className="proto-note-save-btn" onClick={() => commitManager(s)}>✓</button>
                    <button className="proto-note-cancel-btn" onClick={cancelManager}>✕</button>
                  </div>
                ) : (
                  <div
                    className="proto-note-cell"
                    title={managerNm}
                    onClick={(e) => startEditManager(s, e)}
                  >
                    {managerNm || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>입력</span>}
                  </div>
                )}
              </td>
              <td style={{ maxWidth: '120px', fontSize: '13px' }}>
                {isStenography
                  ? (isCancelledWorker
                      ? <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>배정취소</span>
                      : isAssigned
                      ? <span style={{ color: 'var(--text-secondary)' }}>{effWorker}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>-</span>)
                  : (s.assignStatus === '배정취소'
                      ? <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>배정취소</span>
                      : s.assignWorker && s.assignStatus === '업체전달완료'
                      ? <span style={{ color: 'var(--text-secondary)' }}>{s.assignWorker} <span style={{ color: '#4ade80', fontWeight: 700 }}>○</span></span>
                      : s.assignWorker && s.assignStatus === '배정완료'
                      ? <span style={{ color: 'var(--text-secondary)' }}>{s.assignWorker}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>미배정</span>)
                }
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
              <td className="text-center">{settleBadge(deriveSettleStatus(s.settlement))}</td>
              <td className="text-center">{s.actualDeliveryDate || '-'}</td>
              <td className="text-center" style={{ whiteSpace: 'nowrap' }}>
                {isStenography && (
                  isAssigned
                    ? <button className="mtg-detail-btn" style={{ marginRight: '4px', color: '#f87171', borderColor: '#f87171' }} onClick={(e) => handleCancelWorker(e, s)}>배정취소</button>
                    : <button className="mtg-detail-btn" style={{ marginRight: '4px' }} onClick={(e) => handleOpenAssign(e, s)}>배정하기</button>
                )}
                <button
                  className="mtg-detail-btn"
                  onClick={(e) => { e.stopPropagation(); navigate(toDetailPath(s.protoPath)); }}
                >
                  상세보기
                </button>
              </td>
            </tr>
          );
        })
      )}
    </tbody>
  );

  const tableHead = (
    <thead>
      <tr>
        <th className="text-center">의뢰일자</th>
        <th>업체명</th>
        <th className="text-center">계약구분</th>
        <th className="text-center">회차</th>
        <th className="text-center">의뢰시간</th>
        <th className="text-center">납품기한</th>
        <th style={{ minWidth: '100px' }}>검수자</th>
        <th style={{ minWidth: '100px' }}>작업자</th>
        <th style={{ minWidth: '140px' }}>특이사항</th>
        <th className="text-center">상태</th>
        <th className="text-center">정산</th>
        <th className="text-center">실제 납품일</th>
        <th className="text-center" style={{ minWidth: '148px' }}></th>
      </tr>
    </thead>
  );

  if (showAll) {
    return (
      <div className="proto-dashboard">
        <div className="proto-dash-header">
          <span className="proto-label-chip">5차 고도화</span>
          <span className="proto-dash-title">프로토타입 샘플 현황</span>
          <span className="proto-notice-chip">실제 데이터 미연동</span>
        </div>

        <div className="proto-dash-projects">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <p className="proto-dash-section-title" style={{ marginBottom: 0 }}>전체 현황</p>
            <button className="btn-ghost" style={{ fontSize: '13px' }} onClick={handleExportExcel}>엑셀 다운로드</button>
          </div>
          <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              <input className="filter-date" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="의뢰일 시작" />
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>~</span>
              <input className="filter-date" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} title="의뢰일 종료" />
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
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select className="filter-select" value={searchCondition} onChange={(e) => setSearchCondition(e.target.value)}>
                {searchConditionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              <input className="filter-input" style={{ flex: 1 }} type="text" value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }} placeholder="검색어" />
              <button className="btn-primary" style={{ height: '32px', fontSize: '13px', padding: '0 24px' }} onClick={handleSearch}>검색</button>
            </div>
          </div>
          <div className="proto-table-wrap" style={{ marginBottom: '12px' }}>
            <table className="proto-table">
              {tableHead}
              {tableBody}
            </table>
          </div>
          {pagination}
        </div>
        {assignModalJsx}
      </div>
    );
  }

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
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {REQUEST_TABS.map((t) => {
            const count = t.key === 'all' ? filtered.length : t.key === 'today' ? alerts.todayDue : alerts.overdue;
            return (
              <button
                key={t.key}
                className="proto-log-btn"
                style={activeTab === t.key ? { background: 'var(--accent-color)', color: '#fff', borderColor: 'var(--accent-color)' } : undefined}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        {activeTab === 'all' && (
          <div className="filter-bar" style={{ marginBottom: '12px' }}>
            <input className="filter-date" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="의뢰일 시작" />
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>~</span>
            <input className="filter-date" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} title="의뢰일 종료" />
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
            <select className="filter-select" value={searchCondition} onChange={(e) => setSearchCondition(e.target.value)}>
              {searchConditionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <input className="filter-input" type="text" value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }} placeholder="검색어" />
            <button className="btn-primary" style={{ height: '32px', fontSize: '13px', padding: '0 14px' }} onClick={handleSearch}>검색</button>
          </div>
        )}
        {activeTab === 'all' && mergedTable(filtered, false, true)}
        {activeTab === 'today' && mergedTable(alerts.todayDueItems, false)}
        {activeTab === 'overdue' && mergedTable(alerts.overdueItems, workType === 'meeting')}
        {activeTab === 'all' && pagination}
      </div>
      {assignModalJsx}
    </div>
  );
}
