import { useState } from 'react';
import '../../../../styles/notion-list.css';
import './ManageOperationsPage.css';

// ── 상수 ──────────────────────────────────────────────────────────────────
const WORK_TABS   = ['전체', '녹취록', '회의록', '현장속기', 'VOD', '미디어'];
const PERIOD_OPTS = ['주간', '월간', '연간', '기간 직접 선택'];

// ── 분 → 시간 변환 헬퍼 ──────────────────────────────────────────────────
function toHrsFmt(n) {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return `${h}시간`;
  if (h >= 10) return `약 ${Math.round(n / 60)}시간`;
  return `${h}시간 ${m}분`;
}
function minutesFmt(n) {
  return `${n.toLocaleString()}분 (${toHrsFmt(n)})`;
}
function minCell(n) {
  return `${n.toLocaleString()}분`;
}

// ── 더미 데이터 — 요약 ─────────────────────────────────────────────────────
const SUMMARY_BY_TAB = {
  전체:   { total: 38420, assigned: 34340, inProgress: 29780, inspectAssigned: 25200, inspecting: 21450, delivered: 17830 },
  녹취록:  { total:  9210, assigned:  8900, inProgress:  7820, inspectAssigned:  6870, inspecting:  5620, delivered:  4840 },
  회의록:  { total:  6380, assigned:  5950, inProgress:  5180, inspectAssigned:  4600, inspecting:  3980, delivered:  3210 },
  현장속기: { total:  4170, assigned:  3840, inProgress:  3250, inspectAssigned:  2740, inspecting:  2340, delivered:  1960 },
  VOD:   { total: 12660, assigned: 10350, inProgress:  8930, inspectAssigned:  7990, inspecting:  6710, delivered:  5820 },
  미디어:  { total:  6000, assigned:  5300, inProgress:  4600, inspectAssigned:  3000, inspecting:  2800, delivered:  2000 },
};

