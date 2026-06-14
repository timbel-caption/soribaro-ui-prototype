/**
 * 단일 미디어 파일 → waveform .dat ArrayBuffer 헬퍼.
 *
 * `useMediaProcessor.js` 의 파형 생성 분기를 multi-file 진행률 로직 없이
 * 단일 파일 처리용으로 추출했다. 분기 규칙은 동일:
 *
 *   - WebCodecs + WAV     → generateStreamingWaveformForWAV (Blob 입력)
 *   - WebCodecs + MP3     → generateStreamingWaveformForMP3 (Blob 입력)
 *   - WebCodecs + video   → generateStreamingWaveform (Object URL 입력)
 *   - 그 외 (오디오, 500MB 미만) → decodeAudioData 기반 peaks 추출
 *   - 500MB 이상 + WebCodecs 미지원 → null (호출자가 skip 처리)
 *
 * 실패 시 null 반환 — 호출자는 파형 없이 본 파일 등록을 계속 진행해야 한다.
 * AbortError 만은 그대로 throw 해서 취소를 위로 전파한다.
 */
import {
  convertToWaveformData,
  waveformToArrayBuffer,
  generateStreamingWaveform,
  generateStreamingWaveformForMP3,
  generateStreamingWaveformForWAV,
  isWebCodecsSupported,
  isMP3File,
  isWAVFile,
} from './streamingWaveform';

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm'];

function isVideoFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('video/')) return true;
  const idx = file.name.lastIndexOf('.');
  if (idx < 0) return false;
  const ext = file.name.slice(idx + 1).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * decodeAudioData 기반 peaks 추출 — useMediaProcessor 의 동일 분기 복제.
 */
function decodeAndExtractPeaks(arrayBuffer, samplesPerPixel, onProgress) {
  return new Promise((resolve, reject) => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      reject(new Error('AudioContext 미지원'));
      return;
    }
    const ctx = new Ctx();
    onProgress?.(30);
    ctx
      .decodeAudioData(arrayBuffer)
      .then((buf) => {
        onProgress?.(70);
        const ch = buf.getChannelData(0);
        const peaks = [];
        for (let i = 0; i < ch.length; i += samplesPerPixel) {
          let min = Infinity;
          let max = -Infinity;
          const end = Math.min(i + samplesPerPixel, ch.length);
          for (let j = i; j < end; j++) {
            if (ch[j] < min) min = ch[j];
            if (ch[j] > max) max = ch[j];
          }
          peaks.push({ min, max });
        }
        onProgress?.(100);
        ctx.close();
        resolve({ peaks, sampleRate: buf.sampleRate, samplesPerPixel });
      })
      .catch((err) => {
        try {
          ctx.close();
        } catch {
          /* ignore */
        }
        reject(err);
      });
  });
}

/**
 * 미디어 파일에서 waveform .dat ArrayBuffer 를 생성한다.
 *
 * @param {File} file
 * @param {Object} [options]
 * @param {(percent: number) => void} [options.onProgress] - 진행률 (0~100)
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.samplesPerPixel=64]
 * @returns {Promise<ArrayBuffer|null>} 생성 실패/skip 이면 null
 */
export async function generateWaveformArrayBuffer(file, options = {}) {
  const { onProgress, signal, samplesPerPixel = 64 } = options;

  if (!file) return null;

  let result = null;
  let objectUrl = null;

  try {
    if (isWebCodecsSupported() && isWAVFile(file.name, file.type)) {
      result = await generateStreamingWaveformForWAV(file, {
        samplesPerPixel,
        signal,
        onProgress,
      });
    } else if (isWebCodecsSupported() && isMP3File(file.name, file.type)) {
      result = await generateStreamingWaveformForMP3(file, {
        samplesPerPixel,
        signal,
        onProgress,
      });
    } else if (isVideoFile(file) && isWebCodecsSupported()) {
      // 영상: mp4box + WebCodecs 로 컨테이너 직접 파싱
      objectUrl = URL.createObjectURL(file);
      result = await generateStreamingWaveform(objectUrl, {
        samplesPerPixel,
        signal,
        onProgress,
        onPeaksUpdate: () => {},
      });
    } else if (file.size < 500 * 1024 * 1024) {
      // 그 외 오디오(FLAC/AAC/OGG 등): decodeAudioData fallback
      const ab = await file.arrayBuffer();
      result = await decodeAndExtractPeaks(ab, samplesPerPixel, onProgress);
    } else {
      console.warn('[waveformGen] 대용량 + WebCodecs 미지원: 파형 생성 건너뜀');
      return null;
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.warn('[waveformGen] 파형 생성 실패:', err?.message || err);
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  if (!result?.peaks?.length) return null;

  const json = convertToWaveformData(
    result.peaks,
    result.sampleRate,
    result.samplesPerPixel ?? samplesPerPixel,
  );
  if (!json?.data?.length) return null;

  return waveformToArrayBuffer(json);
}

export default {
  generateWaveformArrayBuffer,
};
