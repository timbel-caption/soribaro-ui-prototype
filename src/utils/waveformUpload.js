/**
 * 파형(.dat) 서버 업로드 유틸
 *
 * 의뢰 등록(useMediaProcessor)과 worktool(WaveformViewer) 양쪽에서 공용으로 사용.
 * presigned URL 발급 → MinIO PUT → 메타 저장 순서로 처리합니다.
 */
import { getWaveformPresignedUrl, saveWaveformMeta, uploadToMinIO } from '../api/v9/order';

/**
 * 파형 ArrayBuffer를 서버에 업로드하고 메타를 저장합니다.
 *
 * @param {number|string} fileNo - 원본 파일 번호 (TB_FILE.FILE_NO)
 * @param {ArrayBuffer} waveformArrayBuffer - WaveformData 바이너리 (.dat)
 * @param {Object} [options]
 * @param {function} [options.onProgress] - 업로드 진행률 콜백 (0-100)
 * @param {AbortSignal} [options.signal] - 취소 시그널
 * @returns {Promise<void>}
 */
export async function uploadWaveformToServer(fileNo, waveformArrayBuffer, options = {}) {
  const { onProgress, signal } = options;

  const wfUuid = crypto.randomUUID();
  const wfFileName = `${wfUuid}.dat`;

  const wfPresignedRes = await getWaveformPresignedUrl({ fileName: wfFileName, uuid: wfUuid });

  if (wfPresignedRes.status !== 'SUCCESS' || !wfPresignedRes.data?.presignedUrl) {
    throw new Error(wfPresignedRes.message || 'Waveform presigned URL 발급 실패');
  }

  const waveformBlob = new Blob([waveformArrayBuffer], { type: 'application/octet-stream' });

  await uploadToMinIO(wfPresignedRes.data.presignedUrl, waveformBlob, onProgress, signal);

  await saveWaveformMeta({
    fileNo,
    fileName: wfFileName,
    filePath: wfPresignedRes.data.filePath,
    systemFileName: wfUuid,
    fileSize: waveformBlob.size,
  });
}
