import { useNavigate } from 'react-router-dom';

// ── 날짜 헬퍼 (프로토타입 고정 날짜) ──────────────────────────────────────
const TODAY_STR = '2026-06-23';
const TODAY = new Date(TODAY_STR);

function parseDateStr(str) {
  if (!str || str === '-') return null;
  return new Date(str);
}

function dateDiffDays(target) {
  if (!target) return null;
  return Math.round((target - TODAY) / (1000 * 60 * 60 * 24));
}

function dDayInfo(dueDateStr) {
  const d = parseDateStr(dueDateStr);
  if (!d) return { label: '-', cls: 'dd-normal' };
  const diff = dateDiffDays(d);
  if (diff === null) return { label: '-', cls: 'dd-normal' };
  if (diff > 5)  return { label: `D-${diff}`, cls: 'dd-normal' };
  if (diff > 3)  return { label: `D-${diff}`, cls: 'dd-caution' };
  if (diff > 0)  return { label: `D-${diff}`, cls: 'dd-danger' };
  if (diff === 0) return { label: 'D-Day',    cls: 'dd-dday' };
  return { label: `D+${Math.abs(diff)}`, cls: 'dd-delayed' };
}

// overallStatus + 납기 기반 위험도 보강
function resolvedStatus(sample) {
  const d = parseDateStr(sample.dueDate);
  const diff = dateDiffDays(d);
  if (diff !== null && diff < 0 && sample.overallStatus !== 'DONE') return 'DELAYED';
  if (diff !== null && diff <= 3 && sample.overallStatus === 'WORKING') return 'CAUTION';
  return sample.overallStatus;
}

const STATUS_META = {
  WORKING:  { label: '작업중',   cls: 'st-working',  color: '#f87171' },
  CAUTION:  { label: '주의',     cls: 'st-caution',  color: '#fb923c' },
  DELAYED:  { label: '지연',     cls: 'st-delayed',  color: '#ef4444' },
  CHECKING: { label: '검수중',   cls: 'st-checking', color: '#fbbf24' },
  DONE:     { label: '납품완료', cls: 'st-done',     color: '#4ade80' },
  SETTLE:   { label: '정산대기', cls: 'st-settle',   color: '#a78bfa' },
};

function statusBadge(sample) {
  const rs = resolvedStatus(sample);
  const m = STATUS_META[rs] ?? STATUS_META.WORKING;
  return <span className={`vod-status-badge ${m.cls}`}>{m.label}</span>;
}

function settleBadge(s) {
  if (s === '정산완료') return <span className="proto-settle-badge-done"  style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '정산대기') return <span className="proto-settle-badge-wait"  style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '부분정산') return <span className="proto-settle-badge-partial" style={{ fontSize: '11px' }}>{s}</span>;
  return <span className="proto-settle-badge-pre" style={{ fontSize: '11px' }}>{s}</span>;
}

function computeOverallProgress(sample) {
  if (!sample.workProgress || sample.workProgress.length === 0) return 0;
  const sum = sample.workProgress.reduce((acc, w) => acc + w.progress, 0);
  return Math.round(sum / sample.workProgress.length);
}

function progressBarColor(pct, rs) {
  if (rs === 'DELAYED') return '#ef4444';
  if (rs === 'CAUTION') return '#fb923c';
  if (pct >= 100) return '#4ade80';
  if (pct >= 60)  return '#60a5fa';
  return '#a78bfa';
}

function computeStats(samples) {
  const total      = samples.length;
  const working    = samples.filter((s) => resolvedStatus(s) === 'WORKING').length;
  const caution    = samples.filter((s) => resolvedStatus(s) === 'CAUTION').length;
  const delayed    = samples.filter((s) => resolvedStatus(s) === 'DELAYED').length;
  const checking   = samples.filter((s) => resolvedStatus(s) === 'CHECKING').length;
  const done       = samples.flatMap((s) => s.deliveries).filter((d) => d.status === '납품완료').length;
  const settleWait = samples.filter((s) => ['정산대기', '부분정산'].includes(s.settlement.status)).length;
  return { total, working, caution, delayed, checking, done, settleWait };
}

