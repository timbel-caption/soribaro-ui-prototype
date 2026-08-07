// 회의록/현장속기/녹취록 작업관리 목록 화면의 엑셀 다운로드. exceljs 로 .xlsx 생성.
import { calcCompanySettlement, fmtHM } from '../pages/soribaro/enterprise/proto/companySettlementCalc';
import { getCompanyQuoteSettingsByType } from '../pages/soribaro/enterprise/proto/enterpriseProtoData';
import { getMeetingSamples, getRecordingSamples, getStenographySamples } from '../pages/soribaro/enterprise/proto/protoStore';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// 의뢰일자(YYYY-MM-DD ...) → "6.16(금)" 형식
function formatReqDate(regDttm) {
  if (!regDttm) return '';
  const datePart = regDttm.slice(0, 10);
  const d = new Date(datePart);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}.${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}

// 상세보기 > 프로젝트 관리에 등록된 프로젝트들의 작업자를 조회 (중복 제거, 쉼표로 나열)
// — 진행의뢰현황 목록의 "작업자" 셀(MeetingListDashboard.jsx getProjectWorkers)과 동일한 로직
function getProjectWorkers(s) {
  const store = s.bssTypeName === '현장속기' ? getStenographySamples() : s.bssTypeName === '녹취록' ? getRecordingSamples() : getMeetingSamples();
  const subjects = store.find((v) => v.id === s.id)?.subjects || [];
  const workers = [...new Set(subjects.map((p) => p.worker).filter(Boolean))];
  return workers.join(', ');
}

// 정산확인 탭 "작업자 정산 내역"의 기본 시드 — WorkDetailProto.jsx MtgSettlementTab과 동일한 더미 데이터
const SETTLE_WORKER_SEED = [
  { worker: '홍길동', workTime: '00:00' },
  { worker: '김나리', workTime: '00:00' },
];

function sumWorkTimeSec(projFiles) {
  return (projFiles || []).reduce((acc, f) => {
    const parts = (f.workTime || '').split(':').map(Number);
    if (parts.length === 3) return acc + parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return acc + parts[0] * 60 + parts[1];
    return acc;
  }, 0);
}

