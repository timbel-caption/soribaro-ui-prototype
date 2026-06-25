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
];

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