function computeTimeline(samples) {
  const allDates = samples.flatMap((s) => [
    parseDateStr(s.regDttm?.split(' ')[0]),
    parseDateStr(s.dueDate),
  ]).filter(Boolean);
  if (allDates.length === 0) return null;
  const minMs = Math.min(...allDates.map((d) => d.getTime()));
  const maxMs = Math.max(...allDates.map((d) => d.getTime()));
  const span  = maxMs - minMs || 1;
  const todayPct = Math.min(100, Math.max(0, ((TODAY.getTime() - minMs) / span) * 100));
  const projects = samples.map((s) => {
    const start = parseDateStr(s.regDttm?.split(' ')[0]) ?? new Date(minMs);
    const end   = parseDateStr(s.dueDate) ?? new Date(maxMs);
    return {
      ...s,
      startPct: ((start.getTime() - minMs) / span) * 100,
      endPct:   ((end.getTime()   - minMs) / span) * 100,
      rs: resolvedStatus(s),
    };
  });
  const minStr = new Date(minMs).toISOString().split('T')[0];
  const maxStr = new Date(maxMs).toISOString().split('T')[0];
  return { minStr, maxStr, todayPct, projects };
}

// 미니 캘린더 (2026년 6월 고정)
function MiniCalendar() {
  const year = 2026, month = 5; // 0-indexed
  const firstDay     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const todayDay     = 23;
  const dueDays      = new Set([20, 30]);
  const cells        = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="vod-mini-cal">
      <div className="vod-mini-cal-title">2026년 6월</div>
      <div className="vod-mini-cal-grid">
        {['일','월','화','수','목','금','토'].map((w) => (
          <div key={w} className="vod-mc-dow">{w}</div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            className={[
              'vod-mc-cell',
              !d            ? 'vod-mc-empty'   : '',
              d === todayDay ? 'vod-mc-today'  : '',
              d && dueDays.has(d) ? 'vod-mc-due' : '',
            ].join(' ')}
          >
            {d ?? ''}
          </div>
        ))}
      </div>
      <div className="vod-mc-legend">
        <span className="vod-mc-leg-today" />오늘&nbsp;&nbsp;
        <span className="vod-mc-leg-due" />납품일
      </div>
    </div>
  );
}

