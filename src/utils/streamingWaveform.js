/**
 * WebCodecs 기반 스트리밍 파형 생성 유틸
 *
 * 파일을 청크 단위로 받으면서 점진적으로 파형을 생성합니다.
 * - mp4box.js: 컨테이너에서 오디오 트랙 추출
 * - WebCodecs AudioDecoder: 청크별 PCM 디코딩
 * - 실시간 peaks 계산
 */

import { createFile as createMP4BoxFile } from 'mp4box';

// 파형 데이터를 위한 샘플 버퍼 (성능 최적화)
class WaveformBuffer {
  constructor(samplesPerPixel = 512, sampleRate = 0) {
    this.samplesPerPixel = samplesPerPixel;
    this.sampleRate = sampleRate;
    this.peaks = [];
    this.sampleBuffer = [];
    this.processedSamples = 0;
    this.lastNotifiedLength = 0; // 마지막으로 콜백에 전달한 peaks 길이
    // timestamp 정렬용: 지금까지 버퍼에 쌓인 누적 샘플 개수(=다음 샘플의 absolute index)
    this.nextSampleIdx = null;
    // 디버깅/리포트용 패딩 통계
    this.paddedSamples = 0;
    this.skippedSamples = 0;
  }

  setSampleRate(sampleRate) {
    this.sampleRate = sampleRate;
  }

  /**
   * 누적 append 방식. 호출자가 샘플 순서를 보장할 때만 사용.
   * timestamp 정보가 없을 때의 레거시 경로.
   */
  addSamples(samples) {
    for (let i = 0; i < samples.length; i++) {
      this.sampleBuffer.push(samples[i]);
      this._flushIfFull();
    }
    if (this.nextSampleIdx === null) this.nextSampleIdx = 0;
    this.nextSampleIdx += samples.length;
  }

  /**
   * timestamp-aware append. `timestampMicros`는 이 samples 블록의
   * 첫 샘플이 놓여야 하는 presentation time (µs).
   * - 첫 호출에서 timestampMicros > 0이면 그만큼 선행 무음 패딩(= leading offset).
   * - 중간 갭(incomingIdx > nextSampleIdx)은 무음으로 메움.
   * - overlap(incomingIdx < nextSampleIdx)은 선두 일부 샘플 skip.
   * sampleRate가 0이면 레거시 append로 폴백.
   */
  addSamplesAt(samples, timestampMicros) {
    if (!this.sampleRate || this.sampleRate <= 0) {
      this.addSamples(samples);
      return;
    }

    const incomingIdx = Math.max(
      0,
      Math.round((timestampMicros * this.sampleRate) / 1_000_000),
    );

    if (this.nextSampleIdx === null) {
      this.nextSampleIdx = 0;
    }

    if (incomingIdx > this.nextSampleIdx) {
      // 누락 구간 무음 패딩
      const gap = incomingIdx - this.nextSampleIdx;
      this._padSilence(gap);
      this.paddedSamples += gap;
    } else if (incomingIdx < this.nextSampleIdx) {
      // overlap: 앞쪽 일부 skip
      const skip = this.nextSampleIdx - incomingIdx;
      this.skippedSamples += Math.min(skip, samples.length);
      if (skip >= samples.length) return;
      const remain = samples.subarray ? samples.subarray(skip) : samples.slice(skip);
      for (let i = 0; i < remain.length; i++) {
        this.sampleBuffer.push(remain[i]);
        this._flushIfFull();
      }
      this.nextSampleIdx += remain.length;
      return;
    }

    for (let i = 0; i < samples.length; i++) {
      this.sampleBuffer.push(samples[i]);
      this._flushIfFull();
    }
    this.nextSampleIdx += samples.length;
  }

  _flushIfFull() {
    if (this.sampleBuffer.length < this.samplesPerPixel) return;
    let min = Infinity;
    let max = -Infinity;
    for (const s of this.sampleBuffer) {
      if (s < min) min = s;
      if (s > max) max = s;
    }
    this.peaks.push({ min, max });
    this.sampleBuffer = [];
    this.processedSamples += this.samplesPerPixel;
  }

  _padSilence(count) {
    for (let i = 0; i < count; i++) {
      this.sampleBuffer.push(0);
      this._flushIfFull();
    }
  }

  getPeaks() {
    return this.peaks;
  }

  // 새 peaks가 충분히 추가되었는지 확인 (배치 업데이트용)
  hasNewPeaks(minBatchSize = 10) {
    return this.peaks.length - this.lastNotifiedLength >= minBatchSize;
  }

  // 콜백 전송 후 호출
  markNotified() {
    this.lastNotifiedLength = this.peaks.length;
  }

  getProgress(totalSamples) {
    if (!totalSamples) return 0;
    return Math.min(100, (this.processedSamples / totalSamples) * 100);
  }
}

/**
 * 스트리밍 방식으로 파형 생성
 * @param {string} url - 미디어 파일 URL
 * @param {object} options - 옵션
 * @param {function} options.onProgress - 진행률 콜백 (0-100)
 * @param {function} options.onPeaksUpdate - 파형 데이터 업데이트 콜백
 * @param {number} options.samplesPerPixel - 픽셀당 샘플 수 (기본: 512)
 * @param {AbortSignal} options.signal - 취소 시그널
 * @returns {Promise<{peaks: Array, sampleRate: number, duration: number}>}
 */
