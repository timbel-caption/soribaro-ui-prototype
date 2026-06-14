import { calculateCps } from './cpsUtils';

/**
 * 자막 검수 규칙 정의
 *
 * ============================================================
 * 🔧 검수 조건 추가 방법
 * ============================================================
 * 
 * 1. VALIDATION_RULES 객체에 새 규칙 추가:
 *    
 *    MY_NEW_RULE: {
 *      id: 'MY_NEW_RULE',           // 고유 ID
 *      label: '규칙 이름',           // 표시 이름
 *      icon: '🔴',                   // 아이콘
 *      severity: 'error',           // 'error' | 'warning' | 'info'
 *      category: 'timing',          // 'timing' | 'content' | 'format' | 'quality'
 *      getMessage: (value, limit) => `메시지`, // 결과 메시지 함수
 *    }
 * 
 * 2. validateSubtitle 함수에 검사 로직 추가:
 *    
 *    // 내 규칙 검사
 *    if (조건) {
 *      issues.push({
 *        rule: VALIDATION_RULES.MY_NEW_RULE,
 *        value: 실제값,
 *        limit: 제한값,
 *      });
 *    }
 * 
 * 3. (선택) 분 단위 검사가 필요하면 validateByMinute 함수에 추가
 * 
 * ============================================================
 */

/**
 * 검수 규칙 정의
 * @type {Object.<string, ValidationRule>}
 */
export const VALIDATION_RULES = {
  // ===== 타이밍 관련 =====
  CPS_EXCEEDED: {
    id: 'CPS_EXCEEDED',
    label: 'CPS 초과',
    icon: '⚡',
    severity: 'error',
    category: 'timing',
    description: '초당 글자 수가 너무 많아 읽기 어려움',
    getMessage: (value, limit) => `초당 ${value.toFixed(1)}자 (제한: ${limit}자/초)`,
  },
  
  DURATION_TOO_SHORT: {
    id: 'DURATION_TOO_SHORT',
    label: '길이 부족',
    icon: '⏱️',
    severity: 'error',
    category: 'timing',
    description: '자막 표시 시간이 너무 짧음',
    getMessage: (value, limit) => `${(value * 1000).toFixed(0)}ms (최소: ${limit}ms)`,
  },
  
  DURATION_TOO_LONG: {
    id: 'DURATION_TOO_LONG',
    label: '길이 초과',
    icon: '⏳',
    severity: 'warning',
    category: 'timing',
    description: '자막 표시 시간이 너무 김',
    getMessage: (value, limit) => `${(value * 1000).toFixed(0)}ms (최대: ${limit}ms)`,
  },
  
  GAP_TOO_SHORT: {
    id: 'GAP_TOO_SHORT',
    label: '간격 부족',
    icon: '↔️',
    severity: 'error',
    category: 'timing',
    description: '다음 자막과의 간격이 너무 짧음',
    getMessage: (value, limit) => `다음 자막과 ${(value * 1000).toFixed(0)}ms 간격 (최소: ${limit}ms)`,
  },

  // ===== 포맷 관련 =====
  TOO_MANY_LINES: {
    id: 'TOO_MANY_LINES',
    label: '줄 수 초과',
    icon: '📄',
    severity: 'warning',
    category: 'format',
    description: '한 자막의 줄 수가 너무 많음',
    getMessage: (value, limit) => `${value}줄 (최대: ${limit}줄)`,
  },
  
  EMPTY_TEXT: {
    id: 'EMPTY_TEXT',
    label: '빈 자막',
    icon: '📭',
    severity: 'warning',
    category: 'content',
    description: '자막 텍스트가 비어있음',
    getMessage: () => '텍스트가 없습니다',
  },

  // ===== 품질 관련 (분 단위) =====
  WPM_EXCEEDED: {
    id: 'WPM_EXCEEDED',
    label: 'WPM 초과',
    icon: '📝',
    severity: 'warning',
    category: 'quality',
    description: '해당 구간의 분당 단어 수가 너무 많음',
    getMessage: (value, limit) => `${value} 단어/분 (제한: ${limit})`,
    isMinuteBased: true, // 분 단위 검사 표시
  },
};

/**
 * 개별 자막 검수 함수
 * @param {Object} subtitle - 자막 객체
 * @param {number} index - 자막 인덱스
 * @param {Object[]} allSubtitles - 전체 자막 배열
 * @param {Object} settings - 환경설정 (general)
 * @returns {Object[]} 이슈 배열
 */
