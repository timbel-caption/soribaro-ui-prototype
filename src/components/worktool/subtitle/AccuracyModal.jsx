import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getLatestWorkOriginal } from "../../../api/v9/subtitleWorks/index";
import { getProjectFileEvaluation } from "../../../api/v9/projectFileEvaluations/index";
import { secondsToTimeCode, timeCodeToSeconds } from "../../../utils/timeUtils";
import {
  classifyPair, classifyInsertDelete, classifyReplace,
} from "../../../utils/accuracyClassify";
import { computeAccuracyComparison } from "../../../utils/accuracyScore";
import { buildReportHTML, downloadReportPdf } from "../../../utils/accuracyReport";
import { downloadReportXlsx } from "../../../utils/accuracyExcel";
import { parseSubtitleJson } from "../../../utils/subtitleJsonFormat";
import { useTranslation } from "react-i18next";
import "./AccuracyModal.css";

function accuracyColor(value) {
  if (value >= 95) return "#34d399";
  if (value >= 80) return "#fbbf24";
  if (value >= 60) return "#fb923c";
  return "#f87171";
}

function AccuracyBadge({ value }) {
  return (
    <span
      className="accuracy-badge"
      style={{ "--badge-color": accuracyColor(value) }}
    >
      {value.toFixed(2)}%
    </span>
  );
}


function formatCueTime(sub, side) {
  if (!sub) return "";
  const fmt = (val) => {
    if (val == null) return "";
    return typeof val === "string" ? val : secondsToTimeCode(val);
  };
  const startPrimary = side === "orig" ? sub.start : sub.startTime;
  const startFallback = side === "orig" ? sub.startTime : sub.start;
  const endPrimary = side === "orig" ? sub.end : sub.endTime;
  const endFallback = side === "orig" ? sub.endTime : sub.end;
  const start = fmt(startPrimary != null ? startPrimary : startFallback);
  const end = fmt(endPrimary != null ? endPrimary : endFallback);
  if (!start && !end) return "";
  if (!end) return start;
  if (!start) return `- ${end}`;
  return `${start}\n- ${end}`;
}

