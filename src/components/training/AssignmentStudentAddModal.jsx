/**
 * 과제 단건 배정 모달
 *
 * - 수강생 검색은 [검색] 버튼 클릭 또는 Enter 키로만 트리거 (자동 debounce 없음)
 * - 검색 결과에서 수강생 한 명 선택 → [등록]
 * - 등록 시 trainingFileIds 빈 배열을 보내 과제의 모든 파일에 자동 배정
 *   (백엔드 TrainingAssignmentServiceImpl.assignStudent 기본 동작)
 * - 검색은 TB_MEMB.MEMB_LVL='7' 인 수강생만 (백엔드 필터)
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assignStudent, searchTrainees } from '../../api/v9/training/assignments';
import { toast } from '../../stores/toastStore';
import '../../styles/notion-list.css';

export default function AssignmentStudentAddModal({
  open,
  assignmentId,
  onClose,
  onAssigned,
}) {
  const { t } = useTranslation('common');

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  const [selectedMember, setSelectedMember] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // 모달이 닫힐 때 상태 리셋. open 이 false → true 로 전환되면 깨끗한 상태로 시작.
  useEffect(() => {
    if (!open) return;
    setKeyword('');
    setResults([]);
    setSearched(false);
    setSearching(false);
    setSelectedMember(null);
    setSubmitting(false);
  }, [open]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  const handleSearch = useCallback(async () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(true);
      return;
    }
    setSearching(true);
    try {
      const res = await searchTrainees(trimmed, 20);
      const data = res?.data ?? res;
      setResults(Array.isArray(data) ? data : []);
      setSearched(true);
    } catch (err) {
      console.error('[AssignmentStudentAddModal] search failed:', err);
      toast.error(err?.message || t('training.errors.loadFailed'));
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, [keyword, t]);

  const handleKeywordKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!assignmentId || !selectedMember?.membId) {
      toast.error(t('training.assign.studentMembId'));
      return;
    }
    setSubmitting(true);
    try {
      // 파일 배정은 별도 선택 없이 과제의 전체 파일에 자동 배정 (trainingFileIds 비움)
      await assignStudent(assignmentId, {
        studentMembId: selectedMember.membId,
        trainingFileIds: [],
      });
      toast.success(t('training.assign.added'));
      if (typeof onAssigned === 'function') onAssigned();
      onClose?.();
    } catch (err) {
      console.error('[AssignmentStudentAddModal] assign failed:', err);
      toast.error(err?.message || t('training.assign.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [assignmentId, selectedMember, t, onAssigned, onClose]);

  if (!open) return null;

  return (
    <div className="notion-modal-overlay" onClick={() => !submitting && onClose?.()}>
      <div
        className="notion-modal notion-modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t('training.assign.addSingle')}</h3>
          <button
            type="button"
            className="notion-modal-close"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        <div className="notion-modal-body">
          {/* 1) 수강생 검색 */}
          <div className="form-group">
            <label>{t('training.assign.studentMembId')}</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                placeholder={t('training.assign.searchPlaceholder')}
                disabled={submitting}
                autoFocus
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={handleSearch}
                disabled={searching || submitting}
              >
                {searching ? t('training.loading') : t('training.search')}
              </button>
            </div>
          </div>

          {/* 2) 검색 결과 리스트 */}
          {searched && (
            <div className="form-group">
              <label>
                {t('training.assign.studentName')}
                {' '}
                <span className="form-hint">({results.length})</span>
              </label>
              <div
                style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color, #2d2d2d)',
                  borderRadius: '6px',
                }}
              >
                {results.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    {t('training.picker.empty')}
                  </div>
                ) : (
                  results.map((m) => {
                    const isSelected = selectedMember?.membId === m.membId;
                    return (
                      <button
                        key={m.membId}
                        type="button"
                        onClick={() => setSelectedMember(m)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          background: isSelected ? 'var(--accent-bg-subtle, rgba(0,123,255,0.1))' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          borderBottom: '1px solid color-mix(in srgb, var(--border-color) 50%, transparent)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{m.membNm || '-'}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>{m.membId}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="notion-modal-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
          >
            {t('training.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !selectedMember}
          >
            {submitting ? t('training.loading') : t('training.register')}
          </button>
        </div>
      </div>
    </div>
  );
}
