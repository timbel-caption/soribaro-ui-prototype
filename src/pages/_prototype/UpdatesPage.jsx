import './UpdatesPage.css';

/**
 * [프로토타입] 업데이트 내역
 *
 * 프로토타입에 반영된 변경 사항을 최신순으로 보여줍니다.
 * 새 작업을 반영했다면 아래 UPDATES 배열 맨 위에 한 줄 추가해 주세요.
 */
const UPDATES = [
  {
    date: '2026-06-18',
    author: '정윤실',
    title: '회의록 작업관리 대시보드 통계·테이블 컬럼·긴급 알림 개편',
    description: '통계 카드를 "진행 중 의뢰·검수 완료" 기준으로 수정하고, 테이블 컬럼을 의뢰일자/계약구분/회차/의뢰시간 포함 순서로 재편했습니다. 상태별 현황 바 차트를 오늘 마감·납품 지연 건수를 표시하는 긴급 알림 섹션으로 교체했습니다.',
  },
  {
    date: '2026-06-18',
    author: '정윤실',
    title: '회의록 작업관리 서브파일요청·특이사항·검색 및 고객관리 의뢰유형 추가',
    description: '회의록 작업관리 대시보드에 서브파일요청 3단계 토글·특이사항 인라인 편집·검색 필터를 추가하고, 새 프로젝트 등록 팝업을 업체명 검색·담당관리자·계약구분 연동 방식으로 개선했습니다. 엔터프라이즈 고객관리에 의뢰유형 관리 팝업과 고객 상세의 의뢰유형·계약구분 선택 기능을 추가했습니다.',
  },
  {
    date: '2026-06-17',
    author: '정기태',
    title: '프로젝트 관리 탭 텍스트 수정 (과목→프로젝트)',
    description:
      '회의록/VOD 작업 상세 > 프로젝트 관리 탭의 "과목 추가" 버튼 텍스트를 "프로젝트 추가"로, "과목 / 묶음 현황" 제목을 "프로젝트 현황"으로 변경했습니다.',
  },
  {
    date: '2026-06-17',
    author: '정기태',
    title: '사이드바 공지사항 관리 메뉴 복구',
    description:
      '이전에 제거했던 사이드바 서비스 관리 메뉴의 "공지사항 관리" 항목을 다시 추가했습니다.',
  },
  {
    date: '2026-06-15',
    author: 'jybae',
    title: '[개발중] 작업 유형·용어집 설정 화면 추가',
    description:
      '사이드바에 "[개발중]" 메뉴를 추가하고, 프로젝트 작업 유형 및 용어집 설정 화면(공통 정보·세부 메모·파일 목록)을 시안대로 구성했습니다.',
  },
  {
    date: '2026-06-15',
    author: '정기태',
    title: '사이드바 공지사항 관리 메뉴 제거',
    description:
      '사이드바 서비스 관리 메뉴에서 "공지사항 관리" 항목을 제거했습니다.',
  },
  {
    date: '2026-06-15',
    author: 'jybae',
    title: '로그인 사용자 표시 이름 변경',
    description:
      '자동 로그인되는 더미 사용자 이름을 "기획 관리자"에서 "관리자"로 변경했습니다.',
  },
  {
    date: '2026-06-15',
    author: 'jybae',
    title: '연수 작업툴 목업 데이터 표시',
    description:
      '연수 작업툴 실행 화면을 목업 전용으로 전환해, 샘플 음성·파형·더미 자막이 함께 보이도록 처리했습니다.',
  },
  {
    date: '2026-06-15',
    author: 'jybae',
    title: 'GitHub Pages 새 창 작업툴 404 수정',
    description:
      '배포 환경(하위 경로)에서 작업툴을 새 창으로 열 때 404가 나던 문제를 수정했습니다. (base 경로 반영)',
  },
  {
    date: '2026-06-15',
    author: 'jybae',
    title: 'Readme 페이지 스크롤·테마 수정',
    description:
      'Readme 페이지에 스크롤바가 생기지 않고 테마가 적용되지 않던 문제를 수정했습니다.',
  },
  {
    date: '2026-06-14',
    author: 'jybae',
    title: 'Readme 메뉴 및 README 뷰어 추가',
    description:
      '사이드바에 Readme 메뉴를 추가하고, README.md 내용을 보여주는 페이지를 만들었습니다.',
  },
  {
    date: '2026-06-14',
    author: 'jybae',
    title: 'GitHub Pages 배포 설정',
    description:
      'COOP/COEP 서비스워커 적용 및 Pages 배포 워크플로우를 활성화했습니다.',
  },
  {
    date: '2026-06-14',
    author: 'jybae',
    title: '프로토타입 최초 생성',
    description: 'soribaro UI 프로토타입 초기 버전을 생성했습니다.',
  },
];

export default function UpdatesPage() {
  return (
    <div className="updates-page">
      <header className="updates-header">
        <h1>업데이트 내역</h1>
        <p>프로토타입에 반영된 변경 사항을 최신순으로 보여줍니다.</p>
      </header>

      <ul className="updates-list">
        {UPDATES.map((item, idx) => (
          <li key={idx} className="updates-item">
            <div className="updates-item-meta">
              <span className="updates-item-date">{item.date}</span>
              <span className="updates-item-author">{item.author}</span>
            </div>
            <div className="updates-item-body">
              <h2 className="updates-item-title">{item.title}</h2>
              {item.description && (
                <p className="updates-item-desc">{item.description}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
