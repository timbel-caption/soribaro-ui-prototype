// 회의록/현장속기 작업관리 목록 화면의 엑셀 다운로드. exceljs 로 .xlsx 생성.
import { calcCompanySettlement, fmtHM } from '../pages/soribaro/enterprise/proto/companySettlementCalc';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// 의뢰일자(YYYY-MM-DD ...) → "6.16(금)" 형식
function formatReqDate(regDttm) {
  if (!regDttm) return '';
  const datePart = regDttm.slice(0, 10);
  const d = new Date(datePart);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}.${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}

// 업체명이 "대구남부"인 경우에만 의뢰시간 출력, 그 외 업체는 공란
function buildReqTime(s) {
  return s.entNm === '대구남부' ? (s.totalPlayTm || '') : '';
}

// 업체명이 "대구달성"인 경우에만 실제 납품일 출력, 그 외 업체는 공란
function buildActualDeliveryDate(s) {
  return s.entNm === '대구달성' ? (s.actualDeliveryDate || '') : '';
}

const MEETING_COLUMNS = [
  { header: '일자', width: 12 },
  { header: '업체명', width: 18 },
  { header: '회차', width: 8 },
  { header: '산정시간', width: 10 },
  { header: '공급가액', width: 14 },
  { header: '세액', width: 12 },
  { header: '현장여부', width: 10 },
  { header: '계약구분', width: 12 },
  { header: '의뢰시간', width: 12 },
  { header: '실제 납품일', width: 14 },
];

const STENOGRAPHY_COLUMNS = MEETING_COLUMNS.slice(0, 8);

function buildRow(s, siteYn) {
  const { calcMin, totalSupply, totalTax, noData } = calcCompanySettlement(s);
  return [
    formatReqDate(s.regDttm),
    s.entNm || '',
    s.round ?? '',
    noData ? '' : fmtHM(calcMin),
    noData ? '' : totalSupply,
    noData ? '' : totalTax,
    siteYn,
    s.contractType || '',
  ];
}

export async function downloadMeetingWorkExcel(samples, filename = '회의록_작업관리.xlsx') {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SoriBaro Editor';
  wb.created = new Date();

  const ws = wb.addWorksheet('회의록 작업관리');
  MEETING_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const headerRow = ws.addRow(MEETING_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FF111827' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  samples.forEach((s) => {
    ws.addRow([...buildRow(s, '파일'), buildReqTime(s), buildActualDeliveryDate(s)]);
  });

  await downloadWorkbook(wb, filename);
}

export async function downloadStenographyWorkExcel(samples, filename = '현장속기_작업관리.xlsx') {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SoriBaro Editor';
  wb.created = new Date();

  const ws = wb.addWorksheet('현장속기 작업관리');
  STENOGRAPHY_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const headerRow = ws.addRow(STENOGRAPHY_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FF111827' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  samples.forEach((s) => {
    ws.addRow(buildRow(s, '현장'));
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
