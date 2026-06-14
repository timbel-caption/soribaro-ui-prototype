import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  generateCacheKey,
  getCachedWaveform,
  generateSplitPeaksCacheKey,
  getCachedSplitPeaks,
  cacheSplitPeaks,
  validateWaveformArrayBuffer,
} from '../../../utils/waveformCache';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import { getWaveformDownloadUrl } from '../../../api/v9/file';
import './SplitPointEditor.css';

const LOW_SAMPLE_RATE = 8000;
const CLOVA_MAX_DURATION = 7200; // 2시간 (초)
const TARGET_PEAK_COUNT = 600;

/**
 * WaveformData 바이너리(.dat)에서 peaks를 파싱하고 targetCount로 다운샘플링
 * 포맷: Version 2 — [version:i32][flags:u32][sample_rate:i32][samples_per_pixel:i32][length:u32][channels:i32][data:i8[]]
 * @param {ArrayBuffer} buffer - .dat 파일의 ArrayBuffer
 * @param {number} targetCount - 목표 peak 수 (기본 600)
 * @returns {Array<{min: number, max: number}>|null}
 */
function parseDatPeaks(buffer, targetCount = TARGET_PEAK_COUNT) {
  try {
    if (!buffer || buffer.byteLength < 24) return null;
    const view = new DataView(buffer);
    const version = view.getInt32(0, true);
    const flags = view.getUint32(4, true);
    const is8Bit = flags !== 0;
    const length = view.getUint32(16, true);
    if (length === 0) return null;

    const headerSize = version === 2 ? 24 : 20;
    const bytesPerSample = is8Bit ? 1 : 2;
    const expectedDataSize = headerSize + length * 2 * bytesPerSample;
    if (buffer.byteLength < expectedDataSize) return null;

    // 직접 targetCount만큼 다운샘플링하며 읽기 (전체 rawPeaks 배열 생성 회피)
    if (length <= targetCount) {
      const peaks = [];
      for (let i = 0; i < length; i++) {
        const offset = headerSize + i * 2 * bytesPerSample;
        const min = is8Bit ? view.getInt8(offset) / 127 : view.getInt16(offset, true) / 32767;
        const max = is8Bit ? view.getInt8(offset + bytesPerSample) / 127 : view.getInt16(offset + 2, true) / 32767;
        peaks.push({ min, max });
      }
      return peaks;
    }

    const step = length / targetCount;
    const peaks = [];
    for (let i = 0; i < targetCount; i++) {
      const start = Math.floor(i * step);
      const end = Math.min(Math.floor((i + 1) * step), length);
      let minVal = 1, maxVal = -1;
      for (let j = start; j < end; j++) {
        const offset = headerSize + j * 2 * bytesPerSample;
        const min = is8Bit ? view.getInt8(offset) / 127 : view.getInt16(offset, true) / 32767;
        const max = is8Bit ? view.getInt8(offset + bytesPerSample) / 127 : view.getInt16(offset + 2, true) / 32767;
        if (min < minVal) minVal = min;
        if (max > maxVal) maxVal = max;
      }
      peaks.push({ min: minVal, max: maxVal });
    }
    return peaks;
  } catch (err) {
    console.warn('[SplitPointEditor] .dat 파싱 실패:', err);
    return null;
  }
}

/**
 * 초를 HH:MM:SS 형태로 변환
 */
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 파형 기반 인터랙티브 분할 지점 설정 컴포넌트
 * - Web Audio API로 저해상도 peaks 생성
 * - Canvas에 파형 + 분할 마커를 렌더링
 * - 마커 드래그로 분할 지점 이동, 클릭으로 추가, 더블클릭으로 삭제
 */
