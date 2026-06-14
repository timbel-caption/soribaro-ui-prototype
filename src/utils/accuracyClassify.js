// Python accuracy_tool 과 동일 규칙으로 diff 를 오타/띄어쓰기/문장부호/누락/첨삭 으로 분류한다.

const PUNCT_CHARS = new Set(
  Array.from(".,!?;:\"'()[]{}-—–…·~/\\「」『』〈〉《》【】｢｣‘’“”"),
);
const WS_CHARS = new Set([" ", "\t", "\r"]);

// 텍스트를 어절(공백/개행 분리 토큰) 배열로 분해. 각 토큰은 { start, end, text }.
// 문장부호는 분리자가 아니므로 어절에 붙어있는 채로 한 토큰을 이룬다 ("안녕!" 한 토큰).
export function tokenizeWords(text) {
  const tokens = [];
  const len = text.length;
  let i = 0;
  while (i < len) {
    while (i < len && /\s/.test(text[i])) i++;
    if (i >= len) break;
    const start = i;
    while (i < len && !/\s/.test(text[i])) i++;
    tokens.push({ start, end: i, text: text.slice(start, i) });
  }
  return tokens;
}

// 글자 위치 → 어절 인덱스 매핑.
// - 어절 내부 글자: 그 어절 인덱스
// - 어절 사이 공백/개행: 직전 어절 인덱스 (공백 변경의 "앞 어절 귀속" 정책)
// - 첫 어절 시작 전 선행 공백: 첫 어절 인덱스
// - 토큰이 하나도 없으면 모든 위치 -1
export function buildPosToWord(text, tokens) {
  const len = text.length;
  const map = new Int32Array(len);
  if (tokens.length === 0) {
    map.fill(-1);
    return map;
  }
  for (let t = 0; t < tokens.length; t++) {
    const { start, end } = tokens[t];
    const gapStart = t === 0 ? 0 : tokens[t - 1].end;
    // 직전 어절 끝 ~ 현재 어절 시작 전: 직전 어절(없으면 현재 어절 0)에 귀속
    const gapAttr = t === 0 ? 0 : t - 1;
    for (let i = gapStart; i < start; i++) map[i] = gapAttr;
    for (let i = start; i < end; i++) map[i] = t;
  }
  // 마지막 어절 끝 ~ 텍스트 끝(후행 공백): 마지막 어절에 귀속
  const last = tokens.length - 1;
  for (let i = tokens[last].end; i < len; i++) map[i] = last;
  return map;
}

function stripPunctAndSpace(s) {
  let r = "";
  for (const ch of s) if (!PUNCT_CHARS.has(ch) && !WS_CHARS.has(ch)) r += ch;
  return r;
}

// 삽입/삭제된 문자열이 공백만인지, 문장부호(+공백)인지 판별하여 분류
export function classifyInsertDelete(s) {
  let allWs = true;
  let hasPunct = false;
  let allPunctOrWs = true;
  for (const ch of s) {
    if (!WS_CHARS.has(ch)) allWs = false;
    if (PUNCT_CHARS.has(ch)) hasPunct = true;
    if (!PUNCT_CHARS.has(ch) && !WS_CHARS.has(ch)) allPunctOrWs = false;
  }
  if (allWs) return "space";
  if (allPunctOrWs && hasPunct) return "punc";
  return null; // 일반 문자 포함 → 기본 omission/addition 유지
}

export function classifyReplace(a, b) {
  const coreA = stripPunctAndSpace(a);
  const coreB = stripPunctAndSpace(b);
  if (coreA && coreA === coreB) return "punc";

  const combined = a + b;
  let allWs = true;
  let hasPunct = false;
  let allPunctOrWs = true;
  for (const ch of combined) {
    if (!WS_CHARS.has(ch)) allWs = false;
    if (PUNCT_CHARS.has(ch)) hasPunct = true;
    if (!PUNCT_CHARS.has(ch) && !WS_CHARS.has(ch)) allPunctOrWs = false;
  }
  if (allWs) return "space";
  if (allPunctOrWs && hasPunct) return "punc";
  return "typo";
}

// Needleman-Wunsch DP 의 마지막 행만 O(n) 메모리로 계산.
// (코드포인트 단위. JS 의 charCodeAt 은 UTF-16 코드 유닛이며, 정렬 비교에는 적합)
function nwLastRow(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = new Int32Array(n + 1);
  let curr = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      if (ac === b.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1];
      } else {
        const sub = prev[j - 1] + 1;
        const del = prev[j] + 1;
        const ins = curr[j - 1] + 1;
        const min1 = sub < del ? sub : del;
        curr[j] = min1 < ins ? min1 : ins;
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev;
}

