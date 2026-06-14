import { useState, useCallback, useRef } from 'react';
import { convertToWaveformData, waveformToArrayBuffer, generateStreamingWaveform, generateStreamingWaveformForMP3, generateStreamingWaveformForWAV, isWebCodecsSupported, isMP3File, isWAVFile } from '../utils/streamingWaveform';
import { ffmpegService } from '../services/audio/ffmpegService';
import { getPresignedUrl, uploadToMinIO } from '../api/v9/order';
import { uploadWaveformToServer } from '../utils/waveformUpload';
import { sanitizeFileName } from '../utils/fileUtils';

// ── 유틸 ──

function isAudioFile(file) {
  if (file.type.startsWith('audio/')) return true;
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  return ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'].includes(ext);
}

function isVideoFile(file) {
  if (file.type.startsWith('video/')) return true;
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  return ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
}

function isAlreadyTarget(file) {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const mime = file.type;
  if (isAudioFile(file)) return ext === '.mp3' || mime === 'audio/mpeg';
  if (isVideoFile(file)) return ext === '.mp4' || mime === 'video/mp4';
  return false;
}

function extractDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = isVideoFile(file) ? document.createElement('video') : document.createElement('audio');
    el.preload = 'metadata';
    el.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      const d = Math.round(el.duration);
      resolve(isNaN(d) ? 0 : d);
    });
    el.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(0); });
    el.src = url;
  });
}

