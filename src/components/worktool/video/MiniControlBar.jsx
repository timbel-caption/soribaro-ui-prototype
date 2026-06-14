import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import { usePlaybackStore } from "../../../stores/playbackStore";
import { secondsToTimeCode } from "../../../utils/timeUtils";
import "./MiniControlBar.css";

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const VOLUME_ICONS = { muted: '🔇', low: '🔈', mid: '🔉', high: '🔊' };
function getVolumeIcon(volume, muted) {
  if (muted || volume === 0) return VOLUME_ICONS.muted;
  if (volume < 0.33) return VOLUME_ICONS.low;
  if (volume < 0.66) return VOLUME_ICONS.mid;
  return VOLUME_ICONS.high;
}

export default function MiniControlBar({ mediaRef, onRestore }) {
  const { t } = useTranslation("worktool");
  const mediaUrl = useSubtitleStore((state) => state.mediaUrl);
  const mediaFileName = useSubtitleStore((state) => state.mediaFileName);
  const duration = useSubtitleStore((state) => state.duration);
  const frameRate = useSubtitleStore((state) => state.frameRate);
  const currentTime = usePlaybackStore((state) => state.currentTime);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const playbackRate = usePlaybackStore((state) => state.playbackRate);
  const setCurrentTime = usePlaybackStore((state) => state.setCurrentTime);
  const setPlaybackRate = usePlaybackStore((state) => state.setPlaybackRate);
  const setMediaUrl = useSubtitleStore((state) => state.setMediaUrl);
  const splitStartSec = useSubtitleStore((state) => state.splitStartSec);
  const splitEndSec = useSubtitleStore((state) => state.splitEndSec);

  const fileInputRef = useRef(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedSelectorRef = useRef(null);
  const [volume, setVolume] = useState(() => mediaRef?.current?.volume ?? 1);
  const [muted, setMuted] = useState(() => mediaRef?.current?.muted ?? false);

  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClickOutside = (e) => {
      if (speedSelectorRef.current && !speedSelectorRef.current.contains(e.target)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSpeedMenu]);

  const handlePlaybackRateChange = useCallback(
    (rate) => {
      setPlaybackRate(rate);
      if (mediaRef?.current) {
        mediaRef.current.playbackRate = rate;
      }
      setShowSpeedMenu(false);
    },
    [mediaRef, setPlaybackRate],
  );

  // store의 currentTime을 직접 사용 (MediaPlayer에서 animation loop로 업데이트됨)
  const displayTime = currentTime;

  const togglePlayPause = () => {
    if (mediaRef?.current) {
      if (isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
    }
  };

  const stepFrame = (direction) => {
    if (mediaRef?.current) {
      const frameDuration = 1 / frameRate;
      const minTime = splitStartSec ?? 0;
      const maxTime = splitEndSec ?? duration;
      const newTime = Math.max(
        minTime,
        Math.min(maxTime, displayTime + direction * frameDuration),
      );
      mediaRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSeek = (e) => {
    const minTime = splitStartSec ?? 0;
    const maxTime = splitEndSec ?? duration;
    const newTime = Math.max(minTime, Math.min(maxTime, parseFloat(e.target.value)));
    if (mediaRef?.current) {
      mediaRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (mediaRef?.current) {
      mediaRef.current.volume = val;
      if (val > 0 && mediaRef.current.muted) {
        mediaRef.current.muted = false;
        setMuted(false);
      }
    }
  }, [mediaRef]);

  const toggleMute = useCallback(() => {
    if (mediaRef?.current) {
      const next = !mediaRef.current.muted;
      mediaRef.current.muted = next;
      setMuted(next);
    }
  }, [mediaRef]);

  const handleRestore = () => {
    if (onRestore) {
      onRestore();
    }
  };

  // 미디어 파일 열기
  const handleMediaOpen = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const type = file.type.startsWith("video") ? "video" : "audio";
    setMediaUrl(url, type, file.name, file.size);

    e.target.value = "";
  };

  // 미디어가 없을 때
  if (!mediaUrl) {
    return (
      <div className="mini-control-bar">
        <div className="mini-control-inner">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            onChange={handleMediaOpen}
            style={{ display: "none" }}
          />

          <div className="mini-file-info">
            <span className="mini-filename mini-no-file">
              {t("video.noMedia")}
            </span>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="mini-load-btn"
            title={t("video.loadMediaTitle")}
          >
            {t("video.loadFile")}
          </button>

          <button
            onClick={handleRestore}
            className="mini-restore-btn"
            title={t("video.restoreWidgetTitle")}
          >
            {t("video.restoreButton")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-control-bar">
      <div className="mini-control-inner">
        {/* 파일명 */}
        <div className="mini-file-info" title={mediaFileName}>
          <span className="mini-filename">
            {mediaFileName || t("video.media")}
          </span>
        </div>

        {/* 재생 컨트롤 */}
        <div className="mini-playback">
          <button
            onClick={() => stepFrame(-10)}
            className="mini-btn"
            title={t("video.miniRewind10Title")}
          >
            &#x23EE;
          </button>
          <button
            onClick={() => stepFrame(-1)}
            className="mini-btn"
            title={t("video.miniRewind1Title")}
          >
            &#x23F4;
          </button>
          <button
            onClick={togglePlayPause}
            className="mini-btn mini-play-btn"
            title={
              isPlaying ? t("video.miniPauseTitle") : t("video.miniPlayTitle")
            }
          >
            {isPlaying ? "\u23F8" : "\u23F5"}
          </button>
          <button
            onClick={() => stepFrame(1)}
            className="mini-btn"
            title={t("video.miniForward1Title")}
          >
            &#x23F5;
          </button>
          <button
            onClick={() => stepFrame(10)}
            className="mini-btn"
            title={t("video.miniForward10Title")}
          >
            &#x23ED;
          </button>
        </div>

        {/* 타임라인 */}
        <div className="mini-timeline">
          <span className="mini-time">{secondsToTimeCode(displayTime)}</span>
          <input
            type="range"
            min={splitStartSec ?? 0}
            max={(splitEndSec ?? duration) || 0}
            step="any"
            value={displayTime}
            onChange={handleSeek}
            className="mini-slider"
          />
          <span className="mini-time">{secondsToTimeCode(splitEndSec ?? duration)}</span>
        </div>

        {/* 배속 */}
        <div className="mini-speed-selector" ref={speedSelectorRef}>
          <button
            className={`mini-speed-btn ${playbackRate !== 1 ? "active" : ""}`}
            onClick={() => setShowSpeedMenu((v) => !v)}
            title={t("video.playbackSpeedTitle")}
          >
            {playbackRate}x
          </button>
          {showSpeedMenu && (
            <div className="mini-speed-menu">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  className={`mini-speed-menu-item ${playbackRate === rate ? "active" : ""}`}
                  onClick={() => handlePlaybackRateChange(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 음량 */}
        <div className="mini-volume">
          <button className="mini-btn mini-mute-btn" onClick={toggleMute} title={t("video.muteTitle")}>
            {getVolumeIcon(volume, muted)}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            className="mini-volume-slider"
          />
        </div>

        {/* 복원 버튼 */}
        <button
          onClick={handleRestore}
          className="mini-restore-btn"
          title={t("video.restoreWidgetTitle")}
        >
          {t("video.restoreButton")}
        </button>
      </div>
    </div>
  );
}
