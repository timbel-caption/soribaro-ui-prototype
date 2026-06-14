import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { secondsToTimeCode } from "../../../utils/timeUtils";
import "./ReviewSummaryModal.css";

const FILTER = { ALL: "all", TAGS: "tags", COMMENTS: "comments" };

export default function ReviewSummaryModal({
  isOpen,
  onClose,
  subtitles,
  subtitleReviewTagMap,
  subtitleCommentMap,
  reviewTags,
  reviewGroups,
  onNavigate,
}) {
  const { t } = useTranslation("worktool");
  const [filter, setFilter] = useState(FILTER.ALL);

  const reviewTagById = useMemo(() => {
    const map = {};
    (reviewTags || []).forEach((tag) => {
      map[tag.id] = tag;
    });
    return map;
  }, [reviewTags]);

  const groupById = useMemo(() => {
    const map = {};
    (reviewGroups || []).forEach((g) => {
      map[g.id] = g;
    });
    return map;
  }, [reviewGroups]);

  const { items, totalTags, totalComments, totalScore } = useMemo(() => {
    if (!subtitles?.length) return { items: [], totalTags: 0, totalComments: 0, totalScore: 0 };

    let tagCount = 0;
    let commentCount = 0;
    let scoreSum = 0;

    const result = subtitles
      .map((sub, idx) => {
        const tags = subtitleReviewTagMap?.[sub.id] || [];
        const comments = subtitleCommentMap?.[sub.id] || [];
        if (tags.length === 0 && comments.length === 0) return null;

        tagCount += tags.length;
        commentCount += comments.length;
        tags.forEach((t) => {
          const master = reviewTagById[t.reviewTagId];
          if (master?.score) scoreSum += 1;
        });

        return { sub, idx, tags, comments };
      })
      .filter(Boolean);

    return { items: result, totalTags: tagCount, totalComments: commentCount, totalScore: scoreSum };
  }, [subtitles, subtitleReviewTagMap, subtitleCommentMap, reviewTagById]);

  const filteredItems = useMemo(() => {
    if (filter === FILTER.ALL) return items;
    if (filter === FILTER.TAGS) return items.filter((item) => item.tags.length > 0);
    return items.filter((item) => item.comments.length > 0);
  }, [items, filter]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="review-summary-overlay">
      <div className="review-summary-modal">
        <div className="review-summary-header">
          <h3>{t("reviewSummary.title")}</h3>
          <button onClick={onClose} className="review-summary-close">✕</button>
        </div>

        <div className="review-summary-stats">
          <span className="review-stat tag-stat">
            {t("reviewSummary.totalTags", { count: totalTags })}
          </span>
          <span className="review-stat comment-stat">
            {t("reviewSummary.totalComments", { count: totalComments })}
          </span>
          {totalScore > 0 && (
            <span className="review-stat score-stat">
              {t("reviewSummary.totalScore", { score: totalScore })}
            </span>
          )}
        </div>

        <div className="review-summary-filters">
          {Object.entries({
            [FILTER.ALL]: t("reviewSummary.filterAll"),
            [FILTER.TAGS]: t("reviewSummary.filterTagsOnly"),
            [FILTER.COMMENTS]: t("reviewSummary.filterCommentsOnly"),
          }).map(([key, label]) => (
            <button
              key={key}
              className={`review-filter-btn ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="review-summary-list">
          {filteredItems.length === 0 ? (
            <div className="review-summary-empty">
              <p>{t("reviewSummary.noData")}</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.sub.id}
                className="review-summary-item"
                onClick={() => onNavigate?.(item.sub.id)}
              >
                <div className="review-item-header">
                  <span className="review-item-num">#{item.idx + 1}</span>
                  <span className="review-item-time">
                    {secondsToTimeCode(item.sub.startTime)}
                  </span>
                  <span className="review-item-text">
                    {(item.sub.text || "").slice(0, 60)}
                    {(item.sub.text || "").length > 60 ? "..." : ""}
                  </span>
                </div>

                {item.tags.length > 0 && (
                  <div className="review-item-tags">
                    {item.tags.map((appliedTag) => {
                      const master = reviewTagById[appliedTag.reviewTagId];
                      if (!master) return null;
                      const group = groupById[master.groupId];
                      return (
                        <span key={appliedTag.id} className="review-tag-chip">
                          {group && <span className="review-tag-group">{group.name}</span>}
                          <span className="review-tag-name">{master.tag}</span>
                          {master.score > 0 && (
                            <span className="review-tag-score">-{master.score}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {item.comments.length > 0 && (
                  <div className="review-item-comments">
                    {item.comments.map((comment) => (
                      <div key={comment.id} className="review-comment-row">
                        <span className="review-comment-user">
                          {comment.createdBy || "—"}
                        </span>
                        <span className="review-comment-text">{comment.comments}</span>
                        <span className="review-comment-date">
                          {comment.createdAt
                            ? new Date(comment.createdAt).toLocaleDateString("ko-KR")
                            : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
