/**
 * 번역 작업 실행 서비스 (SRT 기반)
 * 자막 로드 → SRT 변환 → 청크 분할 → 번역 → 파싱 → 저장 파이프라인을 실행합니다.
 */
import { createLLMProvider } from './ai/llm';
import { getSourceSubtitles, getPrompt } from '../api/translates';
import {
  useTranslateJobStore,
  STEPS,
} from '../stores/translateJobStore';
import { useUserStore } from '../stores/userStore';
import {
  subtitlesToSRT,
  parseSRTResponse,
  mergeTranslatedSegments,
  findMissingSequences,
  timeFormatWithMillis,
  parseTimeString,
} from './ai/llm/utils/srtFormatter';
import {
  subtitlesToSimpleSRT,
  parseSimpleSRTResponse,
  mergeSimpleSRTResults,
  findMissingSimpleSRTSequences,
  buildSimpleRetrySRT,
  formatWorkInfo,
} from './ai/llm/utils/simpleSrtFormatter';
import {
  getSRTTranslationPrompt,
} from './ai/llm/prompts/srtTranslationPrompt';
import {
  fetchTransactionSeq,
  createLlmUsage,
  saveLocalUsage,
  getLocalTransactionSeq,
} from './llmUsageService';
import { useAIStore } from '../stores/aiStore';
import { toast } from '../stores/toastStore';
import { getLangEnglishName } from '../constants/langEnglishNames';
import { runWithConcurrency } from '../utils/concurrency';
import { analyzeChunkBoundaries, splitBySize } from './chunkSplitService';

// 로컬 시간을 ISO 형식(타임존 없음)으로 변환
const toLocalISOString = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// 현재 번역 작업의 AbortController (취소 시 진행 중인 fetch 요청 중단용)
let currentAbortController = null;

// 기본 설정
const DEFAULT_CHUNK_SIZE = 50;
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;
const DEFAULT_MODEL = 'gpt-4o-mini';

const RESULT_CODES = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
};

function mapProviderForUsage(provider) {
  if (provider === 'claude') return 'anthropic';
  return provider;
}

function normalizeUsage(provider, usage) {
  if (!usage) return { promptTokenSize: null, completionTokenSize: null, totalTokenSize: null };
  if (provider === 'openai') {
    return {
      promptTokenSize: usage.prompt_tokens ?? null,
      completionTokenSize: usage.completion_tokens ?? null,
      totalTokenSize: usage.total_tokens ?? null,
    };
  }
  if (provider === 'claude' || provider === 'anthropic') {
    return {
      promptTokenSize: usage.input_tokens ?? null,
      completionTokenSize: usage.output_tokens ?? null,
      totalTokenSize: null,
    };
  }
  if (provider === 'gemini') {
    return {
      promptTokenSize: usage.promptTokenCount ?? null,
      completionTokenSize: usage.candidatesTokenCount ?? null,
      totalTokenSize: usage.totalTokenCount ?? null,
    };
  }
  return { promptTokenSize: null, completionTokenSize: null, totalTokenSize: null };
}

function buildFullPrompt(systemPrompt, srtData) {
  return `${systemPrompt}\n\n<original_text>\n${srtData}\n</original_text>`;
}

function buildUsageOptions(baseOptions = {}, extra = {}) {
  const {
    model,
    temperature,
    maxTokens,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    chunkSize,
    concurrency,
    promptId,
  } = baseOptions;

  return {
    model,
    temperature,
    maxTokens,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    chunkSize,
    concurrency,
    promptId,
    ...extra,
  };
}

async function persistUsage(payload, isLocalWorker) {
  try {
    if (isLocalWorker) {
      saveLocalUsage(payload);
    } else {
      await createLlmUsage(payload);
    }
  } catch (error) {
    console.warn('LLM usage 저장 실패:', error?.message || error);
  }
}

/**
 * 모델명에서 Provider를 자동 판별
 * @param {string} modelName - 모델명
 * @returns {'openai' | 'gemini' | 'claude'} - Provider 타입
 */
function getProviderFromModel(modelName) {
  if (!modelName) return 'openai';
  
  const lowerModel = modelName.toLowerCase();
  
  if (lowerModel.startsWith('claude')) return 'claude';
  if (lowerModel.startsWith('gemini')) return 'gemini';
  if (lowerModel.startsWith('gpt') || lowerModel.includes('openai')) return 'openai';
  
  // 기본값
  return 'openai';
}

/**
 * Provider에 맞는 API 키를 가져오기
 * - 로컬모드: aiStore -> 환경변수 fallback
 * - 서버모드: DB API에서 매번 최신 키 조회
 * @param {'openai' | 'gemini' | 'claude'} provider - Provider 타입
 * @param {boolean} isServerMode - 서버 모드 여부 (기본: false)
 * @returns {Promise<string>} - API 키
 */
