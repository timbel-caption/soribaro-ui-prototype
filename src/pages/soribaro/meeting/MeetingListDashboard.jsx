import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateSampleSpecialNote, updateSampleSubfileStatus, updateSamplePlayTime, updateStenographyWorkerAssign, getMeetingSamples, getStenographySamples, getRecordingSamples } from '../enterprise/proto/protoStore';
import StenographyWorkerAssignModal from '../enterprise/proto/StenographyWorkerAssignModal';
import { downloadMeetingWorkExcel, downloadRecordingWorkExcel, downloadStenographyWorkExcel } from '../../../utils/workManagementExcel';
import { getRequestTypes } from '../manage/manageProtoStore';

const STATUS_LABEL = {
  WAITING:        { label: '작업대기', cls: 'mtg-status-waiting' },
  WORKING:        { label: '작업중',   cls: 'mtg-status-working' },
  WORK_DONE:      { label: '작업완료', cls: 'mtg-status-workdone' },
  CHECKING:       { label: '검수중',   cls: 'mtg-status-checking' },
  CHECK_REJECTED: { label: '검수반려', cls: 'mtg-status-checkreject' },
  CHECK_DONE:     { label: '검수완료', cls: 'mtg-status-checkdone' },
  DRAFT_DONE:     { label: '초안완성', cls: 'mtg-status-draft' },
  DONE:           { label: '완료',     cls: 'mtg-status-done' },
};

function statusBadge(s) {
  const m = STATUS_LABEL[s] ?? { label: s, cls: 'mtg-status-done' };
  return <span className={`mtg-status-badge ${m.cls}`}>{m.label}</span>;
}

// 현장속기 "상태" 필터/배지 — 배정 관리(assignStatus) 기준으로 판단한다.
// 미배정·배정취소 → 배정전, 배정완료·업체전달완료(알림 발송 전) → 배정완료, 업체전달완료(알림 발송 완료) → 완료
function deriveStgAssignFilterStatus(assignStatus) {
  if (assignStatus === '업체전달완료') return '완료';
  if (assignStatus === '배정완료') return '배정완료';
  return '배정전'; // 미배정, 배정취소
}

const STG_ASSIGN_BADGE_CLASS = {
  '배정전':  'mtg-assign-pending',
  '배정완료': 'mtg-assign-done',
  '완료':    'mtg-assign-complete',
};

function assignFilterStatusBadge(status) {
  return <span className={`mtg-assign-badge ${STG_ASSIGN_BADGE_CLASS[status] || 'mtg-assign-pending'}`}>{status}</span>;
}

// 정산 상태 — 정산확인 탭(MtgSettlementTab)에서 집행자가 "확인"을 누르면 확인중, 반려되면 반려로 집계되어 저장된다(confirmStatus).
// 아직 정산확인 탭을 방문하지 않은 건은 기존 workerSettled/companySettled 값으로 대략 판단한다.
function deriveSettleStatus(settlement) {
  if (settlement?.confirmStatus) return settlement.confirmStatus;
  const ws = settlement?.workerSettled || false;
  const cs = settlement?.companySettled || false;
  if (ws && cs) return '완료';
  if (ws || cs) return '확인중';
  return '정산대기';
}

