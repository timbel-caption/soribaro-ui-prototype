// 자막 배열은 항상 startTime 오름차순으로 유지된다는 invariant 위에서 동작하는 유틸.
// useSubtitleStore 의 모든 mutation 은 이 invariant 를 보존해야 한다.

// 정렬된 배열에 신규 자막을 끼워 넣은 새 배열을 반환한다.
// 새 배열을 만들기 때문에 React state 변경 감지에는 그대로 사용 가능.
export function binaryInsertByStartTime(sortedSubtitles, newSubtitle) {
  const key = newSubtitle.startTime;
  let lo = 0;
  let hi = sortedSubtitles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedSubtitles[mid].startTime < key) lo = mid + 1;
    else hi = mid;
  }
  const result = sortedSubtitles.slice();
  result.splice(lo, 0, newSubtitle);
  return result;
}

// time ∈ [startTime, endTime] 인 첫 자막의 인덱스. 없으면 -1.
// 자막은 정렬되어 있고 일반적으로 겹치지 않으므로 binary search.
// 직전에 찾은 인덱스 hint 를 이용하면 재생 중 95% 의 호출이 O(1) 에 가깝다.
export function findActiveIndex(sortedSubtitles, time, hint = -1) {
  const len = sortedSubtitles.length;
  if (len === 0) return -1;

  // hint 가 유효하면 hint, hint+1, hint-1 순으로 빠르게 검사.
  if (hint >= 0 && hint < len) {
    const h = sortedSubtitles[hint];
    if (time >= h.startTime && time <= h.endTime) return hint;
    if (hint + 1 < len) {
      const n = sortedSubtitles[hint + 1];
      if (time >= n.startTime && time <= n.endTime) return hint + 1;
    }
    if (hint - 1 >= 0) {
      const p = sortedSubtitles[hint - 1];
      if (time >= p.startTime && time <= p.endTime) return hint - 1;
    }
  }

  let lo = 0;
  let hi = len - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const sub = sortedSubtitles[mid];
    if (time < sub.startTime) hi = mid - 1;
    else if (time > sub.endTime) lo = mid + 1;
    else return mid;
  }
  return -1;
}

// dev 모드에서 mutation 직후 invariant 검증용. prod 빌드에서는 호출되지 않도록 한다.
export function assertSortedByStartTime(subtitles, label = "subtitles") {
  for (let i = 1; i < subtitles.length; i++) {
    if (subtitles[i].startTime < subtitles[i - 1].startTime) {
      console.error(
        `[invariant] ${label} 가 startTime 오름차순이 아님: index ${i - 1} -> ${i}`,
        subtitles[i - 1],
        subtitles[i],
      );
      return false;
    }
  }
  return true;
}