async function getApiKeyForProvider(provider, isServerMode = false) {
  // 서버모드: DB에서 매번 최신 키 조회
  if (isServerMode) {
    try {
      const { searchApiKeys } = await import('../api/v9/apiKeys');
      const dbProvider = provider.toUpperCase();
      const res = await searchApiKeys({ provider: dbProvider, serviceType: 'LLM' });
      if (res?.status === 'SUCCESS' && res.data?.length > 0) {
        return res.data[0].apiKey || '';
      }
    } catch (err) {
      console.error('[getApiKeyForProvider] DB API 조회 실패:', err);
    }
    return '';
  }

  // 로컬모드: aiStore 우선
  const { llm } = useAIStore.getState();
  const storedKey = llm.apiKeys?.[provider];
  if (storedKey) return storedKey;

  // 로컬모드 fallback: 환경변수
  switch (provider) {
    case 'claude':
      return import.meta.env.VITE_CLAUDE_API_KEY || '';
    case 'gemini':
      return import.meta.env.VITE_GEMINI_API_KEY || '';
    case 'openai':
    default:
      return import.meta.env.VITE_OPENAI_API_KEY || '';
  }
}

/**
 * 치명적 에러 판별 (재시도 없이 즉시 종료해야 하는 에러)
 * @param {Error} error - 에러 객체
 * @returns {boolean} - 치명적 에러 여부
 */
function isFatalError(error) {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.response?.status;
  
  // API 키 관련 에러
  if (message.includes('invalid') && message.includes('key')) return true;
  if (message.includes('unauthorized')) return true;
  if (message.includes('authentication')) return true;
  if (message.includes('api key')) return true;
  if (status === 401 || status === 403) return true;
  
  // 네트워크 에러 (ApiError의 type으로 판별)
  if (error.data?.type === 'network') return true;
  if (error.data?.type === 'abort') return true;
  
  // Rate limit (재시도 의미 없음)
  if (status === 429) return true;
  
  return false;
}

/**
 * 번역 작업 실행
 * @param {string} fileId - 파일 ID (testMode일 때는 null 가능)
 * @param {object} options - 옵션
 * @param {string} options.lang - 번역 대상 언어 코드 (필수)
 * @param {string} options.sourceLang - 원본 언어 코드 (필수 - 조회 테이블 결정)
 * @param {number} [options.sourceRevision] - 원본 자막 리비전 (없으면 최신)
 * @param {number} [options.sourceStep] - 원본 자막 Step (translates 조회용)
 * @param {string} [options.model] - LLM 모델명
 * @param {number} [options.chunkSize] - 청크당 세그먼트 수 (기본: 50)
 * @param {number} [options.temperature] - 0.0~2.0 (기본: 0.3)
 * @param {number} [options.maxTokens] - 최대 토큰 수 (기본: -1, 무제한)
 * @param {number} [options.topP] - top_p (기본: 1.0)
 * @param {number} [options.topK] - top_k (Gemini/Claude용)
 * @param {number} [options.frequencyPenalty] - frequency_penalty (기본: 0)
 * @param {number} [options.presencePenalty] - presence_penalty (기본: 0)
 * @param {number} [options.concurrency] - 동시 작업 수 (기본: 5, 최대: 10)
 * @param {string} [options.promptId] - 커스텀 프롬프트 ID
 * @param {boolean} [options.testMode] - 테스트 모드 여부
 * @param {string} [options.inlineSubtitleData] - 테스트용 자막 텍스트 (testMode일 때 필수)
 * @param {string} [options.customPrompt] - 시스템 프롬프트 텍스트 (testMode일 때 필수)
 * @param {boolean} [options.isServerMode] - 서버 모드 여부 (기본: false, 로컬모드)
 * @returns {Promise<{success: boolean, translatedSegments: Array, failedChunks: number[]}>}
 */
