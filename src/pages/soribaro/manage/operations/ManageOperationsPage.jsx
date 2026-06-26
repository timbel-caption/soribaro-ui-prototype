import { useState } from 'react';
import '../../../../styles/notion-list.css';
import './ManageOperationsPage.css';

// ── 상수 ──────────────────────────────────────────────────────────────────
const WORK_TABS   = ['전체', '녹취록', '회의록', '현장속기', 'VOD'];
const PERIOD_OPTS = ['주간', '월간', '연간', '기간 직접 선택'];

// ── 더미 데이터 ───────────────────────────────────────────────────────────
const SUMMARY_BY_TAB = {
  전체:   { total: 18420, assigned: 16340, inProgress: 14780, inspectAssigned: 13200, inspecting: 11450, delivered: 9830 },
  녹취록:  { total:  6210, assigned:  5900, inProgress:  5320, inspectAssigned:  4870, inspecting:  4120, delivered: 3640 },
  회의록:  { total:  4380, assigned:  3950, inProgress:  3580, inspectAssigned:  3200, inspecting:  2780, delivered: 2310 },
  현장속기: { total:  3170, assigned:  2840, inProgress:  2550, inspectAssigned:  2140, inspecting:  1840, delivered: 1560 },
  VOD:   { total:  4660, assigned:  3650, inProgress:  3330, inspectAssigned:  2990, inspecting:  2710, delivered: 2320 },
};

const ORG_ROWS_BY_TAB = {
  전체: [
    { org: 'KBS 미디어', total: 3840, assigned: 3410, inProgress: 3090, inspecting: 2720, delivered: 2440, rate: 64 },
    { org: '법무법인 태평양', total: 2210, assigned: 1980, inProgress: 1760, inspecting: 1540, delivered: 1320, rate: 60 },
    { org: '삼성전자', total: 1950, assigned: 1780, inProgress: 1600, inspecting: 1420, delivered: 1270, rate: 65 },
    { org: 'MBC 콘텐츠', total: 1730, assigned: 1560, inProgress: 1390, inspecting: 1200, delivered: 1080, rate: 62 },
    { org: '현대자동차그룹', total: 1480, assigned: 1320, inProgress: 1180, inspecting: 1020, delivered:  890, rate: 60 },
    { org: '국민건강보험공단', total: 1270, assigned: 1140, inProgress: 1010, inspecting:  870, delivered:  760, rate: 60 },
    { org: 'SBS 미디어넷', total: 1120, assigned:  990, inProgress:  880, inspecting:  770, delivered:  680, rate: 61 },
    { org: '대검찰청', total:  980, assigned:  870, inProgress:  770, inspecting:  660, delivered:  590, rate: 60 },
  ],
  녹취록: [
    { org: '법무법인 태평양', total: 1840, assigned: 1650, inProgress: 1480, inspecting: 1310, delivered: 1140, rate: 62 },
    { org: '대검찰청', total:  980, assigned:  870, inProgress:  770, inspecting:  660, delivered:  590, rate: 60 },
    { org: '국민건강보험공단', total:  820, assigned:  740, inProgress:  660, inspecting:  580, delivered:  510, rate: 62 },
    { org: '서울중앙지법', total:  710, assigned:  630, inProgress:  560, inspecting:  490, delivered:  420, rate: 59 },
    { org: '한국전력공사', total:  620, assigned:  550, inProgress:  490, inspecting:  430, delivered:  370, rate: 60 },
    { org: '삼성전자', total:  530, assigned:  480, inProgress:  430, inspecting:  380, delivered:  330, rate: 62 },
  ],
  회의록: [
    { org: '삼성전자', total: 1420, assigned: 1300, inProgress: 1150, inspecting: 1040, delivered:  940, rate: 66 },
    { org: '현대자동차그룹', total: 1090, assigned:  980, inProgress:  870, inspecting:  760, delivered:  670, rate: 61 },
    { org: 'LG전자', total:  780, assigned:  710, inProgress:  630, inspecting:  560, delivered:  490, rate: 63 },
    { org: '카카오', total:  620, assigned:  560, inProgress:  490, inspecting:  430, delivered:  370, rate: 60 },
    { org: 'SK텔레콤', total:  470, assigned:  420, inProgress:  370, inspecting:  320, delivered:  280, rate: 60 },
  ],
  현장속기: [
    { org: '국회사무처', total: 1230, assigned: 1120, inProgress:  990, inspecting:  870, delivered:  760, rate: 62 },
    { org: '서울시의회', total:  680, assigned:  610, inProgress:  540, inspecting:  470, delivered:  410, rate: 60 },
    { org: '경기도의회', total:  510, assigned:  460, inProgress:  410, inspecting:  350, delivered:  300, rate: 59 },
    { org: '한국방송공사', total:  380, assigned:  340, inProgress:  300, inspecting:  260, delivered:  230, rate: 61 },
    { org: '인천시의회', total:  370, assigned:  310, inProgress:  310, inspecting:  190, delivered:  160, rate: 43 },
  ],
  VOD: [
    { org: 'KBS 미디어', total: 2110, assigned: 1870, inProgress: 1680, inspecting: 1490, delivered: 1330, rate: 63 },
    { org: 'MBC 콘텐츠', total: 1730, assigned: 1560, inProgress: 1390, inspecting: 1200, delivered: 1080, rate: 62 },
    { org: 'SBS 미디어넷', total: 1120, assigned:  990, inProgress:  880, inspecting:  770, delivered:  680, rate: 61 },
    { org: 'CJ ENM', total:  820, assigned:  720, inProgress:  640, inspecting:  560, delivered:  490, rate: 60 },
    { org: '스튜디오드래곤', total:  650, assigned:  570, inProgress:  500, inspecting:  440, delivered:  380, rate: 58 },
  ],
};