export async function generateStreamingWaveform(url, options = {}) {
  const {
    onProgress = () => {},
    onPeaksUpdate = () => {},
    samplesPerPixel = 512,
    signal,
  } = options;

  // WebCodecs 지원 확인
  if (typeof AudioDecoder === 'undefined') {
    throw new Error('WebCodecs AudioDecoder is not supported in this browser');
  }

  return new Promise((resolve, reject) => {
    const waveformBuffer = new WaveformBuffer(samplesPerPixel);
    let audioTrack = null;
    let audioDecoder = null;
    let sampleRate = 0;
    let duration = 0;
    let totalSamples = 0;
    let isAborted = false;
    // [waveform-sync] 디버그/보정용 통계
    let firstAudioTimestampMicros = null;
    let lastAudioEndMicros = 0;

    // 취소 처리
    if (signal) {
      signal.addEventListener('abort', () => {
        isAborted = true;
        if (audioDecoder && audioDecoder.state !== 'closed') {
          audioDecoder.close();
        }
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }

    // MP4Box 설정
    const mp4box = createMP4BoxFile();

    mp4box.onReady = (info) => {
      if (isAborted) return;

      // 오디오 트랙 찾기
      audioTrack = info.audioTracks[0];
      if (!audioTrack) {
        reject(new Error('No audio track found'));
        return;
      }

      duration = info.duration / info.timescale;
      sampleRate = audioTrack.audio.sample_rate;
      totalSamples = Math.ceil(duration * sampleRate);
      waveformBuffer.setSampleRate(sampleRate);

      // [waveform-sync] edit list(edts/elst) 유무 로깅 — 2-3초 밀림 원인 진단용
      const edits = audioTrack.edits || audioTrack.edit_list || null;
      console.log('[waveform-sync] Audio track info:', {
        codec: audioTrack.codec,
        sampleRate,
        channels: audioTrack.audio.channel_count,
        duration,
        hasEditList: !!edits,
        edits,
      });

      // AudioDecoder 초기화
      try {
        audioDecoder = new AudioDecoder({
          output: (audioData) => {
            if (isAborted) return;
            processAudioData(audioData);
          },
          error: (e) => {
            console.error('AudioDecoder error:', e);
            if (!isAborted) {
              reject(e);
            }
          },
        });

        // 코덱 설정
        const codecConfig = {
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio.sample_rate,
          numberOfChannels: audioTrack.audio.channel_count,
        };

        // AAC description 추출 (AudioSpecificConfig)
        const trak = mp4box.getTrackById(audioTrack.id);
        const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
        const esdsData = entry?.esds?.esd?.descs?.[0]?.descs?.[0]?.data;
        if (esdsData) {
          codecConfig.description = esdsData;
        } else if (audioTrack.description) {
          codecConfig.description = audioTrack.description;
        }

        audioDecoder.configure(codecConfig);

        // 오디오 샘플 추출 요청
        mp4box.setExtractionOptions(audioTrack.id, null, {
          nbSamples: 100,
        });
        mp4box.start();
        // 주의: 여기서 mp4box.seek(0)을 호출하면 안 됨.
        // start()가 이미 버퍼에 있는 샘플들을 emit하고 trak.nextSample을 N까지 진행시킨 상태에서
        // seek(0)이 nextSample=0으로 리셋하면, onReady 리턴 직후 appendBuffer 내부의
        // processSamples()가 다시 실행될 때 0~N-1 샘플이 이미 alreadyRead===size라 캐시된
        // 데이터로 재emit된다. 결과적으로 첫 2-4초 분량의 PCM이 파형 앞쪽에 복제됨
        // (사용자 보고: "영상 0-2초에 알수없는 파형이 추가되어 2-3초 밀린 것처럼 보임").
        // moov-at-end 파일의 복구는 아래 fetchAndProcess의 retry 블록에서 별도 처리.
      } catch (e) {
        reject(new Error(`Failed to initialize AudioDecoder: ${e.message}`));
      }
    };

    mp4box.onSamples = (trackId, ref, samples) => {
      if (isAborted || !audioDecoder) return;

      for (const sample of samples) {
        try {
          const chunk = new EncodedAudioChunk({
            type: sample.is_sync ? 'key' : 'delta',
            timestamp: (sample.cts * 1000000) / sample.timescale,
            duration: (sample.duration * 1000000) / sample.timescale,
            data: sample.data,
          });

          audioDecoder.decode(chunk);
        } catch (e) {
          console.warn('Failed to decode chunk:', e);
        }
      }
    };

    mp4box.onError = (e) => {
      if (!isAborted) {
        reject(new Error(`MP4Box error: ${e}`));
      }
    };

    // 디코딩된 오디오 데이터 처리 (배치 업데이트로 성능 최적화)
    let lastProgressUpdate = 0;
    const PROGRESS_UPDATE_INTERVAL = 50; // ms
    const MIN_PEAKS_BATCH = 20; // 최소 20개 peaks마다 업데이트

    function processAudioData(audioData) {
      const numberOfChannels = audioData.numberOfChannels;
      const numberOfFrames = audioData.numberOfFrames;

      // HE-AAC(SBR) 등에서 컨테이너 메타 sample_rate와 실제 디코더 출력 sample_rate가
      // 다를 수 있음. peaks는 디코더 출력 기준으로 쌓이므로 실제 출력 레이트로 덮어쓴다.
      if (audioData.sampleRate && audioData.sampleRate !== sampleRate) {
        sampleRate = audioData.sampleRate;
        totalSamples = Math.ceil(duration * sampleRate);
        waveformBuffer.setSampleRate(sampleRate);
      }

      // 첫 번째 채널의 PCM 데이터 추출 (format 명시로 s16 등 비float 포맷 대응)
      const channelData = new Float32Array(numberOfFrames);
      audioData.copyTo(channelData, { planeIndex: 0, format: 'f32-planar' });

      // 스테레오인 경우 모노로 믹스
      if (numberOfChannels > 1) {
        const secondChannel = new Float32Array(numberOfFrames);
        audioData.copyTo(secondChannel, { planeIndex: 1, format: 'f32-planar' });

        for (let i = 0; i < numberOfFrames; i++) {
          channelData[i] = (channelData[i] + secondChannel[i]) / 2;
        }
      }

      // [waveform-sync] timestamp 기반 정렬. audioData.timestamp는 µs 단위의
      // presentation time — edit list/priming delay 등으로 인한 leading offset이
      // 여기서 자연히 반영됨.
      if (firstAudioTimestampMicros === null) {
        firstAudioTimestampMicros = audioData.timestamp;
        console.log('[waveform-sync] first audioData.timestamp (µs):', audioData.timestamp,
          '→', (audioData.timestamp / 1_000_000).toFixed(3), 's');
      }
      waveformBuffer.addSamplesAt(channelData, audioData.timestamp);
      lastAudioEndMicros = audioData.timestamp + (numberOfFrames * 1_000_000) / sampleRate;

      // 배치 업데이트: 충분한 peaks가 쌓였거나, 일정 시간이 지났을 때만 콜백 호출
      const now = Date.now();
      const shouldUpdate =
        waveformBuffer.hasNewPeaks(MIN_PEAKS_BATCH) ||
        now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL;

      if (shouldUpdate) {
        lastProgressUpdate = now;
        waveformBuffer.markNotified();

        // 진행률 업데이트
        const progress = waveformBuffer.getProgress(totalSamples);
        onProgress(progress);
        onPeaksUpdate(waveformBuffer.getPeaks());
      }

      audioData.close();
    }

    // 파일 fetch 및 스트리밍 처리
    async function fetchAndProcess() {
      try {
        const response = await fetch(url, { signal });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body.getReader();
        let offset = 0;

        while (true) {
          const { done, value } = await reader.read();

          if (done || isAborted) {
            break;
          }

          const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
          buffer.fileStart = offset;
          mp4box.appendBuffer(buffer);
          offset += value.byteLength;
        }

        // 스트림 종료
        mp4box.flush();

        // moov-at-end: onReady 후 샘�� 추출이 안 됐으면 re-fetch
        if (waveformBuffer.getPeaks().length === 0 && audioTrack && !isAborted) {
          mp4box.seek(0);
          const retryResponse = await fetch(url, { signal });
          if (!retryResponse.ok) throw new Error(`HTTP error: ${retryResponse.status}`);
          const retryReader = retryResponse.body.getReader();
          let retryOffset = 0;

          while (true) {
            const { done, value } = await retryReader.read();
            if (done || isAborted) break;
            const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
            buf.fileStart = retryOffset;
            mp4box.appendBuffer(buf);
            retryOffset += value.byteLength;
          }
          mp4box.flush();
        }

        // 디코더 완료 대기
        if (audioDecoder && audioDecoder.state !== 'closed') {
          await audioDecoder.flush();
          audioDecoder.close();
        }

        // [waveform-sync] trailing 무음 패딩: 오디오가 컨테이너 duration보다
        // 짧게 끝날 경우 peaks 길이를 타임라인에 맞게 늘려 stretch 왜곡을 방지.
        if (sampleRate > 0 && duration > 0) {
          const expectedTotalSamples = Math.ceil(duration * sampleRate);
          const currentIdx = waveformBuffer.nextSampleIdx ?? 0;
          if (currentIdx < expectedTotalSamples) {
            waveformBuffer._padSilence(expectedTotalSamples - currentIdx);
            waveformBuffer.nextSampleIdx = expectedTotalSamples;
          }
        }

        // 최종 결과 반환
        onProgress(100);
        const finalPeaks = waveformBuffer.getPeaks();
        onPeaksUpdate(finalPeaks);

        // [waveform-sync] 정렬 통계 — 파형 밀림 진단용
        console.log('[waveform-sync] MP4 summary:', {
          firstTimestampSec: firstAudioTimestampMicros != null
            ? (firstAudioTimestampMicros / 1_000_000).toFixed(3)
            : null,
          lastAudioEndSec: (lastAudioEndMicros / 1_000_000).toFixed(3),
          containerDuration: duration.toFixed(3),
          paddedSamples: waveformBuffer.paddedSamples,
          paddedSec: (waveformBuffer.paddedSamples / (sampleRate || 1)).toFixed(3),
          skippedSamples: waveformBuffer.skippedSamples,
          peaksLength: finalPeaks.length,
          expectedPeaks: Math.ceil((duration * sampleRate) / samplesPerPixel),
        });

        resolve({
          peaks: finalPeaks,
          sampleRate,
          duration,
          samplesPerPixel,
        });
      } catch (e) {
        if (e.name === 'AbortError') {
          reject(e);
        } else {
          reject(new Error(`Failed to fetch and process: ${e.message}`));
        }
      }
    }

    fetchAndProcess();
  });
}

// ── MP3 스트리밍 파형 생성 ──

const MP3_BITRATES = {
  1: {
    1: [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448,0],
    2: [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0],
    3: [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0],
  },
  2: {
    1: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256,0],
    2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
    3: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
  },
};

const MP3_SAMPLE_RATES = { 1: [44100,48000,32000], 2: [22050,24000,16000], 2.5: [11025,12000,8000] };
const MP3_SAMPLES_PER_FRAME = { 1: {1:384,2:1152,3:1152}, 2: {1:384,2:1152,3:576}, 2.5: {1:384,2:1152,3:576} };

function parseMp3FrameHeader(b0, b1, b2, b3) {
  if (b0 !== 0xFF || (b1 & 0xE0) !== 0xE0) return null;

  const versionBits = (b1 >> 3) & 0x03;
  if (versionBits === 1) return null;
  const layerBits = (b1 >> 1) & 0x03;
  if (layerBits === 0) return null;

  const bitrateIndex = (b2 >> 4) & 0x0F;
  if (bitrateIndex === 0 || bitrateIndex === 15) return null;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (sampleRateIndex === 3) return null;
  const padding = (b2 >> 1) & 0x01;
  const channelMode = (b3 >> 6) & 0x03;

  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;

  const brKey = version === 1 ? 1 : 2;
  const bitrate = MP3_BITRATES[brKey]?.[layer]?.[bitrateIndex];
  if (!bitrate) return null;

  const sampleRate = MP3_SAMPLE_RATES[version]?.[sampleRateIndex];
  if (!sampleRate) return null;

  let frameLength;
  if (layer === 1) {
    frameLength = (Math.floor(12 * bitrate * 1000 / sampleRate) + padding) * 4;
  } else if (layer === 3 && version !== 1) {
    // MPEG2/2.5 Layer 3: 576 samples/frame → multiplier 72
    frameLength = Math.floor(72 * bitrate * 1000 / sampleRate) + padding;
  } else {
    frameLength = Math.floor(144 * bitrate * 1000 / sampleRate) + padding;
  }
  if (frameLength < 4) return null;

  const samplesPerFrame = MP3_SAMPLES_PER_FRAME[version]?.[layer] || 1152;
  const channels = channelMode === 3 ? 1 : 2;

  return { version, layer, bitrate, sampleRate, padding, channels, frameLength, samplesPerFrame };
}

function skipId3v2(buf) {
  if (buf.length < 10) return 0;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7F) << 21) | ((buf[7] & 0x7F) << 14) | ((buf[8] & 0x7F) << 7) | (buf[9] & 0x7F);
    return 10 + size;
  }
  return 0;
}

