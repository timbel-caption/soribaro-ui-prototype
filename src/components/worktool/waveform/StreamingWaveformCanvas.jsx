import { useRef, useEffect, useState, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../../stores/playbackStore';
import './StreamingWaveformCanvas.css';

/**
 * Canvas 기반 점진적 파형 렌더러 (성능 최적화 버전)
 * - useImperativeHandle로 외부에서 peaks 업데이트 가능
 * - 증분 렌더링: 새로 추가된 peaks만 그림
 * - requestAnimationFrame 기반 렌더 스케줄링
 */
const StreamingWaveformCanvas = memo(forwardRef(function StreamingWaveformCanvas({
  progress = 0,
  duration = 0,
  colors = {},
  expectedPeaksCount = 0,
  renderMode = 'bar',
  lineWidth = 1.5,
  amplitudeScale: amplitudeScaleProp = 1.0,
  onClick,
  onTimeChange,
}, ref) {
  const { t } = useTranslation('worktool');
  const currentTime = usePlaybackStore((state) => state.currentTime);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // 증분 렌더링용 refs
  const peaksRef = useRef([]);
  const lastDrawnIndexRef = useRef(0);
  const rafIdRef = useRef(null);
  const progressRef = useRef(0);
  const drawIncrementalRef = useRef(null);

  // 줌/스크롤 상태
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);

  // 드래그 스크롤 상태
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, scrollOffset: 0 });

  // 로딩 라인 애니메이션 상태
  const pulsePhaseRef = useRef(0);
  const pulseAnimationRef = useRef(null);

  // 기본 색상 설정
  const defaultColors = {
    waveformColor: colors.waveformColor || '#00d9ff',
    playedWaveformColor: colors.playedWaveformColor || '#00ff88',
    backgroundColor: colors.backgroundColor || '#1a1a2e',
    unloadedColor: 'rgba(0, 0, 0, 0.5)',
    loadingLineColor: '#00d9ff',
    playheadColor: '#ffffff',
    ...colors,
  };

  // 외부에서 호출 가능한 메서드 노출
  useImperativeHandle(ref, () => ({
    updatePeaks: (newPeaks) => {
      peaksRef.current = newPeaks;
      scheduleIncrementalRender();
    },
    setProgress: (newProgress) => {
      progressRef.current = newProgress;
    },
    reset: () => {
      peaksRef.current = [];
      lastDrawnIndexRef.current = 0;
      progressRef.current = 0;
      // 캔버스 초기화
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          ctx.fillStyle = defaultColors.backgroundColor;
          ctx.fillRect(0, 0, rect.width, rect.height);
        }
      }
    },
  }), [defaultColors.backgroundColor]);

  // 증분 렌더링 스케줄링 (ref를 통해 최신 drawIncremental 호출)
  const scheduleIncrementalRender = useCallback(() => {
    if (rafIdRef.current) return; // 이미 예약됨

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (drawIncrementalRef.current) {
        drawIncrementalRef.current();
      }
    });
  }, []);

  // 증분 렌더링 - 새로 추가된 peaks만 그림
  const drawIncremental = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Canvas 크기 확인 및 설정 (초기화 시에만)
    const expectedWidth = rect.width * dpr;
    const expectedHeight = rect.height * dpr;

    if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
      canvas.width = expectedWidth;
      canvas.height = expectedHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);

      // 캔버스 크기 변경 시 전체 다시 그리기
      lastDrawnIndexRef.current = 0;
      ctx.fillStyle = defaultColors.backgroundColor;
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    const width = rect.width;
    const height = rect.height;
    const centerY = height / 2;
    const amplitudeScale = (height / 2) * 0.85 * amplitudeScaleProp;

    const peaks = peaksRef.current;
    const startIndex = lastDrawnIndexRef.current;
    const totalPeaks = expectedPeaksCount || peaks.length || 1;

    if (startIndex >= peaks.length) return;

    // 줌/스크롤 적용 (줌 레벨이 1일 때만 증분 렌더링)
    if (zoomLevel === 1) {
      // 라인 모드: 전체를 다시 그려야 함 (증분 렌더링 불가)
      if (renderMode === 'line') {
        // 배경 다시 그리기
        ctx.fillStyle = defaultColors.backgroundColor;
        ctx.fillRect(0, 0, width, height);
        
        // 라인 모드 렌더링
        if (peaks.length > 1) {
          ctx.strokeStyle = defaultColors.waveformColor;
          ctx.lineWidth = lineWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          
          // 상단 라인 (max 값)
          ctx.beginPath();
          for (let i = 0; i < peaks.length; i++) {
            const peak = peaks[i];
            const x = (i / totalPeaks) * width;
            const y = centerY - peak.max * amplitudeScale;
            
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          
          // 하단 라인 (min 값) - 더 연한 색상
          ctx.strokeStyle = defaultColors.waveformColor;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          for (let i = 0; i < peaks.length; i++) {
            const peak = peaks[i];
            const x = (i / totalPeaks) * width;
            const y = centerY - peak.min * amplitudeScale;
            
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        
        lastDrawnIndexRef.current = peaks.length;
      } else {
        // 바 모드: 새로 추가된 peaks만 그리기 (기존 방식)
        ctx.fillStyle = defaultColors.waveformColor;

        for (let i = startIndex; i < peaks.length; i++) {
          const peak = peaks[i];
          const x = (i / totalPeaks) * width;
          const barWidth = Math.max(1, width / totalPeaks);

          const minY = centerY - peak.min * amplitudeScale;
          const maxY = centerY - peak.max * amplitudeScale;
          const barHeight = Math.max(2, minY - maxY);

          ctx.fillRect(x, maxY, barWidth - 0.5, barHeight);
        }

        lastDrawnIndexRef.current = peaks.length;
      }

      // 로딩 라인 및 미로드 영역 업데이트
      const loadedRatio = peaks.length / totalPeaks;
      const lineX = loadedRatio * width;

      // 미로드 영역 어둡게
      ctx.fillStyle = defaultColors.unloadedColor;
      ctx.fillRect(lineX, 0, width - lineX, height);

      // 로딩 라인 (진행 중일 때만)
      if (progressRef.current < 100 && loadedRatio < 1) {
        const pulseIntensity = 0.5 + 0.5 * Math.sin(pulsePhaseRef.current);

        // 그라데이션 효과
        const gradient = ctx.createLinearGradient(lineX - 20, 0, lineX + 20, 0);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.5, `rgba(0, 217, 255, ${pulseIntensity})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(lineX - 20, 0, 40, height);

        // 메인 라인
        ctx.strokeStyle = defaultColors.loadingLineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, height);
        ctx.stroke();
      }

      // 중앙 라인 (기준선)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
    } else {
      // 줌이 적용된 경우 전체 다시 그리기
      drawWaveformFull();
    }
  }, [defaultColors, expectedPeaksCount, zoomLevel, renderMode, lineWidth, amplitudeScaleProp]);

  // drawIncremental ref 업데이트 (scheduleIncrementalRender에서 최신 버전 호출을 위해)
  drawIncrementalRef.current = drawIncremental;

  // 전체 파형 그리기 (줌/스크롤 시)
  const drawWaveformFull = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

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
    const amplitudeScale = (height / 2) * 0.85 * amplitudeScaleProp;

    // 배경 그리기
    ctx.fillStyle = defaultColors.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const peaks = peaksRef.current;

    if (peaks.length === 0) {
      // 파형 데이터가 없으면 로딩 표시
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('waveform.loadingWaveform'), width / 2, centerY);
      return;
    }

    // 줌/스크롤에 따른 표시 범위 계산
    const totalDuration = duration || 1;
    const visibleDuration = totalDuration / zoomLevel;
    const startTime = scrollOffset;
    const endTime = Math.min(scrollOffset + visibleDuration, totalDuration);

    // 전체 파형에서 보이는 범위의 peaks 인덱스 계산
    const totalPeaks = expectedPeaksCount || peaks.length;
    const startPeakIndex = Math.floor((startTime / totalDuration) * totalPeaks);
    const endPeakIndex = Math.ceil((endTime / totalDuration) * totalPeaks);

    // 로드된 peaks 비율
    const loadedRatio = peaks.length / totalPeaks;
    const loadedEndTime = loadedRatio * totalDuration;

    // 파형 그리기
    const visiblePeaks = peaks.slice(
      Math.max(0, startPeakIndex),
      Math.min(peaks.length, endPeakIndex)
    );

    if (visiblePeaks.length > 0) {
      if (renderMode === 'line') {
        // 라인 모드 렌더링
        // 재생된 부분과 미재생 부분을 나눠서 그리기
        const playedIndex = visiblePeaks.findIndex((_, i) => {
          const absoluteIndex = Math.max(0, startPeakIndex) + i;
          const peakTime = (absoluteIndex / totalPeaks) * totalDuration;
          return peakTime > currentTime;
        });
        
        const drawLine = (peaks, startIdx, color, alpha = 1, isMin = false) => {
          if (peaks.length < 2) return;
          
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.globalAlpha = alpha;
          
          ctx.beginPath();
          peaks.forEach((peak, i) => {
            const absoluteIndex = Math.max(0, startPeakIndex) + startIdx + i;
            const peakTime = (absoluteIndex / totalPeaks) * totalDuration;
            const x = ((peakTime - startTime) / visibleDuration) * width;
            const y = centerY - (isMin ? peak.min : peak.max) * amplitudeScale;
            
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
          ctx.globalAlpha = 1;
        };
        
        // 재생된 부분 (max 라인)
        if (playedIndex > 0) {
          const playedPeaks = visiblePeaks.slice(0, playedIndex);
          drawLine(playedPeaks, 0, defaultColors.playedWaveformColor, 1, false);
          drawLine(playedPeaks, 0, defaultColors.playedWaveformColor, 0.4, true);
        }
        
        // 미재생 부분 (max 라인)
        const unplayedStart = playedIndex === -1 ? 0 : playedIndex;
        if (unplayedStart < visiblePeaks.length) {
          const unplayedPeaks = visiblePeaks.slice(unplayedStart);
          drawLine(unplayedPeaks, unplayedStart, defaultColors.waveformColor, 1, false);
          drawLine(unplayedPeaks, unplayedStart, defaultColors.waveformColor, 0.4, true);
        }
      } else {
        // 바 모드 렌더링 (기존 방식)
        const barWidth = Math.max(1, width / visiblePeaks.length);

        visiblePeaks.forEach((peak, i) => {
          const absoluteIndex = Math.max(0, startPeakIndex) + i;
          const peakTime = (absoluteIndex / totalPeaks) * totalDuration;
          const x = ((peakTime - startTime) / visibleDuration) * width;

          // 재생된 부분과 아닌 부분 색상 구분
          const isPlayed = peakTime <= currentTime;
          ctx.fillStyle = isPlayed ? defaultColors.playedWaveformColor : defaultColors.waveformColor;

          // min/max 값을 기반으로 bar 그리기
          const minY = centerY - peak.min * amplitudeScale;
          const maxY = centerY - peak.max * amplitudeScale;
          const barHeight = Math.max(2, minY - maxY);

          ctx.fillRect(x, maxY, barWidth - 0.5, barHeight);
        });
      }
    }

    // 미로드 영역 어둡게 표시
    if (loadedEndTime < endTime) {
      const unloadedStartX = Math.max(0, ((loadedEndTime - startTime) / visibleDuration) * width);
      ctx.fillStyle = defaultColors.unloadedColor;
      ctx.fillRect(unloadedStartX, 0, width - unloadedStartX, height);

      // 로딩 라인 (펄스 애니메이션)
      if (progress < 100 && loadedEndTime > startTime && loadedEndTime < endTime) {
        const lineX = unloadedStartX;
        const pulseIntensity = 0.5 + 0.5 * Math.sin(pulsePhaseRef.current);

        // 그라데이션 효과
        const gradient = ctx.createLinearGradient(lineX - 20, 0, lineX + 20, 0);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.5, `rgba(0, 217, 255, ${pulseIntensity})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(lineX - 20, 0, 40, height);

        // 메인 라인
        ctx.strokeStyle = defaultColors.loadingLineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, height);
        ctx.stroke();
      }
    }

    // 재생 위치 마커 (Playhead)
    if (currentTime >= startTime && currentTime <= endTime) {
      const playheadX = ((currentTime - startTime) / visibleDuration) * width;

      // 마커 라인
      ctx.strokeStyle = defaultColors.playheadColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // 상단 삼각형 마커
      ctx.fillStyle = defaultColors.playheadColor;
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX, 10);
      ctx.closePath();
      ctx.fill();
    }

    // 중앙 라인 (기준선)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

  }, [currentTime, duration, zoomLevel, scrollOffset, defaultColors, expectedPeaksCount, progress, renderMode, lineWidth, amplitudeScaleProp]);

  // 펄스 애니메이션 루프
  useEffect(() => {
    if (progress >= 100) {
      if (pulseAnimationRef.current) {
        cancelAnimationFrame(pulseAnimationRef.current);
        pulseAnimationRef.current = null;
      }
      return;
    }

    let lastTime = 0;

    const animate = (time) => {
      if (time - lastTime > 50) { // 약 20fps로 제한
        pulsePhaseRef.current += 0.15;
        lastTime = time;

        // 증분 렌더링 중에는 로딩 라인만 업데이트
        if (zoomLevel === 1) {
          scheduleIncrementalRender();
        } else {
          drawWaveformFull();
        }
      }
      pulseAnimationRef.current = requestAnimationFrame(animate);
    };

    pulseAnimationRef.current = requestAnimationFrame(animate);
    return () => {
      if (pulseAnimationRef.current) {
        cancelAnimationFrame(pulseAnimationRef.current);
      }
    };
  }, [progress, zoomLevel, scheduleIncrementalRender, drawWaveformFull]);

  // progress prop 동기화
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // 줌/스크롤 변경 시 전체 다시 그리기
  useEffect(() => {
    if (zoomLevel !== 1 || scrollOffset !== 0) {
      drawWaveformFull();
    }
  }, [zoomLevel, scrollOffset, drawWaveformFull]);

  // currentTime 변경 시 playhead 업데이트 (줌 모드에서만)
  useEffect(() => {
    if (zoomLevel !== 1) {
      drawWaveformFull();
    }
  }, [currentTime, zoomLevel, drawWaveformFull]);

  // 리사이즈 처리
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      lastDrawnIndexRef.current = 0; // 전체 다시 그리기
      if (zoomLevel === 1) {
        scheduleIncrementalRender();
      } else {
        drawWaveformFull();
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [zoomLevel, scheduleIncrementalRender, drawWaveformFull]);

  // 클릭 이벤트 처리 (시간 이동)
  const handleClick = useCallback((e) => {
    const container = containerRef.current;
    if (!container || isDragging) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickRatio = x / rect.width;

    const visibleDuration = duration / zoomLevel;
    const clickTime = scrollOffset + clickRatio * visibleDuration;
    const clampedTime = Math.max(0, Math.min(duration, clickTime));

    if (onClick) onClick(clampedTime);
    if (onTimeChange) onTimeChange(clampedTime);
  }, [duration, zoomLevel, scrollOffset, onClick, onTimeChange, isDragging]);

  // 마우스 휠 스크롤 (앞뒤 이동)
  const handleWheel = useCallback((e) => {
    e.preventDefault();

    const visibleDuration = duration / zoomLevel;
    const scrollStep = visibleDuration * 0.1;
    const delta = e.deltaY > 0 ? scrollStep : -scrollStep;
    const newOffset = Math.max(0, Math.min(duration - visibleDuration, scrollOffset + delta));

    setScrollOffset(newOffset);
  }, [duration, zoomLevel, scrollOffset]);

  // 드래그 스크롤 시작
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return; // 좌클릭만

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      scrollOffset: scrollOffset,
    };
  }, [scrollOffset]);

  // 드래그 스크롤 중
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const deltaX = dragStartRef.current.x - e.clientX;
    const deltaRatio = deltaX / rect.width;

    const visibleDuration = duration / zoomLevel;
    const deltaTime = deltaRatio * visibleDuration;

    const newScrollOffset = dragStartRef.current.scrollOffset + deltaTime;
    const maxScrollOffset = Math.max(0, duration - visibleDuration);
    const clampedScrollOffset = Math.max(0, Math.min(maxScrollOffset, newScrollOffset));

    setScrollOffset(clampedScrollOffset);
  }, [isDragging, duration, zoomLevel]);

  // 드래그 스크롤 종료
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 마우스 이벤트 리스너
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 줌 레벨이 1일 때 스크롤 초기화
  useEffect(() => {
    if (zoomLevel <= 1) {
      setScrollOffset(0);
    }
  }, [zoomLevel]);

  // wheel 이벤트 리스너 (non-passive로 등록하여 preventDefault 허용)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // 컴포넌트 언마운트 시 RAF 정리
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (pulseAnimationRef.current) {
        cancelAnimationFrame(pulseAnimationRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`streaming-waveform-canvas ${isDragging ? 'dragging' : ''}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      <canvas ref={canvasRef} />

      {/* 진행률 표시 */}
      <div className="streaming-progress-bar">
        <div
          className="streaming-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 진행률 텍스트 */}
      {progress < 100 && (
        <div className="streaming-progress-text">
          {Math.round(progress)}%
        </div>
      )}

      {/* 줌 레벨 표시 */}
      {zoomLevel > 1 && (
        <div className="streaming-zoom-indicator">
          x{zoomLevel.toFixed(1)}
        </div>
      )}
    </div>
  );
}));

export default StreamingWaveformCanvas;