// ── 더미 데이터 — 업체/기관별 현황 ──────────────────────────────────────────
const ORG_ROWS_BY_TAB = {
  전체: [
    { org: '영성미디어',         total: 5840, assigned: 5210, inProgress: 4590, inspecting: 3920, delivered: 3240, rate: 55 },
    { org: '법무법인 태평양',     total: 4210, assigned: 3980, inProgress: 3460, inspecting: 2940, delivered: 2520, rate: 60 },
    { org: '강서구교육지원청',    total: 3750, assigned: 3480, inProgress: 2990, inspecting: 2550, delivered: 2140, rate: 57 },
    { org: 'EBS',                total: 3320, assigned: 2960, inProgress: 2580, inspecting: 2210, delivered: 1870, rate: 56 },
    { org: '국회사무처',          total: 3170, assigned: 2840, inProgress: 2450, inspecting: 2050, delivered: 1760, rate: 56 },
    { org: '대검찰청',            total: 2980, assigned: 2670, inProgress: 2370, inspecting: 2010, delivered: 1720, rate: 58 },
    { org: '스톰미디어',          total: 2540, assigned: 2230, inProgress: 1950, inspecting: 1650, delivered: 1360, rate: 54 },
    { org: '한양사이버대학교',     total: 2410, assigned: 2120, inProgress: 1840, inspecting: 1570, delivered: 1310, rate: 54 },
  ],
  녹취록: [
    { org: '법무법인 태평양',   total: 2840, assigned: 2650, inProgress: 2280, inspecting: 1910, delivered: 1640, rate: 58 },
    { org: '대검찰청',         total: 2180, assigned: 1970, inProgress: 1770, inspecting: 1510, delivered: 1290, rate: 59 },
    { org: '국민건강보험공단',  total: 1420, assigned: 1340, inProgress: 1160, inspecting:  980, delivered:  830, rate: 58 },
    { org: '서울중앙지법',      total: 1310, assigned: 1230, inProgress: 1060, inspecting:  890, delivered:  750, rate: 57 },
    { org: '한국전력공사',      total:  820, assigned:  750, inProgress:  640, inspecting:  530, delivered:  450, rate: 55 },
    { org: '금융감독원',        total:  640, assigned:  590, inProgress:  510, inspecting:  430, delivered:  380, rate: 59 },
  ],
  회의록: [
    { org: '강서구교육지원청',      total: 1820, assigned: 1680, inProgress: 1450, inspecting: 1220, delivered: 1040, rate: 57 },
    { org: '강남서초교육지원청',     total: 1540, assigned: 1420, inProgress: 1230, inspecting: 1030, delivered:  870, rate: 57 },
    { org: '서울시교육청',          total: 1260, assigned: 1160, inProgress: 1000, inspecting:  840, delivered:  720, rate: 57 },
    { org: '경기도교육청',          total: 1080, assigned:  990, inProgress:  850, inspecting:  710, delivered:  600, rate: 56 },
    { org: '인천시교육청',          total:  780, assigned:  700, inProgress:  600, inspecting:  490, delivered:  410, rate: 53 },
    { org: '부산광역시교육청',       total:  680, assigned:  610, inProgress:  520, inspecting:  430, delivered:  360, rate: 53 },
    { org: '충청남도교육청',         total:  520, assigned:  460, inProgress:  400, inspecting:  330, delivered:  280, rate: 54 },
  ],
  현장속기: [
    { org: '국회사무처',      total: 2230, assigned: 1920, inProgress: 1650, inspecting: 1380, delivered: 1160, rate: 52 },
    { org: '서울시의회',      total: 1180, assigned: 1010, inProgress:  870, inspecting:  720, delivered:  610, rate: 52 },
    { org: '경기도의회',      total:  910, assigned:  780, inProgress:  670, inspecting:  550, delivered:  460, rate: 51 },
    { org: '인천시의회',      total:  680, assigned:  580, inProgress:  490, inspecting:  400, delivered:  330, rate: 49 },
    { org: '부산시의회',      total:  520, assigned:  440, inProgress:  370, inspecting:  300, delivered:  250, rate: 48 },
    { org: '대전시의회',      total:  390, assigned:  330, inProgress:  280, inspecting:  230, delivered:  190, rate: 49 },
  ],
  VOD: [
    { org: '영성미디어',         total: 4240, assigned: 3810, inProgress: 3290, inspecting: 2870, delivered: 2380, rate: 56 },
    { org: 'EBS',                total: 3320, assigned: 2960, inProgress: 2580, inspecting: 2210, delivered: 1870, rate: 56 },
    { org: '스톰미디어',          total: 2540, assigned: 2230, inProgress: 1950, inspecting: 1650, delivered: 1360, rate: 54 },
    { org: '한양사이버대학교',     total: 2410, assigned: 2120, inProgress: 1840, inspecting: 1570, delivered: 1310, rate: 54 },
    { org: '한국열린사이버대학교', total: 1980, assigned: 1730, inProgress: 1490, inspecting: 1260, delivered: 1040, rate: 53 },
    { org: '에듀콥',             total: 1620, assigned: 1410, inProgress: 1210, inspecting: 1010, delivered:  830, rate: 51 },
  ],
  미디어: [
    { org: '미디어로그',   total: 2640, assigned: 2340, inProgress: 2040, inspecting: 1340, delivered: 1040, rate: 39 },
    { org: 'CGN',        total: 1960, assigned: 1740, inProgress: 1520, inspecting:  940, delivered:  680, rate: 35 },
    { org: '서울시 유튜브', total: 1400, assigned: 1220, inProgress: 1040, inspecting:  720, delivered:  580, rate: 41 },
  ],
};

