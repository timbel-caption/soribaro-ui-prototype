import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../../stores/toastStore';
import { useTranslation } from 'react-i18next';
import { Role, getBaseRole } from '../../../stores/roleStore';
import './FindReplaceModal.css';

// 검색 결과 아이템
const SearchResultItem = memo(function SearchResultItem({
  result,
  index,
  isSelected,
  searchTerm,
  onSelect,
  onDoubleClick,
  fieldLabel,
}) {
  // 검색어 하이라이트 표시
  const highlightText = useMemo(() => {
    if (!searchTerm || !result.text) return result.text || '';
    if (result.indices.length === 0) return result.text || '';
    
    const parts = [];
    let lastIndex = 0;
    
    result.indices.forEach(([start, end], i) => {
      if (start > lastIndex) {
        parts.push(
          <span key={`before-${i}`}>{result.text.slice(lastIndex, start)}</span>
        );
      }
      parts.push(
        <mark key={`match-${i}`} className="search-highlight">
          {result.text.slice(start, end)}
        </mark>
      );
      lastIndex = end;
    });
    
    if (lastIndex < result.text.length) {
      parts.push(<span key="after">{result.text.slice(lastIndex)}</span>);
    }
    
    return parts;
  }, [result.text, result.indices, searchTerm]);
  
  return (
    <div
      className={`search-result-item ${isSelected ? 'selected' : ''} ${result.field !== 'text' ? 'readonly-field' : ''}`}
      onClick={() => onSelect(result.subtitleId, index)}
      onDoubleClick={() => onDoubleClick?.(result.subtitleId)}
    >
      <span className="result-index">#{(result.originalIndex ?? index) + 1}</span>
      {result.field !== 'text' && fieldLabel && (
        <span className="result-field-badge">{fieldLabel}</span>
      )}
      {result.speakerMatch && (
        <span
          className="result-speaker-badge"
          style={result.speakerColor ? { borderColor: result.speakerColor, color: result.speakerColor } : undefined}
        >
          {result.speakerName}
        </span>
      )}
      <div className="result-text">{highlightText}</div>
      <span className="result-count">
        {result.indices.length > 0 ? `${result.indices.length}건` : ''}
      </span>
    </div>
  );
});

// role에 따라 검색할 필드 목록 결정
const getSearchFields = (role) => {
  const baseRole = getBaseRole(role);
  const fields = [{ field: 'text', labelKey: 'editingColumn' }];
  if (baseRole === Role.MID || baseRole === Role.FINAL) {
    fields.push({ field: 'sourceText', labelKey: 'sourceText' });
  }
  if (baseRole === Role.FINAL) {
    fields.push({ field: 'middleText', labelKey: 'middleText' });
  }
  return fields;
};

