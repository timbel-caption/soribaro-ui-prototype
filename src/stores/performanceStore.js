/**
 * 성능 설정 Store
 * 사용자 PC의 성능을 최대한 활용하기 위한 옵션들을 관리합니다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 하드웨어 정보 감지
const detectHardwareCapabilities = () => {
  const capabilities = {
    // CPU 논리 코어 수
    cpuCores: navigator.hardwareConcurrency || 4,
    // 디바이스 메모리 (GB)
    deviceMemory: navigator.deviceMemory || 4,
    // GPU 정보 (WebGL)
    gpu: null,
    // Web Worker 지원
    webWorkerSupported: typeof Worker !== 'undefined',
    // OffscreenCanvas 지원 (Worker 내 Canvas 렌더링)
    offscreenCanvasSupported: typeof OffscreenCanvas !== 'undefined',
    // SharedArrayBuffer 지원 (멀티스레드 데이터 공유)
    sharedArrayBufferSupported: typeof SharedArrayBuffer !== 'undefined',
    // WebGL 지원
    webglSupported: false,
    // WebGL2 지원
    webgl2Supported: false,
  };

  // WebGL 정보 감지
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      capabilities.webglSupported = true;
      capabilities.webgl2Supported = !!canvas.getContext('webgl2');
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        capabilities.gpu = {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        };
      }
    }
  } catch (e) {
    // WebGL 사용 불가
  }

  return capabilities;
};

// 하드웨어 기반 추천 설정
const getRecommendedSettings = (capabilities) => {
  const isHighEnd = 
    capabilities.cpuCores >= 8 && 
    capabilities.deviceMemory >= 8 &&
    capabilities.webgl2Supported;

  const isMidRange = 
    capabilities.cpuCores >= 4 && 
    capabilities.deviceMemory >= 4;

  if (isHighEnd) {
    return {
      preset: 'high',
      useWebWorkers: true,
      useGpuAcceleration: true,
      waveformQuality: 'high',
      sceneDetectionQuality: 'high',
      maxParallelWorkers: Math.min(capabilities.cpuCores - 2, 6),
      animationsEnabled: true,
      smoothScrolling: true,
    };
  } else if (isMidRange) {
    return {
      preset: 'balanced',
      useWebWorkers: true,
      useGpuAcceleration: true,
      waveformQuality: 'medium',
      sceneDetectionQuality: 'medium',
      maxParallelWorkers: Math.min(capabilities.cpuCores - 1, 4),
      animationsEnabled: true,
      smoothScrolling: true,
    };
  } else {
    return {
      preset: 'performance',
      useWebWorkers: capabilities.webWorkerSupported,
      useGpuAcceleration: false,
      waveformQuality: 'low',
      sceneDetectionQuality: 'low',
      maxParallelWorkers: 2,
      animationsEnabled: false,
      smoothScrolling: false,
    };
  }
};

export const usePerformanceStore = create(
  persist(
    (set, get) => ({
      // 하드웨어 정보
      hardware: null,
      
      // 성능 설정
      settings: {
        preset: 'auto', // 'auto', 'high', 'balanced', 'performance'
        
        // Web Worker 사용 (멀티코어 CPU 활용)
        useWebWorkers: true,
        
        // GPU 가속 사용 (WebGL/OffscreenCanvas)
        useGpuAcceleration: true,
        
        // 파형 품질 ('low', 'medium', 'high')
        waveformQuality: 'high',
        
        // 장면 감지 품질 ('low', 'medium', 'high')
        sceneDetectionQuality: 'medium',
        
        // 최대 병렬 Worker 수
        maxParallelWorkers: 4,
        
        // 애니메이션 활성화
        animationsEnabled: true,
        
        // 부드러운 스크롤
        smoothScrolling: true,
        
        // 디바운스 간격 (ms)
        debounceInterval: 100,
        
        // 파형 캐시 사용
        useWaveformCache: true,

        // 장면 캐시 사용
        useSceneCache: true,

        // Undo/Redo 보관 개수 (자막 배열 스냅샷 reference 보관)
        // 값이 클수록 자막 배열 reference 가 더 오래 메모리에 남아 GC 가
        // 늦어진다. 일반 작업 기준 10 이면 충분하다.
        maxUndoCount: 10,
      },

      // 하드웨어 정보 초기화
      initHardware: () => {
        const hardware = detectHardwareCapabilities();
        const recommended = getRecommendedSettings(hardware);
        
        set((state) => ({
          hardware,
          settings: state.settings.preset === 'auto' 
            ? { ...state.settings, ...recommended, preset: 'auto' }
            : state.settings,
        }));
        
        return hardware;
      },

      // 설정 업데이트
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      // 프리셋 적용
      applyPreset: (preset) => {
        const { hardware } = get();
        if (!hardware) return;

        let newSettings;
        
        switch (preset) {
          case 'high':
            newSettings = {
              preset: 'high',
              useWebWorkers: true,
              useGpuAcceleration: true,
              waveformQuality: 'high',
              sceneDetectionQuality: 'high',
              maxParallelWorkers: Math.min(hardware.cpuCores, 8),
              animationsEnabled: true,
              smoothScrolling: true,
              debounceInterval: 50,
            };
            break;
          case 'balanced':
            newSettings = {
              preset: 'balanced',
              useWebWorkers: true,
              useGpuAcceleration: true,
              waveformQuality: 'medium',
              sceneDetectionQuality: 'medium',
              maxParallelWorkers: Math.min(hardware.cpuCores - 1, 4),
              animationsEnabled: true,
              smoothScrolling: true,
              debounceInterval: 100,
            };
            break;
          case 'performance':
            newSettings = {
              preset: 'performance',
              useWebWorkers: hardware.webWorkerSupported,
              useGpuAcceleration: false,
              waveformQuality: 'low',
              sceneDetectionQuality: 'low',
              maxParallelWorkers: 2,
              animationsEnabled: false,
              smoothScrolling: false,
              debounceInterval: 200,
            };
            break;
          case 'auto':
          default:
            newSettings = {
              ...getRecommendedSettings(hardware),
              preset: 'auto',
            };
            break;
        }
        
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      // 파형 품질 설정값 반환
      getWaveformOptions: () => {
        const { settings } = get();
        
        switch (settings.waveformQuality) {
          case 'high':
            return {
              zoomLevels: [32, 64, 128, 256, 512, 1024, 2048, 4096],
              multiChannel: true,
            };
          case 'medium':
            return {
              zoomLevels: [64, 128, 256, 512, 1024, 2048],
              multiChannel: false,
            };
          case 'low':
          default:
            return {
              zoomLevels: [128, 256, 512, 1024],
              multiChannel: false,
            };
        }
      },

      // 장면 감지 설정값 반환
      getSceneDetectionOptions: () => {
        const { settings } = get();
        
        switch (settings.sceneDetectionQuality) {
          case 'high':
            return {
              analyzeWidth: 320,
              analyzeHeight: 180,
              sampleInterval: 0.1,
              sampleRate: 2, // 픽셀 샘플링 비율
            };
          case 'medium':
            return {
              analyzeWidth: 160,
              analyzeHeight: 90,
              sampleInterval: 0.25,
              sampleRate: 4,
            };
          case 'low':
          default:
            return {
              analyzeWidth: 80,
              analyzeHeight: 45,
              sampleInterval: 0.5,
              sampleRate: 8,
            };
        }
      },
    }),
    {
      name: 'performance-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => ({
        ...current,
        settings: { ...current.settings, ...persisted?.settings },
      }),
    }
  )
);