const SplitPointEditor = memo(function SplitPointEditor({
  audioUrl,
  duration = 0,
  splitPoints = [],
  onSplitPointsChange,
  model = 'clova',
  fileId = null,
}) {
  const { t } = useTranslation('worktool');
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [peaks, setPeaks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(-1);
  const [hoverX, setHoverX] = useState(-1);
  const audioContextRef = useRef(null);
  const abortControllerRef = useRef(null);
  const peaksRef = useRef(null);

  // WaveformViewer가 IndexedDB에 캐시한 .dat ArrayBuffer에서 peaks 추출
  const loadFromWaveformCache = useCallback(async () => {
    try {
      const store = useSubtitleStore.getState();
      const mainCacheKey = generateCacheKey(
        store.mediaFileName, store.mediaFileSize, store.isServerFile,
      );
      if (!mainCacheKey) return null;

      const cachedBuffer = await getCachedWaveform(mainCacheKey);
      if (!cachedBuffer || !validateWaveformArrayBuffer(cachedBuffer)) return null;

      return parseDatPeaks(cachedBuffer);
    } catch (err) {
      console.warn('[SplitPointEditor] WaveformViewer 캐시 읽기 실패:', err);
      return null;
    }
  }, []);

  // 서버 .dat 파형에서 peaks 로드
  const loadFromServerDat = useCallback(async (signal) => {
    if (!fileId) return null;
    try {
      const wfRes = await getWaveformDownloadUrl(fileId);
      if (signal.aborted) return null;
      if (wfRes?.status !== 'SUCCESS' || !wfRes.data?.url) return null;

      const response = await fetch(wfRes.data.url, { signal });
      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      if (signal.aborted) return null;
      if (!validateWaveformArrayBuffer(buffer)) return null;

      return parseDatPeaks(buffer);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[SplitPointEditor] 서버 .dat 로드 실패:', err);
      }
      return null;
    }
  }, [fileId]);

  // 원본 오디오에서 peaks 생성 (소형 파일 전용, 200MB 이하)
  const loadFromAudioDecode = useCallback(async (signal, onProgress) => {
    // Content-Length를 HEAD 요청으로 미리 확인하여 대용량 파일 차단
    try {
      const headRes = await fetch(audioUrl, { method: 'HEAD', signal });
      const size = Number(headRes.headers.get('content-length')) || 0;
      if (size > 200 * 1024 * 1024) {
        console.warn(`[SplitPointEditor] 파일 크기 ${(size / 1024 / 1024).toFixed(0)}MB — 오디오 디코딩 건너뜀`);
        return null;
      }
    } catch {
      // HEAD 실패 시 계속 진행
    }

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: LOW_SAMPLE_RATE,
      });
    }

    const response = await fetch(audioUrl, { signal });
    if (!response.ok) throw new Error('오디오 파일 로드 실패');

    const contentLength = Number(response.headers.get('content-length')) || 0;
    let arrayBuffer;

    if (contentLength > 0 && response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress?.(Math.round((received / contentLength) * 100));
      }
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      arrayBuffer = merged.buffer;
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    if (signal.aborted) return null;

    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    if (signal.aborted) return null;

    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.max(1, Math.floor(channelData.length / TARGET_PEAK_COUNT));
    const generatedPeaks = [];

    for (let i = 0; i < channelData.length; i += samplesPerPeak) {
      let min = 1;
      let max = -1;
      const end = Math.min(i + samplesPerPeak, channelData.length);
      for (let j = i; j < end; j++) {
        const val = channelData[j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      generatedPeaks.push({ min, max });
    }

    return generatedPeaks;
  }, [audioUrl]);

  // 오디오 로드 및 peaks 생성
  useEffect(() => {
    if (!audioUrl) {
      setPeaks(null);
      setError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    const cacheKey = generateSplitPeaksCacheKey(audioUrl);

    const loadAudio = async () => {
      setLoading(true);
      setError(null);
      setPeaks(null);
      setLoadingPhase('');

      try {
        // 1) SplitPointEditor 전용 IndexedDB 캐시
        const cached = await getCachedSplitPeaks(cacheKey);
        if (cached && !signal.aborted) {
          setPeaks(cached);
          peaksRef.current = cached;
          setLoading(false);
          return;
        }

        setLoadingPhase('download');

        // 2) WaveformViewer가 이미 캐시한 파형 데이터 재활용 (핵심!)
        const wvCachePeaks = await loadFromWaveformCache();
        if (signal.aborted) return;
        if (wvCachePeaks) {
          setPeaks(wvCachePeaks);
          peaksRef.current = wvCachePeaks;
          cacheSplitPeaks(cacheKey, wvCachePeaks);
          setLoading(false);
          return;
        }

        // 3) 서버 .dat 파형 API 호출
        if (fileId) {
          const datPeaks = await loadFromServerDat(signal);
          if (signal.aborted) return;
          if (datPeaks) {
            setPeaks(datPeaks);
            peaksRef.current = datPeaks;
            cacheSplitPeaks(cacheKey, datPeaks);
            setLoading(false);
            return;
          }
        }

        // 4) 최후 수단: 원본 오디오 디코딩 (200MB 이하만 — 대용량은 OOM 방지로 건너뜀)
        setDownloadProgress(0);
        const generatedPeaks = await loadFromAudioDecode(
          signal,
          (progress) => setDownloadProgress(progress),
        );
        if (signal.aborted) return;

        if (generatedPeaks) {
          setPeaks(generatedPeaks);
          peaksRef.current = generatedPeaks;
          cacheSplitPeaks(cacheKey, generatedPeaks);
        } else {
          setError(t('splitPointEditor.cannotLoadWaveform'));
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !signal.aborted) {
          console.warn('파형 로드 실패:', err);
          setError(t('splitPointEditor.cannotLoadWaveform'));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
          setLoadingPhase('');
        }
      }
    };

    loadAudio();
    return () => abortController.abort();
  }, [audioUrl, fileId, t, loadFromWaveformCache, loadFromServerDat, loadFromAudioDecode]);

  // 분할 구간 정보 계산
  const getSegments = useCallback(() => {
    const sorted = [...splitPoints].sort((a, b) => a - b);
    const boundaries = [0, ...sorted, duration];
    const segments = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      segments.push({
        startSec: boundaries[i],
        endSec: boundaries[i + 1],
        duration: boundaries[i + 1] - boundaries[i],
      });
    }
    return segments;
  }, [splitPoints, duration]);

  // Canvas 렌더링
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !peaks || peaks.length === 0 || duration <= 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerY = height / 2;
    const amplitudeScale = (height / 2) * 0.85;

    // 배경
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // 구간별 배경색
    const segments = getSegments();
    const segmentColors = [
      'rgba(100, 160, 220, 0.08)',
      'rgba(160, 120, 220, 0.08)',
      'rgba(120, 200, 160, 0.08)',
      'rgba(220, 160, 100, 0.08)',
      'rgba(200, 120, 160, 0.08)',
    ];
    segments.forEach((seg, i) => {
      const x = (seg.startSec / duration) * width;
      const w = ((seg.endSec - seg.startSec) / duration) * width;
      ctx.fillStyle = segmentColors[i % segmentColors.length];
      ctx.fillRect(x, 0, w, height);

      // 2시간 초과 구간 경고 배경
      if (model === 'clova' && seg.duration > CLOVA_MAX_DURATION) {
        ctx.fillStyle = 'rgba(255, 80, 80, 0.15)';
        ctx.fillRect(x, 0, w, height);
      }
    });

    // 파형 바
    const barWidth = Math.max(1, width / peaks.length);
    ctx.fillStyle = 'rgba(100, 160, 220, 0.7)';
    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i];
      const x = (i / peaks.length) * width;
      const minY = centerY - peak.min * amplitudeScale;
      const maxY = centerY - peak.max * amplitudeScale;
      const barHeight = Math.max(1, minY - maxY);
      ctx.fillRect(x, maxY, barWidth - 0.5, barHeight);
    }

    // 중앙선
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // 분할 마커
    const sorted = [...splitPoints].sort((a, b) => a - b);
    sorted.forEach((point, i) => {
      const x = (point / duration) * width;

      // 마커 라인
      ctx.strokeStyle = draggingIndex === i ? '#ff6b6b' : '#ff9f43';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // 마커 핸들 (상단 삼각형)
      ctx.fillStyle = draggingIndex === i ? '#ff6b6b' : '#ff9f43';
      ctx.beginPath();
      ctx.moveTo(x - 6, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x, 10);
      ctx.closePath();
      ctx.fill();

      // 시간 라벨
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatTime(point), x, 24);
    });

    // 호버 위치 가이드라인
    if (hoverX >= 0 && draggingIndex === -1) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [peaks, duration, splitPoints, draggingIndex, hoverX, getSegments, model]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => drawWaveform());
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [drawWaveform]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // X좌표 → 시간(초) 변환
  const xToTime = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(duration, (x / rect.width) * duration));
  }, [duration]);

  // 마커 근처인지 판별 (10px 범위)
  const findNearbyMarker = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const sorted = [...splitPoints].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const markerX = (sorted[i] / duration) * rect.width;
      if (Math.abs(x - markerX) < 10) return i;
    }
    return -1;
  }, [splitPoints, duration]);

  // 마우스 이벤트
  const handleMouseDown = useCallback((e) => {
    const nearbyIdx = findNearbyMarker(e.clientX);
    if (nearbyIdx >= 0) {
      setDraggingIndex(nearbyIdx);
      e.preventDefault();
    }
  }, [findNearbyMarker]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setHoverX(e.clientX - rect.left);

    if (draggingIndex >= 0) {
      const time = xToTime(e.clientX);
      const sorted = [...splitPoints].sort((a, b) => a - b);
      sorted[draggingIndex] = Math.round(time);
      onSplitPointsChange?.(sorted);
    }
  }, [draggingIndex, xToTime, splitPoints, onSplitPointsChange]);

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(-1);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverX(-1);
    setDraggingIndex(-1);
  }, []);

  // 클릭으로 분할점 추가
  const handleClick = useCallback((e) => {
    if (draggingIndex >= 0) return;
    const nearbyIdx = findNearbyMarker(e.clientX);
    if (nearbyIdx >= 0) return;

    const time = Math.round(xToTime(e.clientX));
    if (time <= 0 || time >= duration) return;

    const newPoints = [...splitPoints, time].sort((a, b) => a - b);
    onSplitPointsChange?.(newPoints);
  }, [draggingIndex, findNearbyMarker, xToTime, duration, splitPoints, onSplitPointsChange]);

  // 더블클릭으로 분할점 삭제
  const handleDoubleClick = useCallback((e) => {
    const nearbyIdx = findNearbyMarker(e.clientX);
    if (nearbyIdx >= 0) {
      const sorted = [...splitPoints].sort((a, b) => a - b);
      sorted.splice(nearbyIdx, 1);
      onSplitPointsChange?.(sorted);
    }
  }, [findNearbyMarker, splitPoints, onSplitPointsChange]);

  // 자동 분할: 최소 2등분, 2시간 초과 시 7200초 기준으로 더 나눔
  const handleAutoSplit = useCallback(() => {
    if (duration <= 0) return;
    const maxDuration = model === 'clova' ? CLOVA_MAX_DURATION : CLOVA_MAX_DURATION;
    const numSegments = Math.max(2, Math.ceil(duration / maxDuration));
    const segDuration = duration / numSegments;
    const points = [];
    for (let i = 1; i < numSegments; i++) {
      points.push(Math.round(segDuration * i));
    }
    onSplitPointsChange?.(points);
  }, [duration, model, onSplitPointsChange]);

  const segments = getSegments();
  const hasOverlong = model === 'clova' && segments.some((s) => s.duration > CLOVA_MAX_DURATION);

  return (
    <div className="split-point-editor">
      <div className="split-point-editor__header">
        <span className="split-point-editor__title">
          {t('splitPointEditor.title')}
        </span>
        <div className="split-point-editor__actions">
          <button
            className="split-point-editor__btn"
            onClick={handleAutoSplit}
            disabled={!peaks || duration <= 0}
          >
            {t('splitPointEditor.autoSplit')}
          </button>
          <button
            className="split-point-editor__btn split-point-editor__btn--secondary"
            onClick={() => onSplitPointsChange?.([])}
            disabled={splitPoints.length === 0}
          >
            {t('splitPointEditor.clearAll')}
          </button>
        </div>
      </div>

      <div
        className="split-point-editor__canvas-container"
        ref={containerRef}
        style={{ cursor: draggingIndex >= 0 ? 'grabbing' : (findNearbyMarker.length > 0 ? 'grab' : 'crosshair') }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
        {loading && (
          <div className="split-point-editor__loading">
            <div className="split-point-editor__spinner" />
            <span>
              {loadingPhase === 'download'
                ? t('splitPointEditor.downloading', { progress: downloadProgress })
                : loadingPhase === 'decode'
                ? t('splitPointEditor.decoding')
                : t('splitPointEditor.loadingWaveform')}
            </span>
            {loadingPhase === 'download' && downloadProgress > 0 && (
              <div className="split-point-editor__progress">
                <div
                  className="split-point-editor__progress-fill"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}
        {error && !loading && (
          <div className="split-point-editor__error">{error}</div>
        )}
        {!loading && !error && !peaks && !audioUrl && (
          <div className="split-point-editor__placeholder">
            {t('splitPointEditor.selectFileForWaveform')}
          </div>
        )}
      </div>

      <div className="split-point-editor__hint">
        {t('splitPointEditor.hint')}
      </div>

      {/* 구간 정보 */}
      {segments.length > 0 && peaks && (
        <div className="split-point-editor__segments">
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`split-point-editor__segment ${
                model === 'clova' && seg.duration > CLOVA_MAX_DURATION
                  ? 'split-point-editor__segment--overlong'
                  : ''
              }`}
            >
              <span className="split-point-editor__segment-label">
                {t('splitPointEditor.segmentLabel', { index: i + 1 })}
              </span>
              <span className="split-point-editor__segment-time">
                {formatTime(seg.startSec)} ~ {formatTime(seg.endSec)}
              </span>
              <span className="split-point-editor__segment-duration">
                ({formatTime(seg.duration)})
              </span>
            </div>
          ))}
        </div>
      )}

      {hasOverlong && (
        <div className="split-point-editor__warning">
          {t('splitPointEditor.overlongWarning')}
        </div>
      )}
    </div>
  );
});

export default SplitPointEditor;
