import { create } from "zustand";
import { saveEditHistory } from "../utils/waveformCache";
import { timeCodeToSeconds } from "../utils/timeUtils";
import {
  mapSubtitlesByPermission,
  serializeSubtitleJson,
  parseSubtitleJson,
} from "../utils/subtitleJsonFormat";
import { useSpeakerStore } from "./speakerStore";
import { useRoleStore, getBaseRole, isHigherRole, Role } from "./roleStore";
import { useSettingsStore } from "./settingsStore";
import { usePlaybackStore } from "./playbackStore";
import { usePerformanceStore } from "./performanceStore";
import {
  binaryInsertByStartTime,
  assertSortedByStartTime,
} from "../utils/subtitleSearch";

// invariant: subtitles 는 항상 startTime 오름차순. 모든 mutation 은 이 순서를 보존한다.
// dev 모드에서만 가벼운 검증 (운영에서는 no-op 처리).
const IS_DEV =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
const checkSorted = IS_DEV
  ? (subs, label) => assertSortedByStartTime(subs, label)
  : () => true;

// 이력 저장 디바운스 (빠른 연속 수정 시 마지막만 저장).
// 각 호출은 자막 배열 전체를 IDB 로 structured clone 직렬화하므로 자막이 많을수록
// 메인 스레드를 점유한다. 500ms 는 활발한 편집 중 1초당 1~2회 write 가 발생해
// 장시간 작업 시 누적 jitter 의 원인으로 의심됨 → 2000ms 로 확대. (docs/todo/10)
// blur / STT·번역 완료 등 명시 시점에는 saveEditHistorySnapshot 이 즉시 호출하므로
// 디바운스 확대로 인한 이력 손실 위험은 낮다.
let historyTimeout = null;
const debouncedSaveHistory = (
  subtitles,
  action,
  details,
  fileId = null,
  role = null,
) => {
  if (historyTimeout) {
    clearTimeout(historyTimeout);
  }
  historyTimeout = setTimeout(() => {
    saveEditHistory(subtitles, action, details, fileId, role);
  }, 2000);
};

// UUID v4 생성기
const generateUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// 자막 배열 내 중복 ID를 감지하여 새 UUID로 교체
const ensureUniqueIds = (subtitles) => {
  const seenIds = new Set();
  return subtitles.map((sub) => {
    const id = sub.id || generateUUID();
    if (seenIds.has(id)) {
      return { ...sub, id: generateUUID() };
    }
    seenIds.add(id);
    return sub.id ? sub : { ...sub, id };
  });
};

// 최소 세그먼트 간격 (초) - settingsStore의 minGapMs를 참조
export const getMinGap = () => {
  const { general } = useSettingsStore.getState();
  if (!general?.minGapEnabled) return 0;
  const ms = general?.minGapMs;
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
};

// 겹침 해결 헬퍼 함수
// 새로운/수정된 자막이 다른 자막과 겹치지 않도록 시간 조정
// 앞싱크의 endTime을 당겨서 간격을 확보 (뒷싱크를 밀지 않음)
// adjustedOthers: 기존 자막 중 endTime이 변경된 항목 { id, endTime }
const resolveOverlap = (subtitle, otherSubtitles, duration = Infinity) => {
  let { startTime, endTime } = subtitle;
  const gap = getMinGap();
  const adjustedOthers = [];

  const validDuration = duration && duration > 0 ? duration : Infinity;

  if (startTime < 0) startTime = 0;
  if (endTime <= startTime) endTime = startTime + 0.1;
  if (validDuration !== Infinity && endTime > validDuration)
    endTime = validDuration;

  // 호출자(addSubtitle/updateSubtitle)는 이미 정렬된 subtitles 에서 filter 한
  // 결과를 넘기므로 otherSubtitles 도 정렬 invariant 를 만족한다 → 추가 sort 불필요.
  const sorted = otherSubtitles;

  for (const other of sorted) {
    const overlaps = startTime < other.endTime && endTime > other.startTime;
    const tooClose = !overlaps && other.endTime > startTime - gap && other.endTime <= startTime;

    if (overlaps || tooClose) {
      if (other.startTime < startTime) {
        const newEndTime = startTime - gap;
        if (newEndTime > other.startTime) {
          adjustedOthers.push({ id: other.id, endTime: newEndTime });
        }
      } else if (other.startTime >= startTime) {
        endTime = other.startTime - gap;
      }
    }
  }

  if (startTime < 0) startTime = 0;
  if (endTime <= startTime) endTime = startTime + 0.1;
  if (validDuration !== Infinity && endTime > validDuration)
    endTime = validDuration;

  return { startTime, endTime, adjustedOthers };
};

