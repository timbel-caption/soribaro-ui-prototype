import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 샘플 크기 옵션 (낮을수록 고해상도, 높은 확대 가능)
export const SAMPLES_PER_PIXEL_OPTIONS = [
  { value: 64, labelKey: 'settings.waveform.spp64Label', descKey: 'settings.waveform.spp64Desc' },
  { value: 128, labelKey: 'settings.waveform.spp128Label', descKey: 'settings.waveform.spp128Desc' },
  { value: 256, labelKey: 'settings.waveform.spp256Label', descKey: 'settings.waveform.spp256Desc' },
  { value: 512, labelKey: 'settings.waveform.spp512Label', descKey: 'settings.waveform.spp512Desc' },
];

// 파형 렌더링 모드 옵션
export const WAVEFORM_RENDER_MODES = [
  { value: 'bar', labelKey: 'settings.waveform.modeBar', descKey: 'settings.waveform.modeBarDesc' },
  { value: 'line', labelKey: 'settings.waveform.modeLine', descKey: 'settings.waveform.modeLineDesc' },
];

// 기본 파형 설정
export const DEFAULT_WAVEFORM_SETTINGS = {
  samplesPerPixel: 64, // 파형 샘플 크기 (낮을수록 고해상도)
  renderMode: 'bar', // 파형 렌더링 모드: 'bar' | 'line'
  lineWidth: 1.5, // 라인 모드 시 선 두께
  amplitudeScale: 1.0, // 파형 증폭 배율 (0.5 ~ 5.0)
};

// 기본 파형 색상 설정
export const DEFAULT_WAVEFORM_COLORS = {
  waveformColor: '#00d9ff',           // 파형 색상
  playedWaveformColor: '#ff6b6b',     // 재생된 파형 색상
  playheadColor: '#ffffff',           // 재생 헤드 라인 색상
  playheadTextColor: '#ffffff',       // 재생 헤드 시간 텍스트 색상
  segmentOverlayColor: 'rgba(0, 217, 255, 0.25)',  // 세그먼트 오버레이
  segmentSelectedColor: 'rgba(255, 193, 7, 0.55)', // 선택된 세그먼트
  segmentContextTargetColor: 'rgba(168, 85, 247, 0.6)', // 우클릭 컨텍스트 메뉴 타겟 세그먼트
  segmentStartMarker: '#4ade80',      // 세그먼트 시작 마커 (그린)
  segmentEndMarker: '#f87171',        // 세그먼트 끝 마커 (레드)
  sceneMarkerColor: '#4ade80',        // 장면 전환 마커
  axisLabelColor: '#888888',          // 축 레이블 색상
  axisGridlineColor: '#333333',       // 축 그리드라인 색상
};

// 색상 설정 레이블 키 (i18n)
export const COLOR_LABEL_KEYS = {
  waveformColor: 'settings.waveform.colorWaveform',
  playedWaveformColor: 'settings.waveform.colorPlayed',
  playheadColor: 'settings.waveform.colorPlayhead',
  playheadTextColor: 'settings.waveform.colorPlayheadText',
  segmentOverlayColor: 'settings.waveform.colorSegment',
  segmentSelectedColor: 'settings.waveform.colorSegmentSelected',
  segmentContextTargetColor: 'settings.waveform.colorSegmentContextTarget',
  segmentStartMarker: 'settings.waveform.colorStartMarker',
  segmentEndMarker: 'settings.waveform.colorEndMarker',
  sceneMarkerColor: 'settings.waveform.colorSceneMarker',
  axisLabelColor: 'settings.waveform.colorAxisLabel',
  axisGridlineColor: 'settings.waveform.colorAxisGrid',
};