// ── 더미 데이터 — 상세 목록 ──────────────────────────────────────────────
const DETAIL_ROWS_BY_TAB = {
  전체: [
    { id: 1, org: '영성미디어',      title: '지구과학개론 1학기 강의 자막',           type: 'VOD',    total: 1240, assigned: 1100, inProgress: 940, inspectAssigned: 780, inspecting: 640, delivered: 520, status: '작업 중' },
    { id: 2, org: '법무법인 태평양',  title: '2026 민사소송 녹취본',                  type: '녹취록',  total:  560, assigned:  510, inProgress: 460, inspectAssigned: 390, inspecting: 330, delivered: 270, status: '검수 중' },
    { id: 3, org: '강서구교육지원청', title: '학교폭력대책심의위원회',                  type: '회의록',  total:  420, assigned:  420, inProgress: 360, inspectAssigned: 300, inspecting: 240, delivered: 180, status: '작업 중' },
    { id: 4, org: '국회사무처',       title: '22대 국회 본회의',                      type: '현장속기', total: 720, assigned:  620, inProgress: 530, inspectAssigned: 440, inspecting: 360, delivered: 290, status: '검수 중' },
    { id: 5, org: 'EBS',             title: '기초영어회화 1주차 강의 자막',            type: 'VOD',    total:  840, assigned:  740, inProgress: 630, inspectAssigned: 520, inspecting: 420, delivered: 320, status: '납품완료' },
    { id: 6, org: '미디어로그',       title: 'U+오리지널 시리즈 SDH 자막',            type: '미디어',  total:  680, assigned:  610, inProgress: 530, inspectAssigned: 350, inspecting: 290, delivered: 210, status: '작업 중' },
    { id: 7, org: '대검찰청',         title: '특수부 2026 조사 녹취록',               type: '녹취록',  total:  490, assigned:  440, inProgress: 390, inspectAssigned: 330, inspecting: 270, delivered: 210, status: '작업 중' },
    { id: 8, org: '서울시의회',       title: '2026년 상반기 정례회',                  type: '현장속기', total: 580, assigned:  500, inProgress: 420, inspectAssigned: 350, inspecting: 280, delivered: 230, status: '납품완료' },
  ],
  녹취록: [
    { id: 1, org: '법무법인 태평양',  title: '2026 민사소송 녹취본',      files: 120, speaker: 8,  total: 560, assigned: 510, inProgress: 460, inspectAssigned: 390, inspecting: 330, delivered: 270, status: '검수 중' },
    { id: 2, org: '대검찰청',         title: '특수부 2026 조사 녹취록',   files:  95, speaker: 5,  total: 490, assigned: 440, inProgress: 390, inspectAssigned: 330, inspecting: 270, delivered: 210, status: '작업 중' },
    { id: 3, org: '국민건강보험공단', title: '2026 정책회의 녹취본',       files:  42, speaker: 4,  total: 290, assigned: 260, inProgress: 220, inspectAssigned: 180, inspecting: 150, delivered: 120, status: '검수 중' },
    { id: 4, org: '서울중앙지법',     title: '민사 1부 2026 심리',        files:  60, speaker: 6,  total: 340, assigned: 310, inProgress: 270, inspectAssigned: 230, inspecting: 190, delivered: 160, status: '납품완료' },
    { id: 5, org: '한국전력공사',     title: '2026 이사회 녹취본',        files:  18, speaker: 3,  total: 160, assigned: 140, inProgress: 120, inspectAssigned: 100, inspecting:  80, delivered:  60, status: '작업 중' },
    { id: 6, org: '금융감독원',       title: '내부감사위원회 녹취록',      files:  25, speaker: 4,  total: 200, assigned: 180, inProgress: 155, inspectAssigned: 130, inspecting: 105, delivered:  80, status: '작업 중' },
  ],
  회의록: [
    { id: 1, org: '강서구교육지원청',   meeting: '학교폭력대책심의위원회', date: '2026-06-12', total: 420, assigned: 420, inProgress: 360, inspectAssigned: 300, inspecting: 240, delivered: 180, status: '작업 중' },
    { id: 2, org: '강남서초교육지원청', meeting: '교권보호위원회',         date: '2026-06-14', total: 260, assigned: 260, inProgress: 260, inspectAssigned: 200, inspecting: 180, delivered: 120, status: '검수 중' },
    { id: 3, org: '서울시교육청',       meeting: '인사위원회',             date: '2026-06-18', total: 180, assigned: 180, inProgress: 160, inspectAssigned: 120, inspecting: 120, delivered: 120, status: '납품완료' },
    { id: 4, org: '경기도교육청',       meeting: '학교폭력대책심의위원회', date: '2026-06-20', total: 340, assigned: 310, inProgress: 280, inspectAssigned: 240, inspecting: 200, delivered: 160, status: '검수 중' },
    { id: 5, org: '인천시교육청',       meeting: '교육과정심의위원회',     date: '2026-06-22', total: 200, assigned: 180, inProgress: 160, inspectAssigned: 130, inspecting: 110, delivered:  90, status: '작업 중' },
    { id: 6, org: '부산광역시교육청',   meeting: '교권보호위원회',         date: '2026-06-23', total: 240, assigned: 220, inProgress: 190, inspectAssigned: 160, inspecting: 130, delivered: 100, status: '작업 중' },
    { id: 7, org: '충청남도교육청',     meeting: '학교폭력대책심의위원회', date: '2026-06-25', total: 160, assigned: 140, inProgress: 120, inspectAssigned: 100, inspecting:  80, delivered:  60, status: '작업 중' },
  ],
  현장속기: [
    { id: 1, org: '국회사무처',  title: '22대 국회 본회의',      date: '2026-06-11', place: '국회의사당',   workers: 4, hours: '9:00~18:00', total: 720, assigned: 620, inProgress: 530, inspectAssigned: 440, inspecting: 360, delivered: 290, status: '검수 중' },
    { id: 2, org: '서울시의회',  title: '2026년 상반기 정례회',  date: '2026-06-13', place: '서울시의회',   workers: 2, hours: '10:00~17:00', total: 580, assigned: 500, inProgress: 420, inspectAssigned: 350, inspecting: 280, delivered: 230, status: '납품완료' },
    { id: 3, org: '경기도의회',  title: '6월 임시회',            date: '2026-06-17', place: '경기도의회',   workers: 2, hours: '10:00~16:00', total: 420, assigned: 360, inProgress: 300, inspectAssigned: 250, inspecting: 200, delivered: 160, status: '작업 중' },
    { id: 4, org: '인천시의회',  title: '인천시의회 6월 본회의', date: '2026-06-19', place: '인천시의회',   workers: 2, hours: '10:00~15:00', total: 340, assigned: 290, inProgress: 240, inspectAssigned: 200, inspecting: 160, delivered: 130, status: '작업 중' },
    { id: 5, org: '부산시의회',  title: '부산광역시의회 임시회', date: '2026-06-21', place: '부산시의회',   workers: 2, hours: '10:00~15:00', total: 280, assigned: 240, inProgress: 200, inspectAssigned: 160, inspecting: 130, delivered: 100, status: '납품완료' },
    { id: 6, org: '대전시의회',  title: '대전광역시의회 정례회', date: '2026-06-24', place: '대전시의회',   workers: 1, hours: '10:00~14:00', total: 200, assigned: 170, inProgress: 140, inspectAssigned: 110, inspecting:  90, delivered:  70, status: '작업 중' },
  ],
  VOD: [
    { id: 1, org: '영성미디어',        title: '지구과학개론 1학기 강의 자막',         round: '1~8주차',  total: 1240, assigned: 1100, inProgress: 940, inspectAssigned: 780, inspecting: 640, delivered: 520, status: '작업 중' },
    { id: 2, org: 'EBS',               title: '기초영어회화 1주차 강의 자막',         round: '1~4주차',  total:  840, assigned:  740, inProgress: 630, inspectAssigned: 520, inspecting: 420, delivered: 320, status: '납품완료' },
    { id: 3, org: '스톰미디어',         title: '국립공주대학교 자율주행영상처리 및 딥러닝', round: '1차',  total:  720, assigned:  630, inProgress: 540, inspectAssigned: 440, inspecting: 360, delivered: 280, status: '검수 중' },
    { id: 4, org: '한양사이버대학교',   title: '한양사이버대학교 세계도시건축',        round: '2차',  total:  640, assigned:  560, inProgress: 480, inspectAssigned: 400, inspecting: 330, delivered: 260, status: '작업 중' },
    { id: 5, org: '한국열린사이버대학교', title: 'KAMC 감염병과 인류',               round: '1차',  total:  560, assigned:  490, inProgress: 420, inspectAssigned: 350, inspecting: 280, delivered: 210, status: '검수 중' },
    { id: 6, org: '에듀콥',            title: '에듀콥 직무교육 콘텐츠',              round: '3차',  total:  480, assigned:  420, inProgress: 360, inspectAssigned: 300, inspecting: 240, delivered: 180, status: '작업 중' },
  ],
  미디어: [
    { id: 1, org: '미디어로그',   title: 'U+오리지널 시리즈 SDH 자막',          contentType: 'OTT 드라마',  episode: '1~6화',    total: 680, assigned: 610, inProgress: 530, inspectAssigned: 350, inspecting: 290, delivered: 210, status: '작업 중' },
    { id: 2, org: '미디어로그',   title: '공감세포 국문 제작',                   contentType: 'OTT 드라마',  episode: '7~12화',   total: 620, assigned: 550, inProgress: 480, inspectAssigned: 320, inspecting: 270, delivered: 190, status: '검수 중' },
    { id: 3, org: 'CGN',         title: 'CGN 콘텐츠 영문 번역 자막',           contentType: '방송',        episode: '1~8편',    total: 540, assigned: 480, inProgress: 420, inspectAssigned: 270, inspecting: 230, delivered: 170, status: '작업 중' },
    { id: 4, org: 'CGN',         title: '퍼스트러브 국문 제작',                 contentType: '방송',        episode: '9~16편',   total: 480, assigned: 430, inProgress: 370, inspectAssigned: 240, inspecting: 200, delivered: 140, status: '납품완료' },
    { id: 5, org: '서울시 유튜브', title: '서울시 유튜브 배리어프리 국문 자막', contentType: '유튜브/홍보', episode: '25~36편',  total: 420, assigned: 370, inProgress: 320, inspectAssigned: 210, inspecting: 180, delivered: 140, status: '검수 중' },
    { id: 6, org: '서울시 유튜브', title: '서울시 유튜브 배리어프리 국문 자막', contentType: '유튜브/홍보', episode: '37~48편',  total: 360, assigned: 310, inProgress: 270, inspectAssigned: 180, inspecting: 150, delivered: 100, status: '작업 중' },
  ],
};

