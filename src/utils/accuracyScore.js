// 정확도 계산 코어 — React/스토어 비의존 순수 함수.
// AccuracyModal(메인 에디터)·연수 채점·연수 채점결과 모달이 공유한다.
import { timeCodeToSeconds } from "./timeUtils";
import {
  classifyPair, classifyInsertDelete, classifyReplace,
  tokenizeWords, buildPosToWord,
} from "./accuracyClassify";

function getTimeValue(sub, primaryField) {
  // 수정본은 startTime/endTime(숫자 초), 원본(저장 스키마)은 start/end(타임코드 문자열)를 사용한다.
  // 두 스키마 모두 허용하도록 별칭을 순회한다.
  const aliases =
    primaryField === "startTime" ? ["startTime", "start"]
    : primaryField === "endTime" ? ["endTime", "end"]
    : [primaryField];
  for (const key of aliases) {
    const v = sub?.[key];
    if (v == null) continue;
    return typeof v === "string" ? timeCodeToSeconds(v) : v;
  }
  return null;
}

function sortSubtitles(subtitles, timeField) {
  return [...subtitles].sort((a, b) => {
    const aTime = getTimeValue(a, timeField) ?? 0;
    const bTime = getTimeValue(b, timeField) ?? 0;
    return aTime - bTime;
  });
}

const ALIGN_LCS_MAX = 3000;

// 큐(자막) 단위 정렬 — 텍스트 키 기반 LCS.
// 빈 텍스트는 양쪽이 절대 매칭되지 않도록 사이드 마킹된 고유 키 사용.
// 결과: { origIdx, currIdx, kind }[] (kind: equal | insert | delete | replace)
// replace는 fallback(데이터 과다 시)에서만 발생.
//
// 연수 채점(TrainingWorktoolOverlay) 에서도 동일 알고리즘을 재사용하므로 named export.
export function alignCues(sortedOrig, sortedCurr) {
  const m = sortedOrig.length;
  const n = sortedCurr.length;
  const keyOrig = sortedOrig.map((s, i) => {
    const t = (s?.text || "").trim();
    return t || `__o_${i}__`;
  });
  const keyCurr = sortedCurr.map((s, i) => {
    const t = (s?.text || "").trim();
    return t || `__c_${i}__`;
  });

  if (m > ALIGN_LCS_MAX || n > ALIGN_LCS_MAX) {
    // 너무 길면 LCS 비용이 커지므로 인덱스 zip — 텍스트가 다른 페어는 replace로 마크
    const rows = [];
    const maxLen = Math.max(m, n);
    for (let i = 0; i < maxLen; i++) {
      const o = i < m ? i : null;
      const c = i < n ? i : null;
      let kind = "equal";
      if (o == null) kind = "insert";
      else if (c == null) kind = "delete";
      else if (keyOrig[o] !== keyCurr[c]) kind = "replace";
      rows.push({ origIdx: o, currIdx: c, kind });
    }
    return rows;
  }

  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (keyOrig[i - 1] === keyCurr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  const rows = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (keyOrig[i - 1] === keyCurr[j - 1]) {
      rows.push({ origIdx: i - 1, currIdx: j - 1, kind: "equal" });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      rows.push({ origIdx: i - 1, currIdx: null, kind: "delete" });
      i--;
    } else {
      rows.push({ origIdx: null, currIdx: j - 1, kind: "insert" });
      j--;
    }
  }
  while (i > 0) {
    i--;
    rows.push({ origIdx: i, currIdx: null, kind: "delete" });
  }
  while (j > 0) {
    j--;
    rows.push({ origIdx: null, currIdx: j, kind: "insert" });
  }
  rows.reverse();
  return rows;
}

