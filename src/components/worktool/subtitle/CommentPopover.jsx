import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './CommentPopover.css';

export default function CommentPopover({
  comments,
  onAdd,
  onUpdate,
  onDelete,
  currentUserId,
  onClose,
  anchor,
}) {
  const { t } = useTranslation('worktool');
  const popoverRef = useRef(null);
  const listRef = useRef(null);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [computedPos, setComputedPos] = useState(null);

  useEffect(() => {
    const dismiss = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', handleEsc);
    document.addEventListener('wheel', dismiss, { passive: true });
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('wheel', dismiss);
    };
  }, [onClose]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  useLayoutEffect(() => {
    if (!anchor || !popoverRef.current) return;
    const el = popoverRef.current;
    const popH = el.offsetHeight;
    const popW = el.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const margin = 8;
    const gap = 4;

    let top = anchor.bottom + gap;
    if (top + popH > vh - margin) {
      const flipped = anchor.top - gap - popH;
      if (flipped >= margin) {
        top = flipped;
      } else {
        top = Math.max(margin, vh - margin - popH);
      }
    }

    let left = anchor.left;
    if (left + popW > vw - margin) {
      left = vw - margin - popW;
    }
    if (left < margin) left = margin;

    setComputedPos({ top, left });
  }, [anchor, comments.length, editingId]);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(text);
      setNewText('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (commentId) => {
    const text = editText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await onUpdate(commentId, text);
      setEditingId(null);
      setEditText('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onDelete(commentId);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (comment) => {
    setEditingId(comment.id);
    setEditText(comment.comments || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return dateStr; }
  };

  const style = anchor
    ? {
        position: 'fixed',
        top: computedPos ? computedPos.top : anchor.bottom + 4,
        left: computedPos ? computedPos.left : anchor.left,
        visibility: computedPos ? 'visible' : 'hidden',
      }
    : {};

  // 가상 List 등 부모가 transform/contain 으로 stacking context 또는 containing block 을
  // 만드는 경우 position: fixed 가 viewport 가 아닌 부모 기준으로 동작해 popover 가
  // 보이지 않거나 잘못된 위치에 그려지는 문제를 차단하기 위해 document.body 로 portal 처리.
  return createPortal(
    <div className="comment-popover" ref={popoverRef} style={style} onClick={(e) => e.stopPropagation()}>
      <div className="cp-header">
        <span className="cp-title">{t('comment.title', { count: comments.length })}</span>
      </div>

      <div className="cp-list" ref={listRef}>
        {comments.length === 0 ? (
          <div className="cp-empty">{t('comment.noComments')}</div>
        ) : (
          comments.map((c) => {
            const isMine = c.createdBy === currentUserId;
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} className={`cp-item-wrap ${isMine ? 'mine' : ''}`}>
                <div className={`cp-item ${isMine ? 'mine' : ''}`}>
                  <div className="cp-item-header">
                    <span className="cp-author">{c.createdBy}</span>
                    {isMine && !isEditing && (
                      <span className="cp-actions">
                        <button onClick={() => startEdit(c)} title={t('comment.editTitle')}>✎</button>
                        <button onClick={() => handleDelete(c.id)} title={t('comment.deleteTitle')}>×</button>
                      </span>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="cp-edit-area">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUpdate(c.id); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                      />
                      <div className="cp-edit-actions">
                        <button className="cp-btn-cancel" onClick={cancelEdit}>{t('common.cancel')}</button>
                        <button className="cp-btn-save" onClick={() => handleUpdate(c.id)} disabled={submitting}>{t('common.save')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="cp-item-body">{c.comments}</div>
                  )}
                </div>
                <div className="cp-item-footer">
                  <span className="cp-date">{formatDate(c.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="cp-input-area">
        <textarea
          className="cp-input"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
          }}
          placeholder={t('comment.placeholder')}
          rows={2}
        />
        <button className="cp-btn-submit" onClick={handleAdd} disabled={!newText.trim() || submitting}>{t('comment.submit')}</button>
      </div>
    </div>,
    document.body,
  );
}
