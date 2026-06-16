import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';

/**
 * 정산 공통 필터 바
 *
 * showTitleInBar=true  → 프로젝트명을 상단 검색창에 표시 (대기 탭)
 * showTitleInBar=false → 프로젝트명을 상세 검색 영역에 표시 (상태별 탭)
 * showMonthPresets=true → 이번달/저번달 버튼 표시
 */
export default function SettlementFilterBar({
  filters,
  onChange,
  onSearch,
  onReset,
  loading,
  isOpen,
  onToggleOpen,
  showTitleInBar = false,
  showMonthPresets = false,
  onMonthPreset,
}) {
  const { t } = useTranslation('soribaro');
  const bssTypeOptions = useCommonCodeStore((s) => s.getCodeOptions)('BSS_TYPE');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSearch();
  };

  return (
    <>
      <div className="filter-bar">
        {showTitleInBar && (
          <div className="filter-search">
            <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              className="filter-input"
              value={filters.title}
              onChange={(e) => onChange('title', e.target.value)}
              placeholder={t('manage.settlement.searchPlaceholder')}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}
        <div className="filter-date-group">
          <input type="date" className="filter-date-input" value={filters.dateFrom} onChange={(e) => onChange('dateFrom', e.target.value)} onKeyDown={handleKeyDown} />
          <span className="filter-date-sep">~</span>
          <input type="date" className="filter-date-input" value={filters.dateTo} onChange={(e) => onChange('dateTo', e.target.value)} onKeyDown={handleKeyDown} />
          {showMonthPresets && (
            <>
              <button type="button" className="filter-month-btn" onClick={() => onMonthPreset(0)}>{t('manage.settlement.thisMonth')}</button>
              <button type="button" className="filter-month-btn" onClick={() => onMonthPreset(-1)}>{t('manage.settlement.lastMonth')}</button>
            </>
          )}
        </div>
        <button className={`filter-toggle ${isOpen ? 'open' : ''}`} onClick={onToggleOpen} type="button">
          <span>{t('manage.settlement.advancedSearch')}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="filter-actions">
          <button className="btn-ghost" onClick={onReset}>{t('manage.common.reset')}</button>
          <button className="btn-primary" onClick={onSearch} disabled={loading}>
            {loading ? t('manage.common.searching') : t('manage.common.search')}
          </button>
        </div>
      </div>

      <div className={`filter-advanced ${isOpen ? 'open' : ''}`}>
        <div className="filter-advanced-grid">
          {!showTitleInBar && (
            <div className="filter-field">
              <label>{t('manage.settlement.labelProjectName')}</label>
              <input type="text" value={filters.title} onChange={(e) => onChange('title', e.target.value)} placeholder={t('manage.settlement.searchPlaceholder')} onKeyDown={handleKeyDown} />
            </div>
          )}
          <div className="filter-field">
            <label>{t('manage.settlement.labelServiceName')}</label>
            <input type="text" value={filters.servTitle} onChange={(e) => onChange('servTitle', e.target.value)} placeholder={t('manage.settlement.serviceNamePlaceholder')} onKeyDown={handleKeyDown} />
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelWorkType')}</label>
            <select value={filters.bssType} onChange={(e) => onChange('bssType', e.target.value)}>
              <option value="">{t('common.all')}</option>
              {bssTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelServiceCode')}</label>
            <input type="text" value={filters.servCd} onChange={(e) => onChange('servCd', e.target.value)} placeholder={t('manage.settlement.serviceCodePlaceholder')} onKeyDown={handleKeyDown} />
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelMemberKeyword')}</label>
            <input type="text" value={filters.memberKeyword} onChange={(e) => onChange('memberKeyword', e.target.value)} placeholder={t('manage.settlement.memberKeywordPlaceholder')} onKeyDown={handleKeyDown} />
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelRequesterKeyword')}</label>
            <input type="text" value={filters.requesterKeyword} onChange={(e) => onChange('requesterKeyword', e.target.value)} placeholder={t('manage.settlement.requesterKeywordPlaceholder')} onKeyDown={handleKeyDown} />
          </div>
        </div>
      </div>
    </>
  );
}
