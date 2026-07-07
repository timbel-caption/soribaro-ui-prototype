// 업체정산(견적) 계산 로직 — WorkDetailProto.jsx 의 CompanySettlementTab 및
// 목록 화면 엑셀 다운로드에서 공통으로 사용한다.
import { getCompanyQuoteSettingsByType } from './enterpriseProtoData';

export function parseMinutes(tm) {
  if (!tm || tm === '-') return 0;
  const parts = tm.split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export function fmtHM(m) {
  if (!m && m !== 0) return '-';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(1, '0')}:${String(min).padStart(2, '0')}`;
}

// s: 목록/상세에서 쓰는 sample 객체 (entNm, bssTypeName, contractType, totalPlayTm 사용)
//
// 단가/n시간 이후 단가는 원/시간 기준이며, 기본단위는 최소 산정 시간(계산 기준 아님)으로만 쓰인다.
// n시간 이후 단가가 입력된 업체만 기본 단가 적용(분)을 기준으로 구간별 단가를 나눠 계산하고,
// 미입력이면 작업시간 전체에 단가(원/시간)를 적용한다. 계산서 발행 형태는 세액 처리 방식만 결정한다.
export function calcCompanySettlement(s) {
  const qs = getCompanyQuoteSettingsByType(s.entNm, s.bssTypeName, s.contractType);
  const { invoiceType, unitPrice, baseUnit, roundUnit, overtimePrice, baseRateHours } = qs;

  const totalMin = parseMinutes(s.totalPlayTm);
  const calcMin = totalMin === 0 ? 0 : Math.max(baseUnit, Math.ceil(totalMin / roundUnit) * roundUnit);

  let baseSupply = 0, baseTax = 0;
  let extraSupply = 0, extraTax = 0, extraMin = 0;
  let totalSupply = 0, totalTax = 0;

  const hasOvertime = !!overtimePrice;

  // 구간별(기본/n시간 이후) 세전 금액 산정 — 시간당 단가 × (산정시간 ÷ 60분)
  let basePay = 0, extraPay = 0;
  if (hasOvertime) {
    const baseTimeMin = baseRateHours || 0;
    const baseCalcMin = Math.max(baseUnit, Math.ceil(Math.min(calcMin, baseTimeMin) / roundUnit) * roundUnit);
    basePay = unitPrice * (baseCalcMin / 60);
    if (calcMin > baseTimeMin) {
      extraMin = calcMin - baseTimeMin;
      extraPay = overtimePrice * (extraMin / 60);
    }
  } else {
    basePay = unitPrice * (calcMin / 60);
  }

  // 계산서 발행 형태별 세액 처리
  if (invoiceType === '계약업체') {
    baseSupply = Math.round(basePay / 1.1);
    baseTax = basePay - baseSupply;
    extraSupply = Math.round(extraPay / 1.1);
    extraTax = extraPay - extraSupply;
  } else if (invoiceType === '세금계산서') {
    baseSupply = basePay;
    baseTax = Math.round(baseSupply * 0.1);
    extraSupply = extraPay;
    extraTax = Math.round(extraSupply * 0.1);
  } else if (invoiceType === '일반계산서') {
    baseSupply = basePay;
    baseTax = 0;
    extraSupply = extraPay;
    extraTax = 0;
  }
  totalSupply = baseSupply + extraSupply;
  totalTax = baseTax + extraTax;

  const noData = totalMin === 0;

  return { calcMin, totalSupply, totalTax, noData };
}
