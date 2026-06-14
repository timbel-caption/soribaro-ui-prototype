import { exportToDFXP } from './dfxpUtils';
import { exportToSMI } from './smiUtils';
import { exportToSRT } from './srtUtils';
import { exportToVTT } from './vttUtils';
import { createEncodedBlob } from './encodingUtils';
import { serializeSubtitleJson } from './subtitleJsonFormat';
import { SUPPORTED_FORMATS } from '../components/worktool/subtitle/FormatModal';

export const DOWNLOAD_FORMATS = SUPPORTED_FORMATS.filter((f) => f.id !== 'json');

export const DOCUMENT_DOWNLOAD_FORMATS = [
  { id: 'hwp', name: 'HWP', extension: '.hwp', mimeType: 'application/x-hwp' },
  { id: 'json', name: 'JSON', extension: '.json', mimeType: 'application/json' },
  { id: 'txt', name: 'TXT', extension: '.txt', mimeType: 'text/plain' },
];

function timeCodeToSeconds(tc) {
  if (!tc) return 0;
  const parts = tc.split(':');
  if (parts.length < 3) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const secParts = parts[2].split(/[,\.]/);
  const s = parseInt(secParts[0], 10) || 0;
  const ms = parseInt((secParts[1] || '0').padEnd(3, '0').substring(0, 3), 10) || 0;
  return h * 3600 + m * 60 + s + ms / 1000;
}

export function normalizeSubtitles(subtitles) {
  return subtitles.map((sub) => ({
    ...sub,
    startTime: sub.startTime ?? timeCodeToSeconds(sub.start),
    endTime: sub.endTime ?? timeCodeToSeconds(sub.end),
  }));
}

export function convertSubtitles(formatId, subtitles, title = 'SoriBaro_Subtitles', langCode = 'ko') {
  const normalized = normalizeSubtitles(subtitles);
  switch (formatId) {
    case 'dfxp': return exportToDFXP(normalized, title, langCode);
    case 'smi':  return exportToSMI(normalized, title, langCode);
    case 'srt':  return exportToSRT(normalized);
    case 'vtt':  return exportToVTT(normalized);
    default:     return null;
  }
}

