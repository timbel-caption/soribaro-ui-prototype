import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const quickLinks = [
  {
    title: '소리바로',
    description: '녹취록, 엔터프라이즈, 번역 작업 관리',
    icon: '🎙️',
    path: '/soribaro/recording/request',
    color: '#00d9ff',
  },
  {
    title: '클립데스크',
    description: '영상 작업 관리',
    icon: '🎬',
    path: '/clipdesk/video/request',
    color: '#ff6b6b',
  },
  {
    title: '작업툴',
    description: '자막 편집 및 영상 작업 도구',
    icon: '🛠️',
    path: '/worktool',
    color: '#4ecdc4',
  },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <div className="home-content">
        <div className="home-header">
          <h1 className="home-title">
            <span className="title-icon">🎵</span>
            Soribaro
          </h1>
          <p className="home-subtitle">음성 및 영상 작업 통합 관리 플랫폼</p>
        </div>

        <div className="quick-links">
          {quickLinks.map((link) => (
            <div
              key={link.path}
              className="quick-link-card"
              onClick={() => navigate(link.path)}
              style={{ '--card-accent': link.color }}
            >
              <span className="card-icon">{link.icon}</span>
              <h3 className="card-title">{link.title}</h3>
              <p className="card-description">{link.description}</p>
              <span className="card-arrow">→</span>
            </div>
          ))}
        </div>

        <div className="home-footer">
          <p>왼쪽 사이드바에서 원하는 메뉴를 선택하세요</p>
        </div>
      </div>
    </div>
  );
}