// 텍스트에서 검색어 인덱스 찾기
const findIndices = (text, searchTerm, caseSensitive, useRegex) => {
  const indices = [];
  if (!text) return indices;
  try {
    if (useRegex) {
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(searchTerm, flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        indices.push([match.index, match.index + match[0].length]);
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    } else {
      const searchText = caseSensitive ? text : text.toLowerCase();
      const searchQuery = caseSensitive ? searchTerm : searchTerm.toLowerCase();
      let pos = 0;
      while ((pos = searchText.indexOf(searchQuery, pos)) !== -1) {
        indices.push([pos, pos + searchQuery.length]);
        pos += searchQuery.length;
      }
    }
  } catch (e) {
    console.error('검색 오류:', e);
  }
  return indices;
};

// 찾기/바꾸기 모달
function FindReplaceModal({
  isOpen,
  onClose,
  subtitles,
  speakers = {},
  updateSubtitle,
  onSelectSubtitle,
  onSearchMatchesChange,
  role,
  readOnly = false,
}) {
  const { t } = useTranslation('worktool');
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  const searchInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const resultsListRef = useRef(null);
  const pendingSelectedIndexRef = useRef(null);
  
  const searchFields = useMemo(() => getSearchFields(role), [role]);

  // 필드별 탭 (중간어/도착어 모드에서 활성)
  const showFieldTabs = searchFields.length > 1;
  const [activeTab, setActiveTab] = useState('all');

  // searchFields가 변경되어 현재 탭이 더 이상 유효하지 않으면 'all'로 폴백
  const effectiveActiveTab = useMemo(() => {
    if (activeTab === 'all') return 'all';
    return searchFields.some((f) => f.field === activeTab) ? activeTab : 'all';
  }, [activeTab, searchFields]);

  // 검색 상태 초기화 (ESC 종료 시에만 사용)
  const resetSearchState = useCallback(() => {
    setSearchTerm('');
    setReplaceTerm('');
    setSearchResults([]);
    setSelectedResultIndex(-1);
    setActiveTab('all');
    pendingSelectedIndexRef.current = null;
    onSearchMatchesChange?.([]);
    // onSearchMatchesChange 는 부모 콜백이라 의존성에서 의도적으로 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC 로 모달 닫기 — 검색 상태 초기화 후 닫기
  const handleCloseByEscape = useCallback(() => {
    resetSearchState();
    onClose();
  }, [resetSearchState, onClose]);

  // 모달 열릴 때 포커스 + 이전 검색어가 있으면 결과/매칭 재계산
  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select?.();
    // 이전에 ESC 가 아닌 경로로 닫힌 경우 검색어가 남아있을 수 있으므로
    // 부모의 매칭 상태와 결과 리스트를 다시 계산해 채워줌
    performSearch();
    // performSearch 는 search* 입력값에 의존하므로 의도적으로 의존성 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 전역 ESC 핸들러 — 모달 내 포커스 여부와 무관하게 ESC 로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleCloseByEscape();
    };
    // 캡처 단계에서 가로채 다른 핸들러보다 먼저 처리
    window.addEventListener('keydown', handleGlobalEsc, true);
    return () => window.removeEventListener('keydown', handleGlobalEsc, true);
  }, [isOpen, handleCloseByEscape]);

  // 모달 내부 키 이벤트 격리 (portal → window 전파 차단)
  // ESC 는 전역 캡처 핸들러가 먼저 처리하므로 여기서는 Tab 만 다룸
  const handleModalKeyDown = useCallback((e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        searchInputRef.current?.focus();
      } else {
        replaceInputRef.current?.focus();
      }
      return;
    }
  }, []);
  
  // 검색 실행
  const performSearch = useCallback(() => {
    if (searchTerm.length === 0) {
      setSearchResults([]);
      onSearchMatchesChange?.([]);
      return;
    }
    
    const results = [];
    
    subtitles.forEach((subtitle, subtitleIndex) => {
      // 각 검색 필드에서 매칭 탐색
      let hasTextFieldMatch = false;
      for (const { field, labelKey } of searchFields) {
        const text = subtitle[field] || '';
        if (!text) continue;
        const indices = findIndices(text, searchTerm, caseSensitive, useRegex);
        if (indices.length > 0) {
          if (field === 'text') hasTextFieldMatch = true;
          results.push({
            subtitleId: subtitle.id,
            originalIndex: subtitleIndex,
            text,
            indices,
            field,
            fieldLabelKey: labelKey,
            speakerMatch: false,
            speakerName: '',
            speakerColor: null,
          });
        }
      }
      
      // 화자명 검색 (text 필드 결과로 포함)
      let speakerMatch = false;
      let speakerName = '';
      if (subtitle.speakerId != null) {
        if (subtitle.speakerId === 0) {
          speakerName = t('subtitle.blankSpeaker');
        } else if (speakers[subtitle.speakerId]) {
          speakerName = speakers[subtitle.speakerId].name || '';
        }
        if (speakerName) {
          const sTerm = caseSensitive ? searchTerm : searchTerm.toLowerCase();
          const sName = caseSensitive ? speakerName : speakerName.toLowerCase();
          if (sName.includes(sTerm)) {
            speakerMatch = true;
          }
        }
      }
      
      if (speakerMatch && !hasTextFieldMatch) {
        results.push({
          subtitleId: subtitle.id,
          originalIndex: subtitleIndex,
          text: subtitle.text || '',
          indices: [],
          field: 'text',
          fieldLabelKey: 'editingColumn',
          speakerMatch: true,
          speakerName,
          speakerColor: subtitle.speakerId != null && speakers[subtitle.speakerId]
            ? speakers[subtitle.speakerId].color
            : null,
        });
      } else if (speakerMatch && hasTextFieldMatch) {
        const textResult = results.find(
          (r) => r.subtitleId === subtitle.id && r.field === 'text',
        );
        if (textResult) {
          textResult.speakerMatch = true;
          textResult.speakerName = speakerName;
          textResult.speakerColor = subtitle.speakerId != null && speakers[subtitle.speakerId]
            ? speakers[subtitle.speakerId].color
            : null;
        }
      }
    });
    
    setSearchResults(results);
    onSearchMatchesChange?.(results);
    if (pendingSelectedIndexRef.current !== null) {
      const targetIdx = pendingSelectedIndexRef.current;
      pendingSelectedIndexRef.current = null;
      const newIdx = results.length > 0
        ? Math.min(targetIdx, results.length - 1)
        : -1;
      setSelectedResultIndex(newIdx);
      if (newIdx >= 0) {
        setTimeout(() => {
          const listEl = resultsListRef.current;
          if (listEl?.children[newIdx]) {
            listEl.children[newIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 0);
      }
    } else {
      setSelectedResultIndex(results.length > 0 ? 0 : -1);
    }
  }, [searchTerm, subtitles, speakers, caseSensitive, useRegex, onSearchMatchesChange, searchFields, t]);

  // 활성 탭에 따른 결과 필터링 (전체/특정 필드)
  const filteredResults = useMemo(() => {
    if (!showFieldTabs || effectiveActiveTab === 'all') return searchResults;
    return searchResults.filter((r) => r.field === effectiveActiveTab);
  }, [searchResults, effectiveActiveTab, showFieldTabs]);

  // 탭별 개수(뱃지 표시용)
  const tabCounts = useMemo(() => {
    const counts = { all: searchResults.length };
    for (const { field } of searchFields) {
      counts[field] = 0;
    }
    for (const r of searchResults) {
      if (counts[r.field] !== undefined) counts[r.field] += 1;
    }
    return counts;
  }, [searchResults, searchFields]);

  // filteredResults 범위로 클램프된 선택 인덱스
  const clampedSelectedIndex = useMemo(() => {
    if (filteredResults.length === 0) return -1;
    if (selectedResultIndex < 0 || selectedResultIndex >= filteredResults.length) return 0;
    return selectedResultIndex;
  }, [filteredResults, selectedResultIndex]);
  
  // 검색어 변경 시 자동 검색 (디바운스)
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, caseSensitive, useRegex, performSearch]);
  
  // 결과 선택
  const handleSelectResult = useCallback((subtitleId, index) => {
    setSelectedResultIndex(index);
    onSelectSubtitle?.(subtitleId);
  }, [onSelectSubtitle]);

  // 결과 더블클릭 → 선택 후 모달 닫기
  const handleDoubleClickResult = useCallback((subtitleId) => {
    onSelectSubtitle?.(subtitleId);
    onClose();
  }, [onSelectSubtitle, onClose]);
  
  // 다음/이전 결과로 이동 (모달 내 시각적 선택만, subtitle 선택은 하지 않음)
  const handleNavigate = useCallback((direction) => {
    if (filteredResults.length === 0) return;

    let newIndex = clampedSelectedIndex + direction;
    if (newIndex < 0) newIndex = filteredResults.length - 1;
    if (newIndex >= filteredResults.length) newIndex = 0;

    setSelectedResultIndex(newIndex);

    setTimeout(() => {
      const listEl = resultsListRef.current;
      if (listEl) {
        const selectedEl = listEl.children[newIndex];
        selectedEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 0);
  }, [filteredResults, clampedSelectedIndex]);
  
  // 단건 바꾸기
  const handleReplaceSingle = useCallback(() => {
    if (readOnly) {
      toast.warning(t('findReplace.readOnlyField'));
      return;
    }
    if (clampedSelectedIndex < 0 || clampedSelectedIndex >= filteredResults.length) {
      toast.warning(t('findReplace.selectItemToReplace'));
      return;
    }

    const result = filteredResults[clampedSelectedIndex];

    if (result.field !== 'text') {
      toast.warning(t('findReplace.readOnlyField'));
      return;
    }

    const subtitle = subtitles.find(s => s.id === result.subtitleId);
    if (!subtitle) return;
    
    let newText = subtitle.text;
    
    try {
      if (useRegex) {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(searchTerm, flags);
        newText = newText.replace(regex, replaceTerm);
      } else {
        const searchText = caseSensitive ? newText : newText.toLowerCase();
        const searchQuery = caseSensitive ? searchTerm : searchTerm.toLowerCase();
        
        const indices = [];
        let pos = 0;
        while ((pos = searchText.indexOf(searchQuery, pos)) !== -1) {
          indices.push(pos);
          pos += searchQuery.length;
        }
        
        for (let i = indices.length - 1; i >= 0; i--) {
          const idx = indices[i];
          newText = newText.slice(0, idx) + replaceTerm + newText.slice(idx + searchTerm.length);
        }
      }
    } catch (e) {
      toast.error(t('findReplace.replaceError', { errorMessage: e.message }));
      return;
    }
    
    // 바꾸기 후 현재 항목이 결과에서 빠지면, 같은 인덱스가 곧 "바로 아래" 항목이 됨.
    // performSearch 의 clamp 로 마지막 항목일 때도 안전.
    pendingSelectedIndexRef.current = clampedSelectedIndex;
    updateSubtitle(result.subtitleId, { text: newText });
    toast.success(t('findReplace.replacedOne'));
  }, [readOnly, filteredResults, clampedSelectedIndex, subtitles, searchTerm, replaceTerm, caseSensitive, useRegex, updateSubtitle, t]);

  // 모두 바꾸기 (현재 탭 범위 + text 필드에 한함)
  const handleReplaceAll = useCallback(() => {
    if (readOnly) {
      toast.warning(t('findReplace.readOnlyField'));
      return;
    }
    const replaceableResults = filteredResults.filter((r) => r.field === 'text');
    if (replaceableResults.length === 0) {
      toast.warning(t('findReplace.noItemsToReplace'));
      return;
    }
    
    let totalReplaced = 0;
    
    replaceableResults.forEach((result) => {
      const subtitle = subtitles.find(s => s.id === result.subtitleId);
      if (!subtitle) return;
      
      let newText = subtitle.text;
      
      try {
        if (useRegex) {
          const flags = caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(searchTerm, flags);
          const matches = newText.match(regex);
          if (matches) {
            totalReplaced += matches.length;
            newText = newText.replace(regex, replaceTerm);
          }
        } else {
          const searchText = caseSensitive ? newText : newText.toLowerCase();
          const searchQuery = caseSensitive ? searchTerm : searchTerm.toLowerCase();
          
          const indices = [];
          let pos = 0;
          while ((pos = searchText.indexOf(searchQuery, pos)) !== -1) {
            indices.push(pos);
            pos += searchQuery.length;
          }
          
          totalReplaced += indices.length;
          
          for (let i = indices.length - 1; i >= 0; i--) {
            const idx = indices[i];
            newText = newText.slice(0, idx) + replaceTerm + newText.slice(idx + searchTerm.length);
          }
        }
      } catch (e) {
        console.error('바꾸기 오류:', e);
        return;
      }
      
      if (newText !== subtitle.text) {
        updateSubtitle(result.subtitleId, { text: newText });
      }
    });
    
    toast.success(t('findReplace.replacedCount', { count: totalReplaced }));
  }, [readOnly, filteredResults, subtitles, searchTerm, replaceTerm, caseSensitive, useRegex, updateSubtitle, t]);

  // 선택된 결과로 이동 후 모달 닫기
  const handleConfirmResult = useCallback(() => {
    if (clampedSelectedIndex < 0 || clampedSelectedIndex >= filteredResults.length) return;
    const result = filteredResults[clampedSelectedIndex];
    if (result) {
      onClose(result);
    }
  }, [clampedSelectedIndex, filteredResults, onClose]);

  // input 키보드 단축키
  const handleKeyDown = useCallback((e) => {
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation();
    };

    if (e.key === 'Enter') {
      stop();
      if (e.ctrlKey || e.metaKey) {
        if (readOnly) {
          toast.warning(t('findReplace.readOnlyField'));
        } else {
          handleReplaceSingle();
        }
      } else {
        handleConfirmResult();
      }
    } else if (e.key === 'ArrowDown') {
      stop();
      handleNavigate(1);
    } else if (e.key === 'ArrowUp') {
      stop();
      handleNavigate(-1);
    } else if (e.key === 'F3') {
      stop();
      if (e.shiftKey) {
        handleNavigate(-1);
      } else {
        handleNavigate(1);
      }
    }
  }, [readOnly, handleNavigate, handleReplaceSingle, handleConfirmResult, t]);
  
  // 총 매칭 수 계산 (현재 탭 기준)
  const totalMatches = useMemo(() => {
    return filteredResults.reduce((sum, r) => sum + r.indices.length, 0);
  }, [filteredResults]);

  // 바꾸기 가능한 매칭 수 (현재 탭 + text 필드만)
  const replaceableMatches = useMemo(() => {
    return filteredResults
      .filter((r) => r.field === 'text')
      .reduce((sum, r) => sum + r.indices.length, 0);
  }, [filteredResults]);
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="find-replace-modal-overlay">
      <div className="find-replace-modal" onKeyDown={handleModalKeyDown}>
        <div className="find-replace-modal-header">
          <h3>{t('findReplace.title')}</h3>
          <button onClick={onClose} className="find-replace-modal-close">✕</button>
        </div>
        
        <div className="find-replace-modal-content">
          {/* 검색 입력 섹션 */}
          <div className="find-replace-input-section">
            <div className="input-row">
              <label>{t('findReplace.findLabel')}</label>
              <input
                ref={searchInputRef}
                type="text"
                className="find-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('findReplace.searchPlaceholder')}
                autoFocus
              />
            </div>
            <div className="input-row">
              <label>{t('findReplace.replaceLabel')}</label>
              <input
                ref={replaceInputRef}
                type="text"
                className="replace-input"
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('findReplace.replacePlaceholder')}
                disabled={readOnly}
              />
            </div>
          </div>
          
          {/* 검색 옵션 */}
          <div className="find-replace-options">
            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
              />
              <span>{t('findReplace.caseSensitive')}</span>
            </label>
            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
              />
              <span>{t('findReplace.useRegex')}</span>
            </label>
          </div>
          
          {/* 검색 결과 */}
          <div className="find-replace-results-section">
            {showFieldTabs && (
              <div className="find-replace-field-tabs">
                <button
                  type="button"
                  className={`field-tab ${effectiveActiveTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  {t('findReplace.tabAll')}
                  <span className="field-tab-count">{tabCounts.all ?? 0}</span>
                </button>
                {searchFields.map(({ field, labelKey }) => (
                  <button
                    key={field}
                    type="button"
                    className={`field-tab ${effectiveActiveTab === field ? 'active' : ''}`}
                    onClick={() => setActiveTab(field)}
                  >
                    {t(`findReplace.field.${labelKey}`)}
                    <span className="field-tab-count">{tabCounts[field] ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="results-header">
              <span className="results-count">
                {searchTerm ? (
                  filteredResults.length > 0
                    ? t('findReplace.matchCount', { subtitleCount: filteredResults.length, matchCount: totalMatches })
                    : t('findReplace.noResults')
                ) : t('findReplace.enterSearchTerm')}
              </span>
              <div className="results-nav">
                <button
                  className="nav-btn"
                  onClick={() => handleNavigate(-1)}
                  disabled={filteredResults.length === 0}
                  title={t('findReplace.prevTitle')}
                >
                  ▲
                </button>
                <button
                  className="nav-btn"
                  onClick={() => handleNavigate(1)}
                  disabled={filteredResults.length === 0}
                  title={t('findReplace.nextTitle')}
                >
                  ▼
                </button>
              </div>
            </div>

            <div className="results-list" ref={resultsListRef}>
              {filteredResults.length === 0 ? (
                <div className="results-empty">
                  {searchTerm ? t('findReplace.noMatchingResults') : t('findReplace.searchResultsPlaceholder')}
                </div>
              ) : (
                filteredResults.map((result, index) => (
                  <SearchResultItem
                    key={`${result.subtitleId}-${result.field}`}
                    result={result}
                    index={index}
                    isSelected={index === clampedSelectedIndex}
                    searchTerm={searchTerm}
                    onSelect={handleSelectResult}
                    onDoubleClick={handleDoubleClickResult}
                    fieldLabel={
                      result.field !== 'text'
                        ? t(`findReplace.field.${result.fieldLabelKey}`)
                        : null
                    }
                  />
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="find-replace-modal-footer">
          <div className="footer-hint">
            {t('findReplace.shortcutHints')}
          </div>
          <div className="footer-actions">
            <button 
              className="btn-replace"
              onClick={handleReplaceSingle}
              disabled={readOnly || clampedSelectedIndex < 0}
            >
              {t('findReplace.replaceButton')}
            </button>
            <button 
              className="btn-replace-all"
              onClick={handleReplaceAll}
              disabled={readOnly || replaceableMatches === 0}
            >
              {t('findReplace.replaceAll', { matchCount: replaceableMatches })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default memo(FindReplaceModal);
