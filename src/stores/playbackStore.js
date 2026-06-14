// 재생 상태 전용 Store.
// currentTime 은 재생 중 100ms 마다 갱신되어 매우 빈번하게 변하므로,
// 자막 데이터(useSubtitleStore)와 분리하여 시간 변경이 자막/undo/이력 등
// 무거운 데이터 구독자를 흔들지 않도록 한다. (docs/todo/01 참조)
import { create } from "zustand";

export const usePlaybackStore = create((set) => ({
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,

  setCurrentTime: (currentTime) => set({ currentTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  reset: () =>
    set({
      currentTime: 0,
      isPlaying: false,
      playbackRate: 1,
    }),
}));
