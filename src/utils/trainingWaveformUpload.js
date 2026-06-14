/**
 * 연수(Training) 파형(.dat) 서버 업로드 유틸
 *
 * `utils/waveformUpload.js` 의 training 버전.
 * 차이점:
 *   1. presigned URL 발급 — training-files/waveforms/presigned-url
 *   2. 메타 저장 path 에 trainingFileId 사용 (body 에 fileNo 없음)
 *
 * 의뢰 등록 흐름의 `uploadToMinIO` 헬퍼는 그대로 재사용한다.
 */
import {
  getTrainingWaveformPresignedUrl,
  saveTrainingWaveformMeta,
} from '../api/v9/training';
import { uploadToMinIO } from '../api/v9/order';

/**
 * 연수 파일 파형 ArrayBuffer 를 서버에 업로드하고 메타를 저장한다.
 *
 * @param {string} trainingFileId - 연수 파일 UUID
 * @param {ArrayBuffer} waveformArrayBuffer - WaveformData 바이너리 (.dat)
 * @param {Object} [options]
 * @param {function} [options.onProgress] - MinIO PUT 진행률 콜백 (0-100)
 * @param {AbortSignal} [options.signal] - 취소 시그널
 * @returns {Promise<void>}
 */
export async function uploadTrainingWaveformToServer(
  trainingFileId,
  waveformArrayBuffer,
  options = {},
) {
  const { onProgress, signal } = options;

  if (!trainingFileId) {
    throw new Error('trainingFileId 가 필요합니다.');
  }
  if (!waveformArrayBuffer) {
    throw new Error('waveformArrayBuffer 가 비어있습니다.');
  }

  const wfUuid = crypto.randomUUID();
  const wfFileName = `${wfUuid}.dat`;

  const presigned = await getTrainingWaveformPresignedUrl({
    fileName: wfFileName,
    uuid: wfUuid,
  });

  if (presigned?.status !== 'SUCCESS' || !presigned.data?.presignedUrl) {
    throw new Error(
      presigned?.message || '연수 파형 presigned URL 발급 실패',
    );
  }

  const blob = new Blob([waveformArrayBuffer], {
    type: 'application/octet-stream',
  });

  await uploadToMinIO(presigned.data.presignedUrl, blob, onProgress, signal);

  await saveTrainingWaveformMeta(trainingFileId, {
    fileName: wfFileName,
    filePath: presigned.data.filePath,
    systemFileName: wfUuid,
    fileSize: blob.size,
  });
}

export default {
  uploadTrainingWaveformToServer,
};
