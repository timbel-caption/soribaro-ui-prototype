/**
 * 단축키 설정 Store
 * 사용자 정의 단축키를 LocalStorage에 저장하여 관리합니다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 운영체제 감지
const isMac = typeof navigator !== 'undefined' && (
  navigator.userAgentData?.platform === 'macOS' ||
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
);

/**
 * 기본 단축키 정의
 * - id: 고유 식별자 (코드에서 사용)
 * - modifiers: 수정자 키 배열 ['ctrl', 'meta', 'alt', 'shift']
 * - key: 메인 키 (KeyboardEvent.key 값)
 * - action: 사용자에게 표시될 설명
 * - category: 'common' | 'audio' | 'video'
 */
const DEFAULT_SHORTCUTS = {
  // ========== 싱크 편집 ==========
  mergePrev: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 'ArrowUp',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.mergeSync',
    category: 'audio',
  },
  mergeNext: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 'ArrowDown',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.mergeNextSync',
    category: 'audio',
  },
  splitSync: {
    modifiers: ['shift'],
    key: 'Enter',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.splitSync',
    category: 'video',
  },
  deleteSync: {
    modifiers: ['shift'],
    key: 'Backspace',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.deleteSync',
    category: 'common',
  },
  moveWordUp: {
    modifiers: ['shift'],
    key: 'ArrowUp',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.moveTextUp',
    category: 'common',
  },
  moveWordDown: {
    modifiers: ['shift'],
    key: 'ArrowDown',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.moveTextDown',
    category: 'common',
  },

  // ========== 재생 컨트롤 ==========
  playSelectedSync: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: ' ',  // Space
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.playSelectedSync',
    category: 'common',
  },
  playClickedSync: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 'Click',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.playClickedSync',
    category: 'common',
  },
  playPause: {
    modifiers: ['shift'],
    key: ' ',  // Space
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.togglePlayPause',
    category: 'common',
  },
  // ========== 시간 이동 ==========
  seekBackward: {
    modifiers: ['shift'],
    key: 'ArrowLeft',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.seekBackward',
    category: 'common',
  },
  seekForward: {
    modifiers: ['shift'],
    key: 'ArrowRight',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.seekForward',
    category: 'common',
  },

  // ========== 싱크 미세 조정 ==========
  adjustSyncStart: {
    modifiers: isMac ? ['alt'] : ['alt'],
    key: 'ArrowLeft',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.nudgeStartForward',
    category: 'video',
  },
  adjustSyncEnd: {
    modifiers: isMac ? ['alt'] : ['alt'],
    key: 'ArrowRight',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.nudgeStartBackward',
    category: 'video',
  },
  adjustSyncEndPointLeft: {
    modifiers: isMac ? ['alt', 'shift'] : ['alt', 'shift'],
    key: 'ArrowLeft',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.nudgeEndForward',
    category: 'video',
  },
  adjustSyncEndPointRight: {
    modifiers: isMac ? ['alt', 'shift'] : ['alt', 'shift'],
    key: 'ArrowRight',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.nudgeEndBackward',
    category: 'video',
  },
  nudgeSyncLeft: {
    modifiers: isMac ? ['ctrl', 'alt'] : ['ctrl', 'alt'],
    key: 'ArrowLeft',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.nudgeSyncForward',
    category: 'video',
  },
  nudgeSyncRight: {
    modifiers: isMac ? ['ctrl', 'alt'] : ['ctrl', 'alt'],
    key: 'ArrowRight',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.nudgeSyncBackward',
    category: 'video',
  },

  // ========== 싱크 라인 이동 ==========
  prevSyncLine: {
    modifiers: isMac ? ['alt'] : ['alt'],
    key: 'ArrowUp',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.prevSync',
    category: 'video',
  },
  nextSyncLine: {
    modifiers: isMac ? ['alt'] : ['alt'],
    key: 'ArrowDown',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.nextSync',
    category: 'video',
  },

  // ========== 저장 ==========
  save: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 's',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.save',
    category: 'common',
  },

  // ========== 자막 편집 (기타) ==========
  addRow: {
    modifiers: isMac ? ['meta', 'shift'] : ['ctrl', 'shift'],
    key: 'Enter',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.addSubtitle',
    category: 'common',
  },

  toggleCheck: {
    modifiers: [],
    key: 'Tab',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.toggleCheckbox',
    category: 'common',
  },

  // ========== 기타 ==========
  undo: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 'z',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.undo',
    category: 'common',
  },
  redo: {
    modifiers: isMac ? ['meta', 'shift'] : ['ctrl', 'shift'],
    key: 'z',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.redo',
    category: 'common',
  },
  find: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 'f',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.findReplace',
    category: 'common',
  },
  outSync: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 'Enter',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.outSync',
    category: 'common',
  },
  toggleEditMode: {
    modifiers: ['alt'],
    key: 'Enter',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.toggleEditMode',
    category: 'common',
  },
  selectSpeaker: {
    modifiers: isMac ? ['meta'] : ['ctrl'],
    key: 'F1',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.openSpeakerDropdown',
    category: 'common',
  },
  useBoilerplate: {
    modifiers: [],
    key: 'F3',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.useBoilerplate',
    category: 'common',
  },
  registerBoilerplate: {
    modifiers: [],
    key: 'F10',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.registerBoilerplate',
    category: 'common',
  },
  openSpeakerManager: {
    modifiers: [],
    key: 'F12',
    modifiers2: null,
    key2: null,
    actionKey: 'settings.shortcuts.manageSpeakers',
    category: 'common',
  },
};