function decodeAndExtractPeaks(arrayBuffer, samplesPerPixel, onProgress) {
  return new Promise((resolve, reject) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    onProgress?.(30);
    ctx.decodeAudioData(arrayBuffer)
      .then((buf) => {
        onProgress?.(70);
        const ch = buf.getChannelData(0);
        const peaks = [];
        for (let i = 0; i < ch.length; i += samplesPerPixel) {
          let min = Infinity, max = -Infinity;
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
      .catch((err) => { ctx.close(); reject(err); });
  });
}

// ── 훅 ──

let fileIdCounter = 0;

/**
 * 미디어 파일 처리 훅
 *
 * 파이프라인:
 *  1차: 인코딩 (음성→mp3, 영상→mp4, 이미 mp3/mp4면 스킵)
 *  2차: 파형 생성 (영상→mp4box+WebCodecs 직접 파싱, 오디오→decodeAudioData)
 *  3차: 원본파일(mp3/mp4) MinIO 업로드
 *  4차: 파형파일(.dat) 업로드 + 메타 저장
 */
export default function useMediaProcessor() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const abortRef = useRef(null);

  const addFiles = useCallback((newFiles) => {
    const entries = newFiles.map((f) => ({
      id: `file_${++fileIdCounter}`,
      file: f,
      name: f.name,
      size: f.size,
      status: 'pending',
      progress: 0,
      waveformData: null,
      processedFile: null,
      needsEncoding: !isAlreadyTarget(f),
      error: null,
    }));
    setFiles((prev) => [...prev, ...entries]);
    return entries;
  }, []);

  const removeFile = useCallback((fileId) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const updateFile = useCallback((fileId, updates) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f)));
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setFiles([]);
    setIsProcessing(false);
    setOverallProgress(0);
  }, []);

  const processFiles = useCallback(async (fileEntries) => {
    if (!fileEntries || fileEntries.length === 0) return [];

    const abortController = new AbortController();
    abortRef.current = abortController;
    setIsProcessing(true);
    setOverallProgress(0);

    const results = [];
    const total = fileEntries.length;

    for (let i = 0; i < total; i++) {
      if (abortController.signal.aborted) break;

      const entry = fileEntries[i];
      const base = (i / total) * 100;
      const w = 100 / total;

      try {
        const uuid = crypto.randomUUID();
        const fileIsVideo = isVideoFile(entry.file);

        // ── 1차: 인코딩 (mp3/mp4가 아닌 파일만) ──
        let processedFile = entry.file;
        if (entry.needsEncoding) {
          updateFile(entry.id, { status: 'encoding', progress: 0 });
          const targetExt = fileIsVideo ? '.mp4' : '.mp3';
          // 현재 ffmpegService는 mp3 변환만 지원하므로 오디오 파일만 인코딩
          // 영상 파일은 원본 유지 (mp4가 아닌 영상은 추후 확장)
          if (!fileIsVideo) {
            try {
              const mp3Blob = await ffmpegService.convertToMp3(entry.file, entry.name, (p) => {
                updateFile(entry.id, { progress: p });
                setOverallProgress(base + (p / 100) * w * 0.15);
              });
              processedFile = new File([mp3Blob], entry.name.replace(/\.[^.]+$/, targetExt), { type: 'audio/mpeg' });
            } catch (encErr) {
              if (abortController.signal.aborted) throw encErr;
              console.warn('인코딩 실패 (원본 파일로 계속):', encErr.message);
            }
          }
        }
        updateFile(entry.id, { processedFile });
        setOverallProgress(base + w * 0.15);
        if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        // ── 2차: 파형 생성 (영상→MP4 직접 파싱, 오디오→decodeAudioData) ──
        updateFile(entry.id, { status: 'waveform', progress: 0 });
        let waveformData = null;
        let waveformBlob = null;

        try {
          let waveformResult;

          if (fileIsVideo && isWebCodecsSupported()) {
            // MP4: mp4box + WebCodecs로 원본에서 직접 파형 생성 (컨테이너 타이밍 보존)
            const videoUrl = URL.createObjectURL(processedFile);
            try {
              waveformResult = await generateStreamingWaveform(videoUrl, {
                samplesPerPixel: 64,
                signal: abortController.signal,
                onProgress: (p) => {
                  updateFile(entry.id, { progress: p });
                  setOverallProgress(base + w * 0.15 + (p / 100) * w * 0.35);
                },
                onPeaksUpdate: () => {},
              });
            } finally {
              URL.revokeObjectURL(videoUrl);
            }
          } else if (isWAVFile(entry.name, entry.file.type)) {
            // WAV: RIFF 헤더 파싱 + PCM 스트리밍 (decodeAudioData 우회로 메모리 폭발 방지)
            waveformResult = await generateStreamingWaveformForWAV(entry.file, {
              samplesPerPixel: 64,
              signal: abortController.signal,
              onProgress: (p) => {
                updateFile(entry.id, { progress: p });
                setOverallProgress(base + w * 0.15 + (p / 100) * w * 0.35);
              },
              onPeaksUpdate: () => {},
            });
          } else if (isWebCodecsSupported() && isMP3File(entry.name, entry.file.type)) {
            // MP3: WebCodecs 스트리밍
            waveformResult = await generateStreamingWaveformForMP3(entry.file, {
              samplesPerPixel: 64,
              signal: abortController.signal,
              onProgress: (p) => {
                updateFile(entry.id, { progress: p });
                setOverallProgress(base + w * 0.15 + (p / 100) * w * 0.35);
              },
              onPeaksUpdate: () => {},
            });
          } else if (entry.file.size < 500 * 1024 * 1024) {
            // 기타 오디오 (FLAC, AAC, OGG 등): decodeAudioData로 파형 생성
            const audioBuffer = await entry.file.arrayBuffer();
            waveformResult = await decodeAndExtractPeaks(audioBuffer, 64, (p) => {
              updateFile(entry.id, { progress: p });
              setOverallProgress(base + w * 0.15 + (p / 100) * w * 0.35);
            });
          } else {
            console.warn('대용량 파일 + WebCodecs 미지원: 파형 생성 건너뜀');
          }

          if (waveformResult) {
            waveformData = convertToWaveformData(
              waveformResult.peaks,
              waveformResult.sampleRate,
              waveformResult.samplesPerPixel
            );

            if (waveformData.length > 0 && waveformData.data?.length > 0) {
              const ab = waveformToArrayBuffer(waveformData);
              waveformBlob = new Blob([ab], { type: 'application/octet-stream' });
            }
          }
        } catch (waveErr) {
          if (waveErr.name === 'AbortError') throw waveErr;
          console.warn('파형 생성 실패 (계속 진행):', waveErr.message);
        }

        updateFile(entry.id, { waveformData });
        setOverallProgress(base + w * 0.5);
        if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        // ── 4차: 원본 파일 MinIO 업로드 ──
        updateFile(entry.id, { status: 'uploading', progress: 0 });
        const safeFileName = sanitizeFileName(entry.file.name);
        const presignedRes = await getPresignedUrl({ fileName: safeFileName, uuid });

        if (presignedRes.status !== 'SUCCESS' || !presignedRes.data) {
          throw new Error(presignedRes.message || 'Presigned URL 발급 실패');
        }

        const { presignedUrl, fileNo, filePath } = presignedRes.data;

        await uploadToMinIO(presignedUrl, entry.file, (p) => {
          updateFile(entry.id, { progress: p });
          setOverallProgress(base + w * 0.5 + (p / 100) * w * 0.3);
        }, abortController.signal);
        setOverallProgress(base + w * 0.8);

        // ── 5차: 파형파일(.dat) 업로드 + 메타 저장 ──
        if (waveformBlob) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          updateFile(entry.id, { status: 'waveform_upload', progress: 0 });
          try {
            await uploadWaveformToServer(fileNo, await waveformBlob.arrayBuffer(), {
              onProgress: (p) => {
                updateFile(entry.id, { progress: p });
                setOverallProgress(base + w * 0.8 + (p / 100) * w * 0.1);
              },
              signal: abortController.signal,
            });
            console.log(`[useMediaProcessor] waveform 업로드 완료 (fileNo: ${fileNo})`);
          } catch (wfErr) {
            console.warn('Waveform 업로드/저장 실패 (계속 진행):', wfErr.message);
          }
        }

        // ── 완료 ──
        const playTime = await extractDuration(entry.file);
        setOverallProgress(base + w);
        updateFile(entry.id, { status: 'done', progress: 100 });

        results.push({
          id: entry.id,
          fileNo,
          fileName: safeFileName,
          systemFileName: uuid,
          filePath,
          fileSize: entry.file.size,
          fileType: '1',
          playTime,
          originalName: entry.name,
          waveformData,
          needsEncoding: entry.needsEncoding,
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          updateFile(entry.id, { status: 'error', error: '취소됨' });
          break;
        }
        updateFile(entry.id, { status: 'error', error: err.message });
        console.error(`파일 처리 실패 (${entry.name}):`, err);
      }
    }

    setOverallProgress(100);
    setIsProcessing(false);
    abortRef.current = null;
    return results;
  }, [updateFile]);

  const cancel = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    try { ffmpegService.terminate(); } catch { /* ignore */ }
    setIsProcessing(false);
  }, []);

  return { files, isProcessing, overallProgress, addFiles, removeFile, processFiles, cancel, reset };
}