export default function AccuracyModal({
  isOpen,
  onClose,
  onConfirm,
  projectFileId,
  currentSubtitles,
  speakers = {},
  reviewTags = [],
  subtitleReviewTagMap = {},
  summaryOnly = false,
  hideConfirmUntilDirty = false,
  preferSavedMetrics = false,
}) {
  const { t } = useTranslation("worktool");
  const alignedContainerRef = useRef(null);
  const [jumpTime, setJumpTime] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [originalSubtitles, setOriginalSubtitles] = useState([]);
  const [loadedRevision, setLoadedRevision] = useState(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [savedReason, setSavedReason] = useState(null);
  const [tableMode, setTableMode] = useState(false);
  const [activeTagFilters, setActiveTagFilters] = useState(new Set());
  const toggleTagFilter = (name) => {
    setActiveTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const [excludedErrorIds, setExcludedErrorIds] = useState(() => new Set());
  const [initialExcludedIds, setInitialExcludedIds] = useState(() => new Set());
  const [formErrorCount, setFormErrorCount] = useState(0);
  const [initialFormErrorCount, setInitialFormErrorCount] = useState(0);
  // 정확도/오류건수 수동 오버라이드 — null 이면 자동 계산값 사용.
  // 한 번 입력하면 비교 결과(제외 토글 등)가 바뀌어도 수동값 유지, ↺ 버튼으로 자동값 복귀.
  const [accuracyOverride, setAccuracyOverride] = useState(null);
  const [errorCountOverride, setErrorCountOverride] = useState(null);
  // project_file_evaluation 에 저장된 평가값 — preferSavedMetrics(조회 전용 진입) 시 재계산값 대신 표시
  const [savedMetrics, setSavedMetrics] = useState(null);
  const [hoveredError, setHoveredError] = useState(null); // { id, rect }
  const hoverTimeoutRef = useRef(null);

  const toggleExcludeError = useCallback((id) => {
    setExcludedErrorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDiffMouseMove = useCallback((e) => {
    const span = e.target.closest?.("[data-error-id]");
    if (!span) return;
    const id = span.dataset.errorId;
    clearTimeout(hoverTimeoutRef.current);
    setHoveredError((prev) => {
      if (prev?.id === id) return prev;
      return { id, rect: span.getBoundingClientRect() };
    });
  }, []);

  const handleDiffMouseLeave = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredError(null), 150);
  }, []);

  const handlePopoverEnter = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handlePopoverLeave = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredError(null), 150);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setHoveredError(null);
      clearTimeout(hoverTimeoutRef.current);
      return;
    }
    if (!projectFileId) return;
    setSavedReason(null);
    setExcludedErrorIds(new Set());
    setInitialExcludedIds(new Set());
    setFormErrorCount(0);
    setInitialFormErrorCount(0);
    setAccuracyOverride(null);
    setErrorCountOverride(null);
    setSavedMetrics(null);
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setLoadedRevision(null);
      try {
        const [response, evalResponse] = await Promise.all([
          getLatestWorkOriginal(projectFileId).catch((err) => {
            // 작업파일 원본이 아예 없는 경우만 null 처리. 그 외 에러는 throw.
            if (err?.status === 404) return null;
            throw err;
          }),
          getProjectFileEvaluation(projectFileId).catch(() => null),
        ]);
        if (cancelled) return;
        if (response?.status === "SUCCESS" && response.data?.subtitle) {
          setOriginalSubtitles(parseSubtitleJson(response.data.subtitle)?.subtitles ?? []);
          setLoadedRevision(response.data.revision ?? null);
        } else {
          setOriginalSubtitles([]);
          setError(t("accuracy.noOriginalData"));
        }
        if (evalResponse?.status === "SUCCESS" && evalResponse.data) {
          setSavedMetrics({
            accuracy: evalResponse.data.accuracy ?? null,
            errorCount: evalResponse.data.errorCount ?? null,
          });
          const fec = Number(evalResponse.data.formErrorCount) || 0;
          setFormErrorCount(fec);
          setInitialFormErrorCount(fec);
          if (evalResponse.data.reason) {
            try {
              const reason = JSON.parse(evalResponse.data.reason);
              setSavedReason(reason);
              if (Array.isArray(reason.excludedIds)) {
                const initial = new Set(reason.excludedIds);
                setExcludedErrorIds(initial);
                setInitialExcludedIds(initial);
              }
            } catch { /* invalid JSON, ignore */ }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("정확도 비교 원본 조회 실패:", err);
          setError(t("accuracy.loadFailed"));
          setOriginalSubtitles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectFileId, t]);

  const comparisonData = useMemo(() => {
    // 순수 계산부(정확도/오류/정렬/라인마킹)는 accuracyScore 코어로 위임.
    const core = computeAccuracyComparison({ originalSubtitles, currentSubtitles, speakers, excludedErrorIds });
    if (!core) return null;

    const { sortedOrig, sortedCurr, alignedRows, origPlain, currPlain } = core;
    const len = Math.max(sortedOrig.length, sortedCurr.length);

    // ─── 리뷰 태그 조회 (태그 의존: 코어에서 제외하고 컴포넌트에 남김) ───
    const reviewTagById = new Map();
    (reviewTags || []).forEach((tag) => {
      if (tag?.id != null) reviewTagById.set(tag.id, tag);
    });
    const resolveTags = (subtitleId) => {
      const applied = subtitleId != null ? subtitleReviewTagMap?.[subtitleId] : null;
      if (!applied || !applied.length) return [];
      return applied
        .map((rt) => reviewTagById.get(rt.reviewTagId))
        .filter(Boolean)
        .map((tag) => ({ name: tag.tag || "", description: tag.description || "" }));
    };

    // ─── 라인별 diff HTML 렌더 (HTML 의존: 코어에서 제외하고 컴포넌트에 남김) ───
    // origPlain/currPlain(\n-join)을 대상으로 classifyPair를 호출해 opcodes를 얻는다.
    // opcodes를 순회하며 라인별 HTML(origLineHtmls/currLineHtmls)을 만든다. 오류 id/excluded
    // 표시는 코어의 displayErrors 와 동일한 규칙으로 재현된다.
    // 라인 구조 변경(개행↔공백만 다른 구간)은 HTML에서도 평범한 텍스트처럼 처리한다.
    const esc = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
    const isLineStructRun = (a, b) => {
      if (!a.includes("\n") && !b.includes("\n")) return false;
      return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
    };

    const sameText = origPlain === currPlain;

    let origLineHtmls = null;
    let currLineHtmls = null;

    if (sameText) {
      // 완전 일치: DP 생략, HTML은 escape 처리된 평문으로 양쪽 동일하게 생성
      const segments = origPlain.split("\n").map(esc);
      origLineHtmls = segments;
      currLineHtmls = [...segments];
    } else {
      const cls = classifyPair(origPlain, currPlain);

      origLineHtmls = [];
      currLineHtmls = [];
      let origHtml = "";
      let currHtml = "";
      let origPos = 0;
      let currPos = 0;

      const pushOrigLine = () => {
        origLineHtmls.push(origHtml);
        origHtml = "";
      };
      const pushCurrLine = () => {
        currLineHtmls.push(currHtml);
        currHtml = "";
      };

      for (const op of cls.opcodes) {
        const a = op.a || "";
        const b = op.b || "";

        if (op.tag === "equal") {
          for (let i = 0; i < a.length; i++) {
            const ch = a[i];
            if (ch === "\n") {
              pushOrigLine();
              pushCurrLine();
            } else {
              const e = esc(ch);
              origHtml += e;
              currHtml += e;
            }
          }
        } else {
          const struct = isLineStructRun(a, b);
          let category;
          if (op.tag === "replace") category = classifyReplace(a, b);
          else if (op.tag === "delete") category = classifyInsertDelete(a) || "omission";
          else category = classifyInsertDelete(b) || "addition";

          let id = null;
          if (!struct) {
            id = `e-${origPos}-${currPos}-${op.tag[0]}`;
          }
          const excluded = id != null && excludedErrorIds.has(id);
          const idAttr = id ? ` data-error-id="${id}"` : "";

          if (a.length > 0) {
            const classes = struct
              ? "diff-struct"
              : `diff-delete err-${category}${excluded ? " diff-excluded" : ""}`;
            const segments = a.split("\n");
            for (let si = 0; si < segments.length; si++) {
              if (segments[si]) {
                origHtml += `<span class="${classes}"${idAttr}>${esc(segments[si])}</span>`;
              }
              if (si < segments.length - 1) pushOrigLine();
            }
          }
          if (b.length > 0) {
            const classes = struct
              ? "diff-struct"
              : `diff-insert err-${category}${excluded ? " diff-excluded" : ""}`;
            const segments = b.split("\n");
            for (let si = 0; si < segments.length; si++) {
              if (segments[si]) {
                currHtml += `<span class="${classes}"${idAttr}>${esc(segments[si])}</span>`;
              }
              if (si < segments.length - 1) pushCurrLine();
            }
          }
        }

        origPos += a.length;
        currPos += b.length;
      }
      pushOrigLine();
      pushCurrLine();
    }

    // 라인별 리뷰 태그 (원본/수정본 ID 모두 조회해 합집합)
    const lineTags = new Array(len).fill(null).map((_, idx) => {
      const origTags = resolveTags(sortedOrig[idx]?.id);
      const currTags = resolveTags(sortedCurr[idx]?.id);
      const seen = new Set();
      const merged = [];
      for (const t of [...origTags, ...currTags]) {
        const key = t.name;
        if (key && !seen.has(key)) { seen.add(key); merged.push(t); }
      }
      return merged;
    });

    // alignedRow 기준의 태그 조회 — 매칭된 양쪽의 태그 합집합
    const alignedTagsByRow = alignedRows.map((row) => {
      const origTags = row.origIdx != null ? resolveTags(sortedOrig[row.origIdx]?.id) : [];
      const currTags = row.currIdx != null ? resolveTags(sortedCurr[row.currIdx]?.id) : [];
      const seen = new Set();
      const merged = [];
      for (const t of [...origTags, ...currTags]) {
        if (t.name && !seen.has(t.name)) { seen.add(t.name); merged.push(t); }
      }
      return merged;
    });

    return { ...core, lineTags, alignedTagsByRow, origLineHtmls, currLineHtmls };
  }, [originalSubtitles, currentSubtitles, speakers, reviewTags, subtitleReviewTagMap, excludedErrorIds]);

  const tagSummary = useMemo(() => {
    if (!comparisonData?.lineTags) return { counts: [], filteredLines: null };
    const counts = new Map();
    comparisonData.lineTags.forEach((tags) => {
      if (!tags || !tags.length) return;
      const seen = new Set();
      for (const tg of tags) {
        if (!tg.name || seen.has(tg.name)) continue;
        seen.add(tg.name);
        counts.set(tg.name, (counts.get(tg.name) || 0) + 1);
      }
    });
    let filteredLines = null;
    if (activeTagFilters.size > 0) {
      filteredLines = new Set();
      comparisonData.lineTags.forEach((tags, idx) => {
        if (!tags) return;
        if (tags.some((tg) => activeTagFilters.has(tg.name))) filteredLines.add(idx);
      });
    }
    return {
      counts: Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
      filteredLines,
    };
  }, [comparisonData, activeTagFilters]);

  const shouldHideLine = useCallback(
    (idx, side = "curr") => {
      if (showErrorsOnly && comparisonData) {
        if (side === "orig") {
          if (!comparisonData.errorLinesOrig.has(idx)) return true;
        } else if (side === "both") {
          const hasErr =
            comparisonData.errorLines.has(idx) ||
            comparisonData.errorLinesOrig.has(idx);
          if (!hasErr) return true;
        } else {
          if (!comparisonData.errorLines.has(idx)) return true;
        }
      }
      if (tagSummary.filteredLines && !tagSummary.filteredLines.has(idx)) return true;
      return false;
    },
    [showErrorsOnly, comparisonData, tagSummary.filteredLines],
  );

  const shouldHideAlignedRow = useCallback(
    (row, rowIdx) => {
      if (!comparisonData) return false;
      if (showErrorsOnly) {
        const hasChange =
          row.kind !== "equal" ||
          row.modified ||
          row.speakerChanged ||
          (row.origIdx != null && comparisonData.errorLinesOrig.has(row.origIdx)) ||
          (row.currIdx != null && comparisonData.errorLines.has(row.currIdx));
        if (!hasChange) return true;
      }
      if (activeTagFilters.size > 0) {
        const tags = comparisonData.alignedTagsByRow?.[rowIdx] || [];
        if (!tags.some((tg) => activeTagFilters.has(tg.name))) return true;
      }
      return false;
    },
    [showErrorsOnly, comparisonData, activeTagFilters],
  );

  const displayEditDistance = comparisonData?.errorCounts
    ? Object.values(comparisonData.errorCounts).reduce((a, b) => a + b, 0)
    : 0;
  const displaySpeakerChanges = comparisonData?.speakerChanges;
  // 조회 전용(정확도 버튼) 진입 시 project_file_evaluation 저장값을 재계산값 대신 표시
  const savedAccuracyNum =
    preferSavedMetrics && savedMetrics?.accuracy != null ? Number(savedMetrics.accuracy) : null;
  const savedErrorCountNum =
    preferSavedMetrics && savedMetrics?.errorCount != null ? Number(savedMetrics.errorCount) : null;
  // 오류가 1건이라도 있으면 정확도 상한을 99.99% 로 clamp — 반올림으로 100%처럼 보이는 오해 방지
  const displayAccuracy = (() => {
    if (savedAccuracyNum != null) return savedAccuracyNum;
    const raw = comparisonData?.overallAccuracy;
    if (raw == null) return raw;
    const totalErrors = (displayEditDistance || 0) + (displaySpeakerChanges || 0);
    return totalErrors > 0 ? Math.min(raw, 99.99) : raw;
  })();
  const round2 = (v) => Math.round(v * 100) / 100;
  // 저장되는 오류 건수 기준 = 텍스트 오류 + 화자 변경 (onConfirm 의 finalErrorCount 와 동일)
  const autoErrorCount = (displayEditDistance ?? 0) + (displaySpeakerChanges ?? 0);
  const metricsEditable = !summaryOnly && !!onConfirm;
  const effectiveAccuracy = accuracyOverride ?? displayAccuracy;
  const isDirty = useMemo(() => {
    if (initialExcludedIds.size !== excludedErrorIds.size) return true;
    for (const id of excludedErrorIds) {
      if (!initialExcludedIds.has(id)) return true;
    }
    if (formErrorCount !== initialFormErrorCount) return true;
    if (accuracyOverride != null && displayAccuracy != null && round2(accuracyOverride) !== round2(displayAccuracy)) return true;
    if (errorCountOverride != null && errorCountOverride !== autoErrorCount) return true;
    return false;
  }, [initialExcludedIds, excludedErrorIds, formErrorCount, initialFormErrorCount,
      accuracyOverride, errorCountOverride, displayAccuracy, autoErrorCount]);
  const showConfirmButton = !!onConfirm && (!hideConfirmUntilDirty || isDirty);
  const displayErrorCounts = comparisonData?.errorCounts;
  const displayMatchedWords = comparisonData?.matchedWords;
  const displayTotalRefWords = comparisonData?.totalRefWords;
  const displayRawEditDistance = comparisonData?.editDistance;

  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const handleDownloadReport = useCallback(async () => {
    if (!comparisonData || downloadingReport) return;
    setDownloadingReport(true);
    try {
      const { sortedOrig, sortedCurr, alignedRows, alignedTagsByRow, origLineHtmls, currLineHtmls } = comparisonData;
      const escText = (s) => (s || "").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const rowKindOf = (row) =>
        row.kind === "equal" ? (row.modified ? "modified" : "equal") : row.kind;
      const rows = (alignedRows || []).map((row, rIdx) => {
        const orig = row.origIdx != null ? sortedOrig[row.origIdx] : null;
        const curr = row.currIdx != null ? sortedCurr[row.currIdx] : null;
        const refTime = formatCueTime(orig, "orig");
        const hypTime = formatCueTime(curr, "curr");
        const origHtml = row.origIdx != null ? origLineHtmls?.[row.origIdx] : null;
        const currHtml = row.currIdx != null ? currLineHtmls?.[row.currIdx] : null;
        const refHtml = origHtml ?? (orig ? escText(orig.text) : "");
        const hypHtml = currHtml ?? (curr ? escText(curr.text) : "");
        const tags = (alignedTagsByRow?.[rIdx] || []).map((tg) => tg.name);
        return { num: rIdx + 1, refTime, refHtml, hypTime, hypHtml, tags, kind: rowKindOf(row) };
      });

      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const fileName = `accuracy_report_${projectFileId || "file"}_${stamp}.pdf`;

      const html = buildReportHTML({
        meta: {
          title: t("accuracy.reportTitle"),
          subTitle: t("accuracy.reportSubTitle"),
          refName: t("accuracy.original"),
          hypName: t("accuracy.edited"),
        },
        accuracy: displayAccuracy,
        totalRefWords: displayTotalRefWords,
        matchedWords: displayMatchedWords,
        editDistance: displayRawEditDistance,
        errorCounts: displayErrorCounts,
        speakerChanges: displaySpeakerChanges ?? 0,
        rows,
        i18n: {
          overallAccuracy: t("accuracy.overallAccuracy"),
          matchedOf: t("accuracy.reportMatchedOf"),
          notReflected: t("accuracy.reportNotReflected"),
          speakerChanges: t("accuracy.reportSpeakerChanges"),
          fileInfo: t("accuracy.reportFileInfo"),
          refFile: t("accuracy.reportRefFile"),
          hypFile: t("accuracy.reportHypFile"),
          totalWords: t("accuracy.reportTotalWords"),
          matchedWords: t("accuracy.reportMatchedWords"),
          editDistance: t("accuracy.reportEditDistance"),
          errorByType: t("accuracy.reportErrorByType"),
          lineCompare: t("accuracy.reportLineCompare"),
          hint: t("accuracy.reportHint"),
          colNum: t("accuracy.reportColNum"),
          colRefTime: t("accuracy.reportColRefTime"),
          colRefText: t("accuracy.reportColRefText"),
          colHypTime: t("accuracy.reportColHypTime"),
          colHypText: t("accuracy.reportColHypText"),
          types: {
            typo: t("accuracy.errorTypes.typo"),
            space: t("accuracy.errorTypes.space"),
            punc: t("accuracy.errorTypes.punc"),
            omission: t("accuracy.errorTypes.omission"),
            addition: t("accuracy.errorTypes.addition"),
          },
        },
      });

      await downloadReportPdf({ html, filename: fileName });
    } catch (err) {
      console.error("리포트 다운로드 실패:", err);
      alert(t("accuracy.downloadFailed"));
    } finally {
      setDownloadingReport(false);
    }
  }, [comparisonData, displayAccuracy, displayTotalRefWords,
      displayMatchedWords, displayRawEditDistance, displayErrorCounts,
      displaySpeakerChanges, projectFileId, t, downloadingReport]);

  const handleDownloadXlsx = useCallback(async () => {
    if (!comparisonData || downloadingXlsx) return;
    setDownloadingXlsx(true);
    try {
      const { sortedOrig, sortedCurr, alignedRows, alignedTagsByRow } = comparisonData;
      const rowKindOf = (row) =>
        row.kind === "equal" ? (row.modified ? "modified" : "equal") : row.kind;
      const rows = (alignedRows || []).map((row, rIdx) => {
        const orig = row.origIdx != null ? sortedOrig[row.origIdx] : null;
        const curr = row.currIdx != null ? sortedCurr[row.currIdx] : null;
        const refTime = formatCueTime(orig, "orig");
        const hypTime = formatCueTime(curr, "curr");
        const refText = (orig?.text || "").trim();
        const hypText = (curr?.text || "").trim();
        const tags = (alignedTagsByRow?.[rIdx] || []).map((tg) => tg.name);
        // 행 종류에 따른 character-level diff opcodes 생성 — 표시 그리드와 동일한 정렬 기준
        let opcodes;
        if (row.kind === "equal") {
          opcodes = [{ tag: "equal", a: refText, b: hypText }];
        } else if (row.kind === "insert") {
          opcodes = [{ tag: "insert", a: "", b: hypText }];
        } else if (row.kind === "delete") {
          opcodes = [{ tag: "delete", a: refText, b: "" }];
        } else if (row.kind === "replace") {
          opcodes = classifyPair(refText, hypText).opcodes;
        } else {
          opcodes = null;
        }
        return { num: rIdx + 1, tags, refTime, hypTime, refText, hypText, opcodes, kind: rowKindOf(row) };
      });

      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const fileName = `accuracy_report_${projectFileId || "file"}_${stamp}.xlsx`;

      await downloadReportXlsx({
        meta: {
          refName: t("accuracy.original"),
          hypName: t("accuracy.edited"),
          subTitle: t("accuracy.reportSubTitle"),
        },
        summary: {
          accuracy: displayAccuracy,
          totalRefWords: displayTotalRefWords,
          matchedWords: displayMatchedWords,
          editDistance: displayRawEditDistance,
          errorCounts: displayErrorCounts,
          speakerChanges: displaySpeakerChanges ?? 0,
        },
        rows,
        labels: {
          summarySheet: t("accuracy.xlsxSummarySheet"),
          compareSheet: t("accuracy.xlsxCompareSheet"),
          reportTitle: t("accuracy.reportTitle"),
          overallAccuracy: t("accuracy.overallAccuracy"),
          matchedOf: t("accuracy.reportMatchedOf"),
          notReflected: t("accuracy.reportNotReflected"),
          speakerChanges: t("accuracy.reportSpeakerChanges"),
          fileInfo: t("accuracy.reportFileInfo"),
          refFile: t("accuracy.reportRefFile"),
          hypFile: t("accuracy.reportHypFile"),
          totalWords: t("accuracy.reportTotalWords"),
          matchedWords: t("accuracy.reportMatchedWords"),
          editDistance: t("accuracy.reportEditDistance"),
          errorByType: t("accuracy.reportErrorByType"),
          colNum: t("accuracy.reportColNum"),
          colTags: t("accuracy.xlsxColTags"),
          colRefTime: t("accuracy.reportColRefTime"),
          colRefText: t("accuracy.reportColRefText"),
          colHypTime: t("accuracy.reportColHypTime"),
          colHypText: t("accuracy.reportColHypText"),
          types: {
            typo: t("accuracy.errorTypes.typo"),
            space: t("accuracy.errorTypes.space"),
            punc: t("accuracy.errorTypes.punc"),
            omission: t("accuracy.errorTypes.omission"),
            addition: t("accuracy.errorTypes.addition"),
          },
        },
        filename: fileName,
      });
    } catch (err) {
      console.error("엑셀 다운로드 실패:", err);
      alert(t("accuracy.downloadFailed"));
    } finally {
      setDownloadingXlsx(false);
    }
  }, [comparisonData, displayAccuracy, displayTotalRefWords,
      displayMatchedWords, displayRawEditDistance, displayErrorCounts,
      displaySpeakerChanges, projectFileId, t, downloadingXlsx]);

  const handleJumpToTime = useCallback(() => {
    if (!jumpTime || !comparisonData) return;
    const parts = jumpTime.split(':').map(Number);
    let targetSec = 0;
    if (parts.length === 3) targetSec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    else if (parts.length === 2) targetSec = (parts[0] || 0) * 60 + (parts[1] || 0);
    else targetSec = parts[0] || 0;

    const subs = comparisonData.sortedOrig;
    let targetOrigIdx = 0;
    for (let i = 0; i < subs.length; i++) {
      const t = subs[i].start;
      const sec = typeof t === 'number' ? t : timeCodeToSeconds(t || '0');
      if (sec <= targetSec) targetOrigIdx = i;
      else break;
    }

    let targetRowIdx = -1;
    for (let r = 0; r < comparisonData.alignedRows.length; r++) {
      if (comparisonData.alignedRows[r].origIdx === targetOrigIdx) {
        targetRowIdx = r;
        break;
      }
    }
    const container = alignedContainerRef.current;
    if (!container || targetRowIdx < 0) return;
    const rowEl = container.querySelector(`[data-row-idx="${targetRowIdx}"]`);
    if (rowEl) {
      rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [jumpTime, comparisonData]);

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
    <div className="accuracy-modal-overlay">
      <div className="accuracy-modal">
        <div className="accuracy-modal-header">
          <h3>{t("accuracy.title")}</h3>
          <button onClick={onClose} className="accuracy-close-btn">
            ✕
          </button>
        </div>

        {loading && (
          <div className="accuracy-loading">
            <span className="accuracy-spinner"></span>
            <span>{t("accuracy.loading")}</span>
          </div>
        )}

        {error && !loading && (
          <div className="accuracy-error">
            <span className="accuracy-error-icon">!</span>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && comparisonData && (
          <>
            <div className="accuracy-summary">
              <div className="accuracy-progress-section">
                <span className="accuracy-progress-label">
                  {t("accuracy.overallAccuracy")}
                </span>
                <div className="accuracy-progress-bar">
                  <div
                    className="accuracy-progress-fill"
                    style={{
                      width: `${effectiveAccuracy}%`,
                      background: accuracyColor(effectiveAccuracy),
                    }}
                  />
                </div>
                {metricsEditable ? (
                  <span className="accuracy-metric-edit">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      className="accuracy-form-error-input accuracy-accuracy-input"
                      value={accuracyOverride ?? round2(displayAccuracy)}
                      onChange={(e) => {
                        const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                        setAccuracyOverride(v);
                      }}
                      onBlur={() => setAccuracyOverride((p) => (p == null ? p : round2(p)))}
                    />
                    <span className="accuracy-prop-label">%</span>
                    {accuracyOverride != null && (
                      <button
                        type="button"
                        className="accuracy-metric-reset"
                        onClick={() => setAccuracyOverride(null)}
                        title={t("accuracy.resetToAuto")}
                      >
                        ↺
                      </button>
                    )}
                  </span>
                ) : (
                  <>
                    <AccuracyBadge value={displayAccuracy} />
                    {savedAccuracyNum != null && (
                      <span className="accuracy-saved-tag">{t("accuracy.savedValueTag")}</span>
                    )}
                  </>
                )}
              </div>
              <div className="accuracy-properties">
                <div className="accuracy-property">
                  <span className="accuracy-prop-label">
                    {t("accuracy.origWords", {
                      count: comparisonData.origWordCount,
                    })}
                  </span>
                </div>
                <span className="accuracy-prop-dot" />
                <div className="accuracy-property">
                  <span className="accuracy-prop-label">
                    {t("accuracy.currWords", {
                      count: comparisonData.currWordCount,
                    })}
                  </span>
                </div>
                <span className="accuracy-prop-dot" />
                <div className={`accuracy-property${metricsEditable ? " accuracy-form-error" : ""}`}>
                  {metricsEditable ? (
                    <>
                      <span className="accuracy-prop-label">{t("accuracy.errorCountLabel")}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="accuracy-form-error-input"
                        value={errorCountOverride ?? autoErrorCount}
                        onChange={(e) => {
                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setErrorCountOverride(v);
                        }}
                      />
                      <span className="accuracy-prop-label">{t("accuracy.errorCountUnit")}</span>
                      {errorCountOverride != null && (
                        <button
                          type="button"
                          className="accuracy-metric-reset"
                          onClick={() => setErrorCountOverride(null)}
                          title={t("accuracy.resetToAuto")}
                        >
                          ↺
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="accuracy-prop-label">
                        {t("accuracy.errorCount", {
                          count: savedErrorCountNum ?? displayEditDistance,
                        })}
                      </span>
                      {savedErrorCountNum != null && (
                        <span className="accuracy-saved-tag">{t("accuracy.savedValueTag")}</span>
                      )}
                    </>
                  )}
                </div>
                <span className="accuracy-prop-dot" />
                <div className="accuracy-property accuracy-form-error">
                  <span className="accuracy-prop-label">
                    {t("accuracy.formErrorCountLabel")}
                  </span>
                  {summaryOnly || !onConfirm ? (
                    <span className="accuracy-prop-label">
                      {formErrorCount}{t("accuracy.formErrorCountUnit")}
                    </span>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="accuracy-form-error-input"
                        value={formErrorCount}
                        onChange={(e) => {
                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setFormErrorCount(v);
                        }}
                      />
                      <span className="accuracy-prop-label">{t("accuracy.formErrorCountUnit")}</span>
                    </>
                  )}
                </div>
                {displaySpeakerChanges > 0 && (
                  <>
                    <span className="accuracy-prop-dot" />
                    <div className="accuracy-property">
                      <span className="accuracy-prop-label accuracy-speaker-change">
                        {t("accuracy.speakerChanges", {
                          count: displaySpeakerChanges,
                        })}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {displayErrorCounts && (
                <div className="accuracy-error-types">
                  <span className="accuracy-error-type err-typo">{t("accuracy.errorTypes.typo")} {displayErrorCounts.typo}</span>
                  <span className="accuracy-error-type err-space">{t("accuracy.errorTypes.space")} {displayErrorCounts.space}</span>
                  <span className="accuracy-error-type err-punc">{t("accuracy.errorTypes.punc")} {displayErrorCounts.punc}</span>
                  <span className="accuracy-error-type err-omission">{t("accuracy.errorTypes.omission")} {displayErrorCounts.omission}</span>
                  <span className="accuracy-error-type err-addition">{t("accuracy.errorTypes.addition")} {displayErrorCounts.addition}</span>
                </div>
              )}
              {!summaryOnly && (
              <div className="accuracy-filter-actions">
                {displayEditDistance > 0 && (
                  <button
                    className={`accuracy-filter-btn ${showErrorsOnly ? "active" : ""}`}
                    onClick={() => setShowErrorsOnly((v) => !v)}
                  >
                    {showErrorsOnly
                      ? t("accuracy.showAll")
                      : t("accuracy.showErrorsOnly", { count: displayEditDistance })}
                  </button>
                )}
                {tagSummary.counts.length > 0 && (
                  <div className="accuracy-tag-filters">
                    <span className="accuracy-tag-filter-label">{t("accuracy.tagFilter")}:</span>
                    {tagSummary.counts.map((tc) => (
                      <button
                        key={tc.name}
                        className={`accuracy-tag-filter-btn ${activeTagFilters.has(tc.name) ? "active" : ""}`}
                        onClick={() => toggleTagFilter(tc.name)}
                        title={tc.name}
                      >
                        {tc.name} <span className="accuracy-tag-filter-count">{tc.count}</span>
                      </button>
                    ))}
                    {activeTagFilters.size > 0 && (
                      <button
                        className="accuracy-tag-filter-clear"
                        onClick={() => setActiveTagFilters(new Set())}
                      >
                        {t("accuracy.clearFilters")}
                      </button>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>

            {!summaryOnly && (<>
            <div className="accuracy-column-headers">
              <button
                className={`accuracy-table-toggle ${tableMode ? "active" : ""}`}
                onClick={() => setTableMode((v) => !v)}
                title={t("accuracy.tableMode")}
              >
                {tableMode ? t("accuracy.tableModeOn") : t("accuracy.tableModeOff")}
              </button>
              {!tableMode && (
                <>
                  <div className="accuracy-col-header">
                    {t("accuracy.original")}
                  </div>
                  <div className="accuracy-col-header">{t("accuracy.edited")}</div>
                </>
              )}
              {!tableMode && (
                <div className="accuracy-jump-control">
                  <input
                    type="text"
                    className="accuracy-jump-input"
                    value={jumpTime}
                    onChange={(e) => setJumpTime(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleJumpToTime(); }}
                    placeholder="00:00:00"
                  />
                  <button className="accuracy-jump-btn" onClick={handleJumpToTime}>
                    {t("accuracy.jumpToTime")}
                  </button>
                </div>
              )}
            </div>

            {tableMode ? (
              <div className="accuracy-table-wrap">
                <table className="accuracy-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>#</th>
                      <th style={{ width: 100 }}>{t("accuracy.reportColRefTime")}</th>
                      <th>{t("accuracy.reportColRefText")}</th>
                      <th style={{ width: 100 }}>{t("accuracy.reportColHypTime")}</th>
                      <th>{t("accuracy.reportColHypText")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(comparisonData.alignedRows || []).map((row, rIdx) => {
                      if (shouldHideAlignedRow(row, rIdx)) return null;
                      const orig = row.origIdx != null ? comparisonData.sortedOrig[row.origIdx] : null;
                      const curr = row.currIdx != null ? comparisonData.sortedCurr[row.currIdx] : null;
                      const refTime = formatCueTime(orig, "orig");
                      const hypTime = formatCueTime(curr, "curr");
                      const escText = (s) => (s || "").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                      const origHtml = row.origIdx != null
                        ? comparisonData.origLineHtmls?.[row.origIdx]
                        : null;
                      const currHtml = row.currIdx != null
                        ? comparisonData.currLineHtmls?.[row.currIdx]
                        : null;
                      const refHtml = origHtml ?? (orig ? escText(orig.text) : "");
                      const hypHtml = currHtml ?? (curr ? escText(curr.text) : "");
                      const tags = comparisonData.alignedTagsByRow?.[rIdx] || [];
                      const rowKindClass =
                        row.kind === "equal"
                          ? row.modified ? "row-modified" : ""
                          : `row-${row.kind}`;
                      const speakerOnly = row.kind === "equal" && !row.modified && row.speakerChanged;
                      const speakerCls = row.speakerChanged && !speakerOnly ? "row-speaker-changed" : "";
                      return (
                        <tr key={rIdx} className={`${rowKindClass} ${speakerCls}`.trim()}>
                          <td className="t-num">{rIdx + 1}</td>
                          <td className="t-time t-orig">{refTime}</td>
                          <td className="t-text t-orig">
                            {orig ? (
                              <>
                                {tags.length > 0 && (
                                  <div className="t-tag-row">
                                    {tags.map((tg, idx) => (
                                      <span key={idx} className="accuracy-line-tag" title={tg.description || tg.name}>{tg.name}</span>
                                    ))}
                                  </div>
                                )}
                                <span dangerouslySetInnerHTML={{ __html: refHtml }} />
                              </>
                            ) : (
                              <span className="t-empty" />
                            )}
                          </td>
                          <td className="t-time t-curr">{hypTime}</td>
                          <td className="t-text t-curr">
                            {curr ? (
                              <span dangerouslySetInnerHTML={{ __html: hypHtml }} />
                            ) : (
                              <span className="t-empty" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
            <div
              className="accuracy-aligned-content"
              onMouseMove={handleDiffMouseMove}
              onMouseLeave={handleDiffMouseLeave}
              ref={alignedContainerRef}
            >
              {(comparisonData.alignedRows || []).map((row, rIdx) => {
                if (shouldHideAlignedRow(row, rIdx)) return null;
                const orig = row.origIdx != null ? comparisonData.sortedOrig[row.origIdx] : null;
                const curr = row.currIdx != null ? comparisonData.sortedCurr[row.currIdx] : null;
                const origHtml = row.origIdx != null
                  ? comparisonData.origLineHtmls?.[row.origIdx]
                  : null;
                const currHtml = row.currIdx != null
                  ? comparisonData.currLineHtmls?.[row.currIdx]
                  : null;
                // errorLines는 텍스트 오류 + 화자 변경이 섞여 있어, 화자만 바뀐 행에서도 true가 됨.
                // 텍스트가 매칭된 equal 행이면 텍스트 오류일 수 없으므로 .changed 적용 안 함.
                const isSpeakerOnly = row.kind === "equal" && !row.modified && row.speakerChanged;
                const hasOrigErr =
                  !isSpeakerOnly && row.origIdx != null && comparisonData.errorLinesOrig.has(row.origIdx);
                const hasCurrErr =
                  !isSpeakerOnly && row.currIdx != null && comparisonData.errorLines.has(row.currIdx);
                const tags = comparisonData.alignedTagsByRow?.[rIdx] || [];
                const rowKindClass =
                  row.kind === "equal"
                    ? row.modified ? "kind-modified" : "kind-equal"
                    : `kind-${row.kind}`;
                const renderCell = (sub, idx, side, html, hasErr, speaker) => {
                  if (!sub) return <div className="accuracy-cell-placeholder" />;
                  const time = formatCueTime(sub, side);
                  const showSpeaker = !!(speaker || row.speakerChanged);
                  return (
                    <div className={`accuracy-line-item ${hasErr ? "changed" : ""} ${row.speakerChanged ? "speaker-changed" : ""}`}>
                      <span className="accuracy-line-num">{idx + 1}</span>
                      {showSpeaker && (
                        <span className={`accuracy-line-speaker ${row.speakerChanged ? "speaker-error" : ""}`} title={t("accuracy.speakerLabel")}>
                          {speaker || "—"}
                        </span>
                      )}
                      <span className="accuracy-line-time">{time}</span>
                      <span className="accuracy-line-text">
                        {html ? (
                          <span dangerouslySetInnerHTML={{ __html: html }} />
                        ) : (sub.text || "").trim() ? (
                          (sub.text || "").trim()
                        ) : (
                          <span className="accuracy-empty-text">{t("accuracy.emptyText")}</span>
                        )}
                      </span>
                    </div>
                  );
                };
                return (
                  <div
                    key={rIdx}
                    className={`accuracy-aligned-row ${rowKindClass}`}
                    data-row-idx={rIdx}
                  >
                    {tags.length > 0 && (
                      <div className="accuracy-aligned-tags">
                        {tags.map((tg, tIdx) => (
                          <span key={tIdx} className="accuracy-line-tag" title={tg.description || tg.name}>{tg.name}</span>
                        ))}
                      </div>
                    )}
                    <div className="accuracy-aligned-cells">
                      <div className="accuracy-aligned-cell left">
                        {renderCell(orig, row.origIdx, "orig", origHtml, hasOrigErr, row.origSpeaker)}
                      </div>
                      <div className="accuracy-aligned-cell right">
                        {renderCell(curr, row.currIdx, "curr", currHtml, hasCurrErr, row.currSpeaker)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            </>)}
          </>
        )}

        {!loading && !error && !comparisonData && (
          <div className="accuracy-empty">
            <span className="accuracy-empty-icon">—</span>
            <p>{t("accuracy.noData")}</p>
          </div>
        )}

        {comparisonData && !loading && !error && !summaryOnly && (
          <div className="accuracy-modal-footer">
            <div className="accuracy-download-group">
              <button
                className="accuracy-download-btn"
                onClick={handleDownloadXlsx}
                disabled={downloadingXlsx}
              >
                {downloadingXlsx ? t("accuracy.downloading") : t("accuracy.downloadReportXlsx")}
              </button>
              <button
                className="accuracy-download-btn accuracy-download-btn-secondary"
                onClick={handleDownloadReport}
                disabled={downloadingReport}
              >
                {downloadingReport ? t("accuracy.downloading") : t("accuracy.downloadReport")}
              </button>
            </div>
            {showConfirmButton && (
            <button
              className="accuracy-confirm-btn"
              onClick={() => {
                const errors = [];
                const { sortedOrig, sortedCurr, errorLines, speakerDiffs } = comparisonData;
                const len = Math.max(sortedOrig.length, sortedCurr.length);
                for (let i = 0; i < len; i++) {
                  if (!errorLines.has(i)) continue;
                  const orig = sortedOrig[i];
                  const curr = sortedCurr[i];
                  const sd = speakerDiffs[i];
                  const origText = (orig?.text || "").trim();
                  const currText = (curr?.text || "").trim();
                  const entry = { lineIndex: i };
                  if (sd?.changed) {
                    entry.type = "speaker";
                    entry.original = sd.origSpeaker || "";
                    entry.corrected = sd.currSpeaker || "";
                  } else {
                    entry.type = "text";
                    entry.original = origText;
                    entry.corrected = currText;
                  }
                  errors.push(entry);
                }
                // 수동 오버라이드가 있으면 그 값을 우선 저장
                const finalAccuracy = accuracyOverride ?? displayAccuracy;
                const finalErrorCount = errorCountOverride ?? autoErrorCount;
                onConfirm({
                  accuracy: finalAccuracy,
                  loadedRevision,
                  errorCount: finalErrorCount,
                  formErrorCount,
                  speakerChanges: displaySpeakerChanges ?? comparisonData.speakerChanges,
                  reason: JSON.stringify({
                    errors,
                    excludedIds: Array.from(excludedErrorIds),
                  }),
                });
              }
              }
            >
              {t("common.confirm")}
            </button>
            )}
          </div>
        )}
      </div>
      {hoveredError && (() => {
        const { rect, id } = hoveredError;
        const isExcluded = excludedErrorIds.has(id);
        return (
          <button
            type="button"
            className={`accuracy-exclude-popover${isExcluded ? " active" : ""}`}
            style={{
              position: "fixed",
              top: Math.max(4, rect.top - 28),
              left: Math.max(4, rect.left + rect.width / 2 - 24),
              zIndex: 1200,
            }}
            onMouseEnter={handlePopoverEnter}
            onMouseLeave={handlePopoverLeave}
            onClick={() => {
              toggleExcludeError(id);
              setHoveredError(null);
            }}
          >
            {isExcluded ? t("accuracy.markAsError") : t("accuracy.markAsNotError")}
          </button>
        );
      })()}
    </div>,
    document.body,
  );
}
