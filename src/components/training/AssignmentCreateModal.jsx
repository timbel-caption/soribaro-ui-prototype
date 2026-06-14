/**
 * 과제 신규 등록 모달 (관리자 전용)
 *
 * - 제목 / 설명 입력
 * - 등록된 연수 파일 목록에서 N개 picker 로 선택
 * - 확인 시 POST /v9/api/training/assignments
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTrainingFiles } from '../../api/v9/training';
import { createAssignment } from '../../api/v9/training/assignments';
import { toast } from '../../stores/toastStore';
import '../../styles/notion-list.css';

const TITLE_MAX = 256;
const DESC_MAX = 1000;

export default function AssignmentCreateModal({ open, onClose, onCreated }) {
  const { t } = useTranslation('common');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  const [files, setFiles] = useState([]); // 전체 training_files
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [filesKeyword, setFilesKeyword] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let aborted = false;
    setLoadingFiles(true);
    (async () => {
      try {
        const res = await listTrainingFiles({ page: 0, size: 200 });
        if (aborted) return;
        const envelope = res?.data ?? res;
        const list = Array.isArray(envelope)
          ? envelope
          : Array.isArray(envelope?.content)
          ? envelope.content
          : [];
        setFiles(list);
      } catch (err) {
        if (!aborted) {
          console.error('[AssignmentCreateModal] file load failed:', err);
          toast.error(err?.message || t('training.errors.loadFailed'));
        }
      } finally {
        if (!aborted) setLoadingFiles(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [open, t]);

  const toggleFile = useCallback((id) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const next = {};
    const trimmed = title.trim();
    if (!trimmed) next.title = t('training.validation.titleRequired');
    else if (trimmed.length > TITLE_MAX) next.title = t('training.validation.titleTooLong');
    if (description.length > DESC_MAX) next.description = t('training.validation.descriptionTooLong');
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const res = await createAssignment({
        title: trimmed,
        description: description || undefined,
        trainingFileIds: Array.from(selectedFileIds),
      });
      const id = res?.data?.id ?? res?.id;
      toast.success(t('training.assignment.saved'));
      if (typeof onCreated === 'function') onCreated(id);
      onClose?.();
    } catch (err) {
      console.error('[AssignmentCreateModal] create failed:', err);
      toast.error(err?.message || t('training.errors.uploadFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [title, description, selectedFileIds, onCreated, onClose, t]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const filteredFiles = !filesKeyword
    ? files
    : files.filter((f) => {
        const k = filesKeyword.toLowerCase();
        return (
          String(f.title || '').toLowerCase().includes(k) ||
          String(f.name || '').toLowerCase().includes(k)
        );
      });

  return (
    <div className="notion-modal-overlay" onClick={() => !submitting && onClose?.()}>
      <div
        className="notion-modal"
        style={{ width: 'min(720px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t('training.assignment.createTitle')}</h3>
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
          <p className="text-muted" style={{ marginBottom: '12px' }}>
            {t('training.assignment.createDescription')}
          </p>

          <div className="form-group">
            <label>{t('training.assignment.title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              disabled={submitting}
            />
            {errors.title && <span className="form-error">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label>{t('training.assignment.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              rows={3}
              disabled={submitting}
            />
            <span className="form-hint">
              {errors.description || `${description.length} / ${DESC_MAX}`}
            </span>
          </div>

          <div className="form-group">
            <label>
              {t('training.assignment.selectFiles')}{' '}
              <span className="form-hint">
                ({t('training.assignment.filesSelected', { count: selectedFileIds.size })})
              </span>
            </label>
            <input
              type="text"
              placeholder={t('training.searchPlaceholder')}
              value={filesKeyword}
              onChange={(e) => setFilesKeyword(e.target.value)}
              disabled={submitting || loadingFiles}
              style={{ marginBottom: '6px' }}
            />
            <div
              style={{
                maxHeight: '260px',
                overflow: 'auto',
                border: '1px solid var(--border-color, #2d2d2d)',
                borderRadius: '4px',
              }}
            >
              {loadingFiles ? (
                <div style={{ padding: '12px', textAlign: 'center' }}>
                  {t('training.loading')}
                </div>
              ) : filteredFiles.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>
                  {t('training.picker.empty')}
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {filteredFiles.map((f) => {
                    const checked = selectedFileIds.has(f.id);
                    return (
                      <li
                        key={f.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 10px',
                          borderBottom: '1px solid var(--border-color, #2d2d2d)',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleFile(f.id)}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleFile(f.id)} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{f.title || f.name}</div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>{f.name}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
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
            disabled={submitting}
          >
            {submitting ? t('training.loading') : t('training.register')}
          </button>
        </div>
      </div>
    </div>
  );
}