export default function ProtoListDashboard({ samples }) {
  const navigate = useNavigate();
  const st  = computeStats(samples);
  const tl  = computeTimeline(samples);

  const statCards = [
    { label: '전체 프로젝트', value: st.total,      color: 'var(--accent-color)' },
    { label: '작업중',        value: st.working,     color: '#f87171' },
    { label: '검수중',        value: st.checking,    color: '#fbbf24' },
    { label: '납품 완료',     value: st.done,        color: '#4ade80' },
    { label: '정산 대기',     value: st.settleWait,  color: '#a78bfa' },
  ];

  const statusBars = [
    { label: '작업중',   value: st.working,    color: '#f87171' },
    { label: '주의',     value: st.caution,    color: '#fb923c' },
    { label: '지연',     value: st.delayed,    color: '#ef4444' },
    { label: '검수중',   value: st.checking,   color: '#fbbf24' },
    { label: '납품완료', value: st.done,       color: '#4ade80' },
    { label: '정산대기', value: st.settleWait, color: '#a78bfa' },
  ];
  const maxBarVal = Math.max(...statusBars.map((b) => b.value), 1);

  return (
    <div className="proto-dashboard vod-dashboard">

      {/* ① 전체 일정 진행 타임라인 */}
      {tl && (
        <div className="vod-timeline-section">
          <div className="vod-tl-section-header">
            <span className="vod-section-label">전체 일정 진행 현황</span>
            <span className="vod-tl-today-chip">오늘 {TODAY_STR}</span>
          </div>
          <div className="vod-tl-track-wrap">
            {tl.projects.map((p) => {
              const color = STATUS_META[p.rs]?.color ?? '#6366f1';
              const dd    = dDayInfo(p.dueDate);
              return (
                <div key={p.id} className="vod-tl-row">
                  <span className="vod-tl-proj-name" title={p.servTitle}>{p.servTitle}</span>
                  <div className="vod-tl-bar-bg">
                    {/* 진행 바 */}
                    <div
                      className="vod-tl-bar-fill"
                      style={{
                        left:       `${p.startPct}%`,
                        width:      `${Math.max(p.endPct - p.startPct, 2)}%`,
                        background: color,
                      }}
                    />
                    {/* 오늘 위치 선 */}
                    <div className="vod-tl-today-line" style={{ left: `${tl.todayPct}%` }} />
                    {/* 납품일 마커 */}
                    <div className="vod-tl-due-dot" style={{ left: `${p.endPct}%` }} title={`납품일 ${p.dueDate}`} />
                  </div>
                  <span className="vod-tl-due-date">{p.dueDate}</span>
                  <span className={`vod-dd-badge ${dd.cls}`}>{dd.label}</span>
                </div>
              );
            })}
            <div className="vod-tl-range-labels">
              <span>{tl.minStr}</span>
              <span style={{ position: 'absolute', left: `${tl.todayPct}%`, transform: 'translateX(-50%)' }} className="vod-tl-range-today">TODAY</span>
              <span>{tl.maxStr}</span>
            </div>
          </div>
          <div className="vod-tl-legend">
            <span className="vod-tl-leg-item"><span className="vod-tl-leg-line" />오늘</span>
            <span className="vod-tl-leg-item"><span className="vod-tl-leg-dot" />납품일</span>
            <span className="vod-tl-leg-item"><span className="vod-tl-leg-bar" style={{ background: '#ef4444' }} />지연</span>
            <span className="vod-tl-leg-item"><span className="vod-tl-leg-bar" style={{ background: '#fb923c' }} />주의</span>
            <span className="vod-tl-leg-item"><span className="vod-tl-leg-bar" style={{ background: '#fbbf24' }} />검수중</span>
            <span className="vod-tl-leg-item"><span className="vod-tl-leg-bar" style={{ background: '#4ade80' }} />정상</span>
          </div>
        </div>
      )}

      {/* ② 통계 카드 */}
      <div className="proto-dash-cards">
        {statCards.map((c) => (
          <div key={c.label} className="proto-dash-card">
            <span className="proto-dash-value" style={{ color: c.color }}>{c.value}</span>
            <span className="proto-dash-label">{c.label}</span>
          </div>
        ))}
      </div>

      {/* ③ 프로젝트 테이블 */}
      <div className="proto-dash-projects">
        <p className="proto-dash-section-title">프로젝트 목록</p>
        <div className="proto-table-wrap vod-proj-table-wrap" style={{ marginBottom: 0 }}>
          <table className="proto-table vod-proj-table">
            <thead>
              <tr>
                <th>업체명</th>
                <th>프로젝트명</th>
                <th className="text-center">작업유형</th>
                <th className="text-center">납품기한</th>
                <th className="text-center">D-Day</th>
                <th className="text-center">상태</th>
                <th style={{ minWidth: 130 }}>전체 진행률</th>
                <th className="text-center">정산</th>
                <th className="text-center" style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => {
                const rs  = resolvedStatus(s);
                const dd  = dDayInfo(s.dueDate);
                const pct = computeOverallProgress(s);
                const barColor = progressBarColor(pct, rs);
                return (
                  <tr
                    key={s.id}
                    className={rs === 'DELAYED' ? 'vod-row-delayed' : rs === 'CAUTION' ? 'vod-row-caution' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(s.protoPath)}
                  >
                    <td style={{ fontWeight: 600 }}>{s.entNm}</td>
                    <td style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{s.servTitle}</td>
                    <td className="text-center">{s.bssTypeName}</td>
                    <td className="text-center">{s.dueDate}</td>
                    <td className="text-center">
                      <span className={`vod-dd-badge ${dd.cls}`}>{dd.label}</span>
                    </td>
                    <td className="text-center">{statusBadge(s)}</td>
                    <td>
                      <div className="vod-progress-cell">
                        <div className="vod-progress-bar-bg">
                          <div className="vod-progress-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="vod-progress-pct" style={{ color: barColor }}>{pct}%</span>
                      </div>
                    </td>
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
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ④ 상태별 현황 (위험도 포함) */}
      <div className="proto-dash-status-bottom">
        <p className="proto-dash-section-title">상태별 현황 (위험도 포함)</p>
        <div className="vod-status-bars-grid">
          {statusBars.map((b) => (
            <div key={b.label} className="proto-dash-status-item">
              <span className="proto-dash-status-label">{b.label}</span>
              <div className="proto-dash-status-bar-bg">
                <div
                  className="proto-dash-status-bar-fill"
                  style={{ width: `${(b.value / maxBarVal) * 100}%`, background: b.color }}
                />
              </div>
              <span className="proto-dash-status-count" style={{ color: b.value > 0 ? b.color : 'var(--text-muted)' }}>
                {b.value}건
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ⑤ 하단 보조 카드 */}
      <div className="vod-helper-row">

        {/* D-Day 기준 안내 */}
        <div className="vod-helper-card">
          <p className="vod-helper-card-title">D-Day 상태 기준</p>
          <div className="vod-dd-guide-list">
            <div className="vod-dd-guide-row"><span className="vod-dd-badge dd-normal">D-N</span><span>정상 진행 (D-6 이상)</span></div>
            <div className="vod-dd-guide-row"><span className="vod-dd-badge dd-caution">D-5</span><span>주의 (D-4 ~ D-5)</span></div>
            <div className="vod-dd-guide-row"><span className="vod-dd-badge dd-danger">D-3</span><span>위험 (D-1 ~ D-3)</span></div>
            <div className="vod-dd-guide-row"><span className="vod-dd-badge dd-dday">D-Day</span><span>납품 당일</span></div>
            <div className="vod-dd-guide-row"><span className="vod-dd-badge dd-delayed">D+N</span><span>지연 (납기 초과)</span></div>
          </div>
        </div>

        {/* 상태 색상 기준 */}
        <div className="vod-helper-card">
          <p className="vod-helper-card-title">상태별 색상 기준</p>
          <div className="vod-status-guide-list">
            {Object.entries(STATUS_META).map(([key, m]) => (
              <div key={key} className="vod-status-guide-row">
                <span className={`vod-status-badge ${m.cls}`}>{m.label}</span>
                <span className="vod-status-guide-desc">
                  {key === 'WORKING'  ? '일반 작업 진행 중'    :
                   key === 'CAUTION'  ? 'D-3 이내 마감 임박'   :
                   key === 'DELAYED'  ? '납기 초과 지연 상태'  :
                   key === 'CHECKING' ? '검수 단계 진행 중'    :
                   key === 'DONE'     ? '납품 완료 처리됨'     :
                                       '정산 처리 대기 중'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 납품 일정 캘린더 */}
        <div className="vod-helper-card">
          <p className="vod-helper-card-title">납품 일정 캘린더</p>
          <MiniCalendar />
        </div>

        {/* 일정 편집 */}
        <div className="vod-helper-card">
          <p className="vod-helper-card-title">일정 편집</p>
          <div className="vod-sched-edit-list">
            {samples.map((s) => (
              <div key={s.id} className="vod-sched-edit-row">
                <div className="vod-sched-edit-info">
                  <span className="vod-sched-edit-ent">{s.entNm}</span>
                  <span className="vod-sched-edit-title" title={s.servTitle}>{s.servTitle}</span>
                </div>
                <div className="vod-sched-edit-right">
                  <span className="vod-sched-edit-date">{s.dueDate}</span>
                  <button
                    className="vod-sched-edit-btn"
                    onClick={(e) => { e.stopPropagation(); alert('일정 편집 (UI 프로토타입)'); }}
                  >
                    편집
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 파일별 세부 기한 */}
        <div className="vod-helper-card vod-helper-card--wide">
          <p className="vod-helper-card-title">파일별 세부 기한</p>
          <div className="vod-file-dl-list">
            <div className="vod-file-dl-head">
              <span>프로젝트</span>
              <span>파일 범위</span>
              <span>납품 기한</span>
              <span>상태</span>
            </div>
            {samples.flatMap((s) =>
              s.deliveries.map((d, i) => ({
                key: `${s.id}-${i}`,
                proj: s.servTitle,
                files: d.files,
                dueDate: d.dueDate,
                status: d.status,
              }))
            ).map((item) => (
              <div key={item.key} className="vod-file-dl-row">
                <span className="vod-file-dl-proj" title={item.proj}>{item.proj}</span>
                <span className="vod-file-dl-files">{item.files}</span>
                <span className="vod-file-dl-date">{item.dueDate}</span>
                <span className={`vod-file-dl-status ${item.status === '납품완료' ? 'vod-fdl-done' : 'vod-fdl-pending'}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