function secToHms(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

// 프로젝트 관리 탭에 등록된 프로젝트(subjects)가 아직 없을 때 정산확인에 표시되는 기본 프로젝트
// — WorkDetailProto.jsx getDefaultProjects()와 동일(엑셀에는 이름·작업시간만 필요)
function getDefaultProjects(bssTypeName) {
  if (bssTypeName !== '회의록' && bssTypeName !== '녹취록') return [];
  const isRec = bssTypeName === '녹취록';
  return [
    { worker: isRec ? '오세훈' : '홍길동', workTime: '1:00' },
    { worker: isRec ? '문가은' : '김나리', workTime: '0:58' },
  ];
}

// 정산확인 탭의 "작업자 정산 내역" 워커 목록(이름+작업시간) — WorkDetailProto.jsx MtgSettlementTab 초기 상태 계산과 동일한 로직
function getSettlementWorkerRows(s) {
  const isRecordingSettle = s.bssTypeName === '녹취록';
  const isStenography = s.bssTypeName === '현장속기';
  if (isStenography) {
    // 현장속기는 배정 관리에서 작업자 1명만 배정하므로 정산확인도 1명만 표시한다.
    return [{ worker: SETTLE_WORKER_SEED[0].worker, workTime: SETTLE_WORKER_SEED[0].workTime }];
  }
  const store = isRecordingSettle ? getRecordingSamples() : getMeetingSamples();
  const cur = store.find((v) => v.id === s.id);
  // subjects가 저장된 적 없으면(프로젝트 관리를 아직 방문하지 않은 샘플) 기본 프로젝트를, 저장돼 있으면(빈 배열 포함) 그 값을 그대로 따른다.
  const subjects = cur?.subjects !== undefined ? cur.subjects : getDefaultProjects(s.bssTypeName);
  if (isRecordingSettle) {
    // 녹취록: 프로젝트 관리에 배정된 작업자 기준으로 작업자별 작업시간을 합산한다(동일 작업자가 여러 프로젝트에 배정된 경우 합산).
    const secByWorker = new Map();
    subjects.forEach((proj) => {
      if (!proj.worker) return;
      secByWorker.set(proj.worker, (secByWorker.get(proj.worker) || 0) + sumWorkTimeSec(proj.projFiles));
    });
    return [...secByWorker.entries()].map(([worker, sec]) => ({ worker, workTime: secToHms(sec) }));
  }
  // 회의록: 프로젝트 관리에 등록된 프로젝트(작업자 배정 내역)를 그대로 사용한다.
  return subjects.map((proj) => ({ worker: proj.worker || '-', workTime: proj.workTime || '' }));
}

// 상세보기 > 업체정산 견적 계산 결과 — CompanySettlementTab과 동일한 소스(getCompanyQuoteSettingsByType + calcCompanySettlement)를 사용한다.
function getCompanyQuoteRow(s) {
  const { invoiceType, unitPrice, baseUnit, roundUnit } = getCompanyQuoteSettingsByType(s.entNm, s.bssTypeName, s.contractType);
  const { calcMin, totalSupply, totalTax, noData } = calcCompanySettlement(s);
  return {
    invoiceType,
    unitPrice,
    baseUnit,
    roundUnit,
    calcTime: noData ? '' : fmtHM(calcMin),
    totalSupply: noData ? '' : totalSupply,
    totalTax: noData ? '' : totalTax,
    total: noData ? '' : totalSupply + totalTax,
  };
}

const MTG_STG_COLUMNS = [
  { header: '의뢰일자', width: 12 },
  { header: '업체명', width: 18 },
  { header: '계약구분', width: 12 },
  { header: '회차', width: 8 },
  { header: '검수자', width: 12 },
  { header: '작업시간', width: 10 },
  { header: '작업자', width: 12 },
  { header: '의뢰시간', width: 12 },
  { header: '계산서 발행', width: 12 },
  { header: '단가', width: 10 },
  { header: '기본단위', width: 10 },
  { header: '올림단위', width: 10 },
  { header: '산정시간', width: 10 },
  { header: '공급가액합계', width: 14 },
  { header: '세액합계', width: 12 },
  { header: '총합', width: 14 },
  { header: '실제 납품일', width: 14 },
];

// 회의록/현장속기 공용 — 작업자 정산 내역(정산확인) 행 수만큼 엑셀 행을 만든다.
// 첫 번째 작업자는 의뢰정보·업체정산 정보를 모두 포함한 기본 행, 추가 작업자는 작업시간·작업자만 채운 행으로 분리한다.
function buildMtgStgRows(s, reviewerNm) {
  const quote = getCompanyQuoteRow(s);
  const workerRows = getSettlementWorkerRows(s);
  const baseRow = (wr) => [
    formatReqDate(s.regDttm),
    s.entNm || '',
    s.contractType || '',
    s.round ?? '',
    reviewerNm || '',
    wr?.workTime || '',
    wr?.worker || '',
    s.totalPlayTm || '',
    quote.invoiceType || '',
    quote.unitPrice ?? '',
    quote.baseUnit ?? '',
    quote.roundUnit ?? '',
    quote.calcTime,
    quote.totalSupply,
    quote.totalTax,
    quote.total,
    s.actualDeliveryDate || '',
  ];
  // 프로젝트 관리에 등록된 작업자가 없는 경우(정산확인 작업자 목록이 비어 있음)에도 의뢰 정보는 한 행으로 남긴다.
  if (workerRows.length === 0) return [baseRow(null)];
  return workerRows.map((wr, i) => (
    i === 0 ? baseRow(wr) : ['', '', '', '', '', wr.workTime, wr.worker, '', '', '', '', '', '', '', '', '', '']
  ));
}

export async function downloadMeetingWorkExcel(samples, filename = '회의록_작업관리.xlsx') {
  await downloadMtgStgWorkbook(samples, '회의록 작업관리', filename);
}

export async function downloadStenographyWorkExcel(samples, filename = '현장속기_작업관리.xlsx') {
  await downloadMtgStgWorkbook(samples, '현장속기 작업관리', filename);
}

async function downloadMtgStgWorkbook(samples, sheetName, filename) {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SoriBaro Editor';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);
  MTG_STG_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const headerRow = ws.addRow(MTG_STG_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FF111827' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  samples.forEach((s) => {
    buildMtgStgRows(s, s._reviewerNm).forEach((row) => ws.addRow(row));
  });

  await downloadWorkbook(wb, filename);
}