// LCS 후처리 — 연속된 non-equal 그룹 내에서 delete/insert를 단조(non-crossing) 최소 시간차 DP로 페어링.
// 그룹 내 delete N개 + insert M개 → min(N,M)개를 replace 한 행으로 합침.
// 단조 제약으로 좌/우 인덱스 순서가 교차되지 않아 표시 순서가 항상 ascending 유지됨.
// (예전 그리디는 (191↔196, 192↔198, 193↔197) 같은 교차를 만들어 우측이 196,198,197 로 보이던 버그가 있었음.)
// 나머지 |N-M|개만 진짜로 새로 추가/삭제된 것으로 별도 행 유지.
// 마지막에 결과 전체를 시간순 stable sort — LCS leftover 처리로 인한 위치 왜곡 보정.
function coalescePairs(rows, sortedOrig, sortedCurr) {
  const getOrigTime = (origIdx) =>
    origIdx != null ? getTimeValue(sortedOrig[origIdx], "startTime") : null;
  const getCurrTime = (currIdx) =>
    currIdx != null ? getTimeValue(sortedCurr[currIdx], "startTime") : null;

  const result = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind === "equal") {
      result.push(rows[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind !== "equal") j++;
    const group = rows.slice(i, j);

    const deleteEntries = [];
    const insertEntries = [];
    group.forEach((row, gIdx) => {
      if (row.kind === "delete") {
        deleteEntries.push({ gIdx, time: getOrigTime(row.origIdx) });
      } else if (row.kind === "insert") {
        insertEntries.push({ gIdx, time: getCurrTime(row.currIdx) });
      }
    });

    const pairings = new Map(); // gIdx → 짝의 gIdx (양방향)

    // 단조 최소 거리 할당 DP — 페어 수를 최대화하면서 시간 거리 합을 최소화.
    // PAIR_BONUS 가 어떤 거리보다도 크므로 "페어 만들기" 가 항상 우선되고,
    // 동수 페어 후보들 중에서는 시간 거리 합이 최소인 non-crossing 조합이 선택됨.
    // deleteEntries / insertEntries 는 각자 LCS 순서(=시간순)이므로 단조 매칭이 곧 비교차 매칭.
    const N = deleteEntries.length;
    const M = insertEntries.length;
    if (N > 0 && M > 0) {
      const PAIR_BONUS = 1e9;
      const dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 1));
      // back: 0=skip del[ii-1], 1=skip ins[jj-1], 2=pair (ii-1, jj-1)
      const back = Array.from({ length: N + 1 }, () => new Int8Array(M + 1));
      for (let ii = 1; ii <= N; ii++) {
        for (let jj = 1; jj <= M; jj++) {
          let best = dp[ii - 1][jj];
          let bk = 0;
          if (dp[ii][jj - 1] > best) {
            best = dp[ii][jj - 1];
            bk = 1;
          }
          const dt = deleteEntries[ii - 1].time;
          const it = insertEntries[jj - 1].time;
          const dist = dt != null && it != null ? Math.abs(dt - it) : 0;
          const pairScore = dp[ii - 1][jj - 1] + PAIR_BONUS - dist;
          if (pairScore > best) {
            best = pairScore;
            bk = 2;
          }
          dp[ii][jj] = best;
          back[ii][jj] = bk;
        }
      }
      let ii = N;
      let jj = M;
      while (ii > 0 && jj > 0) {
        const bk = back[ii][jj];
        if (bk === 2) {
          const dGIdx = deleteEntries[ii - 1].gIdx;
          const iGIdx = insertEntries[jj - 1].gIdx;
          pairings.set(dGIdx, iGIdx);
          pairings.set(iGIdx, dGIdx);
          ii--;
          jj--;
        } else if (bk === 1) {
          jj--;
        } else {
          ii--;
        }
      }
    }

    // 그룹 원래 순서대로 출력하되, 페어된 쌍은 더 빠른 위치에서 한 번만 emit
    const emittedPairs = new Set();
    for (let g = 0; g < group.length; g++) {
      const row = group[g];
      if (pairings.has(g)) {
        if (emittedPairs.has(g)) continue;
        const otherG = pairings.get(g);
        const delGIdx = row.kind === "delete" ? g : otherG;
        const insGIdx = row.kind === "insert" ? g : otherG;
        const delRow = group[delGIdx];
        const insRow = group[insGIdx];
        result.push({ origIdx: delRow.origIdx, currIdx: insRow.currIdx, kind: "replace" });
        emittedPairs.add(g);
        emittedPairs.add(otherG);
      } else {
        result.push(row);
      }
    }

    i = j;
  }

  // 시간순 stable sort — LCS leftover 위치로 인한 어긋남 보정
  const getRowTime = (row) => {
    const ot = getOrigTime(row.origIdx);
    if (ot != null) return ot;
    const ct = getCurrTime(row.currIdx);
    if (ct != null) return ct;
    return 0;
  };
  const indexed = result.map((row, idx) => ({ row, idx, time: getRowTime(row) }));
  indexed.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.idx - b.idx;
  });
  return indexed.map((e) => e.row);
}

