/**
 * STT 작업 실행 서비스
 * 파일 다운로드 → 오디오 변환 → STT 처리 → 저장 파이프라인을 실행합니다.
 */
import { ffmpegService } from "./audio/ffmpegService";
import { getFileDownloadUrl } from "../api/v9";
import { createSTTProvider } from "./ai/stt";
import { mapSTTErrorMessage } from "./ai/stt/sttErrorMapper";
import { useSttJobStore, STEPS } from "../stores/sttJobStore";
import { post } from "../api/client";
import { useAIStore } from "../stores/aiStore";
import { runWithConcurrency } from "../utils/concurrency";
import { mergeChunkSubtitles, detectOverlaps } from "../utils/sttMergeUtils";

// 기본 설정
const DEFAULT_STT_MODEL = 'clova';
const DEFAULT_MAX_SEGMENT_LENGTH = 50;
const DEFAULT_SPLIT_TIME_GAP = 2.0;

// 현재 진행 중인 STT 작업의 AbortController (취소 시 사용)
let currentAbortController = null;

function checkAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * STT 모델에 맞는 API 설정을 가져오기
 * - 로컬모드: aiStore에서 사용자가 입력한 credentials 우선 사용
 * - 서버모드: 환경변수 사용 (추후 서버 API로 변경 예정)
 * @param {'clova' | 'elevenlabs'} model - STT 모델
 * @param {boolean} isServerMode - 서버 모드 여부 (기본: false)
 * @returns {Object} - API 설정
 */
async function getSTTConfigForModel(model, isServerMode = false) {
  // 서버모드: DB에서 매번 최신 키 조회
  if (isServerMode) {
    try {
      const { searchApiKeys } = await import('../api/v9/apiKeys');
      const dbProvider = model.toUpperCase();
      const res = await searchApiKeys({ provider: dbProvider, serviceType: 'STT' });
      if (res?.status === 'SUCCESS' && res.data?.length > 0) {
        const item = res.data[0];
        if (model === 'elevenlabs') {
          return { provider: 'elevenlabs', apiKey: item.apiKey || '' };
        }
        return {
          provider: 'clova',
          invokeUrl: item.invokeUrl || '',
          secretKey: item.apiKey || '',
        };
      }
    } catch (err) {
      console.error('[getSTTConfigForModel] DB API 조회 실패:', err);
    }
    return model === 'elevenlabs'
      ? { provider: 'elevenlabs', apiKey: '' }
      : { provider: 'clova', invokeUrl: '', secretKey: '' };
  }

  // 로컬모드: aiStore에서 사용자가 입력한 credentials 우선 사용
  const { stt } = useAIStore.getState();
  const providerCredentials = stt.credentials?.[model] || {};
  
  if (model === 'elevenlabs') {
    const apiKey = providerCredentials.apiKey;
    if (apiKey) {
      return { provider: 'elevenlabs', apiKey };
    }
    return { provider: 'elevenlabs', apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY || '' };
  }

  // clova
  const { invokeUrl, secretKey } = providerCredentials;
  if (secretKey) {
    return {
      provider: 'clova',
      invokeUrl: invokeUrl || import.meta.env.VITE_CLOVA_INVOKE_URL || '',
      secretKey,
    };
  }
  return {
    provider: 'clova',
    invokeUrl: import.meta.env.VITE_CLOVA_INVOKE_URL || '',
    secretKey: import.meta.env.VITE_CLOVA_SECRET_KEY || '',
  };
}

