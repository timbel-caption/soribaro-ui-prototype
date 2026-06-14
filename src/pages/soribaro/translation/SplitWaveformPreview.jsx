import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 파일 분할 모달용 경량 파형 프리뷰 컴포넌트
 * - Web Audio API로 오디오를 디코딩하여 저해상도 peaks 생성
 * - Canvas에 바 형태로 파형을 렌더링
 * - 기존 등록 구간 및 현재 선택 구간을 오버레이로 표시
 */
// 저해상도 디코딩용 샘플레이트 (8kHz = 기본 44.1kHz 대비 ~5.5배 빠른 디코딩)
const LOW_SAMPLE_RATE = 8000;

const SplitWaveformPreview = memo(function SplitWaveformPreview({
  audioUrl,
  duration = 0,
  startSec = 0,
  endSec = 0,
  existingSplits = [],
}) {
  const { t } = useTranslation('soribaro');
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [peaks, setPeaks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(''); // 'download' | 'decode' | ''
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  const audioContextRef = useRef(null);
  const abortControllerRef = useRef(null);

  // 오디오 로드 및 peaks 생성
  useEffect(() => {
    if (!audioUrl) {
      setPeaks(null);
      setError(null);
      return;
    }

    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const loadAudio = async () => {
      setLoading(true);
      setError(null);
      setPeaks(null);
      setLoadingPhase('download');
      setDownloadProgress(0);

      try {
        // 저해상도 AudioContext (8kHz) - 디코딩 출력 샘플 수를 ~5.5배 줄임
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: LOW_SAMPLE_RATE,
          });
        }

        // 스트리밍 다운로드 (진행률 표시)
        const response = await fetch(audioUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(t('translation.splitWaveformPreview.cannotFetchAudio'));

        const contentLength = Number(response.headers.get('content-length')) || 0;
        let arrayBuffer;

        if (contentLength > 0 && response.body) {
          // 스트리밍으로 진행률 추적
          const reader = response.body.getReader();
          const chunks = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            setDownloadProgress(Math.round((received / contentLength) * 100));
          }

          // 청크들을 하나의 ArrayBuffer로 합침
          const merged = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          arrayBuffer = merged.buffer;
        } else {
          // content-length 없으면 일반 다운로드
          arrayBuffer = await response.arrayBuffer();
        }

        if (abortController.signal.aborted) return;

        setLoadingPhase('decode');
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        if (abortController.signal.aborted) return;

        // 저해상도 peaks 생성
        const channelData = audioBuffer.getChannelData(0);
        const targetPeakCount = 200;
        const samplesPerPeak = Math.max(1, Math.floor(channelData.length / targetPeakCount));
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

        if (!abortController.signal.aborted) {
          setPeaks(generatedPeaks);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !abortController.signal.aborted) {
          console.warn('파형 로드 실패:', err);
          setError(t('translation.splitWaveformPreview.cannotLoadWaveform'));
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
          setLoadingPhase('');
        }
      }
    };

    loadAudio();

    return () => {
      abortController.abort();
    };
  }, [audioUrl]);

  // Canvas 렌더링
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !peaks || peaks.length === 0 || duration <= 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Canvas 크기 설정
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

    // 파형 바 그리기
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

    // 중앙 기준선
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // 기존 등록 구간 오버레이
    existingSplits.forEach((es) => {
      const x = (es.startSec / duration) * width;
      const w = ((es.endSec - es.startSec) / duration) * width;
      ctx.fillStyle = 'rgba(255, 152, 0, 0.3)';
      ctx.fillRect(x, 0, w, height);
      // 경계선
      ctx.strokeStyle = 'rgba(255, 152, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.moveTo(x + w, 0);
      ctx.lineTo(x + w, height);
      ctx.stroke();
    });

    // 현재 선택 구간 오버레이
    if (endSec > startSec) {
      const sx = (startSec / duration) * width;
      const sw = ((endSec - startSec) / duration) * width;
      ctx.fillStyle = 'rgba(0, 150, 255, 0.25)';
      ctx.fillRect(sx, 0, sw, height);
      // 경계선
      ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.moveTo(sx + sw, 0);
      ctx.lineTo(sx + sw, height);
      ctx.stroke();
    }
  }, [peaks, duration, startSec, endSec, existingSplits]);

  // peaks / 구간 변경 시 다시 그리기
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // 리사이즈 감지
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      drawWaveform();
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [drawWaveform]);

  // 컴포넌트 언마운트 시 AudioContext 정리
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className="split-waveform-preview" ref={containerRef}>
      <canvas ref={canvasRef} />
      {loading && (
        <div className="split-waveform-loading">
          <div className="split-waveform-spinner" />
          <span>
            {loadingPhase === 'download'
              ? t('translation.splitWaveformPreview.downloading', { progress: downloadProgress })
              : loadingPhase === 'decode'
              ? t('translation.splitWaveformPreview.decoding')
              : t('translation.splitWaveformPreview.loadingWaveform')}
          </span>
          {loadingPhase === 'download' && downloadProgress > 0 && (
            <div className="split-waveform-progress">
              <div
                className="split-waveform-progress-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}
      {error && !loading && (
        <div className="split-waveform-error">
          {error}
        </div>
      )}
      {!loading && !error && !peaks && !audioUrl && (
        <div className="split-waveform-placeholder">
          {t('translation.splitWaveformPreview.selectFileForWaveform')}
        </div>
      )}
    </div>
  );
});

export default SplitWaveformPreview;