const RECORDING_COLUMNS = [
  { header: '의뢰일자', width: 12 },
  { header: '의뢰자', width: 14 },
  { header: '연락처', width: 14 },
  { header: '계약구분', width: 12 },
  { header: '의뢰시간', width: 12 },
  { header: '확정금액', width: 12 },
  { header: '검수자', width: 12 },
  { header: '작업시간', width: 12 },
  { header: '작업자', width: 12 },
  { header: '현금영수증/계산서 발급', width: 18 },
  { header: '입금날짜', width: 12 },
  { header: '결제유형', width: 12 },
];

export async function downloadRecordingWorkExcel(samples, filename = '녹취록_작업관리.xlsx') {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SoriBaro Editor';
  wb.created = new Date();

  const ws = wb.addWorksheet('녹취록 작업관리');
  RECORDING_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const headerRow = ws.addRow(RECORDING_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FF111827' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  samples.forEach((s) => {
    const settleWorkTime = getSettlementWorkerRows(s)[0]?.workTime || '';
    ws.addRow([
      formatReqDate(s.regDttm),
      s.membNm || '',
      s.phone || '',
      s.contractType || '',
      s.totalPlayTm || '',
      s.fixPrice ?? '',
      s._reviewerNm || '',
      settleWorkTime,
      getProjectWorkers(s),
      s.receiptIssued || '',
      s.depositDate || '',
      s.paymentType || '',
    ]);
  });

  await downloadWorkbook(wb, filename);
}

const STENOGRAPHY_SETTLEMENT_COLUMNS = [
  { header: '작업자', width: 14 },
  { header: '등급', width: 10 },
  { header: '작업시간', width: 12 },
  { header: '정산금액', width: 14 },
  { header: '출장비', width: 12 },
  { header: '실지급액', width: 14 },
];

// 현장속기 정산관리 엑셀 다운로드 — 동일 작업자가 여러 건을 수행한 경우 작업시간/정산금액/출장비/실지급액을 합산해 작업자별 1행으로 출력한다.
function aggregateByWorker(rows) {
  const byWorker = new Map();
  rows.forEach((r) => {
    const acc = byWorker.get(r.worker) || { worker: r.worker, grade: r.grade, workHours: 0, settlementAmount: 0, travelFee: 0, netAmount: 0 };
    acc.workHours += r.workHours || 0;
    acc.settlementAmount += r.settlementAmount || 0;
    acc.travelFee += r.travelFee || 0;
    acc.netAmount += r.netAmount || 0;
    byWorker.set(r.worker, acc);
  });
  return [...byWorker.values()];
}

export async function downloadStenographySettlementExcel(rows, filename = '현장속기_정산관리.xlsx') {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SoriBaro Editor';
  wb.created = new Date();

  const ws = wb.addWorksheet('현장속기 정산관리');
  STENOGRAPHY_SETTLEMENT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const headerRow = ws.addRow(STENOGRAPHY_SETTLEMENT_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FF111827' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  aggregateByWorker(rows).forEach((r) => {
    ws.addRow([r.worker, r.grade, r.workHours, r.settlementAmount, r.travelFee, r.netAmount]);
  });

  await downloadWorkbook(wb, filename);
}

async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