/**
 * STT 작업 실행
 * @param {number|object} fileNoOrOptions - 파일 번호 (기존 방식) 또는 옵션 객체 (새 방식)
 * @param {object} [legacyOptions] - 옵션 (기존 방식에서 사용)
 * @param {string} [legacyOptions.mode] - 처리 모드 ('legacy' | undefined)
 * @param {string} [legacyOptions.fileId] - MinIO 파일 ID (mode=legacy일 때 필수)
 * @param {string} [legacyOptions.mediaUrl] - 로컬 파일 ObjectURL (mode !== legacy일 때 필수)
 * @param {string} [legacyOptions.language] - 언어 코드 (예: 'ko-KR', 'en-US')
 * @param {string} [legacyOptions.model] - STT 모델 (clova, elevenlabs)
 * @param {number} [legacyOptions.maxSegmentLength] - 세그먼트 최대 문자 수
 * @param {number} [legacyOptions.splitTimeGap] - 분리 기준 시간 간격 (초)
 * @param {boolean} [legacyOptions.isServerMode] - 서버 모드 여부 (기본: false, 로컬모드)
 * @returns {Promise<{success: boolean, subtitles: Array, fileName: string, savedToDb: boolean}>}
 */
export async function executeSttJob(fileNoOrOptions, legacyOptions = {}) {
  const { setStep, setDetailProgress, setError, setSubtitles, setFileName } =
    useSttJobStore.getState();

  // 호환성 처리: 첫 번째 인자가 숫자면 기존 방식, 객체면 새 방식
  let options;
  if (typeof fileNoOrOptions === 'object') {
    options = fileNoOrOptions;
  } else {
    // 기존 방식: executeSttJob(fileNo, options)
    options = { ...legacyOptions, fileId: fileNoOrOptions };
  }

  const {
    mode,          // 처리 모드 ('legacy' | undefined)
    fileId,        // MinIO 파일 ID (mode=legacy일 때 필수)
    mediaUrl,      // 로컬 파일 ObjectURL (mode !== legacy일 때 필수)
    language = "ko-KR",
    model = DEFAULT_STT_MODEL, // clova, elevenlabs
    maxSegmentLength = DEFAULT_MAX_SEGMENT_LENGTH, // 세그먼트 최대 문자 수
    splitTimeGap = DEFAULT_SPLIT_TIME_GAP, // 분리 기준 시간 간격 (초)
    isServerMode = false, // 서버/로컬 모드
    allowedStartSec = null, // 분할 파일 구간 시작 (초)
    allowedEndSec = null,   // 분할 파일 구간 종료 (초)
  } = options;

  const hasTimeRestriction = allowedStartSec !== null && allowedEndSec !== null;

  const isLegacyMode = mode === 'legacy';

  // 이전 작업이 있으면 abort 후 새 컨트롤러 생성
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  console.log('[sttJobService] executeSttJob 시작:');
  console.log('  - mode:', mode);
  console.log('  - isLegacyMode:', isLegacyMode);
  console.log('  - fileId:', fileId);
  console.log('  - mediaUrl:', mediaUrl ? '(있음)' : '(없음)');

  try {
    // ==================== 1단계: 파일 준비 ====================
    setStep(STEPS.DOWNLOADING);
    setDetailProgress(0);

    let originalBlob;
    let fileName;

    if (isLegacyMode) {
      // Legacy 모드: MinIO에서 다운로드
      console.log('[sttJobService] → Legacy 모드: MinIO에서 다운로드');
      if (!fileId) {
        throw new Error('Legacy 모드에서는 fileId가 필요합니다.');
      }
      
      const downloadResponse = await getFileDownloadUrl(fileId);
      const d = downloadResponse?.data || downloadResponse;
      const downloadUrl = d?.url;
      const downloadFileName = d?.fileName;

      setDetailProgress(30);

      const response = await fetch(downloadUrl, { signal });
      if (!response.ok) {
        throw new Error(
          `파일 다운로드 실패: ${response.status} ${response.statusText}`,
        );
      }

      originalBlob = await response.blob();
      fileName =
        downloadFileName ||
        downloadUrl.split("/").pop()?.split("?")[0] ||
        "input.mp4";
    } else if (mediaUrl) {
      // 일반 모드: 로컬 파일 ObjectURL에서 Blob 추출
      console.log('[sttJobService] → 일반 모드: 로컬 파일 사용');
      setDetailProgress(50);

      const response = await fetch(mediaUrl, { signal });
      if (!response.ok) {
        throw new Error(
          `로컬 파일 로드 실패: ${response.status} ${response.statusText}`,
        );
      }

      originalBlob = await response.blob();
      // ObjectURL에서는 파일명 추출 불가 → 기본값 사용
      fileName = "local_file.mp4";
    } else {
      throw new Error('mediaUrl이 필요합니다.');
    }

    setFileName(fileName);
    setDetailProgress(100);
    checkAborted(signal);

    // ==================== 2단계: 오디오 변환 (FFmpeg.wasm) ====================
    setStep(STEPS.CONVERTING);
    setDetailProgress(0);

    let mp3Blob = await ffmpegService.convertToMp3(
      originalBlob,
      fileName,
      (progress) => setDetailProgress(hasTimeRestriction ? progress * 0.7 : progress),
    );
    originalBlob = null; // 원본 Blob 즉시 해제 (대용량 메모리 절약)
    checkAborted(signal);

    // 구간 제한이 있으면 해당 구간만 트리밍
    if (hasTimeRestriction) {
      console.log(`[sttJobService] 구간 트리밍: ${allowedStartSec}s ~ ${allowedEndSec}s`);
      const trimmed = await ffmpegService.splitMp3(
        mp3Blob,
        [{ startSec: allowedStartSec, endSec: allowedEndSec }],
        (progress) => setDetailProgress(70 + progress * 0.3),
      );
      mp3Blob = trimmed[0].blob;
      checkAborted(signal);
    }

    // ==================== 3단계: STT 처리 ====================
    setStep(STEPS.STT_PROCESSING);
    setDetailProgress(0);

    // STT 제공자 설정
    const sttConfig = await getSTTConfigForModel(model, isServerMode);
    
    const keySourceMsg = isServerMode 
      ? '환경변수(.env)를 확인하세요.' 
      : '설정 > AI 탭에서 API Key를 입력하세요.';
    
    if (model === 'clova' && !sttConfig.secretKey) {
      throw new Error(`엔진1 API Key가 설정되지 않았습니다. ${keySourceMsg}`);
    }
    if (model === 'elevenlabs' && !sttConfig.apiKey) {
      throw new Error(`엔진2 API Key가 설정되지 않았습니다. ${keySourceMsg}`);
    }

    const sttProvider = createSTTProvider(sttConfig.provider, {
      invokeUrl: sttConfig.invokeUrl,
      secretKey: sttConfig.secretKey,
      apiKey: sttConfig.apiKey,
    });

    // 세그먼트 분리 옵션
    const segmentOptions = {
      maxSegmentLength,
      splitTimeGap,
    };

    // STT 실행 (화자 분리 활성화)
    const sttFile = new File([mp3Blob], "audio.mp3", { type: "audio/mpeg" });
    mp3Blob = null; // STT용 File 생성 후 mp3Blob 해제

    let sttResult = await sttProvider.transcribe(sttFile, {
      language,
      onProgress: (progress) => setDetailProgress(progress),
      enableDiarization: true,
      diarize: true,
      ...segmentOptions,
    });

    // 구간 트리밍한 경우, 타임스탬프에 시작 오프셋을 더해 원본 시간 기준으로 보정
    if (hasTimeRestriction && allowedStartSec > 0) {
      sttResult = sttResult.map((sub) => ({
        ...sub,
        startTime: sub.startTime + allowedStartSec,
        endTime: sub.endTime + allowedStartSec,
      }));
    }

    setSubtitles(sttResult);
    checkAborted(signal);

    // ==================== 4단계: 서버에 저장 (Legacy 모드일 때만) ====================
    const savedToDb = isLegacyMode;
    console.log('[sttJobService] DB 저장 여부:', savedToDb ? 'Yes (Legacy 모드)' : 'No (일반 모드)');
    
    if (isLegacyMode) {
      setStep(STEPS.SAVING);
      setDetailProgress(0);

      await saveSubtitles(fileId, fileName, sttResult);
      setDetailProgress(100);
    }

    // ==================== 완료 ====================
    setStep(STEPS.COMPLETED);
    currentAbortController = null;

    return {
      success: true,
      subtitles: sttResult,
      fileName,
      savedToDb, // DB 저장 여부 반환
    };
  } catch (error) {
    currentAbortController = null;
    if (error.name === 'AbortError') {
      console.log('[sttJobService] STT 작업 취소됨');
      return;
    }
    const safeMessage = mapSTTErrorMessage(error);
    console.error("STT 작업 실패:", safeMessage);
    setError(safeMessage);
    throw error;
  }
}