/**
 * MP3 파일을 스트리밍으로 디코딩하여 파형 생성 (메모리 안전)
 * @param {string|Blob|ReadableStream} source - URL, Blob, 또는 ReadableStream
 * @param {object} options
 * @param {function} options.onProgress - 진행률 콜백 (0-100)
 * @param {function} options.onPeaksUpdate - 파형 데이터 업데이트 콜백
 * @param {number} options.samplesPerPixel - 픽셀당 샘플 수 (기본: 512)
 * @param {AbortSignal} options.signal - 취소 시그널
 * @returns {Promise<{peaks: Array, sampleRate: number, duration: number, samplesPerPixel: number}>}
 */
export async function generateStreamingWaveformForMP3(source, options = {}) {
  const {
    onProgress = () => {},
    onPeaksUpdate = () => {},
    samplesPerPixel = 512,
    signal,
  } = options;

  if (typeof AudioDecoder === 'undefined') {
    throw new Error('WebCodecs AudioDecoder is not supported in this browser');
  }

  let stream;
  let totalSize = 0;

  if (typeof source === 'string') {
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    totalSize = parseInt(response.headers.get('content-length') || '0', 10);
    stream = response.body;
  } else if (source instanceof Blob) {
    totalSize = source.size;
    stream = source.stream();
  } else if (source instanceof ReadableStream) {
    stream = source;
  } else {
    throw new Error('Invalid source: must be URL string, Blob, or ReadableStream');
  }

  const waveformBuf = new WaveformBuffer(samplesPerPixel);
  let sampleRate = 0;
  let samplesPerFrame = 0;
  let isAborted = false;
  let bytesRead = 0;
  let frameCount = 0;
  let decoderConfigured = false;
  let timestamp = 0;
  let buffer = new Uint8Array(0);
  let id3Skipped = false;
  // [waveform-sync] 정렬 진단용
  let firstMp3TimestampMicros = null;
  let lastMp3EndMicros = 0;

  if (signal) {
    signal.addEventListener('abort', () => { isAborted = true; }, { once: true });
  }

  const audioDecoder = new AudioDecoder({
    output: (audioData) => {
      if (isAborted) { audioData.close(); return; }
      if (audioData.sampleRate && audioData.sampleRate !== sampleRate) {
        sampleRate = audioData.sampleRate;
        waveformBuf.setSampleRate(sampleRate);
      }
      const nFrames = audioData.numberOfFrames;
      const nCh = audioData.numberOfChannels;
      const ch0 = new Float32Array(nFrames);
      audioData.copyTo(ch0, { planeIndex: 0, format: 'f32-planar' });

      if (nCh > 1) {
        const ch1 = new Float32Array(nFrames);
        audioData.copyTo(ch1, { planeIndex: 1, format: 'f32-planar' });
        for (let i = 0; i < nFrames; i++) ch0[i] = (ch0[i] + ch1[i]) / 2;
      }

      if (firstMp3TimestampMicros === null) {
        firstMp3TimestampMicros = audioData.timestamp;
        console.log('[waveform-sync] MP3 first audioData.timestamp (µs):', audioData.timestamp,
          '→', (audioData.timestamp / 1_000_000).toFixed(3), 's');
      }
      waveformBuf.addSamplesAt(ch0, audioData.timestamp);
      lastMp3EndMicros = audioData.timestamp + (nFrames * 1_000_000) / (sampleRate || 1);
      audioData.close();
    },
    error: (e) => {
      if (!isAborted) console.error('MP3 AudioDecoder error:', e);
    },
  });

  let lastProgressUpdate = 0;

  function emitProgress() {
    const now = Date.now();
    if (!waveformBuf.hasNewPeaks(20) && now - lastProgressUpdate < 50) return;
    lastProgressUpdate = now;
    waveformBuf.markNotified();
    onProgress(totalSize > 0 ? Math.min(99, (bytesRead / totalSize) * 100) : 0);
    onPeaksUpdate(waveformBuf.getPeaks());
  }

  function appendToBuffer(data) {
    const combined = new Uint8Array(buffer.length + data.length);
    combined.set(buffer);
    combined.set(data, buffer.length);
    buffer = combined;
  }

  function parseFrames() {
    let offset = 0;

    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xFF || (buffer[offset + 1] & 0xE0) !== 0xE0) {
        offset++;
        continue;
      }

      const header = parseMp3FrameHeader(buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]);
      if (!header) { offset++; continue; }
      if (offset + header.frameLength > buffer.length) break;

      if (!decoderConfigured) {
        sampleRate = header.sampleRate;
        samplesPerFrame = header.samplesPerFrame;
        waveformBuf.setSampleRate(sampleRate);
        try {
          audioDecoder.configure({
            codec: 'mp3',
            sampleRate: header.sampleRate,
            numberOfChannels: header.channels,
          });
          decoderConfigured = true;
        } catch (e) {
          console.warn('MP3 AudioDecoder configure failed:', e);
          offset++;
          continue;
        }
      }

      try {
        const frameData = buffer.slice(offset, offset + header.frameLength);
        audioDecoder.decode(new EncodedAudioChunk({
          type: 'key',
          timestamp,
          data: frameData,
        }));
        timestamp += (header.samplesPerFrame / header.sampleRate) * 1_000_000;
        frameCount++;
      } catch {
        // skip corrupt frame
      }

      offset += header.frameLength;
    }

    if (offset > 0) buffer = buffer.slice(offset);
    emitProgress();
  }

  try {
    const reader = stream.getReader();

    while (!isAborted) {
      const { done, value } = await reader.read();
      if (done) break;

      let data = value;
      bytesRead += data.length;

      if (!id3Skipped) {
        appendToBuffer(data);
        const skip = skipId3v2(buffer);
        if (skip > 0 && buffer.length >= skip) {
          buffer = buffer.slice(skip);
        } else if (skip > 0) {
          id3Skipped = false;
          continue;
        }
        id3Skipped = true;
        parseFrames();
        continue;
      }

      appendToBuffer(data);
      parseFrames();
    }

    if (isAborted) throw new DOMException('Aborted', 'AbortError');

    parseFrames();

    if (audioDecoder.state !== 'closed') {
      await audioDecoder.flush();
      audioDecoder.close();
    }

    const frameBasedDuration = sampleRate > 0 ? (frameCount * samplesPerFrame) / sampleRate : 0;
    // [waveform-sync] 실제 디코딩된 마지막 시각과 프레임 기반 계산 중 큰 쪽을 채택.
    // 디코더가 leading padding을 흡수해 lastMp3EndMicros > frameBasedDuration인 경우 대비.
    const duration = Math.max(frameBasedDuration, lastMp3EndMicros / 1_000_000);
    onProgress(100);
    const finalPeaks = waveformBuf.getPeaks();
    onPeaksUpdate(finalPeaks);

    // [waveform-sync] 정렬 통계
    console.log('[waveform-sync] MP3 summary:', {
      firstTimestampSec: firstMp3TimestampMicros != null
        ? (firstMp3TimestampMicros / 1_000_000).toFixed(3)
        : null,
      lastAudioEndSec: (lastMp3EndMicros / 1_000_000).toFixed(3),
      frameBasedDuration: frameBasedDuration.toFixed(3),
      resolvedDuration: duration.toFixed(3),
      paddedSamples: waveformBuf.paddedSamples,
      paddedSec: (waveformBuf.paddedSamples / (sampleRate || 1)).toFixed(3),
      skippedSamples: waveformBuf.skippedSamples,
      peaksLength: finalPeaks.length,
    });

    return { peaks: finalPeaks, sampleRate, duration, samplesPerPixel };
  } catch (e) {
    if (audioDecoder.state !== 'closed') {
      try { audioDecoder.close(); } catch { /* ignore */ }
    }
    throw e;
  }
}

