/**
 * V2 파이프라인 — LLM 기반 문맥 청크 분할 서비스
 *
 * 전체 자막을 한 번에 LLM으로 분석해 페이즈(청크) 경계를 산출한다.
 * 응답은 각 페이즈의 마지막 시퀀스 번호로 구성된 JSON 배열.
 *
 * 검증/보정 규칙:
 *  - JSON 파싱 실패, 단조 증가 위반, 마지막 값이 총 자막 수와 불일치, 0/음수 → null 반환 (호출자가 fallback)
 *  - 한 페이즈가 maxChunkSize(기본 300)를 초과하면 코드에서 강제 분할
 *  - 마지막 페이즈는 100 미만이어도 허용
 */

import { subtitlesToSimpleSRT } from './ai/llm/utils/simpleSrtFormatter';
import { getChunkSplitPrompt } from './ai/llm/prompts/chunkSplitPrompt';

const DEFAULT_MAX_CHUNK_SIZE = 300;
const SKIP_THRESHOLD = 150;

/**
 * LLM 응답에서 JSON 배열을 추출 (코드블록 등 잡음 제거 시도)
 * @param {string} text - LLM 원본 응답
 * @returns {number[] | null}
 */
function extractJsonArray(text) {
  if (!text || typeof text !== 'string') return null;

  // 1차: 그대로 파싱
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // continue
  }

  // 2차: 코드블록/잡음 안의 첫 [ ... ] 추출
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

/**
 * boundaries 검증 — 단조 증가 + 정수 + 마지막 값 == totalCount
 * @returns {boolean}
 */
function validateBoundaries(boundaries, totalCount) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) return false;

  let prev = 0;
  for (const b of boundaries) {
    if (typeof b !== 'number' || !Number.isInteger(b)) return false;
    if (b <= prev) return false;
    if (b > totalCount) return false;
    prev = b;
  }

  return prev === totalCount;
}

/**
 * 한 페이즈가 maxChunkSize를 초과하면 강제 분할
 * @param {number[]} boundaries - 검증 통과한 boundaries (각 페이즈 마지막 1-based 시퀀스)
 * @param {number} maxChunkSize - 한 청크 최대 자막 수
 * @returns {number[]} 보정된 boundaries
 */
function enforceMaxChunkSize(boundaries, maxChunkSize) {
  const result = [];
  let prev = 0;

  for (const end of boundaries) {
    let start = prev + 1;
    let size = end - prev;

    while (size > maxChunkSize) {
      const cut = start + maxChunkSize - 1;
      result.push(cut);
      start = cut + 1;
      size = end - cut;
    }

    result.push(end);
    prev = end;
  }

  return result;
}

/**
 * boundaries(각 페이즈 마지막 시퀀스 번호) → 자막 청크 배열
 * @param {Array} subtitles - 원본 자막 배열
 * @param {number[]} boundaries - 1-based 마지막 시퀀스 번호 배열
 * @returns {Array<Array>} 청크 배열
 */
export function splitByBoundaries(subtitles, boundaries) {
  const chunks = [];
  let start = 0;
  for (const end of boundaries) {
    chunks.push(subtitles.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * size-based 분할 (fallback / ≤SKIP_THRESHOLD 처리용)
 * @param {Array} subtitles
 * @param {number} chunkSize
 * @returns {Array<Array>}
 */
export function splitBySize(subtitles, chunkSize) {
  const chunks = [];
  for (let i = 0; i < subtitles.length; i += chunkSize) {
    chunks.push(subtitles.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * LLM에 전체 자막을 보내 분할 경계를 분석한다.
 *
 * @param {Array} subtitles - 전체 자막 배열
 * @param {object} llmProvider - createLLMProvider 결과 (translateSRT 메서드 보유)
 * @param {object} options
 * @param {number} [options.maxChunkSize=300] - 코드 측 안전 가드
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.maxTokens] - 분할 분석 응답용 max tokens (출력은 짧음, 기본 4096)
 * @param {'low'|'medium'|'high'} [options.reasoningEffort] - reasoning 모델용 effort level
 * @returns {Promise<{
 *   boundaries: number[] | null,
 *   chunks: Array<Array> | null,
 *   rawResponse: string | null,
 *   usage: any | null,
 *   reason: 'skipped' | 'success' | 'parse_failed' | 'validation_failed' | 'error',
 *   error?: Error,
 * }>}
 */
export async function analyzeChunkBoundaries(subtitles, llmProvider, options = {}) {
  const {
    maxChunkSize = DEFAULT_MAX_CHUNK_SIZE,
    signal,
    maxTokens = 4096,
    reasoningEffort,
  } = options;

  const total = subtitles.length;

  // 자막이 너무 적으면 LLM 호출 스킵 — 단일 청크로
  if (total <= SKIP_THRESHOLD) {
    return {
      boundaries: [total],
      chunks: [subtitles.slice()],
      rawResponse: null,
      usage: null,
      reason: 'skipped',
    };
  }

  // V2 포맷으로 직렬화 (시퀀스 번호 1-based)
  const srtData = subtitlesToSimpleSRT(subtitles, 0);
  const systemPrompt = getChunkSplitPrompt();

  let response;
  try {
    // Gemini 3 계열은 temperature 1.0 미만 시 reasoning 루프/성능 저하 가능 (Google 권장)
    // 그 외 모델은 결정적 분할을 위해 낮은 값 사용
    const splitModelName = (llmProvider?.model || '').toLowerCase();
    const splitTemperature = splitModelName.startsWith('gemini-3') ? 1.0 : 0.2;

    response = await llmProvider.translateSRT(srtData, systemPrompt, {
      temperature: splitTemperature,
      maxTokens,
      signal,
      reasoningEffort,
    });
  } catch (err) {
    return {
      boundaries: null,
      chunks: null,
      rawResponse: null,
      usage: null,
      reason: 'error',
      error: err,
    };
  }

  const rawText = response?.text || '';
  const parsed = extractJsonArray(rawText);

  if (!parsed) {
    return {
      boundaries: null,
      chunks: null,
      rawResponse: rawText,
      usage: response?.usage || null,
      reason: 'parse_failed',
    };
  }

  if (!validateBoundaries(parsed, total)) {
    return {
      boundaries: null,
      chunks: null,
      rawResponse: rawText,
      usage: response?.usage || null,
      reason: 'validation_failed',
    };
  }

  const enforced = enforceMaxChunkSize(parsed, maxChunkSize);
  const chunks = splitByBoundaries(subtitles, enforced);

  return {
    boundaries: enforced,
    chunks,
    rawResponse: rawText,
    usage: response?.usage || null,
    reason: 'success',
  };
}