/**
 * 초를 hh:mm:ss.xxx 형식으로 변환
 * @param {number} seconds - 초 단위 시간
 * @returns {string} hh:mm:ss.xxx 형식
 */
function secondsToTimeFormat(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const ms = Math.round((secs % 1) * 1000);
  const wholeSecs = Math.floor(secs);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSecs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/**
 * 자막 저장 API 호출
 * @param {number} fileNo - 파일 번호
 * @param {string} fileName - 파일명 (확장자 포함)
 * @param {Array} subtitles - 자막 배열
 * @returns {Promise<object>}
 */
async function saveSubtitles(fileNo, fileName, subtitles) {
  // 백엔드 API 형식에 맞게 변환
  // - fileNo: 파일 번호 (ID)
  // - name: 파일명에서 확장자 제거 (사용자 구분용)
  // - fileName: 원본 파일명 (확장자 포함)
  // - segments: 자막 배열 (hh:mm:ss.xxx 형식)
  const name = fileName.replace(/\.[^.]+$/, ""); // 확장자 제거

  const response = await post("/api/subtitles", {
    fileNo: String(fileNo),
    name,
    fileName,
    segments: subtitles.map((sub) => ({
      speaker: sub.speaker?.label || sub.speakerId || "0",
      start: secondsToTimeFormat(sub.startTime || 0),
      end: secondsToTimeFormat(sub.endTime || 0),
      text: sub.text || "",
      align: "bottomCenter",
    })),
  });

  return response;
}

/**
 * 분할 STT 작업 실행
 * 파일을 구간별로 분할하여 최대 5개 동시 STT 요청 후 결과를 병합합니다.
 * @param {object} options
 * @param {string} [options.mode] - 처리 모드 ('legacy' | undefined)
 * @param {string} [options.fileId] - MinIO 파일 ID
 * @param {string} [options.mediaUrl] - 로컬 파일 ObjectURL
 * @param {string} [options.language] - 언어 코드
 * @param {string} [options.model] - STT 모델
 * @param {number} [options.maxSegmentLength] - 세그먼트 최대 문자 수
 * @param {number} [options.splitTimeGap] - 분리 기준 시간 간격
 * @param {boolean} [options.isServerMode] - 서버 모드 여부
 * @param {Array<{startSec: number, endSec: number}>} options.splitSegments - 분할 구간 배열
 * @param {number} [options.concurrency=5] - 최대 동시 요청 수
 * @returns {Promise<{success: boolean, subtitles: Array, overlaps: Array, fileName: string}>}
 */
export async function executeSplitSttJob(options) {
  const store = useSttJobStore.getState();
  const {
    setStep, setDetailProgress, setError, setSubtitles,
    setOverlaps, setFileName, initSplitMode, setChunkProgress,
  } = store;

  const {
    mode,
    fileId,
    mediaUrl,
    language = "ko-KR",
    model = DEFAULT_STT_MODEL,
    maxSegmentLength = DEFAULT_MAX_SEGMENT_LENGTH,
    splitTimeGap = DEFAULT_SPLIT_TIME_GAP,
    isServerMode = false,
    splitSegments,
    concurrency = 5,
    overlapSec = 5,
  } = options;

  if (!splitSegments?.length) {
    throw new Error('분할 구간이 지정되지 않았습니다.');
  }

  const isLegacyMode = mode === 'legacy';
  const maxConcurrency = Math.max(1, Math.min(5, concurrency));

  // 이전 작업이 있으면 abort 후 새 컨트롤러 생성
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  console.log('[sttJobService] executeSplitSttJob 시작:', {
    segments: splitSegments.length,
    concurrency: maxConcurrency,
    model,
  });

  try {
    // ==================== 1단계: 파일 준비 ====================
    setStep(STEPS.DOWNLOADING);
    setDetailProgress(0);

    let originalBlob;
    let fileName;

    if (isLegacyMode) {
      if (!fileId) throw new Error('Legacy 모드에서는 fileId가 필요합니다.');
      const downloadResponse = await getFileDownloadUrl(fileId);
      const d = downloadResponse?.data || downloadResponse;
      const downloadUrl = d?.url;
      const downloadFileName = d?.fileName;
      setDetailProgress(30);

      const response = await fetch(downloadUrl, { signal });
      if (!response.ok) throw new Error(`파일 다운로드 실패: ${response.status}`);
      originalBlob = await response.blob();
      fileName = downloadFileName || downloadUrl.split("/").pop()?.split("?")[0] || "input.mp4";
    } else if (mediaUrl) {
      setDetailProgress(50);
      const response = await fetch(mediaUrl, { signal });
      if (!response.ok) throw new Error(`로컬 파일 로드 실패: ${response.status}`);
      originalBlob = await response.blob();
      fileName = "local_file.mp4";
    } else {
      throw new Error('mediaUrl이 필요합니다.');
    }

    setFileName(fileName);
    setDetailProgress(100);
    checkAborted(signal);

    // ==================== 2단계: MP3 변환 ====================
    setStep(STEPS.CONVERTING);
    setDetailProgress(0);

    let mp3Blob = await ffmpegService.convertToMp3(
      originalBlob,
      fileName,
      (progress) => setDetailProgress(progress),
    );
    originalBlob = null; // 원본 Blob 즉시 해제 (대용량 메모리 절약)
    checkAborted(signal);

    // ==================== 3단계: MP3 분할 (앞뒤 오버랩 포함) ====================
    setStep(STEPS.SPLITTING);
    setDetailProgress(0);

    const effectiveOverlap = Math.max(0, Math.min(30, Number(overlapSec) || 5));
    const overlappedSegments = splitSegments.map((seg, i) => ({
      startSec: i === 0 ? seg.startSec : Math.max(0, seg.startSec - effectiveOverlap),
      endSec: i === splitSegments.length - 1 ? seg.endSec : seg.endSec + effectiveOverlap,
      originalStartSec: seg.startSec,
      originalEndSec: seg.endSec,
    }));

    console.log('[sttJobService] 오버랩 적용 구간:', overlappedSegments.map((s, i) =>
      `chunk_${i}: ${s.startSec}s~${s.endSec}s (원본: ${s.originalStartSec}s~${s.originalEndSec}s)`));

    const chunks = await ffmpegService.splitMp3(
      mp3Blob,
      overlappedSegments,
      (progress) => setDetailProgress(progress),
    );
    mp3Blob = null; // 분할 완료 후 전체 MP3 Blob 해제

    // FFmpeg 결과에 원래 구간 정보 보존
    chunks.forEach((chunk, i) => {
      chunk.originalStartSec = overlappedSegments[i].originalStartSec;
      chunk.originalEndSec = overlappedSegments[i].originalEndSec;
    });
    checkAborted(signal);

    // ==================== 4단계: 동시 STT 처리 ====================
    setStep(STEPS.STT_PROCESSING);
    setDetailProgress(0);
    initSplitMode(chunks.length);

    const sttConfig = await getSTTConfigForModel(model, isServerMode);
    const keySourceMsg = isServerMode
      ? '환경변수(.env)를 확인하세요.'
      : '설정 > AI 탭에서 API Key를 입력하세요.';

    if (model === 'clova' && !sttConfig.secretKey) {
      throw new Error(`엔진1 API Key가 설정되지 않았습니다. ${keySourceMsg}`);
    }
    if (model === 'elevenlabs' && !sttConfig.apiKey) {
      throw new Error(`엔진2 API Key가 설정되지 않았습니다. ${keySourceMsg}`);
    }

    const segmentOptions = { maxSegmentLength, splitTimeGap };
    const chunkResults = new Array(chunks.length);

    console.log('[sttJobService] 분할 완료, 청크 수:', chunks.length,
      chunks.map((c, i) => `chunk_${i}: ${c.blob.size}bytes (${c.startSec}s~${c.endSec}s)`));

    const tasks = chunks.map((chunk, i) => async () => {
      checkAborted(signal);
      console.log(`[sttJobService] chunk_${i} STT 시작 (${chunk.startSec}s~${chunk.endSec}s, ${chunk.blob.size}bytes)`);

      const sttProvider = createSTTProvider(sttConfig.provider, {
        invokeUrl: sttConfig.invokeUrl,
        secretKey: sttConfig.secretKey,
        apiKey: sttConfig.apiKey,
      });

      const chunkFile = new File(
        [chunk.blob],
        `chunk_${i}.mp3`,
        { type: "audio/mpeg" },
      );

      const result = await sttProvider.transcribe(chunkFile, {
        language,
        onProgress: (progress) => setChunkProgress(i, progress),
        enableDiarization: true,
        diarize: true,
        ...segmentOptions,
      });

      console.log(`[sttJobService] chunk_${i} STT 완료: ${result?.length || 0}개 자막`);

      chunkResults[i] = {
        subtitles: result,
        startSec: chunk.startSec,
        originalStartSec: chunk.originalStartSec,
        originalEndSec: chunk.originalEndSec,
      };

      // STT 완료 후 해당 청크 blob 해제
      chunk.blob = null;
      setChunkProgress(i, 100);
    });

    await runWithConcurrency(tasks, maxConcurrency);
    checkAborted(signal);

    // ==================== 5단계: 자막 병합 ====================
    setStep(STEPS.MERGING);
    setDetailProgress(0);

    console.log('[sttJobService] 청크별 결과:',
      chunkResults.map((cr, i) => `chunk_${i}: ${cr?.subtitles?.length || 0}개`));

    const mergedSubtitles = mergeChunkSubtitles(chunkResults);
    const overlaps = detectOverlaps(mergedSubtitles);

    console.log('[sttJobService] 병합 결과:', mergedSubtitles.length, '개 자막,', overlaps.length, '개 겹침');

    setDetailProgress(100);
    setSubtitles(mergedSubtitles);
    setOverlaps(overlaps);

    // ==================== 완료 ====================
    setStep(STEPS.COMPLETED);
    currentAbortController = null;

    return {
      success: true,
      subtitles: mergedSubtitles,
      overlaps,
      fileName,
      savedToDb: false,
    };
  } catch (error) {
    currentAbortController = null;
    if (error.name === 'AbortError') {
      console.log('[sttJobService] 분할 STT 작업 취소됨');
      return;
    }
    const safeMessage = mapSTTErrorMessage(error);
    console.error("분할 STT 작업 실패:", safeMessage);
    setError(safeMessage);
    throw error;
  }
}

/**
 * STT 작업 취소 (진행 중인 요청 abort + FFmpeg 종료)
 */
export function cancelSttJob() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  ffmpegService.terminate();
  useSttJobStore.getState().reset();
}

export default {
  executeSttJob,
  executeSplitSttJob,
  cancelSttJob,
};
