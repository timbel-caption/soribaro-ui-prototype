import React, { useState, useMemo, useCallback } from "react";
import { useNetflixQCStore } from "../../../stores/netflixQCStore";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import { usePlaybackStore } from "../../../stores/playbackStore";
import { useModalStore } from "../../../stores/modalStore";
import {
  LANGUAGE_SETTINGS,
  NETFLIX_QC_RULES,
} from "../../../utils/netflixQCRules";
import { useTranslation } from "react-i18next";
import "./NetflixQCModal.css";

/**
 * Netflix QC 형식의 타임코드 (HH:MM:SS.mmm)
 */
const toNetflixTimeCode = (seconds) => {
  if (seconds === undefined || seconds === null || isNaN(seconds))
    return "00:00:00.000";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

/**
 * 타임코드 문자열을 초로 변환 (HH:MM:SS.mmm)
 */
const fromNetflixTimeCode = (timeCode) => {
  if (!timeCode) return 0;
  const match = timeCode.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;
  const [, h, m, s, ms] = match;
  return (
    parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000
  );
};

/**
 * Suggested Fix에서 시간 정보를 파싱 (HH:MM:SS.mmm --> HH:MM:SS.mmm)
 */
const parseTimeCodeFix = (suggestedFix) => {
  if (!suggestedFix) return null;
  const match = suggestedFix.match(
    /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/,
  );
  if (!match) return null;
  return {
    startTime: fromNetflixTimeCode(match[1]),
    endTime: fromNetflixTimeCode(match[2]),
  };
};

/**
 * Netflix QC 결과 항목 컴포넌트
 */
const QCResultItem = ({ result, onGoTo, onApplyFix, t }) => {
  const startTimeCode = toNetflixTimeCode(result.subtitle?.startTime);
  const endTimeCode = toNetflixTimeCode(result.subtitle?.endTime);
  const severityClass =
    result.severity === "error" ? "severity-error" : "severity-warning";

  // 텍스트 표시 (줄바꿈 유지)
  const displayText = result.originalText || "";

  // Suggested fix 표시 (줄바꿈을 \n으로)
  const displayFix =
    result.suggestedFix && result.suggestedFix !== "-"
      ? result.suggestedFix.replace(/\n/g, "\n")
      : null;

  // 수정 불가 여부 확인 (result.fixDisabled 필드 사용)
  const isFixDisabled = result.fixDisabled === true;
  const disabledReason = result.fixDisabledReason || null;

  // 적용 가능 여부: suggestedFix가 있고 '-'가 아니고 수정불가가 아닌 경우
  const canApplyFix = displayFix && displayFix !== "-" && !isFixDisabled;

  return (
    <tr className={`qc-result-row ${severityClass}`}>
      <td className="col-line">{result.lineNumber}</td>
      <td className="col-function">{result.label}</td>
      <td className="col-time">
        <span className="timeCode">{startTimeCode}</span>
        <span className="time-arrow">→</span>
        <span className="timeCode">{endTimeCode}</span>
      </td>
      <td className="col-text">
        <span className="text-content">{displayText}</span>
      </td>
      <td className="col-fix">
        {displayFix ? (
          <div className="suggested-fix">
            <span
              className={`fix-preview ${isFixDisabled ? "fix-disabled" : ""}`}
              title={displayFix}
            >
              {displayFix.length > 60
                ? displayFix.substring(0, 60) + "..."
                : displayFix}
            </span>
            {canApplyFix && (
              <button
                className="apply-fix-btn"
                onClick={() => onApplyFix(result)}
                title={t("netflixQC.applyFixTitle")}
              >
                ✓
              </button>
            )}
            {isFixDisabled && (
              <span className="fix-disabled-icon" title={disabledReason}>
                ✕
              </span>
            )}
          </div>
        ) : (
          <span className="no-fix">-</span>
        )}
      </td>
      <td className="col-actions">
        <button
          className="goto-btn"
          onClick={() => onGoTo(result)}
          title={t("netflixQC.goToSubtitleTitle")}
        >
          {t("validation.goTitle")}
        </button>
      </td>
    </tr>
  );
};

/**
 * Netflix QC 모달
 */
const NetflixQCModal = () => {
  const { t } = useTranslation("worktool");
  const { isNetflixQCOpen, closeNetflixQC } = useModalStore();
  const subtitles = useSubtitleStore((state) => state.subtitles);
  const updateSubtitle = useSubtitleStore((state) => state.updateSubtitle);
  const setCurrentTime = usePlaybackStore((state) => state.setCurrentTime);

  const {
    qcState,
    progress,
    currentIndex,
    totalCount,
    results,
    lastQCTime,
    language,
    frameRate,
    enabledRules,
    setLanguage,
    setFrameRate,
    toggleRule,
    startQC,
    resetQC,
    removeResult,
  } = useNetflixQCStore();

  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState("all"); // 'all' | 'errors' | 'warnings'

  // 필터링된 결과
  const filteredResults = useMemo(() => {
    if (filter === "all") return results;
    if (filter === "errors")
      return results.filter((r) => r.severity === "error");
    if (filter === "warnings")
      return results.filter((r) => r.severity === "warning");
    return results;
  }, [results, filter]);

  // 통계
  const stats = useMemo(() => {
    const errors = results.filter((r) => r.severity === "error").length;
    const warnings = results.filter((r) => r.severity === "warning").length;
    return { total: results.length, errors, warnings };
  }, [results]);

  // QC 시작
  const handleStartQC = useCallback(() => {
    startQC(subtitles);
  }, [subtitles, startQC]);

  // 해당 자막으로 이동
  const handleGoTo = useCallback(
    (result) => {
      if (result.subtitle) {
        setCurrentTime(result.subtitle.startTime);

        // 미디어 플레이어도 이동
        const mediaElement = document.querySelector("video, audio");
        if (mediaElement) {
          mediaElement.currentTime = result.subtitle.startTime;
        }
      }
    },
    [setCurrentTime],
  );

  // 수정 적용
  const handleApplyFix = useCallback(
    (result) => {
      if (
        !result.suggestedFix ||
        !result.subtitleId ||
        result.suggestedFix === "-"
      )
        return;

      const suggestedFix = result.suggestedFix;

      // 시간 수정 형식인지 확인 (HH:MM:SS.mmm --> HH:MM:SS.mmm)
      const timeFix = parseTimeCodeFix(suggestedFix);
      if (timeFix) {
        // 시간 수정 적용
        updateSubtitle(result.subtitleId, {
          startTime: timeFix.startTime,
          endTime: timeFix.endTime,
        });
      } else {
        // 텍스트 수정 적용
        updateSubtitle(result.subtitleId, { text: suggestedFix });
      }

      // 원본 results 배열에서 해당 result의 인덱스 찾기
      const originalIndex = results.findIndex(
        (r) => r.subtitleId === result.subtitleId && r.rule === result.rule,
      );

      // 수정 완료 후 결과 목록에서 제거
      if (originalIndex !== -1) {
        removeResult(originalIndex);
      }
    },
    [updateSubtitle, removeResult, results],
  );

  // 결과 내보내기
  const handleExport = useCallback(() => {
    if (results.length === 0) return;

    const lines = [
      "Line#\tFunction\tText\tSuggested fix",
      ...results.map((r) => {
        const startTimeCode = toNetflixTimeCode(r.subtitle?.startTime);
        const endTimeCode = toNetflixTimeCode(r.subtitle?.endTime);
        const displayText = (r.originalText || "").replace(/\n/g, " ");
        const text = `${startTimeCode} --> ${endTimeCode} ${displayText}`;
        const fix = (r.suggestedFix || "-").replace(/\n/g, " ");
        return `${r.lineNumber}\t${r.label}\t${text}\t${fix}`;
      }),
    ];

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `netflix-qc-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  if (!isNetflixQCOpen) return null;

  return (
    <div className="netflix-qc-modal-overlay">
      <div className="netflix-qc-modal">
        {/* 헤더 */}
        <div className="netflix-qc-header">
          <h2>{t("netflixQC.title")}</h2>
          <button className="close-btn" onClick={closeNetflixQC}>
            ×
          </button>
        </div>

        {/* 규칙 설정 패널 */}
        <div className="netflix-qc-rules">
          <div className="rules-header">
            <h3>{t("netflixQC.rulesLabel")}</h3>
            <div className="language-select">
              <label>{t("netflixQC.languageLabel")}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {Object.entries(LANGUAGE_SETTINGS).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="toggle-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
            >
              {showSettings
                ? t("netflixQC.hideRules")
                : t("netflixQC.showRules")}
            </button>
          </div>

          {showSettings && (
            <div className="rules-grid">
              {Object.entries(NETFLIX_QC_RULES).map(([key, rule]) => (
                <label key={key} className="rule-item">
                  <input
                    type="checkbox"
                    checked={enabledRules[key]?.enabled ?? rule.enabled}
                    onChange={() => toggleRule(key)}
                  />
                  <span className="rule-label">{rule.label}</span>
                  <span className="rule-desc">{rule.description}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="netflix-qc-actions">
          <div className="action-buttons">
            {qcState === "idle" && (
              <button className="start-btn" onClick={handleStartQC}>
                {t("netflixQC.startCheck")}
              </button>
            )}
            {qcState === "running" && (
              <div className="progress-section">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="progress-text">
                  {currentIndex} / {totalCount} ({progress}%)
                </span>
              </div>
            )}
            {qcState === "completed" && (
              <>
                <button className="restart-btn" onClick={resetQC}>
                  {t("netflixQC.recheck")}
                </button>
                <button className="export-btn" onClick={handleExport}>
                  {t("netflixQC.exportReport")}
                </button>
              </>
            )}
          </div>

          {qcState === "completed" && (
            <div className="filter-buttons">
              <button
                className={`filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                {t("netflixQC.totalCount", { total: stats.total })}
              </button>
              <button
                className={`filter-btn filter-error ${filter === "errors" ? "active" : ""}`}
                onClick={() => setFilter("errors")}
              >
                {t("netflixQC.errorCount", { errors: stats.errors })}
              </button>
              <button
                className={`filter-btn filter-warning ${filter === "warnings" ? "active" : ""}`}
                onClick={() => setFilter("warnings")}
              >
                {t("netflixQC.warningCount", { warnings: stats.warnings })}
              </button>
            </div>
          )}
        </div>

        {/* 결과 테이블 */}
        <div className="netflix-qc-results">
          {qcState === "completed" && filteredResults.length > 0 ? (
            <table className="results-table">
              <thead>
                <tr>
                  <th className="col-line">Line#</th>
                  <th className="col-function">Function</th>
                  <th className="col-time">Time</th>
                  <th className="col-text">Text</th>
                  <th className="col-fix">Suggested fix</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result, idx) => (
                  <QCResultItem
                    key={`${result.subtitleId}-${result.rule}-${idx}`}
                    result={result}
                    onGoTo={handleGoTo}
                    onApplyFix={handleApplyFix}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          ) : qcState === "completed" && filteredResults.length === 0 ? (
            <div className="no-issues">
              <span className="success-icon">✓</span>
              <p>{t("netflixQC.passedMessage")}</p>
            </div>
          ) : qcState === "idle" ? (
            <div className="start-prompt">
              <p>{t("netflixQC.startMessage")}</p>
              <p className="subtitle-count">
                {t("netflixQC.subtitleCountMessage", {
                  count: subtitles.length,
                })}
              </p>
            </div>
          ) : null}
        </div>

        {/* 하단 상태 표시 */}
        {qcState === "completed" && (
          <div className="netflix-qc-footer">
            <span className="issue-count">
              Netflix quality check found {stats.total} issues.
            </span>
            {lastQCTime && (
              <span className="last-check">
                {t("netflixQC.lastCheck", {
                  time: new Date(lastQCTime).toLocaleTimeString(),
                })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NetflixQCModal;
