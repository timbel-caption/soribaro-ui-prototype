import { useNavigate } from 'react-router-dom';

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

function computeStats(samples) {
  const total = samples.length;
  const working  = samples.filter((s) => s.overallStatus === 'WORKING').length;
  const checking = samples.filter((s) => s.overallStatus === 'CHECKING').length;
  const deliveryDone = samples.flatMap((s) => s.deliveries).filter((d) => d.status === '납품완료').length;
  const settleWait   = samples.filter((s) => ['정산대기', '부분정산'].includes(s.settlement.status)).length;
  return { total, working, checking, deliveryDone, settleWait };
}

export default function ProtoListDashboard({ samples }) {
  const navigate = useNavigate();
  const st = computeStats(samples);

  const statCards = [
    { label: '전체 프로젝트', value: st.total,        color: 'var(--accent-color)' },
    { label: '작업중',        value: st.working,       color: '#f87171' },
    { label: '검수중',        value: st.checking,      color: '#fbbf24' },
    { label: '납품 완료',     value: st.deliveryDone,  color: '#4ade80' },
    { label: '정산 대기',     value: st.settleWait,    color: '#a78bfa' },
  ];

  const maxBarValue = Math.max(st.working, st.checking, st.deliveryDone, st.settleWait, 1);
  const statusBars = [
    { label: '작업중',    value: st.working,      color: '#f87171' },
    { label: '검수중',    value: st.checking,     color: '#fbbf24' },
    { label: '납품완료',  value: st.deliveryDone, color: '#4ade80' },
    { label: '정산대기',  value: st.settleWait,   color: '#a78bfa' },
  ];

  return (
    <div className="proto-dashboard">
      {/* 헤더 */}
      <div className="proto-dash-header">
        <span className="proto-label-chip">5차 고도화</span>
        <span className="proto-dash-title">프로토타입 샘플 현황</span>
        <span className="proto-notice-chip">실제 데이터 미연동</span>
      </div>

      {/* 통계 카드 */}
      <div className="proto-dash-cards">
        {statCards.map((c) => (
          <div key={c.label} className="proto-dash-card">
            <span className="proto-dash-value" style={{ color: c.color }}>{c.value}</span>
            <span className="proto-dash-label">{c.label}</span>
          </div>
        ))}
      </div>

      {/* 프로젝트 목록 */}
      <div className="proto-dash-projects">
        <p className="proto-dash-section-title">최근 프로젝트</p>
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
                <th className="text-center" style={{ width: '72px' }}></th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(s.protoPath)}>
                  <td style={{ fontWeight: 600 }}>{s.entNm}</td>
                  <td style={{ color: 'var(--accent-color)', fontWeight: 500 }}>
                    {s.servTitle}
                  </td>
                  <td className="text-center">{s.bssTypeName}</td>
                  <td className="text-center">{s.dueDate}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상태별 현황 — 맨 아래 가로 배치 */}
      <div className="proto-dash-status-bottom">
        <p className="proto-dash-section-title">상태별 현황</p>
        <div className="proto-dash-status-grid">
          {statusBars.map((b) => (
            <div key={b.label} className="proto-dash-status-item">
              <span className="proto-dash-status-label">{b.label}</span>
              <div className="proto-dash-status-bar-bg">
                <div
                  className="proto-dash-status-bar-fill"
                  style={{
                    width: `${(b.value / maxBarValue) * 100}%`,
                    background: b.color,
                  }}
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