/**
 * MP3 파일 여부 확인
 */
export function isMP3File(fileName, mimeType) {
  if (mimeType) {
    const mp3Types = ['audio/mpeg', 'audio/mp3'];
    if (mp3Types.some((t) => mimeType.toLowerCase().startsWith(t))) return true;
  }
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'mp3') return true;
  }
  return false;
}

/**
 * WAV 파일 여부 확인
 */
export function isWAVFile(fileName, mimeType) {
  if (mimeType) {
    const t = mimeType.toLowerCase();
    if (t.startsWith('audio/wav') || t.startsWith('audio/x-wav') || t.startsWith('audio/wave')) return true;
  }
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'wav' || ext === 'wave') return true;
  }
  return false;
}

// ── WAV 스트리밍 파형 생성 ──

const WAV_FMT_PCM = 0x0001;
const WAV_FMT_FLOAT = 0x0003;
const WAV_FMT_EXTENSIBLE = 0xFFFE;
// EXTENSIBLE SubFormat GUID 첫 2바이트 (LE) — 나머지 14바이트는 KSDATAFORMAT_SUBTYPE_* 고정
const KSDATAFORMAT_SUBTYPE_PCM_PREFIX = 0x0001;
const KSDATAFORMAT_SUBTYPE_FLOAT_PREFIX = 0x0003;

