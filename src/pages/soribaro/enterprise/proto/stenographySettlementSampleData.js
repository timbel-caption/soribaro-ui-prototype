// 현장속기 정산관리 목록 화면 프로토타입 샘플 데이터
// 정산서 발행 건 단위(작업자 1인 × 1건)로 기록하며, 동일 작업자가 여러 건을 수행하면 목록에 여러 행으로 표시된다.
// (엑셀 다운로드 시에는 작업자별로 합산해 1행으로 출력한다.)

// 현장속기 작업자 등급별 시간당 단가
export const STG_SETTLEMENT_RATE_BY_GRADE = {
  Master: 95000,
  Pro: 80000,
  Elite: 70000,
  Rookie: 60000,
};

// workId: 더블클릭 시 이동할 현장속기 작업(STENOGRAPHY_SAMPLES)의 id — 상세보기 > 정산확인 탭으로 연결한다.
export const STENOGRAPHY_SETTLEMENT_SAMPLES = [
  { id: 'STG-SETTLE-001', workId: 'PROTO-STG-001', issueDate: '2026-07-25', worker: '김민준', grade: 'Pro', unitPrice: 80000, workHours: 6.5, settlementAmount: 520000, travelFee: 30000, netAmount: 550000, status: '정산완료' },
  { id: 'STG-SETTLE-002', workId: 'PROTO-STG-002', issueDate: '2026-07-25', worker: '이서연', grade: 'Elite', unitPrice: 70000, workHours: 5, settlementAmount: 350000, travelFee: 0, netAmount: 350000, status: '정산완료' },
  { id: 'STG-SETTLE-003', workId: 'PROTO-STG-001', issueDate: '2026-07-28', worker: '박도윤', grade: 'Rookie', unitPrice: 60000, workHours: 4, settlementAmount: 240000, travelFee: 20000, netAmount: 260000, status: '확인중' },
  { id: 'STG-SETTLE-004', workId: 'PROTO-STG-002', issueDate: '2026-07-28', worker: '최지우', grade: 'Master', unitPrice: 95000, workHours: 7, settlementAmount: 665000, travelFee: 40000, netAmount: 705000, status: '정산대기' },
  { id: 'STG-SETTLE-005', workId: 'PROTO-STG-001', issueDate: '2026-08-01', worker: '김민준', grade: 'Pro', unitPrice: 80000, workHours: 5, settlementAmount: 400000, travelFee: 0, netAmount: 400000, status: '정산대기' },
  { id: 'STG-SETTLE-006', workId: 'PROTO-STG-002', issueDate: '2026-08-01', worker: '정하은', grade: 'Elite', unitPrice: 70000, workHours: 3, settlementAmount: 210000, travelFee: 15000, netAmount: 225000, status: '확인중' },
  { id: 'STG-SETTLE-007', workId: 'PROTO-STG-001', issueDate: '2026-08-02', worker: '이서연', grade: 'Elite', unitPrice: 70000, workHours: 4.5, settlementAmount: 315000, travelFee: 20000, netAmount: 335000, status: '정산완료' },
  { id: 'STG-SETTLE-008', workId: 'PROTO-STG-002', issueDate: '2026-08-03', worker: '박도윤', grade: 'Rookie', unitPrice: 60000, workHours: 6, settlementAmount: 360000, travelFee: 0, netAmount: 360000, status: '정산완료' },
  { id: 'STG-SETTLE-009', workId: 'PROTO-STG-001', issueDate: '2026-08-04', worker: '최지우', grade: 'Master', unitPrice: 95000, workHours: 5.5, settlementAmount: 522500, travelFee: 30000, netAmount: 552500, status: '확인중' },
  { id: 'STG-SETTLE-010', workId: 'PROTO-STG-002', issueDate: '2026-08-05', worker: '강태민', grade: 'Pro', unitPrice: 80000, workHours: 8, settlementAmount: 640000, travelFee: 0, netAmount: 640000, status: '정산대기' },
  { id: 'STG-SETTLE-011', workId: 'PROTO-STG-001', issueDate: '2026-08-05', worker: '정하은', grade: 'Elite', unitPrice: 70000, workHours: 4, settlementAmount: 280000, travelFee: 10000, netAmount: 290000, status: '정산완료' },
  { id: 'STG-SETTLE-012', workId: 'PROTO-STG-002', issueDate: '2026-08-06', worker: '강태민', grade: 'Pro', unitPrice: 80000, workHours: 3.5, settlementAmount: 280000, travelFee: 15000, netAmount: 295000, status: '정산완료' },
];
