/**
 * WAV 파일 무손실 병합 — RIFF 헤더 + data 청크 바이트 단위 결합.
 *
 * ffmpeg.wasm 재인코딩 경로(MP3 16kHz mono 128kbps)와 달리:
 *  - 무손실 (원본 PCM 그대로)
 *  - 빠름 (디코딩/인코딩 없음, 메모리 복사만)
 *  - ffmpeg.wasm 로딩 불필요
 *  - 출력이 WAV 라서 WaveformViewer 의 RIFF 스트리밍 파서로 처리 → OOM 안전
 *
 * 제약: 모든 입력 WAV 의 fmt 청크(audioFormat/channels/sampleRate/bitsPerSample) 가 동일해야 한다.
 * 다르면 throw → 호출자가 ffmpeg 폴백으로 전환한다.
 */
import { parseWavHeader } from './streamingWaveform';

// 일반적인 WAV 헤더는 44바이트지만 LIST/INFO 같은 메타 청크가 끼면 커진다.
// 64KB 면 어떤 정상적인 WAV 도 fmt + data 청크 헤더까지 포함된다.
const HEADER_PROBE_SIZE = 64 * 1024;

/**
 * 같은 fmt 의 WAV Blob 들을 RIFF 컨테이너 한 개로 합친다.
 *
 * @param {Blob[]} blobs - 병합할 WAV Blob 배열 (순서대로 이어붙임)
 * @returns {Promise<Blob>} 병합된 WAV Blob (type: 'audio/wav')
 * @throws {Error} 입력이 비어있거나, 헤더 파싱 실패, fmt 불일치 시
 */
export async function concatWavFiles(blobs) {
  if (!blobs || blobs.length === 0) {
    throw new Error('병합할 WAV 파일이 없습니다.');
  }
  if (blobs.length === 1) {
    return blobs[0];
  }

  // 1. 각 파일의 헤더 파싱
  const parsed = [];
  for (let i = 0; i < blobs.length; i++) {
    const probe = await blobs[i].slice(0, HEADER_PROBE_SIZE).arrayBuffer();
    const header = parseWavHeader(new Uint8Array(probe));
    if (!header) {
      throw new Error(`WAV 헤더 파싱 실패 (index=${i})`);
    }
    parsed.push({ blob: blobs[i], header });
  }

  // 2. fmt 일치 검증
  const first = parsed[0].header;
  for (let i = 1; i < parsed.length; i++) {
    const h = parsed[i].header;
    if (
      h.audioFormat !== first.audioFormat ||
      h.channels !== first.channels ||
      h.sampleRate !== first.sampleRate ||
      h.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error(
        `WAV fmt 불일치 (index=${i}): ` +
          `expected {fmt:${first.audioFormat}, ch:${first.channels}, sr:${first.sampleRate}, bps:${first.bitsPerSample}} ` +
          `got {fmt:${h.audioFormat}, ch:${h.channels}, sr:${h.sampleRate}, bps:${h.bitsPerSample}}`,
      );
    }
  }

  // 3. 데이터 슬라이스 수집 + 총 크기 계산
  const dataSlices = [];
  let totalDataSize = 0;
  for (const { blob, header } of parsed) {
    // data 청크 본문만 슬라이스. Blob.slice 는 lazy view 라서 즉시 메모리 복사 없음.
    dataSlices.push(blob.slice(header.dataOffset, header.dataOffset + header.dataSize));
    totalDataSize += header.dataSize;
  }

  // 4. 새 헤더 작성 — 첫 파일의 [0 ~ dataOffset) 범위를 그대로 가져와 size 두 곳만 갱신.
  //    dataOffset 바로 앞 4바이트가 data 청크 size 필드, 오프셋 4 가 RIFF 청크 size.
  const firstDataOffset = parsed[0].header.dataOffset;
  const headerBuf = new Uint8Array(await parsed[0].blob.slice(0, firstDataOffset).arrayBuffer());
  const view = new DataView(headerBuf.buffer, headerBuf.byteOffset, headerBuf.byteLength);

  // RIFF 크기 = 전체 파일 크기 - 8 (RIFF magic + size 필드 자체 제외)
  const newRiffSize = headerBuf.length + totalDataSize - 8;
  view.setUint32(4, newRiffSize, true);
  // data 청크 size 필드는 dataOffset - 4 위치
  view.setUint32(firstDataOffset - 4, totalDataSize, true);

  return new Blob([headerBuf, ...dataSlices], { type: 'audio/wav' });
}

/**
 * 파일명 배열이 모두 WAV 확장자인지 확인.
 */
export function allWavFiles(fileNames) {
  if (!fileNames || fileNames.length === 0) return false;
  return fileNames.every((n) => {
    const ext = n.split('.').pop()?.toLowerCase();
    return ext === 'wav' || ext === 'wave';
  });
}
