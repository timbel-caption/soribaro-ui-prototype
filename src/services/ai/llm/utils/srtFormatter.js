/**
 * SRT 포맷 유틸리티
 * 백엔드 srt-formatter.ts 로직을 JS로 포팅
 * 자막 데이터를 커스텀 SRT 포맷으로 변환/파싱합니다.
 */

/**
 * 초 단위 시간을 SRT 타임코드로 변환
 * @param {number} time - 초 단위 시간 (예: 65.123)
 * @returns {string} SRT 타임코드 (예: "00:01:05,123")
 */
export function timeFormatWithMillis(time) {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const millis = Math.round((time % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * SRT 타임코드를 초 단위로 변환
 * @param {string} formattedTime - SRT 타임코드 (예: "00:01:05,123")
 * @param {string} point - 밀리초 구분자 (기본값: ",")
 * @returns {number} 초 단위 시간 (예: 65.123)
 */
export function parseTimeFormatWithMillis(formattedTime, point = ',') {
  const [timePart, millisPart] = formattedTime.split(point);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  const millis = parseFloat(`0.${millisPart}`);
  return hours * 3600 + minutes * 60 + seconds + millis;
}

/**
 * 시간 문자열을 초 단위로 변환
 * @param {string} timeStr - 시간 문자열 (예: "00:00:01.500" 또는 "00:00:01,500")
 * @returns {number} 초 단위 시간
 */
export function parseTimeString(timeStr) {
  // . 또는 , 구분자 처리
  const normalizedStr = timeStr.replace(',', '.');
  const parts = normalizedStr.split(':');

  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }

  // 단순 숫자인 경우
  return parseFloat(normalizedStr);
}

/**
 * 자막 세그먼트를 내부 Segment 형식으로 변환
 * @param {Object} subtitle - 자막 데이터 { text, start, end, speaker }
 * @param {number} index - 세그먼트 인덱스
 * @returns {Object} Segment 형식
 */
export function subtitleToSegment(subtitle, index) {
  return {
    text: subtitle.text,
    name: subtitle.speaker ?? null,
    begin: parseTimeString(subtitle.start),
    end: parseTimeString(subtitle.end),
    startLine: index + 1,
    endLine: index + 1,
    index: index + 1,
  };
}

/**
 * Segment 배열을 커스텀 SRT 포맷 문자열로 변환
 * @param {number} startIndex - 시작 시퀀스 번호 (0-based, 내부에서 1 더함)
 * @param {Array} segments - Segment 배열
 * @returns {string} 커스텀 SRT 포맷 문자열
 */
export function formatSRT(startIndex, segments) {
  let formattedContent = '';
  let beforeEnd = 0.0;
  let index = startIndex;

  for (const segment of segments) {
    let begin = segment.begin;

    // 타임코드 겹침 보정
    if (
      beforeEnd > 0.0 &&
      (segment.begin < beforeEnd || segment.begin - beforeEnd < 0.011)
    ) {
      begin = beforeEnd + 0.001;
    }
    beforeEnd = segment.end;

    formattedContent += `|S|${++index}\n`;

    const name = segment.name || 'null';
    formattedContent += `|N|${name}\n`;

    formattedContent += `|T|${timeFormatWithMillis(begin)} --> ${timeFormatWithMillis(segment.end)}\n`;
    formattedContent += `|M|${segment.text}\n`;

    if (segment.startLine !== undefined && segment.startLine !== -1) {
      if (segment.startLine === segment.endLine) {
        formattedContent += `|G|${segment.startLine}\n`;
      } else {
        formattedContent += `|G|${segment.startLine}-${segment.endLine}\n`;
      }
    }

    formattedContent += `|E|\n\n`;
  }

  return formattedContent;
}

/**
 * |G| 범위 문자열을 파싱
 * @param {string} rangeContent - 범위 문자열 (예: "1-5" 또는 "1")
 * @returns {number[]} [시작번호, 끝번호] 배열
 */
function parseRange(rangeContent) {
  if (!rangeContent || !rangeContent.trim()) return [];

  const trimmed = rangeContent.trim();
  if (trimmed.includes('-')) {
    const [start, end] = trimmed.split('-').map(Number);
    return [start, end];
  }
  const value = Number(trimmed);
  return [value, value];
}

/**
 * LLM 응답 SRT 포맷을 Segment 배열로 파싱
 * @param {string} srtContent - LLM이 반환한 SRT 포맷 문자열
 * @returns {Array} Segment 배열
 */
export function parseSRTResponse(srtContent) {
  const segments = [];

  // |E| 기준으로 블록 분리
  const normalizedContent = srtContent.replace(/\|E\|\n/g, '|E|');
  const blocks = normalizedContent.split('|E|').filter((b) => b.trim());

  for (const block of blocks) {
    const segment = {};
    const lines = block.split('\n');
    let textLines = [];
    let isReadingText = false;

    for (const line of lines) {
      if (line.startsWith('|S|')) {
        // 시퀀스 번호 (인덱스 추출용)
        const indexStr = line.substring(3).trim();
        segment.index = parseInt(indexStr, 10);
        isReadingText = false;
      } else if (line.startsWith('|N|')) {
        const name = line.substring(3).trim();
        segment.name = name === 'null' ? null : name;
        isReadingText = false;
      } else if (line.startsWith('|T|')) {
        const timeStr = line.substring(3).trim();
        // ' --> ' 또는 '-->' 모두 처리
        const parts = timeStr.split(/\s*-->\s*/);
        if (parts.length >= 2 && parts[0] && parts[1]) {
          segment.begin = parseTimeFormatWithMillis(parts[0].trim(), ',');
          segment.end = parseTimeFormatWithMillis(parts[1].trim(), ',');
        }
        isReadingText = false;
      } else if (line.startsWith('|M|')) {
        const text = line.substring(3);
        textLines = [text];
        isReadingText = true;
      } else if (line.startsWith('|G|')) {
        const rangeContent = line.substring(3).trim();
        const range = parseRange(rangeContent);
        if (range.length >= 2) {
          segment.startLine = range[0];
          segment.endLine = range[1];
        }
        isReadingText = false;
      } else if (isReadingText && line.trim()) {
        // 멀티라인 텍스트 처리
        textLines.push(line);
      }
    }

    // 텍스트 조합
    if (textLines.length > 0) {
      segment.text = textLines.join('\n').trim();
    } else {
      segment.text = '';
    }

    // 유효한 세그먼트만 추가
    if (segment.begin !== undefined && segment.end !== undefined) {
      segments.push(segment);
    }
  }

  return segments;
}

/**
 * 자막 배열을 Segment 배열로 변환
 * @param {Array} subtitles - 자막 배열 [{ text, start, end, speaker }, ...]
 * @param {number} startIndex - 시작 인덱스 (0-based)
 * @returns {Array} Segment 배열
 */
export function subtitlesToSegments(subtitles, startIndex = 0) {
  return subtitles.map((sub, idx) => subtitleToSegment(sub, startIndex + idx));
}

/**
 * 자막 배열을 커스텀 SRT 포맷으로 변환
 * @param {Array} subtitles - 자막 배열 [{ text, start, end, speaker }, ...]
 * @param {number} startIndex - 시작 인덱스 (0-based)
 * @returns {string} 커스텀 SRT 포맷 문자열
 */
export function subtitlesToSRT(subtitles, startIndex = 0) {
  const segments = subtitlesToSegments(subtitles, startIndex);
  return formatSRT(startIndex, segments);
}

/**
 * 파싱된 SRT 응답을 원본 자막 형식으로 변환
 * @param {Array} parsedSegments - parseSRTResponse로 파싱된 세그먼트 배열
 * @param {Array} originalSubtitles - 원본 자막 배열 (메타데이터 참조용)
 * @param {number} chunkStartIndex - 청크 시작 인덱스 (0-based)
 * @returns {Array} 번역된 자막 배열
 */
export function mergeTranslatedSegments(parsedSegments, originalSubtitles, chunkStartIndex = 0) {
  const results = [];

  for (let idx = 0; idx < originalSubtitles.length; idx++) {
    const original = originalSubtitles[idx];
    const segmentIndex = chunkStartIndex + idx + 1; // 1-based index

    // 번역된 세그먼트 찾기 (index 또는 startLine으로 매칭)
    const translated = parsedSegments.find(
      (t) => (t.index ?? t.startLine) === segmentIndex
    );

    results.push({
      speaker: original.speaker ?? null,
      start: original.start,
      end: original.end,
      // 번역된 텍스트 그대로 사용 (없거나 빈 문자열이면 빈 문자열)
      text: translated?.text ?? '',
      align: original.align || 'bottomCenter',
      // 그룹 정보 (병합된 경우)
      ...(translated?.startLine !== translated?.endLine && {
        groupRange: [translated.startLine, translated.endLine],
      }),
    });
  }

  return results;
}

/**
 * 누락된 시퀀스 찾기
 * @param {Array} parsedSegments - 파싱된 세그먼트
 * @param {number} expectedStart - 예상 시작 인덱스 (1-based)
 * @param {number} expectedEnd - 예상 끝 인덱스 (1-based)
 * @returns {number[]} 누락된 인덱스 배열
 */
export function findMissingSequences(parsedSegments, expectedStart, expectedEnd) {
  const receivedIndices = new Set(
    parsedSegments
      .map((s) => s.index ?? s.startLine)
      .filter((i) => i !== undefined)
  );

  const missing = [];
  for (let i = expectedStart; i <= expectedEnd; i++) {
    if (!receivedIndices.has(i)) {
      missing.push(i);
    }
  }

  return missing;
}