const normalizeKey = (key) => (key || '').toLowerCase();

const shortcutToCombo = (shortcut, forMac = isMac) => {
  const modifiers = new Set(shortcut.modifiers || []);
  const parts = [];

  if (forMac) {
    if (modifiers.has('ctrl') || modifiers.has('meta')) {
      parts.push('cm');
    }
  } else {
    if (modifiers.has('ctrl')) parts.push('ctrl');
    if (modifiers.has('meta')) parts.push('meta');
  }
  if (modifiers.has('alt')) parts.push('alt');
  if (modifiers.has('shift')) parts.push('shift');

  parts.push(normalizeKey(shortcut.key));
  return parts.join('+');
};

const eventToCombo = (event, forMac = isMac) => {
  const parts = [];
  if (forMac) {
    if (event.ctrlKey || event.metaKey) parts.push('cm');
  } else {
    if (event.ctrlKey) parts.push('ctrl');
    if (event.metaKey) parts.push('meta');
  }
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  parts.push(normalizeKey(event.key));
  return parts.join('+');
};

const buildShortcutMap = (shortcuts, forMac = isMac) => {
  const map = new Map();
  Object.entries(shortcuts).forEach(([id, shortcut]) => {
    map.set(shortcutToCombo(shortcut, forMac), id);
    if (shortcut.key2) {
      const sub = { modifiers: shortcut.modifiers2 || [], key: shortcut.key2 };
      map.set(shortcutToCombo(sub, forMac), id);
    }
  });
  return map;
};

// 키 표시 이름 변환
export const getKeyDisplayName = (key) => {
  const keyMap = {
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    ' ': 'Space',
    'Escape': 'Esc',
    'Backspace': 'Backspace',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Home': 'Home',
    'End': 'End',
    'Delete': 'Delete',
  };
  return keyMap[key] || key.toUpperCase();
};

// 수정자 키 표시 이름 변환
export const getModifierDisplayName = (modifier, forMac = isMac) => {
  const modMap = {
    ctrl: forMac ? '⌃' : 'Ctrl',
    meta: '⌘',
    alt: forMac ? '⌥' : 'Alt',
    shift: 'Shift',
  };
  return modMap[modifier] || modifier;
};

// 단축키를 표시용 문자열 배열로 변환
export const shortcutToDisplayKeys = (shortcut, forMac = isMac) => {
  const keys = [];
  shortcut.modifiers.forEach(mod => {
    keys.push(getModifierDisplayName(mod, forMac));
  });
  keys.push(getKeyDisplayName(shortcut.key, forMac));
  return keys;
};