function secondsToTimeCode(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * 여러 파일의 자막을 타임라인 연속으로 병합한다.
 * 각 파일의 playTm(재생시간, 초)을 기준으로 다음 파일의 시간 오프셋을 계산한다.
 * @param {Array<{ subtitles: Array, playTm: number }>} filesData - 파일 순서대로 정렬된 배열
 * @returns {Array} 병합된 자막 배열
 */
export function mergeSubtitleFiles(filesData) {
  // 1단계: 시간 offset만 적용하여 자막 합치기 (파일별 고유 speaker 키 생성)
  const raw = [];
  let timeOffset = 0;
  let fileIdx = 0;

  for (const { subtitles, playTm } of filesData) {
    const normalized = normalizeSubtitles(subtitles);
    for (const sub of normalized) {
      const newStartTime = sub.startTime + timeOffset;
      const newEndTime = sub.endTime + timeOffset;
      const origNum = sub.speaker ? parseInt(sub.speaker, 10) : 0;
      raw.push({
        ...sub,
        startTime: newStartTime,
        endTime: newEndTime,
        start: secondsToTimeCode(newStartTime),
        end: secondsToTimeCode(newEndTime),
        _fileIdx: fileIdx,
        _origSpeaker: origNum,
        _speakerName: (sub.speakerName || '').trim(),
      });
    }
    timeOffset += Number(playTm) || 0;
    fileIdx++;
  }

  return _dedupAndAssignSpeakerNumbers(raw);
}

/**
 * 동일 원본 파일 내 N분할 세그먼트들의 자막을 병합한다.
 * - 세그먼트들은 부모 파일의 절대 타임라인을 공유하므로 시간 오프셋을 적용하지 않는다.
 * - 각 자막에 `_chunkIndex`(세그먼트 인덱스) 를 부여해 분할 경계 충돌 검출
 *   (`detectOverlaps`) 의 입력으로 그대로 사용할 수 있게 한다.
 * - 화자(speaker) dedup-by-name 정규화는 mergeSubtitleFiles 와 동일하게 수행.
 *
 * @param {Array<{ subtitles: Array }>} segmentsData - 세그먼트 순서대로 정렬된 배열
 * @returns {Array} 시간순으로 정렬된 자막 배열 (각 항목에 `_chunkIndex` 포함)
 */
export function mergeSubtitleSegments(segmentsData) {
  const raw = [];
  let segIdx = 0;
  for (const { subtitles } of segmentsData) {
    const normalized = normalizeSubtitles(subtitles);
    for (const sub of normalized) {
      const origNum = sub.speaker ? parseInt(sub.speaker, 10) : 0;
      raw.push({
        ...sub,
        _chunkIndex: segIdx,
        _fileIdx: segIdx,
        _origSpeaker: origNum,
        _speakerName: (sub.speakerName || '').trim(),
      });
    }
    segIdx++;
  }
  return _dedupAndAssignSpeakerNumbers(raw).sort(
    (a, b) => (a.startTime || 0) - (b.startTime || 0),
  );
}

// 공유 헬퍼: speakerName 기준 화자 dedup + 빈틈 없는 번호 재배정.
// 입력 raw 의 각 항목은 _fileIdx, _origSpeaker, _speakerName 임시 필드를 가져야 한다.
function _dedupAndAssignSpeakerNumbers(raw) {
  const nameToNumber = new Map(); // speakerName → 배정된 번호
  const keyToNumber = new Map();  // "fileIdx_origSpeaker" → 배정된 번호
  let nextNumber = 1;

  for (const sub of raw) {
    if (sub._origSpeaker <= 0) continue;
    const fileKey = `${sub._fileIdx}_${sub._origSpeaker}`;
    if (keyToNumber.has(fileKey)) continue;

    const name = sub._speakerName;
    if (name && nameToNumber.has(name)) {
      keyToNumber.set(fileKey, nameToNumber.get(name));
    } else {
      keyToNumber.set(fileKey, nextNumber);
      if (name) nameToNumber.set(name, nextNumber);
      nextNumber++;
    }
  }

  return raw.map((sub) => {
    const fileKey = `${sub._fileIdx}_${sub._origSpeaker}`;
    const newNum =
      sub._origSpeaker > 0
        ? keyToNumber.get(fileKey) || sub._origSpeaker
        : 0;
    const { _fileIdx, _origSpeaker, _speakerName, ...rest } = sub;
    return {
      ...rest,
      speaker: newNum > 0 ? String(newNum) : rest.speaker,
      speakerId: newNum > 0 ? newNum : rest.speakerId,
      speakerName: _speakerName || rest.speakerName,
    };
  });
}

export function downloadSubtitleAsTxt(subtitles, fileName, encoding = 'utf-8', includeBlankLines = true) {
  const sep = includeBlankLines ? '\n\n' : '\n';
  const content = subtitles.map((sub) => sub.text || '').join(sep);
  const blob = createEncodedBlob(content, 'text/plain', encoding);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// 통합 worktool envelope 포맷으로 JSON 다운로드.
// payload:
//   - 배열이면 레거시 호환 처리: { subtitles: payload } 로 감싸서 envelope 생성 (메타 없음).
//   - 객체이면 { subtitles, permission?, frameRate?, languages?, speakers? } 형태.
// 포맷 명세: docs/interface/subtitle-json-format.md
export function downloadSubtitleAsJson(payload, fileName, encoding = 'utf-8') {
  const options = Array.isArray(payload) ? { subtitles: payload } : (payload || {});
  const content = serializeSubtitleJson(options);
  const blob = createEncodedBlob(content, 'application/json', encoding);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSubtitleFile(formatId, subtitles, title, fileName, encoding = 'utf-8', langCode = 'ko') {
  const format = SUPPORTED_FORMATS.find((f) => f.id === formatId);
  if (!format) return;

  const content = convertSubtitles(formatId, subtitles, title, langCode);
  if (content === null) return;

  const blob = createEncodedBlob(content, format.mimeType, encoding);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || `${title}${format.extension}`;
  a.click();
  URL.revokeObjectURL(url);
}