/**
 * WAV 헤더 파싱 — RIFF/WAVE 컨테이너에서 fmt 청크 + data 청크 시작 오프셋을 찾는다.
 * 청크가 fmt → data 가 아닌 순서로 나오는 파일도 흔하므로(LIST/JUNK 등 사이 끼어들기) 모두 순회.
 *
 * @param {Uint8Array} buf - 파일 선두를 충분히 포함한 버퍼 (최소 fmt + data 헤더까지 포함되어야 함)
 * @returns {{audioFormat:number, channels:number, sampleRate:number, bitsPerSample:number, dataOffset:number, dataSize:number}|null}
 */
export function parseWavHeader(buf) {
  if (buf.length < 44) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // "RIFF"...."WAVE"
  if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46) return null;
  if (buf[8] !== 0x57 || buf[9] !== 0x41 || buf[10] !== 0x56 || buf[11] !== 0x45) return null;

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let fmtFound = false;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id0 = buf[offset], id1 = buf[offset + 1], id2 = buf[offset + 2], id3 = buf[offset + 3];
    const chunkSize = view.getUint32(offset + 4, true);
    const bodyOffset = offset + 8;

    // "fmt "
    if (id0 === 0x66 && id1 === 0x6D && id2 === 0x74 && id3 === 0x20) {
      if (bodyOffset + 16 > buf.length) return null;
      audioFormat = view.getUint16(bodyOffset, true);
      channels = view.getUint16(bodyOffset + 2, true);
      sampleRate = view.getUint32(bodyOffset + 4, true);
      bitsPerSample = view.getUint16(bodyOffset + 14, true);

      // EXTENSIBLE: SubFormat GUID 의 첫 2바이트로 PCM/FLOAT 판별
      if (audioFormat === WAV_FMT_EXTENSIBLE && chunkSize >= 40 && bodyOffset + 26 <= buf.length) {
        const sub = view.getUint16(bodyOffset + 24, true);
        if (sub === KSDATAFORMAT_SUBTYPE_PCM_PREFIX) audioFormat = WAV_FMT_PCM;
        else if (sub === KSDATAFORMAT_SUBTYPE_FLOAT_PREFIX) audioFormat = WAV_FMT_FLOAT;
      }
      fmtFound = true;
    }
    // "data"
    else if (id0 === 0x64 && id1 === 0x61 && id2 === 0x74 && id3 === 0x61) {
      dataOffset = bodyOffset;
      dataSize = chunkSize;
      // 헤더 파싱 목적이므로 data를 만나면 즉시 종료 (실제 PCM 본문은 스트리밍으로 처리)
      break;
    }

    // 청크 크기는 짝수 바이트로 패딩됨
    offset = bodyOffset + chunkSize + (chunkSize & 1);
  }

  if (!fmtFound || dataOffset < 0) return null;
  return { audioFormat, channels, sampleRate, bitsPerSample, dataOffset, dataSize };
}

