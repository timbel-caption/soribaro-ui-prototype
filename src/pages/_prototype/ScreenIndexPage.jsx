import { Link } from 'react-router-dom';
import { toAppUrl } from '../../utils/worktoolRoute';
import './ScreenIndexPage.css';

/**
 * [프로토타입 전용] 화면 목록(카탈로그)
 *
 * 이 프로젝트의 모든 화면을 한 곳에서 찾아 이동할 수 있게 모아둔 페이지입니다.
 * 사이드바에 없는 상세/작업툴 화면도 여기서 샘플 파라미터로 바로 열어볼 수 있습니다.
 *
 * 새 화면을 추가했다면 아래 SECTIONS 배열에 링크 한 줄을 더해 주세요.
 */
const SECTIONS = [
  {
    title: '소리바로 · 마이페이지',
    links: [{ to: '/soribaro/mypage', label: '마이페이지 대시보드' }],
  },
  {
    title: '소리바로 · 녹취록',
    links: [
      { to: '/soribaro/recording/request', label: '의뢰 관리 (목록)' },
      { to: '/soribaro/recording/request/REC20260001', label: '의뢰 상세' },
      { to: '/soribaro/recording/work', label: '작업 관리 (목록)' },
      { to: '/soribaro/recording/work/REC20260001', label: '작업 상세' },
    ],
  },
  {
    title: '소리바로 · 엔터프라이즈',
    links: [
      { to: '/soribaro/enterprise/meeting', label: '회의 작업 관리 (목록)' },
      { to: '/soribaro/enterprise/meeting/REC20260001', label: '회의 작업 상세' },
      { to: '/soribaro/enterprise/vod', label: 'VOD 작업 관리 (목록)' },
      { to: '/soribaro/enterprise/vod/REC20260001', label: 'VOD 작업 상세' },
    ],
  },
  {
    title: '소리바로 · 번역',
    links: [
      { to: '/soribaro/translation/work', label: '번역 작업 관리 (목록)' },
      { to: '/soribaro/translation/work/REC20260001', label: '번역 작업 상세' },
      { to: '/soribaro/translation/prompt', label: '프롬프트 관리 (목록)' },
      { to: '/soribaro/translation/prompt/1', label: '프롬프트 상세' },
      { to: '/soribaro/translation/tags', label: '태그 관리' },
    ],
  },
  {
    title: '소리바로 · 서비스관리',
    links: [
      { to: '/soribaro/manage/enterprise', label: '기업 관리 (목록)' },
      { to: '/soribaro/manage/enterprise/1', label: '기업 상세' },
      { to: '/soribaro/manage/enterprise-customer', label: '기업 고객 관리 (목록)' },
      { to: '/soribaro/manage/enterprise-customer/1', label: '기업 고객 상세' },
      { to: '/soribaro/manage/settlement', label: '정산 관리' },
      { to: '/soribaro/manage/pricing', label: '단가 관리' },
      { to: '/soribaro/manage/depreciation', label: '감가상각 관리' },
      { to: '/soribaro/manage/worker', label: '작업자 관리 (목록)' },
      { to: '/soribaro/manage/worker/1', label: '작업자 상세' },
      { to: '/soribaro/manage/evaluation', label: '평가 관리' },
      { to: '/soribaro/manage/notice', label: '공지 관리' },
    ],
  },
  {
    title: '소리바로 · 연수(Training)',
    links: [
      { to: '/soribaro/training/files', label: '연수 파일 관리' },
      { to: '/soribaro/training/assignments', label: '과제 관리 (목록)' },
      { to: '/soribaro/training/assignments/1', label: '과제 상세' },
      { to: '/soribaro/training/student', label: '수강생 과제 (목록)' },
      { to: '/soribaro/training/student/1', label: '수강생 과제 상세' },
      { to: '/soribaro/training/students', label: '수강생 관리' },
    ],
  },
  {
    title: '클립데스크',
    links: [
      { to: '/clipdesk/video/request', label: '영상 의뢰 관리' },
      { to: '/clipdesk/video/work', label: '영상 작업 관리' },
    ],
  },
  {
    title: '작업툴 · 진행/번역 (관리자)',
    links: [
      { to: '/progress', label: '진행현황 (STT)' },
      { to: '/translates', label: '번역 처리' },
    ],
  },
  {
    title: '자막 편집기 (WorkTool) — 정적 셸',
    note: '미디어/파형 없이 레이아웃만 렌더됩니다. 새 창으로 열립니다.',
    links: [
      { to: '/worktool?mode=local', label: '작업툴 열기 (local 모드)', newWindow: true },
    ],
  },
];

export default function ScreenIndexPage() {
  return (
    <div className="screen-index">
      <header className="screen-index-header">
        <h1>화면 목록 (프로토타입)</h1>
        <p>
          이 프로젝트의 모든 화면을 모아둔 카탈로그입니다. 백엔드 없이 가짜
          데이터로 동작하며, 데이터는 <code>src/mocks/</code> 에서 옵니다.
          기획자가 화면 구성을 확인하고 AI로 설계를 실험하는 베이스 용도입니다.
        </p>
      </header>

      <div className="screen-index-grid">
        {SECTIONS.map((section) => (
          <section key={section.title} className="screen-index-card">
            <h2>{section.title}</h2>
            {section.note && <p className="screen-index-note">{section.note}</p>}
            <ul>
              {section.links.map((link) =>
                link.newWindow ? (
                  <li key={link.to}>
                    <a
                      href={toAppUrl(link.to)}
                      target="_blank"
                      rel="noreferrer"
                      className="screen-index-link"
                    >
                      {link.label} ↗
                    </a>
                  </li>
                ) : (
                  <li key={link.to}>
                    <Link to={link.to} className="screen-index-link">
                      {link.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
