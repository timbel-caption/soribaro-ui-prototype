import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import Peaks from 'peaks.js';
import Konva from 'konva';
import { useSubtitleStore, getMinGap } from '../../../stores/subtitleStore';
import { useSpeakerStore } from '../../../stores/speakerStore';
import { usePlaybackStore } from '../../../stores/playbackStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useThemeStore } from '../../../stores/themeStore';
import { useWaveformColorStore } from '../../../stores/waveformColorStore';
import { confirm } from '../../../stores/modalStore';
import { toast } from '../../../stores/toastStore';
import {
  generateCacheKey,
  getCachedWaveform,
  cacheWaveform,
  getCacheInfo,
  clearAllWaveformCache,
  deleteCachedWaveform,
  validateWaveformArrayBuffer,
  formatBytes,
} from '../../../utils/waveformCache';
import { generateStreamingWaveform, generateStreamingWaveformForMP3, generateStreamingWaveformForWAV, isWebCodecsSupported, isMP3File, isWAVFile, convertToWaveformData, waveformToArrayBuffer } from '../../../utils/streamingWaveform';
import { uploadWaveformToServer } from '../../../utils/waveformUpload';
import { getWaveformDownloadUrl, getFileDownloadUrl } from '../../../api/v9/file';
import { ffmpegService } from '../../../services/audio/ffmpegService';
import { throttle } from '../../../utils/performanceUtils';
import StreamingWaveformCanvas from './StreamingWaveformCanvas';
import './WaveformViewer.css';

// 라인 모드 파형 오버레이 컴포넌트 (두 레이어 캔버스 방식)
// 파형은 visibleRange/colors 변경 시에만 오프스크린 캔버스 2장에 한 번 그리고,
// currentTime 변경 시에는 drawImage 클리핑만 수행 (React 리렌더 없이 imperative 업데이트)
const LineWaveformOverlay = memo(function LineWaveformOverlay({ 
  peaksInstance, 
  visibleRange, 
  colors, 
  lineWidth = 1.5,
  duration,
  amplitudeScale: amplitudeScaleProp = 1.0,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rafIdRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !peaksInstance) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    let waveformData;
    try {
      waveformData = peaksInstance.getWaveformData();
    } catch (e) {
      return;
    }
    if (!waveformData) return;

    const { start, end } = visibleRange;
    const visibleDuration = end - start;
    if (visibleDuration <= 0) return;

    const totalSamples = waveformData.length;
    const startSample = Math.floor((start / duration) * totalSamples);
    const endSample = Math.ceil((end / duration) * totalSamples);
    const sampleCount = endSample - startSample;
    if (sampleCount <= 0) return;

    const centerY = height / 2;
    const amplitudeScale = (height / 2) * 0.85 * amplitudeScaleProp;

    // 파형 경로를 오프스크린 캔버스에 그리는 함수
    const renderWaveformLayer = (color) => {
      const oc = document.createElement('canvas');
      oc.width = width * dpr;
      oc.height = height * dpr;
      const c = oc.getContext('2d');
      c.scale(dpr, dpr);

      const drawPath = (isMin, alpha) => {
        c.strokeStyle = color;
        c.lineWidth = lineWidth;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.globalAlpha = alpha;
        c.beginPath();
        for (let i = 0; i < sampleCount; i++) {
          const si = startSample + i;
          if (si < 0 || si >= totalSamples) continue;
          const x = (i / sampleCount) * width;
          let v;
          try {
            if (isMin) {
              v = waveformData.min_sample ? waveformData.min_sample(0, si) :
                  (waveformData.channel(0).min_sample(si) / 128);
            } else {
              v = waveformData.max_sample ? waveformData.max_sample(0, si) :
                  (waveformData.channel(0).max_sample(si) / 128);
            }
          } catch (_) { continue; }
          const y = centerY - v * amplitudeScale;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      };

      drawPath(false, 1);
      drawPath(true, 0.4);

      c.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      c.lineWidth = 1;
      c.globalAlpha = 1;
      c.beginPath();
      c.moveTo(0, centerY);
      c.lineTo(width, centerY);
      c.stroke();

      return oc;
    };

    const playedLayer = renderWaveformLayer(colors.playedWaveformColor || '#ff6b6b');
    const unplayedLayer = renderWaveformLayer(colors.waveformColor || '#00d9ff');

    // 재생/미재생 영역 합성 (drawImage + clipping만 사용 → 매우 저렴)
    const composite = (time) => {
      const ctx = canvas.getContext('2d');
      const playedRatio = Math.max(0, Math.min(1, (time - start) / visibleDuration));
      const splitX = playedRatio * width * dpr;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, canvas.height);
      ctx.clip();
      ctx.drawImage(playedLayer, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, canvas.width - splitX, canvas.height);
      ctx.clip();
      ctx.drawImage(unplayedLayer, 0, 0);
      ctx.restore();
    };

    composite(usePlaybackStore.getState().currentTime);

    // currentTime 변경을 imperative하게 구독 (React 리렌더 없음)
    let prevTime = usePlaybackStore.getState().currentTime;
    const unsubscribe = usePlaybackStore.subscribe((state) => {
      if (state.currentTime !== prevTime) {
        prevTime = state.currentTime;
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            composite(prevTime);
          });
        }
      }
    });

    return () => {
      unsubscribe();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [peaksInstance, visibleRange, colors, lineWidth, duration]);

  return (
    <div 
      ref={containerRef} 
      className="line-waveform-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

// 자막 오버레이 컴포넌트 (메모이제이션)
const SubtitleOverlayLabel = memo(function SubtitleOverlayLabel({ subtitle, visibleRange }) {
  const { t } = useTranslation('worktool');
  // speaker 스토어에 실제로 등록된 화자만 사용 (자막 카드 dropdown 의 게이팅과 동일).
  const speaker = useSpeakerStore((state) =>
    subtitle.speakerId != null && subtitle.speakerId !== 0
      ? state.speakers[subtitle.speakerId] ?? null
      : null,
  );
  const visibleDuration = visibleRange.end - visibleRange.start;
  if (visibleDuration <= 0) return null;

  if (!subtitle.text) return null;

  // 현재 보이는 범위 밖이면 렌더링 안함
  if (subtitle.endTime < visibleRange.start || subtitle.startTime > visibleRange.end) {
    return null;
  }
  
  // 실제 보이는 시작/끝 시간 계산 (화면 경계로 클램핑)
  const visibleStart = Math.max(subtitle.startTime, visibleRange.start);
  const visibleEnd = Math.min(subtitle.endTime, visibleRange.end);
  
  // 보이는 범위 기준으로 left와 width 계산
  const leftPercent = ((visibleStart - visibleRange.start) / visibleDuration) * 100;
  const widthPercent = ((visibleEnd - visibleStart) / visibleDuration) * 100;

  // 화자 색상으로 border 동기화.
  // 자막 카드에서 사용자가 실제로 등록·지정한 화자만 색을 입힌다 — STT 가 speakerId 만
  // 채워둔 미등록 화자(speaker 스토어에 없음)는 기본 border 를 유지한다.
  const speakerColor = speaker ? speaker.color : null;

  return (
    <div
      className="segment-label"
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        ...(speakerColor ? { borderColor: speakerColor } : null),
      }}
      title={subtitle.text}
    >
      <span className="segment-label-text">
        {subtitle.text || ''}
      </span>
    </div>
  );
});

// 시간 격자 오버레이 컴포넌트
const TimeGridOverlay = memo(function TimeGridOverlay({ visibleRange }) {
  const visibleDuration = visibleRange.end - visibleRange.start;
  if (visibleDuration <= 0) return null;

  let minorInterval, majorInterval;
  if (visibleDuration <= 10) {
    minorInterval = 0.1;
    majorInterval = 1;
  } else if (visibleDuration <= 30) {
    minorInterval = 0.5;
    majorInterval = 5;
  } else if (visibleDuration <= 120) {
    minorInterval = 1;
    majorInterval = 10;
  } else {
    minorInterval = 5;
    majorInterval = 30;
  }

  const lines = [];
  const startSnap = Math.ceil(visibleRange.start / minorInterval) * minorInterval;

  for (let t = startSnap; t <= visibleRange.end; t += minorInterval) {
    const rounded = Math.round(t * 1000) / 1000;
    const left = ((rounded - visibleRange.start) / visibleDuration) * 100;
    if (left < 0 || left > 100) continue;

    const remainder = rounded % majorInterval;
    const isMajor = remainder < minorInterval * 0.1 ||
      (majorInterval - remainder) < minorInterval * 0.1;

    lines.push(
      <div
        key={rounded.toFixed(3)}
        className={`time-grid-line ${isMajor ? 'major' : 'minor'}`}
        style={{ left: `${left}%` }}
      />
    );
  }

  return <div className="time-grid-overlay">{lines}</div>;
});

// 커스텀 세그먼트 마커 - 세련된 핸들 디자인
function createCustomSegmentMarker(options, customColors = null) {
  const { layer, startMarker } = options;

  const markerColor = startMarker
    ? (customColors?.segmentStartMarker || '#4ade80')
    : (customColors?.segmentEndMarker || '#f87171');

  return {
    init: function(group) {
      // 얇은 수직 라인 (시각적 경계 표시)
      this._line = new Konva.Line({
        points: [0.5, 0, 0.5, 0],
        stroke: markerColor,
        strokeWidth: 2,
        opacity: 0.8,
      });
      group.add(this._line);
    },

    fitToView: function() {
      const height = layer.getHeight();
      this._line.points([0.5, 0, 0.5, height]);
    },

    update: function() {},
  };
}

function isMP4Container(fileName, mimeType) {
  if (mimeType) {
    const mp4MimeTypes = ['video/mp4', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'video/quicktime'];
    if (mp4MimeTypes.some((t) => mimeType.toLowerCase().startsWith(t))) return true;
  }
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mp4Extensions = ['mp4', 'm4a', 'm4v', 'mov', 'f4v', '3gp', '3g2'];
    if (mp4Extensions.includes(ext)) return true;
  }
  return false;
}