/**
 * WAV 파일을 스트리밍으로 읽어 파형 생성 (메모리 안전)
 * 디코더 불필요 — RIFF 헤더만 파싱하고 PCM 바이트를 직접 float로 변환.
 *
 * 지원 포맷: PCM 8/16/24/32-bit, IEEE float 32-bit (mono/stereo+ all downmix to mono)
 *
 * @param {string|Blob|ReadableStream} source - URL, Blob, 또는 ReadableStream
 * @param {object} options
 * @param {function} options.onProgress - 진행률 콜백 (0-100)
 * @param {function} options.onPeaksUpdate - 파형 데이터 업데이트 콜백
 * @param {number} options.samplesPerPixel - 픽셀당 샘플 수 (기본: 512)
 * @param {AbortSignal} options.signal - 취소 시그널
 * @returns {Promise<{peaks:Array, sampleRate:number, duration:number, samplesPerPixel:number}>}
 */
export async function generateStreamingWaveformForWAV(source, options = {}) {
  const {
    onProgress = () => {},
    onPeaksUpdate = () => {},
    samplesPerPixel = 512,
    signal,
  } = options;

  let stream;
  let totalSize = 0;

  if (typeof source === 'string') {
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    totalSize = parseInt(response.headers.get('content-length') || '0', 10);
    stream = response.body;
  } else if (source instanceof Blob) {
    totalSize = source.size;
    stream = source.stream();
  } else if (source instanceof ReadableStream) {
    stream = source;
  } else {
    throw new Error('Invalid source: must be URL string, Blob, or ReadableStream');
  }

  let isAborted = false;
  if (signal) {
    signal.addEventListener('abort', () => { isAborted = true; }, { once: true });
  }

  const reader = stream.getReader();
  let bytesRead = 0;
  let lastProgressUpdate = 0;

  // 1단계: 헤더 수집 — fmt 와 data 청크가 모두 보일 때까지 누적.
  // 보통 헤더는 수십~수백 바이트로 끝나지만, JUNK/LIST 등이 끼면 더 길어질 수 있다.
  let headerBuf = new Uint8Array(0);
  let header = null;
  const HEADER_MAX = 64 * 1024; // 안전 상한
  let leftover = null; // 헤더 파싱 후 첫 PCM 바이트로 흘러갈 잔여

  while (!header && !isAborted) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.length;
    const merged = new Uint8Array(headerBuf.length + value.length);
    merged.set(headerBuf);
    merged.set(value, headerBuf.length);
    headerBuf = merged;

    header = parseWavHeader(headerBuf);
    if (header) {
      if (headerBuf.length > header.dataOffset) {
        leftover = headerBuf.subarray(header.dataOffset);
      }
      headerBuf = null;
      break;
    }
    if (headerBuf.length > HEADER_MAX) {
      throw new Error('WAV 헤더를 찾을 수 없습니다 (RIFF/fmt/data 청크 누락)');
    }
  }

  if (isAborted) throw new DOMException('Aborted', 'AbortError');
  if (!header) throw new Error('WAV 헤더 파싱 실패');

  const { audioFormat, channels, sampleRate, bitsPerSample, dataSize } = header;

  if (audioFormat !== WAV_FMT_PCM && audioFormat !== WAV_FMT_FLOAT) {
    throw new Error(`지원하지 않는 WAV 포맷 (audioFormat=0x${audioFormat.toString(16)}). 압축된 WAV(μ-law/A-law/ADPCM 등)는 별도 디코더가 필요합니다.`);
  }
  if (audioFormat === WAV_FMT_PCM && bitsPerSample !== 8 && bitsPerSample !== 16 && bitsPerSample !== 24 && bitsPerSample !== 32) {
    throw new Error(`지원하지 않는 PCM 비트 깊이: ${bitsPerSample}`);
  }
  if (audioFormat === WAV_FMT_FLOAT && bitsPerSample !== 32) {
    throw new Error(`지원하지 않는 IEEE float 비트 깊이: ${bitsPerSample}`);
  }
  if (channels < 1) {
    throw new Error(`잘못된 채널 수: ${channels}`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameSize = bytesPerSample * channels;
  const totalFrames = dataSize > 0 ? Math.floor(dataSize / frameSize) : 0;
  const duration = totalFrames > 0 ? totalFrames / sampleRate : 0;

  const waveformBuf = new WaveformBuffer(samplesPerPixel, sampleRate);

  // 청크 경계에 걸친 부분 프레임을 다음 청크 앞에 이어붙이기 위한 잔여 버퍼
  let pending = new Uint8Array(0);
  let processedBytes = 0;

  function emitProgress() {
    const now = Date.now();
    if (!waveformBuf.hasNewPeaks(20) && now - lastProgressUpdate < 50) return;
    lastProgressUpdate = now;
    waveformBuf.markNotified();
    let progress = 0;
    if (dataSize > 0) {
      progress = Math.min(99, (processedBytes / dataSize) * 100);
    } else if (totalSize > 0) {
      progress = Math.min(99, (bytesRead / totalSize) * 100);
    }
    onProgress(progress);
    onPeaksUpdate(waveformBuf.getPeaks());
  }

  /**
   * PCM 바이트 청크를 float 샘플로 변환해 WaveformBuffer 에 적재.
   * frameSize 단위로만 처리하고, 끝의 부분 프레임은 caller 가 관리.
   */
  function processPcmBytes(bytes, byteOffset, byteLength, frameStartIndex) {
    if (byteLength <= 0) return;
    const frames = Math.floor(byteLength / frameSize);
    if (frames === 0) return;

    const samples = new Float32Array(frames);
    const dv = new DataView(bytes.buffer, bytes.byteOffset + byteOffset, frames * frameSize);

    if (audioFormat === WAV_FMT_FLOAT) {
      // 32-bit float
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          sum += dv.getFloat32(f * frameSize + c * 4, true);
        }
        samples[f] = sum / channels;
      }
    } else if (bitsPerSample === 16) {
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          sum += dv.getInt16(f * frameSize + c * 2, true);
        }
        samples[f] = (sum / channels) / 32768;
      }
    } else if (bitsPerSample === 24) {
      // 24bit LE: 3바이트, MSB 부호 확장
      const base = bytes.byteOffset + byteOffset;
      const u8 = bytes.buffer instanceof ArrayBuffer
        ? new Uint8Array(bytes.buffer, base, frames * frameSize)
        : bytes.subarray(byteOffset, byteOffset + frames * frameSize);
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const o = f * frameSize + c * 3;
          let v = u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16);
          if (v & 0x800000) v |= 0xFF000000; // 부호 확장
          sum += v;
        }
        samples[f] = (sum / channels) / 8388608; // 2^23
      }
    } else if (bitsPerSample === 32) {
      // 32-bit signed int PCM
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          sum += dv.getInt32(f * frameSize + c * 4, true);
        }
        samples[f] = (sum / channels) / 2147483648; // 2^31
      }
    } else {
      // 8-bit unsigned (WAV 규격: 8bit는 unsigned, center=128)
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          sum += bytes[byteOffset + f * frameSize + c] - 128;
        }
        samples[f] = (sum / channels) / 128;
      }
    }

    const timestampMicros = (frameStartIndex * 1_000_000) / sampleRate;
    waveformBuf.addSamplesAt(samples, timestampMicros);
  }

  function feedChunk(chunk) {
    let combined;
    if (pending.length === 0) {
      combined = chunk;
    } else {
      combined = new Uint8Array(pending.length + chunk.length);
      combined.set(pending);
      combined.set(chunk, pending.length);
    }

    // dataSize 가 명시된 파일은 그 범위까지만 처리 (꼬리 메타 청크 무시)
    let usable = combined.length;
    if (dataSize > 0) {
      const remaining = dataSize - processedBytes;
      if (remaining <= 0) { pending = new Uint8Array(0); return; }
      if (usable > remaining) usable = remaining;
    }

    const fullFrames = Math.floor(usable / frameSize);
    const consumed = fullFrames * frameSize;
    const frameStartIndex = Math.floor(processedBytes / frameSize);

    if (consumed > 0) {
      processPcmBytes(combined, 0, consumed, frameStartIndex);
      processedBytes += consumed;
    }

    // 꼬리 부분 프레임은 다음 청크에 이어붙이기 위해 보존
    pending = combined.subarray(consumed, usable);
  }

  try {
    if (leftover && leftover.length > 0) {
      feedChunk(leftover);
      leftover = null;
      emitProgress();
    }

    while (!isAborted) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.length;
      feedChunk(value);
      emitProgress();
      if (dataSize > 0 && processedBytes >= dataSize) break;
    }

    if (isAborted) throw new DOMException('Aborted', 'AbortError');

    onProgress(100);
    const finalPeaks = waveformBuf.getPeaks();
    onPeaksUpdate(finalPeaks);

    console.log('[waveform-sync] WAV summary:', {
      audioFormat: `0x${audioFormat.toString(16)}`,
      bitsPerSample,
      channels,
      sampleRate,
      duration: duration.toFixed(3),
      processedBytes,
      declaredDataSize: dataSize,
      peaksLength: finalPeaks.length,
      expectedPeaks: Math.ceil((duration * sampleRate) / samplesPerPixel),
    });

    return { peaks: finalPeaks, sampleRate, duration, samplesPerPixel };
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

