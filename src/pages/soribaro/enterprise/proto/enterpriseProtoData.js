export const COMPANY_DATA = [
  {
    entNm: '서울시의회',
    managers: [
      { name: '김철수', contractTypes: ['단건계약', '연간계약', '수의계약'] },
      { name: '박지영', contractTypes: ['단건계약', '긴급계약'] },
    ],
  },
  {
    entNm: '서울특별시교육청',
    managers: [
      { name: '이민호', contractTypes: ['연간계약', '수의계약'] },
      { name: '최서연', contractTypes: ['단건계약', '볼륨계약'] },
    ],
  },
  {
    entNm: '한국방송공사',
    managers: [
      { name: '정유진', contractTypes: ['볼륨계약', '연간계약'] },
    ],
  },
  {
    entNm: '국회사무처',
    managers: [
      { name: '홍길동', contractTypes: ['수의계약', '연간계약'] },
      { name: '김영희', contractTypes: ['단건계약'] },
    ],
  },
  {
    entNm: '부산광역시의회',
    managers: [
      { name: '이철호', contractTypes: ['단건계약', '긴급계약', '연간계약'] },
    ],
  },
  {
    entNm: '서울중부교육지원청',
    managers: [],
  },
];

// ─── 엔터프라이즈 고객 관리 더미 사용자 데이터 (prototype용) ───
// 소리바로 > 서비스 관리 > 엔터프라이즈 고객 관리에 등록된 사용자 목록
const _enterpriseCustomers = [
  { membNo: 1,  membId: 'kim.cs@seoul.go.kr',    membNm: '김철수', entNm: '서울시의회',        mblTelNo: '010-1111-0001', status: '정상' },
  { membNo: 2,  membId: 'park.jy@seoul.go.kr',   membNm: '박지영', entNm: '서울시의회',        mblTelNo: '010-1111-0002', status: '정상' },
  { membNo: 3,  membId: 'choi.sy@sen.go.kr',     membNm: '최서연', entNm: '서울특별시교육청',  mblTelNo: '010-2222-0001', status: '정상' },
  { membNo: 4,  membId: 'lee.mh@sen.go.kr',      membNm: '이민호', entNm: '서울특별시교육청',  mblTelNo: '010-2222-0002', status: '정상' },
  { membNo: 5,  membId: 'jung.yj@kbs.co.kr',     membNm: '정유진', entNm: '한국방송공사',      mblTelNo: '010-3333-0001', status: '정상' },
  { membNo: 6,  membId: 'hong.gd@na.go.kr',      membNm: '홍길동', entNm: '국회사무처',        mblTelNo: '010-4444-0001', status: '정상' },
  { membNo: 7,  membId: 'kim.yh@na.go.kr',       membNm: '김영희', entNm: '국회사무처',        mblTelNo: '010-4444-0002', status: '정상' },
  { membNo: 8,  membId: 'lee.ch@busan.go.kr',    membNm: '이철호', entNm: '부산광역시의회',    mblTelNo: '010-5555-0001', status: '정상' },
];

export function getEnterpriseCustomersByEntNm(entNm) {
  return _enterpriseCustomers.filter((c) => c.entNm === entNm && c.status === '정상');
}

// ─── 실무자 공유 스토어 (prototype용 module-level state) ───
// 회사별 실무자 목록. ManageEnterpriseDetailPage와 새 의뢰 등록 모달이 공통 참조.
const _companyStaff = {
  '서울시의회': [
    { id: 1, name: '김유빈', email: 'hong@go.kr',  tel: '070-1234-5678' },
    { id: 2, name: '김유리', email: 'kim@go.kr',   tel: '070-6788-4728' },
  ],
  '서울특별시교육청': [],
  '한국방송공사': [],
  '국회사무처': [],
  '부산광역시의회': [],
  '서울중부교육지원청': [],
};
let _nextStaffId = 10;

export function getCompanyStaff(entNm) {
  return _companyStaff[entNm] ?? [];
}

export function addCompanyStaff(entNm, member) {
  if (!_companyStaff[entNm]) _companyStaff[entNm] = [];
  _companyStaff[entNm] = [..._companyStaff[entNm], { id: _nextStaffId++, ...member }];
}

export function removeCompanyStaff(entNm, id) {
  if (!_companyStaff[entNm]) return;
  _companyStaff[entNm] = _companyStaff[entNm].filter((m) => m.id !== id);
}

// ─── 업체별 견적서(업체정산) 설정 스토어 (prototype용 module-level state) ───
const DEFAULT_QUOTE = { invoiceType: '계약업체', unitPrice: 60000, baseUnit: 60, roundUnit: 30, overtimePrice: 45000, baseRateHours: 2 };
const _companyQuoteSettings = {
  '서울시의회':        { invoiceType: '계약업체',   unitPrice: 60000, baseUnit: 60, roundUnit: 30, overtimePrice: 45000, baseRateHours: 2 },
  '서울특별시교육청':  { invoiceType: '세금계산서', unitPrice: 50000, baseUnit: 60, roundUnit: 30, overtimePrice: 35000, baseRateHours: 2 },
  '한국방송공사':      { invoiceType: 'n시간 절가', unitPrice: 55000, baseUnit: 60, roundUnit: 30, overtimePrice: 40000, baseRateHours: 2 },
  '국회사무처':        { invoiceType: '일반계산서', unitPrice: 65000, baseUnit: 60, roundUnit: 30, overtimePrice: 50000, baseRateHours: 3 },
  '부산광역시의회':    { invoiceType: '계약업체',   unitPrice: 55000, baseUnit: 60, roundUnit: 30, overtimePrice: 40000, baseRateHours: 2 },
  '서울중부교육지원청':{ invoiceType: '세금계산서', unitPrice: 48000, baseUnit: 60, roundUnit: 30, overtimePrice: 35000, baseRateHours: 2 },
};

export function getCompanyQuoteSettings(entNm) {
  return _companyQuoteSettings[entNm] ? { ..._companyQuoteSettings[entNm] } : { ...DEFAULT_QUOTE };
}

export function setCompanyQuoteSettings(entNm, settings) {
  _companyQuoteSettings[entNm] = { ...settings };
}

// ─── 업체 + 의뢰유형 + 계약구분 복합키 견적 설정 스토어 (prototype용) ───
const _quoteSettingsByType = {};

export function getCompanyQuoteSettingsByType(entNm, requestType, contractType) {
  const key = `${entNm}::${requestType}::${contractType}`;
  return _quoteSettingsByType[key] ? { ..._quoteSettingsByType[key] } : { ...DEFAULT_QUOTE };
}

export function setCompanyQuoteSettingsByType(entNm, requestType, contractType, settings) {
  const key = `${entNm}::${requestType}::${contractType}`;
  _quoteSettingsByType[key] = { ...settings };
}
