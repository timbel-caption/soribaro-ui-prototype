import { create } from 'zustand';

// 24개의 화자 색상 (다크 테마에서 분별력이 좋은 고채도 팔레트).
// 인접 번호끼리는 색상환에서 최대한 떨어지도록 배치해 옆 행과 헷갈리지 않게 한다.
export const SPEAKER_COLORS = [
  '#FF1744', // 1  vivid red
  '#00E5FF', // 2  cyan
  '#FFD600', // 3  yellow
  '#D500F9', // 4  magenta
  '#00E676', // 5  green
  '#FF6D00', // 6  orange
  '#2979FF', // 7  blue
  '#F50057', // 8  pink
  '#76FF03', // 9  lime
  '#651FFF', // 10 violet
  '#FFAB00', // 11 amber
  '#1DE9B6', // 12 mint
  '#FF4081', // 13 hot pink
  '#3D5AFE', // 14 indigo
  '#C6FF00', // 15 chartreuse
  '#AA00FF', // 16 purple
  '#00B0FF', // 17 sky blue
  '#FF8A65', // 18 coral
  '#69F0AE', // 19 emerald
  '#B388FF', // 20 lavender
  '#FFCA28', // 21 gold
  '#26A69A', // 22 teal
  '#EC407A', // 23 rose
  '#7E57C2', // 24 plum
];

// hex ↔ HSL 변환 (25번 이상 화자에 대한 색조 회전용).
const hexToHsl = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    h *= 60;
  }
  return [h, s, l];
};

const hslToHex = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v) => {
    const n = Math.round((v + m) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

// 색상 인덱스 가져오기 (번호에 따라 순환, 1번부터 시작).
// 25번부터는 단순 modulo 가 아니라 색조(hue) 를 회전 + 명도를 교대로 살짝 조정해
// 기존 24색과 겹치지 않는 변형을 반환한다.
export const getSpeakerColor = (speakerNumber) => {
  const len = SPEAKER_COLORS.length;
  const idx = (speakerNumber - 1) % len;
  const cycle = Math.floor((speakerNumber - 1) / len);
  const base = SPEAKER_COLORS[idx];
  if (cycle === 0) return base;
  const [h, s, l] = hexToHsl(base);
  // 사이클마다 색조를 ~15° 회전 → 24*N 마다 한 바퀴 정도 돌게 됨.
  const newH = (h + cycle * 15 + 360) % 360;
  // 사이클이 깊어질수록 명도를 교대로 변경해 추가 분별력 확보.
  const lShift = cycle % 2 === 1 ? -0.08 : 0.08;
  const newL = Math.min(0.85, Math.max(0.35, l + lShift));
  return hslToHex(newH, s, newL);
};

const STORAGE_PREFIX = 'soribaro-speakers-';

const saveToLocal = (projectFileId, speakers) => {
  if (!projectFileId) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + projectFileId, JSON.stringify(speakers));
  } catch {}
};

const loadFromLocal = (projectFileId) => {
  if (!projectFileId) return {};
  try {
    const data = localStorage.getItem(STORAGE_PREFIX + projectFileId);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const useSpeakerStore = create(
  (set, get) => ({
    speakers: {},
    currentProjectFileId: null,

    // 프로젝트 파일 변경 시 호출 — 해당 projectFileId의 화자 데이터 로드
    loadSpeakersForFile: (projectFileId) => {
      if (!projectFileId) return;
      const speakers = loadFromLocal(projectFileId);
      set({ speakers, currentProjectFileId: projectFileId });
    },

    // 화자 추가 (다음 사용 가능한 번호 자동 할당)
    addSpeaker: (name = '') => {
      const { speakers, currentProjectFileId } = get();
      
      let nextNumber = 1;
      for (let i = 1; i <= 100; i++) {
        if (!speakers[i]) {
          nextNumber = i;
          break;
        }
      }
      
      if (Object.keys(speakers).length >= 100) {
        return null;
      }
      
      const color = getSpeakerColor(nextNumber);
      const newSpeakers = {
        ...speakers,
        [nextNumber]: {
          number: nextNumber,
          name: name || `화자 ${nextNumber}`,
          color,
        },
      };
      
      set({ speakers: newSpeakers });
      saveToLocal(currentProjectFileId, newSpeakers);
      
      return nextNumber;
    },

    // 특정 번호로 화자 추가
    addSpeakerWithNumber: (number, name = '') => {
      const { speakers, currentProjectFileId } = get();
      
      if (number < 1 || number > 100) return false;
      if (speakers[number]) return false;
      
      const color = getSpeakerColor(number);
      const newSpeakers = {
        ...speakers,
        [number]: {
          number,
          name: name || `화자 ${number}`,
          color,
        },
      };
      
      set({ speakers: newSpeakers });
      saveToLocal(currentProjectFileId, newSpeakers);
      
      return true;
    },

    // 화자 이름 수정
    updateSpeakerName: (number, name) => {
      const { speakers, currentProjectFileId } = get();
      
      if (!speakers[number]) return false;
      
      const newSpeakers = {
        ...speakers,
        [number]: {
          ...speakers[number],
          name,
        },
      };
      
      set({ speakers: newSpeakers });
      saveToLocal(currentProjectFileId, newSpeakers);
      
      return true;
    },

    // 화자 번호 변경
    updateSpeakerNumber: (oldNumber, newNumber) => {
      const { speakers, currentProjectFileId } = get();
      if (!speakers[oldNumber] || newNumber < 1 || newNumber > 100) return false;
      if (oldNumber === newNumber) return true;
      if (speakers[newNumber]) return false;

      const speaker = speakers[oldNumber];
      const newSpeakers = { ...speakers };
      delete newSpeakers[oldNumber];
      newSpeakers[newNumber] = {
        ...speaker,
        number: newNumber,
        color: getSpeakerColor(newNumber),
      };

      set({ speakers: newSpeakers });
      saveToLocal(currentProjectFileId, newSpeakers);

      return true;
    },

    // 화자 삭제
    removeSpeaker: (number) => {
      const { speakers, currentProjectFileId } = get();
      
      if (!speakers[number]) return false;
      
      const newSpeakers = { ...speakers };
      delete newSpeakers[number];
      
      set({ speakers: newSpeakers });
      saveToLocal(currentProjectFileId, newSpeakers);
      
      return true;
    },

    // 화자 정보 가져오기
    getSpeaker: (number) => {
      return get().speakers[number] || null;
    },

    // 정렬된 화자 목록 가져오기
    getSpeakerList: () => {
      const { speakers } = get();
      return Object.values(speakers).sort((a, b) => a.number - b.number);
    },

    // 다음 사용 가능한 번호 가져오기
    getNextAvailableNumber: () => {
      const { speakers } = get();
      for (let i = 1; i <= 100; i++) {
        if (!speakers[i]) {
          return i;
        }
      }
      return null;
    },

    // 전체 초기화
    clearAllSpeakers: () => {
      const { currentProjectFileId } = get();
      set({ speakers: {} });
      saveToLocal(currentProjectFileId, {});
    },
  })
);
