/**
 * AI 설정 상태 관리
 * LLM 및 STT 설정을 관리합니다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  createLLMProvider, 
  createSTTProvider,
  getAvailableLLMProviders,
  getAvailableSTTProviders,
} from '../services/ai';

// 기본값을 provider 정보에서 동적으로 가져오기
const defaultLLMProvider = getAvailableLLMProviders()[0];
const sttProviders = getAvailableSTTProviders();

// LLM provider별 기본 API Keys 생성
const getDefaultLLMApiKeys = () => {
  const apiKeys = {};
  getAvailableLLMProviders().forEach(provider => {
    apiKeys[provider.id] = '';
  });
  return apiKeys;
};

// STT provider의 기본 credentials 생성 (단일 provider용)
const getDefaultSTTCredentials = (providerInfo) => {
  const credentials = {};
  providerInfo?.requiredFields?.forEach(field => {
    credentials[field.key] = '';
  });
  return credentials;
};

// 전체 STT provider별 기본 credentials 맵 생성
const getDefaultAllSTTCredentials = () => {
  const allCredentials = {};
  sttProviders.forEach(provider => {
    allCredentials[provider.id] = getDefaultSTTCredentials(provider);
  });
  return allCredentials;
};

// 전체 STT provider별 기본 설정 맵 생성
const getDefaultAllSTTProviderSettings = () => {
  const allSettings = {};
  sttProviders.forEach(provider => {
    const settings = {
      language: provider.languages?.[0]?.code || 'ko-KR',
    };
    // 모델이 있는 provider (elevenlabs 등)
    if (provider.models?.length > 0) {
      settings.model = provider.models[0].id;
    }
    // 옵션이 있는 provider (elevenlabs 등)
    if (provider.options) {
      Object.entries(provider.options).forEach(([key, opt]) => {
        settings[key] = opt.default;
      });
    }
    allSettings[provider.id] = settings;
  });
  return allSettings;
};

// localStorage 마이그레이션: 기존 stt + sttForeign → 통합 stt
const CURRENT_VERSION = 2;

const migrateState = (persistedState, version) => {
  if (version === 0 || !version) {
    // v0 → v1: stt + sttForeign 통합
    const oldStt = persistedState.stt;
    const oldSttForeign = persistedState.sttForeign;

    if (oldSttForeign) {
      // 기존 데이터가 있으면 마이그레이션
      const newCredentials = getDefaultAllSTTCredentials();
      const newProviderSettings = getDefaultAllSTTProviderSettings();

      // 기존 clova credentials 복원
      if (oldStt?.credentials) {
        newCredentials.clova = { ...newCredentials.clova, ...oldStt.credentials };
      }
      // 기존 elevenlabs credentials 복원
      if (oldSttForeign?.credentials) {
        newCredentials.elevenlabs = { ...newCredentials.elevenlabs, ...oldSttForeign.credentials };
      }
      // 기존 clova 설정 복원
      if (oldStt?.language) {
        newProviderSettings.clova = { ...newProviderSettings.clova, language: oldStt.language };
      }
      // 기존 elevenlabs 설정 복원
      if (oldSttForeign) {
        newProviderSettings.elevenlabs = {
          ...newProviderSettings.elevenlabs,
          language: oldSttForeign.language || 'en',
          model: oldSttForeign.model || 'scribe_v2',
          diarize: oldSttForeign.options?.diarize ?? false,
          timestampsGranularity: oldSttForeign.options?.timestampsGranularity || 'word',
        };
      }

      persistedState.stt = {
        provider: oldStt?.provider || 'clova',
        credentials: newCredentials,
        providerSettings: newProviderSettings,
        segmentOptions: {
          maxSegmentLength: oldStt?.segmentOptions?.maxSegmentLength ?? 80,
          splitTimeGap: oldStt?.segmentOptions?.splitTimeGap ?? 2.0,
        },
      };

      // sttForeign 관련 상태 제거
      delete persistedState.sttForeign;
      delete persistedState.isSTTForeignConnected;
      delete persistedState.lastSTTForeignTestResult;
    }
  }

  if (version <= 1) {
    // v1 → v2: LLM provider ID 'chatgpt' → 'openai' 통일
    const llm = persistedState.llm;
    if (llm) {
      // provider 이름 변경
      if (llm.provider === 'chatgpt') {
        llm.provider = 'openai';
      }
      // apiKeys에서 chatgpt → openai 키 이전
      if (llm.apiKeys && llm.apiKeys.chatgpt !== undefined) {
        llm.apiKeys.openai = llm.apiKeys.chatgpt;
        delete llm.apiKeys.chatgpt;
      }
    }
  }

  return persistedState;
};

export const useAIStore = create(
  persist(
    (set, get) => ({
      // ==================== LLM 설정 ====================
      llm: {
        provider: defaultLLMProvider?.id || 'openai',
        apiKeys: getDefaultLLMApiKeys(), // provider별 API Key 저장
        model: defaultLLMProvider?.models?.[0]?.id || 'gpt-4o-mini',
        targetLanguage: 'en', // 기본 번역 대상 언어
      },

      // ==================== STT 설정 (통합) ====================
      stt: {
        provider: 'clova',                          // 현재 선택된 provider
        credentials: getDefaultAllSTTCredentials(),  // provider별 credentials
        providerSettings: getDefaultAllSTTProviderSettings(), // provider별 고유 설정
        segmentOptions: {                            // 공통 세그먼트 설정
          maxSegmentLength: 80,  // 세그먼트 최대 문자 수 (가이드라인 위치 겸용)
          splitTimeGap: 2.0,     // 분리 기준 시간 간격 (초)
        },
      },
      
      // ==================== 번역 설정 ====================
      translation: {
        preserveLineBreaks: true, // 줄바꿈 유지
        batchSize: 20, // 한 번에 번역할 자막 수
      },

      // ==================== 상태 ====================
      isLLMConnected: false,
      isSTTConnected: false,
      lastLLMTestResult: null,
      lastSTTTestResult: null,

      // ==================== LLM 액션 ====================
      
      /**
       * LLM 설정 업데이트
       */
      setLLMConfig: (config) => {
        set((state) => {
          const newState = {
            llm: { ...state.llm, ...config },
            isLLMConnected: false,
            lastLLMTestResult: null,
          };

          // provider가 변경되면 해당 provider의 기본 모델로 설정
          if (config.provider && config.provider !== state.llm.provider) {
            const providerInfo = getAvailableLLMProviders().find(p => p.id === config.provider);
            newState.llm.model = providerInfo?.models?.[0]?.id || '';
          }

          return newState;
        });
      },

      /**
       * LLM API Key 업데이트 (개별 provider)
       */
      setLLMApiKey: (providerId, apiKey) => {
        set((state) => ({
          llm: {
            ...state.llm,
            apiKeys: {
              ...state.llm.apiKeys,
              [providerId]: apiKey,
            },
          },
          isLLMConnected: false,
          lastLLMTestResult: null,
        }));
      },

      /**
       * 현재 provider의 API Key 가져오기
       */
      getCurrentLLMApiKey: () => {
        const { llm } = get();
        return llm.apiKeys?.[llm.provider] || '';
      },

      /**
       * LLM 연결 테스트
       */
      testLLMConnection: async () => {
        const { llm } = get();
        const currentApiKey = llm.apiKeys?.[llm.provider] || '';
        
        if (!currentApiKey) {
          const result = { success: false, message: 'API Key가 필요합니다.' };
          set({ lastLLMTestResult: result, isLLMConnected: false });
          return result;
        }

        try {
          const provider = createLLMProvider(llm.provider, currentApiKey, { model: llm.model });
          const result = await provider.testConnection();
          set({ lastLLMTestResult: result, isLLMConnected: result.success });
          return result;
        } catch (error) {
          const result = { success: false, message: error.message };
          set({ lastLLMTestResult: result, isLLMConnected: false });
          return result;
        }
      },

      /**
       * 자막 번역
       */
      translateSubtitles: async (subtitles, targetLanguage, options = {}) => {
        const { llm } = get();
        const currentApiKey = llm.apiKeys?.[llm.provider] || '';
        
        if (!currentApiKey) {
          throw new Error('LLM API Key가 설정되지 않았습니다.');
        }

        const provider = createLLMProvider(llm.provider, currentApiKey, { model: llm.model });
        return await provider.translateSubtitles(subtitles, targetLanguage, options);
      },

      // ==================== STT 액션 ====================
      
      /**
       * STT provider 변경
       */
      setSTTProvider: (providerId) => {
        set((state) => ({
          stt: {
            ...state.stt,
            provider: providerId,
          },
          isSTTConnected: false,
          lastSTTTestResult: null,
        }));
      },

      /**
       * STT credentials 업데이트 (현재 선택된 provider의 개별 필드)
       */
      setSTTCredential: (key, value) => {
        set((state) => {
          const currentProvider = state.stt.provider;
          return {
            stt: {
              ...state.stt,
              credentials: {
                ...state.stt.credentials,
                [currentProvider]: {
                  ...state.stt.credentials[currentProvider],
                  [key]: value,
                },
              },
            },
            isSTTConnected: false,
            lastSTTTestResult: null,
          };
        });
      },

      /**
       * STT provider 고유 설정 업데이트 (현재 provider)
       */
      setSTTProviderSetting: (key, value) => {
        set((state) => {
          const currentProvider = state.stt.provider;
          return {
            stt: {
              ...state.stt,
              providerSettings: {
                ...state.stt.providerSettings,
                [currentProvider]: {
                  ...state.stt.providerSettings[currentProvider],
                  [key]: value,
                },
              },
            },
          };
        });
      },

      /**
       * STT 세그먼트 옵션 업데이트 (공통)
       */
      setSTTSegmentOption: (key, value) => {
        set((state) => ({
          stt: {
            ...state.stt,
            segmentOptions: {
              ...state.stt.segmentOptions,
              [key]: value,
            },
          },
        }));
      },

      /**
       * 현재 provider의 credentials 가져오기
       */
      getCurrentSTTCredentials: () => {
        const { stt } = get();
        return stt.credentials?.[stt.provider] || {};
      },

      /**
       * 현재 provider의 고유 설정 가져오기
       */
      getCurrentSTTProviderSettings: () => {
        const { stt } = get();
        return stt.providerSettings?.[stt.provider] || {};
      },

      /**
       * STT 연결 테스트 (현재 선택된 provider 기준)
       */
      testSTTConnection: async () => {
        const { stt } = get();
        const providerInfo = getAvailableSTTProviders().find(p => p.id === stt.provider);
        const currentCredentials = stt.credentials?.[stt.provider] || {};
        
        // 필수 필드 검증
        const missingFields = providerInfo?.requiredFields?.filter(
          field => !currentCredentials[field.key]
        );
        
        if (missingFields?.length > 0) {
          const fieldNames = missingFields.map(f => f.label).join(', ');
          const result = { success: false, message: `${fieldNames}이(가) 필요합니다.` };
          set({ lastSTTTestResult: result, isSTTConnected: false });
          return result;
        }

        try {
          const currentSettings = stt.providerSettings?.[stt.provider] || {};
          const provider = createSTTProvider(stt.provider, {
            ...currentCredentials,
            model: currentSettings.model,
          });
          const result = await provider.testConnection();
          set({ lastSTTTestResult: result, isSTTConnected: result.success });
          return result;
        } catch (error) {
          const result = { success: false, message: error.message };
          set({ lastSTTTestResult: result, isSTTConnected: false });
          return result;
        }
      },

      /**
       * 음성 파일 → 자막 변환 (통합)
       */
      transcribeAudio: async (audioFile, options = {}) => {
        const { stt } = get();
        const providerInfo = getAvailableSTTProviders().find(p => p.id === stt.provider);
        const currentCredentials = stt.credentials?.[stt.provider] || {};
        const currentSettings = stt.providerSettings?.[stt.provider] || {};
        
        // 필수 필드 검증
        const missingFields = providerInfo?.requiredFields?.filter(
          field => !currentCredentials[field.key]
        );
        
        if (missingFields?.length > 0) {
          throw new Error('STT API 인증 정보가 설정되지 않았습니다.');
        }

        const provider = createSTTProvider(stt.provider, {
          ...currentCredentials,
          model: currentSettings.model,
        });

        return await provider.transcribe(audioFile, {
          language: currentSettings.language,
          diarize: currentSettings.diarize,
          timestampsGranularity: currentSettings.timestampsGranularity,
          ...options,
        });
      },

      // ==================== 유틸리티 ====================
      
      /**
       * 사용 가능한 LLM 제공자 목록
       */
      getAvailableLLMProviders: () => getAvailableLLMProviders(),

      /**
       * 사용 가능한 STT 제공자 목록
       */
      getAvailableSTTProviders: () => getAvailableSTTProviders(),

      /**
       * 모든 설정 초기화
       */
      resetAllSettings: () => {
        const llmProvider = getAvailableLLMProviders()[0];
        
        set({
          llm: {
            provider: llmProvider?.id || 'openai',
            apiKeys: getDefaultLLMApiKeys(),
            model: llmProvider?.models?.[0]?.id || 'gpt-4o-mini',
            targetLanguage: 'en',
          },
          stt: {
            provider: 'clova',
            credentials: getDefaultAllSTTCredentials(),
            providerSettings: getDefaultAllSTTProviderSettings(),
            segmentOptions: {
              maxSegmentLength: 80,
              splitTimeGap: 2.0,
            },
          },
          isLLMConnected: false,
          isSTTConnected: false,
          lastLLMTestResult: null,
          lastSTTTestResult: null,
        });
      },
    }),
    {
      name: 'ai-settings',
      version: CURRENT_VERSION,
      migrate: migrateState,
      merge: (persisted, current) => ({
        ...current,
        llm: {
          ...current.llm,
          ...persisted?.llm,
          apiKeys: { ...getDefaultLLMApiKeys(), ...persisted?.llm?.apiKeys },
        },
        stt: {
          ...current.stt,
          ...persisted?.stt,
          credentials: { ...getDefaultAllSTTCredentials(), ...persisted?.stt?.credentials },
          providerSettings: { ...getDefaultAllSTTProviderSettings(), ...persisted?.stt?.providerSettings },
          segmentOptions: { ...current.stt.segmentOptions, ...persisted?.stt?.segmentOptions },
        },
        translation: { ...current.translation, ...persisted?.translation },
        isLLMConnected: persisted?.isLLMConnected ?? current.isLLMConnected,
        isSTTConnected: persisted?.isSTTConnected ?? current.isSTTConnected,
        lastLLMTestResult: persisted?.lastLLMTestResult ?? current.lastLLMTestResult,
        lastSTTTestResult: persisted?.lastSTTTestResult ?? current.lastSTTTestResult,
      }),
    }
  )
);