const DETAIL_ROWS_BY_TAB = {
  전체: [
    { id: 1, org: 'KBS 미디어',     title: '[VOD] 뉴스 특집 2024',       type: 'VOD',   files: 38,  total: 840,  delivered: 720,  status: '작업 중' },
    { id: 2, org: '법무법인 태평양', title: '[녹취] 2024 민사소송 기록',    type: '녹취록', files: 120, total: 560,  delivered: 480,  status: '검수 중' },
    { id: 3, org: '삼성전자',        title: '[회의] Q2 경영전략 회의',      type: '회의록', files: 14,  total: 310,  delivered: 310,  status: '납품완료' },
    { id: 4, org: '국회사무처',      title: '[속기] 22대 본회의',           type: '현장속기', files: 62, total: 720, delivered: 600,  status: '작업 중' },
    { id: 5, org: 'MBC 콘텐츠',     title: '[VOD] 드라마 편집본 자막',     type: 'VOD',   files: 22,  total: 490,  delivered: 320,  status: '검수 중' },
    { id: 6, org: '현대자동차',      title: '[회의] 글로벌 전략 2024',      type: '회의록', files: 8,   total: 180,  delivered: 180,  status: '납품완료' },
    { id: 7, org: '대검찰청',        title: '[녹취] 특수부 조사 기록',      type: '녹취록', files: 95,  total: 420,  delivered: 310,  status: '작업 중' },
    { id: 8, org: 'SBS 미디어넷',   title: '[VOD] 시사 다큐 시즌3',       type: 'VOD',   files: 16,  total: 360,  delivered: 210,  status: '작업 중' },
  ],
  녹취록: [
    { id: 1, org: '법무법인 태평양', title: '[녹취] 2024 민사소송 기록',   files: 120, total: 560, delivered: 480, speaker: 8,  status: '검수 중' },
    { id: 2, org: '대검찰청',        title: '[녹취] 특수부 조사 기록',     files:  95, total: 420, delivered: 310, speaker: 5,  status: '작업 중' },
    { id: 3, org: '국민건강보험공단', title: '[녹취] 정책회의 녹취본',      files:  42, total: 210, delivered: 180, speaker: 4,  status: '검수 중' },
    { id: 4, org: '서울중앙지법',    title: '[녹취] 민사 1부 심리',        files:  60, total: 290, delivered: 240, speaker: 6,  status: '납품완료' },
    { id: 5, org: '한국전력공사',    title: '[녹취] 이사회 2024-06',      files:  18, total: 120, delivered:  90, speaker: 3,  status: '작업 중' },
  ],
  회의록: [
    { id: 1, org: '삼성전자',        title: '[회의] Q2 경영전략 회의',    files: 14, total: 310, delivered: 310, lang: '한국어',  status: '납품완료' },
    { id: 2, org: '현대자동차',      title: '[회의] 글로벌 전략 2024',    files:  8, total: 180, delivered: 180, lang: '영어/한국어', status: '납품완료' },
    { id: 3, org: 'LG전자',         title: '[회의] CTO 기술전략 회의',   files: 20, total: 240, delivered: 160, lang: '한국어',  status: '작업 중' },
    { id: 4, org: '카카오',          title: '[회의] 서비스 기획 리뷰',    files: 12, total: 150, delivered: 100, lang: '한국어',  status: '검수 중' },
    { id: 5, org: 'SK텔레콤',        title: '[회의] 5G 전략 세션',        files:  6, total:  90, delivered:  60, lang: '영어',   status: '작업 중' },
  ],
  현장속기: [
    { id: 1, org: '국회사무처',      title: '[속기] 22대 본회의',         files: 62, total: 720, delivered: 600, method: '직접', status: '작업 중' },
    { id: 2, org: '서울시의회',      title: '[속기] 2024 정례회',         files: 28, total: 330, delivered: 280, method: '직접', status: '검수 중' },
    { id: 3, org: '경기도의회',      title: '[속기] 6월 임시회',          files: 18, total: 210, delivered: 160, method: '직접', status: '작업 중' },
    { id: 4, org: '한국방송공사',    title: '[속기] 라디오 생방송 녹취',   files: 12, total: 140, delivered: 120, method: '혼합', status: '납품완료' },
  ],
  VOD: [
    { id: 1, org: 'KBS 미디어',     title: '[VOD] 뉴스 특집 2024',      files: 38, total: 840, delivered: 720, type: '자막',   status: '작업 중' },
    { id: 2, org: 'MBC 콘텐츠',     title: '[VOD] 드라마 편집본 자막',   files: 22, total: 490, delivered: 320, type: '자막',   status: '검수 중' },
    { id: 3, org: 'SBS 미디어넷',   title: '[VOD] 시사 다큐 시즌3',     files: 16, total: 360, delivered: 210, type: '자막',   status: '작업 중' },
    { id: 4, org: 'CJ ENM',        title: '[VOD] 예능 하이라이트',      files:  9, total: 190, delivered: 160, type: '자막',   status: '납품완료' },
    { id: 5, org: '스튜디오드래곤',  title: '[VOD] 오리지널 시리즈 S1',  files: 12, total: 280, delivered: 180, type: '자막',   status: '작업 중' },
  ],
};