function WaveformViewer({ mediaRef }) {
  const mediaUrl = useSubtitleStore((state) => state.mediaUrl);
  const mediaType = useSubtitleStore((state) => state.mediaType);
  const mediaFileName = useSubtitleStore((state) => state.mediaFileName);
  const mediaFileSize = useSubtitleStore((state) => state.mediaFileSize);
  const isServerFile = useSubtitleStore((state) => state.isServerFile);
  const fileId = useSubtitleStore((state) => state.fileId);
  const subtitles = useSubtitleStore((state) => state.subtitles);
  const duration = useSubtitleStore((state) => state.duration);
  const sceneChanges = useSubtitleStore((state) => state.sceneChanges);
  const selectedTimeRange = useSubtitleStore((state) => state.selectedTimeRange);
  const selectedSubtitleId = useSubtitleStore((state) => state.selectedSubtitleId);
  const setWaveformData = useSubtitleStore((state) => state.setWaveformData);
  const setSelectedTimeRange = useSubtitleStore((state) => state.setSelectedTimeRange);
  const updateWorktoolUi = useSettingsStore((state) => state.updateWorktoolUi);
  
  // 테마 상태 구독 (테마 변경 시 세그먼트 색상 업데이트용)
  const theme = useThemeStore((state) => state.theme);
  
  // 파형 색상 및 설정 store 구독
  const waveformColors = useWaveformColorStore((state) => state.colors);
  const waveformSettings = useWaveformColorStore((state) => state.settings);
  const setSetting = useWaveformColorStore((state) => state.setSetting);

  const { t } = useTranslation('worktool');

  const zoomviewRef = useRef(null);
  const waveformContainerRef = useRef(null);
  const peaksRef = useRef(null);
  // 재생 중 view-center 스크롤용 rAF id. peaks.destroy() 시 'player.pause'
  // 리스너가 사라져 loop 가 멈추지 않으므로, effect cleanup 에서 직접 cancel 한다.
  const centerScrollRafIdRef = useRef(null);
  // 재생 중 사용자가 wave 영역을 스크롤(휠/드래그)하면 일시정지 →
  // 200ms 입력 끊기면 view 중앙으로 seek 후 재개 (Policy A: pause-during-scrub)
  const isScrubbingRef = useRef(false);
  const scrubCommitTimerRef = useRef(null);
  const wasPlayingBeforeScrubRef = useRef(false);
  const audioContextRef = useRef(null);
  const isInitializedRef = useRef(false);
  const zoomLevelsRef = useRef([64, 128, 256, 512, 1024, 2048, 4096]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(t('waveform.loadingWaveform'));
  const [error, setError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(256);
  const [isPeaksReady, setIsPeaksReady] = useState(false);
  const [cacheStatus, setCacheStatus] = useState(null); // 'hit', 'miss', 'saving', 'streaming'
  const [streamingProgress, setStreamingProgress] = useState(0); // 스트리밍 파형 생성 진행률
  const streamingAbortRef = useRef(null); // 스트리밍 취소용
  const isStreamingRef = useRef(false); // 스트리밍 중복 실행 방지용
  const initAbortRef = useRef(null); // initPeaks 중복 실행 방지용

  // 스트리밍 파형 캔버스용 상태 (ref로 최적화 - 리렌더링 방지)
  const streamingCanvasRef = useRef(null); // StreamingWaveformCanvas ref
  const [isStreaming, setIsStreaming] = useState(false);
  const [expectedPeaksCount, setExpectedPeaksCount] = useState(0);

  // 쓰로틀된 peaks 업데이트 (16ms = 60fps)
  const throttledUpdatePeaks = useRef(
    throttle((peaks) => {
      if (streamingCanvasRef.current) {
        streamingCanvasRef.current.updatePeaks(peaks);
      }
    }, 16)
  ).current;
  
  // 스크롤 상태
  const [scrollPosition, setScrollPosition] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  
  // 호버된 세그먼트 상태
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const hoveredSegmentRef = useRef(null);
  useEffect(() => {
    hoveredSegmentRef.current = hoveredSegment;
  }, [hoveredSegment]);
  const [deleteButtonPosition, setDeleteButtonPosition] = useState({ x: 0, y: 0 });
  const [longPressSegmentId, setLongPressSegmentId] = useState(null);
  const [isSegmentDragging, setIsSegmentDragging] = useState(false);
  const [boundaryPopup, setBoundaryPopup] = useState(null); // { x, y, boundaryTime, prevId, nextId } | null
  const isPopupHoveredRef = useRef(false);

  // 세그먼트 우클릭 컨텍스트 메뉴
  const [segContextMenu, setSegContextMenu] = useState(null); // { x, y, segment }
  const [splitMode, setSplitMode] = useState(null); // { segment } — 분할 모드 활성화 시
  const [splitCursorX, setSplitCursorX] = useState(null); // 분할 커서 X 위치 (px)

  // 장면 마커 표시 상태
  const [showSceneMarkers, setShowSceneMarkers] = useState(true);
  
  // 시간 격자 표시 상태
  const [showTimeGrid, setShowTimeGrid] = useState(
    () => useSettingsStore.getState().worktoolUi?.waveform?.showTimeGrid ?? true
  );
  
  // 스페이스바 + 드래그 슬라이드 상태
  const isSpacePressed = useRef(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartTime = useRef(0);
  const [isPanning, setIsPanning] = useState(false);
  
  // 파형 재생성+서버 업로드 상태
  const [isRegenerating, setIsRegenerating] = useState(false);
  const regenerateAbortRef = useRef(null);
  const [reinitCounter, setReinitCounter] = useState(0);

  // 더보기 메뉴 상태
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  const moreButtonRef = useRef(null);

  // 시간 격자 표시 상태 저장
  useEffect(() => {
    const savedShowTimeGrid = useSettingsStore.getState().worktoolUi?.waveform?.showTimeGrid ?? true;
    if (savedShowTimeGrid === showTimeGrid) return;

    updateWorktoolUi({
      waveform: {
        showTimeGrid,
      },
    });
  }, [showTimeGrid, updateWorktoolUi]);

  // 보이는 자막만 필터링 (성능 최적화)
  const visibleSubtitles = useMemo(() => {
    if (!isPeaksReady || visibleRange.end <= visibleRange.start) return [];
    return subtitles.filter(
      (sub) => sub.endTime >= visibleRange.start && sub.startTime <= visibleRange.end
    );
  }, [subtitles, visibleRange.start, visibleRange.end, isPeaksReady]);

  // 세그먼트 핸들 더블클릭 시 확장 처리
  const handleSegmentHandleDoubleClick = useCallback((segment, isStartMarker) => {
    if (!segment || !segment.id) return;
    
    const store = useSubtitleStore.getState();
    const { subtitles: allSubtitles, updateSubtitle, duration } = store;
    const subtitleId = segment.id.replace('subtitle_', '');
    const currentSubtitle = allSubtitles.find(sub => sub.id === subtitleId);
    
    if (!currentSubtitle) return;
    
    // 시간순 정렬된 자막 목록
    const sortedSubtitles = [...allSubtitles].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = sortedSubtitles.findIndex(sub => sub.id === subtitleId);
    
    const gap = getMinGap();

    if (isStartMarker) {
      // 시작 핸들: 이전 세그먼트 끝 바로 뒤까지 확장
      const prevSubtitle = currentIndex > 0 ? sortedSubtitles[currentIndex - 1] : null;
      const newStartTime = prevSubtitle ? prevSubtitle.endTime + gap : 0;
      updateSubtitle(subtitleId, { startTime: newStartTime });
    } else {
      // 끝 핸들: 다음 세그먼트 시작 바로 앞까지 확장
      const nextSubtitle = currentIndex < sortedSubtitles.length - 1
        ? sortedSubtitles[currentIndex + 1]
        : null;
      const newEndTime = nextSubtitle ? nextSubtitle.startTime - gap : duration;
      updateSubtitle(subtitleId, { endTime: newEndTime });
    }
  }, []);

  // 핸들 더블클릭 검출 — Peaks 가 핸들 위 mousedown 을 drag-detection 으로
  // 흡수해 segments.click/dblclick 이 발화하지 않고, zoomview 컨테이너에도
  // native dblclick 이 도달하지 않는 케이스가 있다. document 레벨 capture
  // 단계로 dblclick 을 잡아 클릭 시간 ↔ 자막 핸들 시간(±14px 환산 tolerance)
  // 매칭으로 핸들/본체를 판정. 일치 시 handleSegmentHandleDoubleClick 호출.
  useEffect(() => {
    const onDblClick = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const container = zoomviewRef.current;
      if (!container || !container.contains(e.target)) return;
      const peaks = peaksRef.current;
      if (!peaks) return;
      const zv = peaks.views.getView('zoomview');
      if (!zv) return;
      const viewStart = zv.getStartTime();
      const viewEnd = zv.getEndTime();
      const width = container.clientWidth;
      if (viewEnd <= viewStart || width <= 0) return;
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pxPerSec = width / (viewEnd - viewStart);
      if (pxPerSec <= 0) return;
      const clickTime = viewStart + clickX / pxPerSec;
      const tolSec = 14 / pxPerSec;

      const subs = useSubtitleStore.getState().subtitles;
      for (const sub of subs) {
        if (Math.abs(sub.startTime - clickTime) <= tolSec) {
          handleSegmentHandleDoubleClick(
            { id: `subtitle_${sub.id}`, startTime: sub.startTime, endTime: sub.endTime },
            true,
          );
          return;
        }
        if (Math.abs(sub.endTime - clickTime) <= tolSec) {
          handleSegmentHandleDoubleClick(
            { id: `subtitle_${sub.id}`, startTime: sub.startTime, endTime: sub.endTime },
            false,
          );
          return;
        }
      }
      // 핸들이 아닌 본체 더블클릭은 무시 (단일 클릭이 이미 재생 위치 이동을 처리)
    };
    document.addEventListener('dblclick', onDblClick, true);
    return () => document.removeEventListener('dblclick', onDblClick, true);
  }, [handleSegmentHandleDoubleClick]);

  // 선택된 시간 범위로 파형 뷰 이동
  const scrollToTimeRange = useCallback((peaks, range) => {
    if (!peaks) return;

    try {
      if (range && range.shouldSeek && range.startTime !== null) {
        // 파형 뷰를 이동
        const zoomview = peaks.views.getView('zoomview');
        if (zoomview) {
          const rangeDuration = (range.endTime || range.startTime) - range.startTime;
          const padding = Math.max(rangeDuration * 0.5, 0.5);
          const startTime = Math.max(0, range.startTime - padding);
          
          if (typeof zoomview.setStartTime === 'function') {
            zoomview.setStartTime(startTime);
            
            // 스크롤바 위치도 직접 업데이트 (setStartTime은 scroll 이벤트를 발생시키지 않음)
            const store = useSubtitleStore.getState();
            const dur = store.duration;
            if (dur > 0) {
              const end = zoomview.getEndTime();
              const visibleDur = end - startTime;
              const maxStart = dur - visibleDur;
              setScrollPosition(prev => {
                const newPos = maxStart > 0 ? (startTime / maxStart) * 100 : 0;
                return Math.abs(prev - newPos) < 0.01 ? prev : newPos;
              });
              setVisibleRange(prev => {
                if (prev.start === startTime && prev.end === end) return prev;
                return { start: startTime, end };
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('파형 뷰 이동 오류:', err);
    }
  }, []);

  // Peaks.js 초기화 - mediaUrl이 변경될 때만 실행
  useEffect(() => {
    if (!mediaUrl || !mediaRef.current || !zoomviewRef.current) {
      return;
    }

    // 이미 초기화된 경우 스킵
    if (isInitializedRef.current && peaksRef.current) {
      return;
    }

    const initPeaks = async () => {
      // 스트리밍 중이면 중복 실행 방지
      if (isStreamingRef.current) {
        return;
      }

      // 중복 실행 방지: 새 초기화 ID 발급 (이전 비동기 초기화를 무효화)
      const initId = Symbol();
      initAbortRef.current = initId;

      // 기존 인스턴스 정리
      if (peaksRef.current) {
        peaksRef.current.destroy();
        peaksRef.current = null;
      }

      setIsLoading(true);
      setError(null);
      setCacheStatus(null);

      try {
        // AudioContext 재사용
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 서버 파일 여부 확인
        const store = useSubtitleStore.getState();
        const isFromServer = store.isServerFile;

        // 캐시 키 생성 및 캐시 확인 (서버 파일도 캐싱 지원)
        const cacheKey = generateCacheKey(mediaFileName, mediaFileSize, isFromServer);
        let cachedData = null;

        if (cacheKey) {
          setLoadingMessage(t('waveform.checkingCache'));
          cachedData = await getCachedWaveform(cacheKey);
        }

        // 중복 실행 체크: 캐시 조회 사이에 새 초기화가 시작되었으면 중단
        if (initAbortRef.current !== initId) {
          return;
        }

        // 색상 store에서 현재 색상 가져오기
        const currentColors = useWaveformColorStore.getState().colors;
        
        // 현재 렌더링 모드 가져오기
        const currentSettings = useWaveformColorStore.getState().settings;
        const currentRenderMode = currentSettings?.renderMode || 'bar';
        
        const currentAmplitudeScale = currentSettings?.amplitudeScale || 1.0;

        const baseOptions = {
          zoomview: {
            container: zoomviewRef.current,
            waveformColor: currentColors.waveformColor,
            playedWaveformColor: currentColors.playedWaveformColor,
            axisLabelColor: currentColors.axisLabelColor,
            axisGridlineColor: currentColors.axisGridlineColor,
            playheadColor: currentColors.playheadColor || '#ffffff',
            playheadTextColor: currentColors.playheadTextColor || '#ffffff',
            playheadWidth: 1,
            showPlayheadTime: true,
            wheelMode: 'none',
            enableAnimation: false,
            enableSegmentDragging: false,
            waveformStyle: currentRenderMode,
            amplitudeScale: currentAmplitudeScale,
          },
          mediaElement: mediaRef.current,
          keyboard: false, // 키보드 스크롤 비활성화
          nudgeIncrement: 0.01,
          zoomLevels: [64, 128, 256, 512, 1024, 2048, 4096],
          // 커스텀 세그먼트 마커 — 색상 적용 (더블클릭은 peaks.on('segments.dblclick') 에서 처리)
          createSegmentMarker: (options) => createCustomSegmentMarker(options, currentColors),
          // 세그먼트 기본 설정
          segmentOptions: {
            overlay: true,
            overlayColor: currentColors.segmentOverlayColor,
            overlayBorderColor: currentColors.waveformColor,
            overlayBorderWidth: 2,
            draggable: false,
          },
        };

        let options;

        if (cachedData) {
          // 캐시된 파형 데이터 사용 (빠른 로드)
          setCacheStatus('hit');
          setLoadingMessage(t('waveform.loadingFromCache'));
          
          // ArrayBuffer에서 samples_per_pixel 값 안전 파싱 (WaveformData 바이너리 포맷)
          // 오프셋 12에 int32로 저장됨 (version, flags, sample_rate 다음)
          let cachedSamplesPerPixel = 256; // 파싱 실패 시 기본값
          try {
            if (cachedData.byteLength >= 16) {
              const dataView = new DataView(cachedData);
              const parsed = dataView.getInt32(12, true); // little-endian
              if (parsed > 0 && parsed <= 100000) {
                cachedSamplesPerPixel = parsed;
              } else {
                console.warn(`캐시된 samples_per_pixel 값이 범위 밖 (${parsed}), 기본값 256 사용`);
              }
            } else {
              console.warn(`캐시 데이터 헤더 크기 부족 (${cachedData.byteLength} bytes), 기본값 256 사용`);
            }
          } catch (parseErr) {
            console.warn('samples_per_pixel 파싱 실패, 기본값 256 사용:', parseErr);
          }
          
          // 캐시된 데이터의 samples_per_pixel 이상의 zoomLevel만 사용
          const allZoomLevels = [64, 128, 256, 512, 1024, 2048, 4096];
          const validZoomLevels = allZoomLevels.filter(z => z >= cachedSamplesPerPixel);
          zoomLevelsRef.current = validZoomLevels.length > 0 ? validZoomLevels : [256, 512, 1024, 2048, 4096];
          
          options = {
            ...baseOptions,
            zoomLevels: zoomLevelsRef.current,
            waveformData: {
              arraybuffer: cachedData,
            },
          };
        } else if (isFromServer && store.fileId) {
          // 서버 파일: 서버 waveform(.dat) 다운로드 시도 → 실패 시 로컬 생성 폴백
          let serverWaveformLoaded = false;
          try {
            setCacheStatus('loading');
            setLoadingMessage(t('waveform.loadingServerWaveform'));

            // 외부에서 미리 발급한 URL 이 있으면 (예: 연수 모드의 training-files
            // waveform-url) 그걸 우선 사용한다. 그렇지 않으면 기본 file API 로 폴백.
            let wfRes;
            if (store.serverWaveformOverrideUrl) {
              wfRes = {
                status: 'SUCCESS',
                data: { url: store.serverWaveformOverrideUrl },
              };
            } else {
              wfRes = await getWaveformDownloadUrl(store.fileId);
            }

            if (initAbortRef.current !== initId) return;

            if (wfRes?.status === 'SUCCESS' && wfRes.data?.url) {
              const wfResponse = await fetch(wfRes.data.url);
              if (wfResponse.ok) {
                const wfBuffer = await wfResponse.arrayBuffer();
                if (validateWaveformArrayBuffer(wfBuffer)) {
                  let serverSpp = 64;
                  try {
                    if (wfBuffer.byteLength >= 16) {
                      const dv = new DataView(wfBuffer);
                      const parsed = dv.getInt32(12, true);
                      if (parsed > 0 && parsed <= 100000) serverSpp = parsed;
                    }
                  } catch {}

                  const allZoomLevels = [64, 128, 256, 512, 1024, 2048, 4096];
                  zoomLevelsRef.current = allZoomLevels.filter(z => z >= serverSpp);
                  if (zoomLevelsRef.current.length === 0) zoomLevelsRef.current = [512, 1024, 2048, 4096];

                  options = {
                    ...baseOptions,
                    zoomLevels: zoomLevelsRef.current,
                    waveformData: { arraybuffer: wfBuffer },
                  };

                  if (cacheKey) {
                    cacheWaveform(cacheKey, wfBuffer, {
                      fileName: mediaFileName,
                      fileSize: mediaFileSize,
                      isServerFile: true,
                    }).catch(() => {});
                  }

                  serverWaveformLoaded = true;
                  setCacheStatus('server');
                }
              }
            }
          } catch (wfErr) {
            if (wfErr?.status === 404 || wfErr?.data?.code === 404 || wfErr?.message?.includes('404')) {
              toast.info(t('waveform.noServerWaveform'));
            } else {
              console.warn('서버 waveform 다운로드 실패, 로컬 생성으로 전환:', wfErr.message || wfErr);
            }
          }

          // 서버 waveform 실패 → 로컬 파형 생성 폴백
          if (!serverWaveformLoaded) {
            if (isWebCodecsSupported() && isMP4Container(mediaFileName, mediaType)) {
              // MP4: WebCodecs 스트리밍 파형 생성
              setCacheStatus('streaming');
              setLoadingMessage(t('waveform.serverStreamingGeneration'));
              setStreamingProgress(0);
              setIsStreaming(true);
              isStreamingRef.current = true;
              if (streamingCanvasRef.current) {
                streamingCanvasRef.current.reset();
              }

              const abortController = new AbortController();
              streamingAbortRef.current = abortController;

              try {
                const configuredSamplesPerPixel = waveformSettings?.samplesPerPixel || 64;
                const streamingResult = await generateStreamingWaveform(mediaUrl, {
                  samplesPerPixel: configuredSamplesPerPixel,
                  signal: abortController.signal,
                  onProgress: (progress) => {
                    setStreamingProgress(progress);
                    setLoadingMessage(t('waveform.streamingProgress', { progress: Math.round(progress) }));
                  },
                  onPeaksUpdate: () => {},
                });

                setIsStreaming(false);
                isStreamingRef.current = false;

                await new Promise(resolve => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(resolve);
                  });
                });

                // 재생성 경로와 동일한 포맷(float peaks → arraybuffer)으로 통일.
                // JSON + 업로드 이원화 시 스케일/타이밍 계산이 어긋날 여지를 차단.
                const waveformJson = convertToWaveformData(
                  streamingResult.peaks,
                  streamingResult.sampleRate,
                  streamingResult.samplesPerPixel,
                );
                const waveformArrayBuffer = waveformToArrayBuffer(waveformJson);

                const allZoomLevels = [64, 128, 256, 512, 1024, 2048, 4096];
                const streamingZoomLevels = allZoomLevels.filter(z => z >= configuredSamplesPerPixel);
                zoomLevelsRef.current = streamingZoomLevels;
                options = {
                  ...baseOptions,
                  zoomLevels: streamingZoomLevels,
                  waveformData: { arraybuffer: waveformArrayBuffer.slice(0) },
                };

                if (isFromServer && store.fileId) {
                  uploadWaveformToServer(store.fileId, waveformArrayBuffer.slice(0)).catch((err) => {
                    console.warn('파형 서버 업로드 실패:', err);
                  });
                }
              } catch (streamErr) {
                setIsStreaming(false);
                isStreamingRef.current = false;
                if (streamErr.name === 'AbortError') {
                  throw new Error(t('waveform.generationCancelled'));
                }
                console.warn('스트리밍 파형 생성 실패, Web Audio 폴백:', streamErr);
                setCacheStatus('miss');
                setLoadingMessage(t('waveform.generatingFirstLoad'));
                options = {
                  ...baseOptions,
                  webAudio: {
                    audioContext: audioContextRef.current,
                    multiChannel: false,
                  },
                };
              }
            } else if (isWebCodecsSupported() && isMP3File(mediaFileName, mediaType)) {
              // MP3: WebCodecs 스트리밍 파형 생성
              setCacheStatus('streaming');
              setLoadingMessage(t('waveform.serverStreamingGeneration'));
              setStreamingProgress(0);
              setIsStreaming(true);
              isStreamingRef.current = true;
              if (streamingCanvasRef.current) {
                streamingCanvasRef.current.reset();
              }

              const abortController = new AbortController();
              streamingAbortRef.current = abortController;

              try {
                const configuredSamplesPerPixel = waveformSettings?.samplesPerPixel || 64;
                const streamingResult = await generateStreamingWaveformForMP3(mediaUrl, {
                  samplesPerPixel: configuredSamplesPerPixel,
                  signal: abortController.signal,
                  onProgress: (progress) => {
                    setStreamingProgress(progress);
                    setLoadingMessage(t('waveform.streamingProgress', { progress: Math.round(progress) }));
                  },
                  onPeaksUpdate: () => {},
                });

                setIsStreaming(false);
                isStreamingRef.current = false;

                await new Promise(resolve => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(resolve);
                  });
                });

                // 재생성 경로와 동일한 포맷(float peaks → arraybuffer)으로 통일.
                const waveformJson = convertToWaveformData(
                  streamingResult.peaks,
                  streamingResult.sampleRate,
                  streamingResult.samplesPerPixel,
                );
                const waveformArrayBuffer = waveformToArrayBuffer(waveformJson);

                const allZoomLevels = [64, 128, 256, 512, 1024, 2048, 4096];
                const streamingZoomLevels = allZoomLevels.filter(z => z >= configuredSamplesPerPixel);
                zoomLevelsRef.current = streamingZoomLevels;
                options = {
                  ...baseOptions,
                  zoomLevels: streamingZoomLevels,
                  waveformData: { arraybuffer: waveformArrayBuffer.slice(0) },
                };

                if (isFromServer && store.fileId) {
                  uploadWaveformToServer(store.fileId, waveformArrayBuffer.slice(0)).catch((err) => {
                    console.warn('파형 서버 업로드 실패:', err);
                  });
                }
              } catch (streamErr) {
                setIsStreaming(false);
                isStreamingRef.current = false;
                if (streamErr.name === 'AbortError') {
                  throw new Error(t('waveform.generationCancelled'));
                }
                console.warn('MP3 스트리밍 파형 생성 실패, Web Audio 폴백:', streamErr);
                setCacheStatus('miss');
                setLoadingMessage(t('waveform.generatingFirstLoad'));
                options = {
                  ...baseOptions,
                  webAudio: {
                    audioContext: audioContextRef.current,
                    multiChannel: false,
                  },
                };
              }
            } else if (isWAVFile(mediaFileName, mediaType)) {
              // WAV: RIFF + PCM 스트리밍 파형 생성 (decodeAudioData 우회)
              console.log('[waveform-sync] WAV 스트리밍 경로 진입:', { mediaFileName, mediaType });
              setCacheStatus('streaming');
              setLoadingMessage(t('waveform.serverStreamingGeneration'));
              setStreamingProgress(0);
              setIsStreaming(true);
              isStreamingRef.current = true;
              if (streamingCanvasRef.current) {
                streamingCanvasRef.current.reset();
              }

              const abortController = new AbortController();
              streamingAbortRef.current = abortController;

              try {
                const configuredSamplesPerPixel = waveformSettings?.samplesPerPixel || 64;
                const streamingResult = await generateStreamingWaveformForWAV(mediaUrl, {
                  samplesPerPixel: configuredSamplesPerPixel,
                  signal: abortController.signal,
                  onProgress: (progress) => {
                    setStreamingProgress(progress);
                    setLoadingMessage(t('waveform.streamingProgress', { progress: Math.round(progress) }));
                  },
                  onPeaksUpdate: () => {},
                });

                setIsStreaming(false);
                isStreamingRef.current = false;

                await new Promise(resolve => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(resolve);
                  });
                });

                const waveformJson = convertToWaveformData(
                  streamingResult.peaks,
                  streamingResult.sampleRate,
                  streamingResult.samplesPerPixel,
                );
                const waveformArrayBuffer = waveformToArrayBuffer(waveformJson);

                const allZoomLevels = [64, 128, 256, 512, 1024, 2048, 4096];
                const streamingZoomLevels = allZoomLevels.filter(z => z >= configuredSamplesPerPixel);
                zoomLevelsRef.current = streamingZoomLevels;
                options = {
                  ...baseOptions,
                  zoomLevels: streamingZoomLevels,
                  waveformData: { arraybuffer: waveformArrayBuffer.slice(0) },
                };

                if (isFromServer && store.fileId) {
                  uploadWaveformToServer(store.fileId, waveformArrayBuffer.slice(0)).catch((err) => {
                    console.warn('파형 서버 업로드 실패:', err);
                  });
                }
              } catch (streamErr) {
                setIsStreaming(false);
                isStreamingRef.current = false;
                if (streamErr.name === 'AbortError') {
                  throw new Error(t('waveform.generationCancelled'));
                }
                // WAV 는 Web Audio 폴백이 대용량에서 렌더러 크래시를 유발하므로 폴백 금지.
                // 파서 실패 원인을 그대로 노출해 사용자가 인지/재시도하게 한다.
                console.error('WAV 스트리밍 파형 생성 실패:', streamErr);
                throw streamErr;
              }
            } else {
              // WebCodecs 미지원 또는 기타 포맷: Web Audio API 폴백 (대용량 시 건너뜀)
              setCacheStatus('miss');
              setLoadingMessage(t('waveform.generatingFirstLoad'));
              options = {
                ...baseOptions,
                webAudio: {
                  audioContext: audioContextRef.current,
                  multiChannel: false,
                },
              };
            }
          }
        } else if (isWAVFile(mediaFileName, mediaType)) {
          // 로컬 WAV: RIFF + PCM 스트리밍 파형 생성 (decodeAudioData 우회)
          // decodeAudioData 는 32-bit float / 대용량 / 비표준 sample rate 등에서
          // EncodingError 를 던지므로, 서버 WAV 경로와 동일한 RIFF 파서를 사용한다.
          setCacheStatus('streaming');
          setLoadingMessage(t('waveform.serverStreamingGeneration'));
          setStreamingProgress(0);
          setIsStreaming(true);
          isStreamingRef.current = true;
          if (streamingCanvasRef.current) {
            streamingCanvasRef.current.reset();
          }

          const abortController = new AbortController();
          streamingAbortRef.current = abortController;

          try {
            const configuredSamplesPerPixel = waveformSettings?.samplesPerPixel || 64;
            const streamingResult = await generateStreamingWaveformForWAV(mediaUrl, {
              samplesPerPixel: configuredSamplesPerPixel,
              signal: abortController.signal,
              onProgress: (progress) => {
                setStreamingProgress(progress);
                setLoadingMessage(t('waveform.streamingProgress', { progress: Math.round(progress) }));
              },
              onPeaksUpdate: () => {},
            });

            setIsStreaming(false);
            isStreamingRef.current = false;

            await new Promise(resolve => {
              requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
              });
            });

            const waveformJson = convertToWaveformData(
              streamingResult.peaks,
              streamingResult.sampleRate,
              streamingResult.samplesPerPixel,
            );
            const waveformArrayBuffer = waveformToArrayBuffer(waveformJson);

            const allZoomLevels = [64, 128, 256, 512, 1024, 2048, 4096];
            const streamingZoomLevels = allZoomLevels.filter(z => z >= configuredSamplesPerPixel);
            zoomLevelsRef.current = streamingZoomLevels;
            options = {
              ...baseOptions,
              zoomLevels: streamingZoomLevels,
              waveformData: { arraybuffer: waveformArrayBuffer.slice(0) },
            };
          } catch (streamErr) {
            setIsStreaming(false);
            isStreamingRef.current = false;
            if (streamErr.name === 'AbortError') {
              throw new Error(t('waveform.generationCancelled'));
            }
            // WAV 는 Web Audio 폴백이 대용량에서 렌더러 크래시를 유발하므로 폴백 금지.
            console.error('로컬 WAV 스트리밍 파형 생성 실패:', streamErr);
            throw streamErr;
          }
        } else {
          // 로컬 파일: Web Audio API로 새로 생성
          setCacheStatus('miss');
          setLoadingMessage(t('waveform.generatingFirstLoad'));
          options = {
            ...baseOptions,
            webAudio: {
              audioContext: audioContextRef.current,
              // 성능 최적화: 멀티채널 비활성화
              multiChannel: false,
            },
          };
        }

        // 중복 실행 체크: Peaks.init 직전 확인
        if (initAbortRef.current !== initId) {
          return;
        }

        let peaks = await new Promise((resolve, reject) => {
          Peaks.init(options, (err, instance) => {
            if (err) {
              reject(err);
            } else {
              resolve(instance);
            }
          });
        });

        // 중복 실행 체크: Peaks.init 완료 후 확인
        if (initAbortRef.current !== initId) {
          // 방금 생성된 인스턴스 정리
          if (peaks) {
            peaks.destroy();
          }
          return;
        }

        // 빈 파형 감지 (모든 경로 공통) → Web Audio 폴백
        // 캐시 히트, 스트리밍, 또는 Web Audio 경로 모두에서 빈 파형이 생성될 수 있음
        {
          let needsFallback = false;
          let fallbackReason = '';
          try {
            const loadedWaveformData = peaks.getWaveformData();
            if (loadedWaveformData) {
              const channel = loadedWaveformData.channel(0);
              const wfLength = loadedWaveformData.length;
              if (wfLength === 0) {
                needsFallback = true;
                fallbackReason = '파형 데이터 포인트 없음 (length=0)';
              } else {
                let hasNonZero = false;
                const step = Math.max(1, Math.floor(wfLength / 500));
                for (let i = 0; i < wfLength; i += step) {
                  if (channel.min_sample(i) !== 0 || channel.max_sample(i) !== 0) {
                    hasNonZero = true;
                    break;
                  }
                }
                if (!hasNonZero) {
                  needsFallback = true;
                  fallbackReason = '모든 샘플 값이 0';
                }
              }
            } else {
              needsFallback = true;
              fallbackReason = 'getWaveformData() 반환값 없음';
            }
          } catch (validationErr) {
            console.warn('파형 검증 중 오류 (폴백 시도):', validationErr);
            needsFallback = true;
            fallbackReason = `검증 오류: ${validationErr.message}`;
          }

          // Web Audio 폴백이 아닌 경로(캐시 히트 또는 스트리밍)에서만 폴백 시도
          // (이미 Web Audio로 생성한 경우 다시 폴백하면 무한 루프)
          const wasWebAudioPath = !cachedData && !(isFromServer && isWebCodecsSupported());
          // WAV 는 Web Audio 폴백이 곧 decodeAudioData 전체 디코딩 → 대용량에서 렌더러
          // STATUS_BREAKPOINT 크래시 원인이 됨. 우리 RIFF 스트리밍 경로가 이미 검증된
          // 결과를 만들었다면 그 결과로 진행하고, 정말 비정상이면 에러로 끊는다.
          const isWavSource = isWAVFile(mediaFileName, mediaType);
          if (needsFallback && !wasWebAudioPath && !isWavSource) {
            console.warn(`파형 데이터 비정상 (${fallbackReason}) - 캐시 삭제 후 Web Audio로 재생성`);
            // 손상된 캐시 삭제
            if (cacheKey) {
              await deleteCachedWaveform(cacheKey);
            }
            // 현재 인스턴스 파괴 후 Web Audio 폴백
            peaks.destroy();
            peaks = null;

            // 중복 실행 체크
            if (initAbortRef.current !== initId) return;

            setCacheStatus('miss');
            setLoadingMessage(t('waveform.regeneratingFallback'));
            const fallbackOptions = {
              ...baseOptions,
              webAudio: {
                audioContext: audioContextRef.current,
                multiChannel: false,
              },
            };
            peaks = await new Promise((resolve, reject) => {
              Peaks.init(fallbackOptions, (err, instance) => {
                if (err) reject(err);
                else resolve(instance);
              });
            });

            // 중복 실행 체크
            if (initAbortRef.current !== initId) {
              if (peaks) peaks.destroy();
              return;
            }
          } else if (needsFallback && isWavSource) {
            console.warn(`WAV 파형 검증 실패 (${fallbackReason}) - Web Audio 폴백은 대용량 WAV에서 크래시 위험이 있어 스킵, 현재 결과 그대로 사용`);
          } else if (needsFallback && wasWebAudioPath) {
            console.warn(`Web Audio로 생성한 파형도 비정상 (${fallbackReason}) - 폴백 불가`);
          }
        }

        // 파형 데이터 캐시 저장 (캐시 히트가 아닌 경우에만)
        if (!cachedData && cacheKey && peaks) {
          setCacheStatus('saving');
          setLoadingMessage(t('waveform.cacheSaving'));

          // Peaks.js에서 파형 데이터 추출 시도
          try {
            const waveformData = peaks.getWaveformData();
            if (waveformData) {
              // ArrayBuffer로 변환
              const arrayBuffer = waveformData.toArrayBuffer();
              // 저장 전 검증: 유효한 데이터만 캐시에 저장 (빈 데이터 캐시 방지)
              if (validateWaveformArrayBuffer(arrayBuffer)) {
                await cacheWaveform(cacheKey, arrayBuffer, {
                  fileName: mediaFileName,
                  fileSize: mediaFileSize,
                  isServerFile: isFromServer,
                });
              } else {
                console.warn('파형 캐시 저장 스킵: 데이터 검증 실패 (빈 데이터 캐시 방지)');
              }
            }
          } catch (cacheErr) {
            console.warn('파형 캐시 저장 실패 (계속 진행):', cacheErr);
          }
        }

        peaksRef.current = peaks;
        isInitializedRef.current = true;
        setIsPeaksReady(true);

        // 컨테이너 맞춤 - React 리렌더 후 레이아웃 변경 대비
        // requestAnimationFrame으로 브라우저 paint 이후 실행하여 정확한 크기 반영
        requestAnimationFrame(() => {
          if (peaksRef.current !== peaks) return; // 이미 다른 인스턴스로 교체된 경우 스킵
          const zv = peaks.views.getView('zoomview');
          if (zv && typeof zv.fitToContainer === 'function') {
            zv.fitToContainer();
          }
          // 초기 뷰: playhead를 중앙에 가능한 가깝게 배치
          if (zv) {
            const currentTime = mediaRef.current?.currentTime || 0;
            const visibleDuration = zv.getEndTime() - zv.getStartTime();
            zv.setStartTime(Math.max(0, currentTime - visibleDuration / 2));
          }
        });

        // 드래그 모드를 'insert-segment'로 설정 (드래그로 세그먼트 생성)
        const zoomview = peaks.views.getView('zoomview');
        if (zoomview) {
          if (typeof zoomview.setWaveformDragMode === 'function') {
            zoomview.setWaveformDragMode('insert-segment');
          }
          // 세그먼트 마커 드래그 활성화
          if (typeof zoomview.enableSegmentDragging === 'function') {
            zoomview.enableSegmentDragging(true);
          }
        }

        // 드래그로 세그먼트가 생성되면 자막 추가 및 selectedTimeRange 업데이트
        peaks.on('segments.insert', (event) => {
          const segment = event.segment;
          if (segment) {
            const segmentDuration = segment.endTime - segment.startTime;
            const store = useSubtitleStore.getState();
            const { subtitles } = store;
            
            // 기존 자막과 겹치는지 확인
            const hasOverlap = subtitles.some((sub) => {
              return segment.startTime < sub.endTime && segment.endTime > sub.startTime;
            });
            
            // 최소 0.1초 이상이어야 범위 선택으로 인정 + 겹치지 않아야 함
            if (segmentDuration >= 0.1 && !hasOverlap) {
              // 시간 범위 저장 (세그먼트 제거 전에)
              const startTime = segment.startTime;
              const endTime = segment.endTime;
              
              // Peaks.js가 생성한 세그먼트 제거 (자막 기반 세그먼트로 대체됨)
              peaks.segments.removeById(segment.id);
              
              // 자막 자동 추가 및 ID 받기
              const newSubtitleId = store.addSubtitle({
                text: '',
                startTime: startTime,
                endTime: endTime,
              });
              
              // 새로 추가된 자막 선택 (편집 모드로 전환)
              store.selectSubtitle(newSubtitleId);
              
              // 새로 생성된 세그먼트의 시간 범위를 store에 저장
              setSelectedTimeRange({
                startTime: startTime,
                endTime: endTime,
                shouldSeek: false,
              });
              
              // 미디어를 시작 위치로 이동
              if (mediaRef.current) {
                mediaRef.current.currentTime = startTime;
              }
              usePlaybackStore.getState().setCurrentTime(startTime);
            } else {
              // 겹치거나 너무 짧으면 세그먼트 제거
              peaks.segments.removeById(segment.id);

              // 클릭한 위치에 기존 세그먼트가 있는지 확인
              const clickTime = segment.startTime;
              const { selectSubtitle } = store;
              const { setCurrentTime } = usePlaybackStore.getState();
              
              // 클릭한 시간에 해당하는 자막 찾기
              const clickedSubtitle = subtitles.find(
                (sub) => clickTime >= sub.startTime && clickTime <= sub.endTime
              );
              
              if (clickedSubtitle) {
                // 해당 자막 선택
                selectSubtitle(clickedSubtitle.id);
                
                // 미디어 시간도 이동
                if (mediaRef.current) {
                  mediaRef.current.currentTime = clickTime;
                }
                setCurrentTime(clickTime);
              }
            }
          }
        });
        
        // zoomview 클릭 (해당 위치로 이동 + playhead 중앙 고정 + textarea 포커스).
        // Konva의 click은 DOM 네이티브와 달리 버튼 종류와 무관하게 발생하므로
        // 우클릭/휠클릭으로 재생 위치가 이동하지 않도록 주 버튼(0)만 처리한다.
        peaks.on('zoomview.click', (event) => {
          if (event?.evt?.button !== undefined && event.evt.button !== 0) return;
          const store = useSubtitleStore.getState();
          usePlaybackStore.getState().setCurrentTime(event.time);
          if (mediaRef.current) {
            mediaRef.current.currentTime = event.time;
          }
          // playhead를 중앙에 고정
          const zv = peaks.views.getView('zoomview');
          if (zv) {
            const visibleDuration = zv.getEndTime() - zv.getStartTime();
            zv.setStartTime(Math.max(0, event.time - visibleDuration / 2));
            updateVisibleRangeFromPeaks();
          }
          const sub = store.subtitles.find(
            (s) => event.time >= s.startTime && event.time <= s.endTime
          );
          if (sub) {
            store.selectSubtitle(sub.id);
            store.requestFocus();
          }
        });

        // zoomview 우클릭: 세그먼트 위면 컨텍스트 메뉴, 빈 영역이면 새 싱크 생성
        const handleZoomviewContextMenu = (e) => {
          e.preventDefault();
          if (!peaksRef.current || !zoomviewRef.current) return;
          const zv = peaksRef.current.views.getView('zoomview');
          if (!zv) return;
          const rect = zoomviewRef.current.getBoundingClientRect();
          const relX = e.clientX - rect.left;
          const viewStart = zv.getStartTime();
          const viewEnd = zv.getEndTime();
          const clickTime = viewStart + (relX / rect.width) * (viewEnd - viewStart);

          const store = useSubtitleStore.getState();
          const { subtitles, addSubtitle, selectSubtitle } = store;
          const dur = store.duration || 0;

          // 세그먼트 위인지 확인
          const allSegs = peaksRef.current.segments.getSegments();
          const clickedSeg = allSegs.find((s) => clickTime >= s.startTime && clickTime <= s.endTime);

          if (clickedSeg) {
            // 세그먼트 컨텍스트 메뉴 표시
            setSegContextMenu({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              segment: clickedSeg,
            });
            return;
          }

          // 빈 영역: 새 싱크 생성
          const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
          const nextSub = sorted.find((s) => s.startTime > clickTime);
          const endTime = nextSub ? nextSub.startTime : dur;

          if (endTime <= clickTime) return;

          const newId = addSubtitle({
            startTime: clickTime,
            endTime,
            text: '',
          });
          if (newId) {
            selectSubtitle(newId, clickTime, endTime);
          }
        };
        zoomviewRef.current.addEventListener('contextmenu', handleZoomviewContextMenu);

        // 드래그 시작 시 원본 duration 기록 (peaks 내부 클램핑으로 duration이 줄어드는 것 방지)
        const dragOriginals = new Map();
        peaks.on('segments.dragstart', (event) => {
          const segment = event.segment;
          if (segment && segment.id) {
            dragOriginals.set(segment.id, {
              startTime: segment.startTime,
              endTime: segment.endTime,
              duration: segment.endTime - segment.startTime,
            });
          }
        });

        // 세그먼트 드래그 완료 시 자막 업데이트 (겹침 방지 적용)
        peaks.on('segments.dragend', (event) => {
          const segment = event.segment;
          if (segment && segment.id) {
            const store = useSubtitleStore.getState();
            const { subtitles, updateSubtitle } = store;
            const subtitleId = segment.id.replace('subtitle_', '');
            const matchingSubtitle = subtitles.find(
              (sub) => sub.id === subtitleId ||
                (Math.abs(sub.startTime - segment.startTime) < 0.1 &&
                 Math.abs(sub.endTime - segment.endTime) < 0.1)
            );

            if (matchingSubtitle) {
              let { startTime, endTime } = segment;
              const gap = getMinGap();

              const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
              const idx = sorted.findIndex(s => s.id === matchingSubtitle.id);
              const prev = idx > 0 ? sorted[idx - 1] : null;
              const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

              if (event.startMarker) {
                if (prev && startTime < prev.endTime + gap) {
                  startTime = prev.endTime + gap;
                }
              } else if (event.endMarker) {
                if (next && endTime > next.startTime - gap) {
                  endTime = next.startTime - gap;
                }
              } else {
                const orig = dragOriginals.get(segment.id);
                const segDuration = orig ? orig.duration : (endTime - startTime);
                endTime = startTime + segDuration;
                if (prev && startTime < prev.endTime + gap) {
                  startTime = prev.endTime + gap;
                  endTime = startTime + segDuration;
                }
                if (next && endTime > next.startTime - gap) {
                  endTime = next.startTime - gap;
                  startTime = endTime - segDuration;
                }
              }
              dragOriginals.delete(segment.id);

              updateSubtitle(matchingSubtitle.id, { startTime, endTime });

              const updatedStore = useSubtitleStore.getState();
              const updatedSubtitle = updatedStore.subtitles.find(
                (sub) => sub.id === matchingSubtitle.id
              );

              if (updatedSubtitle) {
                if (Math.abs(updatedSubtitle.startTime - segment.startTime) > 0.001 ||
                    Math.abs(updatedSubtitle.endTime - segment.endTime) > 0.001) {
                  segment.update({
                    startTime: updatedSubtitle.startTime,
                    endTime: updatedSubtitle.endTime,
                  });
                }
              }
            }
          }
        });

        // 세그먼트 드래그 중 실시간으로 겹침 방지
        let sortedSubtitlesCache = null;
        let sortedCacheRef = null;

        peaks.on('segments.dragging', (event) => {
          const segment = event.segment;
          if (segment && segment.id) {
            const store = useSubtitleStore.getState();
            const { subtitles: allSubs } = store;
            const subtitleId = segment.id.replace('subtitle_', '');

            // 배열 참조가 바뀔 때만 재정렬
            if (sortedSubtitlesCache === null || sortedCacheRef !== allSubs) {
              sortedSubtitlesCache = [...allSubs].sort((a, b) => a.startTime - b.startTime);
              sortedCacheRef = allSubs;
            }

            const currentIdx = sortedSubtitlesCache.findIndex(s => s.id === subtitleId);
            if (currentIdx < 0) return;

            const prevSub = currentIdx > 0 ? sortedSubtitlesCache[currentIdx - 1] : null;
            const nextSub = currentIdx < sortedSubtitlesCache.length - 1 ? sortedSubtitlesCache[currentIdx + 1] : null;

            let { startTime, endTime } = segment;
            let needsUpdate = false;
            const gap = getMinGap();

            if (event.startMarker) {
              if (prevSub && startTime < prevSub.endTime + gap) {
                startTime = prevSub.endTime + gap;
                needsUpdate = true;
              }
            } else if (event.endMarker) {
              if (nextSub && endTime > nextSub.startTime - gap) {
                endTime = nextSub.startTime - gap;
                needsUpdate = true;
              }
            } else {
              const orig = dragOriginals.get(segment.id);
              const segDuration = orig ? orig.duration : (endTime - startTime);
              if (Math.abs((endTime - startTime) - segDuration) > 0.001) {
                endTime = startTime + segDuration;
                needsUpdate = true;
              }
              if (prevSub && startTime < prevSub.endTime + gap) {
                startTime = prevSub.endTime + gap;
                endTime = startTime + segDuration;
                needsUpdate = true;
              }
              if (nextSub && endTime > nextSub.startTime - gap) {
                endTime = nextSub.startTime - gap;
                startTime = endTime - segDuration;
                needsUpdate = true;
              }
            }

            if (needsUpdate) {
              segment.update({ startTime, endTime });
            }
          }
        });

        // 세그먼트 클릭 시 해당 자막 선택 (주 버튼만 처리; 우클릭은 contextmenu 핸들러가 담당)
        peaks.on('segments.click', (event) => {
          if (event?.evt?.button !== undefined && event.evt.button !== 0) return;
          const segment = event.segment;
          if (segment && segment.id) {
            const store = useSubtitleStore.getState();
            const { subtitles, selectSubtitle } = store;
            const { setCurrentTime } = usePlaybackStore.getState();

            // 세그먼트 ID에서 자막 ID 추출
            const subtitleId = segment.id.replace('subtitle_', '');

            // 해당 자막 찾기
            const matchingSubtitle = subtitles.find(
              (sub) => sub.id === subtitleId
            );

            if (matchingSubtitle) {
              selectSubtitle(matchingSubtitle.id);
              if (mediaRef.current) {
                mediaRef.current.currentTime = segment.startTime;
              }
              setCurrentTime(segment.startTime);
              // playhead를 중앙에 고정
              const zv = peaks.views.getView('zoomview');
              if (zv) {
                const visibleDuration = zv.getEndTime() - zv.getStartTime();
                zv.setStartTime(Math.max(0, segment.startTime - visibleDuration / 2));
                updateVisibleRangeFromPeaks();
              }
              store.requestFocus();
            }
          }
        });


        // 세그먼트 마우스 호버 이벤트 (드래그 핸들 표시용)
        peaks.on('segments.mouseenter', (event) => {
          const segment = event.segment;
          if (segment && zoomviewRef.current) {
            const zv = peaks.views.getView('zoomview');
            if (zv) {
              const midTime = (segment.startTime + segment.endTime) / 2;
              const rect = zoomviewRef.current.getBoundingClientRect();
              const viewStart = zv.getStartTime();
              const visibleDuration = zv.getEndTime() - viewStart;
              const relativeX = ((midTime - viewStart) / visibleDuration) * rect.width;
              setHoveredSegment(segment);
              setDeleteButtonPosition({
                x: Math.min(Math.max(relativeX, 30), rect.width - 30),
                y: 10,
              });
            }
          }
        });

        // 뷰 변경 시 visibleRange 및 스크롤바 위치 업데이트
        const updateVisibleRangeFromPeaks = () => {
          const zoomview = peaks.views.getView('zoomview');
          if (zoomview) {
            const start = zoomview.getStartTime();
            const end = zoomview.getEndTime();
            setVisibleRange(prev => {
              if (prev.start === start && prev.end === end) return prev;
              return { start, end };
            });
            const store = useSubtitleStore.getState();
            const dur = store.duration;
            if (dur > 0) {
              const maxStart = dur - (end - start);
              setScrollPosition(prev => {
                const newPos = maxStart > 0 ? (start / maxStart) * 100 : 0;
                return Math.abs(prev - newPos) < 0.01 ? prev : newPos;
              });
            }
          }
        };

        // RAF 쓰로틀: zoomview.scroll, player.timeupdate 모두 프레임당 최대 1회
        let viewUpdateRafId = null;
        const throttledViewUpdate = () => {
          if (viewUpdateRafId === null) {
            viewUpdateRafId = requestAnimationFrame(() => {
              viewUpdateRafId = null;
              updateVisibleRangeFromPeaks();
            });
          }
        };

        // 재생 중 playhead를 뷰 중앙에 고정하고 파형을 매 프레임 이동.
        // rAF id 는 ref 로 끌어올려 effect cleanup 에서도 cancel 가능하게 한다.
        // 사용자 스크럽(휠/드래그) 중에는 일시 중지하여 사용자가 자유롭게 스크롤하게 둠.
        const centerScrollLoop = () => {
          centerScrollRafIdRef.current = requestAnimationFrame(() => {
            try {
              const zv = peaks.views.getView('zoomview');
              if (
                zv &&
                mediaRef.current &&
                !mediaRef.current.paused &&
                !isScrubbingRef.current
              ) {
                const currentTime = mediaRef.current.currentTime;
                const viewStart = zv.getStartTime();
                const viewEnd = zv.getEndTime();
                const visibleDuration = viewEnd - viewStart;
                const newStart = currentTime - visibleDuration / 2;
                zv.setStartTime(Math.max(0, newStart));
                updateVisibleRangeFromPeaks();
              }
            } catch { /* silent */ }
            centerScrollLoop();
          });
        };

        const startCenterScroll = () => centerScrollLoop();
        const stopCenterScroll = () => {
          if (centerScrollRafIdRef.current !== null) {
            cancelAnimationFrame(centerScrollRafIdRef.current);
            centerScrollRafIdRef.current = null;
          }
        };

        peaks.on('player.playing', startCenterScroll);
        peaks.on('player.pause', stopCenterScroll);
        peaks.on('player.ended', stopCenterScroll);

        // 이미 재생 중이면 바로 시작
        if (mediaRef.current && !mediaRef.current.paused) {
          startCenterScroll();
        }

        // 'zoomview.scroll' 은 peaks-native 드래그 스크롤에서만 발생
        // (setStartTime 은 이 이벤트를 발생시키지 않으므로, centerScrollLoop·wheel·click 호출과 충돌 없음)
        peaks.on('zoomview.scroll', () => {
          handleUserScrollRef.current();
          throttledViewUpdate();
        });
        peaks.on('zoom.update', updateVisibleRangeFromPeaks);
        peaks.on('player.timeupdate', throttledViewUpdate);

        // 초기 줌 레벨을 중간 인덱스로 설정
        const midIndex = Math.floor(zoomLevelsRef.current.length / 2);
        peaks.zoom.setZoom(midIndex);

        // 초기 visibleRange 및 줌 레벨 설정
        updateVisibleRangeFromPeaks();
        updateZoomLevel();

        setIsLoading(false);
      } catch (err) {
        console.error('Peaks.js 초기화 오류:', err);
        isInitializedRef.current = true;
        setError(t('waveform.loadError'));
        setIsLoading(false);
      }
    };

    // 미디어가 로드된 후 초기화
    const handleCanPlay = () => {
      if (!isInitializedRef.current) {
        initPeaks();
      }
    };

    const mediaElement = mediaRef.current;
    mediaElement.addEventListener('canplay', handleCanPlay);

    // 이미 로드되어 있으면 바로 초기화
    if (mediaElement.readyState >= 2 && !isInitializedRef.current) {
      initPeaks();
    }

    return () => {
      mediaElement.removeEventListener('canplay', handleCanPlay);
      // 중앙 스크롤 rAF 루프 정리 — peaks.destroy() 후에는 'player.pause'
      // 리스너가 사라져 loop 가 자동으로 멈추지 않는다.
      if (centerScrollRafIdRef.current !== null) {
        cancelAnimationFrame(centerScrollRafIdRef.current);
        centerScrollRafIdRef.current = null;
      }
      // Peaks 인스턴스를 명시적으로 destroy 해서 등록된 모든 이벤트 리스너
      // (segments.* / zoomview.* / player.* / zoom.update / contextmenu 등)와
      // Konva 노드를 함께 정리. 이 cleanup 이 없으면 reinitCounter / unmount /
      // mediaUrl 변경 시 리스너와 노드가 누적되어 장시간 작업 시 메모리·CPU 부담의
      // 원인이 됐다. (docs/todo/07 참조)
      if (peaksRef.current) {
        try { peaksRef.current.destroy(); } catch (_) { /* ignore */ }
        peaksRef.current = null;
      }
    };
  }, [mediaUrl, mediaRef, reinitCounter]);

  // mediaUrl이 변경되면 이전 인스턴스 즉시 정리 및 초기화 플래그 리셋
  useEffect(() => {
    // 기존 Peaks 인스턴스 즉시 정리 (좀비 인스턴스 방지)
    if (peaksRef.current) {
      peaksRef.current.destroy();
      peaksRef.current = null;
    }
    isInitializedRef.current = false;
    // 새 미디어가 로드되면 isPeaksReady 리셋
    setIsPeaksReady(false);
    setIsStreaming(false);
    isStreamingRef.current = false;
    // Canvas 초기화 (ref 기반)
    if (streamingCanvasRef.current) {
      streamingCanvasRef.current.reset();
    }
    // 쓰로틀 취소
    throttledUpdatePeaks.cancel();
    return () => {
      isInitializedRef.current = false;
    };
  }, [mediaUrl, throttledUpdatePeaks]);

  // 스트리밍 시 예상 peaks 개수 계산 (duration 기반)
  useEffect(() => {
    if (isStreaming && duration > 0) {
      // samplesPerPixel=512, sampleRate 추정치 44100Hz
      const estimatedSampleRate = 44100;
      const totalSamples = duration * estimatedSampleRate;
      const expectedPeaks = Math.ceil(totalSamples / 512);
      setExpectedPeaksCount(expectedPeaks);
    }
  }, [isStreaming, duration]);

  // 세그먼트 업데이트 참조 (디바운스용)
  const segmentUpdateTimeoutRef = useRef(null);

  // 세그먼트 가상화: 현재 Peaks.js에 로드된 세그먼트 시간 범위
  const loadedSegmentRangeRef = useRef(null);

  // 세그먼트 동기화 (가상화 적용 - store에서 직접 최신 상태를 읽어 항상 정확)
  const syncSegments = useCallback(() => {
    const peaks = peaksRef.current;
    if (!peaks || !peaks.segments) return;

    // 로드 범위가 아직 설정되지 않았으면 현재 뷰포트로부터 초기화
    if (!loadedSegmentRangeRef.current) {
      try {
        const zoomview = peaks.views.getView('zoomview');
        if (zoomview) {
          const s = zoomview.getStartTime();
          const e = zoomview.getEndTime();
          const vd = e - s;
          if (vd > 0) {
            const buf = Math.max(vd * 3, 30);
            loadedSegmentRangeRef.current = { start: s - buf, end: e + buf };
          }
        }
      } catch (_) { /* ignore */ }
    }

    try {
      const store = useSubtitleStore.getState();
      const allSubtitles = store.subtitles;
      const selectedId = store.selectedSubtitleId;
      const storeColors = useWaveformColorStore.getState().colors;
      const selectedColor = storeColors.segmentSelectedColor;
      const normalColor = storeColors.segmentOverlayColor;

      // 가상화: 로드 범위 내 자막만 대상으로 설정
      let targetSubtitles;
      const loaded = loadedSegmentRangeRef.current;

      if (loaded && loaded.end > loaded.start) {
        targetSubtitles = allSubtitles.filter(
          (sub) => sub.endTime >= loaded.start && sub.startTime <= loaded.end
        );
        if (selectedId && !targetSubtitles.some((s) => s.id === selectedId)) {
          const selected = allSubtitles.find((s) => s.id === selectedId);
          if (selected) targetSubtitles.push(selected);
        }
      } else {
        targetSubtitles = allSubtitles;
      }

      const existingSegments = peaks.segments.getSegments();
      const existingSegmentMap = new Map();
      existingSegments.forEach((seg) => {
        existingSegmentMap.set(seg.id, seg);
      });

      const targetIds = new Set();
      targetSubtitles.forEach((s) => targetIds.add(`subtitle_${s.id}`));

      // 대상 범위 밖 세그먼트 제거
      const segmentsToRemove = [];
      existingSegments.forEach((seg) => {
        if (seg.id.startsWith('subtitle_') && !targetIds.has(seg.id)) {
          segmentsToRemove.push(seg.id);
        }
      });
      segmentsToRemove.forEach((id) => {
        try { peaks.segments.removeById(id); } catch (_) { /* ignore */ }
      });

      // 세그먼트 추가/업데이트
      const segmentsToAdd = [];

      targetSubtitles.forEach((subtitle) => {
        if (subtitle.startTime >= 0 && subtitle.endTime > subtitle.startTime) {
          const segmentId = `subtitle_${subtitle.id}`;
          const isSelected = subtitle.id === selectedId;
          const segmentColor = isSelected ? selectedColor : normalColor;
          const existingSegment = existingSegmentMap.get(segmentId);

          if (existingSegment) {
            const needsUpdate =
              Math.abs(existingSegment.startTime - subtitle.startTime) > 0.001 ||
              Math.abs(existingSegment.endTime - subtitle.endTime) > 0.001 ||
              existingSegment.color !== segmentColor;

            if (needsUpdate) {
              existingSegment.update({
                startTime: subtitle.startTime,
                endTime: subtitle.endTime,
                color: segmentColor,
              });
            }
          } else {
            segmentsToAdd.push({
              id: segmentId,
              startTime: subtitle.startTime,
              endTime: subtitle.endTime,
              labelText: '',
              color: segmentColor,
              editable: true,
            });
          }
        }
      });

      if (segmentsToAdd.length > 0) {
        try {
          peaks.segments.add(segmentsToAdd);
        } catch (e) {
          segmentsToAdd.forEach((seg) => {
            try { peaks.segments.add(seg); } catch (_) { /* ignore */ }
          });
        }
      }
    } catch (err) {
      console.error('세그먼트 동기화 오류:', err);
    }
  }, []);

  // 자막 데이터 변경 시 세그먼트 동기화 (100ms 디바운스)
  useEffect(() => {
    if (!peaksRef.current || !isPeaksReady) return;

    if (segmentUpdateTimeoutRef.current) {
      clearTimeout(segmentUpdateTimeoutRef.current);
    }

    segmentUpdateTimeoutRef.current = setTimeout(() => {
      syncSegments();
    }, 100);

    return () => {
      if (segmentUpdateTimeoutRef.current) {
        clearTimeout(segmentUpdateTimeoutRef.current);
      }
    };
  }, [subtitles, isPeaksReady, theme, waveformColors, syncSegments]);

  // 선택된 자막 변경 시 해당 세그먼트만 색상 업데이트 (O(1))
  const prevSelectedIdRef = useRef(null);
  useEffect(() => {
    if (!peaksRef.current || !isPeaksReady) return;
    const peaks = peaksRef.current;
    if (!peaks.segments) return;

    const storeColors = useWaveformColorStore.getState().colors;
    const prevId = prevSelectedIdRef.current;

    if (prevId && prevId !== selectedSubtitleId) {
      try {
        const prevSeg = peaks.segments.getSegment(`subtitle_${prevId}`);
        if (prevSeg) prevSeg.update({ color: storeColors.segmentOverlayColor });
      } catch (_) { /* ignore */ }
    }

    if (selectedSubtitleId) {
      try {
        const newSeg = peaks.segments.getSegment(`subtitle_${selectedSubtitleId}`);
        if (newSeg) newSeg.update({ color: storeColors.segmentSelectedColor });
      } catch (_) { /* ignore */ }
    }

    prevSelectedIdRef.current = selectedSubtitleId;
  }, [selectedSubtitleId, isPeaksReady]);

  // 우클릭 컨텍스트 메뉴 타겟 세그먼트 시각 강조.
  // segContextMenu가 설정되면 타겟 세그먼트 색을 segmentContextTargetColor로 바꿔
  // 사용자가 어떤 싱크에 액션이 걸리는지 알 수 있게 하고,
  // 메뉴가 닫히거나 다른 세그먼트로 옮겨갈 때 원래 색(선택 여부에 따라)으로 복원한다.
  const prevContextTargetIdRef = useRef(null);
  useEffect(() => {
    if (!peaksRef.current || !isPeaksReady) return;
    const peaks = peaksRef.current;
    if (!peaks.segments) return;

    const storeColors = useWaveformColorStore.getState().colors;
    const prevId = prevContextTargetIdRef.current;
    const currentId = segContextMenu?.segment?.id || null;

    if (prevId && prevId !== currentId) {
      try {
        const prevSeg = peaks.segments.getSegment(prevId);
        if (prevSeg) {
          const subtitleId = prevId.startsWith('subtitle_')
            ? prevId.replace('subtitle_', '')
            : null;
          const isStillSelected =
            subtitleId && subtitleId === selectedSubtitleId;
          prevSeg.update({
            color: isStillSelected
              ? storeColors.segmentSelectedColor
              : storeColors.segmentOverlayColor,
          });
        }
      } catch (_) { /* ignore */ }
    }

    if (currentId && currentId !== prevId) {
      try {
        const seg = peaks.segments.getSegment(currentId);
        if (seg) seg.update({ color: storeColors.segmentContextTargetColor });
      } catch (_) { /* ignore */ }
    }

    prevContextTargetIdRef.current = currentId;
  }, [segContextMenu, isPeaksReady, selectedSubtitleId]);

  // 뷰포트 이동 시 세그먼트 가상화 범위 갱신
  useEffect(() => {
    if (!isPeaksReady || !peaksRef.current) return;

    const visibleDuration = visibleRange.end - visibleRange.start;
    if (visibleDuration <= 0) return;

    const loaded = loadedSegmentRangeRef.current;

    if (loaded && loaded.end > loaded.start) {
      const rangeSize = loaded.end - loaded.start;
      const margin = rangeSize * 0.2;
      if (
        visibleRange.start >= loaded.start + margin &&
        visibleRange.end <= loaded.end - margin
      ) {
        return;
      }
    }

    const buffer = Math.max(visibleDuration * 3, 30);
    loadedSegmentRangeRef.current = {
      start: visibleRange.start - buffer,
      end: visibleRange.end + buffer,
    };

    syncSegments();
  }, [visibleRange.start, visibleRange.end, isPeaksReady, syncSegments]);

  // 선택된 시간 범위가 변경되면 파형 뷰 이동
  useEffect(() => {
    if (isPeaksReady && peaksRef.current && selectedTimeRange && selectedTimeRange.shouldSeek) {
      scrollToTimeRange(peaksRef.current, selectedTimeRange);
    }
  }, [selectedTimeRange, isPeaksReady, scrollToTimeRange]);

  // 파형 색상 변경 시 Peaks.js 뷰 업데이트
  useEffect(() => {
    if (!isPeaksReady || !peaksRef.current) return;
    
    const peaks = peaksRef.current;
    
    try {
      // Zoomview 색상 업데이트
      const zoomview = peaks.views.getView('zoomview');
      if (zoomview) {
        if (typeof zoomview.setWaveformColor === 'function') {
          zoomview.setWaveformColor(waveformColors.waveformColor);
        }
        if (typeof zoomview.setPlayedWaveformColor === 'function') {
          zoomview.setPlayedWaveformColor(waveformColors.playedWaveformColor);
        }
      }
    } catch (err) {
      console.warn('파형 색상 업데이트 실패:', err);
    }
  }, [waveformColors, isPeaksReady]);

  // 파형 증폭 변경 시 Peaks.js 뷰 업데이트
  useEffect(() => {
    if (!isPeaksReady || !peaksRef.current) return;
    const scale = waveformSettings?.amplitudeScale || 1.0;

    try {
      const zoomview = peaksRef.current.views.getView('zoomview');
      if (zoomview && typeof zoomview.setAmplitudeScale === 'function') {
        zoomview.setAmplitudeScale(scale);
      }
    } catch (err) {
      console.warn('파형 증폭 업데이트 실패:', err);
    }
  }, [waveformSettings?.amplitudeScale, isPeaksReady]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (peaksRef.current) {
        peaksRef.current.destroy();
        peaksRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      // 쓰로틀 취소
      throttledUpdatePeaks.cancel();
      isInitializedRef.current = false;
    };
  }, [throttledUpdatePeaks]);

  // 리사이즈 디바운스용 ref
  const resizeTimeoutRef = useRef(null);
  
  // 컨테이너 리사이즈 감지 및 파형 업데이트 (디바운스 적용)
  useEffect(() => {
    const container = waveformContainerRef.current;
    if (!container || !isPeaksReady) return;

    const resizeObserver = new ResizeObserver(() => {
      // 디바운스: 빠른 연속 리사이즈 이벤트 방지
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeTimeoutRef.current = setTimeout(() => {
        if (peaksRef.current) {
          // Peaks.js 뷰를 컨테이너에 맞게 업데이트
          const zoomview = peaksRef.current.views.getView('zoomview');

          if (zoomview && typeof zoomview.fitToContainer === 'function') {
            zoomview.fitToContainer();
          }
        }
      }, 150); // 150ms 디바운스
    });

    resizeObserver.observe(container);
    if (zoomviewRef.current) {
      resizeObserver.observe(zoomviewRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [isPeaksReady]);

  // 스페이스바 + 드래그 슬라이드 기능
  useEffect(() => {
    const container = zoomviewRef.current;
    if (!container || !isPeaksReady) return;

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && !e.shiftKey) {
        isSpacePressed.current = true;
        if (container) {
          container.style.cursor = 'grab';
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
        isDragging.current = false;
        setIsPanning(false);
        if (container) {
          container.style.cursor = '';
        }
      }
    };

    const handleMouseDown = (e) => {
      if (isSpacePressed.current && peaksRef.current) {
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = true;
        dragStartX.current = e.clientX;
        setIsPanning(true);
        
        const zoomview = peaksRef.current.views.getView('zoomview');
        if (zoomview) {
          dragStartTime.current = zoomview.getStartTime();
        }
        
        if (container) {
          container.style.cursor = 'grabbing';
        }
      }
    };

    const handleMouseMove = (e) => {
      if (isDragging.current && isSpacePressed.current && peaksRef.current) {
        e.preventDefault();
        
        const zoomview = peaksRef.current.views.getView('zoomview');
        if (zoomview) {
          const containerWidth = container.offsetWidth;
          const visibleDuration = zoomview.getEndTime() - zoomview.getStartTime();
          const deltaX = dragStartX.current - e.clientX;
          const deltaTime = (deltaX / containerWidth) * visibleDuration;
          
          const newStartTime = Math.max(0, dragStartTime.current + deltaTime);
          const maxStartTime = (duration || 0) - visibleDuration;
          const clampedStartTime = Math.min(newStartTime, Math.max(0, maxStartTime));
          
          if (typeof zoomview.setStartTime === 'function') {
            zoomview.setStartTime(clampedStartTime);
          }
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setIsPanning(false);
        if (container && isSpacePressed.current) {
          container.style.cursor = 'grab';
        } else if (container) {
          container.style.cursor = '';
        }
      }
    };

    // 이벤트 리스너 등록
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPeaksReady, duration]);

  // 줌 레벨 업데이트 헬퍼
  const updateZoomLevel = useCallback(() => {
    if (peaksRef.current && peaksRef.current.zoom) {
      try {
        const zoomIndex = peaksRef.current.zoom.getZoom();
        const actualZoomLevel = zoomLevelsRef.current[zoomIndex] || zoomLevelsRef.current[0];
        setZoomLevel(actualZoomLevel);
      } catch {
        // Peaks.js 버전에 따라 API가 다를 수 있음
      }
    }
  }, []);

  // 줌 컨트롤
  const handleZoomIn = useCallback(() => {
    if (peaksRef.current) {
      peaksRef.current.zoom.zoomIn();
      updateZoomLevel();
    }
  }, [updateZoomLevel]);

  const handleZoomOut = useCallback(() => {
    if (peaksRef.current) {
      peaksRef.current.zoom.zoomOut();
      updateZoomLevel();
    }
  }, [updateZoomLevel]);

  // 세그먼트 삭제 (세그먼트와 해당 자막 함께 삭제)
  const handleDeleteSegment = useCallback(() => {
    if (!hoveredSegment || !peaksRef.current) return;
    
    const store = useSubtitleStore.getState();
    const { subtitles, deleteSubtitle } = store;
    
    // 세그먼트 시간 범위와 일치하는 자막 찾기
    const matchingSubtitle = subtitles.find(
      (sub) => 
        Math.abs(sub.startTime - hoveredSegment.startTime) < 0.05 &&
        Math.abs(sub.endTime - hoveredSegment.endTime) < 0.05
    );
    
    // 자막 삭제
    if (matchingSubtitle) {
      deleteSubtitle(matchingSubtitle.id);
    }
    
    // 세그먼트 삭제
    try {
      peaksRef.current.segments.removeById(hoveredSegment.id);
    } catch (err) {
      console.error('세그먼트 삭제 오류:', err);
    }
    
    setHoveredSegment(null);
  }, [hoveredSegment]);

  // 컨텍스트 메뉴: 삭제
  const handleCtxDelete = useCallback(() => {
    if (!segContextMenu?.segment || !peaksRef.current) return;
    const seg = segContextMenu.segment;
    const store = useSubtitleStore.getState();
    const subtitleId = seg.id.replace('subtitle_', '');
    const sub = store.subtitles.find((s) => s.id === subtitleId);
    if (sub) store.deleteSubtitle(sub.id);
    try { peaksRef.current.segments.removeById(seg.id); } catch { /* silent */ }
    setSegContextMenu(null);
  }, [segContextMenu]);

  // 컨텍스트 메뉴: 이전 싱크와 병합
  const handleCtxMergePrev = useCallback(() => {
    if (!segContextMenu?.segment) return;
    const seg = segContextMenu.segment;
    const store = useSubtitleStore.getState();
    const subtitleId = seg.id.replace('subtitle_', '');
    const sorted = [...store.subtitles].sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((s) => s.id === subtitleId);
    if (idx <= 0) { setSegContextMenu(null); return; }
    const prev = sorted[idx - 1];
    const curr = sorted[idx];
    const mergedText = [prev.text, curr.text].filter(Boolean).join('\n');
    const newEndTime = curr.endTime;
    store.deleteSubtitle(curr.id);
    store.updateSubtitle(prev.id, { endTime: newEndTime, text: mergedText });
    setSegContextMenu(null);
  }, [segContextMenu]);

  // 컨텍스트 메뉴: 다음 싱크와 병합
  const handleCtxMergeNext = useCallback(() => {
    if (!segContextMenu?.segment) return;
    const seg = segContextMenu.segment;
    const store = useSubtitleStore.getState();
    const subtitleId = seg.id.replace('subtitle_', '');
    const sorted = [...store.subtitles].sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((s) => s.id === subtitleId);
    if (idx < 0 || idx >= sorted.length - 1) { setSegContextMenu(null); return; }
    const curr = sorted[idx];
    const next = sorted[idx + 1];
    const mergedText = [curr.text, next.text].filter(Boolean).join('\n');
    const newEndTime = next.endTime;
    store.deleteSubtitle(next.id);
    store.updateSubtitle(curr.id, { endTime: newEndTime, text: mergedText });
    setSegContextMenu(null);
  }, [segContextMenu]);

  // 컨텍스트 메뉴: 분할 모드 진입
  const handleCtxSplit = useCallback(() => {
    if (!segContextMenu?.segment) return;
    setSplitMode({ segment: segContextMenu.segment });
    setSegContextMenu(null);
  }, [segContextMenu]);

  // 분할 모드: 마우스 이동 시 커서 위치 추적
  const handleSplitMouseMove = useCallback((e) => {
    if (!splitMode || !zoomviewRef.current) return;
    const rect = zoomviewRef.current.getBoundingClientRect();
    setSplitCursorX(e.clientX - rect.left);
  }, [splitMode]);

  // 분할 모드: 클릭으로 분할 실행
  const handleSplitClick = useCallback((e) => {
    if (!splitMode || !peaksRef.current || !zoomviewRef.current) return;
    const zv = peaksRef.current.views.getView('zoomview');
    if (!zv) return;
    const rect = zoomviewRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const splitTime = zv.getStartTime() + (relX / rect.width) * (zv.getEndTime() - zv.getStartTime());
    const seg = splitMode.segment;
    if (splitTime <= seg.startTime || splitTime >= seg.endTime) {
      setSplitMode(null);
      setSplitCursorX(null);
      return;
    }
    const store = useSubtitleStore.getState();
    const subtitleId = seg.id.replace('subtitle_', '');
    const newId = store.splitSubtitleAtTime(subtitleId, splitTime);
    if (newId) {
      store.selectSubtitle(null);
      setTimeout(() => store.selectSubtitle(subtitleId), 0);
    }
    setSplitMode(null);
    setSplitCursorX(null);
  }, [splitMode]);

  // 분할 모드: ESC 또는 우클릭으로 취소
  const handleSplitCancel = useCallback((e) => {
    if (e?.type === 'contextmenu') e.preventDefault();
    setSplitMode(null);
    setSplitCursorX(null);
  }, []);

  // 분할 모드 활성 중 ESC 키로 취소 (window 레벨)
  useEffect(() => {
    if (!splitMode) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleSplitCancel(e);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [splitMode, handleSplitCancel]);

  // visibleRange 업데이트 헬퍼
  const updateVisibleRangeNow = useCallback(() => {
    if (!peaksRef.current) return;
    try {
      const zoomview = peaksRef.current.views.getView('zoomview');
      if (zoomview) {
        const start = zoomview.getStartTime();
        const end = zoomview.getEndTime();
        setVisibleRange(prev => {
          if (prev.start === start && prev.end === end) return prev;
          return { start, end };
        });
      }
    } catch {
      // 무시
    }
  }, []);

  // Policy A: 사용자 스크럽 핸들러 — wheel 핸들러 + peaks 'zoomview.scroll'(드래그) 두 경로 모두에서 호출.
  // useCallback 이지만 deps 가 비어있어 reference 가 안정적이며, 내부에서 ref 만 참조함.
  const beginScrub = useCallback(() => {
    if (isScrubbingRef.current) return;
    const media = mediaRef.current;
    if (!media || media.paused) return;
    isScrubbingRef.current = true;
    wasPlayingBeforeScrubRef.current = true;
    media.pause();
    // player.pause 이벤트 핸들러가 rAF 를 cancel 하지만, 즉시 멈추도록 명시적으로도 cancel
    if (centerScrollRafIdRef.current !== null) {
      cancelAnimationFrame(centerScrollRafIdRef.current);
      centerScrollRafIdRef.current = null;
    }
  }, []);

  const commitScrub = useCallback(() => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    scrubCommitTimerRef.current = null;
    const peaks = peaksRef.current;
    const media = mediaRef.current;
    if (!peaks || !media) return;
    try {
      const zv = peaks.views.getView('zoomview');
      if (!zv) return;
      const newCT = zv.getStartTime() + (zv.getEndTime() - zv.getStartTime()) / 2;
      usePlaybackStore.getState().setCurrentTime(newCT);
      media.currentTime = newCT;
      if (wasPlayingBeforeScrubRef.current) {
        wasPlayingBeforeScrubRef.current = false;
        // player.playing 이벤트가 centerScrollLoop 를 재시작함
        media.play().catch(() => {});
      }
    } catch { /* silent */ }
  }, []);

  const refreshScrubTimer = useCallback(() => {
    if (!isScrubbingRef.current) return;
    if (scrubCommitTimerRef.current !== null) {
      clearTimeout(scrubCommitTimerRef.current);
    }
    scrubCommitTimerRef.current = setTimeout(commitScrub, 200);
  }, [commitScrub]);

  const handleUserScroll = useCallback(() => {
    const media = mediaRef.current;
    if (!media || media.paused) return;
    beginScrub();
    refreshScrubTimer();
  }, [beginScrub, refreshScrubTimer]);

  // initPeaks 내부의 zoomview.scroll 리스너에서 사용 — 최신 reference 를 보장하기 위해 ref 경유
  const handleUserScrollRef = useRef(handleUserScroll);
  useEffect(() => {
    handleUserScrollRef.current = handleUserScroll;
  }, [handleUserScroll]);

  // 언마운트 시 스크럽 타이머 정리
  useEffect(() => {
    return () => {
      if (scrubCommitTimerRef.current !== null) {
        clearTimeout(scrubCommitTimerRef.current);
        scrubCommitTimerRef.current = null;
      }
    };
  }, []);

  // 파형 컨테이너에 휠 이벤트 리스너 추가 (passive: false 필요)
  useEffect(() => {
    const container = waveformContainerRef.current;
    if (!container || !isPeaksReady) return;

    const wheelHandler = (e) => {
      if (!peaksRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const zoomview = peaksRef.current.views.getView('zoomview');
      if (!zoomview) return;

      const dur = useSubtitleStore.getState().duration || 0;
      const visibleDuration = zoomview.getEndTime() - zoomview.getStartTime();
      const scrollStep = visibleDuration * 0.1;
      const delta = e.deltaY > 0 ? scrollStep : -scrollStep;
      const newStart = Math.max(0, Math.min(dur - visibleDuration, zoomview.getStartTime() + delta));

      zoomview.setStartTime(newStart);
      if (dur > 0) {
        const maxStart = dur - visibleDuration;
        setScrollPosition(maxStart > 0 ? (newStart / maxStart) * 100 : 0);
      }
      updateVisibleRangeNow();
      // Policy A: 재생 중이면 스크럽 시작/타이머 갱신 (setStartTime 은 'zoomview.scroll' 을
      // 발생시키지 않으므로 wheel 경로에서 명시적으로 호출 필요)
      handleUserScroll();
    };

    container.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [isPeaksReady, updateVisibleRangeNow, handleUserScroll]);


  // 현재 보이는 범위 업데이트
  const updateVisibleRange = useCallback(() => {
    if (!peaksRef.current) return;
    
    try {
      const zoomview = peaksRef.current.views.getView('zoomview');
      if (zoomview) {
        const start = zoomview.getStartTime();
        const end = zoomview.getEndTime();
        const duration = useSubtitleStore.getState().duration;
        setVisibleRange(prev => {
          if (prev.start === start && prev.end === end) return prev;
          return { start, end };
        });
        if (duration > 0) {
          const maxStart = duration - (end - start);
          setScrollPosition(prev => {
            const newPos = maxStart > 0 ? (start / maxStart) * 100 : 0;
            return Math.abs(prev - newPos) < 0.01 ? prev : newPos;
          });
        }
      }
    } catch {
      // 무시
    }
  }, []);

  // 스크롤 위치 변경 시 파형 뷰 업데이트
  const handleScrollChange = useCallback((e) => {
    if (!peaksRef.current) return;
    
    const newPosition = parseFloat(e.target.value);
    const duration = useSubtitleStore.getState().duration;
    
    try {
      const zoomview = peaksRef.current.views.getView('zoomview');
      if (zoomview && typeof zoomview.setStartTime === 'function') {
        const visibleDuration = zoomview.getEndTime() - zoomview.getStartTime();
        const maxStart = duration - visibleDuration;
        const newStartTime = (newPosition / 100) * maxStart;
        zoomview.setStartTime(Math.max(0, newStartTime));
        setScrollPosition(newPosition);
        updateVisibleRange();
      }
    } catch (err) {
      console.error('스크롤 오류:', err);
    }
  }, [updateVisibleRange]);

  // 줌 변경 시 스크롤 범위 업데이트
  useEffect(() => {
    if (isPeaksReady) {
      updateVisibleRange();
    }
  }, [isPeaksReady, zoomLevel, updateVisibleRange]);


  // 더보기 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e) => {
      if (
        moreMenuRef.current && !moreMenuRef.current.contains(e.target) &&
        moreButtonRef.current && !moreButtonRef.current.contains(e.target)
      ) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  // 캐시 정보 상태
  const [showCacheInfo, setShowCacheInfo] = useState(false);
  const [cacheInfo, setCacheInfoState] = useState(null);
  const [cachePopupPosition, setCachePopupPosition] = useState({ top: 0, right: 0 });
  
  // 캐시 정보 조회
  const handleShowCacheInfo = async () => {
    if (showCacheInfo) {
      setShowCacheInfo(false);
      return;
    }
    
    // 더보기 버튼 위치를 기준으로 팝업 위치 계산
    if (moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setCachePopupPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    
    const info = await getCacheInfo();
    setCacheInfoState(info);
    setShowCacheInfo(true);
  };
  
  // 캐시 전체 삭제
  const handleClearCache = async () => {
    const confirmed = await confirm(t('waveform.deleteAllCacheConfirm'), {
      title: t('waveform.deleteCacheTitle'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      await clearAllWaveformCache();
      const info = await getCacheInfo();
      setCacheInfoState(info);
    }
  };
  
  // 현재 파일 캐시 삭제
  const handleClearCurrentFileCache = async () => {
    const store = useSubtitleStore.getState();
    const cacheKey = generateCacheKey(mediaFileName, mediaFileSize, store.isServerFile);
    
    if (!cacheKey) {
      toast.warning(t('waveform.currentCacheNotFound'));
      return;
    }
    
    const confirmed = await confirm(t('waveform.deleteCurrentCacheConfirm', { fileName: mediaFileName }), {
      title: t('waveform.deleteCurrentCache'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    
    if (confirmed) {
      await deleteCachedWaveform(cacheKey);
      const info = await getCacheInfo();
      setCacheInfoState(info);
      setCacheStatus(null);
    }
  };
  
  // 개별 캐시 항목 삭제
  const handleDeleteCacheItem = async (cacheId, fileName) => {
    const confirmed = await confirm(t('waveform.deleteCacheItemConfirm', { fileNameOrId: fileName || cacheId }), {
      title: t('waveform.deleteCacheItemTitle'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    
    if (confirmed) {
      await deleteCachedWaveform(cacheId);
      const info = await getCacheInfo();
      setCacheInfoState(info);
    }
  };

  // 파형 재시도
  const handleRetryWaveform = useCallback(() => {
    // 초기화 상태 리셋
    isInitializedRef.current = false;
    setError(null);
    setIsPeaksReady(false);
    
    // Peaks.js 정리
    if (peaksRef.current) {
      try {
        peaksRef.current.destroy();
      } catch (err) {
        console.warn('Peaks.js 정리 중 오류:', err);
      }
      peaksRef.current = null;
    }
    
    // 강제 리렌더링을 위해 상태 변경
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 100);
  }, []);

  // 캐시 삭제 후 재시도
  const handleClearCacheAndRetry = async () => {
    const store = useSubtitleStore.getState();
    const cacheKey = generateCacheKey(mediaFileName, mediaFileSize, store.isServerFile);
    
    if (cacheKey) {
      await deleteCachedWaveform(cacheKey);
      setCacheStatus(null);
    }
    
    handleRetryWaveform();
  };

  // 파형 재생성 후 서버에 업로드
  // 파이프라인: MinIO 다운로드 URL → mp4box+WebCodecs 직접 파싱 → 파형 생성 → 서버 업로드
  const regenerateAndUploadWaveform = useCallback(async () => {
    const store = useSubtitleStore.getState();
    if (!store.fileId) return;

    const confirmed = await confirm(
      t('waveform.regenerateAndUploadConfirmTitle'),
      t('waveform.regenerateAndUploadConfirmMessage'),
    );
    if (!confirmed) return;

    setIsRegenerating(true);
    setStreamingProgress(0);

    const abortController = new AbortController();
    regenerateAbortRef.current = abortController;

    try {
      // 1단계: MinIO 다운로드 URL 확보
      setLoadingMessage(t('waveform.downloadingFile'));
      const dlRes = await getFileDownloadUrl(store.fileId);
      if (dlRes?.status !== 'SUCCESS' && dlRes?.status !== 'success') {
        throw new Error('파일 다운로드 URL 발급 실패');
      }
      const downloadUrl = dlRes.data?.url || dlRes.data?.downloadUrl;
      if (!downloadUrl) throw new Error('다운로드 URL이 없습니다.');
      setStreamingProgress(10);

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // 2단계: MP4에서 직접 파형 생성 (mp4box + WebCodecs, 컨테이너 타이밍 보존)
      setLoadingMessage(t('waveform.regeneratingWaveform'));
      const configuredSamplesPerPixel = waveformSettings?.samplesPerPixel || 64;
      let waveformResult;

      const fileName = dlRes.data?.fileName || dlRes.data?.downloadFileName || mediaFileName || 'media';

      if (isWebCodecsSupported() && isMP4Container(fileName, mediaType)) {
        waveformResult = await generateStreamingWaveform(downloadUrl, {
          samplesPerPixel: configuredSamplesPerPixel,
          signal: abortController.signal,
          onProgress: (p) => setStreamingProgress(10 + p * 0.7),
          onPeaksUpdate: () => {},
        });
      } else if (isWebCodecsSupported() && isMP3File(fileName, mediaType)) {
        waveformResult = await generateStreamingWaveformForMP3(downloadUrl, {
          samplesPerPixel: configuredSamplesPerPixel,
          signal: abortController.signal,
          onProgress: (p) => setStreamingProgress(10 + p * 0.7),
          onPeaksUpdate: () => {},
        });
      } else if (isWAVFile(fileName, mediaType)) {
        waveformResult = await generateStreamingWaveformForWAV(downloadUrl, {
          samplesPerPixel: configuredSamplesPerPixel,
          signal: abortController.signal,
          onProgress: (p) => setStreamingProgress(10 + p * 0.7),
          onPeaksUpdate: () => {},
        });
      } else {
        // WebCodecs 미지원 또는 기타 포맷: 파일 다운로드 후 decodeAudioData
        const response = await fetch(downloadUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(`파일 다운로드 실패 (HTTP ${response.status})`);
        const fileBuffer = await response.arrayBuffer();
        setStreamingProgress(40);

        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(fileBuffer);
        const ch = decoded.getChannelData(0);
        const peaks = [];
        for (let i = 0; i < ch.length; i += configuredSamplesPerPixel) {
          let min = Infinity, max = -Infinity;
          const end = Math.min(i + configuredSamplesPerPixel, ch.length);
          for (let j = i; j < end; j++) {
            if (ch[j] < min) min = ch[j];
            if (ch[j] > max) max = ch[j];
          }
          peaks.push({ min, max });
        }
        ctx.close();
        waveformResult = { peaks, sampleRate: decoded.sampleRate, samplesPerPixel: configuredSamplesPerPixel };
      }
      setStreamingProgress(80);

      if (!waveformResult?.peaks?.length) {
        throw new Error('파형 데이터가 비어 있습니다.');
      }

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // 4단계: 파형 데이터를 서버에 업로드
      setLoadingMessage(t('waveform.uploadingWaveform'));
      const jsonData = convertToWaveformData(
        waveformResult.peaks,
        waveformResult.sampleRate,
        waveformResult.samplesPerPixel,
      );
      const arrayBuffer = waveformToArrayBuffer(jsonData);

      await uploadWaveformToServer(store.fileId, arrayBuffer, {
        signal: abortController.signal,
      });
      setStreamingProgress(95);

      // 5단계: 로컬 캐시 갱신
      const cacheKey = generateCacheKey(mediaFileName, mediaFileSize, true);
      if (cacheKey) {
        await deleteCachedWaveform(cacheKey);
        await cacheWaveform(cacheKey, arrayBuffer, {
          fileName: mediaFileName,
          fileSize: mediaFileSize,
          isServerFile: true,
        });
      }
      setStreamingProgress(100);

      toast.success(t('waveform.uploadSuccess'));

      // Peaks.js 정리 후 재초기화 트리거
      if (peaksRef.current) {
        try { peaksRef.current.destroy(); } catch {}
        peaksRef.current = null;
      }
      isInitializedRef.current = false;
      setIsPeaksReady(false);
      setReinitCounter((c) => c + 1);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('파형 재생성/업로드 실패:', err);
      toast.error(`${t('waveform.uploadFailed')}: ${err.message}`);
    } finally {
      setIsRegenerating(false);
      regenerateAbortRef.current = null;
    }
  }, [mediaFileName, mediaFileSize, waveformSettings, t]);

  // 파형 데이터 내보내기
  const exportWaveformData = () => {
    if (!peaksRef.current) return;

    try {
      const waveformData = {
        version: 2,
        channels: 1,
        sample_rate: 44100,
        samples_per_pixel: zoomLevel,
        bits: 8,
        length: 0,
        data: [],
      };

      const view = peaksRef.current.views.getView('zoomview');
      if (view) {
        waveformData.data = [];
      }

      const jsonStr = JSON.stringify(waveformData);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'waveform.json';
      a.click();
      URL.revokeObjectURL(url);

      setWaveformData(waveformData);
    } catch (err) {
      console.error('파형 데이터 내보내기 오류:', err);
    }
  };

  // 세그먼트 전체 드래그 시작 (햄버거 버튼 + 롱프레스 공용)
  const startSegmentDrag = useCallback((seg, startClientX) => {
    if (!seg || !peaksRef.current || !zoomviewRef.current) return;
    const origStart = seg.startTime;
    const origEnd = seg.endTime;
    const segLen = origEnd - origStart;
    const prevBodyCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    setIsSegmentDragging(true);

    const onMove = (ev) => {
      const zv = peaksRef.current?.views?.getView('zoomview');
      if (!zv || !zoomviewRef.current) return;
      const rect = zoomviewRef.current.getBoundingClientRect();
      const visibleDuration = zv.getEndTime() - zv.getStartTime();
      const deltaTime = ((ev.clientX - startClientX) / rect.width) * visibleDuration;
      const dur = useSubtitleStore.getState().duration || 0;
      let newStart = origStart + deltaTime;
      newStart = Math.max(0, Math.min(dur - segLen, newStart));
      seg.update({ startTime: newStart, endTime: newStart + segLen });
      const midTime = newStart + segLen / 2;
      const viewStart = zv.getStartTime();
      const relX = ((midTime - viewStart) / visibleDuration) * rect.width;
      setDeleteButtonPosition({
        x: Math.min(Math.max(relX, 30), rect.width - 30),
        y: 10,
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevBodyCursor;
      setIsSegmentDragging(false);
      setLongPressSegmentId(null);
      const store = useSubtitleStore.getState();
      const subtitleId = seg.id.replace('subtitle_', '');
      const matchSub = store.subtitles.find((s) => s.id === subtitleId);
      const gap = getMinGap();
      const finalStart = seg.startTime;
      const finalEnd = seg.endTime;
      const hasCollision = store.subtitles.some((s) => {
        if (s.id === subtitleId) return false;
        return finalStart < s.endTime + gap && finalEnd > s.startTime - gap;
      });
      if (hasCollision) {
        seg.update({ startTime: origStart, endTime: origEnd });
      } else if (matchSub) {
        store.updateSubtitle(matchSub.id, { startTime: finalStart, endTime: finalEnd });
      }
      setHoveredSegment(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // 세그먼트 좌/우 경계 리사이즈
  const resizeHoverRef = useRef(null); // { subtitleId, side } | null
  const [resizeCursor, setResizeCursor] = useState(null); // 'ew-resize' | null
  const EDGE_THRESHOLD_PX = 6;

  const findEdgeHover = useCallback((clientX, clientY) => {
    const peaks = peaksRef.current;
    const wrapperEl = zoomviewRef.current;
    if (!peaks || !wrapperEl) return null;
    const zv = peaks.views.getView('zoomview');
    if (!zv) return null;
    const rect = wrapperEl.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) return null;
    const visibleDuration = zv.getEndTime() - zv.getStartTime();
    const viewStart = zv.getStartTime();
    const px = clientX - rect.left;
    const pxToTime = (p) => viewStart + (p / rect.width) * visibleDuration;
    const timeToPx = (t) => ((t - viewStart) / visibleDuration) * rect.width;
    const subs = useSubtitleStore.getState().subtitles;
    let best = null;
    for (const sub of subs) {
      const sx = timeToPx(sub.startTime);
      const ex = timeToPx(sub.endTime);
      if (ex < -EDGE_THRESHOLD_PX || sx > rect.width + EDGE_THRESHOLD_PX) continue;
      if (Math.abs(px - sx) <= EDGE_THRESHOLD_PX) {
        best = { subtitleId: sub.id, side: 'start' };
        break;
      }
      if (Math.abs(px - ex) <= EDGE_THRESHOLD_PX) {
        best = { subtitleId: sub.id, side: 'end' };
        break;
      }
    }
    return best;
  }, []);

  const startSegmentResize = useCallback((side, subtitleId, startClientX) => {
    const peaks = peaksRef.current;
    if (!peaks || !zoomviewRef.current) return;
    const seg = peaks.segments.getSegment(`subtitle_${subtitleId}`);
    if (!seg) return;
    const origStart = seg.startTime;
    const origEnd = seg.endTime;
    const prevBodyCursor = document.body.style.cursor;
    document.body.style.cursor = 'ew-resize';
    setIsSegmentDragging(true);

    const onMove = (ev) => {
      const zv = peaks.views.getView('zoomview');
      if (!zv || !zoomviewRef.current) return;
      const rect = zoomviewRef.current.getBoundingClientRect();
      const visibleDuration = zv.getEndTime() - zv.getStartTime();
      const deltaTime = ((ev.clientX - startClientX) / rect.width) * visibleDuration;
      const store = useSubtitleStore.getState();
      const dur = store.duration || 0;
      const gap = getMinGap();
      const sorted = [...store.subtitles].sort((a, b) => a.startTime - b.startTime);
      const idx = sorted.findIndex((s) => s.id === subtitleId);
      const prevSub = idx > 0 ? sorted[idx - 1] : null;
      const nextSub = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
      if (side === 'start') {
        let newStart = origStart + deltaTime;
        const minStart = prevSub ? prevSub.endTime + gap : 0;
        newStart = Math.max(minStart, Math.min(origEnd - 0.05, newStart));
        seg.update({ startTime: newStart });
      } else {
        let newEnd = origEnd + deltaTime;
        const maxEnd = nextSub ? nextSub.startTime - gap : dur;
        newEnd = Math.max(origStart + 0.05, Math.min(maxEnd, newEnd));
        seg.update({ endTime: newEnd });
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevBodyCursor;
      setIsSegmentDragging(false);
      useSubtitleStore.getState().updateSubtitle(subtitleId, {
        startTime: seg.startTime,
        endTime: seg.endTime,
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // 붙어있는 경계 호버 감지
  const findTouchingBoundary = useCallback((clientX, clientY) => {
    const peaks = peaksRef.current;
    const wrapperEl = zoomviewRef.current;
    if (!peaks || !wrapperEl) return null;
    const zv = peaks.views.getView('zoomview');
    if (!zv) return null;
    const rect = wrapperEl.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) return null;
    const visibleDuration = zv.getEndTime() - zv.getStartTime();
    const viewStart = zv.getStartTime();
    const px = clientX - rect.left;
    const timeToPx = (t) => ((t - viewStart) / visibleDuration) * rect.width;
    const sorted = [...useSubtitleStore.getState().subtitles].sort((a, b) => a.startTime - b.startTime);
    const THRESH = 3;
    const py = clientY - rect.top;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (Math.abs(next.startTime - prev.endTime) < 0.001) {
        const bx = timeToPx(prev.endTime);
        if (bx < -THRESH || bx > rect.width + THRESH) continue;
        if (Math.abs(px - bx) <= THRESH) {
          return { x: px, y: py, boundaryTime: prev.endTime, prevId: prev.id, nextId: next.id };
        }
      }
    }
    return null;
  }, []);

  // 붙어있는 경계에서 3-옵션 드래그
  const startBoundaryDrag = useCallback((mode, popup, startClientX) => {
    const peaks = peaksRef.current;
    if (!peaks || !zoomviewRef.current) return;
    const prevSeg = peaks.segments.getSegment(`subtitle_${popup.prevId}`);
    const nextSeg = peaks.segments.getSegment(`subtitle_${popup.nextId}`);
    if (!prevSeg || !nextSeg) return;
    const origBoundary = prevSeg.endTime;
    const origPrevStart = prevSeg.startTime;
    const origNextEnd = nextSeg.endTime;
    const prevBodyCursor = document.body.style.cursor;
    document.body.style.cursor = 'ew-resize';
    setIsSegmentDragging(true);
    setBoundaryPopup(null);

    const onMove = (ev) => {
      const zv = peaks.views.getView('zoomview');
      if (!zv || !zoomviewRef.current) return;
      const rect = zoomviewRef.current.getBoundingClientRect();
      const visibleDuration = zv.getEndTime() - zv.getStartTime();
      const deltaTime = ((ev.clientX - startClientX) / rect.width) * visibleDuration;
      let newBoundary = origBoundary + deltaTime;
      const minB = origPrevStart + 0.05;
      const maxB = origNextEnd - 0.05;
      newBoundary = Math.max(minB, Math.min(maxB, newBoundary));
      if (mode === 'left') {
        // prev.end 이동, next.start는 원래 자리 유지 (오른쪽으로 밀릴 때만 next가 같이 shrink)
        const prevEnd = newBoundary;
        const nextStart = Math.max(origBoundary, prevEnd);
        prevSeg.update({ endTime: prevEnd });
        nextSeg.update({ startTime: nextStart });
      } else if (mode === 'right') {
        // next.start 이동, prev.end는 원래 자리 유지 (왼쪽으로 밀릴 때만 prev가 같이 shrink)
        const nextStart = newBoundary;
        const prevEnd = Math.min(origBoundary, nextStart);
        prevSeg.update({ endTime: prevEnd });
        nextSeg.update({ startTime: nextStart });
      } else {
        // middle: 경계가 통째로 이동 (두 자막은 붙어있는 상태 유지).
        // peaks.js v4 의 segments.update 이벤트 → SegmentsLayer._onSegmentsUpdate 경로가
        // 같은 frame 내 두 segment 중 한쪽 (특히 expand 되는 쪽) 을 누락하는 케이스가 있어
        // 데이터 업데이트 후 SegmentShape 을 직접 재갱신하고 layer 를 명시적으로 redraw 한다.
        if (newBoundary > origBoundary) {
          nextSeg.update({ startTime: newBoundary });
          prevSeg.update({ endTime: newBoundary });
        } else {
          prevSeg.update({ endTime: newBoundary });
          nextSeg.update({ startTime: newBoundary });
        }
        try {
          const layer = zv.getSegmentsLayer && zv.getSegmentsLayer();
          if (layer) {
            const prevShape =
              layer.getSegmentShape && layer.getSegmentShape(prevSeg);
            const nextShape =
              layer.getSegmentShape && layer.getSegmentShape(nextSeg);
            if (prevShape && prevShape.update) prevShape.update();
            if (nextShape && nextShape.update) nextShape.update();
            if (layer.draw) layer.draw();
          }
        } catch (_) { /* ignore */ }
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevBodyCursor;
      setIsSegmentDragging(false);
      const store = useSubtitleStore.getState();
      // 경계가 우측으로 이동한 경우 prev 를 먼저 반영하면 store 의 resolveOverlap 이
      // 아직 갱신되지 않은 next (옛 startTime) 와 겹친다고 판단해 prev.endTime 을
      // 되돌린다. 경계 이동 방향에 따라 store 반영 순서를 조정한다.
      const prevPayload = { startTime: prevSeg.startTime, endTime: prevSeg.endTime };
      const nextPayload = { startTime: nextSeg.startTime, endTime: nextSeg.endTime };
      if (prevSeg.endTime > origBoundary) {
        store.updateSubtitle(popup.nextId, nextPayload);
        store.updateSubtitle(popup.prevId, prevPayload);
      } else {
        store.updateSubtitle(popup.prevId, prevPayload);
        store.updateSubtitle(popup.nextId, nextPayload);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const handleWrapperMouseMove = useCallback((e) => {
    if (isSegmentDragging) return;
    const touching = findTouchingBoundary(e.clientX, e.clientY);
    if (touching) {
      resizeHoverRef.current = null;
      setResizeCursor(null);
      setBoundaryPopup((cur) => {
        if (cur && cur.prevId === touching.prevId && cur.nextId === touching.nextId) return cur;
        return touching;
      });
      return;
    }
    const hover = findEdgeHover(e.clientX, e.clientY);
    resizeHoverRef.current = hover;
    setResizeCursor(hover ? 'ew-resize' : null);
    // 팝업이 떠 있을 때, 팝업 위에 있지 않고 팝업 x로부터 멀어졌으면 제거 (경계~팝업 사이 이동은 허용)
    const wrapperEl = zoomviewRef.current;
    if (boundaryPopup && !isPopupHoveredRef.current && wrapperEl) {
      const rect = wrapperEl.getBoundingClientRect();
      const px = e.clientX - rect.left;
      if (Math.abs(px - boundaryPopup.x) > 6) {
        setBoundaryPopup(null);
      }
    }
  }, [findEdgeHover, findTouchingBoundary, isSegmentDragging, boundaryPopup]);

  // 세그먼트 위에서 1초 롱프레스 시 드래그 시작
  const handleWrapperMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.segment-drag-handle')) return;
    const edge = resizeHoverRef.current;
    if (edge) {
      e.preventDefault();
      e.stopPropagation();
      startSegmentResize(edge.side, edge.subtitleId, e.clientX);
      return;
    }
    const seg = hoveredSegmentRef.current;
    if (!seg) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const segId = seg.id;
    let cancelled = false;
    const cleanup = () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('mouseup', cleanup);
      document.removeEventListener('mousemove', onCheckMove);
      setLongPressSegmentId((cur) => (cur === segId ? null : cur));
    };
    const onCheckMove = (ev) => {
      if (Math.abs(ev.clientX - startClientX) > 5 || Math.abs(ev.clientY - startClientY) > 5) {
        cleanup();
      }
    };
    const timer = setTimeout(() => {
      if (cancelled) return;
      document.removeEventListener('mouseup', cleanup);
      document.removeEventListener('mousemove', onCheckMove);
      startSegmentDrag(seg, startClientX);
    }, 600);
    setLongPressSegmentId(segId);
    document.addEventListener('mouseup', cleanup);
    document.addEventListener('mousemove', onCheckMove);
  }, [startSegmentDrag, startSegmentResize]);

  if (!mediaUrl) {
    return (
      <div className="waveform-viewer-placeholder">
        <p>{t('waveform.openMediaGuide')}</p>
      </div>
    );
  }

  return (
    <div className="waveform-viewer">
      <div className="waveform-controls">
        {/* 줌 컨트롤 */}
        <div className="zoom-control-group">
          <button onClick={handleZoomOut} title={t('waveform.zoomOutTitle')}>−</button>
          <span className="zoom-level">x{Math.round(4096 / zoomLevel)}</span>
          <button onClick={handleZoomIn} title={t('waveform.zoomInTitle')}>+</button>
        </div>

        {/* 증폭 컨트롤 */}
        <div className="amplitude-control-group">
          <span className="amplitude-label" title={t('waveform.amplitudeTitle')}>
            {t('waveform.amplitudeLabel')}
          </span>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={waveformSettings?.amplitudeScale || 1.0}
            onChange={(e) => setSetting('amplitudeScale', parseFloat(e.target.value))}
            className="amplitude-slider"
            title={t('waveform.amplitudeTitle')}
          />
          <span className="amplitude-value">
            {(waveformSettings?.amplitudeScale || 1.0).toFixed(1)}x
          </span>
          {waveformSettings?.amplitudeScale !== 1.0 && (
            <button
              className="amplitude-reset-btn"
              onClick={() => setSetting('amplitudeScale', 1.0)}
              title={t('waveform.amplitudeReset')}
            >
              ↺
            </button>
          )}
        </div>

        {/* 더보기 메뉴 */}
        <div className="more-menu-wrapper">
          <button
            ref={moreButtonRef}
            className={`more-menu-btn ${showMoreMenu ? 'active' : ''}`}
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title={t('waveform.moreTitle')}
          >
            ···
          </button>
          {showMoreMenu && (
            <div className="more-dropdown" ref={moreMenuRef}>
              <button
                className={`more-dropdown-item ${showTimeGrid ? 'checked' : ''}`}
                onClick={() => { setShowTimeGrid((prev) => !prev); }}
              >
                {showTimeGrid && <span className="check-icon">✓</span>}
                <span>{t('waveform.timeGrid')}</span>
              </button>

              {sceneChanges.length > 0 && (
                <>
                  <div className="more-dropdown-divider" />
                  <button
                    className={`more-dropdown-item ${showSceneMarkers ? 'checked' : ''}`}
                    onClick={() => { setShowSceneMarkers(!showSceneMarkers); }}
                  >
                    {showSceneMarkers && <span className="check-icon">✓</span>}
                    <span>{t('waveform.sceneMarkers', { count: sceneChanges.length })}</span>
                  </button>
                </>
              )}

              <div className="more-dropdown-divider" />
              <button
                className="more-dropdown-item"
                onClick={() => { setShowMoreMenu(false); handleShowCacheInfo(); }}
              >
                <span>{t('waveform.cacheManagement')}</span>
              </button>
              <button
                className="more-dropdown-item"
                onClick={() => { setShowMoreMenu(false); exportWaveformData(); }}
                disabled={!isPeaksReady}
              >
                <span>{t('waveform.exportWaveform')}</span>
              </button>
              <div className="more-dropdown-divider" />
              <button
                className="more-dropdown-item"
                onClick={() => { setShowMoreMenu(false); regenerateAndUploadWaveform(); }}
                disabled={isRegenerating}
                title={t('waveform.regenerateAndUploadTooltip')}
              >
                <span>{isRegenerating ? t('waveform.uploadingWaveform') : t('waveform.regenerateAndUpload')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 캐시 정보 팝업 (더보기 메뉴에서 열림) */}
      {showCacheInfo && cacheInfo && (
        <div 
          className="cache-info-popup"
          style={{
            position: 'fixed',
            top: cachePopupPosition.top,
            right: cachePopupPosition.right,
          }}
        >
          <div className="cache-info-header">
            <span>{t('waveform.cacheInfo')}</span>
            <button onClick={() => setShowCacheInfo(false)}>✕</button>
          </div>
          <div className="cache-info-content">
            <div className="cache-stat">
              <span>{t('waveform.savedWaveforms')}</span>
              <strong>{t('waveform.itemCount', { count: cacheInfo.count })}</strong>
            </div>
            <div className="cache-stat">
              <span>{t('waveform.totalSize')}</span>
              <strong>{formatBytes(cacheInfo.totalSize)}</strong>
            </div>
            {cacheInfo.items.length > 0 && (
              <div className="cache-list">
                {cacheInfo.items.map((item, idx) => {
                  const store = useSubtitleStore.getState();
                  const currentCacheKey = generateCacheKey(mediaFileName, mediaFileSize, store.isServerFile);
                  const isCurrentFile = item.id === currentCacheKey;
                  return (
                    <div key={idx} className={`cache-item ${isCurrentFile ? 'current' : ''}`}>
                      <span className="cache-item-name" title={item.fileName}>
                        {isCurrentFile && <span className="current-badge">●</span>}
                        {item.fileName || t('common.unknown')}
                      </span>
                      <span className="cache-item-size">
                        {formatBytes(item.dataSize)}
                      </span>
                      <button
                        className="cache-item-delete"
                        onClick={() => handleDeleteCacheItem(item.id, item.fileName)}
                        title={t('waveform.deleteItemTitle')}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="cache-actions">
              <button 
                onClick={exportWaveformData} 
                className="cache-export-btn"
                title={t('waveform.exportWaveformTooltip')}
                disabled={!isPeaksReady}
              >
                {t('waveform.saveWaveform')}
              </button>
              {mediaFileName && (
                <button 
                  onClick={handleClearCurrentFileCache} 
                  className="cache-current-btn"
                  title={t('waveform.deleteCurrentCacheDesc')}
                >
                  {t('waveform.deleteCurrentCache')}
                </button>
              )}
              <button 
                onClick={handleClearCache} 
                className="cache-clear-btn"
                disabled={cacheInfo.count === 0}
              >
                {t('waveform.deleteAllButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 로딩 표시 (스트리밍 중에는 Canvas가 진행률을 표시하므로 숨김) */}
      {isLoading && !isStreaming && !isRegenerating && (
        <div className="waveform-loading">
          <div className="spinner"></div>
          <span>{loadingMessage}</span>
          {cacheStatus === 'hit' && <span className="cache-badge hit">⚡ {t('waveform.cacheBadgeHit')}</span>}
        </div>
      )}

      {/* 파형 재생성+서버 업로드 진행 표시 */}
      {isRegenerating && (
        <div className="waveform-loading">
          <div className="spinner"></div>
          <span>{loadingMessage}</span>
          {streamingProgress > 0 && streamingProgress < 100 && (
            <span className="cache-badge">{Math.round(streamingProgress)}%</span>
          )}
          <button
            className="error-btn"
            onClick={() => regenerateAbortRef.current?.abort()}
            style={{ marginLeft: 8 }}
          >
            {t('waveform.cancel')}
          </button>
        </div>
      )}

      {error && (
        <div className="waveform-error">
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
          <div className="error-actions">
            <button onClick={handleClearCacheAndRetry} className="error-btn clear-cache">
              🔄 {t('waveform.deleteCacheRetry')}
            </button>
          </div>
        </div>
      )}

      <div 
        ref={waveformContainerRef}
        className="waveform-container"
      >
        <div
          className={`zoomview-wrapper ${longPressSegmentId ? 'long-pressing' : ''} ${isSegmentDragging ? 'segment-dragging' : ''} ${resizeCursor ? 'edge-resize' : ''}`}
          onMouseLeave={() => { setHoveredSegment(null); setResizeCursor(null); resizeHoverRef.current = null; setBoundaryPopup(null); }}
          onMouseDown={handleWrapperMouseDown}
          onMouseMove={handleWrapperMouseMove}
        >
          {/* 스트리밍 중: Canvas 기반 점진적 파형 표시 (ref 기반 업데이트) */}
          {isStreaming && (
            <StreamingWaveformCanvas
              ref={streamingCanvasRef}
              progress={streamingProgress}
              duration={duration}
              colors={waveformColors}
              expectedPeaksCount={expectedPeaksCount}
              renderMode={waveformSettings?.renderMode || 'bar'}
              lineWidth={waveformSettings?.lineWidth || 1.5}
              amplitudeScale={waveformSettings?.amplitudeScale || 1.0}
              onClick={(time) => {
                if (mediaRef.current) {
                  mediaRef.current.currentTime = time;
                }
                usePlaybackStore.getState().setCurrentTime(time);
              }}
            />
          )}
          {/* zoomview는 항상 렌더링하여 Peaks.js 초기화 시 컨테이너 크기를 보장
              스트리밍 중에는 visibility: hidden으로 숨기되 레이아웃 공간은 유지
              라인 모드에서는 파형만 숨기고 세그먼트는 표시 */}
          <div
            ref={zoomviewRef}
            className={`zoomview ${isPanning ? 'panning' : ''} ${waveformSettings?.renderMode === 'line' ? 'line-mode' : ''}`}
            style={{
              visibility: isStreaming ? 'hidden' : 'visible',
              position: isStreaming ? 'absolute' : 'relative',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          ></div>
          
          {/* 시간 격자 오버레이 - 스트리밍/패닝 중에는 숨김 */}
          {isPeaksReady && !isStreaming && showTimeGrid && !isPanning && (
            <TimeGridOverlay visibleRange={visibleRange} />
          )}
          
          {/* 라인 모드 파형 오버레이 */}
          {isPeaksReady && !isStreaming && waveformSettings?.renderMode === 'line' && peaksRef.current && (
            <LineWaveformOverlay
              peaksInstance={peaksRef.current}
              visibleRange={visibleRange}
              colors={waveformColors}
              lineWidth={waveformSettings?.lineWidth || 1.5}
              duration={duration}
              amplitudeScale={waveformSettings?.amplitudeScale || 1.0}
            />
          )}
          
          {/* 붙어있는 경계 3-옵션 팝업 */}
          {boundaryPopup && !isSegmentDragging && !isStreaming && (
            <div
              className="boundary-popup"
              style={{ left: `${boundaryPopup.x}px`, top: `${boundaryPopup.y}px` }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => { isPopupHoveredRef.current = true; }}
              onMouseLeave={() => { isPopupHoveredRef.current = false; setBoundaryPopup(null); }}
            >
              <button
                title={t('waveform.boundaryLeft', '왼쪽(앞) 세그먼트 조정')}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  startBoundaryDrag('left', boundaryPopup, e.clientX);
                }}
              >◀</button>
              <button
                title={t('waveform.boundaryMiddle', '같이 이동')}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  startBoundaryDrag('middle', boundaryPopup, e.clientX);
                }}
              >↔</button>
              <button
                title={t('waveform.boundaryRight', '오른쪽(뒤) 세그먼트 조정')}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  startBoundaryDrag('right', boundaryPopup, e.clientX);
                }}
              >▶</button>
            </div>
          )}

          {/* 장면 전환 마커 (세로줄) - 스트리밍/패닝 중에는 숨김 */}
          {isPeaksReady && !isStreaming && showSceneMarkers && !isPanning && sceneChanges.map((time, index) => {
            const visibleDuration = visibleRange.end - visibleRange.start;
            if (visibleDuration <= 0) return null;
            if (time < visibleRange.start || time > visibleRange.end) return null;
            
            const leftPercent = ((time - visibleRange.start) / visibleDuration) * 100;
            
            return (
              <div
                key={`scene-${index}`}
                className="scene-change-marker"
                style={{ 
                  left: `${leftPercent}%`,
                  '--scene-marker-color': waveformColors.sceneMarkerColor,
                }}
                title={t('waveform.sceneTransitionTitle', { index: index + 1 })}
              />
            );
          })}
          
          {/* 세그먼트 컨텍스트 메뉴 */}
          {segContextMenu && (
            <>
              <div className="seg-ctx-backdrop" onClick={() => setSegContextMenu(null)} />
              <div
                className="seg-context-menu"
                style={{ left: segContextMenu.x, top: segContextMenu.y }}
              >
                <button onClick={handleCtxDelete}>{t('waveform.ctxDelete')}</button>
                <button onClick={handleCtxMergePrev}>{t('waveform.ctxMergePrev')}</button>
                <button onClick={handleCtxMergeNext}>{t('waveform.ctxMergeNext')}</button>
                <button onClick={handleCtxSplit}>{t('waveform.ctxSplit')}</button>
              </div>
            </>
          )}

          {/* 분할 모드: 커서 표시 */}
          {splitMode && (
            <div
              className="split-mode-overlay"
              onMouseMove={handleSplitMouseMove}
              onClick={handleSplitClick}
              onContextMenu={handleSplitCancel}
            >
              {splitCursorX !== null && (
                <div className="split-cursor" style={{ left: splitCursorX }} />
              )}
              <div className="split-mode-hint">{t('waveform.splitModeHint')}</div>
            </div>
          )}
        </div>

        {/* 자막 스트립 (파형 아래, 스크롤바 위) */}
        <div className="subtitle-strip">
          {isPeaksReady && !isStreaming && !isPanning && visibleSubtitles.map((subtitle) => (
            <SubtitleOverlayLabel
              key={subtitle.id}
              subtitle={subtitle}
              visibleRange={visibleRange}
            />
          ))}
        </div>

        {/* 수평 스크롤바 */}
        <div className="waveform-scrollbar">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={scrollPosition}
            onChange={handleScrollChange}
            className="scroll-slider"
            style={{
              '--thumb-width': `${Math.max(5, Math.min(100, ((visibleRange.end - visibleRange.start) / (useSubtitleStore.getState().duration || 1)) * 100))}%`,
            }}
          />
        </div>
      </div>
      
    </div>
  );
}

export default memo(WaveformViewer);
