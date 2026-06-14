/**
 * Netflix Quality Check (QC) 규칙 정의
 * Netflix Timed Text Style Guide 기반
 *
 * ============================================================
 * 🔧 Netflix QC 규칙 추가 방법
 * ============================================================
 *
 * 1. NETFLIX_QC_RULES 객체에 새 규칙 추가
 * 2. validateNetflixQC 함수에 검사 로직 추가
 * 3. (선택) getSuggestedFix 함수에 수정 제안 로직 추가
 *
 * ============================================================
 */

import { secondsToTimeCode } from "./timeUtils";

/**
 * Netflix QC 규칙 정의
 */
export const NETFLIX_QC_RULES = {
  // ===== 타이밍 관련 =====
  MIN_DURATION: {
    id: "MIN_DURATION",
    label: "Minimum duration",
    description: "5/6 second (833 ms)",
    enabled: true,
    value: 833, // ms
  },
  MAX_DURATION: {
    id: "MAX_DURATION",
    label: "Maximum duration",
    description: "7 seconds per subtitle event",
    enabled: true,
    value: 7000, // ms
  },
  MAX_CPS: {
    id: "MAX_CPS",
    label: "Maximum characters per second",
    description: "12 characters per second (incl. white spaces)",
    enabled: true,
    value: 12,
    childrenValue: 12, // Children's Program
    sdhValue: 12, // SDH
  },
  FRAME_GAP_MIN: {
    id: "FRAME_GAP_MIN",
    label: "Frame gap: minimum",
    description: "minimum 2 frames",
    enabled: true,
    value: 2, // frames
  },

  // ===== 포맷 관련 =====
  TWO_LINES_MAX: {
    id: "TWO_LINES_MAX",
    label: "Two lines maximum",
    description: "Maximum 2 lines per subtitle",
    enabled: true,
    value: 2,
  },
  MAX_LINE_LENGTH: {
    id: "MAX_LINE_LENGTH",
    label: "Maximum line length",
    description: "Maximum characters per line",
    enabled: true,
    value: 42, // Netflix 기본값 (한국어는 16)
    koreanValue: 16,
  },

  // ===== 텍스트 스타일 관련 =====
  DUAL_SPEAKERS: {
    id: "DUAL_SPEAKERS",
    label: "Dual Speakers",
    description: "Use a hyphen with a space",
    enabled: true,
  },
  ELLIPSES: {
    id: "ELLIPSES",
    label: "Ellipses",
    description: "Use ellipses instead of three dots",
    enabled: true,
  },
  BRACKETS_FOR_SFX: {
    id: "BRACKETS_FOR_SFX",
    label: "Brackets for SFX",
    description: "Use brackets [] to enclose speaker IDs or sound effects",
    enabled: true,
  },
  NUMBERS_SPELL_OUT: {
    id: "NUMBERS_SPELL_OUT",
    label: "Numbers spell out",
    description:
      "When a number begins a sentence, it should always be spelled out",
    enabled: false, // 한국어에는 적용 안됨
  },
  NO_ITALIC: {
    id: "NO_ITALIC",
    label: "No italic",
    description: "Do not allow italic",
    enabled: true,
  },
  WHITE_SPACE: {
    id: "WHITE_SPACE",
    label: "White space",
    description: "Check for proper white space usage",
    enabled: true,
  },
  GLYPH_LIST: {
    id: "GLYPH_LIST",
    label: "Glyph List",
    description:
      "Only text/characters included in the Netflix Glyph List (version 2)",
    enabled: false, // 복잡한 검사라 기본 비활성
  },
};

/**
 * 언어별 설정
 */
export const LANGUAGE_SETTINGS = {
  korean: {
    name: "Korean",
    maxLineLength: 16,
    maxCps: 12,
    minDuration: 833,
    maxDuration: 7000,
  },
  english: {
    name: "English",
    maxLineLength: 42,
    maxCps: 20,
    minDuration: 833,
    maxDuration: 7000,
  },
  japanese: {
    name: "Japanese",
    maxLineLength: 13,
    maxCps: 7,
    minDuration: 833,
    maxDuration: 7000,
  },
};

