/**
 * 세그먼트 재분리 유틸리티
 * STT 결과의 words 배열을 기반으로 세그먼트를 재구성합니다.
 */

/**
 * 단어 사이 공백을 사용하지 않는 문자 체계 판별 패턴
 * - \u0E00-\u0E7F: 태국어 (Thai)
 * - \u0E80-\u0EFF: 라오어 (Lao)
 * - \u1000-\u109F: 미얀마어 (Myanmar)
 * - \u1780-\u17FF: 크메르어 (Khmer)
 * - \u3040-\u30FF: 일본어 히라가나/가타카나
 * - \u3400-\u4DBF: CJK 확장 한자 A
 * - \u4E00-\u9FFF: CJK 통합 한자
 * - \uF900-\uFAFF: CJK 호환 한자
 */
const NO_SPACE_SCRIPT_PATTERN = /[\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1780-\u17FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

/**
 * 기본 세그먼트 분리 옵션
 */
export const DEFAULT_SEGMENT_OPTIONS = {
  maxSegmentLength: 50,  // 최대 바이트 수 (한글 2바이트, 영어 1바이트)
  splitTimeGap: 2.0,     // 분리 기준 시간 간격 (초)
};

/**
 * 문자열의 바이트 길이 계산
 * - 한글, 한자, 일본어 등 2바이트 문자: 2
 * - 영어, 숫자, 기호 등 1바이트 문자: 1
 * @param {string} str - 계산할 문자열
 * @returns {number} 바이트 길이
 */
function getByteLength(str) {
  if (!str) return 0;
  
  let byteLength = 0;
  for (const char of str) {
    const code = char.charCodeAt(0);
    // ASCII 범위 (0x00-0x7F): 1바이트
    // 그 외 (한글, 한자, 일본어 등): 2바이트
    if (code <= 0x7F) {
      byteLength += 1;
    } else {
      byteLength += 2;
    }
  }
  return byteLength;
}

/**
 * 단어 배열을 세그먼트로 재분리
 * 
 * @param {Array} words - 단어 배열 (정규화된 형식)
 *   - { text, start, end, speakerId? }
 * @param {Object} options - 분리 옵션
 * @param {number} options.maxSegmentLength - 세그먼트 최대 문자 수 (기본: 50)
 * @param {number} options.splitTimeGap - 분리 기준 시간 간격 (초, 기본: 2.0)
 * @returns {Array} 세그먼트 배열
 */
export function resegmentSubtitles(words, options = {}) {
  const {
    maxSegmentLength = DEFAULT_SEGMENT_OPTIONS.maxSegmentLength,
    splitTimeGap = DEFAULT_SEGMENT_OPTIONS.splitTimeGap,
  } = options;

  if (!words || words.length === 0) {
    return [];
  }

  const segments = [];
  let currentSegment = {
    words: [],
    text: '',
    startTime: null,
    endTime: null,
    speakerId: null,
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // 빈 텍스트 건너뛰기
    if (!word.text || word.text.trim() === '') continue;

    // 새 세그먼트 시작 조건 체크
    const shouldStartNew = shouldStartNewSegment(currentSegment, word, {
      maxSegmentLength,
      splitTimeGap,
    });

    if (shouldStartNew && currentSegment.words.length > 0) {
      // 현재 세그먼트 저장
      segments.push(createSegmentEntry(currentSegment, segments.length));
      
      // 새 세그먼트 초기화
      currentSegment = {
        words: [],
        text: '',
        startTime: null,
        endTime: null,
        speakerId: null,
      };
    }

    // 현재 세그먼트에 단어 추가
    addWordToSegment(currentSegment, word);
  }

  // 마지막 세그먼트 저장
  if (currentSegment.words.length > 0) {
    segments.push(createSegmentEntry(currentSegment, segments.length));
  }

  return segments;
}

/**
 * 새 세그먼트를 시작해야 하는지 판단
 */
function shouldStartNewSegment(currentSegment, word, options) {
  const { maxSegmentLength, splitTimeGap } = options;
  
  // 첫 단어면 새 세그먼트 시작하지 않음
  if (currentSegment.words.length === 0) {
    return false;
  }

  // 1. 화자가 바뀌면 새 세그먼트
  if (word.speakerId && word.speakerId !== currentSegment.speakerId) {
    return true;
  }

  // 2. 현재 세그먼트 마지막 단어가 문장 끝 부호로 끝나면 새 세그먼트
  const lastWord = currentSegment.words[currentSegment.words.length - 1];
  if (lastWord && /[.!?。！？]$/.test(lastWord.text.trim())) {
    return true;
  }

  // 3. 바이트 수 초과하면 새 세그먼트 (한글 2바이트, 영어 1바이트)
  const currentByteLength = getByteLength(currentSegment.text);
  const wordByteLength = getByteLength(word.text);
  const isNoSpaceScript = NO_SPACE_SCRIPT_PATTERN.test(word.text);
  const lastCharIsNoSpaceScript = NO_SPACE_SCRIPT_PATTERN.test(currentSegment.text.slice(-1));
  const spaceBytes = (!isNoSpaceScript && !lastCharIsNoSpaceScript && currentSegment.text.length > 0) ? 1 : 0;
  
  const newByteLength = currentByteLength + spaceBytes + wordByteLength;
  if (newByteLength > maxSegmentLength) {
    return true;
  }

  // 4. 시간 간격이 기준 초과하면 새 세그먼트
  if (currentSegment.endTime !== null && word.start !== undefined) {
    const gap = word.start - currentSegment.endTime;
    if (gap > splitTimeGap) {
      return true;
    }
  }

  return false;
}

/**
 * 세그먼트에 단어 추가
 */
function addWordToSegment(segment, word) {
  segment.words.push(word);
  
  // 텍스트 연결 (단어 사이 공백 처리)
  if (segment.text.length > 0) {
    const isNoSpaceScript = NO_SPACE_SCRIPT_PATTERN.test(word.text);
    const lastCharIsNoSpaceScript = NO_SPACE_SCRIPT_PATTERN.test(segment.text.slice(-1));
    
    if (!isNoSpaceScript && !lastCharIsNoSpaceScript) {
      segment.text += ' ';
    }
  }
  segment.text += word.text;
  
  // 시간 업데이트
  if (segment.startTime === null && word.start !== undefined) {
    segment.startTime = word.start;
  }
  if (word.end !== undefined) {
    segment.endTime = word.end;
  }
  
  // 화자 업데이트
  if (word.speakerId) {
    segment.speakerId = word.speakerId;
  }
}

/**
 * 세그먼트 엔트리 생성
 */
function createSegmentEntry(segment, index) {
  return {
    id: `stt-${Date.now()}-${index}`,
    text: segment.text.trim(),
    startTime: segment.startTime || 0,
    endTime: segment.endTime || 0,
    speakerId: segment.speakerId,
    words: segment.words,
  };
}

/**
 * CLOVA words 형식을 정규화
 * CLOVA: [start_ms, end_ms, text]
 */
export function normalizeClovaWords(clovaWords, speakerId = null) {
  if (!clovaWords || !Array.isArray(clovaWords)) {
    return [];
  }

  return clovaWords.map(([startMs, endMs, text]) => ({
    text: text || '',
    start: startMs / 1000,  // ms → 초
    end: endMs / 1000,      // ms → 초
    speakerId,
  }));
}

/**
 * ElevenLabs words 형식을 정규화
 * ElevenLabs: { text, start, end, type, speaker_id }
 */
export function normalizeElevenLabsWords(elevenLabsWords) {
  if (!elevenLabsWords || !Array.isArray(elevenLabsWords)) {
    return [];
  }

  return elevenLabsWords
    .filter(word => word.type === 'word' || word.type === 'punctuation')
    .map(word => ({
      text: word.text || '',
      start: word.start,  // 이미 초 단위
      end: word.end,
      speakerId: word.speaker_id,
    }));
}

/**
 * CLOVA segments에서 모든 words를 추출하여 정규화
 */
export function extractWordsFromClovaSegments(segments) {
  if (!segments || !Array.isArray(segments)) {
    return [];
  }

  const allWords = [];
  
  for (const segment of segments) {
    if (segment.words && Array.isArray(segment.words)) {
      const speakerId = segment.speaker?.label || segment.diarization?.label || null;
      const normalizedWords = normalizeClovaWords(segment.words, speakerId);
      allWords.push(...normalizedWords);
    }
  }

  return allWords;
}

export default {
  resegmentSubtitles,
  normalizeClovaWords,
  normalizeElevenLabsWords,
  extractWordsFromClovaSegments,
  DEFAULT_SEGMENT_OPTIONS,
};
