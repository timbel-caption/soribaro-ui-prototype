import './UpdatesPage.css';

/**
 * [프로토타입] 업데이트 내역
 *
 * 프로토타입에 반영된 변경 사항을 최신순으로 보여줍니다.
 * 새 작업을 반영했다면 아래 UPDATES 배열 맨 위에 한 줄 추가해 주세요.
 */
const UPDATES = [
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