// 매칭된 큐가 시간 차이가 있는지 (화자 변경은 제외 — 별도 표시)
function hasCueTimeChange(orig, curr) {
  if (!orig || !curr) return false;
  const oStart = getTimeValue(orig, "startTime");
  const cStart = getTimeValue(curr, "startTime");
  const oEnd = getTimeValue(orig, "endTime");
  const cEnd = getTimeValue(curr, "endTime");
  const tol = 0.005;
  if (oStart != null && cStart != null && Math.abs(oStart - cStart) > tol) return true;
  if (oEnd != null && cEnd != null && Math.abs(oEnd - cEnd) > tol) return true;
  return false;
}

/**
 * 두 자막 배열을 어절단위로 비교해 정확도/오류 정보를 산출.
 * 기존 AccuracyModal.comparisonData useMemo의 "태그/HTML 제외" 순수 계산부와 동일해야 함.
 * @param {Object} p
 * @param {Array} p.originalSubtitles
 * @param {Array} p.currentSubtitles
 * @param {Object} [p.speakers]
 * @param {Set}    [p.excludedErrorIds]
 * @returns {null | {
 *   alignedRows: Array, overallAccuracy: number, editDistance: number,
 *   origWordCount: number, currWordCount: number, matchedWords: number, totalRefWords: number,
 *   errorCounts: { typo: number, space: number, punc: number, omission: number, addition: number },
 *   perLine: Array, sortedOrig: Array, sortedCurr: Array, origPlain: string, currPlain: string,
 *   speakerChanges: number, speakerDiffs: Array, errorLines: Set, errorLinesOrig: Set,
 *   textErrorLineCount: number, displayErrors: Array
 * }} 태그/HTML을 제외한 comparisonData의 나머지 키. 비교 대상이 비면(원본 0개 또는
 *    편집 가능한 비교본 0개) **null** 을 반환하므로 호출처는 null 가드 필요.
 */
