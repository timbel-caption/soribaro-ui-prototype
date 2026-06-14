/**
 * 수강생 목록 → 일괄 배정 모달 (관리자 전용)
 *
 * - 진입 시 두 API 를 동시 호출:
 *   1) listTraineeStudents — MEMB_LVL='7' 전체 수강생
 *   2) listAssignmentStudents — 이미 그 과제에 배정된 수강생 (membId 기준 차집합)
 * - 그 차집합(=미배정 수강생) 만 체크박스 목록으로 표시
 * - [전체 선택] / 개별 체크 → [추가] 시 선택된 수강생 각각 assignStudent 호출
 *   (trainingFileIds 빈 배열 → 그 과제의 모든 파일에 자동 배정)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assignStudent, listAssignmentStudents } from '../../api/v9/training/assignments';
import { listTraineeStudents } from '../../api/v9/training/evaluations';
import { toast } from '../../stores/toastStore';
import '../../styles/notion-list.css';

export default function AssignmentStudentBulkPickerModal({
  open,
  assignmentId,
  onClose,
  onAssigned,
}) {
  const { t } = useTranslation('common');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unassigned, setUnassigned] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [keyword, setKeyword] = useState('');

  const reset = useCallback(() => {
    setUnassigned([]);
    setSelected(new Set());
    setKeyword('');
  }, []);

  // 모달이 열릴 때 데이터 fetch + 닫힐 때 상태 리셋
  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (!assignmentId) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [allRes, assignedRes] = await Promise.all([
          listTraineeStudents({ page: 0, size: 500 }),
          listAssignmentStudents(assignmentId, { page: 0, size: 500 }),
        ]);
        if (cancelled) return;

        const allEnvelope = allRes?.data ?? allRes;
        const allList = Array.isArray(allEnvelope)
          ? allEnvelope
          : Array.isArray(allEnvelope?.content)
          ? allEnvelope.content
          : [];

        const assignedEnvelope = assignedRes?.data ?? assignedRes;
        const assignedList = Array.isArray(assignedEnvelope)
          ? assignedEnvelope
          : Array.isArray(assignedEnvelope?.content)
          ? assignedEnvelope.content
          : [];
        const assignedIds = new Set(
          assignedList.map((s) => s.studentMembId).filter(Boolean),
        );

        const filtered = allList.filter(
          (m) => m?.membId && !assignedIds.has(m.membId),
        );
        setUnassigned(filtered);
      } catch (err) {
        console.error('[AssignmentStudentBulkPickerModal] load failed:', err);
        toast.error(err?.message || t('training.errors.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, assignmentId, reset, t]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  // 키워드 검색 (membId + membNm)
  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return unassigned;
    return unassigned.filter((m) => {
      const id = String(m.membId || '').toLowerCase();
      const nm = String(m.membNm || '').toLowerCase();
      return id.includes(kw) || nm.includes(kw);
    });
  }, [unassigned, keyword]);

  const allVisibleChecked = visible.length > 0 && visible.every((m) => selected.has(m.membId));

  const toggleOne = useCallback((membId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(membId)) next.delete(membId);
      else next.add(membId);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) {
        visible.forEach((m) => next.delete(m.membId));
      } else {
        visible.forEach((m) => next.add(m.membId));
      }
      return next;
    });
  }, [visible, allVisibleChecked]);

  const handleSubmit = useCallback(async () => {
    if (!assignmentId || selected.size === 0) return;
    setSubmitting(true);
    let succeeded = 0;
    let failed = 0;
    try {
      const ids = Array.from(selected);
      // assignStudent 가 단건 호출이라 Promise.all 로 병렬 처리. trainingFileIds 빈 배열
      // → 백엔드가 그 과제의 모든 파일에 자동 배정.
      const results = await Promise.allSettled(
        ids.map((membId) =>
          assignStudent(assignmentId, { studentMembId: membId, trainingFileIds: [] }),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') succeeded += 1;
        else failed += 1;
      }
      if (succeeded > 0) {
        toast.success(t('training.assign.added'));
        onAssigned?.();
      }
      if (failed > 0) {
        toast.warning(t('training.assign.addFailed'));
      }
      onClose?.();
    } catch (err) {
      console.error('[AssignmentStudentBulkPickerModal] submit failed:', err);
      toast.error(err?.message || t('training.assign.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [assignmentId, selected, onAssigned, onClose, t]);

  if (!open) return null;

  return (
    <div className="notion-modal-overlay" onClick={() => !submitting && onClose?.()}>
      <div
        className="notion-modal notion-modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t('training.assign.pickList.title')}</h3>
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
          <div className="form-group">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('training.assign.searchPlaceholder')}
              disabled={submitting}
              autoFocus
            />
          </div>

          {loading && <div className="notion-empty">{t('training.loading')}</div>}

          {!loading && (
            <>
              <div
                className="form-row"
                style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={toggleAllVisible}
                    disabled={submitting || visible.length === 0}
                  />
                  <span>{t('training.assign.pickList.selectAll')}</span>
                </label>
                <span className="record-count">
                  {t('training.totalCount', { count: visible.length })}
                  {selected.size > 0 && (
                    <span style={{ marginLeft: 8, color: 'var(--accent-color)' }}>
                      ({t('training.assign.pickList.selectedCount', { count: selected.size })})
                    </span>
                  )}
                </span>
              </div>

              <div
                style={{
                  maxHeight: 360,
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  marginTop: 8,
                }}
              >
                {visible.length === 0 ? (
                  <div className="notion-empty">{t('training.assign.pickList.empty')}</div>
                ) : (
                  visible.map((m) => {
                    const checked = selected.has(m.membId);
                    return (
                      <label
                        key={m.membId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          borderBottom: '1px solid color-mix(in srgb, var(--border-color) 50%, transparent)',
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          background: checked ? 'var(--bg-hover)' : 'transparent',
                          color: 'var(--text-primary)',
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(m.membId)}
                          disabled={submitting}
                        />
                        <span style={{ fontWeight: 500, minWidth: 140 }}>{m.membNm || '-'}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{m.membId}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
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
            disabled={submitting || selected.size === 0}
          >
            {submitting
              ? t('training.loading')
              : t('training.assign.pickList.add', { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
