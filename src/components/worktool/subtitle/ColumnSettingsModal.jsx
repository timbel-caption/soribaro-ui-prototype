import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './ColumnSettingsModal.css';

const COLUMN_OPTION_KEYS = [
  { id: 'speakerPosition', labelKey: 'columnSettings.speakerPositionLabel', descKey: 'columnSettings.speakerPositionDesc' },
  { id: 'sourceText', labelKey: 'columnSettings.sourceTextLabel', descKey: 'columnSettings.sourceTextDesc' },
  { id: 'middleText', labelKey: 'columnSettings.middleTextLabel', descKey: 'columnSettings.middleTextDesc' },
];

const TOOLBAR_OPTION_KEYS = [
  { id: 'history', labelKey: 'columnSettings.toolbar.history' },
  { id: 'accuracy', labelKey: 'columnSettings.toolbar.accuracy' },
  { id: 'netflixQc', labelKey: 'columnSettings.toolbar.netflixQc' },
  { id: 'speaker', labelKey: 'columnSettings.toolbar.speaker' },
  { id: 'boilerplate', labelKey: 'columnSettings.toolbar.boilerplate' },
  { id: 'gapFill', labelKey: 'columnSettings.toolbar.gapFill' },
  { id: 'minGap', labelKey: 'columnSettings.toolbar.minGap' },
  { id: 'findReplace', labelKey: 'columnSettings.toolbar.findReplace' },
  { id: 'timeJump', labelKey: 'columnSettings.toolbar.timeJump' },
  { id: 'filter', labelKey: 'columnSettings.toolbar.filter' },
  { id: 'guideline', labelKey: 'columnSettings.toolbar.guideline' },
];

export default function ColumnSettingsModal({
  isOpen,
  onClose,
  columnVisibility,
  onColumnVisibilityChange,
  toolbarVisibility,
  onToolbarVisibilityChange,
}) {
  const { t } = useTranslation('worktool');

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // 체크박스 토글 핸들러
  const handleToggle = useCallback((columnId) => {
    onColumnVisibilityChange({
      ...columnVisibility,
      [columnId]: !columnVisibility[columnId],
    });
  }, [columnVisibility, onColumnVisibilityChange]);

  // 전체 선택
  const handleSelectAll = useCallback(() => {
    const allVisible = {};
    COLUMN_OPTION_KEYS.forEach(option => {
      allVisible[option.id] = true;
    });
    onColumnVisibilityChange(allVisible);
  }, [onColumnVisibilityChange]);

  // 전체 해제
  const handleDeselectAll = useCallback(() => {
    const allHidden = {};
    COLUMN_OPTION_KEYS.forEach(option => {
      allHidden[option.id] = false;
    });
    onColumnVisibilityChange(allHidden);
  }, [onColumnVisibilityChange]);

  // 툴바 토글 핸들러
  const handleToolbarToggle = useCallback((id) => {
    onToolbarVisibilityChange({
      ...toolbarVisibility,
      [id]: !toolbarVisibility[id],
    });
  }, [toolbarVisibility, onToolbarVisibilityChange]);

  const handleToolbarSelectAll = useCallback(() => {
    const all = {};
    TOOLBAR_OPTION_KEYS.forEach(o => { all[o.id] = true; });
    onToolbarVisibilityChange(all);
  }, [onToolbarVisibilityChange]);

  const handleToolbarDeselectAll = useCallback(() => {
    const all = {};
    TOOLBAR_OPTION_KEYS.forEach(o => { all[o.id] = false; });
    onToolbarVisibilityChange(all);
  }, [onToolbarVisibilityChange]);

  // 선택된 항목 수
  const selectedCount = Object.values(columnVisibility).filter(Boolean).length;
  const toolbarSelectedCount = TOOLBAR_OPTION_KEYS.filter(o => toolbarVisibility?.[o.id]).length;

  if (!isOpen) return null;

  return createPortal(
    <div className="column-settings-modal-overlay">
      <div className="column-settings-modal">
        <div className="column-settings-modal-header">
          <h3>{t('columnSettings.title')}</h3>
          <button onClick={onClose} className="column-settings-modal-close">✕</button>
        </div>
        
        <div className="column-settings-modal-content">
          <div className="column-settings-section-title">{t('columnSettings.columnSectionTitle')}</div>
          <div className="column-settings-actions">
            <button className="column-settings-action-btn" onClick={handleSelectAll}>
              {t('columnSettings.selectAll')}
            </button>
            <button className="column-settings-action-btn" onClick={handleDeselectAll}>
              {t('columnSettings.deselectAll')}
            </button>
            <span className="column-settings-count">
              {t('columnSettings.selectedCount', { selectedCount, totalCount: COLUMN_OPTION_KEYS.length })}
            </span>
          </div>
          <div className="column-settings-list">
            {COLUMN_OPTION_KEYS.map((option) => (
              <label
                key={option.id}
                className={`column-settings-item ${columnVisibility[option.id] ? 'checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={columnVisibility[option.id] || false}
                  onChange={() => handleToggle(option.id)}
                  className="column-settings-checkbox"
                />
                <div className="column-settings-item-info">
                  <span className="column-settings-item-label">{t(option.labelKey)}</span>
                  <span className="column-settings-item-desc">{t(option.descKey)}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="column-settings-section-title">{t('columnSettings.toolbarSectionTitle')}</div>
          <div className="column-settings-actions">
            <button className="column-settings-action-btn" onClick={handleToolbarSelectAll}>
              {t('columnSettings.selectAll')}
            </button>
            <button className="column-settings-action-btn" onClick={handleToolbarDeselectAll}>
              {t('columnSettings.deselectAll')}
            </button>
            <span className="column-settings-count">
              {t('columnSettings.selectedCount', { selectedCount: toolbarSelectedCount, totalCount: TOOLBAR_OPTION_KEYS.length })}
            </span>
          </div>
          <div className="column-settings-list">
            {TOOLBAR_OPTION_KEYS.map((option) => (
              <label
                key={option.id}
                className={`column-settings-item ${toolbarVisibility?.[option.id] ? 'checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={toolbarVisibility?.[option.id] || false}
                  onChange={() => handleToolbarToggle(option.id)}
                  className="column-settings-checkbox"
                />
                <div className="column-settings-item-info">
                  <span className="column-settings-item-label">{t(option.labelKey)}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
        
        <div className="column-settings-modal-footer">
          <span className="footer-hint">
            {t('columnSettings.hint')}
          </span>
          <button className="btn-close" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