export function computeAccuracyComparison({ originalSubtitles, currentSubtitles, speakers = {}, excludedErrorIds = new Set() }) {
  // VOD 분할 — 타 작업자 readonly(locked) 자막은 본인 원본과 짝지을 수 없어
  // 전부 insert 오류로 잡히므로 비교 대상에서 제외한다. 호출처에서 이미 걸러도
  // 다른 진입점(예: 연수 채점) 회귀를 막기 위한 내부 가드.
  const editableCurr = currentSubtitles.filter((s) => !s.locked);
  if (originalSubtitles.length === 0 || editableCurr.length === 0)
    return null;

  const sortedOrig = sortSubtitles(originalSubtitles, "startTime");
  const sortedCurr = sortSubtitles(editableCurr, "startTime");

  const origPlain = sortedOrig.map((s) => (s.text || "").trim()).join("\n");
  const currPlain = sortedCurr.map((s) => (s.text || "").trim()).join("\n");

  if (origPlain.length === 0 && currPlain.length === 0) return null;

  // 화자 비교: ID 매칭 기반 + 인덱스 기반 fallback (싱크 나누기/합치기로 새 ID가 생긴 경우 대응)
  const origSpeakerNameById = new Map();
  sortedOrig.forEach((sub) => {
    if (sub.id) origSpeakerNameById.set(sub.id, sub.speakerName || "");
  });

  let speakerChanges = 0;
  const speakerDiffs = [];
  const len = Math.max(sortedOrig.length, sortedCurr.length);

  for (let idx = 0; idx < len; idx++) {
    const curr = sortedCurr[idx];
    const orig = sortedOrig[idx];

    const origSpeaker = orig?.speakerName ?? null;
    const currSpeaker =
      curr?.speakerId != null && curr.speakerId !== 0 && speakers[curr.speakerId]
        ? speakers[curr.speakerId].name
        : curr ? "" : null;

    let changed = false;

    if (curr?.id && origSpeakerNameById.has(curr.id)) {
      const matchedOrigSpeaker = origSpeakerNameById.get(curr.id);
      changed = matchedOrigSpeaker !== currSpeaker;
    } else if (curr && orig) {
      changed = (origSpeaker || "") !== (currSpeaker || "");
    }

    if (changed) speakerChanges++;

    speakerDiffs.push({ origSpeaker, currSpeaker, changed });
  }

  // ─── 라인별 diff 순회 + 오류 구조화 ───
  // origPlain/currPlain(\n-join)을 대상으로 classifyPair를 호출해 opcodes를 얻는다.
  // opcodes를 순회하며 각 오류에 고유 id 부여 + displayErrors 배열에 수집한다.
  // (라인별 HTML 생성은 컴포넌트에 남아 있으며, 동일 로직으로 displayErrors 와 id 를 재현한다.)
  // 라인 구조 변경(개행↔공백만 다른 구간)은 displayErrors에 포함하지 않는다.
  const isLineStructRun = (a, b) => {
    if (!a.includes("\n") && !b.includes("\n")) return false;
    return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
  };

  const sameText = origPlain === currPlain;

  const displayErrors = [];

  if (!sameText) {
    const cls = classifyPair(origPlain, currPlain);

    let origLineIdx = 0;
    let currLineIdx = 0;
    let origPos = 0;
    let currPos = 0;

    for (const op of cls.opcodes) {
      const a = op.a || "";
      const b = op.b || "";

      if (op.tag === "equal") {
        for (let i = 0; i < a.length; i++) {
          const ch = a[i];
          if (ch === "\n") {
            origLineIdx++;
            currLineIdx++;
          }
        }
      } else {
        const struct = isLineStructRun(a, b);
        let category;
        if (op.tag === "replace") category = classifyReplace(a, b);
        else if (op.tag === "delete") category = classifyInsertDelete(a) || "omission";
        else category = classifyInsertDelete(b) || "addition";

        if (!struct) {
          const id = `e-${origPos}-${currPos}-${op.tag[0]}`;
          displayErrors.push({
            id, tag: op.tag, category,
            origText: a, currText: b,
            origStart: origPos, origEnd: origPos + a.length,
            currStart: currPos, currEnd: currPos + b.length,
            origLineIdx, currLineIdx,
          });
        }
        if (a.length > 0) {
          const segments = a.split("\n");
          for (let si = 0; si < segments.length; si++) {
            if (si < segments.length - 1) origLineIdx++;
          }
        }
        if (b.length > 0) {
          const segments = b.split("\n");
          for (let si = 0; si < segments.length; si++) {
            if (si < segments.length - 1) currLineIdx++;
          }
        }
      }

      origPos += a.length;
      currPos += b.length;
    }
  }

  // 활성 오류만 카운트/라인마킹에 반영
  const activeErrors = displayErrors.filter((e) => !excludedErrorIds.has(e.id));

  // ─── 어절(단어) 기반 오류 카운팅 ───
  // 정책:
  //  1) 매칭된 어절 쌍 (origIdx, currIdx) 을 한 단위로 묶음 — 같은 어절 안에서 같은 카테고리가
  //     여러 번 발생해도 1건으로 머지 ("안닝하시요." → "안녕하세요." 의 typo 2개 → 1건)
  //  2) 같은 어절 단위 안에 typo+punc 등 다른 카테고리가 동시 발생하면 카테고리별 각 1건
  //  3) 어절 사이 공백 변경은 buildPosToWord 가 직전 어절에 매핑해 "앞 어절" 귀속 자동 처리
  //  4) delete (orig 단독) / insert (curr 단독) 은 한쪽 인덱스를 -1 로 두어 별도 단위
  const origTokens = tokenizeWords(origPlain);
  const currTokens = tokenizeWords(currPlain);
  const origPosToWord = buildPosToWord(origPlain, origTokens);
  const currPosToWord = buildPosToWord(currPlain, currTokens);

  // key: "origIdx:currIdx" (없으면 -1) → Set<category>
  const wordCatMap = new Map();
  const addPair = (origIdx, currIdx, cat) => {
    const oValid = origIdx != null && origIdx >= 0;
    const cValid = currIdx != null && currIdx >= 0;
    if (!oValid && !cValid) return;
    const key = `${oValid ? origIdx : -1}:${cValid ? currIdx : -1}`;
    let s = wordCatMap.get(key);
    if (!s) {
      s = new Set();
      wordCatMap.set(key, s);
    }
    s.add(cat);
  };

  for (const e of activeErrors) {
    const hasOrig = e.origText.length > 0;
    const hasCurr = e.currText.length > 0;
    let oStartW = -1, oEndW = -1, cStartW = -1, cEndW = -1;
    if (hasOrig) {
      oStartW = origPosToWord[e.origStart] ?? -1;
      oEndW = origPosToWord[Math.max(0, e.origEnd - 1)] ?? -1;
    }
    if (hasCurr) {
      cStartW = currPosToWord[e.currStart] ?? -1;
      cEndW = currPosToWord[Math.max(0, e.currEnd - 1)] ?? -1;
    }
    if (hasOrig && hasCurr) {
      // replace: 양쪽 모두 매핑되는 어절 쌍을 한 단위로 카운트 (보통 한 페어)
      for (let ow = oStartW; ow <= oEndW; ow++) {
        for (let cw = cStartW; cw <= cEndW; cw++) addPair(ow, cw, e.category);
      }
    } else if (hasOrig) {
      for (let ow = oStartW; ow <= oEndW; ow++) addPair(ow, -1, e.category);
    } else if (hasCurr) {
      for (let cw = cStartW; cw <= cEndW; cw++) addPair(-1, cw, e.category);
    }
  }

  const errorCounts = { typo: 0, space: 0, punc: 0, omission: 0, addition: 0 };
  for (const cats of wordCatMap.values()) {
    for (const cat of cats) errorCounts[cat]++;
  }

  // 문자 위치 → 라인 인덱스
  const buildPosToLine = (plain) => {
    const map = new Array(plain.length).fill(0);
    let line = 0;
    for (let i = 0; i < plain.length; i++) {
      map[i] = line;
      if (plain[i] === "\n") line++;
    }
    return map;
  };
  const origPosToLine = buildPosToLine(origPlain);
  const currPosToLine = buildPosToLine(currPlain);

  const errorLines = new Set(); // 수정본(curr) 라인 인덱스 기준
  const errorLinesOrig = new Set(); // 원본(orig) 라인 인덱스 기준

  // 화자 변경: 양쪽 인덱스에 표시 (항상 카운트됨)
  for (let idx = 0; idx < len; idx++) {
    if (!speakerDiffs[idx]?.changed) continue;
    if (idx < sortedCurr.length) errorLines.add(idx);
    if (idx < sortedOrig.length) errorLinesOrig.add(idx);
  }

  for (const e of activeErrors) {
    if (e.origText.length > 0) {
      const oStart = origPosToLine[e.origStart] ?? 0;
      const oEnd = origPosToLine[Math.max(0, e.origEnd - 1)] ?? oStart;
      for (let l = oStart; l <= oEnd; l++) errorLinesOrig.add(l);
    }
    if (e.currText.length > 0) {
      const cStart = currPosToLine[e.currStart] ?? 0;
      const cEnd = currPosToLine[Math.max(0, e.currEnd - 1)] ?? cStart;
      for (let l = cStart; l <= cEnd; l++) errorLines.add(l);
    }
    // delete: curr 쪽에 없지만, 삭제가 일어난 인접 curr 라인도 표시
    if (e.tag === "delete") {
      const pos = Math.min(e.currStart, Math.max(0, currPlain.length - 1));
      const near = currPosToLine[pos] ?? 0;
      errorLines.add(near);
    }
    // insert: orig 쪽에 없지만, 삽입 위치 인접 orig 라인 표시
    if (e.tag === "insert") {
      const pos = Math.min(e.origStart, Math.max(0, origPlain.length - 1));
      const near = origPosToLine[pos] ?? 0;
      errorLinesOrig.add(near);
    }
  }

  // perLine: 리포트/표 모드 표시용. 시간 겹침 기반 단순 재계산.
  const getTime = (sub, field) => getTimeValue(sub, field);
  const perLine = new Array(len).fill(null);
  for (let ci = 0; ci < sortedCurr.length; ci++) {
    const curr = sortedCurr[ci];
    const currStart = getTime(curr, "startTime");
    const currEnd = getTime(curr, "endTime");
    const currText = (curr?.text || "").trim();
    const overlappingOrigTexts = [];
    if (currStart != null && currEnd != null) {
      for (const orig of sortedOrig) {
        const origStart = getTime(orig, "startTime");
        const origEnd = getTime(orig, "endTime");
        if (origStart == null || origEnd == null) continue;
        if (origStart < currEnd + 0.05 && origEnd > currStart - 0.05) {
          overlappingOrigTexts.push((orig.text || "").trim());
        }
      }
    }
    const pairedOrigText = overlappingOrigTexts.length > 0 ? overlappingOrigTexts.join(" ") : "";
    if (!pairedOrigText && !currText) {
      perLine[ci] = { matched: 0, totalRef: 0, counts: { typo: 0, space: 0, punc: 0, omission: 0, addition: 0 }, distance: 0 };
      continue;
    }
    const cls = classifyPair(pairedOrigText, currText);
    perLine[ci] = {
      matched: cls.matched,
      totalRef: cls.totalRef,
      counts: cls.counts,
      distance: cls.totalRef + cls.hypChars - 2 * cls.matched,
      refHtml: cls.refHtml,
      hypHtml: cls.hypHtml,
      opcodes: cls.opcodes,
    };
  }
  for (let i = sortedCurr.length; i < len; i++) {
    perLine[i] = { matched: 0, totalRef: 0, counts: { typo: 0, space: 0, punc: 0, omission: 0, addition: 0 }, distance: 0 };
  }

  // 텍스트 오류 라인 수 (화자 변경 제외)
  let textErrorLineCount = 0;
  for (const idx of errorLines) {
    if (!speakerDiffs[idx]?.changed) textErrorLineCount++;
  }

  // 단어 단위 정확도: 1 - errorWordUnits / max(ref_words, hyp_words)
  // errorWordUnits = wordCatMap.size — 같은 어절(쌍) 내 여러 카테고리는 1건으로 묶임.
  // (과거에는 side 별 errorWordIdxs 의 min 조합으로 계산했으나, 길이 불일치(누락/추가)가
  //  있을 때 작은 쪽 어절 수에 matchedWords 가 캡되어 누락/추가 오류 제외가 정확도에 반영되지
  //  않는 문제가 있어 wordCatMap 기반으로 변경.)
  // 제외된 오류는 activeErrors 필터에서 이미 빠졌으므로 wordCatMap 에도 빠져 자연 반영됨.
  const errorWordUnits = wordCatMap.size;
  const totalRefWords = Math.max(origTokens.length, currTokens.length);
  const matchedWords = Math.max(0, totalRefWords - errorWordUnits);
  const accuracy = totalRefWords === 0 ? 100 : (matchedWords / totalRefWords) * 100;
  // 편집 거리 = 어절×카테고리 오류 이벤트 합 (모달 헤더 표시값과 일치)
  const totalErrorEvents = Object.values(errorCounts).reduce((a, b) => a + b, 0);

  // 큐 단위 LCS 정렬 + 단조 DP 시간 기반 페어링 + 시간순 정렬
  const rawAlignedRows = coalescePairs(alignCues(sortedOrig, sortedCurr), sortedOrig, sortedCurr);
  const alignedRows = rawAlignedRows.map((row) => {
    const orig = row.origIdx != null ? sortedOrig[row.origIdx] : null;
    const curr = row.currIdx != null ? sortedCurr[row.currIdx] : null;
    const origSpeaker = orig?.speakerName ?? "";
    const currSpeaker =
      curr?.speakerId != null && curr.speakerId !== 0 && speakers?.[curr.speakerId]
        ? speakers[curr.speakerId].name
        : "";
    const speakerChanged = !!(orig && curr) && origSpeaker !== currSpeaker;
    const modified = row.kind === "equal" && hasCueTimeChange(orig, curr);
    return { ...row, origSpeaker, currSpeaker, speakerChanged, modified };
  });

  return {
    alignedRows,
    overallAccuracy: accuracy,
    editDistance: totalErrorEvents,
    origWordCount: origTokens.length,
    currWordCount: currTokens.length,
    matchedWords,
    totalRefWords,
    errorCounts,
    perLine,
    sortedOrig,
    sortedCurr,
    origPlain,
    currPlain,
    speakerChanges,
    speakerDiffs,
    errorLines,
    errorLinesOrig,
    textErrorLineCount,
    displayErrors,
  };
}