/**
 * 줄 분리 (개행문자 및 <br /> 태그 처리)
 */
const splitLines = (text) => {
  // <br />, <br/>, <br> 및 \n 모두 줄 분리로 처리
  return text.split(/\n|<br\s*\/?>/gi);
};

/**
 * 줄 길이 초과 시 분할 제안 생성
 */
const suggestLineSplit = (line, maxLength) => {
  if (line.length <= maxLength) return line;

  // 최적의 분할 지점 찾기 (중간 근처의 공백)
  const midPoint = Math.floor(maxLength * 0.8);
  let splitIdx = -1;

  // 중간 지점 이전에서 공백 찾기
  for (let i = midPoint; i > 0; i--) {
    if (line[i] === " ") {
      splitIdx = i;
      break;
    }
  }

  // 못 찾으면 중간 지점 이후에서 찾기
  if (splitIdx === -1) {
    for (let i = midPoint; i < line.length; i++) {
      if (line[i] === " ") {
        splitIdx = i;
        break;
      }
    }
  }

  // 공백 없으면 maxLength 위치에서 분할
  if (splitIdx === -1) {
    splitIdx = maxLength;
  }

  return (
    line.substring(0, splitIdx) +
    "\n" +
    line.substring(splitIdx + (line[splitIdx] === " " ? 1 : 0))
  );
};

/**
 * 수정 제안 생성
 */
const getSuggestedFix = (rule, subtitle, issue) => {
  const text = subtitle.text || "";

  switch (rule) {
    case "MAX_LINE_LENGTH": {
      // 각 줄을 분할하여 수정 제안
      const lines = splitLines(text);
      const fixedLines = lines.map((line) => {
        if (line.length > issue.limit) {
          return suggestLineSplit(line, issue.limit);
        }
        return line;
      });
      return fixedLines.join("\n");
    }

    case "MAX_CPS": {
      // CPS 초과 시 시간 연장 제안 (타임코드 형식으로 표시)
      const charCount = text.replace(/\n|<br\s*\/?>/gi, "").length; // 줄바꿈 제외
      // CPS 제한보다 약간 여유있게 계산 (부동소수점 오차 방지)
      const targetCps = issue.limit - 0.5; // 11.5 CPS로 계산하여 확실히 통과
      const requiredDuration = charCount / targetCps;
      const newEndTime = subtitle.startTime + requiredDuration;

      const startTC = secondsToTimeCode(subtitle.startTime);
      const newEndTC = secondsToTimeCode(newEndTime);
      return `${startTC} --> ${newEndTC}`;
    }

    case "ELLIPSES": {
      // ... -> …
      return text.replace(/\.{3}/g, "…");
    }

    case "WHITE_SPACE": {
      // 연속 공백 제거, 앞뒤 공백 제거
      return text.replace(/[ \t]+/g, " ").trim();
    }

    case "DUAL_SPEAKERS": {
      // - 뒤에 공백 추가
      return text.replace(/^-([^\s])/gm, "- $1");
    }

    case "DUAL_SPEAKERS_MISSING": {
      // 모든 줄에 '- ' 추가 (없는 줄에만)
      const lines = splitLines(text);
      const fixedLines = lines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return line;
        if (trimmed.startsWith("- ")) return line;
        return "- " + line;
      });
      return fixedLines.join("\n");
    }

    case "FRAME_GAP_MIN": {
      // Frame gap 부족 시 현재 자막의 endTime을 줄여서 간격 확보
      // issue.nextStartTime: 다음 자막의 시작 시간
      // issue.minGapSeconds: 최소 간격 (초)
      if (
        issue.nextStartTime !== undefined &&
        issue.minGapSeconds !== undefined
      ) {
        const newEndTime = issue.nextStartTime - issue.minGapSeconds;
        // 새 endTime이 startTime보다 작으면 수정 불가
        if (newEndTime <= subtitle.startTime) {
          return "-";
        }
        const startTC = secondsToTimeCode(subtitle.startTime);
        const newEndTC = secondsToTimeCode(newEndTime);
        const currentGapFrames = issue.value?.toFixed(1) || "?";
        const requiredFrames = issue.limit || 2;
        return `${startTC} --> ${newEndTC} (${currentGapFrames}→${requiredFrames} frames)`;
      }
      return "-";
    }

    default:
      return "-";
  }
};

