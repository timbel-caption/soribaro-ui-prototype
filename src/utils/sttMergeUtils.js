/**
 * 분할 STT 결과 병합 유틸리티
 * 각 청크의 자막에 시간 오프셋을 적용하고, 서로 다른 청크 간 겹침을 검출합니다.
 */

/**
 * 각 청크의 자막에 시간 오프셋을 적용하여 하나의 배열로 병합
 * @param {Array<{subtitles: Array, startSec: number, originalStartSec?: number, originalEndSec?: number}>} chunkResults
 * @returns {Array} 시간 보정 + 시간순 정렬된 자막 배열 (_chunkIndex 포함)
 */
export function mergeChunkSubtitles(chunkResults) {
  const allSubtitles = [];

  for (let ci = 0; ci < chunkResults.length; ci++) {
    const chunk = chunkResults[ci];
    const { subtitles, startSec, originalStartSec, originalEndSec } = chunk;
    if (!subtitles?.length) continue;

    for (const sub of subtitles) {
      const absoluteStart = (sub.startTime || 0) + startSec;
      const absoluteEnd = (sub.endTime || 0) + startSec;

      allSubtitles.push({
        ...sub,
        startTime: absoluteStart,
        endTime: absoluteEnd,
        _chunkIndex: ci,
        _chunkStartSec: startSec,
        _originalStartSec: originalStartSec,
        _originalEndSec: originalEndSec,
      });
    }
  }

  allSubtitles.sort((a, b) => a.startTime - b.startTime || a._chunkIndex - b._chunkIndex);
  return allSubtitles;
}

/**
 * 서로 다른 청크 간 시간 겹침 검출
 * - 같은 청크 내 자막끼리는 겹침으로 판정하지 않음
 * - A는 항상 앞 청크(낮은 _chunkIndex), B는 항상 뒷 청크
 * - 각 자막은 최대 1개의 충돌에만 등장 (중복 제거)
 * @param {Array} subtitles - mergeChunkSubtitles 결과 (_chunkIndex 포함)
 * @param {number} [toleranceSec=0.05] - 겹침 허용 오차 (초)
 * @returns {Array<{indexA: number, indexB: number, overlapSec: number}>}
 */
export function detectOverlaps(subtitles, toleranceSec = 0.05) {
  const overlaps = [];
  const matched = new Set();

  for (let i = 0; i < subtitles.length; i++) {
    if (matched.has(i)) continue;
    const a = subtitles[i];

    for (let j = i + 1; j < subtitles.length; j++) {
      if (matched.has(j)) continue;
      const b = subtitles[j];

      // B의 시작이 A의 끝을 넘으면 이후 자막도 겹칠 수 없음 (시간순 정렬)
      if (b.startTime >= a.endTime) break;

      // 같은 청크면 건너뜀
      if (a._chunkIndex === b._chunkIndex) continue;

      const overlapSec = a.endTime - b.startTime;
      if (overlapSec <= toleranceSec) continue;

      // A는 항상 앞 청크, B는 뒷 청크
      const isAFirst = a._chunkIndex < b._chunkIndex;
      overlaps.push({
        indexA: isAFirst ? i : j,
        indexB: isAFirst ? j : i,
        overlapSec,
      });

      matched.add(i);
      matched.add(j);
      break;
    }
  }

  return overlaps;
}

/**
 * 사용자 선택에 따른 겹침 해결 적용
 * @param {Array} subtitles - 자막 배열
 * @param {Array<{
 *   indexA: number,
 *   indexB: number,
 *   resolution: 'keepA' | 'keepB' | 'merge' | 'keepBoth',
 *   mergedText?: string,
 *   mergedStart?: number,
 *   mergedEnd?: number,
 *   aText?: string, aStart?: number, aEnd?: number,
 *   bText?: string, bStart?: number, bEnd?: number,
 * }>} resolutions
 *   - keepA / keepB: 한 쪽 유지
 *   - merge: B 흡수해 A로 합침. mergedText/mergedStart/mergedEnd 지정 시 사용자 값 사용
 *   - keepBoth: 둘 다 유지. a*, b* 지정 시 사용자 편집 텍스트/시간 적용 (겹침이 남아도 그대로 적용)
 * @returns {Array} 해결된 자막 배열
 */
export function applyResolutions(subtitles, resolutions) {
  const removeIndices = new Set();
  const result = subtitles.map((s) => ({ ...s }));

  for (const {
    indexA, indexB, resolution,
    mergedText, mergedStart, mergedEnd,
    aText, aStart, aEnd,
    bText, bStart, bEnd,
  } of resolutions) {
    const a = result[indexA];
    const b = result[indexB];

    switch (resolution) {
      case 'keepA':
        removeIndices.add(indexB);
        break;
      case 'keepB':
        removeIndices.add(indexA);
        break;
      case 'merge':
        a.text = mergedText ?? `${a.text} ${b.text}`;
        a.startTime = Number.isFinite(mergedStart) ? mergedStart : a.startTime;
        a.endTime = Number.isFinite(mergedEnd)
          ? mergedEnd
          : Math.max(a.endTime, b.endTime);
        removeIndices.add(indexB);
        break;
      case 'keepBoth':
        if (aText != null) a.text = aText;
        if (Number.isFinite(aStart)) a.startTime = aStart;
        if (Number.isFinite(aEnd)) a.endTime = aEnd;
        if (bText != null) b.text = bText;
        if (Number.isFinite(bStart)) b.startTime = bStart;
        if (Number.isFinite(bEnd)) b.endTime = bEnd;
        break;
      default:
        break;
    }
  }

  return result.filter((_, i) => !removeIndices.has(i));
}
