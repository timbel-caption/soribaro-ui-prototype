/**
 * 환경설정 Store
 * 일반 설정, AI 설정 등을 LocalStorage에 저장하여 관리합니다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      // ========== 일반 설정 ==========
      general: {
        // 초당 최대 글자 수 (CPS - Characters Per Second)
        maxCharactersPerSec: 21,
        
        // 분당 최대 단어 수 (WPM - Words Per Minute)
        maxWordsPerMin: 160,
        
        // 최소 자막 지속 시간 (ms)
        minDurationMs: 833,
        
        // 최대 자막 지속 시간 (ms)
        maxDurationMs: 7000,
        
        // 자막 간 최소 간격 (ms)
        minGapMs: 0,

        // 최소 간격 적용 여부
        minGapEnabled: false,
        
        // 최대 줄 수
        maxNumberOfLines: 2,

        // 줄당 최대 글자 수
        maxLineLength: 16,

        // 글자 수 카운트 프리셋
        charCountPreset: 'cjkWeighted',
        
        // 기본 프레임레이트
        defaultFramerate: 29.97,
      },

      // ========== AI 설정 ==========
      ai: {
        // Clova API Key
        clovaKey: '',
        
        // OpenAI API Key
        openaiKey: '',
        
        // Gemini API Key
        geminiKey: '',
        
        // 기본 AI 서비스 선택
        defaultProvider: 'openai', // 'clova', 'openai', 'gemini'
      },

      // ========== 자막 편집 설정 ==========
      subtitleEditor: {
        // 폰트 패밀리
        fontFamily: "'Noto Sans Mono', 'JetBrains Mono', monospace",

        // 폰트 크기 (px)
        fontSize: 13,

        // 가이드라인 기준 문자 ('cjk' = 한글 기준, 'ascii' = 영문 기준)
        guidelineBase: 'cjk',

        // 가이드라인 색상 (가이드라인 위치는 aiStore.stt.segmentOptions.maxSegmentLength)
        guidelineColor: 'rgba(255, 100, 100, 0.4)',

        // 싱크 이동 단위 (초, UI에서는 ms로 표시)
        syncStartNudgeStepSec: 0.001,

        // 싱크 보정값 (초) - 자막 나누기 시 두 번째 자막 시작점을 뒤로 미는 값
        syncSplitOffsetSec: 0,

        // 싱크 나누기 최소 간격 (초) - currentTime이 자막 경계에 너무 가까울 때 midTime 폴백 기준
        minSplitGapSec: 0.1,

        // 시간 이동 단위 (초)
        mediaSeekStepSec: 3,

        // 간격 메우기: 감지 간격 (ms)
        gapFillDetectMs: 400,

        // 간격 메우기: 변경 간격 (ms)
        gapFillTargetMs: 0,
      },

      // ========== WorkTool UI 상태 ==========
      worktoolUi: {
        videoMinimized: false,
        overlayFontSize: 18,
        overlayOpacity: 85,
        overlayBgOpacity: 85,
        // 자막 카드의 좌측 컬럼(화자/위치/번호) 너비 (px). 사용자 드래그로 조절.
        cardLeftWidth: 100,
        // 재생 중 활성 자막으로 자동 스크롤 여부. 화자 변경 등 편집 중 시야 고정을 원하면 OFF.
        autoScroll: true,
        waveform: {
          showTimeGrid: true,
        },
        // mode(video/audio)별 레이아웃 크기 저장
        layoutByMode: {},
        // 컬럼 표시 설정
        columnVisibility: {
          speakerPosition: true,
          sourceText: true,
          middleText: true,
        },
        // 툴바 버튼 표시 설정
        toolbarVisibility: {
          history: true,
          accuracy: true,
          aiQc: true,
          netflixQc: true,
          speaker: true,
          boilerplate: true,
          gapFill: true,
          minGap: true,
          findReplace: true,
          timeJump: true,
          filter: true,
          guideline: true,
        },
      },

      // ========== 액션 ==========
      
      // 일반 설정 업데이트
      updateGeneral: (newSettings) => {
        set((state) => ({
          general: { ...state.general, ...newSettings },
        }));
      },

      // AI 설정 업데이트
      updateAI: (newSettings) => {
        set((state) => ({
          ai: { ...state.ai, ...newSettings },
        }));
      },

      // 자막 편집 설정 업데이트
      updateSubtitleEditor: (newSettings) => {
        set((state) => ({
          subtitleEditor: { ...state.subtitleEditor, ...newSettings },
        }));
      },

      // WorkTool UI 상태 업데이트
      updateWorktoolUi: (newSettings) => {
        set((state) => ({
          worktoolUi: {
            ...state.worktoolUi,
            ...newSettings,
            waveform: {
              ...(state.worktoolUi?.waveform || {}),
              ...(newSettings?.waveform || {}),
            },
            layoutByMode: {
              ...(state.worktoolUi?.layoutByMode || {}),
              ...(newSettings?.layoutByMode || {}),
            },
          },
        }));
      },

      // 모든 설정 초기화
      resetSettings: () => {
        set({
          general: {
            maxCharactersPerSec: 21,
            maxWordsPerMin: 160,
            minDurationMs: 833,
            maxDurationMs: 7000,
            minGapMs: 0,
            maxNumberOfLines: 2,
            maxLineLength: 16,
            charCountPreset: 'cjkWeighted',
            defaultFramerate: 29.97,
          },
          ai: {
            clovaKey: '',
            openaiKey: '',
            geminiKey: '',
            defaultProvider: 'openai',
          },
          subtitleEditor: {
            fontFamily: "'Noto Sans Mono', 'JetBrains Mono', monospace",
            fontSize: 13,
            guidelineBase: 'cjk',
            guidelineColor: 'rgba(255, 100, 100, 0.4)',
            syncStartNudgeStepSec: 0.001,
            syncSplitOffsetSec: 0,
            minSplitGapSec: 0.1,
            mediaSeekStepSec: 3,
            gapFillDetectMs: 400,
            gapFillTargetMs: 0,
          },
          worktoolUi: {
            videoMinimized: false,
            waveform: {
              showTimeGrid: true,
            },
            layoutByMode: {},
          },
        });
      },

      // 자막 편집 설정 초기화
      resetSubtitleEditor: () => {
        set({
          subtitleEditor: {
            fontFamily: "'Noto Sans Mono', 'JetBrains Mono', monospace",
            fontSize: 13,
            guidelineBase: 'cjk',
            guidelineColor: 'rgba(255, 100, 100, 0.4)',
            syncStartNudgeStepSec: 0.001,
            syncSplitOffsetSec: 0,
            minSplitGapSec: 0.1,
            mediaSeekStepSec: 3,
            gapFillDetectMs: 400,
            gapFillTargetMs: 0,
          },
        });
      },

      // 특정 섹션 초기화
      resetGeneral: () => {
        set((state) => ({
          general: {
            maxCharactersPerSec: 21,
            maxWordsPerMin: 160,
            minDurationMs: 833,
            maxDurationMs: 7000,
            minGapMs: 80,
            maxNumberOfLines: 2,
            maxLineLength: 16,
            charCountPreset: 'cjkWeighted',
            defaultFramerate: 29.97,
          },
        }));
      },

      resetAI: () => {
        set((state) => ({
          ai: {
            clovaKey: '',
            openaiKey: '',
            geminiKey: '',
            defaultProvider: 'openai',
          },
        }));
      },

      // API 키 유효성 체크 (간단한 길이 체크)
      hasValidApiKey: (provider) => {
        const { ai } = get();
        switch (provider) {
          case 'clova':
            return ai.clovaKey.length > 10;
          case 'openai':
            return ai.openaiKey.length > 10;
          case 'gemini':
            return ai.geminiKey.length > 10;
          default:
            return false;
        }
      },

      // 사용 가능한 AI 제공자 목록
      getAvailableProviders: () => {
        const { ai } = get();
        const providers = [];
        if (ai.clovaKey.length > 10) providers.push('clova');
        if (ai.openaiKey.length > 10) providers.push('openai');
        if (ai.geminiKey.length > 10) providers.push('gemini');
        return providers;
      },
    }),
    {
      name: 'app-settings',
      partialize: (state) => ({
        general: state.general,
        ai: state.ai,
        subtitleEditor: state.subtitleEditor,
        worktoolUi: state.worktoolUi,
      }),
      merge: (persisted, current) => ({
        ...current,
        general: { ...current.general, ...persisted?.general },
        ai: { ...current.ai, ...persisted?.ai },
        subtitleEditor: { ...current.subtitleEditor, ...persisted?.subtitleEditor },
        worktoolUi: {
          ...current.worktoolUi,
          ...persisted?.worktoolUi,
          waveform: {
            ...current.worktoolUi.waveform,
            ...persisted?.worktoolUi?.waveform,
          },
          layoutByMode: {
            ...current.worktoolUi.layoutByMode,
            ...persisted?.worktoolUi?.layoutByMode,
          },
        },
      }),
    }
  )
);

// 프레임레이트 옵션
export const FRAMERATE_OPTIONS = [
  { value: 23.976, label: '23.976 fps (Film NTSC)' },
  { value: 24, label: '24 fps (Film)' },
  { value: 25, label: '25 fps (PAL)' },
  { value: 29.97, label: '29.97 fps (NTSC)' },
  { value: 30, label: '30 fps' },
  { value: 50, label: '50 fps (PAL HD)' },
  { value: 59.94, label: '59.94 fps (NTSC HD)' },
  { value: 60, label: '60 fps' },
];

// AI 제공자 정보
export const AI_PROVIDERS = {
  clova: {
    name: 'Clova',
    icon: '🇰🇷',
    description: 'Naver Clova AI',
    keyPlaceholder: 'NCP API Key',
  },
  openai: {
    name: 'OpenAI',
    icon: '🤖',
    description: 'GPT-4, Whisper 등',
    keyPlaceholder: 'sk-...',
  },
  gemini: {
    name: 'Gemini',
    icon: '✨',
    description: 'Google Gemini AI',
    keyPlaceholder: 'AIza...',
  },
};