export const useSubtitleStore = create((set, get) => ({
  // 미디어 정보
  mediaUrl: null,
  mediaType: null, // 'video' or 'audio'
  mediaFileName: null, // 파일 이름
  mediaFileSize: null, // 파일 크기 (bytes) - 캐시 키 생성용
  isServerFile: false, // 서버 파일 여부 (스트리밍 파형 생성용)
  fileId: null, // 서버 파일 ID (저장용)
  isServerMode: false, // 서버 모드 여부 (URL에 파일 ID가 있으면 true)
  serverFileError: null, // 서버 모드 파일 로드 에러
  splitStartSec: null, // 분할 구간 시작 (초), null이면 비분할
  splitEndSec: null, // 분할 구간 종료 (초)
  isMergeMode: false, // 병합 검수 모드
  mergeServCd: null, // 병합 모드 의뢰코드
  mergeFiles: null, // 병합 모드 파일 메타 [{fileNo, playTm}]
  setMergeMode: (servCd, files) => set({ isMergeMode: true, mergeServCd: servCd, mergeFiles: files }),
  duration: 0,
  frameRate: 30, // 기본 프레임레이트

  // 자막 데이터
  subtitles: [],
  undoStack: [],
  redoStack: [],
  selectedSubtitleId: null,
  subtitleFileName: null, // 가져온 자막 파일명
  lastRestoredInfo: null, // 마지막 복원 정보
  hideLastSubtitle: false, // 마지막 자막 영상 오버레이 숨기기
  toggleHideLastSubtitle: () =>
    set((state) => ({ hideLastSubtitle: !state.hideLastSubtitle })),

  // 파형에서 선택된 시간 범위
  selectedTimeRange: null, // { startTime, endTime, shouldSeek }

  // 번역 모달 열기 트리거 (Toolbar에서 제어)
  translateModalTrigger: false,
  triggerTranslateModal: () => set({ translateModalTrigger: true }),
  resetTranslateModalTrigger: () => set({ translateModalTrigger: false }),

  // 언어 설정 (출발어, 중간어, 도착어)
  sourceLanguage: "ko",
  middleLanguage: "ko",
  targetLanguage: "ko",
  setSourceLanguage: (lang) => set({ sourceLanguage: lang }),
  setMiddleLanguage: (lang) => set({ middleLanguage: lang }),
  setTargetLanguage: (lang) => set({ targetLanguage: lang }),

  // 파형 데이터
  waveformData: null,

  // 서버 모드 진입 시 외부 모듈(WorkToolPage 등)이 미리 발급해 둔
  // waveform .dat 다운로드 URL. 비어 있으면 WaveformViewer 가 기존
  // 자동 로딩 경로(getWaveformDownloadUrl(fileId)) 를 사용한다.
  // 연수(Training) 모드에서 training-files API 로 받은 URL 을 주입할 때 사용.
  serverWaveformOverrideUrl: null,

  // 장면 전환 데이터
  sceneChanges: [],
  isDetectingScenes: false,
  sceneDetectProgress: 0,

  // 영상 위젯 최소화 상태
  isVideoMinimized: false,
  setVideoMinimized: (minimized) => set({ isVideoMinimized: minimized }),
  toggleVideoMinimized: () =>
    set((state) => ({ isVideoMinimized: !state.isVideoMinimized })),

  // 미디어 설정
  setMediaUrl: (
    url,
    type,
    fileName = null,
    fileSize = null,
    isServerFile = false,
  ) =>
    set({
      mediaUrl: url,
      mediaType: type,
      mediaFileName: fileName,
      mediaFileSize: fileSize,
      isServerFile,
    }),
  setDuration: (duration) => set({ duration }),
  setFrameRate: (frameRate) => set({ frameRate }),
  setFileId: (fileId) => set({ fileId }),
  setServerMode: (isServer) => set({ isServerMode: isServer }),
  setServerFileError: (error) => set({ serverFileError: error }),
  setServerWaveformOverrideUrl: (url) => set({ serverWaveformOverrideUrl: url }),
  setSplitRange: (start, end) => set({ splitStartSec: start, splitEndSec: end }),

  // 자막 일괄 적용 (서버 로드 등 대량 입력 경로 전용)
  // - addSubtitle 을 N 번 부르면 O(N^2) + N 번 set 으로 리렌더가 폭발한다.
  //   bulk 경로는 한 번에 정규화 + 1 회 set 만 수행한다.
  // - 입력은 이미 서버에서 시간순으로 합쳐진 정상 데이터로 가정한다
  //   (mergeTranslationSubtitles 등). 호환을 위해 startTime 으로 한 번 더 안정 정렬.
  // - undo/history 는 남기지 않는다 (서버 로드는 사용자 액션이 아님).
  setSubtitles: (rawSubtitles) => {
    const { frameRate, duration } = get();
    const list = Array.isArray(rawSubtitles) ? rawSubtitles : [];

    const validDuration = duration && duration > 0 ? duration : Infinity;

    const normalized = list.map((sub) => {
      let startTime = Number(sub.startTime) || 0;
      let endTime = Number(sub.endTime) || 0;
      if (startTime < 0) startTime = 0;
      if (endTime <= startTime) endTime = startTime + 0.1;
      if (validDuration !== Infinity && endTime > validDuration)
        endTime = validDuration;

      return {
        id: sub.id || generateUUID(),
        text: sub.text || "",
        sourceText: sub.sourceText || "",
        middleText: sub.middleText || "",
        startTime,
        endTime,
        startFrame:
          sub.startFrame != null
            ? sub.startFrame
            : Math.floor(startTime * frameRate),
        endFrame:
          sub.endFrame != null
            ? sub.endFrame
            : Math.floor(endTime * frameRate),
        position: sub.position || "bottomCenter",
        speakerId:
          sub.speakerId != null && sub.speakerId !== ""
            ? Number(sub.speakerId)
            : null,
        // VOD 분할 워크툴에서 다른 작업자의 최신 자막(상태 무관)을 readonly 로 표시할 때 부착되는 메타.
        // 일반 자막에는 없는 필드이며, 저장/편집 경로에서 가드 키로 쓰인다.
        ...(sub.locked ? { locked: true } : {}),
        ...(sub.lockedSourceProjectFileId
          ? { lockedSourceProjectFileId: sub.lockedSourceProjectFileId }
          : {}),
      };
    });

    // 안정 정렬: startTime 동률이면 입력 순서 유지
    normalized.sort((a, b) => a.startTime - b.startTime);
    const deduped = ensureUniqueIds(normalized);
    checkSorted(deduped, "setSubtitles");

    set({ subtitles: deduped });
  },

  // 자막 관리
  addSubtitle: (subtitle, saveHistory = true) => {
    const { subtitles, frameRate, duration } = get();

    // 겹침 방지: 기존 자막들과 겹치지 않도록 시간 조정
    const resolved = resolveOverlap(
      { startTime: subtitle.startTime || 0, endTime: subtitle.endTime || 0 },
      subtitles,
      duration,
    );

    // 앞싱크 endTime 조정 반영
    let updatedSubtitles = subtitles;
    if (resolved.adjustedOthers.length > 0) {
      updatedSubtitles = subtitles.map((s) => {
        const adj = resolved.adjustedOthers.find((a) => a.id === s.id);
        if (adj) {
          return {
            ...s,
            endTime: adj.endTime,
            endFrame: Math.floor(adj.endTime * frameRate),
          };
        }
        return s;
      });
    }

    const candidateId = subtitle.id || generateUUID();
    const isDuplicate = updatedSubtitles.some((s) => s.id === candidateId);

    const newSubtitle = {
      id: isDuplicate ? generateUUID() : candidateId,
      text: subtitle.text || "",
      sourceText: subtitle.sourceText || "",
      middleText: subtitle.middleText || "",
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      startFrame:
        subtitle.startFrame || Math.floor(resolved.startTime * frameRate),
      endFrame: subtitle.endFrame || Math.floor(resolved.endTime * frameRate),
      position: subtitle.position || "bottomCenter",
      speakerId: subtitle.speakerId != null && subtitle.speakerId !== "" ? Number(subtitle.speakerId) : null,
    };
    // updatedSubtitles 는 정렬 invariant 를 만족하므로 binary insert 로 끼워넣는다.
    const newSubtitles = binaryInsertByStartTime(updatedSubtitles, newSubtitle);
    checkSorted(newSubtitles, "addSubtitle");
    if (saveHistory) get().pushUndo();
    set({ subtitles: newSubtitles });

    // 편집 이력 저장
    if (saveHistory) {
      const { fileId } = get();
      const role = useRoleStore.getState().role;
      debouncedSaveHistory(
        newSubtitles,
        "자막 추가",
        { text: newSubtitle.text || "(새 자막)" },
        fileId,
        role,
      );
    }

    return newSubtitle.id;
  },

  updateSubtitle: (id, updates, options = {}) => {
    const { subtitles, frameRate, duration } = get();

    // 시간 관련 업데이트가 있는지 확인
    const hasTimeUpdate =
      updates.startTime !== undefined ||
      updates.endTime !== undefined ||
      updates.startFrame !== undefined ||
      updates.endFrame !== undefined;

    const mapped = subtitles.map((sub) => {
      if (sub.id !== id) return sub;
      let updated = { ...sub, ...updates };

      // 프레임이 변경되면 시간도 자동 계산 (먼저 처리)
      if (updates.startFrame !== undefined) {
        updated.startTime = updates.startFrame / frameRate;
      }
      if (updates.endFrame !== undefined) {
        updated.endTime = updates.endFrame / frameRate;
      }

      // 시간이 변경되면 프레임도 자동 계산
      if (updates.startTime !== undefined) {
        updated.startFrame = Math.floor(updates.startTime * frameRate);
      }
      if (updates.endTime !== undefined) {
        updated.endFrame = Math.floor(updates.endTime * frameRate);
      }

      // 시간 관련 업데이트가 있으면 겹침 방지 적용
      if (hasTimeUpdate) {
        // 현재 자막을 제외한 다른 자막들
        const otherSubtitles = subtitles.filter((s) => s.id !== id);
        const resolved = resolveOverlap(
          { startTime: updated.startTime, endTime: updated.endTime },
          otherSubtitles,
          duration,
        );
        updated.startTime = resolved.startTime;
        updated.endTime = resolved.endTime;
        updated.startFrame = Math.floor(resolved.startTime * frameRate);
        updated.endFrame = Math.floor(resolved.endTime * frameRate);
      }

      return updated;
    });

    // 시간 필드가 안 바뀌면(텍스트/메타만 변경) 정렬 순서가 그대로이므로 sort 스킵.
    // 텍스트 입력은 매 글자마다 호출되는 핫패스라 이 분기 효과가 크다.
    const newSubtitles = hasTimeUpdate
      ? mapped.sort((a, b) => a.startTime - b.startTime)
      : mapped;
    checkSorted(newSubtitles, "updateSubtitle");

    if (!options.skipHistory) get().pushUndo();
    set({ subtitles: newSubtitles });

    // 편집 이력 저장 (skipHistory 옵션이 있으면 건너뛰기)
    if (!options.skipHistory) {
      const { fileId } = get();
      const role = useRoleStore.getState().role;
      const changedFields = Object.keys(updates).join(", ");
      debouncedSaveHistory(
        newSubtitles,
        "자막 수정",
        { fields: changedFields },
        fileId,
        role,
      );
    }
  },

  // 싱크 시작점 미세 조정 (Alt/⌥ + ←/→)
  adjustSyncStart: (subtitleId, delta) => {
    const { subtitles, frameRate } = get();
    if (!delta || subtitles.length === 0) return;

    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);
    if (currentIndex === -1) return;

    const current = sortedSubtitles[currentIndex];
    const prev = currentIndex > 0 ? sortedSubtitles[currentIndex - 1] : null;
    const gap = getMinGap();

    let effectiveDelta = delta;

    const lowerBoundByCurrent = -current.startTime;
    const upperBoundByCurrent =
      current.endTime - gap - current.startTime;
    if (effectiveDelta < lowerBoundByCurrent)
      effectiveDelta = lowerBoundByCurrent;
    if (effectiveDelta > upperBoundByCurrent)
      effectiveDelta = upperBoundByCurrent;

    // phase1: current만 이동해서 minGap까지 간격을 좁히는 분량
    // phase2: prev와 함께 같이 이동하는 분량 (붙은 상태 유지)
    let phase1 = 0;
    let phase2 = 0;

    if (effectiveDelta < 0 && prev) {
      const gapBeyondMin = current.startTime - prev.endTime - gap;
      if (gapBeyondMin > 0) {
        phase1 = Math.max(effectiveDelta, -gapBeyondMin);
        phase2 = effectiveDelta - phase1;
      } else {
        phase2 = effectiveDelta;
      }
      const lowerBoundByPrev = prev.startTime + gap - prev.endTime;
      if (phase2 < lowerBoundByPrev) {
        phase2 = lowerBoundByPrev;
      }
    } else if (effectiveDelta > 0 && prev) {
      if (current.startTime - prev.endTime <= gap) {
        // 이미 붙어있으면 같이 이동
        phase2 = effectiveDelta;
      } else {
        phase1 = effectiveDelta;
      }
    } else {
      phase1 = effectiveDelta;
    }

    const totalDelta = phase1 + phase2;
    if (totalDelta === 0) return;
    const linkPrev = phase2 !== 0;

    const newSubtitles = subtitles
      .map((sub) => {
        if (sub.id === current.id) {
          const newStart = sub.startTime + totalDelta;
          return {
            ...sub,
            startTime: newStart,
            startFrame: Math.floor(newStart * frameRate),
          };
        }
        if (linkPrev && prev && sub.id === prev.id) {
          const newEnd = sub.endTime + phase2;
          return {
            ...sub,
            endTime: newEnd,
            endFrame: Math.floor(newEnd * frameRate),
          };
        }
        return sub;
      })
      .sort((a, b) => a.startTime - b.startTime);

    get().pushUndo();
    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    const fields = linkPrev ? "startTime,endTime" : "startTime";
    debouncedSaveHistory(newSubtitles, "자막 수정", { fields }, fileId, role);
  },

  // 싱크 종료점 미세 조정 (Alt/⌥ + Shift + ←/→)
  adjustSyncEnd: (subtitleId, delta) => {
    const { subtitles, frameRate, duration } = get();
    if (!delta || subtitles.length === 0) return;

    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);
    if (currentIndex === -1) return;

    const current = sortedSubtitles[currentIndex];
    const next =
      currentIndex < sortedSubtitles.length - 1
        ? sortedSubtitles[currentIndex + 1]
        : null;
    const gap = getMinGap();
    const validDuration = duration && duration > 0 ? duration : Infinity;

    let effectiveDelta = delta;

    const lowerBoundByCurrent =
      current.startTime + gap - current.endTime;
    const upperBoundByDuration =
      validDuration !== Infinity
        ? validDuration - current.endTime
        : Infinity;
    if (effectiveDelta < lowerBoundByCurrent)
      effectiveDelta = lowerBoundByCurrent;
    if (effectiveDelta > upperBoundByDuration)
      effectiveDelta = upperBoundByDuration;

    let phase1 = 0;
    let phase2 = 0;

    if (effectiveDelta > 0 && next) {
      const gapBeyondMin = next.startTime - current.endTime - gap;
      if (gapBeyondMin > 0) {
        phase1 = Math.min(effectiveDelta, gapBeyondMin);
        phase2 = effectiveDelta - phase1;
      } else {
        phase2 = effectiveDelta;
      }
      const upperBoundByNext = next.endTime - gap - next.startTime;
      if (phase2 > upperBoundByNext) {
        phase2 = upperBoundByNext;
      }
    } else if (effectiveDelta < 0 && next) {
      if (next.startTime - current.endTime <= gap) {
        phase2 = effectiveDelta;
      } else {
        phase1 = effectiveDelta;
      }
    } else {
      phase1 = effectiveDelta;
    }

    const totalDelta = phase1 + phase2;
    if (totalDelta === 0) return;
    const linkNext = phase2 !== 0;

    const newSubtitles = subtitles
      .map((sub) => {
        if (sub.id === current.id) {
          const newEnd = sub.endTime + totalDelta;
          return {
            ...sub,
            endTime: newEnd,
            endFrame: Math.floor(newEnd * frameRate),
          };
        }
        if (linkNext && next && sub.id === next.id) {
          const newStart = sub.startTime + phase2;
          return {
            ...sub,
            startTime: newStart,
            startFrame: Math.floor(newStart * frameRate),
          };
        }
        return sub;
      })
      .sort((a, b) => a.startTime - b.startTime);

    get().pushUndo();
    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    const fields = linkNext ? "endTime,startTime" : "endTime";
    debouncedSaveHistory(newSubtitles, "자막 수정", { fields }, fileId, role);
  },

  // 싱크 전체 이동 (Ctrl+Alt + ←/→) - startTime과 endTime을 동시에 delta만큼 이동
  nudgeSync: (subtitleId, delta) => {
    const { subtitles, frameRate, duration } = get();
    if (!delta || subtitles.length === 0) return;

    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);
    if (currentIndex === -1) return;

    const current = sortedSubtitles[currentIndex];
    const prev = currentIndex > 0 ? sortedSubtitles[currentIndex - 1] : null;
    const next =
      currentIndex < sortedSubtitles.length - 1
        ? sortedSubtitles[currentIndex + 1]
        : null;
    const validDuration = duration && duration > 0 ? duration : Infinity;

    let effectiveDelta = delta;

    const lowerBound = -current.startTime;
    if (effectiveDelta < lowerBound) effectiveDelta = lowerBound;

    if (validDuration !== Infinity) {
      const upperBound = validDuration - current.endTime;
      if (effectiveDelta > upperBound) effectiveDelta = upperBound;
    }

    const gap = getMinGap();
    const prevPrev = currentIndex - 2 >= 0 ? sortedSubtitles[currentIndex - 2] : null;
    const nextNext = currentIndex + 2 < sortedSubtitles.length ? sortedSubtitles[currentIndex + 2] : null;

    let phase1 = 0;
    let phase2 = 0;

    if (effectiveDelta < 0 && prev) {
      const gapBeyondMin = current.startTime - prev.endTime - gap;
      if (gapBeyondMin > 0) {
        phase1 = Math.max(effectiveDelta, -gapBeyondMin);
        phase2 = effectiveDelta - phase1;
      } else {
        phase2 = effectiveDelta;
      }
      const lowerBoundPrev = prevPrev ? (prevPrev.endTime + gap - prev.startTime) : -prev.startTime;
      if (phase2 < lowerBoundPrev) {
        phase2 = lowerBoundPrev;
      }
    } else if (effectiveDelta > 0 && next) {
      const gapBeyondMin = next.startTime - current.endTime - gap;
      if (gapBeyondMin > 0) {
        phase1 = Math.min(effectiveDelta, gapBeyondMin);
        phase2 = effectiveDelta - phase1;
      } else {
        phase2 = effectiveDelta;
      }
      const upperBoundNext = nextNext
        ? (nextNext.startTime - gap - next.endTime)
        : (validDuration !== Infinity ? validDuration - next.endTime : Infinity);
      if (phase2 > upperBoundNext) {
        phase2 = upperBoundNext;
      }
    } else {
      phase1 = effectiveDelta;
    }

    const totalDelta = phase1 + phase2;
    if (totalDelta === 0) return;
    const linkedNeighborId = phase2 !== 0
      ? (effectiveDelta < 0 ? prev?.id : next?.id)
      : null;

    const newSubtitles = subtitles
      .map((sub) => {
        if (sub.id === current.id) {
          const newStart = sub.startTime + totalDelta;
          const newEnd = sub.endTime + totalDelta;
          return {
            ...sub,
            startTime: newStart,
            endTime: newEnd,
            startFrame: Math.floor(newStart * frameRate),
            endFrame: Math.floor(newEnd * frameRate),
          };
        }
        if (linkedNeighborId && sub.id === linkedNeighborId) {
          const newStart = sub.startTime + phase2;
          const newEnd = sub.endTime + phase2;
          return {
            ...sub,
            startTime: newStart,
            endTime: newEnd,
            startFrame: Math.floor(newStart * frameRate),
            endFrame: Math.floor(newEnd * frameRate),
          };
        }
        return sub;
      })
      .sort((a, b) => a.startTime - b.startTime);

    get().pushUndo();
    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "자막 수정",
      { fields: "startTime,endTime" },
      fileId,
      role,
    );
  },

  // 선택된 자막 일괄 시간 이동 (bulk sync shift)
  bulkNudgeSync: (ids, delta) => {
    const { subtitles, frameRate, duration } = get();
    if (!delta || !ids || ids.size === 0) return;

    const validDuration = duration && duration > 0 ? duration : Infinity;
    const gap = getMinGap();
    // subtitles 는 invariant 상 정렬되어 있으므로 별도 sort 사본 불필요.
    const sorted = subtitles;

    // 이동 대상 분리 및 경계 싱크 ID 특정
    const movingIds = new Set(ids);
    let boundaryId = null;
    let boundaryLimit = null;

    if (delta > 0) {
      // +방향: 마지막 이동 싱크의 endTime만 클램핑
      const lastMovingIdx = sorted.findLastIndex((s) => movingIds.has(s.id));
      const lastMoving = sorted[lastMovingIdx];
      const nextFixed = sorted.slice(lastMovingIdx + 1).find((s) => !movingIds.has(s.id));
      const newEnd = lastMoving.endTime + delta;
      const limit = nextFixed
        ? nextFixed.startTime - gap
        : (validDuration !== Infinity ? validDuration : Infinity);
      if (newEnd > limit) {
        boundaryId = lastMoving.id;
        boundaryLimit = limit;
      }
    } else {
      // -방향: 첫 이동 싱크의 startTime만 클램핑
      const firstMovingIdx = sorted.findIndex((s) => movingIds.has(s.id));
      const firstMoving = sorted[firstMovingIdx];
      const prevFixed = [...sorted.slice(0, firstMovingIdx)].reverse().find((s) => !movingIds.has(s.id));
      const newStart = firstMoving.startTime + delta;
      const limit = prevFixed ? prevFixed.endTime + gap : 0;
      if (newStart < limit) {
        boundaryId = firstMoving.id;
        boundaryLimit = limit;
      }
    }

    const newSubtitles = subtitles
      .map((sub) => {
        if (!movingIds.has(sub.id)) return sub;
        let newStart = sub.startTime + delta;
        let newEnd = sub.endTime + delta;
        if (sub.id === boundaryId) {
          if (delta > 0) {
            newEnd = boundaryLimit;
          } else {
            newStart = boundaryLimit;
          }
        }
        if (newStart < 0) newStart = 0;
        return {
          ...sub,
          startTime: newStart,
          endTime: newEnd,
          startFrame: Math.floor(newStart * frameRate),
          endFrame: Math.floor(newEnd * frameRate),
        };
      })
      .sort((a, b) => a.startTime - b.startTime);

    get().pushUndo();
    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "싱크 일괄 이동",
      { count: ids.size, delta },
      fileId,
      role,
    );
  },

  // 자막 간격 메우기 - 여러 자막의 endTime을 일괄 변경
  batchUpdateEndTimes: (adjustments) => {
    const { subtitles, frameRate } = get();
    if (!adjustments || adjustments.length === 0) return;

    get().pushUndo();

    const adjustMap = new Map(
      adjustments.map((a) => [a.subtitleId, a.newEndTime]),
    );
    // endTime 만 변경하므로 startTime 정렬 순서는 보존된다 (sort 불필요).
    const newSubtitles = subtitles.map((sub) => {
      const newEnd = adjustMap.get(sub.id);
      if (newEnd !== undefined) {
        return {
          ...sub,
          endTime: newEnd,
          endFrame: Math.floor(newEnd * frameRate),
        };
      }
      return sub;
    });
    checkSorted(newSubtitles, "batchUpdateEndTimes");

    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(newSubtitles, "자막 간격 메우기", {
      count: adjustments.length,
    }, fileId, role);
  },

  // minGap 값에 맞춰 모든 자막의 endTime 일괄 조정
  applyMinGapToAll: (gapMs) => {
    const { subtitles, frameRate } = get();
    if (!subtitles || subtitles.length < 2 || !gapMs || gapMs <= 0) return;

    const gapSec = gapMs / 1000;
    // subtitles 는 invariant 상 항상 정렬되어 있으므로 추가 sort 불필요.
    const adjustments = [];

    for (let i = 0; i < subtitles.length - 1; i++) {
      const current = subtitles[i];
      const next = subtitles[i + 1];
      const currentGap = next.startTime - current.endTime;
      if (currentGap < gapSec) {
        const newEndTime = next.startTime - gapSec;
        if (newEndTime > current.startTime) {
          adjustments.push({ subtitleId: current.id, newEndTime });
        }
      }
    }

    if (adjustments.length === 0) return;

    get().pushUndo();

    const adjustMap = new Map(
      adjustments.map((a) => [a.subtitleId, a.newEndTime]),
    );
    // endTime 만 변경하므로 startTime 정렬 순서는 보존된다 (sort 불필요).
    const newSubtitles = subtitles.map((sub) => {
      const newEnd = adjustMap.get(sub.id);
      if (newEnd !== undefined) {
        return {
          ...sub,
          endTime: newEnd,
          endFrame: Math.floor(newEnd * frameRate),
        };
      }
      return sub;
    });
    checkSorted(newSubtitles, "applyMinGapToAll");

    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(newSubtitles, "MinGap 일괄 적용", {
      gapMs,
      count: adjustments.length,
    }, fileId, role);
  },

  deleteSubtitle: (id) => {
    const { subtitles } = get();
    get().pushUndo();
    const deletedSubtitle = subtitles.find((sub) => sub.id === id);
    const newSubtitles = subtitles.filter((sub) => sub.id !== id);
    set({ subtitles: newSubtitles });

    // 편집 이력 저장
    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "자막 삭제",
      {
        text: deletedSubtitle?.text || "(삭제됨)",
      },
      fileId,
      role,
    );
  },

  // 선택된 자막 일괄 삭제. pushUndo / saveHistory 한 번에 묶어서 단일 undo 로 복원 가능.
  bulkDeleteSubtitles: (ids) => {
    if (!ids || ids.size === 0) return 0;
    const { subtitles } = get();
    const idSet = ids instanceof Set ? ids : new Set(ids);
    const newSubtitles = subtitles.filter((sub) => !idSet.has(sub.id));
    const removedCount = subtitles.length - newSubtitles.length;
    if (removedCount === 0) return 0;

    get().pushUndo();
    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "자막 일괄 삭제",
      { count: removedCount },
      fileId,
      role,
    );
    return removedCount;
  },

  // 이전 자막과 합치기 (Ctrl + ↑)
  mergeWithPrevious: (subtitleId) => {
    const { subtitles, frameRate } = get();
    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);

    // 첫 번째 자막이면 무시
    if (currentIndex <= 0) return null;

    const prevSubtitle = sortedSubtitles[currentIndex - 1];
    const currentSubtitle = sortedSubtitles[currentIndex];

    // 합쳐진 자막 생성
    const mergedText =
      prevSubtitle.text && currentSubtitle.text
        ? `${prevSubtitle.text} ${currentSubtitle.text}`
        : prevSubtitle.text || currentSubtitle.text || "";

    // 출발어(sourceText)도 합치기
    const mergedSourceText =
      prevSubtitle.sourceText && currentSubtitle.sourceText
        ? `${prevSubtitle.sourceText} ${currentSubtitle.sourceText}`
        : prevSubtitle.sourceText || currentSubtitle.sourceText || "";

    // 중간어(middleText)도 합치기
    const mergedMiddleText =
      prevSubtitle.middleText && currentSubtitle.middleText
        ? `${prevSubtitle.middleText} ${currentSubtitle.middleText}`
        : prevSubtitle.middleText || currentSubtitle.middleText || "";

    const mergedSubtitle = {
      ...prevSubtitle,
      endTime: currentSubtitle.endTime,
      endFrame: Math.floor(currentSubtitle.endTime * frameRate),
      text: mergedText,
      sourceText: mergedSourceText,
      middleText: mergedMiddleText,
    };

    // 이전 자막 업데이트 + 현재 자막 삭제
    const newSubtitles = sortedSubtitles
      .filter((s) => s.id !== currentSubtitle.id)
      .map((s) => (s.id === prevSubtitle.id ? mergedSubtitle : s));

    get().pushUndo();
    set({
      subtitles: newSubtitles,
      selectedSubtitleId: prevSubtitle.id,
    });

    // 편집 이력 저장
    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "자막 합치기",
      {
        mergedText: mergedText.substring(0, 50),
      },
      fileId,
      role,
    );

    return prevSubtitle.id; // 합쳐진 자막의 ID 반환
  },

  // 다음 자막과 합치기 (Ctrl + ↓)
  mergeWithNext: (subtitleId) => {
    const { subtitles, frameRate } = get();
    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);

    if (currentIndex < 0 || currentIndex >= sortedSubtitles.length - 1)
      return null;

    const currentSubtitle = sortedSubtitles[currentIndex];
    const nextSubtitle = sortedSubtitles[currentIndex + 1];

    const mergedText =
      currentSubtitle.text && nextSubtitle.text
        ? `${currentSubtitle.text} ${nextSubtitle.text}`
        : currentSubtitle.text || nextSubtitle.text || "";

    const mergedSourceText =
      currentSubtitle.sourceText && nextSubtitle.sourceText
        ? `${currentSubtitle.sourceText} ${nextSubtitle.sourceText}`
        : currentSubtitle.sourceText || nextSubtitle.sourceText || "";

    const mergedMiddleText =
      currentSubtitle.middleText && nextSubtitle.middleText
        ? `${currentSubtitle.middleText} ${nextSubtitle.middleText}`
        : currentSubtitle.middleText || nextSubtitle.middleText || "";

    const mergedSubtitle = {
      ...currentSubtitle,
      endTime: nextSubtitle.endTime,
      endFrame: Math.floor(nextSubtitle.endTime * frameRate),
      text: mergedText,
      sourceText: mergedSourceText,
      middleText: mergedMiddleText,
    };

    const newSubtitles = sortedSubtitles
      .filter((s) => s.id !== nextSubtitle.id)
      .map((s) => (s.id === currentSubtitle.id ? mergedSubtitle : s));

    get().pushUndo();
    set({
      subtitles: newSubtitles,
      selectedSubtitleId: currentSubtitle.id,
    });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "자막 합치기",
      {
        mergedText: mergedText.substring(0, 50),
      },
      fileId,
      role,
    );

    return currentSubtitle.id;
  },

  // 자막 나누기 (Shift + Enter)
  splitSubtitle: (subtitleId, cursorPos, currentText) => {
    const { subtitles, frameRate } = get();
    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);

    if (currentIndex < 0) return null;

    const currentSubtitle = sortedSubtitles[currentIndex];

    // 영상 재생 위치 기준 분할 시간 계산
    const { currentTime } = usePlaybackStore.getState();
    const { subtitleEditor } = useSettingsStore.getState();
    const minSplitGap = subtitleEditor?.minSplitGapSec ?? 0.1;
    const isInRange =
      currentTime > currentSubtitle.startTime + minSplitGap &&
      currentTime < currentSubtitle.endTime - minSplitGap;
    const splitTime = isInRange
      ? currentTime
      : (currentSubtitle.startTime + currentSubtitle.endTime) / 2;

    // 보정값(syncSplitOffsetSec): 분할점 자체를 offset만큼 이동시킨다.
    // 양수면 분할점을 뒤로, 음수면 앞으로 이동시키며 두 자막은 붙어있는 상태를 유지한다.
    const offset = subtitleEditor?.syncSplitOffsetSec || 0;
    let splitPoint = splitTime + offset;
    if (offset > 0) {
      splitPoint = Math.min(splitPoint, currentSubtitle.endTime - 0.001);
    } else if (offset < 0) {
      splitPoint = Math.max(splitPoint, currentSubtitle.startTime + 0.001);
    }
    const firstEndTime = splitPoint;
    const secondStartTime = splitPoint;

    // 텍스트 분할 (현재 편집 중인 텍스트 사용)
    const textToSplit = currentText ?? currentSubtitle.text ?? "";
    const firstText = textToSplit.substring(0, cursorPos).trim();
    const secondText = textToSplit.substring(cursorPos).trim();

    // 기존 자막 업데이트 (앞부분)
    const updatedSubtitle = {
      ...currentSubtitle,
      endTime: firstEndTime,
      endFrame: Math.floor(firstEndTime * frameRate),
      text: firstText,
    };

    // 새 자막 생성 (뒷부분) - 보정값이 적용된 startTime 사용
    const newSubtitle = {
      id: generateUUID(),
      startTime: secondStartTime,
      endTime: currentSubtitle.endTime,
      startFrame: Math.floor(secondStartTime * frameRate),
      endFrame: Math.floor(currentSubtitle.endTime * frameRate),
      text: secondText,
      sourceText: "", // 나누기 시 빈 문자열
      middleText: "", // 나누기 시 빈 문자열
      position: currentSubtitle.position || "bottomCenter",
    };

    // 자막 배열 업데이트
    const newSubtitles = sortedSubtitles.map((s) =>
      s.id === currentSubtitle.id ? updatedSubtitle : s,
    );

    // 새 자막을 올바른 위치에 삽입
    newSubtitles.splice(currentIndex + 1, 0, newSubtitle);

    get().pushUndo();
    set({
      subtitles: newSubtitles,
      selectedSubtitleId: newSubtitle.id,
    });

    // 편집 이력 저장
    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "자막 나누기",
      {
        firstText: firstText.substring(0, 30),
        secondText: secondText.substring(0, 30),
      },
      fileId,
      role,
    );

    return newSubtitle.id; // 새 자막의 ID 반환 (포커스 이동용)
  },

  // 시간 기준 자막 분할 (파형 우클릭 분할 등)
  splitSubtitleAtTime: (subtitleId, splitTime) => {
    const { subtitles, frameRate } = get();
    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);
    if (currentIndex < 0) return null;

    const currentSubtitle = sortedSubtitles[currentIndex];
    if (
      splitTime <= currentSubtitle.startTime ||
      splitTime >= currentSubtitle.endTime
    ) {
      return null;
    }

    // 최소 간격 설정이 켜져 있으면 앞싱크 끝을 당겨 간격 확보
    const gap = getMinGap();
    const firstEndTime =
      gap > 0
        ? Math.max(currentSubtitle.startTime + 0.001, splitTime - gap)
        : splitTime;

    // 텍스트 분할: 첫 줄바꿈 기준으로 첫 줄은 앞싱크, 나머지는 뒷싱크
    const originalText = currentSubtitle.text ?? "";
    const nlIdx = originalText.indexOf("\n");
    const firstText =
      nlIdx >= 0 ? originalText.substring(0, nlIdx).trim() : originalText;
    const secondText =
      nlIdx >= 0 ? originalText.substring(nlIdx + 1).trim() : "";

    // 기존 자막 업데이트 (앞부분) - 스피커/포지션 유지
    const updatedSubtitle = {
      ...currentSubtitle,
      endTime: firstEndTime,
      endFrame: Math.floor(firstEndTime * frameRate),
      text: firstText,
    };

    // 새 자막 생성 (뒷부분) - sourceText/middleText는 비움
    const newSubtitle = {
      id: generateUUID(),
      startTime: splitTime,
      endTime: currentSubtitle.endTime,
      startFrame: Math.floor(splitTime * frameRate),
      endFrame: Math.floor(currentSubtitle.endTime * frameRate),
      text: secondText,
      sourceText: "",
      middleText: "",
      position: currentSubtitle.position || "bottomCenter",
    };

    const newSubtitles = sortedSubtitles.map((s) =>
      s.id === currentSubtitle.id ? updatedSubtitle : s,
    );
    newSubtitles.splice(currentIndex + 1, 0, newSubtitle);

    get().pushUndo();
    set({
      subtitles: newSubtitles,
      selectedSubtitleId: currentSubtitle.id,
    });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "자막 분할",
      { splitTime },
      fileId,
      role,
    );

    return newSubtitle.id;
  },

  // 커서 앞 텍스트를 이전 자막 끝에 이동 (Shift + ↑)
  moveTextToPrevSubtitle: (subtitleId, cursorPos) => {
    const { subtitles } = get();
    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);

    if (currentIndex <= 0) return null;

    const prevSubtitle = sortedSubtitles[currentIndex - 1];
    const currentSubtitle = sortedSubtitles[currentIndex];
    const currentText = currentSubtitle.text || "";

    if (!currentText.trim()) return null;
    if (cursorPos <= 0) return null;

    const beforeCursor = currentText.slice(0, cursorPos).trimEnd();
    const afterCursor = currentText.slice(cursorPos).trimStart();

    if (!beforeCursor) return null;

    const prevText = (prevSubtitle.text || "").trim();
    const newPrevText = prevText ? `${prevText} ${beforeCursor}` : beforeCursor;

    const newSubtitles = sortedSubtitles.map((s) => {
      if (s.id === prevSubtitle.id) {
        return { ...s, text: newPrevText };
      }
      if (s.id === currentSubtitle.id) {
        return { ...s, text: afterCursor };
      }
      return s;
    });

    get().pushUndo();
    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "위 자막으로 텍스트 이동",
      {
        movedText: beforeCursor,
      },
      fileId,
      role,
    );

    return { prevId: prevSubtitle.id, currentId: currentSubtitle.id };
  },

  // 커서 뒤 텍스트를 다음 자막 앞에 이동 (Shift + ↓)
  moveTextToNextSubtitle: (subtitleId, cursorPos) => {
    const { subtitles } = get();
    // subtitles 는 invariant 상 정렬되어 있다. 사본·재정렬 없이 그대로 참조.
    const sortedSubtitles = subtitles;
    const currentIndex = sortedSubtitles.findIndex((s) => s.id === subtitleId);

    if (currentIndex < 0 || currentIndex >= sortedSubtitles.length - 1)
      return null;

    const currentSubtitle = sortedSubtitles[currentIndex];
    const nextSubtitle = sortedSubtitles[currentIndex + 1];
    const currentText = currentSubtitle.text || "";

    if (!currentText.trim()) return null;
    if (cursorPos >= currentText.length) return null;

    const beforeCursor = currentText.slice(0, cursorPos).trimEnd();
    const afterCursor = currentText.slice(cursorPos).trimStart();

    if (!afterCursor) return null;

    const nextText = (nextSubtitle.text || "").trim();
    const newNextText = nextText ? `${afterCursor} ${nextText}` : afterCursor;

    const newSubtitles = sortedSubtitles.map((s) => {
      if (s.id === currentSubtitle.id) {
        return { ...s, text: beforeCursor };
      }
      if (s.id === nextSubtitle.id) {
        return { ...s, text: newNextText };
      }
      return s;
    });

    get().pushUndo();
    set({ subtitles: newSubtitles });

    const { fileId } = get();
    const role = useRoleStore.getState().role;
    debouncedSaveHistory(
      newSubtitles,
      "아래 자막으로 텍스트 이동",
      {
        movedText: afterCursor,
      },
      fileId,
      role,
    );

    return { currentId: currentSubtitle.id, nextId: nextSubtitle.id };
  },

  selectSubtitle: (id) => set({ selectedSubtitleId: id }),
  requestFocus: () => set({ focusRequested: Date.now() }),

  // 자막만 초기화 (미디어 정보는 유지)
  clearSubtitles: () =>
    set({
      subtitles: [],
      undoStack: [],
      redoStack: [],
      selectedSubtitleId: null,
      selectedTimeRange: null,
      subtitleFileName: null,
      lastRestoredInfo: null,
      fileId: null,
    }),

  // undo/redo
  // 자막 객체는 모든 mutation 에서 spread 로 새 객체가 생성되는 immutable 패턴이므로
  // undo/redo 스택은 배열 reference 만 push 하면 되고 항목 단위 클론은 불필요.
  // (자막 1000개 × N history × clone × 매 편집마다 → 큰 GC 압력의 원인이었음)
  // 보관 개수는 performanceStore.settings.maxUndoCount 에서 사용자 조정 가능.
  pushUndo: () => {
    const { subtitles, undoStack } = get();
    const configured = usePerformanceStore.getState().settings?.maxUndoCount;
    const maxUndo = Number.isFinite(configured) && configured > 0 ? configured : 10;
    set({
      undoStack: [...undoStack.slice(-(maxUndo - 1)), subtitles],
      redoStack: [],
    });
  },

  undo: () => {
    const { subtitles, undoStack, redoStack } = get();
    if (undoStack.length === 0) return false;
    const prev = undoStack[undoStack.length - 1];
    set({
      subtitles: prev,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, subtitles],
      selectedSubtitleId: null,
    });
    return true;
  },

  redo: () => {
    const { subtitles, undoStack, redoStack } = get();
    if (redoStack.length === 0) return false;
    const next = redoStack[redoStack.length - 1];
    set({
      subtitles: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, subtitles],
      selectedSubtitleId: null,
    });
    return true;
  },

  // 자막 파일명 설정
  setSubtitleFileName: (fileName) => set({ subtitleFileName: fileName }),

  // 현재 상태를 편집 이력에 즉시 저장 (blur, STT/번역 완료 시 호출)
  saveEditHistorySnapshot: (action = "자막 수정", details = {}) => {
    const { subtitles, fileId } = get();
    const role = useRoleStore.getState().role;
    saveEditHistory(subtitles, action, details, fileId, role);
  },

  // 이력에서 자막 복구 (새 ID 부여)
  restoreFromHistory: (historySubtitles, historyInfo = null) => {
    if (!historySubtitles || !Array.isArray(historySubtitles)) return false;

    const restoredSubtitles = ensureUniqueIds(historySubtitles);

    set({
      subtitles: restoredSubtitles.sort((a, b) => a.startTime - b.startTime),
      selectedSubtitleId: null,
      selectedTimeRange: null,
      subtitleFileName: null, // 복원 시 파일명 초기화
      lastRestoredInfo: historyInfo
        ? {
            action: historyInfo.action,
            timestamp: historyInfo.timestamp,
            subtitleCount: restoredSubtitles.length,
            restoredAt: Date.now(),
          }
        : {
            subtitleCount: restoredSubtitles.length,
            restoredAt: Date.now(),
          },
    });

    return true;
  },

  // 서버 자막 작업(subtitle_works) 이력에서 복원 (work_type별로 적절한 필드에 적용)
  // subtitle_works.subtitle envelope 는 startTime/endTime(초, number) + sourceText/middleText/text 를 사용.
  // 레거시 revision 응답(start/end HH:MM:SS, text) 도 안전하게 매칭한다.
  restoreFromServerRevision: (serverSubtitles, workType) => {
    const { subtitles: currentSubtitles } = get();

    const getSec = (s) => {
      const startSec =
        typeof s.startTime === "number"
          ? s.startTime
          : timeCodeToSeconds(s.start) || 0;
      const endSec =
        typeof s.endTime === "number"
          ? s.endTime
          : timeCodeToSeconds(s.end) || 0;
      return { startSec, endSec };
    };

    const updatedSubtitles = currentSubtitles.map((current) => {
      const matched = serverSubtitles.find((s) => {
        const { startSec, endSec } = getSec(s);
        return (
          Math.abs(startSec - current.startTime) < 0.1 &&
          Math.abs(endSec - current.endTime) < 0.1
        );
      });

      if (!matched) return current;

      if (workType === "START") {
        const value = matched.sourceText ?? matched.text ?? "";
        return { ...current, sourceText: value };
      } else if (workType === "MID") {
        const value = matched.middleText ?? matched.text ?? "";
        return { ...current, middleText: value };
      } else {
        // FINAL
        const value = matched.text ?? "";
        return { ...current, text: value };
      }
    });

    get().pushUndo();
    set({ subtitles: updatedSubtitles });
    return true;
  },

  // 가져오기 시 선택한 필드만 병합 (기존 자막 구조 보존).
  // 시간 기준으로 매칭해 targetField를 채우고, 기존 자막에 매칭되지 않은
  // imported 자막은 해당 필드만 채워진 빈 싱크 row로 추가한다.
  mergeSubtitleField: (importedSubtitles, targetField) => {
    const { subtitles, fileId, frameRate } = get();
    get().pushUndo();

    const tolerance = 0.1;
    const fps = frameRate || 30;
    const usedImportedIdx = new Set();

    const updatedExisting = subtitles.map((existing) => {
      const matchIdx = importedSubtitles.findIndex((imp, i) => {
        if (usedImportedIdx.has(i)) return false;
        const impStart = Number.isFinite(imp.startTime) ? imp.startTime : 0;
        const impEnd = Number.isFinite(imp.endTime) ? imp.endTime : 0;
        return (
          Math.abs(impStart - existing.startTime) < tolerance &&
          Math.abs(impEnd - existing.endTime) < tolerance
        );
      });
      if (matchIdx >= 0) {
        usedImportedIdx.add(matchIdx);
        return {
          ...existing,
          [targetField]: importedSubtitles[matchIdx].text || "",
        };
      }
      return existing;
    });

    const extras = [];
    importedSubtitles.forEach((imp, i) => {
      if (usedImportedIdx.has(i)) return;
      const startTime = Number.isFinite(imp.startTime) ? imp.startTime : 0;
      const endTime = Number.isFinite(imp.endTime) ? imp.endTime : 0;
      const row = {
        id: generateUUID(),
        text: "",
        sourceText: "",
        middleText: "",
        startTime,
        endTime,
        startFrame: Math.floor(startTime * fps),
        endFrame: Math.floor(endTime * fps),
        position: imp.position || "bottomCenter",
        speakerId: null,
      };
      row[targetField] = imp.text || "";
      extras.push(row);
    });

    const merged = [...updatedExisting, ...extras].sort(
      (a, b) => a.startTime - b.startTime,
    );

    set({ subtitles: merged });

    const role = useRoleStore.getState().role;
    debouncedSaveHistory(merged, "자막 영역 가져오기", { field: targetField }, fileId, role);
  },

  // 파형에서 선택된 시간 범위 설정
  setSelectedTimeRange: (range) => set({ selectedTimeRange: range }),
  clearSelectedTimeRange: () => set({ selectedTimeRange: null }),

  // JSON 가져오기/내보내기 (화자 정보, 언어 설정, 권한 포함)
  exportToJson: (role) => {
    const {
      subtitles,
      frameRate,
      sourceLanguage,
      middleLanguage,
      targetLanguage,
    } = get();
    const speakers = useSpeakerStore.getState().speakers;
    const baseRole = getBaseRole(role);

    // 직렬화 전 권한별 텍스트 필드 매핑 (docs/interface/subtitle-json-format.md 참조)
    const filteredSubtitles = mapSubtitlesByPermission(subtitles, baseRole);

    return serializeSubtitleJson({
      subtitles: filteredSubtitles,
      permission: baseRole,
      frameRate,
      languages: {
        source: sourceLanguage,
        middle: middleLanguage,
        target: targetLanguage,
      },
      speakers: Object.values(speakers).sort((a, b) => a.number - b.number),
    });
  },

  // JSON 가져오기.
  // targetField: 'text' | 'sourceText' | 'middleText' — 가져오기 모달에서 선택한 영역.
  //   - 기존 자막이 있고 MID/FINAL 역할이면 "머지 모드": 언어/화자/다른 필드 보존하고 targetField만 갱신.
  //   - 그 외에는 "전체 교체 모드": 언어/화자 복원, 자막 전체 대체.
  importFromJson: (jsonString, currentRole, targetField = "text") => {
    try {
      // envelope / 레거시 배열 양쪽 허용 (docs/interface/subtitle-json-format.md)
      const data = parseSubtitleJson(jsonString);
      if (!data) {
        return { success: false, reason: "parse_error" };
      }

      // v1.3+: 파일의 권한이 현재 사용자보다 높으면 거부
      if (data.permission) {
        if (isHigherRole(data.permission, currentRole)) {
          return {
            success: false,
            reason: "permission_denied",
            filePermission: data.permission,
          };
        }
      }

      const basePermission = data.permission
        ? getBaseRole(data.permission)
        : null;
      const currentBaseRole = getBaseRole(currentRole);

      // 파일의 실제 컨텐츠가 저장된 필드를 권한에 따라 판단해 뽑아낸다.
      // START 권한 파일: sourceText에 내용이 있음 (exportToJson이 text를 sourceText로 옮김).
      // MID 권한 파일: middleText에 내용이 있음.
      // FINAL 권한 파일: text에 내용이 있음.
      const extractFileText = (sub) => {
        if (basePermission === Role.START) return sub.sourceText ?? sub.text ?? "";
        if (basePermission === Role.MID) return sub.middleText ?? sub.text ?? "";
        if (basePermission === Role.FINAL) return sub.text ?? "";
        return sub.text ?? sub.sourceText ?? sub.middleText ?? "";
      };

      const { subtitles: existingSubtitles } = get();
      const isMergeMode =
        existingSubtitles.length > 0 &&
        (currentBaseRole === Role.MID || currentBaseRole === Role.FINAL);

      // 머지 모드: 기존 자막/언어/화자/다른 필드를 모두 보존하고 targetField만 갱신.
      if (isMergeMode) {
        const importedForMerge = (data.subtitles || []).map((sub) => ({
          id: sub.id,
          startTime: sub.startTime,
          endTime: sub.endTime,
          text: extractFileText(sub),
          position: sub.position,
        }));
        get().mergeSubtitleField(importedForMerge, targetField);
        return { success: true };
      }

      // 전체 교체 모드: targetField를 고려해 자막을 재구성.
      const subtitles = ensureUniqueIds(data.subtitles).map((sub) => {
        const newSub = { ...sub };
        const content = extractFileText(sub);

        if (targetField !== "text") {
          // 특정 영역(출발어/중간어)으로 지정된 경우: 해당 필드만 채우고 text는 비움.
          newSub[targetField] = content;
          newSub.text = "";
        } else if (!sub.text && basePermission === currentBaseRole) {
          // 전체 교체 기본 경로: 파일 권한과 현재 역할이 같고 text가 비어 있을 때만
          // 편집 필드(text)를 복원한다. (다른 역할에서 열었을 때 양쪽 필드에
          // 같은 내용이 들어가는 문제 방지)
          newSub.text = content;
        }
        return newSub;
      });

      // 기본 데이터 설정
      const updateData = {
        subtitles: subtitles.sort((a, b) => a.startTime - b.startTime),
        frameRate: data.frameRate || 30,
      };

      // 언어 설정이 있으면 복원 (v1.2+)
      if (data.languages) {
        updateData.sourceLanguage = data.languages.source || "ko";
        updateData.middleLanguage = data.languages.middle || "ko";
        updateData.targetLanguage = data.languages.target || "ko";
      }

      set(updateData);

      // 화자 정보가 있으면 가져오기
      if (data.speakers && Array.isArray(data.speakers)) {
        const speakerState = useSpeakerStore.getState();
        // 기존 화자 정보 초기화 후 새로 설정
        speakerState.clearAllSpeakers();
        data.speakers.forEach((speaker) => {
          if (speaker.number >= 1 && speaker.number <= 100) {
            speakerState.addSpeakerWithNumber(
              speaker.number,
              speaker.name || `화자 ${speaker.number}`,
            );
          }
        });
      }

      return { success: true };
    } catch (error) {
      console.error("JSON 파싱 오류:", error);
      return { success: false, reason: "parse_error" };
    }
  },

  // 파형 데이터
  setWaveformData: (data) => set({ waveformData: data }),

  // 장면 전환 관리
  setSceneChanges: (sceneChanges) => set({ sceneChanges }),
  setIsDetectingScenes: (isDetecting) =>
    set({ isDetectingScenes: isDetecting }),
  setSceneDetectProgress: (progress) => set({ sceneDetectProgress: progress }),
  clearSceneChanges: () => set({ sceneChanges: [], sceneDetectProgress: 0 }),

  // 현재 시간에 해당하는 자막 가져오기
  getCurrentSubtitle: () => {
    const { subtitles } = get();
    const { currentTime } = usePlaybackStore.getState();
    return subtitles.find(
      (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime,
    );
  },

  // 화자 번호 변경 시 자막의 speakerId 일괄 갱신
  updateSpeakerIds: (oldNumber, newNumber) => {
    const { subtitles } = get();
    const oldNum = Number(oldNumber);
    const newNum = Number(newNumber);
    const hasMatch = subtitles.some((sub) => Number(sub.speakerId) === oldNum);
    if (!hasMatch) return;
    const updated = subtitles.map((sub) =>
      Number(sub.speakerId) === oldNum ? { ...sub, speakerId: newNum } : sub,
    );
    set({ subtitles: updated });
  },

  // 초기화
  reset: () => {
    usePlaybackStore.getState().reset();
    set({
      mediaUrl: null,
      mediaType: null,
      mediaFileName: null,
      mediaFileSize: null,
      isServerFile: false,
      fileId: null,
      isServerMode: false,
      serverFileError: null,
      splitStartSec: null,
      splitEndSec: null,
      isMergeMode: false,
      mergeServCd: null,
      mergeFiles: null,
      duration: 0,
      subtitles: [],
      undoStack: [],
      redoStack: [],
      selectedTimeRange: null,
      selectedSubtitleId: null,
      subtitleFileName: null,
      lastRestoredInfo: null,
      waveformData: null,
      serverWaveformOverrideUrl: null,
      sceneChanges: [],
      isDetectingScenes: false,
      sceneDetectProgress: 0,
      // 언어 설정 초기화
      sourceLanguage: "ko",
      middleLanguage: "ko",
      targetLanguage: "ko",
    });
  },
}));