function minutesFmt(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만분`;
  if (n >= 1000)  return `${(n / 1000).toFixed(1)}천분`;
  return `${n.toLocaleString()}분`;
}

function StatusBadge({ status }) {
  const cls = status === '납품완료' ? 'ops-badge-done'
            : status === '검수 중'  ? 'ops-badge-inspect'
            : 'ops-badge-working';
  return <span className={`ops-status-badge ${cls}`}>{status}</span>;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function ManageOperationsPage() {
  const [tab, setTab]       = useState('전체');
  const [period, setPeriod] = useState('월간');
  const [dateFrom, setDateFrom] = useState('2024-06-01');
  const [dateTo,   setDateTo]   = useState('2024-06-30');

  const summary = SUMMARY_BY_TAB[tab];
  const orgRows = ORG_ROWS_BY_TAB[tab];
  const detailRows = DETAIL_ROWS_BY_TAB[tab];

  const summaryCards = [
    { label: '전체 입고 분수',     value: summary.total,           color: 'var(--text-primary)' },
    { label: '작업자 배정 분수',   value: summary.assigned,        color: '#60a5fa' },
    { label: '작업 진행 분수',     value: summary.inProgress,      color: '#34d399' },
    { label: '검수자 배정 분수',   value: summary.inspectAssigned, color: '#a78bfa' },
    { label: '검수 진행 분수',     value: summary.inspecting,      color: '#fbbf24' },
    { label: '납품 완료 분수',     value: summary.delivered,       color: '#4ade80' },
  ];

  return (
    <div className="notion-page">
      <div className="page-header">
        <h1 className="page-title">운영 현황</h1>
      </div>

      {/* 업무 유형 탭 */}
      <div className="ops-tabs">
        {WORK_TABS.map((t) => (
          <button
            key={t}
            className={`ops-tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 기간 선택 */}
      <div className="ops-period-bar">
        <div className="ops-period-btns">
          {PERIOD_OPTS.map((p) => (
            <button
              key={p}
              className={`ops-period-btn${period === p ? ' active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
        {period === '기간 직접 선택' && (
          <div className="ops-daterange">
            <input
              type="date"
              className="ops-date-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="ops-date-sep">~</span>
            <input
              type="date"
              className="ops-date-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="ops-summary-cards">
        {summaryCards.map((c) => (
          <div key={c.label} className="ops-summary-card">
            <span className="ops-summary-value" style={{ color: c.color }}>
              {minutesFmt(c.value)}
            </span>
            <span className="ops-summary-label">{c.label}</span>
          </div>
        ))}
      </div>

      {/* 업체/기관별 현황 */}
      <div className="ops-section">
        <p className="ops-section-title">업체 / 기관별 현황</p>
        <div className="ops-table-wrap">
          <table className="notion-simple-table ops-table">
            <thead>
              <tr>
                <th>업체 / 기관명</th>
                <th className="text-right">전체 입고</th>
                <th className="text-right">작업자 배정</th>
                <th className="text-right">작업 진행</th>
                <th className="text-right">검수 진행</th>
                <th className="text-right">납품 완료</th>
                <th style={{ minWidth: 120 }}>납품률</th>
              </tr>
            </thead>
            <tbody>
              {orgRows.map((r) => (
                <tr key={r.org}>
                  <td className="ops-org-name">{r.org}</td>
                  <td className="text-right">{r.total.toLocaleString()}분</td>
                  <td className="text-right">{r.assigned.toLocaleString()}분</td>
                  <td className="text-right">{r.inProgress.toLocaleString()}분</td>
                  <td className="text-right">{r.inspecting.toLocaleString()}분</td>
                  <td className="text-right">{r.delivered.toLocaleString()}분</td>
                  <td>
                    <div className="ops-rate-cell">
                      <div className="ops-rate-bar-bg">
                        <div
                          className="ops-rate-bar-fill"
                          style={{ width: `${r.rate}%` }}
                        />
                      </div>
                      <span className="ops-rate-pct">{r.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상세 목록 */}
      <div className="ops-section">
        <p className="ops-section-title">상세 목록</p>
        <div className="ops-table-wrap">
          <table className="notion-simple-table ops-table">
            <thead>
              <tr>
                <th>업체 / 기관명</th>
                <th>프로젝트명</th>
                {tab === '전체'    && <th className="text-center">업무유형</th>}
                {tab === '녹취록'  && <th className="text-center">화자 수</th>}
                {tab === '회의록'  && <th className="text-center">언어</th>}
                {tab === '현장속기' && <th className="text-center">방식</th>}
                {tab === 'VOD'    && <th className="text-center">작업유형</th>}
                <th className="text-right">파일 수</th>
                <th className="text-right">전체 분수</th>
                <th className="text-right">납품 분수</th>
                <th className="text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((r) => (
                <tr key={r.id}>
                  <td className="ops-org-name">{r.org}</td>
                  <td style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{r.title}</td>
                  {tab === '전체'    && <td className="text-center">{r.type}</td>}
                  {tab === '녹취록'  && <td className="text-center">{r.speaker}명</td>}
                  {tab === '회의록'  && <td className="text-center">{r.lang}</td>}
                  {tab === '현장속기' && <td className="text-center">{r.method}</td>}
                  {tab === 'VOD'    && <td className="text-center">{r.type}</td>}
                  <td className="text-right">{r.files}개</td>
                  <td className="text-right">{r.total.toLocaleString()}분</td>
                  <td className="text-right">{r.delivered.toLocaleString()}분</td>
                  <td className="text-center"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
