import './PlaceholderPage.css';

export default function PlaceholderPage({ title, subtitle, icon }) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-content">
        <span className="placeholder-icon">{icon || '📄'}</span>
        <h1 className="placeholder-title">{title}</h1>
        {subtitle && <p className="placeholder-subtitle">{subtitle}</p>}
        <div className="placeholder-badge">준비 중</div>
      </div>
    </div>
  );
}
