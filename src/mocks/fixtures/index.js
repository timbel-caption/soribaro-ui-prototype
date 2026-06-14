/**
 * 목(mock) 샘플 데이터 — 백엔드 없는 프로토타입 전용
 *
 * 여기 있는 데이터는 화면을 "비어 보이지 않게" 채우기 위한 가짜 값입니다.
 * 실제 비즈니스 의미는 없으며, 기획자가 화면을 보고 설계를 실험하는 용도입니다.
 * 새로운 화면에 더 그럴듯한 샘플이 필요하면 이 파일에 배열을 추가하고
 * mockDispatcher.js 의 registry 에 핸들러를 연결하세요.
 */

// ────────────────────────────────────────────────────────────────────────────
// 로그인 사용자 (항상 관리자 — 모든 메뉴/화면 접근 가능)
// ────────────────────────────────────────────────────────────────────────────
export const MOCK_USER = {
  membNo: 1,
  membId: 'planner@soribaro.com',
  membNm: '기획 관리자',
  membTp: 'A',
  membLvl: '4',
  roles: ['ROLE_ADMIN', 'ROLE_SUPER'],
  email: 'planner@soribaro.com',
  name: '기획 관리자',
};

// ────────────────────────────────────────────────────────────────────────────
// 공통코드 (commonCodeStore 가 앱 시작 시 7개 그룹을 조회)
//   응답 data: [{ grpCd, dtlCd, dtlCdNm, ... }]
// ────────────────────────────────────────────────────────────────────────────
const code = (grpCd, dtlCd, dtlCdNm, ordNo) => ({
  grpCd,
  dtlCd,
  dtlCdNm,
  dtlNm: dtlCdNm,
  dtlDesc: null,
  dtlValue1: null,
  dtlValue2: null,
  dtlValue3: null,
  dtlValue4: null,
  dtlValue5: null,
  dtlValueDesc5: null,
  ordNo,
  useYn: 'Y',
  regr: 'system',
  regDttm: '2026-01-01 00:00:00',
  chgr: null,
  chgDttm: null,
});

export const COMMON_CODES = {
  WORK_STATUS: [
    code('WORK_STATUS', '00', '대기', 1),
    code('WORK_STATUS', '10', '배정', 2),
    code('WORK_STATUS', '20', '작업중', 3),
    code('WORK_STATUS', '30', '검수', 4),
    code('WORK_STATUS', '40', '완료', 5),
    code('WORK_STATUS', '90', '취소', 6),
  ],
  USER_LEVEL: [
    code('USER_LEVEL', '1', '일반회원', 1),
    code('USER_LEVEL', '2', '관리자', 2),
    code('USER_LEVEL', '4', '슈퍼관리자', 3),
    code('USER_LEVEL', '5', '수강생', 4),
  ],
  TRNS_LANG_CD: [
    code('TRNS_LANG_CD', 'ko', '한국어', 1),
    code('TRNS_LANG_CD', 'en', '영어', 2),
    code('TRNS_LANG_CD', 'ja', '일본어', 3),
    code('TRNS_LANG_CD', 'zh', '중국어', 4),
    code('TRNS_LANG_CD', 'hi', '힌디어', 5),
  ],
  FILE_TP: [
    code('FILE_TP', '1', '음성', 1),
    code('FILE_TP', '2', '영상', 2),
    code('FILE_TP', '3', '자막', 3),
  ],
  BSS_TYPE: [
    code('BSS_TYPE', 'REC', '녹취록', 1),
    code('BSS_TYPE', 'TRN', '번역', 2),
    code('BSS_TYPE', 'ENT', '엔터프라이즈', 3),
  ],
  NOTI_TP: [
    code('NOTI_TP', '1', '공지', 1),
    code('NOTI_TP', '2', '안내', 2),
    code('NOTI_TP', '3', '점검', 3),
  ],
  MEMB_TP: [
    code('MEMB_TP', 'A', '관리자', 1),
    code('MEMB_TP', 'U', '일반', 2),
    code('MEMB_TP', 'E', '기업', 3),
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// 도메인별 샘플 행 — 화면별로 자주 읽는 필드를 채워 그럴듯하게 보이도록
// ────────────────────────────────────────────────────────────────────────────
const NAMES = ['김소리', '이바로', '박자막', '최번역', '정녹취', '강기획', '윤편집', '한검수'];
const TITLES = [
  '2026년 1분기 임원회의 녹취',
  '신제품 런칭 발표 영상',
  '고객 인터뷰 음성 기록',
  '해외 세미나 동시통역 자막',
  '교육용 강의 영상 번역',
  '주주총회 회의록 작성',
  '브랜드 홍보영상 다국어 자막',
  '팟캐스트 에피소드 전사',
];
const STATUSES = ['00', '10', '20', '30', '40'];

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (dayOffset = 0) => {
  // Date.now() 사용 불가 환경 대비 — 고정 기준일 사용
  const base = 2026;
  const day = 1 + (dayOffset % 27);
  return `${base}-06-${pad(day)} ${pad(9 + (dayOffset % 9))}:${pad((dayOffset * 7) % 60)}:00`;
};

/** 녹취록 의뢰/작업 목록 행 */
export function recordRows(count = 8) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      servCd: `REC${20260000 + n}`,
      membNm: NAMES[i % NAMES.length],
      mblTelNo: `010-${1000 + n}-${5000 + n}`,
      fileTp: i % 2 === 0 ? '음성' : '영상',
      payTp: i % 3 === 0 ? '포인트' : '카드',
      fixPrice: 30000 + n * 1500,
      usePoint: (i % 3) * 1000,
      fileCnt: 1 + (i % 4),
      regDttm: dateStr(i),
      workStatNm: ['접수', '배정', '작업중', '완료'][i % 4],
      overallStatus: STATUSES[i % STATUSES.length],
      servTitle: TITLES[i % TITLES.length],
      servTp: String((i % 2) + 1),
      worker: NAMES[(i + 3) % NAMES.length],
      workerArr: NAMES[(i + 3) % NAMES.length],
      totalPlayTm: `00:${pad(10 + i)}:${pad(i * 3)}`,
      cnlYn: i === 5 ? 'Y' : 'N',
    };
  });
}