/**
 * 파형 데이터를 Peaks.js 포맷으로 변환
 */
export function convertToWaveformData(peaks, sampleRate, samplesPerPixel) {
  const minArray = new Float32Array(peaks.length);
  const maxArray = new Float32Array(peaks.length);

  for (let i = 0; i < peaks.length; i++) {
    minArray[i] = peaks[i].min;
    maxArray[i] = peaks[i].max;
  }

  return {
    version: 2,
    channels: 1,
    sample_rate: sampleRate,
    samples_per_pixel: samplesPerPixel,
    bits: 32,
    length: peaks.length,
    data: peaks.flatMap((p) => [p.min, p.max]),
  };
}

/**
 * Peaks.js JSON 파형 데이터를 WaveformData 바이너리(ArrayBuffer)로 변환
 * Version 2 포맷 (헤더 24바이트): [version:i32][flags:u32][sample_rate:i32][samples_per_pixel:i32][length:u32][channels:i32][data:i8[]]
 * flags=0 → 8-bit 정밀도, channels=1 → 모노
 *
 * Version 1(20바이트 헤더)은 Peaks.js가 데이터 크기로 bits를 추론하므로
 * min+max 각 1바이트(=포인트당 2바이트)를 16-bit로 오인하는 문제가 있어 Version 2를 사용합니다.
 *
 * @param {Object} jsonData - convertToWaveformData()가 반환한 JSON 객체
 * @returns {ArrayBuffer} WaveformData 바이너리 포맷
 */
