/**
 * FFmpeg.wasm 기반 오디오 변환 서비스
 * 브라우저에서 미디어 파일을 MP3로 변환합니다.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

class FFmpegService {
  constructor() {
    this.ffmpeg = new FFmpeg();
    this.loaded = false;
    this.loading = false;
  }

  /**
   * FFmpeg.wasm 로드
   * @param {function} onProgress - 진행률 콜백 (0-100)
   */
  async load(onProgress) {
    if (this.loaded) return;
    if (this.loading) {
      // 이미 로딩 중이면 완료될 때까지 대기
      while (this.loading) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.loading = true;

    try {
      // 로컬에서 WASM 파일 로드 (COEP/CORP 문제 회피)
      // Worker도 Blob URL로 로드하여 COEP 헤더 요구사항 우회
      const baseURL = '/ffmpeg';

      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress?.(progress * 100);
      });

      await this.ffmpeg.load({
        classWorkerURL: await toBlobURL(`${baseURL}/worker.js`, 'text/javascript'),
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * FFmpeg.wasm 지원 여부 확인
   * @returns {boolean}
   */
  static isSupported() {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof WebAssembly !== 'undefined'
    );
  }

  /**
   * 미디어 파일을 MP3로 변환 (STT 최적화: 16kHz, mono)
   * @param {Blob} inputBlob - 원본 미디어 파일
   * @param {string} inputName - 입력 파일명 (확장자 포함)
   * @param {function} onProgress - 진행률 콜백 (0-100)
   * @returns {Promise<Blob>} MP3 Blob
   */
  async convertToMp3(inputBlob, inputName, onProgress) {
    // 지원 확인
    if (!FFmpegService.isSupported()) {
      throw new Error('이 브라우저는 FFmpeg.wasm을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.');
    }

    // FFmpeg 로드
    await this.load(onProgress);

    // 파일 쓰기 (VFS에 복사 후 Uint8Array 즉시 해제하여 메모리 절약)
    let inputData = await fetchFile(inputBlob);
    await this.ffmpeg.writeFile(inputName, inputData);
    inputData = null;

    // 변환 진행률 추적
    this.ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(progress * 100);
    });

    // STT 최적화 설정: 16kHz, mono, 128kbps
    await this.ffmpeg.exec([
      '-i', inputName,
      '-vn',           // 비디오 스트림 제거
      '-ar', '16000',  // 샘플레이트 16kHz
      '-ac', '1',      // 모노 채널
      '-b:a', '128k',  // 비트레이트
      '-f', 'mp3',
      '-y',
      'output.mp3',
    ]);

    // 결과 읽기 (Blob 생성 후 원본 Uint8Array 즉시 해제)
    let data = await this.ffmpeg.readFile('output.mp3');
    const result = new Blob([data.buffer], { type: 'audio/mpeg' });
    data = null;

    // 임시 파일 정리
    try {
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile('output.mp3');
    } catch {
      // 파일 삭제 실패는 무시
    }

    return result;
  }

  /**
   * 기존 mp3 를 CBR 로 정규화 (재생 호환성용)
   *
   * Chrome 의 mp3 demuxer 가 VBR 파일에서 seek 시 byte 위치를 추정으로 계산하기 때문에
   * 일부 파일에서 위치별로 어긋남(재생 시점과 실제 디코드된 sample 시점이 어긋남)이 발생.
   * CBR 로 강제하면 byte ↔ time 매핑이 선형이 되어 정확히 seek 됨.
   *
   * convertToMp3 와 달리 sample rate / channels 는 입력 그대로 유지 (재생 품질 보존).
   * -b:a 비트레이트와 동일한 -minrate / -maxrate 로 CBR 강제.
   *
   * @param {Blob} inputBlob - 원본 mp3 Blob
   * @param {string} inputName - 입력 파일명 (확장자 포함)
   * @param {function} onProgress - 진행률 콜백 (0-100)
   * @returns {Promise<Blob>} CBR mp3 Blob
   */
  async normalizeMp3(inputBlob, inputName, onProgress) {
    if (!FFmpegService.isSupported()) {
      throw new Error('이 브라우저는 FFmpeg.wasm을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.');
    }

    await this.load(onProgress);

    let inputData = await fetchFile(inputBlob);
    await this.ffmpeg.writeFile(inputName, inputData);
    inputData = null;

    this.ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(progress * 100);
    });

    // sample rate / channels 미지정 — 입력 그대로 보존
    // -minrate/-maxrate 를 b:a 와 동일하게 두어 CBR 강제
    await this.ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-minrate', '128k',
      '-maxrate', '128k',
      '-f', 'mp3',
      '-y',
      'output.mp3',
    ]);

    let data = await this.ffmpeg.readFile('output.mp3');
    const result = new Blob([data.buffer], { type: 'audio/mpeg' });
    data = null;

    try {
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile('output.mp3');
    } catch {
      // 무시
    }

    return result;
  }

  /**
   * 미디어 파일을 WAV(PCM)로 변환 (파형 생성용, 인코더 딜레이 없음)
   * MP3 변환과 달리 비압축 PCM이므로 원본 오디오와 정확히 시간 정렬됩니다.
   * @param {Blob} inputBlob - 원본 미디어 파일
   * @param {string} inputName - 입력 파일명 (확장자 포함)
   * @param {function} onProgress - 진행률 콜백 (0-100)
   * @returns {Promise<Blob>} WAV Blob
   */
  async convertToWav(inputBlob, inputName, onProgress) {
    if (!FFmpegService.isSupported()) {
      throw new Error('이 브라우저는 FFmpeg.wasm을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.');
    }

    await this.load(onProgress);

    let inputData = await fetchFile(inputBlob);
    await this.ffmpeg.writeFile(inputName, inputData);
    inputData = null;

    this.ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(progress * 100);
    });

    await this.ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      '-y',
      'output.wav',
    ]);

    let data = await this.ffmpeg.readFile('output.wav');
    const result = new Blob([data.buffer], { type: 'audio/wav' });
    data = null;

    try {
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile('output.wav');
    } catch {
      // 파일 삭제 실패는 무시
    }

    return result;
  }

  /**
   * MP3 파일을 구간별로 분할
   * convertToMp3() 결과를 입력으로 받아 지정된 구간들로 분할합니다.
   * @param {Blob} mp3Blob - 전체 MP3 Blob (convertToMp3 결과)
   * @param {Array<{startSec: number, endSec: number}>} segments - 분할 구간 배열
   * @param {function} [onProgress] - 진행률 콜백 (0-100)
   * @returns {Promise<Array<{blob: Blob, startSec: number, endSec: number}>>}
   */
  async splitMp3(mp3Blob, segments, onProgress) {
    if (!segments || segments.length === 0) {
      throw new Error('분할 구간이 지정되지 않았습니다.');
    }

    await this.load();

    const inputName = 'split_input.mp3';
    let inputData = await fetchFile(mp3Blob);
    await this.ffmpeg.writeFile(inputName, inputData);
    inputData = null;

    console.log('[FFmpeg] splitMp3 입력 크기:', mp3Blob.size, 'bytes, 구간 수:', segments.length);

    const results = [];

    for (let i = 0; i < segments.length; i++) {
      const { startSec, endSec } = segments[i];
      const duration = endSec - startSec;
      const outputName = `chunk_${i}.mp3`;

      // -ss를 -i 앞에 놓아 입력 레벨 시크 (스트림 복사와 호환)
      // -t로 출력 길이 지정 (-to는 입력 기준이라 -c copy와 충돌)
      await this.ffmpeg.exec([
        '-ss', String(startSec),
        '-i', inputName,
        '-t', String(duration),
        '-c', 'copy',
        '-y',
        outputName,
      ]);

      let data = await this.ffmpeg.readFile(outputName);
      let chunkBlob = new Blob([data.buffer], { type: 'audio/mpeg' });
      data = null;

      console.log(`[FFmpeg] chunk_${i}: ${startSec}s~${endSec}s (${duration}s), 크기: ${chunkBlob.size} bytes`);

      if (chunkBlob.size < 100) {
        console.warn(`[FFmpeg] chunk_${i} 크기가 너무 작음, 재인코딩 시도`);
        chunkBlob = null;
        await this.ffmpeg.exec([
          '-ss', String(startSec),
          '-i', inputName,
          '-t', String(duration),
          '-ar', '16000',
          '-ac', '1',
          '-b:a', '128k',
          '-y',
          outputName,
        ]);
        let reData = await this.ffmpeg.readFile(outputName);
        chunkBlob = new Blob([reData.buffer], { type: 'audio/mpeg' });
        reData = null;
        console.log(`[FFmpeg] chunk_${i} 재인코딩 결과: ${chunkBlob.size} bytes`);
      }

      results.push({ blob: chunkBlob, startSec, endSec });

      try {
        await this.ffmpeg.deleteFile(outputName);
      } catch {
        // 무시
      }

      onProgress?.(Math.round(((i + 1) / segments.length) * 100));
    }

    try {
      await this.ffmpeg.deleteFile(inputName);
    } catch {
      // 무시
    }

    return results;
  }

  /**
   * 여러 미디어 파일을 순서대로 이어붙여 하나의 파일로 병합
   * @param {Array<Blob>} blobs - 병합할 미디어 Blob 배열 (순서대로)
   * @param {Array<string>} fileNames - 각 Blob에 대응하는 파일명 배열
   * @param {function} [onProgress] - 진행률 콜백 (0-100)
   * @returns {Promise<Blob>} 병합된 미디어 Blob
   */
  async concatFiles(blobs, fileNames, onProgress) {
    if (!blobs || blobs.length === 0) {
      throw new Error('병합할 파일이 없습니다.');
    }
    if (blobs.length === 1) {
      return blobs[0];
    }

    if (!FFmpegService.isSupported()) {
      throw new Error('이 브라우저는 FFmpeg.wasm을 지원하지 않습니다.');
    }

    await this.load(onProgress);

    // 1. 각 파일을 FFmpeg VFS에 쓰기
    for (let i = 0; i < blobs.length; i++) {
      const data = await fetchFile(blobs[i]);
      await this.ffmpeg.writeFile(fileNames[i], data);
      onProgress?.(Math.round(((i + 1) / blobs.length) * 30));
    }

    // 2. concat demuxer 목록 파일 생성
    const encoder = new TextEncoder();
    const listContent = fileNames.map((n) => `file '${n}'`).join('\n');
    await this.ffmpeg.writeFile('filelist.txt', encoder.encode(listContent));

    // 3. concat demuxer로 병합 (재인코딩하여 정확한 duration 메타데이터 보장)
    const inputExt = fileNames[0].split('.').pop()?.toLowerCase() || 'mp3';
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const isVideo = videoExts.includes(inputExt);
    const outputName = isVideo ? 'merged_output.mp4' : 'merged_output.mp3';

    this.ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(30 + Math.round(progress * 60));
    });

    const execArgs = [
      '-f', 'concat', '-safe', '0',
      '-i', 'filelist.txt',
    ];
    if (isVideo) {
      execArgs.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k');
    } else {
      execArgs.push('-ar', '16000', '-ac', '1', '-b:a', '128k');
    }
    execArgs.push('-y', outputName);

    await this.ffmpeg.exec(execArgs);

    onProgress?.(90);

    // 4. 결과 읽기
    const result = await this.ffmpeg.readFile(outputName);
    const mime = isVideo ? 'video/mp4' : 'audio/mpeg';
    const outputBlob = new Blob([result.buffer], { type: mime });

    // 5. 임시 파일 정리
    for (const name of fileNames) {
      try { await this.ffmpeg.deleteFile(name); } catch {}
    }
    try { await this.ffmpeg.deleteFile('filelist.txt'); } catch {}
    try { await this.ffmpeg.deleteFile(outputName); } catch {}

    onProgress?.(100);
    return outputBlob;
  }

  /**
   * 리소스 정리
   */
  terminate() {
    if (this.loaded) {
      this.ffmpeg.terminate();
      this.loaded = false;
    }
  }
}

// 싱글톤 인스턴스
export const ffmpegService = new FFmpegService();

export default ffmpegService;
