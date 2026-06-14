import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { secondsToTimeCode } from '../../../utils/timeUtils';
import './CommentListModal.css';

function CommentGroup({
  subtitle,
  index,
  comments,
  appliedTags,
  reviewTags,
  currentUserId,
  onAdd,
  onUpdate,
  onDelete,
  onNavigate,
  isDeleted,
  t,
}) {
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(subtitle.id, text);
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
      await onUpdate(subtitle.id, commentId, text);
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
      await onDelete(subtitle.id, commentId);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return dateStr; }
  };

  return (
    <div className={`clm-group ${isDeleted ? 'deleted' : ''}`}>
      <div
        className={`clm-group-header ${isDeleted ? 'deleted' : ''}`}
        onClick={isDeleted ? undefined : () => onNavigate(subtitle.id)}
        title={isDeleted ? t('subtitle.commentListModal.deletedSubtitle') : t('subtitle.commentListModal.navigateHint')}
      >
        {isDeleted ? (
          <span className="clm-group-deleted-badge">{t('subtitle.commentListModal.deletedSubtitle')}</span>
        ) : (
          <>
            <span className="clm-group-index">#{index + 1}</span>
            <span className="clm-group-time">{secondsToTimeCode(subtitle.startTime)}</span>
            <span className="clm-group-text">
              {subtitle.text?.substring(0, 40) || '-'}
              {subtitle.text?.length > 40 ? '...' : ''}
            </span>
          </>
        )}
        <span className="clm-group-count">
          {appliedTags?.length > 0 && `${appliedTags.length} tags`}
          {appliedTags?.length > 0 && comments.length > 0 && ' / '}
          {comments.length > 0 && `${comments.length} comments`}
        </span>
      </div>

      {appliedTags?.length > 0 && (
        <div className="clm-tags">
          {appliedTags.map((rt) => {
            const tagIdx = reviewTags.findIndex((tag) => tag.id === rt.reviewTagId);
            const tagInfo = tagIdx >= 0 ? reviewTags[tagIdx] : null;
            if (!tagInfo) return null;
            return (
              <span
                key={rt.id}
                className={`clm-tag-badge tag-color-${tagIdx % 8}`}
                title={tagInfo.description || tagInfo.tag}
              >
                {tagInfo.tag}
              </span>
            );
          })}
        </div>
      )}

      {comments.length > 0 && <div className="clm-comments">
        {comments.map((c) => {
          const isMine = c.createdBy === currentUserId;
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className={`clm-comment ${isMine ? 'mine' : ''}`}>
              <div className="clm-comment-header">
                <span className="clm-author">{c.createdBy}</span>
                <span className="clm-date">{formatDate(c.createdAt)}</span>
                {isMine && !isEditing && (
                  <span className="clm-actions">
                    <button
                      onClick={() => { setEditingId(c.id); setEditText(c.comments || ''); }}
                      title={t('comment.editTitle')}
                    >✎</button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      title={t('comment.deleteTitle')}
                    >×</button>
                  </span>
                )}
              </div>
              {isEditing ? (
                <div className="clm-edit-area">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUpdate(c.id); }
                      if (e.key === 'Escape') { setEditingId(null); setEditText(''); }
                    }}
                    autoFocus
                  />
                  <div className="clm-edit-actions">
                    <button className="clm-btn-cancel" onClick={() => { setEditingId(null); setEditText(''); }}>{t('common.cancel')}</button>
                    <button className="clm-btn-save" onClick={() => handleUpdate(c.id)} disabled={submitting}>{t('common.save')}</button>
                  </div>
                </div>
              ) : (
                <div className="clm-comment-body">{c.comments}</div>
              )}
            </div>
          );
        })}
      </div>}

      {!isDeleted && (
        <div className="clm-input-area">
          <textarea
            className="clm-input"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
            }}
            placeholder={t('subtitle.commentListModal.addPlaceholder')}
            rows={1}
          />
          <button className="clm-btn-submit" onClick={handleAdd} disabled={!newText.trim() || submitting}>
            {t('comment.submit')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CommentListModal({
  isOpen,
  onClose,
  subtitles,
  subtitleCommentMap,
  subtitleReviewTagMap,
  reviewTags,
  onCommentAdd,
  onCommentUpdate,
  onCommentDelete,
  currentUserId,
  onNavigate,
}) {
  const { t } = useTranslation('worktool');

  const groupedItems = useMemo(() => {
    const subtitleMap = new Map();
    const sorted = subtitles
      ? [...subtitles].sort((a, b) => a.startTime - b.startTime)
      : [];
    sorted.forEach((sub, idx) => subtitleMap.set(sub.id, { sub, idx }));

    const itemIds = new Set();
    if (subtitleCommentMap) {
      for (const [id, arr] of Object.entries(subtitleCommentMap)) {
        if (arr?.length) itemIds.add(id);
      }
    }
    if (subtitleReviewTagMap) {
      for (const [id, arr] of Object.entries(subtitleReviewTagMap)) {
        if (arr?.length) itemIds.add(id);
      }
    }

    const groups = [];
    for (const itemId of itemIds) {
      const match = subtitleMap.get(itemId);
      groups.push({
        subtitle: match?.sub || { id: itemId, startTime: 0, text: null },
        index: match?.idx ?? -1,
        comments: subtitleCommentMap?.[itemId] || [],
        appliedTags: subtitleReviewTagMap?.[itemId] || [],
        isDeleted: !match,
      });
    }
    groups.sort((a, b) => {
      if (a.isDeleted !== b.isDeleted) return a.isDeleted ? 1 : -1;
      return a.index - b.index;
    });
    return groups;
  }, [subtitles, subtitleCommentMap, subtitleReviewTagMap]);

  const totalComments = useMemo(
    () => groupedItems.reduce((sum, g) => sum + g.comments.length, 0),
    [groupedItems],
  );

  const totalTags = useMemo(
    () => groupedItems.reduce((sum, g) => sum + g.appliedTags.length, 0),
    [groupedItems],
  );

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div className="clm-overlay" onClick={onClose}>
      <div className="clm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="clm-header">
          <h3>{t('subtitle.commentListModal.title')}</h3>
          <span className="clm-total">
            {t('subtitle.commentListModal.totalCount', { count: totalComments })}
            {totalTags > 0 && ` / ${t('subtitle.commentListModal.totalTagCount', { count: totalTags })}`}
          </span>
          <button className="clm-close" onClick={onClose}>✕</button>
        </div>

        <div className="clm-body">
          {groupedItems.length === 0 ? (
            <div className="clm-empty">{t('subtitle.commentListModal.noComments')}</div>
          ) : (
            groupedItems.map((g) => (
              <CommentGroup
                key={g.subtitle.id}
                subtitle={g.subtitle}
                index={g.index}
                comments={g.comments}
                appliedTags={g.appliedTags}
                reviewTags={reviewTags || []}
                currentUserId={currentUserId}
                onAdd={onCommentAdd}
                onUpdate={onCommentUpdate}
                onDelete={onCommentDelete}
                onNavigate={onNavigate}
                isDeleted={g.isDeleted}
                t={t}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
