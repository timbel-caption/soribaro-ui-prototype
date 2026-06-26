import { useNavigate } from 'react-router-dom';

// ── 날짜 헬퍼 (프로토타입 고정 날짜) ──────────────────────────────────────
const TODAY_STR = '2026-06-23';
const TODAY = new Date(TODAY_STR);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  if (diff > 5)   return { label: `D-${diff}`,          cls: 'dd-normal'  };
  if (diff > 3)   return { label: `D-${diff}`,          cls: 'dd-caution' };
  if (diff > 0)   return { label: `D-${diff}`,          cls: 'dd-danger'  };
  if (diff === 0) return { label: 'D-Day',              cls: 'dd-dday'    };
  return           { label: '일정 조율',                 cls: 'dd-adjust'  };
}

function resolvedStatus(sample) {
  const d    = parseDateStr(sample.dueDate);
  const diff = dateDiffDays(d);
  if (diff !== null && diff < 0 && sample.overallStatus !== 'DONE') return 'DELAYED';
  if (diff !== null && diff <= 3 && sample.overallStatus === 'WORKING') return 'CAUTION';
  return sample.overallStatus;
}

const STATUS_META = {
  WORKING:  { label: '작업중',   cls: 'st-working',  color: '#f87171' },
  CAUTION:  { label: '주의',     cls: 'st-caution',  color: '#fb923c' },
  DELAYED:  { label: '일정 조율', cls: 'st-delayed',  color: '#a78bfa' },
  CHECKING: { label: '검수중',   cls: 'st-checking', color: '#fbbf24' },
  DONE:     { label: '납품완료', cls: 'st-done',     color: '#4ade80' },
  SETTLE:   { label: '정산대기', cls: 'st-settle',   color: '#a78bfa' },
};

function statusBadge(sample) {
  const rs = resolvedStatus(sample);
  const m  = STATUS_META[rs] ?? STATUS_META.WORKING;
  return <span className={`vod-status-badge ${m.cls}`}>{m.label}</span>;
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
  if (s === '완료')            return <span className="proto-settle-badge-done"    style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '업체 정산대기')   return <span className="proto-settle-badge-wait"    style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '작업자 정산대기') return <span className="proto-settle-badge-wait"    style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '정산대기')        return <span className="proto-settle-badge-wait"    style={{ fontSize: '11px' }}>{s}</span>;
  if (s === '부분정산')        return <span className="proto-settle-badge-partial" style={{ fontSize: '11px' }}>{s}</span>;
  return <span className="proto-settle-badge-pre" style={{ fontSize: '11px' }}>{s}</span>;
}

function computeOverallProgress(sample) {
  if (!sample.workProgress || sample.workProgress.length === 0) return 0;
  const sum = sample.workProgress.reduce((acc, w) => acc + w.progress, 0);
  return Math.round(sum / sample.workProgress.length);
}

function progressBarColor(pct, rs) {
  if (rs === 'DELAYED') return '#a78bfa';
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
  const settleWait = samples.filter((s) => deriveSettleStatus(s.settlement) !== '완료').length;
  return { total, working, caution, delayed, checking, done, settleWait };
}

function computeScheduleSummary(samples) {
  const todayMs = TODAY.getTime();
  const thisWeek = samples.filter((s) => {
    const d = parseDateStr(s.dueDate);
    if (!d) return false;
    const diff = d.getTime() - todayMs;
    return diff >= 0 && diff < WEEK_MS;
  }).length;
  const nextWeek = samples.filter((s) => {
    const d = parseDateStr(s.dueDate);
    if (!d) return false;
    const diff = d.getTime() - todayMs;
    return diff >= WEEK_MS && diff < 2 * WEEK_MS;
  }).length;
  return { thisWeek, nextWeek };
}

function computeUpcomingList(samples) {
  return samples
    .filter((s) => s.overallStatus !== 'DONE')
    .map((s) => {
      const rs   = resolvedStatus(s);
      const pct  = computeOverallProgress(s);
      const diff = dateDiffDays(parseDateStr(s.dueDate)) ?? 9999;
      const isAdjust = rs === 'DELAYED';
      return {
        name:     s.servTitle,
        dueDate:  s.dueDate,
        ddLabel:  isAdjust ? '일정 조율' : dDayInfo(s.dueDate).label,
        ddCls:    isAdjust ? 'dd-adjust'  : dDayInfo(s.dueDate).cls,
        status:   rs,
        pct,
        diff,
      };
    })
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 6);
}

// 미니 캘린더 (2026년 6월 고정)
function MiniCalendar() {
  const year = 2026, month = 5;
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay    = 23;
  const dueDays     = new Set([20, 30]);
  const cells       = [];
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
              !d              ? 'vod-mc-empty' : '',
              d === todayDay  ? 'vod-mc-today' : '',
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
  const st     = computeStats(samples);
  const upcoming = computeUpcomingList(samples);

  const statCards = [
    { label: '전체 프로젝트', value: st.total,      color: 'var(--accent-color)' },
    { label: '작업중',        value: st.working,     color: '#f87171'  },
    { label: '검수중',        value: st.checking,    color: '#fbbf24'  },
    { label: '납품 완료',     value: st.done,        color: '#4ade80'  },
    { label: '정산 대기',     value: st.settleWait,  color: '#a78bfa'  },
  ];

  return (
    <div className="proto-dashboard vod-dashboard">

      {/* ① 다가오는 납품 일정 */}
      <div className="vod-upcoming-section">
        <p className="vod-upcoming-title">다가오는 납품 일정</p>
        <div className="vod-upcoming-list">
          {upcoming.length === 0 && (
            <div className="vod-upcoming-empty">예정된 납품 일정이 없습니다.</div>
          )}
          {upcoming.map((item, idx) => (
            <div key={idx} className="vod-upcoming-row">
              <span className={`vod-dd-badge ${item.ddCls}`}>{item.ddLabel}</span>
              <span className="vod-upcoming-name">{item.name}</span>
              <span className={`vod-status-badge ${STATUS_META[item.status]?.cls ?? ''}`}>
                {STATUS_META[item.status]?.label ?? item.status}
              </span>
              <span className="vod-upcoming-due">{item.dueDate}</span>
              <div className="vod-upcoming-progress">
                <div className="vod-upcoming-pb-bg">
                  <div
                    className="vod-upcoming-pb-fill"
                    style={{ width: `${item.pct}%`, background: progressBarColor(item.pct, item.status) }}
                  />
                </div>
                <span className="vod-upcoming-pct">{item.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

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
                const ddDisplay = rs === 'DELAYED' ? { label: '일정 조율', cls: 'dd-adjust' } : dd;
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
                      <span className={`vod-dd-badge ${ddDisplay.cls}`}>{ddDisplay.label}</span>
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
                    <td className="text-center">{settleBadge(deriveSettleStatus(s.settlement))}</td>
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

      {/* ④ 하단 보조 카드 (납품 캘린더 + 파일별 기한) */}
      <div className="vod-helper-row">

        {/* 납품 일정 캘린더 */}
        <div className="vod-helper-card">
          <p className="vod-helper-card-title">납품 일정 캘린더</p>
          <MiniCalendar />
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