export async function executeTranslateJob(fileId, options = {}) {
  // 이전 작업이 진행 중이면 취소
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  const abortSignal = currentAbortController.signal;

  const store = useTranslateJobStore.getState();
  const user = useUserStore.getState().user;

  const {
    lang,
    sourceLang,
    sourceRevision,
    sourceStep,
    model,
    chunkSize = DEFAULT_CHUNK_SIZE,
    temperature = 0.3,
    maxTokens = -1,
    topP = 1.0,
    topK,
    frequencyPenalty = 0,
    presencePenalty = 0,
    concurrency = 5,
    promptId,
    // 테스트 모드 옵션
    testMode = false,
    inlineSubtitleData,
    customPrompt,
    // 서버/로컬 모드
    isServerMode = false,
    // V2 파이프라인 옵션
    pipelineMode = 'legacy',
    workInfo,
    useContextSplit = false,
    splitModel,
    splitReasoningEffort,
  } = options;

  if (!lang) {
    throw new Error('번역 대상 언어(lang)는 필수입니다.');
  }

  if (!sourceLang) {
    throw new Error('원본 언어(sourceLang)는 필수입니다.');
  }

  // 테스트 모드 검증
  if (testMode) {
    if (!inlineSubtitleData) {
      throw new Error('테스트 모드에서는 inlineSubtitleData가 필수입니다.');
    }
    if (!customPrompt) {
      throw new Error('테스트 모드에서는 customPrompt가 필수입니다.');
    }
  }

  try {
    const rawWorkerId = user?.membNo;
    const workerId = rawWorkerId !== undefined && rawWorkerId !== null && String(rawWorkerId).trim()
      ? String(rawWorkerId).trim()
      : 'LOCAL';
    const isLocalWorker = workerId === 'LOCAL';
    const transactionSeq = isLocalWorker ? getLocalTransactionSeq() : await fetchTransactionSeq();
    // 파일 정보 설정
    store.setFileInfo({ fileId: fileId || 'test', sourceLang, targetLang: lang });

    // ==================== 1단계: 데이터 로드 ====================
    store.setStep(STEPS.LOADING);
    store.setDetailProgress(0);

    let subtitles;
    let customPromptTemplate = null;

    const isV2 = pipelineMode === 'v2';
    const fmt = getFormatters(pipelineMode);

    if (testMode) {
      // 테스트 모드: inlineSubtitleData를 자막 형식으로 변환
      if (isV2) {
        subtitles = convertV2DemoDataToSubtitles(inlineSubtitleData);
      } else {
        subtitles = convertDemoDataToSubtitles(inlineSubtitleData);
      }
      customPromptTemplate = customPrompt;
      store.setDetailProgress(100);
    } else {
      // 실제 모드: API에서 자막 조회
      // 원본 자막 로드 (sourceLang에 따라 조회 테이블 결정)
      // ko: subtitles 테이블, 그 외: translates 테이블
      const subtitleResponse = await getSourceSubtitles(fileId, sourceLang, {
        revision: sourceRevision,
        step: sourceStep,
      });
      if (!subtitleResponse.success) {
        throw new Error('자막 데이터를 불러올 수 없습니다.');
      }

      // translates 응답은 data.translates, subtitles 응답은 data.subtitles
      subtitles = subtitleResponse.data?.subtitles 
        || subtitleResponse.data?.translates 
        || [];

      store.setDetailProgress(50);

      // 커스텀 프롬프트 로드 (선택적)
      if (promptId) {
        try {
          const promptResponse = await getPrompt(promptId);
          if (promptResponse.success && promptResponse.data) {
            customPromptTemplate = promptResponse.data.prompt || promptResponse.data.content;
          }
        } catch (err) {
          console.warn('프롬프트 로드 실패, 기본 프롬프트 사용:', err.message);
        }
      }

      store.setDetailProgress(100);
    }

    if (subtitles.length === 0) {
      throw new Error('번역할 자막이 없습니다.');
    }

    // LLM Provider 설정 (모델명에서 provider 자동 판별)
    // 청크 분할에서도 provider가 필요하므로 번역 단계 진입 전에 준비
    const modelName = model || DEFAULT_MODEL;
    const provider = getProviderFromModel(modelName);
    const apiKey = await getApiKeyForProvider(provider, isServerMode);

    if (!apiKey) {
      const keySourceMsg = isServerMode
        ? 'DB에 API Key가 등록되어 있는지 확인하세요.'
        : '설정 > AI 탭에서 API Key를 입력하세요.';
      throw new Error(`${provider.toUpperCase()} API Key가 설정되지 않았습니다. ${keySourceMsg}`);
    }

    const llmProvider = createLLMProvider(
      provider,
      apiKey,
      {
        model: modelName,
        temperature,
      }
    );

    // ==================== 1.5단계: 문맥 청크 분할 (V2 + useContextSplit 전용) ====================
    // chunkSize는 maxChunkSize 가드로 사용된다 (V2 + useContextSplit ON일 때만 의미가 다름)
    let chunks;
    if (isV2 && useContextSplit) {
      store.setStep(STEPS.SPLITTING);
      store.setDetailProgress(0);

      // 분할 분석 전용 모델/Provider 준비
      // splitModel이 비어있으면 번역 모델과 동일하게 처리
      const effectiveSplitModel = splitModel || modelName;
      const splitProviderName = getProviderFromModel(effectiveSplitModel);
      const splitIsSameAsTranslate =
        splitProviderName === provider && effectiveSplitModel === modelName;

      let splitProvider = llmProvider;
      let splitProviderReady = true;
      if (!splitIsSameAsTranslate) {
        const splitApiKey = await getApiKeyForProvider(splitProviderName, isServerMode);
        if (!splitApiKey) {
          splitProviderReady = false;
          console.warn(
            `[ChunkSplit] 분할 모델 ${effectiveSplitModel} provider(${splitProviderName}) API Key 없음 — fallback`
          );
          toast.warning(
            `분할 분석 모델(${splitProviderName.toUpperCase()}) API Key 없음 — 크기 기반 분할로 진행합니다.`
          );
          chunks = splitBySize(subtitles, chunkSize);
        } else {
          splitProvider = createLLMProvider(splitProviderName, splitApiKey, {
            model: effectiveSplitModel,
          });
        }
      }

      if (splitProviderReady) {
        const splitResult = await analyzeChunkBoundaries(subtitles, splitProvider, {
          maxChunkSize: chunkSize,
          signal: abortSignal,
          reasoningEffort: splitReasoningEffort,
        });

        if (abortSignal.aborted) {
          return { success: false, translatedSegments: [], failedChunks: [], cancelled: true };
        }

        if (splitResult.reason === 'success' || splitResult.reason === 'skipped') {
          chunks = splitResult.chunks;

          // SPLITTING usage 로깅 (skipped는 LLM 호출이 없었으므로 제외)
          if (splitResult.reason === 'success' && splitResult.usage) {
            const splitUsage = normalizeUsage(splitProviderName, splitResult.usage);
            await persistUsage({
              transactionSeq,
              workerId,
              provider: mapProviderForUsage(splitProviderName),
              model: effectiveSplitModel,
              prompt: '[CHUNK_SPLIT_ANALYSIS]',
              completion: splitResult.rawResponse || '',
              options: JSON.stringify(
                buildUsageOptions(options, {
                  type: 'chunk_split',
                  pipelineMode,
                  splitModel: effectiveSplitModel,
                  splitReasoningEffort,
                })
              ),
              promptTokenSize: splitUsage.promptTokenSize,
              completionTokenSize: splitUsage.completionTokenSize,
              resultCode: RESULT_CODES.SUCCESS,
              requestedAt: toLocalISOString(new Date()),
              responsedAt: toLocalISOString(new Date()),
            }, isLocalWorker);
          }

          console.log(
            `[ChunkSplit] ${splitResult.reason} — ${chunks.length}개 페이즈 (자막 ${subtitles.length}개, 모델 ${effectiveSplitModel})`
          );
        } else {
          console.warn(
            `[ChunkSplit] LLM 분할 실패 (${splitResult.reason}), size 기반 분할로 fallback`,
            splitResult.error?.message || ''
          );
          toast.warning('LLM 문맥 분할 실패 — 크기 기반 분할로 진행합니다.');
          chunks = splitBySize(subtitles, chunkSize);
        }
      }

      store.setDetailProgress(100);
    } else {
      chunks = splitBySize(subtitles, chunkSize);
    }

    // 각 청크의 시작 인덱스(0-based) — 청크 크기가 비균일할 수 있으므로 누적 합으로 계산
    const chunkStartIndices = [];
    {
      let acc = 0;
      for (const c of chunks) {
        chunkStartIndices.push(acc);
        acc += c.length;
      }
    }

    // ==================== 2단계: 번역 처리 ====================
    store.setStep(STEPS.TRANSLATING);
    store.setDetailProgress(0);

    store.initChunks(chunks.length);

    // 프롬프트 생성
    const targetLangCode = lang;
    const sourceLangCode = sourceLang;
    const sourceLangName = getLangEnglishName(sourceLangCode);
    const targetLangName = getLangEnglishName(targetLangCode);

    let systemPrompt;

    if (isV2) {
      // V2: 커스텀 프롬프트를 그대로 사용 (언어 페어가 프롬프트 내에 포함됨)
      // 플레이스홀더가 있으면 치환, 없으면 그대로
      const basePrompt = customPromptTemplate || getSRTTranslationPrompt(targetLangCode, sourceLangCode);
      systemPrompt = basePrompt
        .replace(/\{source_lang\}/g, sourceLangName)
        .replace(/\{target_lang\}/g, targetLangName);

      // 작품 정보가 있으면 메인 프롬프트 바로 다음에 삽입
      const workInfoBlock = formatWorkInfo(workInfo);
      if (workInfoBlock) {
        systemPrompt += workInfoBlock;
      }
    } else {
      // Legacy: 기존 로직
      const basePrompt = customPromptTemplate || getSRTTranslationPrompt(targetLangCode, sourceLangCode);

      systemPrompt = basePrompt
        .replace(/\{source_lang\}/g, sourceLangName)
        .replace(/\{target_lang\}/g, targetLangName);

      // 플레이스홀더가 없었던 프롬프트에는 Instructions 헤더를 최상단에 삽입
      if (!basePrompt.includes('{source_lang}') && !basePrompt.includes('{target_lang}')) {
        const instructionHeader = `# [Instructions]\nTranslate the given original text <original_text> from ${sourceLangName} into ${targetLangName}.\n\n`;
        systemPrompt = instructionHeader + systemPrompt;
      }
    }

    // 각 청크 번역 (동시 처리)
    const allResults = [];
    const rawResponses = new Array(chunks.length);
    const failedChunkIndices = [];
    const resultsByChunk = new Array(chunks.length);

    const effectiveConcurrency = Math.max(1, Math.min(10, Number(concurrency) || 5));

    const tasks = chunks.map((chunk, i) => async () => {
      let success = false;
      let retryCount = 0;
      const chunkStartIndex = chunkStartIndices[i];

      while (!success && retryCount < MAX_RETRY_COUNT) {
        try {
          const srtData = fmt.toSRT(chunk, chunkStartIndex);
          const requestedAt = new Date();
          const translatedChunk = await translateChunkWithFormatter(
            llmProvider,
            srtData,
            systemPrompt,
            fmt.parseResponse,
            { temperature, maxTokens, topP, topK, frequencyPenalty, presencePenalty, signal: abortSignal }
          );
          const responsedAt = new Date();

          // 원본 응답 저장
          rawResponses[i] = translatedChunk.rawResponse;

          // usage 로그 저장
          const usage = normalizeUsage(provider, translatedChunk.usage);
          const usagePayload = {
            transactionSeq,
            workerId,
            provider: mapProviderForUsage(provider),
            model: modelName,
            prompt: buildFullPrompt(systemPrompt, srtData),
            completion: translatedChunk.responseText,
            options: JSON.stringify(
              buildUsageOptions(options, {
                chunkIndex: i,
                attempt: retryCount + 1,
                type: 'chunk',
                pipelineMode,
              })
            ),
            promptTokenSize: usage.promptTokenSize,
            completionTokenSize: usage.completionTokenSize,
            resultCode: RESULT_CODES.SUCCESS,
            requestedAt: toLocalISOString(requestedAt),
            responsedAt: toLocalISOString(responsedAt),
          };
          await persistUsage(usagePayload, isLocalWorker);

          // 누락 시퀀스 검사
          const expectedStart = chunkStartIndex + 1;
          const expectedEnd = chunkStartIndex + chunk.length;
          const missing = fmt.findMissing(translatedChunk.parsedSegments, expectedStart, expectedEnd);

          if (missing.length > 0) {
            console.warn(`청크 ${i + 1}: ${missing.length}개 시퀀스 누락, 재시도`);

            const retryResults = await retryMissingSequences(
              llmProvider,
              chunk,
              missing,
              chunkStartIndex,
              lang,
              systemPrompt,
              {
                temperature,
                maxTokens,
                topP,
                topK,
                frequencyPenalty,
                presencePenalty,
                chunkSize,
                concurrency: effectiveConcurrency,
                transactionSeq,
                workerId,
                provider: mapProviderForUsage(provider),
                model: modelName,
                isLocalWorker,
                baseOptions: options,
                signal: abortSignal,
                formatters: fmt,
              }
            );

            translatedChunk.parsedSegments.push(...retryResults);
          }

          const mergedResults = fmt.mergeResults(
            translatedChunk.parsedSegments,
            chunk,
            chunkStartIndex
          );

          // 취소된 경우 결과를 Store에 반영하지 않음
          if (abortSignal.aborted) break;

          resultsByChunk[i] = mergedResults;
          store.setChunkCompleted(i, mergedResults);
          success = true;
        } catch (err) {
          // 취소 시그널에 의한 AbortError → 재시도 없이 즉시 루프 탈출
          if (err.name === 'AbortError') {
            console.log(`청크 ${i + 1} 번역 취소됨`);
            break;
          }

          if (isFatalError(err)) {
            console.error(`치명적 에러 발생, 작업 중단: ${err.message}`);
            store.setError(err.message);
            throw err;
          }

          // 실패 로그 저장
          const srtData = fmt.toSRT(chunk, chunkStartIndex);
          const failedPayload = {
            transactionSeq,
            workerId,
            provider: mapProviderForUsage(provider),
            model: modelName,
            prompt: buildFullPrompt(systemPrompt, srtData),
            completion: null,
            options: JSON.stringify(
              buildUsageOptions(options, {
                chunkIndex: i,
                attempt: retryCount + 1,
                type: 'chunk',
              })
            ),
            promptTokenSize: null,
            completionTokenSize: null,
            resultCode: RESULT_CODES.ERROR,
            requestedAt: toLocalISOString(new Date()),
            responsedAt: toLocalISOString(new Date()),
          };
          await persistUsage(failedPayload, isLocalWorker);

          retryCount++;
          console.warn(`청크 ${i + 1} 번역 실패 (시도 ${retryCount}/${MAX_RETRY_COUNT}):`, err.message);

          if (retryCount >= MAX_RETRY_COUNT) {
            store.setChunkFailed(i);
            failedChunkIndices.push(i + 1);
            console.error(`청크 ${i + 1} 최종 실패, 건너뜀`);
            break;
          } else {
            await delay(RETRY_DELAY_MS * retryCount);
          }
        }
      }
    });

    await runWithConcurrency(tasks, effectiveConcurrency, abortSignal);

    // 취소된 경우 결과를 반영하지 않고 즉시 종료
    if (abortSignal.aborted) {
      console.log('번역 작업이 취소되어 결과를 반영하지 않습니다.');
      return { success: false, translatedSegments: [], failedChunks: [], cancelled: true };
    }

    for (let i = 0; i < resultsByChunk.length; i++) {
      if (Array.isArray(resultsByChunk[i])) {
        allResults.push(...resultsByChunk[i]);
      }
    }

    store.setTranslatedSegments(allResults);

    // ==================== 3단계: 결과 출력 (DB 저장 제거됨) ====================
    store.setStep(STEPS.SAVING);
    store.setDetailProgress(50);

    // DB 저장 대신 console.log로 결과 출력
    // 추후 사용자가 별도로 저장하는 UX로 변경됨
    const translationResult = {
      fileId: fileId || 'local',
      sourceLang,
      targetLang: lang,
      timestamp: new Date().toISOString(),
      totalSegments: allResults.length,
      segments: allResults.map((seg) => ({
        speaker: seg.speaker ?? null,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        align: seg.align || 'bottomCenter',
      })),
    };

    console.log('=== 번역 완료 결과 (JSON) ===');
    console.log(JSON.stringify(translationResult, null, 2));
    console.log('=== 번역 완료 ===');

    store.setDetailProgress(100);

    // ==================== 완료 ====================
    store.setStep(STEPS.COMPLETED);

    return {
      success: failedChunkIndices.length === 0,
      translatedSegments: allResults,
      rawResponses, // LLM 원본 응답
      testMode,
      failedChunks: failedChunkIndices, // 실패한 청크 인덱스 배열 (1-based)
      // 추가: 저장용 결과 데이터
      translationResult,
    };
  } catch (error) {
    // AbortError는 사용자 취소이므로 에러로 처리하지 않음
    if (error.name === 'AbortError') {
      console.log('번역 작업이 사용자에 의해 취소되었습니다.');
      return { success: false, translatedSegments: [], failedChunks: [], cancelled: true };
    }
    console.error('번역 작업 실패:', error);
    store.setError(error.message);
    throw error;
  } finally {
    // 작업 완료 후 AbortController 정리
    if (currentAbortController?.signal === abortSignal) {
      currentAbortController = null;
    }
  }
}