function StatusBadge({ status }) {
  const cls = status === '납품완료' ? 'ops-badge-done'
            : status === '검수 중'  ? 'ops-badge-inspect'
            : 'ops-badge-working';
  return <span className={`ops-status-badge ${cls}`}>{status}</span>;
}

// ── 상세 목록 테이블 헤더/셀 렌더 (탭별 분기) ──────────────────────────────
function DetailTableHead({ tab }) {
  const commonCols = (
    <>
      <th className="text-right">전체 분수</th>
      <th className="text-right">작업자 배정</th>
      <th className="text-right">작업 진행</th>
      <th className="text-right">검수자 배정</th>
      <th className="text-right">검수 진행</th>
      <th className="text-right">납품 완료</th>
      <th className="text-center">상태</th>
    </>
  );
  if (tab === '전체') return (
    <tr>
      <th>업체 / 기관명</th><th>프로젝트 / 회의명</th>
      <th className="text-center">업무유형</th>
      {commonCols}
    </tr>
  );
  if (tab === '녹취록') return (
    <tr>
      <th>업체명</th><th>녹취 건명</th>
      <th className="text-center">화자 수</th>
      <th className="text-right">파일 수</th>
      {commonCols}
    </tr>
  );
  if (tab === '회의록') return (
    <tr>
      <th>기관명</th><th>회의명</th>
      <th className="text-center">회의일</th>
      {commonCols}
    </tr>
  );
  if (tab === '현장속기') return (
    <tr>
      <th>기관명</th><th>일정명</th>
      <th className="text-center">진행일</th>
      <th>장소</th>
      <th className="text-center">배정 인원</th>
      <th>작업 시간</th>
      {commonCols}
    </tr>
  );
  if (tab === 'VOD') return (
    <tr>
      <th>업체명</th><th>프로젝트명</th>
      <th className="text-center">차수 / 주차</th>
      {commonCols}
    </tr>
  );
  if (tab === '미디어') return (
    <tr>
      <th>업체명</th><th>프로젝트명</th>
      <th className="text-center">콘텐츠 유형</th>
      <th className="text-center">파일 / 회차</th>
      {commonCols}
    </tr>
  );
  return null;
}