function settleBadge(s) {
  if (s === '완료')   return <span className="mtg-settle-badge mtg-settle-done">{s}</span>;
  if (s === '확인중') return <span className="mtg-settle-badge mtg-settle-partial">{s}</span>;
  if (s === '반려')   return <span className="mtg-settle-badge mtg-settle-reject">{s}</span>;
  return <span className="mtg-settle-badge mtg-settle-wait">{s}</span>; // 정산대기
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
  '현장녹음': { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80',  border: 'rgba(74,222,128,0.4)' },
  '통화녹음': { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8',  border: 'rgba(56,189,248,0.4)' },
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

// 녹취록 작업관리의 계약구분은 서비스 관리 > 엔터프라이즈 관리 > 의뢰유형 관리(녹취록)의 계약구분과 동일하게 맞춘다.
const RECORDING_CONTRACT_TYPE_OPTIONS = getRequestTypes().find((rt) => rt.name === '녹취록')?.contractTypes ?? [];

function formatAmount(value) {
  if (value == null || value === '') return '-';
  return `${Number(value).toLocaleString()}원`;
}

function formatRegDate(regDttm) {
  if (!regDttm) return '-';
  return regDttm.replace(/-/g, '').slice(2, 8);
}

// 녹취록 의뢰일자 옆에 표기할 의뢰 요청 시간(HH:MM)
function formatRegTime(regDttm) {
  const time = (regDttm || '').split(' ')[1];
  return time ? time.slice(0, 5) : '';
}

// 현장속기 업체명 hover 툴팁 — 회의장 주소/회의 장소 표시, 미입력 시 "미입력"으로 표기
function buildVenueTooltip(s) {
  return `회의장 주소 : ${s.venueAddress || '미입력'}\n회의 장소 : ${s.venueName || '미입력'}`;
}

// 진행의뢰현황 알림 발송 — 날짜 계산용 헬퍼
function toDateOnly(dateStr) {
  if (!dateStr) return null;
  const d = new Date((dateStr || '').slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDateOnly(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 알림 발송 시각 표기(예: 2026-07-09 17:00) — 업체명/작업자 알림 완료 툴팁에 발송 일시로 표시
function fmtDateTime(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// 현재 주를 제외한 다음 주(월~일) 범위
function getNextWeekRange(today) {
  const day = today.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  return { start: nextMonday, end: nextSunday };
}

const NOTIFY_TYPES = [
  { key: 'assign', label: '수동 배정 알림', desc: '업체·작업자 대상' },
  { key: 'nextWeek', label: '차주 배정 알림', desc: '차주 회의 일정 안내 (업체·작업자 대상)' },
  { key: 'nextDay', label: '작업자 익일 회의 알림', desc: '익일 회의 안내 (작업자 대상)' },
];

// 2026년 대한민국 공휴일(프로토타입 예시 더미 데이터) — 작업자 익일 회의 알림의 회의 전날 자동 예약 발송 판정에 사용
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-01', '2026-05-05', '2026-05-24', '2026-06-06',
  '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26',
  '2026-10-03', '2026-10-09', '2026-12-25',
]);

function isWeekendOrHoliday(d) {
  const day = d.getDay();
  if (day === 0 || day === 6) return true;
  return HOLIDAYS_2026.has(fmtDateOnly(d));
}

// 기준일의 다음 영업일(주말·공휴일 제외, 연속되는 경우 모두 건너뜀)
function getNextBusinessDay(from) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (isWeekendOrHoliday(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// 진행의뢰현황 > 상세보기 > 프로젝트 관리(workProgress)의 파일별 진행률을 전체 대비 100 기준으로 환산
function computeOverallProgress(s) {
  if (!s.workProgress || s.workProgress.length === 0) return 0;
  const sum = s.workProgress.reduce((acc, w) => acc + w.progress, 0);
  return Math.round(sum / s.workProgress.length);
}

// 상세보기 > 프로젝트 관리에 등록된 프로젝트들의 작업자를 조회 (중복 제거, 쉼표로 나열)
function getProjectWorkers(s) {
  const store = s.bssTypeName === '현장속기' ? getStenographySamples() : s.bssTypeName === '녹취록' ? getRecordingSamples() : getMeetingSamples();
  const subjects = store.find((v) => v.id === s.id)?.subjects || [];
  const workers = [...new Set(subjects.map((p) => p.worker).filter(Boolean))];
  return workers.join(', ');
}

function computeStats(samples) {
  const inProgress = samples.filter((s) => s.overallStatus !== 'DONE').length;
  const working    = samples.filter((s) => s.overallStatus === 'WORKING').length;
  const checking   = samples.filter((s) => s.overallStatus === 'CHECKING').length;
  const checkDone  = samples.filter((s) => s.overallStatus === 'DONE').length;
  const settleWait = samples.filter((s) => deriveSettleStatus(s.settlement) !== '완료').length;
  return { inProgress, working, checking, checkDone, settleWait };
}

function matchesFilters(s, { filterFrom, filterTo, filterStatus, filterSettlement, filterContractType, searchCondition, searchText, showAll, workType }) {
  if (!showAll && s.overallStatus === 'DONE') return false;
  const date = (s.regDttm || '').slice(0, 10);
  if (filterFrom && date < filterFrom) return false;
  if (filterTo && date > filterTo) return false;
  if (filterStatus) {
    if (workType === 'stenography') {
      if (deriveStgAssignFilterStatus(s.assignStatus) !== filterStatus) return false;
    } else if (s.overallStatus !== filterStatus) return false;
  }
  if (filterSettlement && deriveSettleStatus(s.settlement) !== filterSettlement) return false;
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
    // 진행의뢰현황 "검수자"는 관리자가 직접 입력하는 화면 전용 값이라 store에 저장되지 않으므로, 엑셀 다운로드 시 함께 넘겨준다.
    const rows = filtered.map((s) => ({ ...s, _reviewerNm: managerOverrides[s.id] ?? '' }));
    if (workType === 'stenography') downloadStenographyWorkExcel(rows);
    else if (workType === 'recording') downloadRecordingWorkExcel(rows);
    else downloadMeetingWorkExcel(rows);
  };

  const filtered = samples.filter((s) =>
    matchesFilters(s, { filterFrom, filterTo, filterStatus, filterSettlement, filterContractType, searchCondition, searchText, showAll, workType })
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
  const [selectedIds, setSelectedIds] = useState(new Set());

  const handleOpenAssign = (e, s) => {
    e.stopPropagation();
    setAssignModal({ ids: [s.id] });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 진행의뢰현황 일괄배정 — 체크박스로 선택한 여러 건을 기존 배정하기 팝업 하나로 한 번에 배정한다
  const handleOpenBulkAssign = () => {
    if (selectedIds.size === 0) {
      window.alert('배정할 의뢰를 선택해 주세요.');
      return;
    }
    setAssignModal({ ids: [...selectedIds] });
  };

  const handleConfirmAssign = (workerName) => {
    if (!workerName || !assignModal) return;
    setWorkerOverrides((prev) => {
      const next = { ...prev };
      assignModal.ids.forEach((id) => { next[id] = { worker: workerName, status: '배정완료' }; });
      return next;
    });
    assignModal.ids.forEach((id) => updateStenographyWorkerAssign(id, { assignWorker: workerName, assignStatus: '배정완료' }));
    setAssignModal(null);
    setSelectedIds(new Set());
  };

  const handleCancelWorker = (e, s) => {
    e.stopPropagation();
    const effWorker = workerOverrides[s.id]?.worker ?? s.assignWorker;
    setWorkerOverrides((prev) => ({ ...prev, [s.id]: { worker: effWorker, status: '배정취소' } }));
    updateStenographyWorkerAssign(s.id, { assignWorker: effWorker, assignStatus: '배정취소' });
  };

  // 진행의뢰현황 알림 발송 — 1) 알림 유형 선택 → 2) 발송 대상 확인 2단계 팝업
  const [notifyStep, setNotifyStep] = useState(null); // null | 'select' | 'confirm'
  const [notifyType, setNotifyType] = useState(null); // 'assign' | 'nextWeek' | 'nextDay'
  // 작업자 익일 회의 알림 발송/예약 이력은 "의뢰ID::작업자명" 단위로 관리한다.
  // 재배정으로 작업자가 바뀌면 새 작업자에게는 재발송이 가능하고, 이미 알림을 받은 작업자에게는 중복 발송되지 않는다.
  const [nextDayNotifiedKeys, setNextDayNotifiedKeys] = useState(new Set());
  const [nextDayScheduledKeys, setNextDayScheduledKeys] = useState(new Set());
  // 차주 배정 알림: 발송된 건을 기록해 업체명/작업자 알림 상태 아이콘에 반영한다
  const [nextWeekNotifiedIds, setNextWeekNotifiedIds] = useState(new Set());
  // 알림별 발송 일시(키 -> 'YYYY-MM-DD HH:MM') — 발송 완료 후 아이콘 툴팁에 발송 일시로 표시한다
  const [nextWeekNotifiedAt, setNextWeekNotifiedAt] = useState({});
  const [nextDayNotifiedAt, setNextDayNotifiedAt] = useState({}); // 키: "의뢰ID::작업자명"
  const [assignNotifiedAt, setAssignNotifiedAt] = useState({});

  const closeNotifyFlow = () => { setNotifyStep(null); setNotifyType(null); };

  const handleOpenNotify = () => setNotifyStep('select');

  // 알림 발송 대상 판단 기준: 의뢰 상태값이 아니라 작업자 배정 데이터(배정된 작업자) 존재 여부로 판단한다.
  // 배정취소된 건만 제외하며, 이미 수동 배정 알림을 보낸(업체전달완료) 건도 작업자가 배정돼 있으므로 계속 대상에 포함된다.
  const isWorkerAssigned = (sm) => {
    const worker = workerOverrides[sm.id]?.worker ?? sm.assignWorker;
    const status = workerOverrides[sm.id]?.status ?? sm.assignStatus;
    return !!worker && status !== '배정취소';
  };

  const notifyKey = (id, worker) => `${id}::${worker}`;

  // 차주 배정 알림 / 작업자 익일 회의 알림 / 수동 배정 알림 공통: 발송 가능한 대상이
  // 하나도 없으면 발송 대상 확인 팝업으로 넘어가지 않고 안내 팝업만 노출한다.
  const handleSelectNotifyType = (type) => {
    if (type === 'assign') {
      if (selectedIds.size === 0) {
        window.alert('알림을 보낼 의뢰를 선택해 주세요.');
        return;
      }
      const hasEligible = [...selectedIds].some((id) => {
        const sample = samples.find((sm) => sm.id === id);
        if (!sample || sample.bssTypeName !== '현장속기') return false;
        return isWorkerAssigned(sample);
      });
      if (!hasEligible) {
        window.alert('발송 가능한 대상이 없습니다. 작업자가 배정된 의뢰만 알림을 발송할 수 있습니다.');
        return;
      }
    } else if (type === 'nextWeek' && nextWeekTargets.length === 0) {
      window.alert('발송 가능한 대상이 없습니다. 작업자가 배정된 의뢰만 알림을 발송할 수 있습니다.');
      return;
    } else if (type === 'nextDay' && nextDayTargets.immediate.length === 0 && nextDayTargets.scheduled.length === 0) {
      window.alert('발송 가능한 대상이 없습니다. 모든 작업자가 이미 익일 배정 알림을 받았거나 배정된 작업자가 없습니다.');
      return;
    }
    setNotifyType(type);
    setNotifyStep('confirm');
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeekRange = getNextWeekRange(today);
  // 차주 배정 알림 발송 대상 기간에 속한 현장속기 건 전체(배정 여부 무관)
  const nextWeekPopulation = samples.filter((sm) => {
    if (sm.bssTypeName !== '현장속기') return false;
    const d = toDateOnly(sm.regDttm);
    return d && d >= nextWeekRange.start && d <= nextWeekRange.end;
  });
  // 차주 배정 알림 대상: 작업자가 배정된(배정취소 제외) 건 중 아직 발송하지 않은 건만 재발송 시 중복 없이 발송
  const nextWeekTargets = nextWeekPopulation.filter((sm) => isWorkerAssigned(sm) && !nextWeekNotifiedIds.has(sm.id));
  // 배정이 완료되지 않아 차주 배정 알림 대상에서 제외되는 건
  const nextWeekUnassigned = nextWeekPopulation.filter((sm) => !isWorkerAssigned(sm));
  // 작업자 익일 회의 알림: 발송 버튼을 누른 날짜 기준 "다음 영업일"(주말·공휴일 제외, 연속되면 모두 건너뜀)에
  // 열리는 현장속기 회의만 조회 대상으로 삼는다. 예) 금요일 발송 → 월요일 회의 대상 / 공휴일 전날 발송 → 공휴일 이후 첫 영업일 회의 대상
  // 조회 순서: 전체 회의 조회 → 다음 영업일 회의만 필터링(nextDayPopulation) → 작업자 배정 여부로 발송 대상/알림 제외 분기
  const nextBusinessDay = getNextBusinessDay(today);
  const nextDayPopulation = samples.filter((sm) => {
    if (sm.bssTypeName !== '현장속기') return false;
    const meetingDate = toDateOnly(sm.regDttm);
    return meetingDate && meetingDate.getTime() === nextBusinessDay.getTime();
  });
  // 다음 영업일 회의 중 작업자가 배정된 건 → 발송 대상
  const nextDayCandidates = nextDayPopulation.filter((sm) => isWorkerAssigned(sm));
  // 다음 영업일 회의 중 작업자가 배정되지 않은 건 → 알림 제외
  const nextDayUnassigned = nextDayPopulation.filter((sm) => !isWorkerAssigned(sm));
  const nextDayTargets = {
    immediate: nextDayCandidates.filter((sm) => {
      const effWorker = workerOverrides[sm.id]?.worker ?? sm.assignWorker;
      return !nextDayNotifiedKeys.has(notifyKey(sm.id, effWorker));
    }),
    // 회의 전날이 주말·공휴일이라 그날 직접 발송할 수 없는 경우를 위한 예약 발송 대상.
    // 조회 대상을 다음 영업일 회의로 한정했으므로(예약이 필요한, 그보다 먼 회의는 조회되지 않음) 항상 비어 있다.
    scheduled: [],
  };

  // 작업자 익일 회의 알림 상태(현재 배정된 작업자 기준) + 발송 완료 일시 또는 (예약인 경우) 회의 전날 발송 예정일시
  const getNextDayNotifyStatus = (s) => {
    const effWorker = workerOverrides[s.id]?.worker ?? s.assignWorker;
    const key = notifyKey(s.id, effWorker);
    if (nextDayNotifiedKeys.has(key)) return { label: '발송', at: nextDayNotifiedAt[key] };
    if (nextDayScheduledKeys.has(key)) {
      const meetingDate = toDateOnly(s.regDttm);
      if (meetingDate) {
        const sendAt = new Date(meetingDate);
        sendAt.setDate(sendAt.getDate() - 1);
        return { label: '예약', sendAt: fmtDateOnly(sendAt) };
      }
      return { label: '예약' };
    }
    return { label: '미발송' };
  };

  // 알림 아이콘은 미발송 상태에서만 노출되고(none), 발송 완료 후에는 아이콘 자체를 표시하지 않는다.
  const NOTIFY_ICON_BY_LEVEL = {
    none: { icon: '🔔', color: 'var(--text-muted)' },
  };

  // 업체명 옆 알림 아이콘 — 수동 배정 알림·차주 배정 알림 중 하나도 발송되지 않았으면 미발송 아이콘을 노출하고,
  // 하나라도 발송 완료되면 아이콘을 표시하지 않는다.
  const companyNotifyIcon = (s, isNotified) => {
    const nextWeekSent = nextWeekNotifiedIds.has(s.id);
    const assignSent = isNotified;
    const anySent = nextWeekSent || assignSent;

    if (anySent) return null;

    const tooltip = `${buildVenueTooltip(s)}\n\n발송된 알림 없음`;
    return <span style={{ color: NOTIFY_ICON_BY_LEVEL.none.color, marginLeft: '4px' }} title={tooltip}>{NOTIFY_ICON_BY_LEVEL.none.icon}</span>;
  };

  // 작업자 옆 알림 아이콘 — 익일 배정 알림만 표시한다. 미발송·예약 상태는 벨 아이콘을 노출하고,
  // 발송 완료 후에는 아이콘을 표시하지 않는다.
  const workerNotifyIcon = (s) => {
    const status = getNextDayNotifyStatus(s);
    if (status.label === '발송') return null;
    const tooltip = status.label === '예약' && status.sendAt
      ? `익일 배정 알림 : 예약 (발송 예정일시: ${status.sendAt})`
      : '익일 배정 알림 : 미발송';
    return <span style={{ color: NOTIFY_ICON_BY_LEVEL.none.color, marginLeft: '4px' }} title={tooltip}>{NOTIFY_ICON_BY_LEVEL.none.icon}</span>;
  };

  const confirmNotifySend = () => {
    const now = fmtDateTime(new Date());
    if (notifyType === 'assign') {
      // 발송 대상을 먼저 확정한 뒤 상태를 갱신한다 — setState 업데이터 함수 안에서 건수를 세면
      // 함수가 비동기로 실행돼 곧바로 이어지는 alert 문구가 실제 처리 결과와 어긋날 수 있다.
      const eligibleIds = [...selectedIds].filter((id) => {
        const sample = samples.find((sm) => sm.id === id);
        return sample && sample.bssTypeName === '현장속기' && isWorkerAssigned(sample);
      });
      if (eligibleIds.length > 0) {
        setWorkerOverrides((prev) => {
          const next = { ...prev };
          eligibleIds.forEach((id) => {
            const sample = samples.find((sm) => sm.id === id);
            const w = prev[id]?.worker ?? sample.assignWorker;
            next[id] = { worker: w, status: '업체전달완료' };
            updateStenographyWorkerAssign(id, { assignWorker: w, assignStatus: '업체전달완료' });
          });
          return next;
        });
        setAssignNotifiedAt((prev) => ({ ...prev, ...Object.fromEntries(eligibleIds.map((id) => [id, now])) }));
      }
      window.alert(eligibleIds.length > 0 ? `${eligibleIds.length}건에 수동 배정 알림을 발송했습니다.` : '발송 가능한 대상이 없어 발송하지 않았습니다.');
    } else if (notifyType === 'nextWeek') {
      setNextWeekNotifiedIds((prev) => new Set([...prev, ...nextWeekTargets.map((sm) => sm.id)]));
      setNextWeekNotifiedAt((prev) => ({ ...prev, ...Object.fromEntries(nextWeekTargets.map((sm) => [sm.id, now])) }));
      window.alert(`${fmtDateOnly(nextWeekRange.start)} ~ ${fmtDateOnly(nextWeekRange.end)} 일정의 업체·작업자 ${nextWeekTargets.length}건에 차주 배정 알림을 발송했습니다.`);
    } else if (notifyType === 'nextDay') {
      const immediateKeys = nextDayTargets.immediate.map((sm) => notifyKey(sm.id, workerOverrides[sm.id]?.worker ?? sm.assignWorker));
      const scheduledKeys = nextDayTargets.scheduled.map((sm) => notifyKey(sm.id, workerOverrides[sm.id]?.worker ?? sm.assignWorker));
      setNextDayNotifiedKeys((prev) => new Set([...prev, ...immediateKeys]));
      setNextDayNotifiedAt((prev) => ({ ...prev, ...Object.fromEntries(immediateKeys.map((k) => [k, now])) }));
      setNextDayScheduledKeys((prev) => new Set([...prev, ...scheduledKeys]));
      window.alert(`익일 회의 즉시 발송 ${nextDayTargets.immediate.length}건, 회의 전날(주말·공휴일) 자동 발송 예약 ${nextDayTargets.scheduled.length}건을 등록했습니다.`);
    }
    closeNotifyFlow();
  };

  const toDetailPath = (protoPath) => {
    if (protoPath.startsWith('/soribaro/enterprise/meeting-proto/'))
      return protoPath.replace('/soribaro/enterprise/meeting-proto/', '/soribaro/meeting/detail/');
    return protoPath;
  };

  const searchConditionOptions = ['업체명', '작업자명', '회차', '담당자명'];

  // 단건 배정일 때만 해당 건의 시작-종료 시간을 팝업에 미리 채워준다 (일괄배정은 건마다 시간이 다를 수 있어 비워둔다)
  const currentAssignSample = assignModal?.ids?.length === 1 ? samples.find((sm) => sm.id === assignModal.ids[0]) : null;

  // 일정 충돌 판정용: 같은 화면의 다른 현장속기 배정 건들(작업자 + 시작-종료 시간). 이번에 배정 대상인 건들은 제외한다.
  const assignedSchedules = samples
    .filter((sm) => sm.bssTypeName === '현장속기' && !assignModal?.ids?.includes(sm.id))
    .map((sm) => {
      const worker = workerOverrides[sm.id]?.worker ?? sm.assignWorker;
      const status = workerOverrides[sm.id]?.status ?? sm.assignStatus;
      const isAssigned = worker && (status === '배정완료' || status === '업체전달완료');
      return isAssigned ? { worker, sessionTime: sm.sessionTime } : null;
    })
    .filter(Boolean);

  const assignModalJsx = (
    <StenographyWorkerAssignModal
      open={!!assignModal}
      onClose={() => setAssignModal(null)}
      onConfirm={handleConfirmAssign}
      currentSessionTime={currentAssignSample?.sessionTime}
      assignedSchedules={assignedSchedules}
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
  const isRecordingType = workType === 'recording';
  const contractTypeOptions = isRecordingType ? RECORDING_CONTRACT_TYPE_OPTIONS : CONTRACT_TYPE_OPTIONS;
  const overdueIdSet = new Set(alerts.overdueItems.map((s) => s.id));

  // "상태" 검색 필터 옵션 — 서비스(의뢰유형)별로 표시할 상태 목록이 다르다.
  const renderStatusOptions = () => {
    if (isStenographyType) {
      return (
        <>
          <option value="배정전">배정전</option>
          <option value="배정완료">배정완료</option>
          <option value="완료">완료</option>
        </>
      );
    }
    if (isRecordingType) {
      return (
        <>
          <option value="WAITING">작업대기</option>
          <option value="WORKING">작업중</option>
          <option value="WORK_DONE">작업완료</option>
          <option value="DRAFT_DONE">초안완성</option>
          <option value="DONE">완료</option>
        </>
      );
    }
    // 회의록
    return (
      <>
        <option value="WAITING">작업대기</option>
        <option value="WORKING">작업중</option>
        <option value="WORK_DONE">작업완료</option>
        <option value="CHECKING">검수중</option>
        <option value="CHECK_REJECTED">검수반려</option>
        <option value="CHECK_DONE">검수완료</option>
        <option value="DONE">완료</option>
      </>
    );
  };

  // 진행 의뢰 현황 탭 공용 테이블 (진행 전체 / 금일 납품 / 납품 일정 확인 공통).
  // - 현장속기는 회차 뒤에 "시작-종료" 컬럼을 추가로 표시한다.
  // - showProgress=true(회의록 납품 일정 확인 탭)일 때만 납품기한 앞에 진행률(바) 컬럼을 표시한다.
  // - markOverdue=true(진행 전체 탭)일 때만 납품 일정 확인 대상 건의 의뢰일자 앞에 📝 메모 아이콘을 표시한다.
  const mergedTable = (items, showProgress, markOverdue = false) => {
    const colCount = (isRecordingType ? 12 : 13) + (isStenographyType ? 2 : 0) + (showProgress ? 1 : 0);
    const isAllSelected = items.length > 0 && items.every((it) => selectedIds.has(it.id));
    const toggleSelectAll = (checked) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((it) => (checked ? next.add(it.id) : next.delete(it.id)));
        return next;
      });
    };
    return (
      <div className="proto-table-wrap" style={{ marginBottom: 0 }}>
        <table className="proto-table">
          <thead>
            <tr>
              {isStenographyType && (
                <th className="text-center" style={{ width: '32px' }}>
                  <input type="checkbox" checked={isAllSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </th>
              )}
              <th className="text-center">의뢰일자</th>
              <th>{isRecordingType ? '의뢰자' : '업체명'}</th>
              <th className="text-center">계약구분</th>
              {!isRecordingType && <th className="text-center">회차</th>}
              {isStenographyType && <th className="text-center">시작-종료</th>}
              <th className="text-center">의뢰시간</th>
              {isRecordingType && <th className="text-center">확정금액</th>}
              {showProgress && <th className="text-center">진행률</th>}
              {!isRecordingType && <th className="text-center">납품기한</th>}
              <th style={{ minWidth: '100px' }}>작업자</th>
              <th style={{ minWidth: '100px' }}>검수자</th>
              <th style={{ minWidth: '140px' }}>특이사항</th>
              <th className="text-center">상태</th>
              <th className="text-center">정산</th>
              <th className="text-center">{isRecordingType ? '초안 업로드일' : '실제 납품일'}</th>
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
                const isStenography = s.bssTypeName === '현장속기';
                const effWorker = workerOverrides[s.id]?.worker ?? s.assignWorker;
                const effStatus = workerOverrides[s.id]?.status ?? s.assignStatus;
                const isAssigned = isStenography && effWorker && (effStatus === '배정완료' || effStatus === '업체전달완료');
                const isCancelledWorker = isStenography && effStatus === '배정취소';
                const isNotified = isStenography && effStatus === '업체전달완료';
                return (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(toDetailPath(s.protoPath))}>
                    {isStenographyType && (
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} />
                      </td>
                    )}
                    <td className="text-center" title={isStenographyType ? `신청일 : ${(s.regDttm || '').slice(0, 10)}` : undefined}>
                      {markOverdue && overdueIdSet.has(s.id) ? `📝 ${formatRegDate(s.regDttm)}` : formatRegDate(s.regDttm)}
                      {isRecordingType && formatRegTime(s.regDttm) && (
                        <span style={{ marginLeft: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>{formatRegTime(s.regDttm)}</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {isRecordingType ? s.membNm : s.entNm}
                      {isStenography && companyNotifyIcon(s, isNotified)}
                    </td>
                    <td className="text-center">{contractBadge(s.contractType)}</td>
                    {!isRecordingType && <td className="text-center">{s.round || '-'}</td>}
                    {isStenographyType && <td className="text-center">{s.sessionTime || '-'}</td>}
                    <td className="text-center" style={{ maxWidth: '100px', fontSize: '13px' }}>
                      {s.totalPlayTm || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    {isRecordingType && <td className="text-center">{formatAmount(s.fixPrice)}</td>}
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
                    {!isRecordingType && <td className="text-center">{s.dueDate}</td>}
                    <td style={{ maxWidth: '160px', fontSize: '13px' }}>
                      {isStenographyType ? (
                        isCancelledWorker
                          ? <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>배정취소</span>
                          : isAssigned
                          ? (
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {effWorker}
                              {workerNotifyIcon(s)}
                            </span>
                          )
                          : <span style={{ color: 'var(--text-muted)' }}>-</span>
                      ) : (
                        getProjectWorkers(s) || <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
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
                    <td className="text-center">{isStenographyType ? assignFilterStatusBadge(deriveStgAssignFilterStatus(s.assignStatus)) : statusBadge(s.overallStatus)}</td>
                    <td className="text-center">{settleBadge(deriveSettleStatus(s.settlement))}</td>
                    <td className="text-center">{(isRecordingType ? s.draftUploadDate : s.actualDeliveryDate) || '-'}</td>
                    <td className="text-center" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {isStenographyType && (
                        isAssigned
                          ? <button className="mtg-detail-btn" style={{ marginRight: '4px', color: '#f87171', borderColor: '#f87171' }} onClick={(e) => handleCancelWorker(e, s)}>배정취소</button>
                          : <button className="mtg-detail-btn" style={{ marginRight: '4px' }} onClick={(e) => handleOpenAssign(e, s)}>배정하기</button>
                      )}
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

  const flatColCount = isRecordingType ? 12 : 13;

  const tableBody = (
    <tbody>
      {filtered.length === 0 ? (
        <tr><td colSpan={flatColCount} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>검색 결과가 없습니다.</td></tr>
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
          const isNotified = isStenography && effStatus === '업체전달완료';
          return (
            <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(toDetailPath(s.protoPath))}>
              <td className="text-center" title={isStenographyType ? `신청일 : ${(s.regDttm || '').slice(0, 10)}` : undefined}>
                {formatRegDate(s.regDttm)}
                {isRecordingType && formatRegTime(s.regDttm) && (
                  <span style={{ marginLeft: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>{formatRegTime(s.regDttm)}</span>
                )}
              </td>
              <td style={{ fontWeight: 600 }}>
                {isRecordingType ? s.membNm : s.entNm}
                {isStenography && companyNotifyIcon(s, isNotified)}
              </td>
              <td className="text-center">{contractBadge(s.contractType)}</td>
              {!isRecordingType && <td className="text-center">{s.round || '-'}</td>}
              <td className="text-center" style={{ maxWidth: '100px', fontSize: '13px' }}>
                {s.totalPlayTm || <span style={{ color: 'var(--text-muted)' }}>-</span>}
              </td>
              {isRecordingType && <td className="text-center">{formatAmount(s.fixPrice)}</td>}
              {!isRecordingType && <td className="text-center">{s.dueDate}</td>}
              <td style={{ maxWidth: '160px', fontSize: '13px' }}>
                {isStenography
                  ? (isCancelledWorker
                      ? <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>배정취소</span>
                      : isAssigned
                      ? (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {effWorker}
                          {workerNotifyIcon(s)}
                        </span>
                      )
                      : <span style={{ color: 'var(--text-muted)' }}>-</span>)
                  : (getProjectWorkers(s) || <span style={{ color: 'var(--text-muted)' }}>-</span>)
                }
              </td>
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
              <td className="text-center">{isStenographyType ? assignFilterStatusBadge(deriveStgAssignFilterStatus(s.assignStatus)) : statusBadge(s.overallStatus)}</td>
              <td className="text-center">{settleBadge(deriveSettleStatus(s.settlement))}</td>
              <td className="text-center">{(isRecordingType ? s.draftUploadDate : s.actualDeliveryDate) || '-'}</td>
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
        <th>{isRecordingType ? '의뢰자' : '업체명'}</th>
        <th className="text-center">계약구분</th>
        {!isRecordingType && <th className="text-center">회차</th>}
        <th className="text-center">의뢰시간</th>
        {isRecordingType && <th className="text-center">확정금액</th>}
        {!isRecordingType && <th className="text-center">납품기한</th>}
        <th style={{ minWidth: '100px' }}>작업자</th>
        <th style={{ minWidth: '100px' }}>검수자</th>
        <th style={{ minWidth: '140px' }}>특이사항</th>
        <th className="text-center">상태</th>
        <th className="text-center">정산</th>
        <th className="text-center">{isRecordingType ? '초안 업로드일' : '실제 납품일'}</th>
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
                <option value="">전체</option>
                {renderStatusOptions()}
              </select>
              <select className="filter-select" value={filterSettlement} onChange={(e) => setFilterSettlement(e.target.value)}>
                <option value="">전체</option>
                <option value="정산대기">정산대기</option>
                <option value="확인중">확인중</option>
                <option value="반려">반려</option>
                <option value="완료">완료</option>
              </select>
              <select className="filter-select" value={filterContractType} onChange={(e) => setFilterContractType(e.target.value)}>
                <option value="">계약구분 전체</option>
                {contractTypeOptions.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
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
              <option value="">전체</option>
              {renderStatusOptions()}
            </select>
            <select className="filter-select" value={filterSettlement} onChange={(e) => setFilterSettlement(e.target.value)}>
              <option value="">전체</option>
              <option value="정산대기">정산대기</option>
              <option value="확인중">확인중</option>
              <option value="반려">반려</option>
              <option value="완료">완료</option>
            </select>
            <select className="filter-select" value={filterContractType} onChange={(e) => setFilterContractType(e.target.value)}>
              <option value="">계약구분 전체</option>
              {contractTypeOptions.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
            </select>
            <select className="filter-select" value={searchCondition} onChange={(e) => setSearchCondition(e.target.value)}>
              {searchConditionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <input className="filter-input" type="text" value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }} placeholder="검색어" />
            <button className="btn-primary" style={{ height: '32px', fontSize: '13px', padding: '0 14px' }} onClick={handleSearch}>검색</button>
          </div>
        )}
        {activeTab === 'all' && isStenographyType && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px' }}>
            <button className="btn-primary" style={{ fontSize: '13px' }} onClick={handleOpenBulkAssign}>일괄배정</button>
            <button className="btn-primary" style={{ fontSize: '13px' }} onClick={handleOpenNotify}>알림 발송</button>
          </div>
        )}
        {activeTab === 'all' && mergedTable(filtered, false, true)}
        {activeTab === 'today' && mergedTable(alerts.todayDueItems, false)}
        {activeTab === 'overdue' && mergedTable(alerts.overdueItems, workType === 'meeting')}
        {activeTab === 'all' && pagination}
        {isStenographyType && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '14px', marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span><span style={{ color: NOTIFY_ICON_BY_LEVEL.none.color }}>{NOTIFY_ICON_BY_LEVEL.none.icon}</span> 미발송</span>
          </div>
        )}
      </div>
      {assignModalJsx}

      {/* 알림 발송 1단계 — 알림 유형 선택 */}
      {notifyStep === 'select' && (
        <div className="pm-overlay" onClick={closeNotifyFlow}>
          <div className="pm-modal pm-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-hd">
              <span className="pm-modal-title">알림 발송</span>
              <button className="preg-x-btn" onClick={closeNotifyFlow}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {NOTIFY_TYPES.map((t) => (
                <button
                  key={t.key}
                  className="proto-log-btn"
                  style={{ textAlign: 'left', padding: '10px 14px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '2px' }}
                  onClick={() => handleSelectNotifyType(t.key)}
                >
                  <span>{t.label}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 알림 발송 2단계 — 발송 대상 확인 */}
      {notifyStep === 'confirm' && (() => {
        const unassigned = notifyType === 'nextWeek' ? nextWeekUnassigned : notifyType === 'nextDay' ? nextDayUnassigned : [];
        return (
        <div className="pm-overlay" onClick={closeNotifyFlow}>
          <div className={`pm-modal${unassigned.length === 0 ? ' pm-modal--sm' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-hd">
              <span className="pm-modal-title">{NOTIFY_TYPES.find((t) => t.key === notifyType)?.label}</span>
              <button className="preg-x-btn" onClick={closeNotifyFlow}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                {NOTIFY_TYPES.find((t) => t.key === notifyType)?.desc}
              </p>
              {unassigned.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  선택한 대상에게 알림을 발송하시겠습니까?
                </p>
              ) : (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    배정이 완료되지 않은 작업물이 있습니다.<br />
                    제외 후 나머지 작업물에 대해 알림을 발송하시겠습니까?
                  </p>
                  <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>알림 제외</p>
                  <div className="proto-table-wrap proto-table-wrap--scroll" style={{ marginBottom: '10px', maxHeight: '160px', overflowX: 'auto' }}>
                    <table className="proto-table" style={{ width: 'max-content', minWidth: '100%' }}>
                      <thead>
                        <tr>
                          <th className="text-center" style={{ whiteSpace: 'nowrap' }}>의뢰일자</th>
                          <th style={{ whiteSpace: 'nowrap' }}>업체명</th>
                          <th className="text-center" style={{ whiteSpace: 'nowrap' }}>계약구분</th>
                          <th className="text-center" style={{ whiteSpace: 'nowrap' }}>회차</th>
                          <th className="text-center" style={{ whiteSpace: 'nowrap' }}>시작~종료 시간</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unassigned.map((sm) => (
                          <tr key={sm.id}>
                            <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{formatRegDate(sm.regDttm)}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{sm.entNm}</td>
                            <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{contractBadge(sm.contractType)}</td>
                            <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{sm.round || '-'}</td>
                            <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{sm.sessionTime || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {notifyType === 'assign' && (
                <p style={{ fontSize: '13px', fontWeight: 600 }}>선택한 {selectedIds.size}건 중 작업자가 배정된 의뢰에 발송됩니다.</p>
              )}
              {notifyType === 'nextWeek' && (
                <p style={{ fontSize: '13px', fontWeight: 600 }}>
                  발송 대상 기간: {fmtDateOnly(nextWeekRange.start)} ~ {fmtDateOnly(nextWeekRange.end)} ({nextWeekTargets.length}건)
                </p>
              )}
              {notifyType === 'nextDay' && (
                <p style={{ fontSize: '13px', fontWeight: 600 }}>
                  익일 회의 즉시 발송 대상 {nextDayTargets.immediate.length}건 / 회의 전날(주말·공휴일) 자동 예약 발송 대상 {nextDayTargets.scheduled.length}건
                </p>
              )}
            </div>
            <div className="pm-modal-ft">
              <button className="proto-log-btn" onClick={closeNotifyFlow}>취소</button>
              <button className="proto-log-btn proto-log-btn--save" onClick={confirmNotifySend}>확인</button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