/**
 * 커스텀 SRT 형식의 텍스트를 자막 세그먼트 배열로 변환 (테스트 모드용)
 * 
 * 입력 형식:
 * |S|1
 * |N|speaker1
 * |T|00:00:00.000 --> 00:00:03.000
 * |M|안녕하세요
 * |E|
 * 
 * @param {string} srtText - 커스텀 SRT 형식 텍스트
 * @returns {Array} 자막 세그먼트 배열
 */
function convertDemoDataToSubtitles(srtText) {
  if (!srtText || typeof srtText !== 'string') {
    return [];
  }

  const segments = [];
  
  // |S| 기준으로 세그먼트 분할
  const segmentBlocks = srtText.split(/\|S\|/).filter(block => block.trim());

  for (const block of segmentBlocks) {
    const lines = block.split('\n');
    
    // 시퀀스 번호 (첫 번째 줄)
    const seqLine = lines[0]?.trim();
    if (!seqLine) continue;

    let speaker = null;
    let start = '00:00:00.000';
    let end = '00:00:03.000';
    let text = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // |N| - 화자
      if (trimmedLine.startsWith('|N|')) {
        const speakerValue = trimmedLine.substring(3).trim();
        speaker = speakerValue === 'null' || speakerValue === '' ? null : speakerValue;
      }
      // |T| - 타임코드
      else if (trimmedLine.startsWith('|T|')) {
        const timeMatch = trimmedLine.substring(3).match(/(.+?)\s*-->\s*(.+)/);
        if (timeMatch) {
          start = timeMatch[1].trim();
          end = timeMatch[2].trim();
        }
      }
      // |M| - 텍스트
      else if (trimmedLine.startsWith('|M|')) {
        text = trimmedLine.substring(3);
      }
    }

    segments.push({
      speaker,
      start,
      end,
      text,
      align: 'bottomCenter',
    });
  }

  return segments;
}

