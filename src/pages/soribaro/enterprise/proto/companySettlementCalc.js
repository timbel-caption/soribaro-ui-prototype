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
export function calcCompanySettlement(s) {
  const qs = getCompanyQuoteSettingsByType(s.entNm, s.bssTypeName, s.contractType);
  const { invoiceType, unitPrice, baseUnit, roundUnit, overtimePrice, baseRateHours } = qs;

  const totalMin = parseMinutes(s.totalPlayTm);
  const calcMin = totalMin === 0 ? 0 : Math.max(baseUnit, Math.ceil(totalMin / roundUnit) * roundUnit);
  const units = calcMin / baseUnit;

  let baseSupply = 0, baseTax = 0;
  let extraSupply = 0, extraTax = 0, extraMin = 0;
  let totalSupply = 0, totalTax = 0;

  const isNTimeDiscount = invoiceType === 'n시간 절가';

  if (invoiceType === '계약업체') {
    const total = units * unitPrice;
    baseSupply = Math.round(total / 1.1);
    baseTax = total - baseSupply;
    totalSupply = baseSupply;
    totalTax = baseTax;
  } else if (isNTimeDiscount) {
    const baseTimeMin = baseRateHours * 60;
    const baseCalcMin = Math.max(baseUnit, Math.ceil(Math.min(calcMin, baseTimeMin) / roundUnit) * roundUnit);
    const baseUnits = baseCalcMin / baseUnit;
    const basePay = baseUnits * unitPrice;
    baseSupply = Math.round(basePay / 1.1);
    baseTax = basePay - baseSupply;
    if (calcMin > baseTimeMin) {
      extraMin = calcMin - baseTimeMin;
      const extraUnits = extraMin / baseUnit;
      const extraPay = extraUnits * overtimePrice;
      extraSupply = Math.round(extraPay / 1.1);
      extraTax = extraPay - extraSupply;
    }
    totalSupply = baseSupply + extraSupply;
    totalTax = baseTax + extraTax;
  } else if (invoiceType === '세금계산서') {
    baseSupply = units * unitPrice;
    baseTax = Math.round(baseSupply * 0.1);
    totalSupply = baseSupply;
    totalTax = baseTax;
  } else if (invoiceType === '일반계산서') {
    baseSupply = units * unitPrice;
    baseTax = 0;
    totalSupply = baseSupply;
    totalTax = baseTax;
  }

  const noData = totalMin === 0;

  return { calcMin, totalSupply, totalTax, noData };
}