export const validateSubtitle = (subtitle, index, allSubtitles, settings) => {
  const issues = [];
  const duration = subtitle.endTime - subtitle.startTime;
  const text = subtitle.text || '';
  const lineCount = text.split('\n').length;

  // ===== CPS (Characters Per Second) 검사 =====
  const cps = calculateCps(text, duration, settings.charCountPreset);
  if (cps > 0 && cps > settings.maxCharactersPerSec) {
    issues.push({
      rule: VALIDATION_RULES.CPS_EXCEEDED,
      value: cps,
      limit: settings.maxCharactersPerSec,
    });
  }

  // ===== 최소 지속 시간 검사 =====
  const minDurationSec = settings.minDurationMs / 1000;
  if (duration < minDurationSec) {
    issues.push({
      rule: VALIDATION_RULES.DURATION_TOO_SHORT,
      value: duration,
      limit: settings.minDurationMs,
    });
  }

  // ===== 최대 지속 시간 검사 =====
  const maxDurationSec = settings.maxDurationMs / 1000;
  if (duration > maxDurationSec) {
    issues.push({
      rule: VALIDATION_RULES.DURATION_TOO_LONG,
      value: duration,
      limit: settings.maxDurationMs,
    });
  }

  // ===== 자막 간 간격 검사 =====
  if (index < allSubtitles.length - 1) {
    const nextSubtitle = allSubtitles[index + 1];
    const gap = nextSubtitle.startTime - subtitle.endTime;
    const minGapSec = settings.minGapMs / 1000;
    
    if (gap < minGapSec && gap >= 0) {
      issues.push({
        rule: VALIDATION_RULES.GAP_TOO_SHORT,
        value: gap,
        limit: settings.minGapMs,
      });
    }
  }

  // ===== 줄 수 검사 =====
  if (lineCount > settings.maxNumberOfLines) {
    issues.push({
      rule: VALIDATION_RULES.TOO_MANY_LINES,
      value: lineCount,
      limit: settings.maxNumberOfLines,
    });
  }

  // ===== 빈 자막 검사 =====
  if (text.trim().length === 0) {
    issues.push({
      rule: VALIDATION_RULES.EMPTY_TEXT,
      value: 0,
      limit: 1,
    });
  }

  // ============================================================
  // 🔧 새로운 검사 규칙은 여기에 추가하세요
  // ============================================================
  // 예시:
  // if (조건) {
  //   issues.push({
  //     rule: VALIDATION_RULES.MY_NEW_RULE,
  //     value: 실제값,
  //     limit: 제한값,
  //   });
  // }

  return issues;
};

/**
 * 분 단위 검수 함수 (WPM 등)
 * @param {Object[]} subtitles - 전체 자막 배열
 * @param {Object} settings - 환경설정
 * @returns {Object[]} 분 단위 이슈 배열
 */
export const validateByMinute = (subtitles, settings) => {
  const minuteGroups = {};
  
  // 자막을 분 단위로 그룹화
  subtitles.forEach((subtitle, index) => {
    const minuteKey = Math.floor(subtitle.startTime / 60);
    if (!minuteGroups[minuteKey]) {
      minuteGroups[minuteKey] = {
        minute: minuteKey,
        subtitles: [],
        totalWords: 0,
      };
    }
    
    const text = subtitle.text || '';
    const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    
    minuteGroups[minuteKey].subtitles.push({ subtitle, index });
    minuteGroups[minuteKey].totalWords += wordCount;
  });
  
  // WPM 검사
  const results = [];
  Object.values(minuteGroups).forEach(group => {
    const wpm = group.totalWords;
    
    if (wpm > settings.maxWordsPerMin) {
      results.push({
        rule: VALIDATION_RULES.WPM_EXCEEDED,
        minute: group.minute,
        value: wpm,
        limit: settings.maxWordsPerMin,
        subtitles: group.subtitles,
      });
    }
  });
  
  return results.sort((a, b) => a.minute - b.minute);
};

/**
 * 심각도 우선순위
 */
export const SEVERITY_PRIORITY = {
  error: 3,
  warning: 2,
  info: 1,
};

/**
 * 이슈 목록에서 최고 심각도 반환
 * @param {Object[]} issues 
 * @returns {'error' | 'warning' | 'info' | null}
 */
export const getHighestSeverity = (issues) => {
  if (!issues || issues.length === 0) return null;
  
  let highest = null;
  let highestPriority = 0;
  
  issues.forEach(issue => {
    const priority = SEVERITY_PRIORITY[issue.rule.severity] || 0;
    if (priority > highestPriority) {
      highestPriority = priority;
      highest = issue.rule.severity;
    }
  });
  
  return highest;
};

/**
 * 심각도별 아이콘
 */
export const SEVERITY_ICONS = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
  pass: '✅',
};