/**
 * V2 간소화 포맷({N}\ntext)의 인라인 데이터를 자막 세그먼트 배열로 변환 (테스트 모드용)
 * @param {string} simpleText - V2 포맷 텍스트
 * @param {Array} originalSubtitles - 원본 자막 배열 (타임코드 참조용)
 * @returns {Array} 자막 세그먼트 배열
 */
function convertV2DemoDataToSubtitles(simpleText, originalSubtitles = []) {
  if (!simpleText || typeof simpleText !== 'string') return [];

  const segments = [];
  const blockPattern = /\{(\d+)\}/g;
  const matches = [...simpleText.matchAll(blockPattern)];

  for (let i = 0; i < matches.length; i++) {
    const index = parseInt(matches[i][1], 10);
    const contentStart = matches[i].index + matches[i][0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : simpleText.length;
    const text = simpleText.slice(contentStart, contentEnd).trim();

    const original = originalSubtitles[index - 1];
    segments.push({
      speaker: original?.speaker ?? null,
      start: original?.start ?? '00:00:00.000',
      end: original?.end ?? '00:00:03.000',
      text,
      align: original?.align ?? 'bottomCenter',
    });
  }

  return segments;
}

/**
 * 파이프라인 모드에 따른 포맷터 함수 세트 반환
 * @param {string} mode - 'legacy' | 'v2'
 * @returns {Object} 포맷터 함수 세트
 */
function getFormatters(mode) {
  if (mode === 'v2') {
    return {
      toSRT: subtitlesToSimpleSRT,
      parseResponse: parseSimpleSRTResponse,
      mergeResults: mergeSimpleSRTResults,
      findMissing: findMissingSimpleSRTSequences,
      buildRetry: buildSimpleRetrySRT,
    };
  }
  return {
    toSRT: subtitlesToSRT,
    parseResponse: parseSRTResponse,
    mergeResults: mergeTranslatedSegments,
    findMissing: findMissingSequences,
    buildRetry: buildRetrySRT,
  };
}

/**
 * 단일 청크 번역 (포맷터 파라미터로 V1/V2 대응)
 * @param {Object} llmProvider - LLM Provider 인스턴스
 * @param {string} srtData - 포맷된 문자열
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {Function} parseResponseFn - 응답 파싱 함수
 * @param {Object} options - 옵션
 * @returns {Promise<{rawResponse: string, parsedSegments: Array}>}
 */
async function translateChunkWithFormatter(llmProvider, srtData, systemPrompt, parseResponseFn, options = {}) {
  const translated = await llmProvider.translateSRT(srtData, systemPrompt, options);
  const parsedSegments = parseResponseFn(translated.text);

  return {
    rawResponse: translated.text,
    responseText: translated.text,
    parsedSegments,
    usage: translated.usage,
  };
}

// runWithConcurrency는 utils/concurrency.js에서 import

/**
 * 누락 세그먼트용 커스텀 SRT 생성 (실제 시퀀스 번호 유지)
 * @param {Array} chunk - 원본 청크
 * @param {number[]} indices - 누락 시퀀스 번호 (1-based)
 * @param {number} chunkStartIndex - 청크 시작 인덱스 (0-based)
 * @returns {string} 커스텀 SRT 문자열
 */
function buildRetrySRT(chunk, indices, chunkStartIndex) {
  let formattedContent = '';

  const toSeconds = (value) => {
    if (typeof value === 'number') return value;
    return parseTimeString(String(value));
  };

  for (const index of indices) {
    const segmentIdx = index - chunkStartIndex - 1;
    if (segmentIdx < 0 || segmentIdx >= chunk.length) continue;

    const original = chunk[segmentIdx];
    const name = original?.speaker ?? null;
    const begin = toSeconds(original.start);
    const end = toSeconds(original.end);

    formattedContent += `|S|${index}\n`;
    formattedContent += `|N|${name ?? 'null'}\n`;
    formattedContent += `|T|${timeFormatWithMillis(begin)} --> ${timeFormatWithMillis(end)}\n`;
    formattedContent += `|M|${original?.text ?? ''}\n`;
    formattedContent += `|G|${index}\n`;
    formattedContent += `|E|\n\n`;
  }

  return formattedContent;
}

/**
 * 누락 시퀀스 재시도 (개별 번역)
 * @param {Object} llmProvider - LLM Provider 인스턴스
 * @param {Array} chunk - 원본 청크
 * @param {number[]} missingIndices - 누락된 인덱스 배열 (1-based)
 * @param {number} chunkStartIndex - 청크 시작 인덱스 (0-based)
 * @param {string} targetLang - 대상 언어 코드
 * @param {string} [systemPrompt] - 시스템 프롬프트 (메인 번역과 동일한 프롬프트 사용)
 * @param {Object} [options] - 번역 옵션 (LLM 파라미터/로그 컨텍스트)
 * @returns {Promise<Array>} 번역된 세그먼트 배열
 */
async function retryMissingSequences(
  llmProvider,
  chunk,
  missingIndices,
  chunkStartIndex,
  targetLang,
  systemPrompt,
  options = {}
) {
  const results = [];
  const {
    temperature,
    maxTokens,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    chunkSize,
    concurrency,
    transactionSeq,
    workerId,
    provider,
    model,
    isLocalWorker,
    baseOptions,
    signal,
    formatters,
  } = options;

  // 포맷터가 전달되면 사용, 없으면 레거시 기본값
  const retryBuildSRT = formatters?.buildRetry || buildRetrySRT;
  const retryParseResponse = formatters?.parseResponse || parseSRTResponse;

  if (!missingIndices || missingIndices.length === 0) {
    return results;
  }

  // 누락 인덱스를 chunk_size 기준으로 묶기
  const sortedMissing = [...missingIndices].sort((a, b) => a - b);
  const batchSize = Math.max(1, Number(chunkSize) || 1);
  const batches = [];

  for (let offset = 0; offset < sortedMissing.length; offset += batchSize) {
    const batchIndices = sortedMissing.slice(offset, offset + batchSize);
    if (batchIndices.length > 0) {
      batches.push(batchIndices);
    }
  }

  const effectiveConcurrency = Math.max(1, Math.min(10, Number(concurrency) || 1));
  const resultsByBatch = new Array(batches.length);

  const batchTasks = batches.map((batchIndices, batchIndex) => async () => {
    try {
      const requestedAt = new Date();
      const srtData = retryBuildSRT(chunk, batchIndices, chunkStartIndex);
      const translated = await llmProvider.translateSRT(srtData, systemPrompt, {
        temperature,
        maxTokens,
        topP,
        topK,
        frequencyPenalty,
        presencePenalty,
        signal,
      });
      const responsedAt = new Date();

      const parsedSegments = retryParseResponse(translated.text);
      const merged = [...parsedSegments];

      for (const idx of batchIndices) {
        const covered = parsedSegments.some((seg) => {
          const segIndex = seg.index ?? seg.startLine;
          if (seg.startLine !== undefined && seg.endLine !== undefined) {
            return idx >= seg.startLine && idx <= seg.endLine;
          }
          return segIndex === idx;
        });

        if (!covered) {
          const segmentIdx = idx - chunkStartIndex - 1;
          const original = chunk[segmentIdx];
          merged.push({
            index: idx,
            startLine: idx,
            endLine: idx,
            text: original?.text ?? '',
            begin: 0,
            end: 0,
          });
        }
      }

      resultsByBatch[batchIndex] = merged;

      const usage = normalizeUsage(provider, translated.usage);
      const usagePayload = {
        transactionSeq,
        workerId,
        provider,
        model,
        prompt: buildFullPrompt(systemPrompt, srtData),
        completion: translated.text,
        options: JSON.stringify(
          buildUsageOptions(baseOptions, {
            retryBatchIndex: batchIndex,
            type: 'retry',
          })
        ),
        promptTokenSize: usage.promptTokenSize,
        completionTokenSize: usage.completionTokenSize,
        resultCode: RESULT_CODES.SUCCESS,
        requestedAt: toLocalISOString(requestedAt),
        responsedAt: toLocalISOString(responsedAt),
      };
      await persistUsage(usagePayload, isLocalWorker);
    } catch (error) {
      console.error(`시퀀스 ${batchIndices[0]}-${batchIndices[batchIndices.length - 1]} 재시도 실패:`, error);
      const fallback = [];
      for (const idx of batchIndices) {
        const segmentIdx = idx - chunkStartIndex - 1;
        const original = chunk[segmentIdx];
        fallback.push({
          index: idx,
          startLine: idx,
          endLine: idx,
          text: original?.text ?? '',
          begin: 0,
          end: 0,
        });
      }
      resultsByBatch[batchIndex] = fallback;

      const errorPayload = {
        transactionSeq,
        workerId,
        provider,
        model,
        prompt: buildFullPrompt(systemPrompt, retryBuildSRT(chunk, batchIndices, chunkStartIndex)),
        completion: null,
        options: JSON.stringify(
          buildUsageOptions(baseOptions, {
            retryBatchIndex: batchIndex,
            type: 'retry',
          })
        ),
        promptTokenSize: null,
        completionTokenSize: null,
        resultCode: RESULT_CODES.ERROR,
        requestedAt: toLocalISOString(new Date()),
        responsedAt: toLocalISOString(new Date()),
      };
      await persistUsage(errorPayload, isLocalWorker);
    }
  });

  await runWithConcurrency(batchTasks, effectiveConcurrency, signal);

  for (const batchResult of resultsByBatch) {
    if (Array.isArray(batchResult)) {
      results.push(...batchResult);
    }
  }

  return results;
}

/**
 * 지연 함수
 * @param {number} ms - 밀리초
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 번역 작업 취소
 * 진행 중인 fetch 요청을 중단하고 Store 상태를 초기화합니다.
 */
export function cancelTranslateJob() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  useTranslateJobStore.getState().reset();
}

export default {
  executeTranslateJob,
  cancelTranslateJob,
};
