import { useRef, useEffect, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import { usePlaybackStore } from "../../../stores/playbackStore";
import { confirm } from "../../../stores/modalStore";
import { toast } from "../../../stores/toastStore";
import { secondsToTimeCode, secondsToFrame } from "../../../utils/timeUtils";
import {
  generateCacheKey,
  getCachedSceneChanges,
  cacheSceneChanges,
  deleteCachedSceneChanges,
} from "../../../utils/waveformCache";
import { detectSceneChangesWithAbort } from "../../../utils/sceneDetector";
import { getMP4ContainerDuration } from "../../../utils/streamingWaveform";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../../stores/settingsStore";
import SubtitleOverlay from "./SubtitleOverlay";
import SceneDetectionModal from "../waveform/SceneDetectionModal";
import TrainingFilePickerModal from "../training/TrainingFilePickerModal";
import "./MediaPlayer.css";

// 부드러운 업데이트를 위한 throttle 간격 (ms)
const STORE_UPDATE_INTERVAL = 100; // 100ms = 10fps로 전역 상태 업데이트 (편집 성능 우선)
const DISPLAY_UPDATE_INTERVAL = 50; // 50ms = 20fps로 로컬 디스플레이 업데이트 (GC 압력 감소)

export default function MediaPlayer({ mediaRef, onMinimize }) {
  const { t } = useTranslation("worktool");
  const [searchParams] = useSearchParams();
  const isTrainingMode = searchParams.get("mode") === "training";
  const mediaUrl = useSubtitleStore((state) => state.mediaUrl);
  const mediaType = useSubtitleStore((state) => state.mediaType);
  const mediaFileName = useSubtitleStore((state) => state.mediaFileName);
  const mediaFileSize = useSubtitleStore((state) => state.mediaFileSize);
  const duration = useSubtitleStore((state) => state.duration);
  const frameRate = useSubtitleStore((state) => state.frameRate);
  const currentTime = usePlaybackStore((state) => state.currentTime);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const subtitles = useSubtitleStore((state) => state.subtitles);
  const isServerMode = useSubtitleStore((state) => state.isServerMode);
  const sceneChanges = useSubtitleStore((state) => state.sceneChanges);
  const sceneDetectProgress = useSubtitleStore((state) => state.sceneDetectProgress);
  const setDuration = useSubtitleStore((state) => state.setDuration);
  const setCurrentTime = usePlaybackStore((state) => state.setCurrentTime);
  const setIsPlaying = usePlaybackStore((state) => state.setIsPlaying);
  const setMediaUrl = useSubtitleStore((state) => state.setMediaUrl);
  const setFileId = useSubtitleStore((state) => state.setFileId);
  const setServerWaveformOverrideUrl = useSubtitleStore(
    (state) => state.setServerWaveformOverrideUrl,
  );
  const setFrameRate = useSubtitleStore((state) => state.setFrameRate);
  const clearSubtitles = useSubtitleStore((state) => state.clearSubtitles);
  const playbackRate = usePlaybackStore((state) => state.playbackRate);
  const setPlaybackRate = usePlaybackStore((state) => state.setPlaybackRate);
  const hideLastSubtitle = useSubtitleStore((state) => state.hideLastSubtitle);
  const toggleHideLastSubtitle = useSubtitleStore((state) => state.toggleHideLastSubtitle);
  const setSceneChanges = useSubtitleStore((state) => state.setSceneChanges);
  const setIsDetectingScenes = useSubtitleStore((state) => state.setIsDetectingScenes);
  const setSceneDetectProgress = useSubtitleStore((state) => state.setSceneDetectProgress);
  const clearSceneChanges = useSubtitleStore((state) => state.clearSceneChanges);
  const splitStartSec = useSubtitleStore((state) => state.splitStartSec);
  const splitEndSec = useSubtitleStore((state) => state.splitEndSec);
  const hasSplitRange = splitStartSec !== null && splitEndSec !== null;
  const overlayFontSize = useSettingsStore((state) => state.worktoolUi?.overlayFontSize ?? 18);
  const overlayOpacity = useSettingsStore((state) => state.worktoolUi?.overlayOpacity ?? 85);
  const overlayBgOpacity = useSettingsStore((state) => state.worktoolUi?.overlayBgOpacity ?? 85);
  const updateWorktoolUi = useSettingsStore((state) => state.updateWorktoolUi);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [showTrainingPicker, setShowTrainingPicker] = useState(false);

  const mediaInputRef = useRef(null);
  const animationRef = useRef(null);
  const lastStoreUpdateRef = useRef(0);
  const lastDisplayUpdateRef = useRef(0);

  // 로컬 시간 상태 (부드러운 UI 업데이트용)
  const [localTime, setLocalTime] = useState(0);

  // PIP 상태
  const [isPiP, setIsPiP] = useState(false);

  // 전체화면 상태
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Document PiP refs
  const pipWindowRef = useRef(null);
  const pipSubtitleRef = useRef(null);
  const mediaContainerRef = useRef(null);

  // 볼륨 상태
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volumeRef = useRef(null);

  // 배속 선택 팝업 상태
  const [speedMenuPos, setSpeedMenuPos] = useState(null);
  const speedBtnRef = useRef(null);
  const speedMenuRef = useRef(null);

  // 장면 전환 감지 상태
  const [threshold, setThreshold] = useState(30);
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [sceneModalStatus, setSceneModalStatus] = useState("settings");
  const [sceneCacheHit, setSceneCacheHit] = useState(false);
  const sceneAbortRef = useRef(null);
  const durationAbortRef = useRef(null);

  // 시간 업데이트 루프. 재생 중일 때만 가동하고 정지/탭 백그라운드에서는
  // cancelAnimationFrame 으로 중단해 유휴 CPU/GC 부담을 없앤다.
  // (이전엔 항상 60fps 로 콜백이 도는 구조였다.)
  // 정지 상태에서의 시간 변경(슬라이더 seek, stepFrame, 외부 seek)은
  // 각 호출부에서 setLocalTime + setCurrentTime 을 명시적으로 호출하므로 별도 폴링 불필요.
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return undefined;
    }

    const tick = () => {
      const media = mediaRef.current;
      if (!media) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      let mediaTime = media.currentTime;

      // 분할 구간 재생 범위 제한
      if (hasSplitRange) {
        if (mediaTime >= splitEndSec) {
          media.pause();
          media.currentTime = splitEndSec;
          mediaTime = splitEndSec;
        } else if (mediaTime < splitStartSec) {
          media.currentTime = splitStartSec;
          mediaTime = splitStartSec;
        }
      }

      if (now - lastDisplayUpdateRef.current >= DISPLAY_UPDATE_INTERVAL) {
        setLocalTime(mediaTime);
        lastDisplayUpdateRef.current = now;
      }

      if (now - lastStoreUpdateRef.current >= STORE_UPDATE_INTERVAL) {
        const storeTime = usePlaybackStore.getState().currentTime;
        if (mediaTime !== storeTime) {
          setCurrentTime(mediaTime);
        }
        lastStoreUpdateRef.current = now;
      }
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, mediaRef, setCurrentTime, hasSplitRange, splitStartSec, splitEndSec]);

  // duration 보정용 abort 정리는 별도 effect 로 (rAF 루프와 lifecycle 분리)
  useEffect(() => {
    return () => {
      if (durationAbortRef.current) {
        durationAbortRef.current.abort();
        durationAbortRef.current = null;
      }
    };
  }, []);

  const displayTime = localTime;

  const [videoAspectRatio, setVideoAspectRatio] = useState(null);

  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
      if (mediaRef.current.videoWidth && mediaRef.current.videoHeight) {
        setVideoAspectRatio(mediaRef.current.videoWidth / mediaRef.current.videoHeight);
      }

      // MP4 컨테이너: mp4box로 정확한 duration 보정
      if (mediaUrl && mediaFileName && /\.(mp4|m4v|mov|3gp)$/i.test(mediaFileName)) {
        if (durationAbortRef.current) durationAbortRef.current.abort();
        const ac = new AbortController();
        durationAbortRef.current = ac;

        getMP4ContainerDuration(mediaUrl, ac.signal)
          .then((accurateDuration) => {
            if (!ac.signal.aborted && accurateDuration > 0) {
              const browserDuration = mediaRef.current?.duration || 0;
              if (Math.abs(accurateDuration - browserDuration) > 0.001) {
                console.log(`[MediaPlayer] duration 보정: ${browserDuration.toFixed(3)}s → ${accurateDuration.toFixed(3)}s`);
                setDuration(Math.max(accurateDuration, browserDuration));
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            if (durationAbortRef.current === ac) durationAbortRef.current = null;
          });
      }
    }
  };

  // playbackRate를 mediaRef에 동기화
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, mediaRef]);

  // 배속 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!speedMenuPos) return;
    const handleClickOutside = (e) => {
      if (
        speedMenuRef.current && !speedMenuRef.current.contains(e.target) &&
        speedBtnRef.current && !speedBtnRef.current.contains(e.target)
      ) {
        setSpeedMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [speedMenuPos]);

  // 볼륨 변경 핸들러
  const handleVolumeChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (mediaRef.current) mediaRef.current.volume = val;
  }, [mediaRef]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (mediaRef.current) mediaRef.current.volume = next ? 0 : volume;
      return next;
    });
  }, [mediaRef, volume]);

  // 볼륨 슬라이더 외부 클릭 닫기
  useEffect(() => {
    if (!showVolumeSlider) return;
    const handleClickOutside = (e) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target)) {
        setShowVolumeSlider(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showVolumeSlider]);

  const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  const toggleSpeedMenu = useCallback(() => {
    if (speedMenuPos) {
      setSpeedMenuPos(null);
      return;
    }
    if (speedBtnRef.current) {
      const rect = speedBtnRef.current.getBoundingClientRect();
      setSpeedMenuPos({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left + rect.width / 2,
      });
    }
  }, [speedMenuPos]);

  const handlePlaybackRateChange = useCallback(
    (rate) => {
      setPlaybackRate(rate);
      if (mediaRef.current) {
        mediaRef.current.playbackRate = rate;
      }
      setSpeedMenuPos(null);
    },
    [mediaRef, setPlaybackRate],
  );

  // 미디어 로드 시 저장된 재생 상태 복원 (최소화 후 복원 시)
  const handleLoadedData = useCallback(() => {
    if (mediaRef.current) {
      if (hasSplitRange) {
        mediaRef.current.currentTime = splitStartSec;
      } else if (currentTime > 0) {
        mediaRef.current.currentTime = currentTime;
      }
      mediaRef.current.playbackRate = playbackRate;
      if (isPlaying) {
        mediaRef.current.play().catch(console.error);
      }
    }
  }, [currentTime, isPlaying, playbackRate, mediaRef, hasSplitRange, splitStartSec]);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => {
    setIsPlaying(false);
    // rAF 루프가 즉시 멈추므로, 마지막 시간을 한 번 명시적으로 동기화한다.
    // (정지 직전에 폴링 주기가 비어 있으면 store/UI 가 ~100ms 어긋날 수 있음)
    if (mediaRef.current) {
      const t = mediaRef.current.currentTime;
      setLocalTime(t);
      setCurrentTime(t);
    }
  };
  // 외부 컨트롤(파형 클릭, PIP 등)로 seek 된 경우에도 store 와 동기화.
  const handleSeeked = () => {
    if (mediaRef.current) {
      const t = mediaRef.current.currentTime;
      setLocalTime(t);
      setCurrentTime(t);
    }
  };

  const togglePlayPause = () => {
    if (mediaRef.current) {
      if (isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
    }
  };

  // 프레임 단위 이동
  const stepFrame = (direction) => {
    if (mediaRef.current) {
      const frameDuration = 1 / frameRate;
      const minTime = splitStartSec ?? 0;
      const maxTime = splitEndSec ?? duration;
      const newTime = Math.max(
        minTime,
        Math.min(maxTime, displayTime + direction * frameDuration),
      );
      mediaRef.current.currentTime = newTime;
      setLocalTime(newTime);
      setCurrentTime(newTime);
    }
  };

  // 슬라이더로 시간 이동
  const handleSeek = (e) => {
    const minTime = splitStartSec ?? 0;
    const maxTime = splitEndSec ?? duration;
    const newTime = Math.max(minTime, Math.min(maxTime, parseFloat(e.target.value)));
    if (mediaRef.current) {
      mediaRef.current.currentTime = newTime;
      setLocalTime(newTime);
      setCurrentTime(newTime);
    }
  };

  // 미디어 파일 열기
  const handleMediaOpen = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 기존 자막 작업이 있는 경우 저장 유도
    if (subtitles.length > 0) {
      const confirmed = await confirm(t("video.unsavedWorkConfirm"), {
        title: t("video.checkWorkHistory"),
        confirmText: t("video.continueButton"),
        cancelText: t("common.cancel"),
      });
      if (!confirmed) {
        e.target.value = "";
        return;
      }
      clearSubtitles();
    }

    const url = URL.createObjectURL(file);
    const type = file.type.startsWith("video") ? "video" : "audio";
    setMediaUrl(url, type, file.name, file.size);

    e.target.value = "";
  };

  // 미디어 열기 버튼 클릭
  // 연수(training) 모드에서도 로컬 파일을 직접 불러와 재생한다.
  const handleOpenMediaClick = useCallback(async () => {
    mediaInputRef.current?.click();
  }, []);

  // 연수 모드 파일 선택 결과 처리
  const handleTrainingFilePicked = useCallback(
    ({ id, playbackUrl, waveformUrl, mediaType, fileName }) => {
      if (!playbackUrl) return;
      // override 는 새 파일 진입마다 미리 클리어해서 직전 파일의 URL 이 잘못
      // 흘러가는 것을 방지. waveform URL 이 있으면 그 다음 라인에서 다시 set.
      setServerWaveformOverrideUrl(waveformUrl || null);
      setMediaUrl(playbackUrl, mediaType || "video", fileName || "", null, true);
      // WaveformViewer 의 server 분기 진입 조건(fileId + isServerFile) 충족.
      if (id) setFileId(id);
      setShowTrainingPicker(false);
    },
    [setMediaUrl, setFileId, setServerWaveformOverrideUrl]
  );

  // 프레임레이트 변경
  const handleFrameRateChange = (e) => {
    const rate = parseFloat(e.target.value);
    if (rate > 0) {
      setFrameRate(rate);
    }
  };

  // Document PiP: 자막 동기화 (currentTime/subtitles 변경 시 PiP 내 자막 DOM 업데이트)
  useEffect(() => {
    if (!isPiP || !pipSubtitleRef.current) return;

    const overlay = pipSubtitleRef.current;
    const textEl = overlay.querySelector(".subtitle-text");
    if (!textEl) return;

    // 현재 시간에 활성 자막 찾기 (SubtitleOverlay와 동일 로직)
    const targetSubtitles =
      hideLastSubtitle && subtitles.length > 0
        ? subtitles.slice(0, -1)
        : subtitles;

    const active = targetSubtitles.find(
      (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime,
    );

    if (active && active.text) {
      const position = active.position || "bottomCenter";
      // position 클래스 업데이트
      overlay.className = `subtitle-overlay position-${position}`;
      textEl.textContent = active.text;
      overlay.style.display = "";
    } else {
      overlay.style.display = "none";
    }
  }, [isPiP, currentTime, subtitles, hideLastSubtitle]);

  // PiP 창에 스타일시트 복사
  const copyStylesToPipWindow = useCallback((pipWindow) => {
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules]
          .map((r) => r.cssText)
          .join("");
        const style = pipWindow.document.createElement("style");
        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch (e) {
        if (styleSheet.href) {
          const link = pipWindow.document.createElement("link");
          link.rel = "stylesheet";
          link.href = styleSheet.href;
          pipWindow.document.head.appendChild(link);
        }
      }
    });
  }, []);

  // PIP 모드 토글 (Document Picture-in-Picture API)
  const togglePiP = async () => {
    if (!mediaRef.current) return;

    try {
      // PiP 활성 중이면 닫기
      if (pipWindowRef.current) {
        pipWindowRef.current.close();
        return;
      }

      // Document PiP API 지원 확인
      if ("documentPictureInPicture" in window) {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
          width: mediaRef.current.clientWidth || 640,
          height: mediaRef.current.clientHeight || 360,
        });

        // 1. 스타일시트 복사
        copyStylesToPipWindow(pipWindow);

        // 2. PiP용 컨테이너 생성
        const pipContainer = pipWindow.document.createElement("div");
        pipContainer.className = "media-container";

        // 3. video 요소를 PiP으로 이동
        pipContainer.appendChild(mediaRef.current);

        // 4. 자막 오버레이 div 생성
        const subtitleOverlay = pipWindow.document.createElement("div");
        subtitleOverlay.className = "subtitle-overlay position-bottomCenter";
        subtitleOverlay.innerHTML = '<div class="subtitle-text"></div>';
        subtitleOverlay.style.display = "none";
        pipContainer.appendChild(subtitleOverlay);
        pipSubtitleRef.current = subtitleOverlay;

        // 5. PiP 내 더블클릭 전체화면
        mediaRef.current.addEventListener("dblclick", () => {
          if (pipWindow.document.fullscreenElement) {
            pipWindow.document.exitFullscreen();
          } else {
            pipContainer.requestFullscreen().catch(() => {});
          }
        });

        pipWindow.document.body.appendChild(pipContainer);
        pipWindowRef.current = pipWindow;
        setIsPiP(true);

        // 6. PiP 닫힘 처리: video를 원래 위치로 복원
        pipWindow.addEventListener("pagehide", () => {
          const container = mediaContainerRef.current;
          if (container && mediaRef.current) {
            container.prepend(mediaRef.current);
          }
          pipWindowRef.current = null;
          pipSubtitleRef.current = null;
          setIsPiP(false);
        });
      } else if (document.pictureInPictureEnabled) {
        // 폴백: 표준 PiP (자막 미표시)
        await mediaRef.current.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (error) {
      console.error("PIP 모드 전환 실패:", error);
    }
  };

  // 전체화면 토글 (메인 플레이어 또는 PiP 창)
  const toggleFullscreen = async () => {
    try {
      if (isPiP && pipWindowRef.current) {
        // PiP 창 내 전체화면
        const pipDoc = pipWindowRef.current.document;
        const pipContainer = pipDoc.querySelector(".media-container");
        if (!pipContainer) return;

        if (pipDoc.fullscreenElement) {
          await pipDoc.exitFullscreen();
        } else {
          await pipContainer.requestFullscreen();
        }
      } else {
        // 메인 플레이어 전체화면
        const container = mediaContainerRef.current;
        if (!container) return;

        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await container.requestFullscreen();
        }
      }
    } catch (error) {
      console.error("전체화면 전환 실패:", error);
    }
  };

  // 전체화면 상태 동기화 (ESC로 나갈 때도 감지)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // PiP 창 내 전체화면 상태도 동기화
  useEffect(() => {
    if (!isPiP || !pipWindowRef.current) return;
    const pipDoc = pipWindowRef.current.document;
    const handlePipFullscreenChange = () => {
      setIsFullscreen(!!pipDoc.fullscreenElement);
    };
    pipDoc.addEventListener("fullscreenchange", handlePipFullscreenChange);
    return () => {
      pipDoc.removeEventListener("fullscreenchange", handlePipFullscreenChange);
    };
  }, [isPiP]);

  // 장면 전환 감지 모달 열기
  const openSceneDetectionModal = useCallback(async () => {
    if (!mediaRef.current || mediaType !== "video") {
      toast.warning(t("video.sceneDetectionVideoOnly"));
      return;
    }
    setShowSceneModal(true);
    setSceneModalStatus("settings");
    setSceneCacheHit(false);
  }, [mediaRef, mediaType]);

  // 장면 전환 감지 시작
  const startSceneDetection = useCallback(
    async (selectedThreshold) => {
      setThreshold(selectedThreshold);
      setSceneModalStatus("loading");

      const baseCacheKey = generateCacheKey(mediaFileName, mediaFileSize);
      const cacheKey = baseCacheKey
        ? `${baseCacheKey}_t${selectedThreshold}`
        : null;

      // 캐시 확인
      if (cacheKey) {
        const cached = await getCachedSceneChanges(cacheKey);
        if (cached) {
          setSceneCacheHit(true);
          setSceneChanges(cached.sceneChanges);
          setSceneModalStatus("complete");
          return;
        }
      }

      setSceneCacheHit(false);
      setSceneModalStatus("detecting");
      setIsDetectingScenes(true);
      setSceneDetectProgress(0);
      clearSceneChanges();

      try {
        const { promise, abort } = detectSceneChangesWithAbort(
          mediaRef.current,
          {
            threshold: selectedThreshold,
            sampleInterval: 0.25,
            onProgress: (progress) => {
              setSceneDetectProgress(Math.round(progress));
            },
          },
        );

        sceneAbortRef.current = abort;
        const scenes = await promise;
        setSceneChanges(scenes);
        setIsDetectingScenes(false);

        if (cacheKey && scenes.length > 0) {
          setSceneModalStatus("saving");
          await cacheSceneChanges(cacheKey, scenes, selectedThreshold, {
            fileName: mediaFileName,
            fileSize: mediaFileSize,
          });
        }

        setSceneModalStatus("complete");
      } catch (error) {
        console.error("장면 전환 감지 오류:", error);
        setIsDetectingScenes(false);
        setShowSceneModal(false);
      }
    },
    [
      mediaRef,
      mediaFileName,
      mediaFileSize,
      setSceneChanges,
      setIsDetectingScenes,
      setSceneDetectProgress,
      clearSceneChanges,
    ],
  );

  // 장면 전환 감지 취소
  const cancelSceneDetection = useCallback(() => {
    if (sceneAbortRef.current) {
      sceneAbortRef.current();
      sceneAbortRef.current = null;
    }
    setIsDetectingScenes(false);
    setShowSceneModal(false);
  }, [setIsDetectingScenes]);

  // 장면 전환 감지 결과 및 캐시 삭제
  const handleClearSceneChanges = useCallback(async () => {
    const baseCacheKey = generateCacheKey(mediaFileName, mediaFileSize);
    const cacheKey = baseCacheKey ? `${baseCacheKey}_t${threshold}` : null;

    if (cacheKey) {
      await deleteCachedSceneChanges(cacheKey);
    }

    clearSceneChanges();
  }, [mediaFileName, mediaFileSize, threshold, clearSceneChanges]);

  if (!mediaUrl) {
    return (
      <div className="media-player-placeholder">
        <input
          ref={mediaInputRef}
          type="file"
          accept="video/*,audio/*"
          onChange={handleMediaOpen}
          style={{ display: "none" }}
        />
        <div className="placeholder-content">
          <div className="placeholder-icon-wrapper">
            <span className="placeholder-icon">&#x25B6;</span>
          </div>
          <div className="placeholder-text">
            <h3>{t("video.openMediaFile")}</h3>
            <p>{t("video.openMediaGuide")}</p>
          </div>
          {!isServerMode && (
            <>
              <div className="placeholder-buttons">
                <button
                  onClick={handleOpenMediaClick}
                  className="btn-load-media"
                >
                  {t("video.loadFile")}
                </button>
              </div>
              <span className="placeholder-hint">
                {t("video.supportedFormats")}
              </span>
            </>
          )}
          {isServerMode && (
            <span className="placeholder-hint">{t("video.loadingFile")}</span>
          )}
        </div>
        {/* 연수(Training) 파일 선택 모달 */}
        <TrainingFilePickerModal
          open={showTrainingPicker}
          onClose={() => setShowTrainingPicker(false)}
          onPick={handleTrainingFilePicked}
        />
      </div>
    );
  }

  return (
    <div className="media-player">
      <input
        ref={mediaInputRef}
        type="file"
        accept="video/*,audio/*"
        onChange={handleMediaOpen}
        style={{ display: "none" }}
      />

      {/* 상단 헤더: 제목 + 버튼들 */}
      <div className="media-player-header">
        <div className="header-title">
          <h3>{mediaFileName || t("video.media")}</h3>
        </div>
        <div className="header-actions">
          {mediaType === "video" && (
            <button
              onClick={openSceneDetectionModal}
              className="header-btn text-only"
              title={t("video.sceneDetection")}
            >
              {t("video.sceneDetectionTitle")}
            </button>
          )}
          {mediaType === "video" &&
            ("documentPictureInPicture" in window ||
              document.pictureInPictureEnabled) && (
              <button
                onClick={togglePiP}
                className={`header-btn text-only ${isPiP ? "active" : ""}`}
                title={
                  isPiP ? t("video.pipExitTitle") : t("video.pipModeTitle")
                }
              >
                PIP
              </button>
            )}
          {mediaType === "video" && (
            <button
              onClick={toggleFullscreen}
              className={`header-btn text-only ${isFullscreen ? "active" : ""}`}
              title={
                isFullscreen
                  ? t("video.exitFullscreenTitle")
                  : t("video.fullscreenTitle")
              }
            >
              {isFullscreen ? t("video.shrinkView") : t("video.fullView")}
            </button>
          )}
          <div className="header-settings-wrap">
            <button
              onClick={() => setShowSubtitleSettings((v) => !v)}
              className={`header-btn icon-only ${showSubtitleSettings ? "active" : ""}`}
              title={t("video.subtitleSettings")}
            >
              <span className="btn-icon">⚙</span>
            </button>
            {showSubtitleSettings && (
              <div className="subtitle-settings-popover">
                <div className="subtitle-settings-row">
                  <span className="subtitle-settings-label">{t("video.subtitleOpacity")}</span>
                  <div className="subtitle-settings-slider-wrap">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={overlayOpacity}
                      onChange={(e) => updateWorktoolUi({ overlayOpacity: Number(e.target.value) })}
                      className="subtitle-settings-slider"
                    />
                    <span className="subtitle-settings-value">{overlayOpacity}%</span>
                  </div>
                </div>
                <div className="subtitle-settings-row">
                  <span className="subtitle-settings-label">{t("video.subtitleBgOpacity")}</span>
                  <div className="subtitle-settings-slider-wrap">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={overlayBgOpacity}
                      onChange={(e) => updateWorktoolUi({ overlayBgOpacity: Number(e.target.value) })}
                      className="subtitle-settings-slider"
                    />
                    <span className="subtitle-settings-value">{overlayBgOpacity}%</span>
                  </div>
                </div>
                <div className="subtitle-settings-row">
                  <span className="subtitle-settings-label">{t("video.subtitleFontSize")}</span>
                  <div className="subtitle-settings-slider-wrap">
                    <input
                      type="range"
                      min="10"
                      max="40"
                      value={overlayFontSize}
                      onChange={(e) => updateWorktoolUi({ overlayFontSize: Number(e.target.value) })}
                      className="subtitle-settings-slider"
                    />
                    <span className="subtitle-settings-value">{overlayFontSize}px</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onMinimize}
            className="header-btn icon-only minimize"
            title={t("video.minimizeVideoTitle")}
          >
            <span className="btn-icon">−</span>
          </button>
        </div>
      </div>

      <div ref={mediaContainerRef} className="media-container" style={videoAspectRatio ? { aspectRatio: videoAspectRatio } : undefined}>
        {mediaType === "video" ? (
          <video
            ref={mediaRef}
            src={mediaUrl}
            crossOrigin="anonymous"
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedData}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
            onClick={togglePlayPause}
            onDoubleClick={toggleFullscreen}
          />
        ) : (
          <audio
            ref={mediaRef}
            src={mediaUrl}
            crossOrigin="anonymous"
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedData}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
          />
        )}
        {/* 자막 오버레이 - 영상 위에 표시 (PiP 모드에서는 PiP 창 내 자막 div가 담당) */}
        {!isPiP && <SubtitleOverlay />}
      </div>

      <div className="controls">
        {/* 타임라인 슬라이더 */}
        <div className="timeline-container">
          <div className="timeline-slider">
            <input
              type="range"
              min={splitStartSec ?? 0}
              max={(splitEndSec ?? duration) || 0}
              step="any"
              value={displayTime}
              onChange={handleSeek}
            />
          </div>
        </div>

        {/* 컨트롤 바: 미디어설정 | 재생컨트롤 | 시간표시 */}
        <div className="control-bar">
          {/* 좌측: FPS */}
          <div className="control-bar-left">
            <div className="fps-selector">
              <span className="fps-label">FPS</span>
              <select value={frameRate} onChange={handleFrameRateChange}>
                <option value="23.976">23.976</option>
                <option value="24">24</option>
                <option value="25">25</option>
                <option value="29.97">29.97</option>
                <option value="30">30</option>
                <option value="50">50</option>
                <option value="59.94">59.94</option>
                <option value="60">60</option>
              </select>
            </div>
            {/* 배속 셀렉터 */}
            <div className="speed-selector">
              <button
                ref={speedBtnRef}
                className={`speed-btn ${playbackRate !== 1 ? "active" : ""}`}
                onClick={toggleSpeedMenu}
                title={t("video.playbackSpeedTitle")}
              >
                <span className="speed-label">{t("video.speed")}</span>
                <span className="speed-value">{playbackRate}x</span>
              </button>
              {speedMenuPos && (
                <div
                  ref={speedMenuRef}
                  className="speed-menu"
                  style={{
                    position: "fixed",
                    bottom: speedMenuPos.bottom,
                    left: speedMenuPos.left,
                    transform: "translateX(-50%)",
                  }}
                >
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      className={`speed-menu-item ${playbackRate === rate ? "active" : ""}`}
                      onClick={() => handlePlaybackRateChange(rate)}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 마지막 자막 표시 토글 */}
            <button
              className={`last-subtitle-toggle ${hideLastSubtitle ? "active" : ""}`}
              onClick={toggleHideLastSubtitle}
              title={t("video.lastSubtitleToggleTitle")}
            >
              <span className="toggle-label">{t("video.lastSubtitle")}</span>
              <span className="toggle-state">
                {hideLastSubtitle ? t("video.off") : t("video.on")}
              </span>
            </button>
            {/* 볼륨 조절 */}
            <div className="volume-control" ref={volumeRef}>
              <button
                className="ctrl-btn volume-btn"
                onClick={() => setShowVolumeSlider((v) => !v)}
                title={t("video.volumeTitle")}
              >
                <span className="ctrl-icon">
                  {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔈" : "🔊"}
                </span>
              </button>
              {showVolumeSlider && (
                <div className="volume-slider-popup">
                  <input
                    type="range"
                    className="volume-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    orient="vertical"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 중앙: 재생 컨트롤 */}
          <div className="control-bar-center">
            <div className="playback-controls">
              <button
                onClick={() => stepFrame(-10)}
                className="ctrl-btn"
                title={t("video.rewind10FramesTitle")}
              >
                <span className="ctrl-icon">&#x23EE;</span>
              </button>
              <button
                onClick={() => stepFrame(-1)}
                className="ctrl-btn"
                title={t("video.rewind1FrameTitle")}
              >
                <span className="ctrl-icon">&#x23F4;</span>
              </button>
              <button
                onClick={togglePlayPause}
                className="ctrl-btn play-btn"
                title={isPlaying ? t("video.pauseTitle") : t("video.playTitle")}
              >
                <span className="ctrl-icon">
                  {isPlaying ? "\u23F8" : "\u23F5"}
                </span>
              </button>
              <button
                onClick={() => stepFrame(1)}
                className="ctrl-btn"
                title={t("video.forward1FrameTitle")}
              >
                <span className="ctrl-icon">&#x23F5;</span>
              </button>
              <button
                onClick={() => stepFrame(10)}
                className="ctrl-btn"
                title={t("video.forward10FramesTitle")}
              >
                <span className="ctrl-icon">&#x23ED;</span>
              </button>
            </div>
          </div>

          {/* 우측: 자막 크기 + 시간 표시 */}
          <div className="control-bar-right">
            <div className="subtitle-size-controls">
              <button
                className="ctrl-btn subtitle-size-btn"
                onClick={() => updateWorktoolUi({ overlayFontSize: Math.max(10, overlayFontSize - 2) })}
                title={t("video.subtitleSizeDown")}
              >
                A-
              </button>
              <span className="subtitle-size-value">{overlayFontSize}</span>
              <button
                className="ctrl-btn subtitle-size-btn"
                onClick={() => updateWorktoolUi({ overlayFontSize: Math.min(40, overlayFontSize + 2) })}
                title={t("video.subtitleSizeUp")}
              >
                A+
              </button>
            </div>
            <div className="time-display">
              <span className="timeCode">{secondsToTimeCode(displayTime)}</span>
              <span className="separator">/</span>
              <span className="timeCode">{secondsToTimeCode(splitEndSec ?? duration)}</span>
              <span className="frame-info">
                {secondsToFrame(displayTime, frameRate)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 장면 전환 감지 Modal */}
      <SceneDetectionModal
        isOpen={showSceneModal}
        progress={sceneDetectProgress}
        status={sceneModalStatus}
        sceneCount={sceneChanges.length}
        onCancel={cancelSceneDetection}
        onClose={() => setShowSceneModal(false)}
        onStart={startSceneDetection}
        cacheHit={sceneCacheHit}
        initialThreshold={threshold}
      />

      {/* 연수(Training) 파일 선택 모달 */}
      <TrainingFilePickerModal
        open={showTrainingPicker}
        onClose={() => setShowTrainingPicker(false)}
        onPick={handleTrainingFilePicked}
      />
    </div>
  );
}
