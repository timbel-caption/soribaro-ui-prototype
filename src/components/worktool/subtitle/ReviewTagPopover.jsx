import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './ReviewTagPopover.css';

export default function ReviewTagPopover({
  groups,
  tags,
  appliedTags,
  onTagToggle,
  onClose,
  anchor,
}) {
  const { t } = useTranslation('worktool');
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [computedPos, setComputedPos] = useState(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

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

  const appliedTagIds = useMemo(
    () => new Set(appliedTags.map((t) => t.reviewTagId)),
    [appliedTags],
  );

  const filteredTags = useMemo(
    () => (selectedGroupId ? tags.filter((t) => t.groupId === selectedGroupId) : tags),
    [tags, selectedGroupId],
  );

  const handleToggle = (tag) => {
    const existing = appliedTags.find((t) => t.reviewTagId === tag.id);
    onTagToggle(tag.id, existing || null);
  };

  // 앵커 아래로 펼치되, viewport 하단을 벗어나면 위로 뒤집고, 그래도 부족하면 화면 안으로 클램프.
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
  }, [anchor, filteredTags.length, selectedGroupId]);

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
    <div className="review-tag-popover" ref={popoverRef} style={style} onClick={(e) => e.stopPropagation()}>
      <div className="rtp-groups">
        {groups.map((g) => (
          <button
            key={g.id}
            className={`rtp-group-item ${selectedGroupId === g.id ? 'active' : ''}`}
            onClick={() => setSelectedGroupId(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div className="rtp-tags">
        {filteredTags.length === 0 ? (
          <div className="rtp-empty">{t('reviewTag.noTags')}</div>
        ) : (
          filteredTags.map((tag) => {
            const colorIdx = tags.indexOf(tag) % 8;
            const isApplied = appliedTagIds.has(tag.id);
            return (
              <label key={tag.id} className={`rtp-tag-item tag-color-${colorIdx} ${isApplied ? 'applied' : ''}`}>
                <input type="checkbox" checked={isApplied} onChange={() => handleToggle(tag)} />
                <span className="rtp-tag-name">{tag.tag}</span>
                {tag.score !== 0 && <span className="rtp-tag-score">{tag.score > 0 ? '+' : ''}{tag.score}</span>}
              </label>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}