// 프리셋 색상 테마
export const COLOR_PRESETS = {
  default: {
    nameKey: 'settings.waveform.presetDefault',
    icon: '🌊',
    colors: { ...DEFAULT_WAVEFORM_COLORS },
  },
  warm: {
    nameKey: 'settings.waveform.presetWarm',
    icon: '🔥',
    colors: {
      waveformColor: '#f97316',
      playedWaveformColor: '#dc2626',
      playheadColor: '#fef3c7',
      playheadTextColor: '#fef3c7',
      segmentOverlayColor: 'rgba(249, 115, 22, 0.25)',
      segmentSelectedColor: 'rgba(234, 179, 8, 0.55)',
      segmentContextTargetColor: 'rgba(168, 85, 247, 0.6)',
      segmentStartMarker: '#84cc16',
      segmentEndMarker: '#ef4444',
      sceneMarkerColor: '#fbbf24',
      axisLabelColor: '#a8a29e',
      axisGridlineColor: '#44403c',
    },
  },
  cool: {
    nameKey: 'settings.waveform.presetCool',
    icon: '❄️',
    colors: {
      waveformColor: '#06b6d4',
      playedWaveformColor: '#8b5cf6',
      playheadColor: '#e0f2fe',
      playheadTextColor: '#e0f2fe',
      segmentOverlayColor: 'rgba(6, 182, 212, 0.25)',
      segmentSelectedColor: 'rgba(139, 92, 246, 0.55)',
      segmentContextTargetColor: 'rgba(217, 70, 239, 0.6)',
      segmentStartMarker: '#22d3ee',
      segmentEndMarker: '#a78bfa',
      sceneMarkerColor: '#67e8f9',
      axisLabelColor: '#94a3b8',
      axisGridlineColor: '#334155',
    },
  },
  neon: {
    nameKey: 'settings.waveform.presetNeon',
    icon: '💜',
    colors: {
      waveformColor: '#c026d3',
      playedWaveformColor: '#22c55e',
      playheadColor: '#f0abfc',
      playheadTextColor: '#f0abfc',
      segmentOverlayColor: 'rgba(192, 38, 211, 0.3)',
      segmentSelectedColor: 'rgba(34, 197, 94, 0.55)',
      segmentContextTargetColor: 'rgba(217, 70, 239, 0.65)',
      segmentStartMarker: '#a855f7',
      segmentEndMarker: '#ec4899',
      sceneMarkerColor: '#f0abfc',
      axisLabelColor: '#9ca3af',
      axisGridlineColor: '#374151',
    },
  },
  monochrome: {
    nameKey: 'settings.waveform.presetMono',
    icon: '⚫',
    colors: {
      waveformColor: '#e5e5e5',
      playedWaveformColor: '#737373',
      playheadColor: '#ffffff',
      playheadTextColor: '#ffffff',
      segmentOverlayColor: 'rgba(229, 229, 229, 0.2)',
      segmentSelectedColor: 'rgba(163, 163, 163, 0.55)',
      segmentContextTargetColor: 'rgba(216, 180, 254, 0.55)',
      segmentStartMarker: '#d4d4d4',
      segmentEndMarker: '#737373',
      sceneMarkerColor: '#f5f5f5',
      axisLabelColor: '#a3a3a3',
      axisGridlineColor: '#404040',
    },
  },
};

export const useWaveformColorStore = create(
  persist(
    (set, get) => ({
      colors: { ...DEFAULT_WAVEFORM_COLORS },
      currentPreset: 'default',
      settings: { ...DEFAULT_WAVEFORM_SETTINGS },
      
      // 파형 설정 변경
      setSetting: (key, value) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        }));
      },
      
      // 샘플 크기 변경
      setSamplesPerPixel: (value) => {
        set((state) => ({
          settings: { ...state.settings, samplesPerPixel: value },
        }));
      },
      
      // 렌더링 모드 변경
      setRenderMode: (mode) => {
        set((state) => ({
          settings: { ...state.settings, renderMode: mode },
        }));
      },
      
      // 라인 두께 변경
      setLineWidth: (width) => {
        set((state) => ({
          settings: { ...state.settings, lineWidth: width },
        }));
      },
      
      // 단일 색상 변경
      setColor: (key, value) => {
        set((state) => ({
          colors: { ...state.colors, [key]: value },
          currentPreset: 'custom', // 개별 변경 시 커스텀으로 전환
        }));
      },
      
      // 여러 색상 한번에 변경
      setColors: (newColors) => {
        set((state) => ({
          colors: { ...state.colors, ...newColors },
          currentPreset: 'custom',
        }));
      },
      
      // 프리셋 적용
      applyPreset: (presetKey) => {
        const preset = COLOR_PRESETS[presetKey];
        if (preset) {
          set({
            colors: { ...preset.colors },
            currentPreset: presetKey,
          });
        }
      },
      
      // 기본값으로 초기화
      resetToDefault: () => {
        set({
          colors: { ...DEFAULT_WAVEFORM_COLORS },
          currentPreset: 'default',
          settings: { ...DEFAULT_WAVEFORM_SETTINGS },
        });
      },
      
      // 특정 색상 가져오기
      getColor: (key) => {
        return get().colors[key] || DEFAULT_WAVEFORM_COLORS[key];
      },
      
      // 모든 색상 가져오기
      getAllColors: () => {
        return get().colors;
      },
    }),
    {
      name: 'soribaro-waveform-colors',
      merge: (persisted, current) => ({
        ...current,
        colors: { ...DEFAULT_WAVEFORM_COLORS, ...persisted?.colors },
        settings: { ...DEFAULT_WAVEFORM_SETTINGS, ...persisted?.settings },
        currentPreset: persisted?.currentPreset ?? current.currentPreset,
      }),
    }
  )
);