/**
 * Netflix QC 검수 함수
 * @param {Object} subtitle - 자막 객체
 * @param {number} index - 자막 인덱스
 * @param {Object[]} allSubtitles - 전체 자막 배열
 * @param {Object} settings - 언어 설정
 * @param {number} frameRate - 프레임레이트
 * @param {Object} enabledRules - 활성화된 규칙 (store에서 전달)
 * @returns {Object[]} 이슈 배열
 */
export const validateNetflixQC = (
  subtitle,
  index,
  allSubtitles,
  settings,
  frameRate = 29.97,
  enabledRules = {},
) => {
  const issues = [];
  const text = subtitle.text || "";
  const durationSec = subtitle.endTime - subtitle.startTime;
  const durationMs = durationSec * 1000;

  // 줄 분리 (개행문자 및 <br /> 태그 모두 처리)
  const lines = splitLines(text);

  // 글자 수 계산 (공백 포함, 줄바꿈 태그 제외)
  const charCount = text.replace(/\n|<br\s*\/?>/gi, "").length;
  const frameDuration = 1000 / frameRate; // ms per frame

  // 규칙 활성화 여부 확인 헬퍼 함수
  const isRuleEnabled = (ruleId) => {
    // enabledRules에 해당 규칙이 있으면 그 값 사용, 없으면 기본값 사용
    if (enabledRules[ruleId] !== undefined) {
      return enabledRules[ruleId].enabled !== false;
    }
    return NETFLIX_QC_RULES[ruleId]?.enabled !== false;
  };

  // ===== Minimum duration =====
  if (isRuleEnabled("MIN_DURATION")) {
    if (durationMs < settings.minDuration) {
      issues.push({
        rule: "MIN_DURATION",
        label: NETFLIX_QC_RULES.MIN_DURATION.label,
        description: `${durationMs.toFixed(0)}ms < ${settings.minDuration}ms`,
        severity: "error",
        value: durationMs,
        limit: settings.minDuration,
        suggestedFix: "-",
      });
    }
  }

  // ===== Maximum duration =====
  if (isRuleEnabled("MAX_DURATION")) {
    if (durationMs > settings.maxDuration) {
      issues.push({
        rule: "MAX_DURATION",
        label: NETFLIX_QC_RULES.MAX_DURATION.label,
        description: `${durationSec.toFixed(1)}s > ${settings.maxDuration / 1000}s`,
        severity: "warning",
        value: durationMs,
        limit: settings.maxDuration,
        suggestedFix: "-",
      });
    }
  }

  // ===== Maximum CPS =====
  if (isRuleEnabled("MAX_CPS") && durationSec > 0) {
    const cps = charCount / durationSec;
    if (cps > settings.maxCps) {
      // 다음 자막의 시작 시간 (있으면)
      const nextSubtitle =
        index < allSubtitles.length - 1 ? allSubtitles[index + 1] : null;
      const maxEndTime = nextSubtitle ? nextSubtitle.startTime - 0.001 : null;

      const suggestedFix = getSuggestedFix("MAX_CPS", subtitle, {
        limit: settings.maxCps,
      });

      // 수정 불가 여부 확인: 다음 자막과 겹쳐서 연장할 수 없는 경우
      let fixDisabled = false;
      let fixDisabledReason = null;
      if (maxEndTime !== null) {
        const targetCps = settings.maxCps - 0.5;
        const requiredDuration = charCount / targetCps;
        const requiredEndTime = subtitle.startTime + requiredDuration;
        if (requiredEndTime > maxEndTime) {
          fixDisabled = true;
          const actualDuration = maxEndTime - subtitle.startTime;
          const actualCps = charCount / actualDuration;
          fixDisabledReason = `다음 자막과 겹쳐 연장 불가 (최대 CPS: ${actualCps.toFixed(1)})`;
        }
      }

      issues.push({
        rule: "MAX_CPS",
        label: `Maximum ${settings.maxCps} characters per second`,
        description: `${cps.toFixed(1)} CPS`,
        severity: "error",
        value: cps,
        limit: settings.maxCps,
        suggestedFix,
        fixDisabled,
        fixDisabledReason,
      });
    }
  }

  // ===== Frame gap =====
  if (isRuleEnabled("FRAME_GAP_MIN") && index < allSubtitles.length - 1) {
    const nextSubtitle = allSubtitles[index + 1];
    const gapMs = (nextSubtitle.startTime - subtitle.endTime) * 1000;
    const gapFrames = gapMs / frameDuration;

    // 갭이 0보다 크고 최소 프레임 간격 미만인 경우 (부동소수점 오차 허용: 0.05 프레임)
    const minFrameGap = NETFLIX_QC_RULES.FRAME_GAP_MIN.value - 0.05;
    if (gapMs > 0 && gapFrames < minFrameGap) {
      // 최소 간격 (초) = 2프레임 * (1초/프레임레이트) + 여유
      const minGapSeconds =
        (NETFLIX_QC_RULES.FRAME_GAP_MIN.value * frameDuration) / 1000 + 0.001;

      const suggestedFix = getSuggestedFix("FRAME_GAP_MIN", subtitle, {
        nextStartTime: nextSubtitle.startTime,
        minGapSeconds: minGapSeconds,
        value: gapFrames,
        limit: NETFLIX_QC_RULES.FRAME_GAP_MIN.value,
      });

      issues.push({
        rule: "FRAME_GAP_MIN",
        label: "Frame gap: minimum",
        description: `${gapFrames.toFixed(1)} frames < ${NETFLIX_QC_RULES.FRAME_GAP_MIN.value} frames`,
        severity: "warning",
        value: gapFrames,
        limit: NETFLIX_QC_RULES.FRAME_GAP_MIN.value,
        suggestedFix,
      });
    }
  }

  // ===== Two lines maximum =====
  if (isRuleEnabled("TWO_LINES_MAX")) {
    const lineCount = lines.filter((l) => l.trim().length > 0).length;
    if (lineCount > NETFLIX_QC_RULES.TWO_LINES_MAX.value) {
      issues.push({
        rule: "TWO_LINES_MAX",
        label: NETFLIX_QC_RULES.TWO_LINES_MAX.label,
        description: `${lineCount} lines > ${NETFLIX_QC_RULES.TWO_LINES_MAX.value} lines`,
        severity: "error",
        value: lineCount,
        limit: NETFLIX_QC_RULES.TWO_LINES_MAX.value,
        suggestedFix: "-",
      });
    }
  }

  // ===== Maximum line length =====
  if (isRuleEnabled("MAX_LINE_LENGTH")) {
    lines.forEach((line) => {
      const lineLength = line.trim().length;
      if (lineLength > settings.maxLineLength) {
        const suggestedFix = getSuggestedFix("MAX_LINE_LENGTH", subtitle, {
          limit: settings.maxLineLength,
        });
        issues.push({
          rule: "MAX_LINE_LENGTH",
          label: `Single line length > ${settings.maxLineLength}`,
          description: `${lineLength} chars`,
          severity: "warning",
          value: lineLength,
          limit: settings.maxLineLength,
          suggestedFix,
        });
      }
    });
  }

  // ===== Ellipses =====
  if (isRuleEnabled("ELLIPSES")) {
    if (text.includes("...")) {
      const suggestedFix = getSuggestedFix("ELLIPSES", subtitle, {});
      issues.push({
        rule: "ELLIPSES",
        label: NETFLIX_QC_RULES.ELLIPSES.label,
        description: "Use ellipses (…) instead of three dots (...)",
        severity: "warning",
        suggestedFix,
      });
    }
  }

  // ===== Dual Speakers =====
  if (isRuleEnabled("DUAL_SPEAKERS")) {
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

    // 1. 하이픈 뒤에 공백 없는 경우 (줄 시작에서)
    if (/^-[^\s-]/m.test(text)) {
      const suggestedFix = getSuggestedFix("DUAL_SPEAKERS", subtitle, {});
      issues.push({
        rule: "DUAL_SPEAKERS",
        label: NETFLIX_QC_RULES.DUAL_SPEAKERS.label,
        description: "Use a hyphen with a space (- )",
        severity: "warning",
        suggestedFix,
      });
    }
    // 2. 여러 줄인 경우, 한 줄이 '- '로 시작하면 모든 줄이 '- '로 시작해야 함
    else if (nonEmptyLines.length > 1) {
      const linesWithHyphen = nonEmptyLines.filter((l) =>
        l.trim().startsWith("- "),
      );
      const linesWithoutHyphen = nonEmptyLines.filter(
        (l) => !l.trim().startsWith("- "),
      );

      // 일부 줄만 하이픈으로 시작하는 경우 (모두 있거나 모두 없어야 함)
      if (linesWithHyphen.length > 0 && linesWithoutHyphen.length > 0) {
        const suggestedFix = getSuggestedFix(
          "DUAL_SPEAKERS_MISSING",
          subtitle,
          {
            linesWithoutHyphen,
          },
        );
        issues.push({
          rule: "DUAL_SPEAKERS",
          label: NETFLIX_QC_RULES.DUAL_SPEAKERS.label,
          description: `Dual speaker format incomplete (${linesWithHyphen.length}/${nonEmptyLines.length} lines have hyphen)`,
          severity: "warning",
          suggestedFix,
        });
      }
    }
  }

  // ===== White space =====
  if (isRuleEnabled("WHITE_SPACE")) {
    // 앞뒤 공백 (줄별로 체크)
    const hasTrailingSpace = lines.some((line) => line !== line.trim());
    if (hasTrailingSpace) {
      const suggestedFix = getSuggestedFix("WHITE_SPACE", subtitle, {});
      issues.push({
        rule: "WHITE_SPACE",
        label: NETFLIX_QC_RULES.WHITE_SPACE.label,
        description: "Leading or trailing whitespace found",
        severity: "warning",
        suggestedFix,
      });
    }
  }

  // ===== No italic (HTML 태그 검사) =====
  if (isRuleEnabled("NO_ITALIC")) {
    if (/<i>|<\/i>|<em>|<\/em>/i.test(text)) {
      issues.push({
        rule: "NO_ITALIC",
        label: NETFLIX_QC_RULES.NO_ITALIC.label,
        description: "Italic formatting is not allowed",
        severity: "error",
        suggestedFix: "-",
      });
    }
  }

  return issues;
};

