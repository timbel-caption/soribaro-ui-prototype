import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STENOGRAPHY_SETTLEMENT_SAMPLES } from '../enterprise/proto/stenographySettlementSampleData';
import { downloadStenographySettlementExcel } from '../../../utils/workManagementExcel';
import '../../../styles/notion-list.css';
import '../enterprise/EnterpriseWorkList.css';
import '../enterprise/proto/ProtoDetail.css';

// 현장속기 상세보기 탭 순서(TAB_LABELS_STG) 상 "정산확인" 탭의 인덱스
const STG_SETTLE_CONFIRM_TAB_INDEX = 2;

function gradeBadge(grade) {
  const cls = grade === 'Master' ? 'settle-grade-master'
    : grade === 'Pro' ? 'settle-grade-pro'
    : grade === 'Elite' ? 'settle-grade-elite'
    : 'settle-grade-rookie';
  return <span className={`settle-grade-badge ${cls}`}>{grade}</span>;
}

function settlementStatusBadge(status) {
  if (status === '정산완료') return <span className="settle-status-badge--done">{status}</span>;
  if (status === '확인중') return <span className="settle-status-badge--checking">{status}</span>;
  return <span className="settle-status-badge--pre">{status}</span>; // 정산대기
}

function formatAmount(value) {
  if (value == null || value === '') return '-';
  return `${Number(value).toLocaleString()}원`;
}

// 작업시간을 [hh]:mm 형식으로 표시 — 24시간이 넘어가도 누적 시간으로 표기한다 (예: 02:30, 105:20)
function formatWorkHours(hours) {
  if (hours == null || hours === '') return '-';
  const totalMinutes = Math.round(Number(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function StenographySettlementPage() {
  const navigate = useNavigate();
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const handleSearch = () => setAppliedSearch(pendingSearch.trim());

  // 검색 조건: 정산서 발행일(시작~종료) / 상태 / 작업자
  const filtered = STENOGRAPHY_SETTLEMENT_SAMPLES.filter((row) => {
    if (filterFrom && row.issueDate < filterFrom) return false;
    if (filterTo && row.issueDate > filterTo) return false;
    if (filterStatus && row.status !== filterStatus) return false;
    if (appliedSearch && !row.worker.includes(appliedSearch)) return false;
    return true;
  });

  const handleExportExcel = () => downloadStenographySettlementExcel(filtered);

  // 정산 건 더블클릭 시 해당 작업의 상세보기 > 정산확인 탭으로 이동한다
  const handleRowDoubleClick = (row) => {
    if (!row.workId) return;
    navigate(`/soribaro/stenography/detail/${row.workId}`, { state: { initialTab: STG_SETTLE_CONFIRM_TAB_INDEX } });
  };

  const pagination = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
      <select className="filter-select" style={{ width: '70px', height: '30px' }} defaultValue="20">
        <option value="20">20건</option>
        <option value="50">50건</option>
        <option value="100">100건</option>
      </select>
      <button className="proto-log-btn" style={{ padding: '3px 8px' }}>‹</button>
      {[1].map((n) => (
        <button key={n} className="proto-log-btn" style={{ padding: '3px 10px', background: 'var(--accent-color)', color: '#fff', borderColor: 'var(--accent-color)' }}>{n}</button>
      ))}
      <button className="proto-log-btn" style={{ padding: '3px 8px' }}>›</button>
      <button className="proto-log-btn" style={{ padding: '3px 8px' }}>»</button>
      <span style={{ marginLeft: '4px' }}>1/1</span>
    </div>
  );

  return (
    <div className="notion-page enterprise-work-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">현장속기 정산관리</h1>
          <p className="page-description">현장속기 작업자 정산 내역을 관리합니다</p>
        </div>
      </div>

      <div className="proto-dashboard">
        <div className="proto-dash-header">
          <span className="proto-label-chip">5차 고도화</span>
          <span className="proto-dash-title">프로토타입 샘플 현황</span>
          <span className="proto-notice-chip">실제 데이터 미연동</span>
        </div>

        <div className="proto-dash-projects">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <p className="proto-dash-section-title" style={{ marginBottom: 0 }}>정산 내역</p>
            <button className="btn-ghost" style={{ fontSize: '13px' }} onClick={handleExportExcel}>엑셀 다운로드</button>
          </div>

          <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              <input className="filter-date" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="정산서 발행일 시작" />
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>~</span>
              <input className="filter-date" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} title="정산서 발행일 종료" />
              <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">상태 전체</option>
                <option value="정산대기">정산대기</option>
                <option value="확인중">확인중</option>
                <option value="정산완료">정산완료</option>
              </select>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>※ 날짜 검색은 정산서 발행일 기준으로 조회합니다.</p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                className="filter-input"
                style={{ flex: 1 }}
                type="text"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="작업자명 검색"
              />
              <button className="btn-primary" style={{ height: '32px', fontSize: '13px', padding: '0 24px' }} onClick={handleSearch}>검색</button>
            </div>
          </div>

          <div className="proto-table-wrap" style={{ marginBottom: '12px' }}>
            <table className="proto-table">
              <thead>
                <tr>
                  <th>작업자</th>
                  <th className="text-center">등급</th>
                  <th className="text-center">단가</th>
                  <th className="text-center">작업시간</th>
                  <th className="text-center">정산금액</th>
                  <th className="text-center">출장비</th>
                  <th className="text-center">실지급액</th>
                  <th className="text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>해당 건이 없습니다.</td></tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} style={{ cursor: 'pointer' }} onDoubleClick={() => handleRowDoubleClick(row)}>
                      <td style={{ fontWeight: 600 }}>{row.worker}</td>
                      <td className="text-center">{gradeBadge(row.grade)}</td>
                      <td className="text-center">{formatAmount(row.unitPrice)}</td>
                      <td className="text-center">{formatWorkHours(row.workHours)}</td>
                      <td className="text-center">{formatAmount(row.settlementAmount)}</td>
                      <td className="text-center">{formatAmount(row.travelFee)}</td>
                      <td className="text-center" style={{ fontWeight: 700 }}>{formatAmount(row.netAmount)}</td>
                      <td className="text-center">{settlementStatusBadge(row.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {pagination}
        </div>
      </div>
    </div>
  );
}
