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

// 'H:MM' 형식 시간을 'HH:MM:SS'로 맞춘다(초 단위 없는 값 00초로 보정) — WorkDetailProto.jsx toHmsDisplay와 동일
function toHmsDisplay(workTime) {
  const parts = (workTime || '').split(':');
  if (parts.length >= 3) return workTime;
  const [h, m] = parts;
  return `${String(Number(h) || 0).padStart(2, '0')}:${String(Number(m) || 0).padStart(2, '0')}:00`;
}

// 정산확인 탭의 "작업자 정산 내역" 워커 목록(이름+작업시간) — WorkDetailProto.jsx MtgSettlementTab 초기 상태 계산과 동일한 로직
function getSettlementWorkerRows(s) {
  const isRecordingSettle = s.bssTypeName === '녹취록';
  // MtgSettlementTab과 동일하게 회의록/현장속기는 모두 회의록 샘플 저장소를 기준으로 subjects를 조회한다.
  const store = isRecordingSettle ? getRecordingSamples() : getMeetingSamples();
  const subjects = store.find((v) => v.id === s.id)?.subjects || [];
  return SETTLE_WORKER_SEED.map((r) => {
    const proj = subjects.find((p) => p.worker === r.worker);
    const workTime = isRecordingSettle
      ? (proj ? secToHms(sumWorkTimeSec(proj.projFiles)) : toHmsDisplay(r.workTime))
      : (proj?.workTime ?? r.workTime);
    return { worker: r.worker, workTime };
  });
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
  return workerRows.map((wr, i) => {
    if (i === 0) {
      return [
        formatReqDate(s.regDttm),
        s.entNm || '',
        s.contractType || '',
        s.round ?? '',
        reviewerNm || '',
        wr.workTime,
        wr.worker,
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
    }
    return ['', '', '', '', '', wr.workTime, wr.worker, '', '', '', '', '', '', '', '', '', ''];
  });
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
