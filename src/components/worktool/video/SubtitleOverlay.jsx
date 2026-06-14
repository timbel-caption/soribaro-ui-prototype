import { memo, useMemo, useRef } from 'react';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import { usePlaybackStore } from '../../../stores/playbackStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { findActiveIndex } from '../../../utils/subtitleSearch';
import './SubtitleOverlay.css';

const SubtitleOverlay = memo(function SubtitleOverlay() {
  // 개별 값으로 구독하여 무한 루프 방지
  const subtitles = useSubtitleStore((state) => state.subtitles);
  const currentTime = usePlaybackStore((state) => state.currentTime);
  const hideLastSubtitle = useSubtitleStore((state) => state.hideLastSubtitle);
  const overlayFontSize = useSettingsStore((state) => state.worktoolUi?.overlayFontSize ?? 18);
  const overlayOpacity = useSettingsStore((state) => state.worktoolUi?.overlayOpacity ?? 85);
  const overlayBgOpacity = useSettingsStore((state) => state.worktoolUi?.overlayBgOpacity ?? 85);

  // 직전에 찾은 활성 자막 인덱스 hint. 재생 중에는 ±1 이내 이동이라
  // findActiveIndex 가 95%+ 의 호출을 O(1) 로 처리한다.
  // hint 가 빗나갈 때만 binary search 로 폴백 (O(log n)).
  const lastActiveIndexRef = useRef(-1);

  // 현재 활성 자막을 메모이제이션. 자막이 정렬 invariant 를 만족한다는 전제 위에
  // 동작 — utils/subtitleSearch.js 의 findActiveIndex 가 binary search + hint 캐싱.
  // 이전엔 Array.prototype.find 로 매 currentTime tick 마다 O(n) 선형 스캔을 했고
  // hideLastSubtitle 시 slice(0, -1) 로 매번 새 배열까지 만들었다.
  const currentSubtitle = useMemo(() => {
    const len = subtitles.length;
    if (len === 0) {
      lastActiveIndexRef.current = -1;
      return null;
    }
    const effectiveLen = hideLastSubtitle ? len - 1 : len;
    if (effectiveLen <= 0) {
      lastActiveIndexRef.current = -1;
      return null;
    }
    let idx = findActiveIndex(subtitles, currentTime, lastActiveIndexRef.current);
    if (idx >= effectiveLen) idx = -1; // hideLastSubtitle 로 가려진 마지막 자막은 무시
    lastActiveIndexRef.current = idx;
    if (idx < 0) return null;
    const active = subtitles[idx];
    return {
      text: active.text,
      position: active.position || 'bottomCenter',
    };
  }, [subtitles, currentTime, hideLastSubtitle]);

  if (!currentSubtitle || !currentSubtitle.text) {
    return null;
  }

  return (
    <div className={`subtitle-overlay position-${currentSubtitle.position}`}>
      <div className="subtitle-text" style={{ fontSize: `${overlayFontSize}px`, opacity: overlayOpacity / 100, background: `rgba(0, 0, 0, ${overlayBgOpacity / 100})` }}>{currentSubtitle.text}</div>
    </div>
  );
});

export default SubtitleOverlay;

