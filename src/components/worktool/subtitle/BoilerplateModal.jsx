import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { confirm } from '../../../stores/modalStore';
import { toast } from '../../../stores/toastStore';
import defaultBoilerplateData from '../../../constants/boilerplate_default.json';
import { useTranslation } from 'react-i18next';
import './BoilerplateModal.css';

const STORAGE_KEY = 'boilerplate_data';

// localStorage에서 데이터 로드
const loadBoilerplateData = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('상용구 데이터 로드 실패:', e);
  }
  return null;
};

// localStorage에 데이터 저장
const saveBoilerplateData = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('상용구 데이터 저장 실패:', e);
  }
};

// 기본 상용구 데이터 가져오기
const getDefaultBoilerplateData = () => {
  return [...defaultBoilerplateData];
};

// 개별 상용구 항목
const BoilerplateItem = memo(function BoilerplateItem({ 
  item, 
  index,
  onUpdate, 
  onRemove,
  isEditing,
  onStartEdit,
  onEndEdit,
}) {
  const { t } = useTranslation('worktool');
  const [localKey, setLocalKey] = useState(item.key);
  const [localWord, setLocalWord] = useState(item.word);
  const keyInputRef = useRef(null);
  
  useEffect(() => {
    setLocalKey(item.key);
    setLocalWord(item.word);
  }, [item.key, item.word]);
  
  useEffect(() => {
    if (isEditing && keyInputRef.current) {
      keyInputRef.current.focus();
      keyInputRef.current.select();
    }
  }, [isEditing]);
  
  const handleSave = () => {
    if (localKey.trim() && localWord.trim()) {
      onUpdate(index, { key: localKey.trim(), word: localWord.trim() });
    }
    onEndEdit();
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setLocalKey(item.key);
      setLocalWord(item.word);
      onEndEdit();
    }
  };
  
  return (
    <div className="boilerplate-item">
      <span className="boilerplate-index">{index + 1}</span>
      
      {isEditing ? (
        <>
          <input
            ref={keyInputRef}
            type="text"
            className="boilerplate-input key"
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('boilerplate.inputKeyPlaceholder')}
            maxLength={50}
          />
          <span className="boilerplate-arrow">→</span>
          <input
            type="text"
            className="boilerplate-input word"
            value={localWord}
            onChange={(e) => setLocalWord(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={t('boilerplate.outputWordPlaceholder')}
            maxLength={50}
          />
        </>
      ) : (
        <>
          <span 
            className="boilerplate-key" 
            onDoubleClick={() => onStartEdit(index)}
            title={t('boilerplate.doubleClickToEdit')}
          >
            {item.key}
          </span>
          <span className="boilerplate-arrow">→</span>
          <span 
            className="boilerplate-word" 
            onDoubleClick={() => onStartEdit(index)}
            title={t('boilerplate.doubleClickToEdit')}
          >
            {item.word}
          </span>
        </>
      )}
      
      <button 
        className="boilerplate-edit-btn"
        onClick={() => isEditing ? handleSave() : onStartEdit(index)}
        title={isEditing ? t('boilerplate.saveTitle') : t('boilerplate.editTitle')}
      >
        {isEditing ? '✓' : '✏️'}
      </button>
      
      <button 
        className="boilerplate-remove-btn"
        onClick={() => onRemove(index)}
        title={t('boilerplate.deleteTitle')}
      >
        ✕
      </button>
    </div>
  );
});

const validateBoilerplateData = (data) => {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      item != null &&
      typeof item.key === 'string' &&
      typeof item.word === 'string' &&
      item.key.trim() !== '' &&
      item.word.trim() !== ''
  );
};