function DetailTableRow({ tab, r }) {
  const minCols = (
    <>
      <td className="text-right ops-min-cell">{minutesFmt(r.total)}</td>
      <td className="text-right">{minCell(r.assigned)}</td>
      <td className="text-right">{minCell(r.inProgress)}</td>
      <td className="text-right">{minCell(r.inspectAssigned)}</td>
      <td className="text-right">{minCell(r.inspecting)}</td>
      <td className="text-right">{minCell(r.delivered)}</td>
      <td className="text-center"><StatusBadge status={r.status} /></td>
    </>
  );
  if (tab === '전체') return (
    <tr key={r.id}>
      <td className="ops-org-name">{r.org}</td>
      <td className="ops-title-cell">{r.title}</td>
      <td className="text-center"><span className="ops-type-chip">{r.type}</span></td>
      {minCols}
    </tr>
  );
  if (tab === '녹취록') return (
    <tr key={r.id}>
      <td className="ops-org-name">{r.org}</td>
      <td className="ops-title-cell">{r.title}</td>
      <td className="text-center">{r.speaker}명</td>
      <td className="text-right">{r.files}개</td>
      {minCols}
    </tr>
  );
  if (tab === '회의록') return (
    <tr key={r.id}>
      <td className="ops-org-name">{r.org}</td>
      <td className="ops-title-cell">{r.meeting}</td>
      <td className="text-center ops-date-cell">{r.date}</td>
      {minCols}
    </tr>
  );
  if (tab === '현장속기') return (
    <tr key={r.id}>
      <td className="ops-org-name">{r.org}</td>
      <td className="ops-title-cell">{r.title}</td>
      <td className="text-center ops-date-cell">{r.date}</td>
      <td>{r.place}</td>
      <td className="text-center">{r.workers}명</td>
      <td className="ops-hours-cell">{r.hours}</td>
      {minCols}
    </tr>
  );
  if (tab === 'VOD') return (
    <tr key={r.id}>
      <td className="ops-org-name">{r.org}</td>
      <td className="ops-title-cell">{r.title}</td>
      <td className="text-center">{r.round}</td>
      {minCols}
    </tr>
  );
  if (tab === '미디어') return (
    <tr key={r.id}>
      <td className="ops-org-name">{r.org}</td>
      <td className="ops-title-cell">{r.title}</td>
      <td className="text-center"><span className="ops-type-chip">{r.contentType}</span></td>
      <td className="text-center">{r.episode}</td>
      {minCols}
    </tr>
  );
  return null;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function ManageOperationsPage() {
  const [tab, setTab]       = useState('전체');
  const [period, setPeriod] = useState('월간');
  const [dateFrom, setDateFrom] = useState('2026-06-01');
  const [dateTo,   setDateTo]   = useState('2026-06-30');

  const summary    = SUMMARY_BY_TAB[tab];
  const orgRows    = ORG_ROWS_BY_TAB[tab];
  const detailRows = DETAIL_ROWS_BY_TAB[tab];

  const summaryCards = [
    { label: '전체 입고 분수',   value: summary.total,           color: 'var(--text-primary)' },
    { label: '작업자 배정 분수', value: summary.assigned,        color: '#60a5fa' },
    { label: '작업 진행 분수',   value: summary.inProgress,      color: '#34d399' },
    { label: '검수자 배정 분수', value: summary.inspectAssigned, color: '#a78bfa' },
    { label: '검수 진행 분수',   value: summary.inspecting,      color: '#fbbf24' },
    { label: '납품 완료 분수',   value: summary.delivered,       color: '#4ade80' },
  ];

  return (
    <div className="notion-page ops-page">
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
              {c.value.toLocaleString()}분
            </span>
            <span className="ops-summary-sub">({toHrsFmt(c.value)})</span>
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
                <th style={{ minWidth: 130 }}>납품률</th>
              </tr>
            </thead>
            <tbody>
              {orgRows.map((r) => (
                <tr key={r.org}>
                  <td className="ops-org-name">{r.org}</td>
                  <td className="text-right ops-min-cell">{minutesFmt(r.total)}</td>
                  <td className="text-right">{minCell(r.assigned)}</td>
                  <td className="text-right">{minCell(r.inProgress)}</td>
                  <td className="text-right">{minCell(r.inspecting)}</td>
                  <td className="text-right">{minCell(r.delivered)}</td>
                  <td>
                    <div className="ops-rate-cell">
                      <div className="ops-rate-bar-bg">
                        <div className="ops-rate-bar-fill" style={{ width: `${r.rate}%` }} />
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
              <DetailTableHead tab={tab} />
            </thead>
            <tbody>
              {detailRows.map((r) => (
                <DetailTableRow key={r.id} tab={tab} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
