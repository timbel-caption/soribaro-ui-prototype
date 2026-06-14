import { useState, useEffect, useMemo, useCallback } from "react";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import { usePlaybackStore } from "../../../stores/playbackStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useValidationStore } from "../../../stores/validationStore";
import {
  VALIDATION_RULES,
  SEVERITY_ICONS,
} from "../../../utils/validationRules";
import { countCharactersForCps } from "../../../utils/cpsUtils";
import { secondsToTimeCode } from "../../../utils/timeUtils";
import { useTranslation } from "react-i18next";
import "./ValidationModal.css";

// 개별 이슈 아이템 컴포넌트
function IssueItem({
  issue,
  subtitle,
  index,
  onFix,
  onSelect,
  isExpanded,
  onToggle,
}) {
  const { t } = useTranslation("worktool");
  const duration = subtitle.endTime - subtitle.startTime;
  const textPreview = (subtitle.text || "")
    .replace(/\n/g, " ")
    .substring(0, 50);

  return (
    <div className={`issue-item ${issue.rule.severity}`}>
      <div className="issue-header" onClick={onToggle}>
        <div className="issue-main">
          <span className="issue-index">#{index + 1}</span>
          <span className={`issue-badge ${issue.rule.severity}`}>
            {issue.rule.icon} {issue.rule.label}
          </span>
          <span className="issue-message">
            {issue.rule.getMessage(issue.value, issue.limit)}
          </span>
        </div>
        <div className="issue-actions-mini">
          <button
            className="btn-goto"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            title={t("validation.goToSubtitleTitle")}
          >
            ↗
          </button>
          <span className="expand-icon">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </div>

      {/* 자막 내용 미리보기 (항상 표시) */}
      <div className="issue-subtitle-preview" onClick={onToggle}>
        <span className="preview-time-inline">
          {secondsToTimeCode(subtitle.startTime)} →{" "}
          {secondsToTimeCode(subtitle.endTime)}
        </span>
        <span className="preview-text-inline">
          {textPreview || t("subtitle.emptySubtitle")}
          {(subtitle.text || "").length > 50 ? "..." : ""}
        </span>
      </div>

      {isExpanded && (
        <div className="issue-detail">
          <div className="subtitle-preview">
            <div className="preview-time">
              <span>{secondsToTimeCode(subtitle.startTime)}</span>
              <span className="time-arrow">→</span>
              <span>{secondsToTimeCode(subtitle.endTime)}</span>
              <span className="preview-duration">
                ({(duration * 1000).toFixed(0)}ms)
              </span>
            </div>
            <div className="preview-text">
              {subtitle.text || t("subtitle.emptySubtitle")}
            </div>
          </div>

          <div className="fix-suggestions">
            <span className="fix-label">해결 방법:</span>
            {issue.rule.id === "CPS_EXCEEDED" && (
              <div className="fix-options">
                <button onClick={() => onFix("extend-duration")}>
                  {t("validation.extendLength")}
                </button>
                <button onClick={() => onFix("shorten-text")}>
                  {t("validation.shortenText")}
                </button>
              </div>
            )}
            {issue.rule.id === "DURATION_TOO_SHORT" && (
              <div className="fix-options">
                <button onClick={() => onFix("extend-to-min")}>
                  {t("validation.extendToMinLength")}
                </button>
              </div>
            )}
            {issue.rule.id === "DURATION_TOO_LONG" && (
              <div className="fix-options">
                <button onClick={() => onFix("shrink-to-max")}>
                  {t("validation.shortenToMaxLength")}
                </button>
                <button onClick={() => onFix("split")}>
                  {t("validation.splitSubtitle")}
                </button>
              </div>
            )}
            {issue.rule.id === "GAP_TOO_SHORT" && (
              <div className="fix-options">
                <button onClick={() => onFix("adjust-gap")}>
                  {t("validation.adjustGap")}
                </button>
              </div>
            )}
            {issue.rule.id === "TOO_MANY_LINES" && (
              <div className="fix-options">
                <button onClick={() => onFix("merge-lines")}>
                  {t("validation.mergeLines")}
                </button>
              </div>
            )}
            {issue.rule.id === "EMPTY_TEXT" && (
              <div className="fix-options">
                <button onClick={() => onFix("edit-text")}>
                  {t("validation.enterText")}
                </button>
                <button onClick={() => onFix("delete")}>
                  {t("validation.deleteSubtitle")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ValidationModal({ isOpen, onClose }) {
  const { t } = useTranslation("worktool");
  const subtitles = useSubtitleStore((state) => state.subtitles);
  const updateSubtitle = useSubtitleStore((state) => state.updateSubtitle);
  const deleteSubtitle = useSubtitleStore((state) => state.deleteSubtitle);
  const selectSubtitle = useSubtitleStore((state) => state.selectSubtitle);
  const setSelectedTimeRange = useSubtitleStore(
    (state) => state.setSelectedTimeRange,
  );
  const setCurrentTime = usePlaybackStore((state) => state.setCurrentTime);
  const general = useSettingsStore((state) => state.general);

  // Validation Store
  const isValidating = useValidationStore((state) => state.isValidating);
  const progress = useValidationStore((state) => state.progress);
  const currentIndex = useValidationStore((state) => state.currentIndex);
  const totalCount = useValidationStore((state) => state.totalCount);
  const results = useValidationStore((state) => state.results);
  const minuteResults = useValidationStore((state) => state.minuteResults);
  const stats = useValidationStore((state) => state.stats);
  const lastValidatedAt = useValidationStore((state) => state.lastValidatedAt);
  const startValidation = useValidationStore((state) => state.startValidation);
  const clearResults = useValidationStore((state) => state.clearResults);
  const hasResults = useValidationStore((state) => state.hasResults);

  const [expandedItems, setExpandedItems] = useState(new Set());
  const [filterSeverity, setFilterSeverity] = useState("all");

  // 미디어 요소 참조
  const getMediaElement = useCallback(() => {
    return document.querySelector("video") || document.querySelector("audio");
  }, []);

  // 검수 시작
  const handleStartValidation = useCallback(() => {
    if (subtitles.length === 0) return;
    startValidation(subtitles, general);
  }, [subtitles, general, startValidation]);

  // 모달 열릴 때 자동 검수 시작 (결과가 없거나 자막이 변경된 경우)
  useEffect(() => {
    if (isOpen && subtitles.length > 0 && !hasResults()) {
      handleStartValidation();
    }
  }, [isOpen]);

  // 결과를 자막 기준으로 필터링
  const filteredResults = useMemo(() => {
    const items = [];

    subtitles.forEach((subtitle, index) => {
      const result = results[subtitle.id];
      if (result && result.issues && result.issues.length > 0) {
        const filteredIssues =
          filterSeverity === "all"
            ? result.issues
            : result.issues.filter(
                (issue) => issue.rule.severity === filterSeverity,
              );

        if (filteredIssues.length > 0) {
          items.push({
            subtitle,
            index,
            issues: filteredIssues,
          });
        }
      }
    });

    return items;
  }, [subtitles, results, filterSeverity]);

  // 자막으로 이동
  const handleSelectSubtitle = useCallback(
    (subtitle) => {
      selectSubtitle(subtitle.id);
      setSelectedTimeRange({
        startTime: subtitle.startTime,
        endTime: subtitle.endTime,
        shouldSeek: true,
      });
      setCurrentTime(subtitle.startTime);

      const mediaElement = getMediaElement();
      if (mediaElement) {
        mediaElement.currentTime = subtitle.startTime;
      }
    },
    [selectSubtitle, setSelectedTimeRange, setCurrentTime, getMediaElement],
  );

  // 수정 적용
  const handleFix = useCallback(
    (subtitle, index, fixType) => {
      const duration = subtitle.endTime - subtitle.startTime;

      switch (fixType) {
        case "extend-duration": {
          const text = subtitle.text || "";
          const charCount = countCharactersForCps(text, general.charCountPreset);
          const requiredDuration = charCount / general.maxCharactersPerSec;
          const newEndTime =
            subtitle.startTime + Math.max(duration, requiredDuration + 0.1);
          updateSubtitle(subtitle.id, { endTime: newEndTime });
          break;
        }
        case "extend-to-min": {
          const minDurationSec = general.minDurationMs / 1000;
          const newEndTime = subtitle.startTime + minDurationSec;
          updateSubtitle(subtitle.id, { endTime: newEndTime });
          break;
        }
        case "shrink-to-max": {
          const maxDurationSec = general.maxDurationMs / 1000;
          const newEndTime = subtitle.startTime + maxDurationSec;
          updateSubtitle(subtitle.id, { endTime: newEndTime });
          break;
        }
        case "adjust-gap": {
          if (index < subtitles.length - 1) {
            const minGapSec = general.minGapMs / 1000;
            const nextSubtitle = subtitles[index + 1];
            const newEndTime = nextSubtitle.startTime - minGapSec;
            if (newEndTime > subtitle.startTime) {
              updateSubtitle(subtitle.id, { endTime: newEndTime });
            }
          }
          break;
        }
        case "merge-lines": {
          const mergedText = (subtitle.text || "").replace(/\n/g, " ");
          updateSubtitle(subtitle.id, { text: mergedText });
          break;
        }
        case "edit-text":
        case "shorten-text":
        case "split": {
          handleSelectSubtitle(subtitle);
          break;
        }
        case "delete": {
          deleteSubtitle(subtitle.id);
          break;
        }
        default:
          break;
      }
    },
    [general, subtitles, updateSubtitle, deleteSubtitle, handleSelectSubtitle],
  );

  // 아이템 확장/축소 토글
  const toggleExpand = useCallback((key) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  // 모두 확장/축소
  const expandAll = useCallback(() => {
    const allKeys = new Set();
    filteredResults.forEach((result) => {
      result.issues.forEach((_, issueIdx) => {
        allKeys.add(`${result.subtitle.id}-${issueIdx}`);
      });
    });
    minuteResults.forEach((item) => {
      allKeys.add(`wpm-${item.minute}`);
    });
    setExpandedItems(allKeys);
  }, [filteredResults, minuteResults]);

  const collapseAll = useCallback(() => {
    setExpandedItems(new Set());
  }, []);

  if (!isOpen) return null;

  const passRate =
    stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 100;

  return (
    <div className="validation-modal-overlay">
      <div className="validation-modal">
        <div className="modal-header">
          <h2>{t("validation.title")}</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* 진행률 표시 (검수 중) */}
        {isValidating && (
          <div className="validation-progress-section">
            <div className="progress-info">
              <span className="progress-label">
                {t("validation.validating")}
              </span>
              <span className="progress-count">
                {currentIndex + 1} / {totalCount}
              </span>
            </div>
            <div className="progress-bar-large">
              <div
                className="progress-fill-animated"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="progress-percent">{progress}%</span>
          </div>
        )}

        {/* 통계 요약 */}
        {!isValidating && stats.total > 0 && (
          <div className="validation-summary">
            <div className="summary-stat total">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">{t("validation.all")}</span>
            </div>
            <div className="summary-stat passed">
              <span className="stat-value">{stats.passed}</span>
              <span className="stat-label">{t("validation.pass")}</span>
            </div>
            <div className="summary-stat failed">
              <span className="stat-value">{stats.failed}</span>
              <span className="stat-label">{t("validation.fail")}</span>
            </div>
            <div className="summary-stat errors">
              <span className="stat-value">{stats.errors}</span>
              <span className="stat-label">{t("validation.error")}</span>
            </div>
            <div className="summary-stat warnings">
              <span className="stat-value">{stats.warnings}</span>
              <span className="stat-label">{t("validation.warning")}</span>
            </div>
            <div className="summary-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${passRate}%` }}
                />
              </div>
              <span className="progress-text">
                {t("validation.passRate", { passRate })}
              </span>
            </div>
          </div>
        )}

        {/* 필터 및 컨트롤 */}
        {!isValidating && stats.total > 0 && (
          <div className="validation-controls">
            <div className="filter-tabs">
              <button
                className={`filter-tab ${filterSeverity === "all" ? "active" : ""}`}
                onClick={() => setFilterSeverity("all")}
              >
                {t("validation.all")}
              </button>
              <button
                className={`filter-tab error ${filterSeverity === "error" ? "active" : ""}`}
                onClick={() => setFilterSeverity("error")}
              >
                {t("validation.error")} ({stats.errors})
              </button>
              <button
                className={`filter-tab warning ${filterSeverity === "warning" ? "active" : ""}`}
                onClick={() => setFilterSeverity("warning")}
              >
                {t("validation.warning")} ({stats.warnings})
              </button>
            </div>
            <div className="expand-controls">
              <button onClick={expandAll} className="btn-expand">
                {t("validation.expandAll")}
              </button>
              <button onClick={collapseAll} className="btn-expand">
                {t("validation.collapseAll")}
              </button>
            </div>
          </div>
        )}

        {/* 이슈 목록 */}
        <div className="validation-content">
          {isValidating ? (
            <div className="validating-message">
              <div className="spinner-large"></div>
              <p>{t("validation.validatingMessage")}</p>
            </div>
          ) : (
            <>
              {/* 분 단위 WPM 초과 섹션 */}
              {minuteResults.length > 0 &&
                (filterSeverity === "all" || filterSeverity === "warning") && (
                  <div className="wpm-section">
                    <div className="wpm-section-header">
                      <span className="wpm-icon"></span>
                      <span className="wpm-title">
                        {t("validation.wpmExceeded")}
                      </span>
                      <span className="wpm-count">
                        {t("validation.segmentCount", {
                          count: minuteResults.length,
                        })}
                      </span>
                    </div>
                    <div className="wpm-list">
                      {minuteResults.map((item) => {
                        const minuteStart = item.minute * 60;
                        const minuteEnd = (item.minute + 1) * 60;
                        const isExpanded = expandedItems.has(
                          `wpm-${item.minute}`,
                        );

                        return (
                          <div
                            key={`wpm-${item.minute}`}
                            className="wpm-item warning"
                          >
                            <div
                              className="wpm-item-header"
                              onClick={() => toggleExpand(`wpm-${item.minute}`)}
                            >
                              <span className="wpm-time">
                                {Math.floor(minuteStart / 60)}:
                                {String(minuteStart % 60).padStart(2, "0")}~
                                {Math.floor(minuteEnd / 60)}:
                                {String(minuteEnd % 60).padStart(2, "0")}
                              </span>
                              <span className="wpm-badge">
                                {t("validation.wpmValue", {
                                  value: item.value,
                                  limit: item.limit,
                                })}
                              </span>
                              <span className="wpm-subtitle-count">
                                {t("validation.subtitleCount", {
                                  count: item.subtitles.length,
                                })}
                              </span>
                              <span className="expand-icon">
                                {isExpanded ? "▼" : "▶"}
                              </span>
                            </div>

                            {isExpanded && (
                              <div className="wpm-detail">
                                <div className="wpm-subtitles">
                                  {item.subtitles.map(({ subtitle, index }) => {
                                    const text = subtitle.text || "";
                                    const wordCount = text
                                      .trim()
                                      .split(/\s+/)
                                      .filter((w) => w.length > 0).length;

                                    return (
                                      <div
                                        key={subtitle.id}
                                        className="wpm-subtitle-item"
                                        onClick={() =>
                                          handleSelectSubtitle(subtitle)
                                        }
                                      >
                                        <span className="wpm-sub-index">
                                          #{index + 1}
                                        </span>
                                        <span className="wpm-sub-time">
                                          {secondsToTimeCode(
                                            subtitle.startTime,
                                          )}
                                        </span>
                                        <span className="wpm-sub-words">
                                          {wordCount}단어
                                        </span>
                                        <span className="wpm-sub-text">
                                          {text
                                            .replace(/\n/g, " ")
                                            .substring(0, 40)}
                                          {text.length > 40 ? "..." : ""}
                                        </span>
                                        <button
                                          className="btn-goto"
                                          title={t("validation.goTitle")}
                                        >
                                          ↗
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="wpm-hint">
                                  {t("validation.wpmSuggestion")}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* 개별 자막 이슈 */}
              {filteredResults.length === 0 && minuteResults.length === 0 ? (
                <div className="no-issues">
                  <div className="no-issues-icon">OK</div>
                  <p>
                    {filterSeverity === "all"
                      ? t("validation.allPassed")
                      : t("validation.noSeverityItems", {
                          severity:
                            filterSeverity === "error"
                              ? t("validation.error")
                              : t("validation.warning"),
                        })}
                  </p>
                </div>
              ) : (
                filteredResults.length > 0 && (
                  <div className="issues-list">
                    <div className="issues-section-header">
                      <span>{t("validation.individualIssues")}</span>
                    </div>
                    {filteredResults.map((result) =>
                      result.issues.map((issue, issueIdx) => {
                        const key = `${result.subtitle.id}-${issueIdx}`;
                        return (
                          <IssueItem
                            key={key}
                            issue={issue}
                            subtitle={result.subtitle}
                            index={result.index}
                            isExpanded={expandedItems.has(key)}
                            onToggle={() => toggleExpand(key)}
                            onSelect={() =>
                              handleSelectSubtitle(result.subtitle)
                            }
                            onFix={(fixType) =>
                              handleFix(result.subtitle, result.index, fixType)
                            }
                          />
                        );
                      }),
                    )}
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* 검수 기준 안내 */}
        {!isValidating && (
          <div className="validation-criteria">
            <details>
              <summary>{t("validation.currentCriteria")}</summary>
              <div className="criteria-grid">
                <div className="criteria-item">
                  <span className="criteria-label">Max CPS</span>
                  <span className="criteria-value">
                    {general.maxCharactersPerSec} 자/초
                  </span>
                </div>
                <div className="criteria-item">
                  <span className="criteria-label">Max WPM</span>
                  <span className="criteria-value">
                    {general.maxWordsPerMin} 단어/분
                  </span>
                </div>
                <div className="criteria-item">
                  <span className="criteria-label">Min Duration</span>
                  <span className="criteria-value">
                    {general.minDurationMs} ms
                  </span>
                </div>
                <div className="criteria-item">
                  <span className="criteria-label">Max Duration</span>
                  <span className="criteria-value">
                    {general.maxDurationMs} ms
                  </span>
                </div>
                <div className="criteria-item">
                  <span className="criteria-label">Min Gap</span>
                  <span className="criteria-value">{general.minGapMs} ms</span>
                </div>
                <div className="criteria-item">
                  <span className="criteria-label">Max Lines</span>
                  <span className="criteria-value">
                    {general.maxNumberOfLines} 줄
                  </span>
                </div>
              </div>
            </details>
          </div>
        )}

        {/* 마지막 검수 시간 */}
        {lastValidatedAt && !isValidating && (
          <div className="validation-timestamp">
            {t("validation.lastValidation", {
              time: new Date(lastValidatedAt).toLocaleTimeString(),
            })}
          </div>
        )}

        <div className="modal-footer">
          <button
            className="btn-revalidate"
            onClick={handleStartValidation}
            disabled={isValidating || subtitles.length === 0}
          >
            {t("validation.revalidate")}
          </button>
          <button className="btn-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