/** 작업자/회원 목록 행 */
export function workerRows(count = 8) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      membNo: n,
      membId: `worker${n}@soribaro.com`,
      membNm: NAMES[i % NAMES.length],
      mblTelNo: `010-${2000 + n}-${6000 + n}`,
      membLvl: ['1', '2', '5'][i % 3],
      membLvlNm: ['일반회원', '관리자', '수강생'][i % 3],
      membTp: 'U',
      gradeNm: ['신입', '중급', '전문가'][i % 3],
      workCnt: 10 + i * 3,
      regDttm: dateStr(i),
      useYn: 'Y',
      status: '정상',
    };
  });
}

/** 정산 목록 행 */
export function settlementRows(count = 8) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      settleNo: n,
      servCd: `REC${20260000 + n}`,
      membNm: NAMES[i % NAMES.length],
      title: TITLES[i % TITLES.length],
      amount: 50000 + n * 12000,
      fixPrice: 50000 + n * 12000,
      status: ['WAITING_CONFIRM', 'CONFIRMED', 'PAID'][i % 3],
      statusNm: ['확인대기', '확인완료', '지급완료'][i % 3],
      workStatus: STATUSES[i % STATUSES.length],
      regDttm: dateStr(i),
      workTime: `0${i % 3}:${pad(20 + i)}`,
    };
  });
}

/** 프로젝트(마이페이지 대시보드) 행 */
export function projectRows(count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      projectId: n,
      projectFileId: n,
      servCd: `REC${20260000 + n}`,
      title: TITLES[i % TITLES.length],
      type: i % 2 === 0 ? 'record' : 'translate',
      status: STATUSES[i % STATUSES.length],
      statusNm: ['대기', '배정', '작업중', '검수', '완료'][i % 5],
      progress: (i * 17) % 100,
      regDttm: dateStr(i),
      lang: 'ko',
    };
  });
}

/**
 * 연수 작업툴(목업) 더미 자막.
 * public/mock/sample-voice.wav 의 음성 구간(amplitude burst)과 시간을 맞춰
 * 파형·미디어·자막이 한 화면에서 자연스럽게 보이도록 구성했습니다.
 */
export function mockWorktoolSubtitles() {
  const rows = [
    [0.5, 2.3, '안녕하세요, 오늘 회의를 시작하겠습니다.', 1],
    [2.8, 5.0, '먼저 지난주 진행 상황부터 공유드릴게요.', 2],
    [5.6, 7.4, '이번 분기 목표는 거의 달성했습니다.', 1],
    [8.0, 9.8, '다음 안건으로 넘어가겠습니다.', 2],
    [10.2, 11.6, '질문 있으시면 말씀해 주세요.', 1],
  ];
  return rows.map(([startTime, endTime, text, speakerId], i) => ({
    id: `mock-sub-${i + 1}`,
    startTime,
    endTime,
    text,
    speakerId,
  }));
}

/** 공지사항 행 */
export function noticeRows(count = 8) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      notiNo: n,
      notiTp: String((i % 3) + 1),
      notiTpNm: ['공지', '안내', '점검'][i % 3],
      title: ['서비스 이용 안내', '정기 점검 공지', '신규 기능 업데이트'][i % 3] + ` (${n})`,
      content: '프로토타입 샘플 공지 내용입니다.',
      regr: NAMES[i % NAMES.length],
      regDttm: dateStr(i),
      viewCnt: i * 13,
      useYn: 'Y',
    };
  });
}