export default function BoilerplateModal({ isOpen, onClose }) {
  const { t } = useTranslation('worktool');
  const [boilerplateList, setBoilerplateList] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [newWord, setNewWord] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const newKeyInputRef = useRef(null);
  const newWordInputRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // 초기 데이터 로드
  useEffect(() => {
    if (isOpen) {
      let data = loadBoilerplateData();
      if (!data) {
        // localStorage에 데이터가 없으면 기본 데이터로 초기화
        data = getDefaultBoilerplateData();
        saveBoilerplateData(data);
      }
      setBoilerplateList(data);
    }
  }, [isOpen]);
  
  // 모달 열릴 때 입력어 input 자동 포커스
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => newKeyInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 모달 내부 키 이벤트 격리 (portal → window 전파 차단)
  const handleModalKeyDown = useCallback((e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();

    if (e.key === 'Escape' && editingIndex === null) {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        newKeyInputRef.current?.focus();
      } else {
        newWordInputRef.current?.focus();
      }
      return;
    }
  }, [onClose, editingIndex]);
  
  // 필터링된 목록
  const filteredList = boilerplateList.filter(item => 
    item.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.word.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // 상용구 추가
  const handleAdd = useCallback(() => {
    if (!newKey.trim() || !newWord.trim()) return;
    
    const newItem = { key: newKey.trim(), word: newWord.trim() };
    const updatedList = [...boilerplateList, newItem];
    setBoilerplateList(updatedList);
    saveBoilerplateData(updatedList);
    setNewKey('');
    setNewWord('');
    
    if (newKeyInputRef.current) {
      newKeyInputRef.current.focus();
    }
  }, [boilerplateList, newKey, newWord]);
  
  // Enter 키로 추가 (이벤트 격리 포함)
  const handleAddKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation();
      handleAdd();
    }
  }, [handleAdd]);
  
  // 상용구 수정
  const handleUpdate = useCallback((index, updatedItem) => {
    const updatedList = [...boilerplateList];
    updatedList[index] = updatedItem;
    setBoilerplateList(updatedList);
    saveBoilerplateData(updatedList);
  }, [boilerplateList]);
  
  // 상용구 삭제
  const handleRemove = useCallback(async (index) => {
    const item = boilerplateList[index];
    const confirmed = await confirm(
      t('boilerplate.deleteConfirm', { key: item.key, word: item.word }),
      {
        title: t('boilerplate.deleteDialogTitle'),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
      }
    );
    
    if (confirmed) {
      const updatedList = boilerplateList.filter((_, i) => i !== index);
      setBoilerplateList(updatedList);
      saveBoilerplateData(updatedList);
    }
  }, [boilerplateList]);
  
  // 전체 삭제
  const handleClearAll = useCallback(async () => {
    if (boilerplateList.length === 0) return;
    
    const confirmed = await confirm(
      t('boilerplate.deleteAllConfirm', { count: boilerplateList.length }),
      {
        title: t('common.deleteAll'),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
      }
    );
    
    if (confirmed) {
      setBoilerplateList([]);
      saveBoilerplateData([]);
    }
  }, [boilerplateList.length]);
  
  // 기본값으로 초기화
  const handleResetToDefault = useCallback(async () => {
    const confirmed = await confirm(
      '상용구 목록을 기본값으로 초기화하시겠습니까?\n현재 데이터가 모두 삭제됩니다.',
      {
        title: '기본값으로 초기화',
        confirmText: '초기화',
        cancelText: '취소',
      }
    );
    
    if (confirmed) {
      const defaultData = getDefaultBoilerplateData();
      setBoilerplateList(defaultData);
      saveBoilerplateData(defaultData);
    }
  }, []);
  
  // 내보내기
  const handleExport = useCallback(() => {
    if (boilerplateList.length === 0) return;

    const jsonStr = JSON.stringify(boilerplateList, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    const fileName = `상용구_${ts}.sc`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [boilerplateList]);

  // 불러오기
  const handleImport = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);

        if (!validateBoilerplateData(parsed)) {
          toast.error(t('boilerplate.invalidFileError'));
          return;
        }

        const importedData = parsed.map((item) => ({
          key: item.key.trim(),
          word: item.word.trim(),
        }));

        const shouldReplace = await confirm(
          t('boilerplate.importConfirm', { count: importedData.length }),
          {
            title: t('boilerplate.importDialogTitle'),
            confirmText: t('boilerplate.replaceButton'),
            cancelText: t('boilerplate.mergeButton'),
          }
        );

        let finalData;
        if (shouldReplace) {
          finalData = importedData;
        } else {
          const merged = [...boilerplateList];
          for (const item of importedData) {
            const existIdx = merged.findIndex((m) => m.key === item.key);
            if (existIdx >= 0) {
              merged[existIdx] = item;
            } else {
              merged.push(item);
            }
          }
          finalData = merged;
        }

        setBoilerplateList(finalData);
        saveBoilerplateData(finalData);
      } catch {
        toast.error(t('boilerplate.fileReadError'));
      }
    };
    reader.readAsText(file);
  }, [boilerplateList]);

  if (!isOpen) return null;
  
  return createPortal(
    <div className="boilerplate-modal-overlay">
      <div className="boilerplate-modal" onKeyDown={handleModalKeyDown}>
        <div className="boilerplate-modal-header">
          <h3>{t('boilerplate.title')}</h3>
          <button onClick={onClose} className="boilerplate-modal-close">✕</button>
        </div>
        
        <div className="boilerplate-modal-content">
          {/* 새 상용구 추가 */}
          <div className="boilerplate-add-section">
            <input
              ref={newKeyInputRef}
              type="text"
              className="boilerplate-add-input key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={handleAddKeyDown}
              placeholder={t('boilerplate.inputKeyPlaceholder')}
              maxLength={50}
            />
            <span className="boilerplate-arrow">→</span>
            <input
              ref={newWordInputRef}
              type="text"
              className="boilerplate-add-input word"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={handleAddKeyDown}
              placeholder={t('boilerplate.outputWordPlaceholder')}
              maxLength={50}
            />
            <button 
              className="boilerplate-add-btn"
              onClick={handleAdd}
              disabled={!newKey.trim() || !newWord.trim()}
              title={t('boilerplate.addTitle')}
            >
              {t('boilerplate.addButton')}
            </button>
          </div>
          
          {/* 검색 */}
          <div className="boilerplate-search-section">
            <input
              type="text"
              className="boilerplate-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('boilerplate.searchPlaceholder')}
            />
          </div>
          
          {/* 상용구 목록 */}
          <div className="boilerplate-list-section">
            <div className="boilerplate-list-header">
              <span className="boilerplate-count">
                {t('boilerplate.registeredCount', { filteredCount: filteredList.length, totalCount: boilerplateList.length })}
              </span>
              <div className="boilerplate-header-actions">
                <button
                  className="boilerplate-export-btn"
                  onClick={handleExport}
                  disabled={boilerplateList.length === 0}
                  title={t('boilerplate.exportTitle')}
                >
                  {t('boilerplate.exportButton')}
                </button>
                <button
                  className="boilerplate-import-btn"
                  onClick={handleImport}
                  title={t('boilerplate.importButtonTitle')}
                >
                  {t('boilerplate.importButton')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sc"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button 
                  className="boilerplate-reset-btn"
                  onClick={handleResetToDefault}
                  title={t('boilerplate.resetTitle')}
                >
                  {t('boilerplate.resetButton')}
                </button>
                {boilerplateList.length > 0 && (
                  <button 
                    className="boilerplate-clear-all-btn"
                    onClick={handleClearAll}
                  >
                    {t('boilerplate.deleteAllButton')}
                  </button>
                )}
              </div>
            </div>
            
            {filteredList.length === 0 ? (
              <div className="boilerplate-empty">
                <span className="empty-icon">—</span>
                <p>{searchTerm ? t('boilerplate.noSearchResults') : t('boilerplate.noBoilerplates')}</p>
                <p className="empty-hint">{searchTerm ? t('boilerplate.tryOtherSearch') : t('boilerplate.addGuide')}</p>
              </div>
            ) : (
              <div className="boilerplate-list">
                {filteredList.map((item, index) => {
                  const originalIndex = boilerplateList.indexOf(item);
                  return (
                    <BoilerplateItem
                      key={originalIndex}
                      item={item}
                      index={originalIndex}
                      onUpdate={handleUpdate}
                      onRemove={handleRemove}
                      isEditing={editingIndex === originalIndex}
                      onStartEdit={setEditingIndex}
                      onEndEdit={() => setEditingIndex(null)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
        
        <div className="boilerplate-modal-footer">
          <span className="footer-hint">
            {t('boilerplate.autoConvertGuide')}
          </span>
          <button className="btn-close" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