// Hirschberg's algorithm: 글로벌 최적 정렬을 base 연산 시퀀스로 반환.
// O(m+n) 메모리, O(m*n) 시간. 풀 2D DP 와 동일한 결과(편집거리 동일, 동률 시 매칭 우선).
function hirschbergOps(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) {
    const ops = new Array(n);
    for (let j = 0; j < n; j++) ops[j] = { t: "i", b: b[j] };
    return ops;
  }
  if (n === 0) {
    const ops = new Array(m);
    for (let i = 0; i < m; i++) ops[i] = { t: "d", a: a[i] };
    return ops;
  }
  if (m === 1) {
    // a 한 글자: b 안에 같은 글자가 있으면 첫 매칭 위치에서 equal, 아니면 첫 자리에 replace
    const ch = a[0];
    const idx = b.indexOf(ch);
    const ops = [];
    if (idx >= 0) {
      for (let j = 0; j < idx; j++) ops.push({ t: "i", b: b[j] });
      ops.push({ t: "e", a: ch, b: ch });
      for (let j = idx + 1; j < n; j++) ops.push({ t: "i", b: b[j] });
    } else {
      ops.push({ t: "r", a: ch, b: b[0] });
      for (let j = 1; j < n; j++) ops.push({ t: "i", b: b[j] });
    }
    return ops;
  }

  const mid = m >> 1;
  const left = nwLastRow(a.slice(0, mid), b);
  // 우반부는 a/b 를 뒤집어 같은 함수 호출 → 결과 인덱스 좌표계는 reverse
  const aR = a.slice(mid).split("").reverse().join("");
  const bR = b.split("").reverse().join("");
  const rightR = nwLastRow(aR, bR);
  // rightR[k] = 거리(a[mid..]_R[..k] , b_R[..k]) = 거리(a[mid..]의 끝 k자, b의 끝 k자)
  // → split point k 에 대해 right_dist = rightR[n - k]

  let bestK = 0;
  let bestScore = left[0] + rightR[n];
  for (let k = 1; k <= n; k++) {
    const s = left[k] + rightR[n - k];
    if (s < bestScore) {
      bestScore = s;
      bestK = k;
    }
  }

  const opsL = hirschbergOps(a.slice(0, mid), b.slice(0, bestK));
  const opsR = hirschbergOps(a.slice(mid), b.slice(bestK));
  return opsL.concat(opsR);
}

// 글로벌 정렬을 구해 {equal/replace/delete/insert} 옵코드로 변환.
// O(m+n) 메모리이므로 입력 길이 제한 없이 동작 (이전 MAX_DIFF_LENGTH 분기 불필요).
export function diffToOpcodes(a, b) {
  const ops = hirschbergOps(a, b);

  // 연속 동일 타입 병합
  const groups = [];
  for (const op of ops) {
    const last = groups[groups.length - 1];
    if (last && last.t === op.t) {
      if (op.a) last.a += op.a;
      if (op.b) last.b += op.b;
    } else {
      groups.push({ t: op.t, a: op.a || "", b: op.b || "" });
    }
  }

  // 인접 non-equal 런을 하나의 replace/delete/insert 로 병합
  const merged = [];
  for (const g of groups) {
    if (g.t === "e") {
      merged.push({ tag: "equal", a: g.a, b: g.b });
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && last.tag !== "equal") {
      last.a += g.a;
      last.b += g.b;
      if (last.a && last.b) last.tag = "replace";
      else if (last.a) last.tag = "delete";
      else last.tag = "insert";
    } else {
      const tag = g.t === "r" ? "replace" : g.t === "d" ? "delete" : "insert";
      merged.push({ tag, a: g.a, b: g.b });
    }
  }
  return merged;
}

// 한 쌍의 텍스트를 비교해서 매칭/분류 정보와 하이라이트 HTML 을 생성
export function classifyPair(origText, currText) {
  const counts = { typo: 0, space: 0, punc: 0, omission: 0, addition: 0 };
  let matched = 0;
  const totalRef = origText.length;
  const hypChars = currText.length;

  const esc = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/ /g, "&nbsp;");

  let refHtml = "";
  let hypHtml = "";

  const opcodes = diffToOpcodes(origText, currText);
  for (const op of opcodes) {
    if (op.tag === "equal") {
      matched += op.a.length;
      refHtml += esc(op.a);
      hypHtml += esc(op.b);
    } else if (op.tag === "replace") {
      const cat = classifyReplace(op.a, op.b);
      counts[cat]++;
      refHtml += `<span class="err err-ref err-${cat}">${esc(op.a)}</span>`;
      hypHtml += `<span class="err err-hyp err-${cat}">${esc(op.b)}</span>`;
    } else if (op.tag === "delete") {
      const delCat = classifyInsertDelete(op.a) || "omission";
      counts[delCat]++;
      refHtml += `<span class="err err-ref err-${delCat}">${esc(op.a)}</span>`;
      hypHtml += `<span class="err err-hyp err-${delCat}">&nbsp;</span>`;
    } else if (op.tag === "insert") {
      const insCat = classifyInsertDelete(op.b) || "addition";
      counts[insCat]++;
      refHtml += `<span class="err err-ref err-${insCat}">&nbsp;</span>`;
      hypHtml += `<span class="err err-hyp err-${insCat}">${esc(op.b)}</span>`;
    }
  }

  return { counts, matched, totalRef, hypChars, refHtml, hypHtml, opcodes };
}