export function waveformToArrayBuffer(jsonData) {
  const { sample_rate, samples_per_pixel, length, data } = jsonData;
  const headerSize = 24;
  const dataLength = length * 2;
  const buffer = new ArrayBuffer(headerSize + dataLength);
  const view = new DataView(buffer);

  view.setInt32(0, 2, true);                  // version 2 (24바이트 헤더)
  view.setUint32(4, 1, true);                 // flags (truthy = 8-bit, 0 = 16-bit)
  view.setInt32(8, sample_rate, true);        // sample_rate
  view.setInt32(12, samples_per_pixel, true); // samples_per_pixel
  view.setUint32(16, length, true);           // length (데이터 포인트 수)
  view.setInt32(20, 1, true);                 // channels (1 = 모노)

  for (let i = 0; i < data.length && i < dataLength; i++) {
    const val = typeof data[i] === 'number' ? data[i] : 0;
    const clamped = Math.max(-1, Math.min(1, val));
    view.setInt8(headerSize + i, Math.round(clamped * 127));
  }

  return buffer;
}

/**
 * WebCodecs 지원 여부 확인
 */
export function isWebCodecsSupported() {
  return typeof AudioDecoder !== 'undefined' && typeof EncodedAudioChunk !== 'undefined';
}

/**
 * MP4 컨테이너에서 정확한 duration을 파싱 (moov 아톰만 읽고 즉시 정리)
 * 브라우저 HTMLMediaElement.duration보다 정확한 값을 반환합니다.
 * @param {string} url - MP4 파일 URL
 * @param {AbortSignal} [signal] - 취소 시그널
 * @returns {Promise<number>} duration (초)
 */
export function getMP4ContainerDuration(url, signal) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let reader = null;
    const mp4box = createMP4BoxFile();

    const cleanup = () => {
      mp4box.flush();
      mp4box.onReady = null;
      mp4box.onError = null;
      mp4box.onSamples = null;
    };

    mp4box.onReady = (info) => {
      if (resolved) return;
      resolved = true;
      const duration = info.duration / info.timescale;
      cleanup();
      reader?.cancel().catch(() => {});
      reader = null;
      resolve(duration);
    };

    mp4box.onError = (e) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reader?.cancel().catch(() => {});
      reader = null;
      reject(new Error(`MP4 duration 파싱 실패: ${e}`));
    };

    (async () => {
      try {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        reader = response.body.getReader();
        let offset = 0;

        while (!resolved) {
          const { done, value } = await reader.read();
          if (done) break;

          const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
          buffer.fileStart = offset;
          mp4box.appendBuffer(buffer);
          offset += value.byteLength;
        }

        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('moov 아톰을 찾지 못했습니다.'));
        }
      } catch (e) {
        if (!resolved) {
          resolved = true;
          cleanup();
          if (e.name === 'AbortError') {
            reject(e);
          } else {
            reject(new Error(`MP4 duration fetch 실패: ${e.message}`));
          }
        }
      } finally {
        reader = null;
      }
    })();
  });
}

export default {
  generateStreamingWaveform,
  generateStreamingWaveformForMP3,
  generateStreamingWaveformForWAV,
  convertToWaveformData,
  waveformToArrayBuffer,
  isWebCodecsSupported,
  isMP3File,
  isWAVFile,
  parseWavHeader,
  getMP4ContainerDuration,
};