export const useShortcutsStore = create(
  persist(
    (set, get) => ({
      shortcuts: { ...DEFAULT_SHORTCUTS },
      shortcutMap: buildShortcutMap(DEFAULT_SHORTCUTS),

      // 단축키 업데이트
      updateShortcut: (id, newShortcut) => {
        set((state) => {
          const shortcuts = {
            ...state.shortcuts,
            [id]: { ...state.shortcuts[id], ...newShortcut },
          };
          return {
            shortcuts,
            shortcutMap: buildShortcutMap(shortcuts),
          };
        });
      },

      // 특정 단축키 초기화
      resetShortcut: (id) => {
        set((state) => {
          const shortcuts = {
            ...state.shortcuts,
            [id]: { ...DEFAULT_SHORTCUTS[id] },
          };
          return {
            shortcuts,
            shortcutMap: buildShortcutMap(shortcuts),
          };
        });
      },

      // 전체 초기화
      resetAllShortcuts: () => {
        const shortcuts = { ...DEFAULT_SHORTCUTS };
        set({
          shortcuts,
          shortcutMap: buildShortcutMap(shortcuts),
        });
      },

      // 키 이벤트가 특정 단축키와 일치하는지 확인
      matchesShortcut: (event, shortcutId) => {
        const shortcut = get().shortcuts[shortcutId];
        if (!shortcut) return false;

        const hasCtrl = shortcut.modifiers.includes('ctrl');
        const hasMeta = shortcut.modifiers.includes('meta');
        const hasAlt = shortcut.modifiers.includes('alt');
        const hasShift = shortcut.modifiers.includes('shift');

        // macOS에서는 meta(⌘)와 ctrl을 같이 처리
        const ctrlOrMetaMatch = isMac
          ? (hasCtrl || hasMeta) === (event.ctrlKey || event.metaKey)
          : hasCtrl === event.ctrlKey && hasMeta === event.metaKey;

        const modifiersMatch =
          ctrlOrMetaMatch &&
          hasAlt === event.altKey &&
          hasShift === event.shiftKey;

        // 키 비교 (대소문자 무시)
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase() ||
                         event.key === shortcut.key;

        return modifiersMatch && keyMatch;
      },

      // 이벤트에 해당하는 단축키 id 반환 (캐시 기반)
      getShortcutId: (event) => {
        const combo = eventToCombo(event);
        return get().shortcutMap.get(combo) || null;
      },

      // 서브 단축키 삭제
      clearSubShortcut: (id) => {
        set((state) => {
          const shortcuts = {
            ...state.shortcuts,
            [id]: { ...state.shortcuts[id], modifiers2: null, key2: null },
          };
          return {
            shortcuts,
            shortcutMap: buildShortcutMap(shortcuts),
          };
        });
      },

      // 단축키 목록을 배열로 반환 (UI 표시용)
      getShortcutsList: () => {
        const shortcuts = get().shortcuts;
        return Object.entries(shortcuts).map(([id, shortcut]) => ({
          id,
          ...shortcut,
          displayKeys: shortcutToDisplayKeys(shortcut),
          displayKeys2: shortcut.key2
            ? shortcutToDisplayKeys({ modifiers: shortcut.modifiers2 || [], key: shortcut.key2 })
            : null,
        }));
      },

      // 중복 단축키 확인 (메인 + 서브 모두 검사)
      checkDuplicate: (modifiers, key, excludeId = null, excludeSlot = null) => {
        const shortcuts = get().shortcuts;
        const modSet = [...modifiers].sort().join(',');
        const keyLower = key.toLowerCase();

        for (const [id, shortcut] of Object.entries(shortcuts)) {
          const mainModSet = [...(shortcut.modifiers || [])].sort().join(',');
          const isMainMatch = mainModSet === modSet && shortcut.key.toLowerCase() === keyLower;
          if (isMainMatch && !(id === excludeId && excludeSlot === 'main')) {
            return { isDuplicate: true, conflictWith: `${shortcut.action} (메인)` };
          }

          if (shortcut.key2) {
            const subModSet = [...(shortcut.modifiers2 || [])].sort().join(',');
            const isSubMatch = subModSet === modSet && shortcut.key2.toLowerCase() === keyLower;
            if (isSubMatch && !(id === excludeId && excludeSlot === 'sub')) {
              return { isDuplicate: true, conflictWith: `${shortcut.action} (서브)` };
            }
          }
        }
        return { isDuplicate: false };
      },

      // 기본값 가져오기 (비교용)
      getDefaultShortcut: (id) => DEFAULT_SHORTCUTS[id],
    }),
    {
      name: 'app-shortcuts',
      partialize: (state) => ({
        shortcuts: state.shortcuts,
      }),
      merge: (persistedState, currentState) => {
        const persistedShortcuts = persistedState?.shortcuts || {};
        const shortcuts = {};
        for (const id of Object.keys(DEFAULT_SHORTCUTS)) {
          shortcuts[id] = {
            ...DEFAULT_SHORTCUTS[id],
            ...(persistedShortcuts[id] || {}),
          };
        }
        return {
          ...currentState,
          ...persistedState,
          shortcuts,
          shortcutMap: buildShortcutMap(shortcuts),
        };
      },
    }
  )
);

// 기본 단축키 내보내기 (초기화 등에 사용)
export { DEFAULT_SHORTCUTS, isMac };