/**
 * 전체 자막 Netflix QC 검수
 * @param {Object[]} subtitles - 자막 배열
 * @param {string} language - 언어 설정
 * @param {number} frameRate - 프레임레이트
 * @param {Function} onProgress - 진행 콜백
 * @param {Object} enabledRules - 활성화된 규칙 (store에서 전달)
 */
export const runNetflixQC = async (
  subtitles,
  language = "korean",
  frameRate = 29.97,
  onProgress,
  enabledRules = {},
) => {
  const settings = LANGUAGE_SETTINGS[language] || LANGUAGE_SETTINGS.korean;
  const results = [];

  for (let i = 0; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const issues = validateNetflixQC(
      subtitle,
      i,
      subtitles,
      settings,
      frameRate,
      enabledRules,
    );

    if (issues.length > 0) {
      issues.forEach((issue) => {
        results.push({
          lineNumber: i + 1,
          subtitleId: subtitle.id,
          subtitle,
          index: i,
          ...issue,
          originalText: subtitle.text,
        });
      });
    }

    if (onProgress) {
      onProgress(
        Math.round(((i + 1) / subtitles.length) * 100),
        i + 1,
        subtitles.length,
      );
    }

    // UI 업데이트를 위한 짧은 딜레이
    if (subtitles.length > 20 && i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  return results;
};
