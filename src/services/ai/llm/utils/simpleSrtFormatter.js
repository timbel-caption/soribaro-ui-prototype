/**
 * V2 간소화 SRT 포맷 유틸리티
 * 타임코드를 제거하고 시퀀스 번호를 {N} 중괄호로 감싼 포맷을 사용합니다.
 *
 * 입력/출력 예시:
 * {1}
 * 대한민국은 유독 매운맛에 진심인 나라이다
 *
 * {2}
 * 매년 더 맵고 더 자극적인 음식이 탄생하고 있다
 */

import { parseTimeString } from './srtFormatter';

/**
 * 자막 배열을 V2 간소화 포맷 문자열로 변환
 * 타임코드를 제거하고 시퀀스 번호를 {N}으로 래핑합니다.
 * @param {Array} subtitles - 자막 배열 [{ text, start, end, speaker }, ...]
 * @param {number} startIndex - 시작 인덱스 (0-based, 내부에서 1-based로 변환)
 * @returns {string} V2 포맷 문자열
 */
export function subtitlesToSimpleSRT(subtitles, startIndex = 0) {
  const lines = [];

  for (let i = 0; i < subtitles.length; i++) {
    const seq = startIndex + i + 1;
    const text = subtitles[i].text || '';
    lines.push(`{${seq}}\n${text}`);
  }

  return lines.join('\n\n');
}

/**
 * LLM 응답의 {N} 포맷을 파싱하여 세그먼트 배열로 변환
 * @param {string} responseText - LLM이 반환한 {N}\ntext 포맷 문자열
 * @returns {Array<{index: number, text: string}>} 파싱된 세그먼트 배열
 */
export function parseSimpleSRTResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];

  const segments = [];
  // {N} 패턴으로 블록 분리 — 번호 앞뒤 공백 허용
  const blockPattern = /\{(\d+)\}/g;
  const matches = [...responseText.matchAll(blockPattern)];

  for (let i = 0; i < matches.length; i++) {
    const index = parseInt(matches[i][1], 10);
    const contentStart = matches[i].index + matches[i][0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : responseText.length;
    const text = responseText.slice(contentStart, contentEnd).trim();

    segments.push({ index, text });
  }

  return segments;
}

/**
 * 파싱된 V2 응답을 원본 자막과 병합 (타임코드 재결합)
 * @param {Array<{index: number, text: string}>} parsedSegments - parseSimpleSRTResponse 결과
 * @param {Array} originalSubtitles - 원본 자막 배열 (메타데이터 참조용)
 * @param {number} chunkStartIndex - 청크 시작 인덱스 (0-based)
 * @returns {Array} 번역된 자막 배열
 */
export function mergeSimpleSRTResults(parsedSegments, originalSubtitles, chunkStartIndex = 0) {
  const indexedMap = new Map();
  for (const seg of parsedSegments) {
    indexedMap.set(seg.index, seg);
  }

  const results = [];
  for (let idx = 0; idx < originalSubtitles.length; idx++) {
    const original = originalSubtitles[idx];
    const seqNum = chunkStartIndex + idx + 1;
    const translated = indexedMap.get(seqNum);

    results.push({
      speaker: original.speaker ?? null,
      start: original.start,
      end: original.end,
      text: translated?.text ?? '',
      align: original.align || 'bottomCenter',
    });
  }

  return results;
}

/**
 * 누락된 시퀀스 번호 검출
 * @param {Array<{index: number, text: string}>} parsedSegments - 파싱된 세그먼트
 * @param {number} expectedStart - 예상 시작 인덱스 (1-based)
 * @param {number} expectedEnd - 예상 끝 인덱스 (1-based)
 * @returns {number[]} 누락된 인덱스 배열
 */
export function findMissingSimpleSRTSequences(parsedSegments, expectedStart, expectedEnd) {
  const receivedIndices = new Set(parsedSegments.map((s) => s.index));

  const missing = [];
  for (let i = expectedStart; i <= expectedEnd; i++) {
    if (!receivedIndices.has(i)) {
      missing.push(i);
    }
  }

  return missing;
}

/**
 * 누락분 재요청용 V2 포맷 생성
 * @param {Array} chunk - 원본 청크
 * @param {number[]} missingIndices - 누락 시퀀스 번호 배열 (1-based)
 * @param {number} chunkStartIndex - 청크 시작 인덱스 (0-based)
 * @returns {string} V2 포맷 문자열
 */
export function buildSimpleRetrySRT(chunk, missingIndices, chunkStartIndex) {
  const lines = [];

  for (const index of missingIndices) {
    const segmentIdx = index - chunkStartIndex - 1;
    if (segmentIdx < 0 || segmentIdx >= chunk.length) continue;

    const original = chunk[segmentIdx];
    const text = original?.text ?? '';
    lines.push(`{${index}}\n${text}`);
  }

  return lines.join('\n\n');
}

/**
 * V2 작품 정보를 프롬프트 블록으로 포맷
 * 비어있는 항목은 생략합니다.
 * @param {Object} workInfo - 작품 정보
 * @param {string} [workInfo.title] - 타이틀
 * @param {string} [workInfo.genre] - 장르 및 톤
 * @param {string} [workInfo.description] - 작품 설명
 * @param {string} [workInfo.glossary] - 용어 및 고유명사
 * @returns {string} 프롬프트에 삽입할 작품 정보 블록 (비어있으면 빈 문자열)
 */
export function formatWorkInfo(workInfo) {
  if (!workInfo) return '';

  const sections = [];

  if (workInfo.title?.trim()) {
    sections.push(`## Title\n${workInfo.title.trim()}`);
  }
  if (workInfo.genre?.trim()) {
    sections.push(`## Genre / Tone\n${workInfo.genre.trim()}`);
  }
  if (workInfo.description?.trim()) {
    sections.push(`## Description\n${workInfo.description.trim()}`);
  }
  if (workInfo.glossary?.trim()) {
    sections.push(`## Glossary / Proper Nouns\n${workInfo.glossary.trim()}`);
  }

  if (sections.length === 0) return '';

  return `\n\n# [Work Information]\n${sections.join('\n\n')}`;
}
