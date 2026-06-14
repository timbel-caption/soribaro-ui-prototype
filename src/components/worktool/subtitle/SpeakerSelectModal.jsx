import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSpeakerStore, getSpeakerColor } from '../../../stores/speakerStore';
import { confirm, alert } from '../../../stores/modalStore';
import { toast } from '../../../stores/toastStore';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import { useTranslation } from 'react-i18next';
import './SpeakerSelectModal.css';

/**
 * 화자 선택/관리 통합 모달
 * F1 단축키 및 [화자관리] 버튼에서 동일하게 사용
 */
export default function SpeakerSelectModal({ 
  isOpen, 
  onClose, 
  onSelect, 
  currentSpeaker,
  initialManageMode = false,
}) {
  const { t } = useTranslation('worktool');
  const speakers = useSpeakerStore((state) => state.speakers);
  const addSpeaker = useSpeakerStore((state) => state.addSpeaker);
  const removeSpeaker = useSpeakerStore((state) => state.removeSpeaker);
  const getSpeakerList = useSpeakerStore((state) => state.getSpeakerList);
  const getNextAvailableNumber = useSpeakerStore((state) => state.getNextAvailableNumber);
  const updateSpeakerName = useSpeakerStore((state) => state.updateSpeakerName);
  const updateSpeakerNumber = useSpeakerStore((state) => state.updateSpeakerNumber);
  const clearAllSpeakers = useSpeakerStore((state) => state.clearAllSpeakers);
  const updateSpeakerIds = useSubtitleStore((state) => state.updateSpeakerIds);
  
  const speakerList = getSpeakerList();
  const nextNumber = getNextAvailableNumber();
  const isFull = nextNumber === null;
  
  const [inputBuffer, setInputBuffer] = useState('');
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const newSpeakerInputRef = useRef(null);
  const [showManageSection, setShowManageSection] = useState(initialManageMode);
  
  // 편집 상태
  const [editingId, setEditingId] = useState(null);
  const [editField, setEditField] = useState(null); // 'name' | 'number'
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      setShowManageSection(initialManageMode);
    } else {
      setInputBuffer('');
      setNewSpeakerName('');
      setEditingId(null);
      setEditField(null);
    }
  }, [isOpen, initialManageMode]);

  useEffect(() => {
    if (!isOpen || !showManageSection || editingId !== null) return;
    const focusTimer = setTimeout(() => {
      newSpeakerInputRef.current?.focus();
    }, 0);
    return () => clearTimeout(focusTimer);
  }, [isOpen, showManageSection, editingId]);
  
  const handleKeyDown = useCallback((e) => {
    if (e.target.tagName === 'INPUT') {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }
    
    if (e.key === 'Escape') {
      e.preventDefault();
      setInputBuffer('');
      onClose();
      return;
    }
    
    if (!showManageSection) {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setInputBuffer(prev => {
          if (prev.length >= 3) return prev;
          return prev + e.key;
        });
        return;
      }
      
      if (e.key === 'Backspace') {
        e.preventDefault();
        setInputBuffer(prev => prev.slice(0, -1));
        return;
      }
      
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputBuffer) {
          const num = parseInt(inputBuffer, 10);
          const speaker = speakerList.find(s => s.number === num);
          if (speaker) {
            onSelect?.(speaker.number);
          }
        }
        setInputBuffer('');
        onClose();
        return;
      }
    }
  }, [onClose, onSelect, speakerList, inputBuffer, showManageSection]);
  
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);
  
  const handleSpeakerClick = (speakerNumber) => {
    onSelect?.(speakerNumber);
    onClose();
  };
  
  const handleClearSpeaker = () => {
    onSelect?.(null);
    onClose();
  };
  
  const handleAddSpeaker = useCallback(() => {
    if (isFull) return;
    const name = newSpeakerName.trim() || `화자 ${nextNumber}`;
    addSpeaker(name);
    setNewSpeakerName('');
    if (newSpeakerInputRef.current) {
      newSpeakerInputRef.current.focus();
    }
  }, [addSpeaker, newSpeakerName, nextNumber, isFull]);
  
  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSpeaker();
    }
  };

  // 편집 시작
  const handleStartEdit = useCallback((speaker, field) => {
    setEditingId(speaker.number);
    setEditField(field);
    setEditName(speaker.name);
    setEditNumber(String(speaker.number));
  }, []);

  // 편집 저장
  const handleSaveEdit = useCallback(async (originalNumber) => {
    if (editField === 'name') {
      const trimmed = editName.trim();
      if (trimmed && trimmed !== speakers[originalNumber]?.name) {
        updateSpeakerName(originalNumber, trimmed);
      }
    } else if (editField === 'number') {
      const newNum = parseInt(editNumber, 10);
      if (isNaN(newNum)) return;
      if (newNum !== originalNumber) {
        const subtitles = useSubtitleStore.getState().subtitles;
        const hasMappedSubtitles = subtitles.some((sub) => Number(sub.speakerId) === originalNumber);
        let syncSubtitles = true;
        if (hasMappedSubtitles) {
          syncSubtitles = await confirm(
            t('speaker.changeNumberMappedConfirm'),
            {
              title: t('speaker.changeNumberMappedTitle'),
              confirmText: t('speaker.changeNumberMappedYes'),
              cancelText: t('speaker.changeNumberMappedNo'),
            }
          );
        }
        const success = updateSpeakerNumber(originalNumber, newNum);
        if (!success) {
          toast.warning(t('speaker.numberInUse'));
          return;
        }
        if (syncSubtitles) {
          updateSpeakerIds(originalNumber, newNum);
        }
      }
    }
    setEditingId(null);
    setEditField(null);
  }, [editField, editName, editNumber, speakers, updateSpeakerName, updateSpeakerNumber, updateSpeakerIds, t]);

  // 편집 취소
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditField(null);
  }, []);

  const handleEditKeyDown = useCallback((e, originalNumber) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSaveEdit(originalNumber);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  // 초기화
  const handleResetAll = useCallback(async () => {
    if (speakerList.length === 0) return;
    const confirmed = await confirm(
      t('speaker.resetConfirm'),
      {
        title: t('speaker.resetTitle'),
        confirmText: t('speaker.resetAll'),
        cancelText: t('common.cancel'),
      }
    );
    if (confirmed) {
      clearAllSpeakers();
    }
  }, [clearAllSpeakers, speakerList.length, t]);
  
  const handleRemove = useCallback(async (number) => {
    const speaker = speakers[number];
    const subtitles = useSubtitleStore.getState().subtitles;
    const inUse = subtitles.some((sub) => sub.speakerId === number);
    if (inUse) {
      await alert(
        t('speaker.cannotDeleteInUse', { speakerName: speaker?.name, defaultValue: `"${speaker?.name}" 화자는 현재 자막에서 사용 중이므로 삭제할 수 없습니다.` }),
        { title: t('speaker.cannotDeleteTitle', { defaultValue: '삭제 불가' }) }
      );
      return;
    }
    const confirmed = await confirm(
      t('speaker.selectDeleteConfirm', { speakerName: speaker?.name }),
      {
        title: t('speaker.selectDeleteDialogTitle'),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
      }
    );
    if (confirmed) {
      removeSpeaker(number);
    }
  }, [speakers, removeSpeaker, t]);
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="speaker-select-overlay">
      <div className="speaker-select-modal">
        <div className="speaker-select-header">
          <h3>{t('speaker.selectTitle')}</h3>
          <div className="header-actions">
            {showManageSection && speakerList.length > 0 && (
              <button
                className="speaker-reset-btn"
                onClick={handleResetAll}
              >
                {t('speaker.resetAll')}
              </button>
            )}
            <button 
              className={`toggle-manage-btn ${showManageSection ? 'active' : ''}`}
              onClick={() => {
                setShowManageSection(!showManageSection);
                setEditingId(null);
                setEditField(null);
              }}
              title={t('speaker.manageTooltip')}
            >
              {t('speaker.manageButton')}
            </button>
            <button onClick={onClose} className="close-btn">✕</button>
          </div>
        </div>
        
        <div className="speaker-select-content">
          {showManageSection && (
            <div className="speaker-add-section">
              <div className="speaker-add-preview">
                {nextNumber !== null && (
                  <>
                    <div 
                      className="speaker-color preview" 
                      style={{ backgroundColor: getSpeakerColor(nextNumber) }}
                    />
                    <span className="speaker-number preview">{nextNumber}</span>
                  </>
                )}
              </div>
              <input
                ref={newSpeakerInputRef}
                type="text"
                className="speaker-add-input"
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder={isFull ? t('speaker.maxCapacityPlaceholder') : t('speaker.selectAddPlaceholder', { nextNumber })}
                disabled={isFull}
                maxLength={50}
              />
              <button 
                className="speaker-add-btn"
                onClick={handleAddSpeaker}
                disabled={isFull}
              >
                {t('speaker.selectAddButton')}
              </button>
            </div>
          )}
          
          {speakerList.length === 0 ? (
            <div className="speaker-select-empty">
              <span className="empty-icon">—</span>
              <p>{t('speaker.selectNoSpeakers')}</p>
              <p className="empty-hint">{t('speaker.selectAddGuide')}</p>
            </div>
          ) : (
            <>
              {!showManageSection && (
                <button 
                  className={`speaker-clear-btn ${currentSpeaker === null ? 'selected' : ''}`}
                  onClick={handleClearSpeaker}
                >
                  <span className="clear-icon">✕</span>
                  <span>{t('subtitle.unassignedSpeaker')}</span>
                </button>
              )}
              
              <div className={`speaker-select-grid ${showManageSection ? 'manage-mode' : ''}`}>
                {speakerList.map((speaker) => (
                  <div
                    key={speaker.number}
                    className={`speaker-select-item ${currentSpeaker === speaker.number ? 'selected' : ''} ${showManageSection && editingId === speaker.number ? 'editing' : ''}`}
                  >
                    <button
                      className="speaker-select-btn"
                      onClick={showManageSection ? undefined : () => handleSpeakerClick(speaker.number)}
                      title={speaker.name}
                    >
                      <span 
                        className="speaker-color" 
                        style={{ backgroundColor: speaker.color }}
                      />
                      {/* 번호 */}
                      {showManageSection && editingId === speaker.number && editField === 'number' ? (
                        <div className="speaker-number-edit-group" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            className="speaker-edit-input"
                            value={editNumber}
                            onChange={(e) => setEditNumber(e.target.value)}
                            onKeyDown={(e) => handleEditKeyDown(e, speaker.number)}
                            min={1}
                            max={100}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span
                            className="speaker-edit-confirm-btn"
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleSaveEdit(speaker.number);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleSaveEdit(speaker.number);
                              }
                            }}
                          >
                            {t('speaker.updateButton')}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="speaker-number"
                          onClick={showManageSection ? (e) => { e.stopPropagation(); handleStartEdit(speaker, 'number'); } : undefined}
                        >
                          {speaker.number}
                        </span>
                      )}
                      {/* 이름 */}
                      {showManageSection && editingId === speaker.number && editField === 'name' ? (
                        <input
                          type="text"
                          className="speaker-edit-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, speaker.number)}
                          onBlur={() => handleSaveEdit(speaker.number)}
                          maxLength={50}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="speaker-name"
                          onClick={showManageSection ? (e) => { e.stopPropagation(); handleStartEdit(speaker, 'name'); } : undefined}
                        >
                          {speaker.name}
                        </span>
                      )}
                    </button>
                    {showManageSection && (
                      <button
                        className="speaker-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(speaker.number);
                        }}
                        title={t('speaker.selectDeleteTitle')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        
        <div className="speaker-select-footer">
          {showManageSection ? (
            <span className="hint">{t('speaker.manageMode')}</span>
          ) : inputBuffer ? (
            <span className="input-display">
              {t('speaker.inputBuffer', { inputBuffer })}
            </span>
          ) : (
            <span className="hint">{t('speaker.numberInputGuide')}</span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
