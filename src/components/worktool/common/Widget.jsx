import { useTranslation } from 'react-i18next';
import './Widget.css';

export default function Widget({ title, icon, children, className = '', onMinimize }) {
  const { t } = useTranslation('worktool');
  // 컨텐츠 영역에서 드래그 이벤트가 위젯 드래그로 전파되지 않도록
  const handleContentMouseDown = (e) => {
    e.stopPropagation();
  };

  // 최소화 버튼 클릭 핸들러
  const handleMinimize = (e) => {
    e.stopPropagation();
    if (onMinimize) {
      onMinimize();
    }
  };

  return (
    <div className={`widget ${className}`}>
      <div className="widget-header drag-handle">
        <div className="widget-title">
          {/* <span className="widget-icon">{icon}</span> */}
          <h3>{title}</h3>
        </div>
        <div className="widget-actions">
          {onMinimize && (
            <button 
              className="widget-minimize-btn" 
              onClick={handleMinimize}
              title={t('widget.minimizeTitle')}
            >
              ➖
            </button>
          )}
          <span className="drag-hint">⋮⋮</span>
        </div>
      </div>
      <div 
        className="widget-content"
        onMouseDown={handleContentMouseDown}
        onTouchStart={handleContentMouseDown}
      >
        {children}
      </div>
    </div>
  );
}
