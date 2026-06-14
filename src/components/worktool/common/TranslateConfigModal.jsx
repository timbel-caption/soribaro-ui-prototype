import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from '@mui/material/Tooltip';
import { getPrompts, getPromptById } from '../../../api/v9/prompts';
import { getAllTags } from '../../../api/v9/tags';
import { useAIStore } from '../../../stores/aiStore';
import { usePromptsStore } from '../../../stores/promptsStore';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import { toast } from '../../../stores/toastStore';
import llmModels from '../../../pages/soribaro/translation/llmModels.json';
import languages from '../../../constants/language.json';
import testApiKeys from '../../../constants/apiKeys.json';
import PromptEditView from './PromptEditView';
import './SttConfigModal.css'; // SttConfigModal과 동일한 스타일 사용

/**
 * 모든 모델 목록 평탄화
 */
const getAllModels = () => {
  const models = [];
  Object.entries(llmModels).forEach(([provider, modelList]) => {
    modelList.forEach(model => {
      models.push({ provider, model });
    });
  });
  return models;
};

const allModels = getAllModels();

const DEFAULT_PROMPT_TAG_ID = 'df7bff7a-5b81-4b3a-978b-1717dbf5d5f7';
const DEFAULT_PROMPT_TAG_NAME = '기본';

/**
 * 파라미터 설명
 */
const PARAM_DESCRIPTIONS = {
  temperature: '응답의 창의성/무작위성을 조절합니다. 0에 가까울수록 일관되고 예측 가능한 응답, 높을수록 다양하고 창의적인 응답을 생성합니다. (권장: 번역 0.3~0.7)',
  max_tokens: '생성할 최대 토큰(단어/문자) 수입니다. 너무 작으면 응답이 잘릴 수 있고, 너무 크면 비용이 증가합니다. (권장: 1000~4000)',
  top_p: '누적 확률 기반 샘플링입니다. 1에 가까울수록 더 많은 단어 후보를 고려합니다. (권장: 0.9~1.0)',
  top_k: '상위 K개의 단어 후보만 고려합니다. 값이 작을수록 더 집중된 응답, 클수록 더 다양한 응답을 생성합니다. (권장: 10~50)',
  presence_penalty: '새로운 주제 도입을 장려합니다. 양수면 이미 언급된 내용을 피하고, 음수면 기존 주제를 유지합니다. (권장: 0~0.5)',
  frequency_penalty: '단어 반복을 제어합니다. 양수면 같은 단어 반복을 줄이고, 음수면 반복을 허용합니다. (권장: 0~0.5)',
  chunk_size: '한 번에 번역할 자막 세그먼트 수입니다. 너무 크면 컨텍스트 길이를 초과할 수 있고, 너무 작으면 API 호출 횟수가 증가합니다. (권장: 30~100)',
  concurrency: 'LLM API로 동시에 요청을 보낼 개수입니다. 높을수록 빠르지만 레이트리밋에 주의하세요. (권장: 3~10)',
};

/**
 * 프로바이더별 파라미터 지원 여부
 */
const PROVIDER_PARAM_SUPPORT = {
  OpenAI: {
    temperature: true,
    max_tokens: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
  },
  Gemini: {
    temperature: true,
    max_tokens: true,
    top_p: true,
    top_k: true,
  },
  Claude: {
    temperature: true,
    max_tokens: true,
    top_p: true,
    top_k: true,
  },
};

/**
 * 모델명으로 프로바이더 판별
 */
const getProviderFromModel = (modelName) => {
  if (!modelName) return null;
  const lowerModel = modelName.toLowerCase();
  
  if (lowerModel.startsWith('claude')) return 'Claude';
  if (lowerModel.startsWith('gemini')) return 'Gemini';
  if (lowerModel.startsWith('gpt') || lowerModel.includes('openai')) return 'OpenAI';
  
  return 'OpenAI'; // 기본값
};

/**
 * 파라미터 지원 여부 확인
 * @param {string} provider - 프로바이더명
 * @param {string} param - 파라미터명
 * @param {string} [modelName] - 모델명 (GPT-5 계열 판별용)
 */
const isParamSupported = (provider, param, modelName) => {
  // GPT-5 계열은 리즈닝 모델로 temperature, top_p, frequency_penalty, presence_penalty 미지원
  if (modelName) {
    const lowerModel = modelName.toLowerCase();
    if (lowerModel.startsWith('gpt-5')) {
      const gpt5Supported = { max_tokens: true };
      return gpt5Supported[param] ?? false;
    }
  }
  if (!provider || !PROVIDER_PARAM_SUPPORT[provider]) return true;
  return PROVIDER_PARAM_SUPPORT[provider][param] ?? false;
};

/**
 * 모델별 최대 출력 토큰 수
 */
const MODEL_MAX_TOKENS = {
  // Claude
  'claude-sonnet-4-6': 64000,
  'claude-opus-4-5-20251101': 64000,
  'claude-haiku-4-5-20251001': 64000,
  'claude-sonnet-4-5-20250929': 64000,
  'claude-opus-4-1-20250805': 64000,
  'claude-sonnet-4-20250514': 64000,
  // Gemini
  'gemini-3.1-pro-preview': 65535,
  'gemini-3-flash-preview': 65535,
  'gemini-2.5-flash': 65535,
  'gemini-2.5-pro': 65535,
  'gemini-2.0-flash': 8192,
  // OpenAI
  'gpt-5.4': 128000,
  'gpt-5-mini': 128000,
  'gpt-5.1': 128000,
  'gpt-5-nano': 128000,
  'gpt-4.1': 32768,
  'gpt-4o': 16384,
};

/**
 * 모델명으로 최대 출력 토큰 수 조회
 */
const getMaxTokensForModel = (modelName) => {
  if (!modelName) return '';
  // 정확 매칭
  if (MODEL_MAX_TOKENS[modelName]) return MODEL_MAX_TOKENS[modelName];
  // 프로바이더별 기본값
  const lowerModel = modelName.toLowerCase();
  if (lowerModel.startsWith('claude')) return 64000;
  if (lowerModel.startsWith('gemini')) return 65535;
  if (lowerModel.startsWith('gpt-5')) return 128000;
  if (lowerModel.startsWith('gpt-4')) return 16384;
  return 16384;
};

/**
 * 기본 파라미터 값
 */
const getDefaultParams = () => ({
  temperature: '0.3',
  max_tokens: '',
  top_p: '1.0',
  top_k: '',
  presence_penalty: '0',
  frequency_penalty: '0',
  chunk_size: '50',
  concurrency: '5',
});

const getV2DefaultParams = () => ({
  temperature: '1',
  max_tokens: '',
  top_p: '0.95',
  top_k: '',
  presence_penalty: '0',
  frequency_penalty: '0',
  chunk_size: '300',
  concurrency: '5',
});

/**
 * 번역 설정 모달 컴포넌트
 */
export default function TranslateConfigModal({ isOpen, onClose, onStart, sourceLang: initialSourceLang, targetLang: initialTargetLang }) {
  const { t } = useTranslation('worktool');
  // 뷰 모드: 'config' (번역 설정) | 'editPrompt' (프롬프트 수정)
  const [viewMode, setViewMode] = useState('config');
  const [editingPromptId, setEditingPromptId] = useState(null);

  // 언어 설정 상태 (props로 초기화, 모달 내에서 변경 가능)
  const [sourceLang, setSourceLang] = useState(initialSourceLang || 'ko');
  const [targetLang, setTargetLang] = useState(initialTargetLang || 'en');

  // 프롬프트 관련 상태
  const [promptList, setPromptList] = useState([]);
  const [promptListLoading, setPromptListLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [promptDetailLoading, setPromptDetailLoading] = useState(false);
  const [isManualPromptSelect, setIsManualPromptSelect] = useState(false); // 사용자가 수동으로 프롬프트 선택했는지
  const [tagList, setTagList] = useState([]);
  const [tagListLoading, setTagListLoading] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [tagSearchText, setTagSearchText] = useState('');

  // 파이프라인 모드: 'legacy' | 'v2'
  const [pipelineMode, setPipelineMode] = useState('legacy');

  // V2 전용: LLM 문맥 분할 사용 여부 + 분할 분석 모델/Effort
  const [useContextSplit, setUseContextSplit] = useState(true);
  const [splitModel, setSplitModel] = useState('gemini-3-flash-preview');
  const [splitReasoningEffort, setSplitReasoningEffort] = useState('medium');

  // 번역 설정 상태
  const [model, setModel] = useState('');
  const [customPromptText, setCustomPromptText] = useState('');
  const [modelParams, setModelParams] = useState(getDefaultParams());

  // V2 작품 정보 상태
  const [workInfoTitle, setWorkInfoTitle] = useState('');
  const [workInfoGenre, setWorkInfoGenre] = useState('');
  const [workInfoDescription, setWorkInfoDescription] = useState('');
  const [workInfoGlossary, setWorkInfoGlossary] = useState('');

  // 현재 프로바이더
  const currentProvider = useMemo(() => getProviderFromModel(model), [model]);

  const normalizeLang = useCallback((value) => {
    if (!value) return '';
    return String(value).trim().toUpperCase();
  }, []);

  const hasDefaultTag = useCallback((prompt) => {
    const tags = prompt?.tags || [];
    return tags.some(tag => tag?.id === DEFAULT_PROMPT_TAG_ID || tag?.name === DEFAULT_PROMPT_TAG_NAME);
  }, []);

  const matchesLanguageFilter = useCallback((prompt) => {
    const promptSource = normalizeLang(prompt?.sourceLang || prompt?.source_lang);
    const promptTarget = normalizeLang(prompt?.targetLang || prompt?.target_lang);
    const source = normalizeLang(sourceLang);
    const target = normalizeLang(targetLang);

    if (!source || !target) return false;

    const sourceMatch = promptSource === 'ALL' || promptSource === source;
    const targetMatch = promptTarget === 'ALL' || promptTarget === target;

    return sourceMatch && targetMatch;
  }, [normalizeLang, sourceLang, targetLang]);

  const matchesTagFilter = useCallback((prompt) => {
    if (selectedTagIds.length === 0) return true;
    const tags = prompt?.tags || [];
    return tags.some(tag => selectedTagIds.includes(tag?.id));
  }, [selectedTagIds]);

  const getLanguagePriority = useCallback((prompt) => {
    const promptSource = normalizeLang(prompt?.sourceLang || prompt?.source_lang);
    const promptTarget = normalizeLang(prompt?.targetLang || prompt?.target_lang);
    const source = normalizeLang(sourceLang);
    const target = normalizeLang(targetLang);

    if (promptSource === source && promptTarget === target) return 0;
    if (promptSource === source && promptTarget === 'ALL') return 1;
    if (promptSource === 'ALL' && promptTarget === target) return 2;
    if (promptSource === 'ALL' && promptTarget === 'ALL') return 3;
    return 4;
  }, [normalizeLang, sourceLang, targetLang]);

  const filteredPrompts = useMemo(() => {
    if (!promptList || promptList.length === 0) return [];

    const results = promptList.filter((prompt) => {
      if (hasDefaultTag(prompt)) return true;
      return matchesLanguageFilter(prompt) && matchesTagFilter(prompt);
    });

    const uniqueById = new Map();
    results.forEach(prompt => {
      if (prompt?.id) uniqueById.set(prompt.id, prompt);
    });

    return Array.from(uniqueById.values()).sort((a, b) => {
      const aDefault = hasDefaultTag(a);
      const bDefault = hasDefaultTag(b);
      if (aDefault !== bDefault) return aDefault ? -1 : 1;

      const priorityDiff = getLanguagePriority(a) - getLanguagePriority(b);
      if (priorityDiff !== 0) return priorityDiff;

      return (a?.name || '').localeCompare(b?.name || '');
    });
  }, [promptList, hasDefaultTag, matchesLanguageFilter, matchesTagFilter, getLanguagePriority]);

  const filteredTags = useMemo(() => {
    const keyword = tagSearchText.trim().toLowerCase();
    if (!keyword) return tagList;
    return tagList.filter(tag => (tag?.name || '').toLowerCase().includes(keyword));
  }, [tagList, tagSearchText]);

  // 프롬프트 설정 적용
  const applyPromptSettings = useCallback((promptData) => {
    if (!promptData) return;

    // 모델 설정
    if (promptData.model) {
      setModel(promptData.model);
    }

    // 커스텀 프롬프트 텍스트
    if (promptData.prompt) {
      setCustomPromptText(promptData.prompt);
    }

    // 모델별 max_tokens 최대값 결정
    const modelMaxTokens = promptData.model ? String(getMaxTokensForModel(promptData.model)) : '';

    // params JSON 파싱하여 파라미터 설정
    if (promptData.params) {
      try {
        const parsedParams = typeof promptData.params === 'string' 
          ? JSON.parse(promptData.params) 
          : promptData.params;

        setModelParams(prev => ({
          ...prev,
          temperature: parsedParams.temperature !== undefined ? String(parsedParams.temperature) : prev.temperature,
          max_tokens: modelMaxTokens || (parsedParams.max_tokens !== undefined ? String(parsedParams.max_tokens) : prev.max_tokens),
          top_p: parsedParams.top_p !== undefined ? String(parsedParams.top_p) : prev.top_p,
          top_k: parsedParams.top_k !== undefined ? String(parsedParams.top_k) : prev.top_k,
          presence_penalty: parsedParams.presence_penalty !== undefined ? String(parsedParams.presence_penalty) : prev.presence_penalty,
          frequency_penalty: parsedParams.frequency_penalty !== undefined ? String(parsedParams.frequency_penalty) : prev.frequency_penalty,
          chunk_size: parsedParams.chunk_size !== undefined ? String(parsedParams.chunk_size) : prev.chunk_size,
          concurrency: parsedParams.concurrency !== undefined ? String(parsedParams.concurrency) : prev.concurrency,
        }));
      } catch (err) {
        console.warn('프롬프트 params 파싱 실패:', err.message);
      }
    } else if (modelMaxTokens) {
      // params가 없더라도 모델이 있으면 max_tokens 설정
      setModelParams(prev => ({ ...prev, max_tokens: modelMaxTokens }));
    }
  }, []);

  // 프롬프트 목록 조회
  const fetchPromptList = useCallback(async () => {
    setPromptListLoading(true);
    const promptsStore = usePromptsStore.getState();

    // API 실패 상태이면 store에서 바로 로드
    if (promptsStore.isApiFailed) {
      const cached = promptsStore.getPrompts();
      setPromptList(cached);
      setPromptListLoading(false);
      return;
    }

    try {
      const response = await getPrompts();
      if (response.status === 'SUCCESS') {
        setPromptList(response.data || []);
      }
    } catch (err) {
      console.error('프롬프트 목록 조회 실패:', err);
      // API 실패 시 store 폴백
      const cached = promptsStore.getPrompts();
      if (cached.length > 0) {
        setPromptList(cached);
      }
    } finally {
      setPromptListLoading(false);
    }
  }, []);

  const fetchTagList = useCallback(async () => {
    setTagListLoading(true);
    const promptsStore = usePromptsStore.getState();

    // API 실패 상태이면 store에서 바로 로드
    if (promptsStore.isApiFailed) {
      const cached = promptsStore.getTags();
      setTagList(cached);
      setTagListLoading(false);
      return;
    }

    try {
      const response = await getAllTags();
      if (response.status === 'SUCCESS') {
        setTagList(response.data || []);
      }
    } catch (err) {
      console.error('태그 목록 조회 실패:', err);
      // API 실패 시 store 폴백
      const cached = promptsStore.getTags();
      if (cached.length > 0) {
        setTagList(cached);
      }
    } finally {
      setTagListLoading(false);
    }
  }, []);

  // 언어 기반 자동 프롬프트 검색
  const autoSelectPrompt = useCallback(async () => {
    if (!sourceLang || !targetLang) return;
    if (filteredPrompts.length === 0) {
      setSelectedPrompt(null);
      return;
    }

    setPromptDetailLoading(true);
    try {
      const autoPrompt = filteredPrompts[0];
      if (autoPrompt?.id) {
        setSelectedPrompt(autoPrompt);
        applyPromptSettings(autoPrompt);
      }
    } catch (err) {
      console.error('자동 프롬프트 검색 실패:', err);
    } finally {
      setPromptDetailLoading(false);
    }
  }, [sourceLang, targetLang, filteredPrompts, applyPromptSettings]);

  // 모달 열릴 때 초기화 및 프롬프트 목록 조회
  useEffect(() => {
    if (isOpen) {
      // 초기화
      setViewMode('config');
      setEditingPromptId(null);
      setSourceLang(initialSourceLang || 'ko');
      setTargetLang(initialTargetLang || 'en');
      setModel('');
      setCustomPromptText('');
      setModelParams(pipelineMode === 'v2' ? getV2DefaultParams() : getDefaultParams());
      setSelectedPrompt(null);
      setIsManualPromptSelect(false);
      setSelectedTagIds([]);
      setTagSearchText('');
      setWorkInfoTitle('');
      setWorkInfoGenre('');
      setWorkInfoDescription('');
      setWorkInfoGlossary('');
      setUseContextSplit(true);
      setSplitModel('gemini-3-flash-preview');
      setSplitReasoningEffort('medium');

      fetchPromptList();
      fetchTagList();
    }
  }, [isOpen, initialSourceLang, initialTargetLang, fetchPromptList, fetchTagList]);

  // 언어 변경 시 프롬프트 자동 검색 (수동 선택이 아닌 경우에만)
  useEffect(() => {
    if (isOpen && sourceLang && targetLang && !isManualPromptSelect) {
      autoSelectPrompt();
    }
  }, [isOpen, sourceLang, targetLang, autoSelectPrompt, isManualPromptSelect, filteredPrompts]);

  // 프롬프트 선택 핸들러
  const handlePromptSelect = useCallback(async (selectedId) => {
    
    if (!selectedId) {
      // 프롬프트 선택 해제 시 초기화
      setSelectedPrompt(null);
      setModel('');
      setCustomPromptText('');
      setModelParams(getDefaultParams());
      setIsManualPromptSelect(false); // 수동 선택 플래그 해제
      return;
    }

    // 수동 선택 플래그 설정
    setIsManualPromptSelect(true);

    // 선택된 프롬프트 찾기
    const prompt = promptList.find(p => p.id === selectedId);
    if (prompt) {
      setSelectedPrompt(prompt);
    }

    // 프롬프트 상세 조회
    setPromptDetailLoading(true);
    const promptsStore = usePromptsStore.getState();

    // API 실패 상태이면 store에서 조회
    if (promptsStore.isApiFailed) {
      const cached = promptsStore.getPromptById(selectedId);
      if (cached) {
        setSelectedPrompt(cached);
        applyPromptSettings(cached);
      }
      setPromptDetailLoading(false);
      return;
    }

    try {
      const response = await getPromptById(selectedId);
      if (response.status === 'SUCCESS') {
        setSelectedPrompt(response.data);
        applyPromptSettings(response.data);
      }
    } catch (err) {
      console.error('프롬프트 상세 조회 실패:', err);
      // API 실패 시 store 폴백
      const cached = promptsStore.getPromptById(selectedId);
      if (cached) {
        setSelectedPrompt(cached);
        applyPromptSettings(cached);
      }
    } finally {
      setPromptDetailLoading(false);
    }
  }, [applyPromptSettings, promptList]);

  const handleTagToggle = useCallback((tagId) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter(id => id !== tagId);
      }
      return [...prev, tagId];
    });
    setIsManualPromptSelect(false);
  }, []);

  const handleClearPrompt = useCallback(() => {
    handlePromptSelect('');
  }, [handlePromptSelect]);

  // 프롬프트 수정 뷰로 전환
  const handleEditPrompt = useCallback(() => {
    if (!selectedPrompt?.id) return;
    setEditingPromptId(selectedPrompt.id);
    setViewMode('editPrompt');
  }, [selectedPrompt]);

  // 프롬프트 새로만들기 뷰로 전환
  const handleCreatePrompt = useCallback(() => {
    setViewMode('createPrompt');
  }, []);

  // 프롬프트 수정/삭제/생성 후 설정 화면 복귀
  const handlePromptEditBack = useCallback(() => {
    setViewMode('config');
    setEditingPromptId(null);
  }, []);

  const handlePromptEditSave = useCallback(() => {
    setViewMode('config');
    setEditingPromptId(null);
    // 프롬프트 목록 새로고침 및 선택 초기화
    setSelectedPrompt(null);
    setIsManualPromptSelect(false);
    fetchPromptList();
  }, [fetchPromptList]);

  const handlePromptEditDelete = useCallback(() => {
    setViewMode('config');
    setEditingPromptId(null);
    // 선택 초기화 및 목록 새로고침
    setSelectedPrompt(null);
    setModel('');
    setCustomPromptText('');
    setModelParams(getDefaultParams());
    setIsManualPromptSelect(false);
    fetchPromptList();
  }, [fetchPromptList]);

  // 프롬프트 생성 완료 후 복귀
  const handlePromptCreateSave = useCallback(() => {
    setViewMode('config');
    // 프롬프트 목록 새로고침
    setSelectedPrompt(null);
    setIsManualPromptSelect(false);
    fetchPromptList();
  }, [fetchPromptList]);

  // 파라미터 변경 핸들러
  const handleParamChange = useCallback((param, value) => {
    setModelParams(prev => ({ ...prev, [param]: value }));
  }, []);

  /**
   * 모델명에서 provider 판별 후 aiStore에서 API Key 확인
   * @param {string} modelName - 모델명
   * @returns {{provider: string, apiKey: string}} - provider와 API Key
   */
  const getApiKeyFromStore = (modelName) => {
    const { llm } = useAIStore.getState();
    const provider = getProviderFromModel(modelName)?.toLowerCase() || 'openai';
    
    // provider ID 매핑 (Claude -> claude, OpenAI -> openai, Gemini -> gemini)
    const providerIdMap = {
      'claude': 'claude',
      'openai': 'openai',
      'gemini': 'gemini',
    };
    const providerId = providerIdMap[provider] || 'openai';
    const apiKey = llm.apiKeys?.[providerId] || '';
    
    return { provider, providerId, apiKey };
  };

  // 번역 실행 핸들러
  const handleStart = () => {
    // Test/Training mode: 쿼리스트링이 mode=test 또는 mode=training 이면 apiKeys.json 에서 키 로드.
    // 연수 모드도 사용자가 별도 API Key 를 입력하지 않아도 번역이 동작하도록 같은 자동 주입을 적용한다.
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (modeParam === 'test' || modeParam === 'training') {
      const effectiveModel = model || 'gpt-4o-mini';
      const { providerId } = getApiKeyFromStore(effectiveModel);
      const testKey = testApiKeys.llm?.[providerId];
      if (testKey) {
        useAIStore.getState().setLLMApiKey(providerId, testKey);
      } else {
        console.warn(`[${modeParam}] LLM 테스트 키를 찾을 수 없음 - provider: ${providerId}`);
      }
    }

    // 서버/로컬 모드 확인
    const isServerMode = useSubtitleStore.getState().isServerMode;
    
    // 로컬 모드에서만 API Key 검증
    if (!isServerMode) {
      // 선택된 모델 또는 기본 모델
      const effectiveModel = model || 'gpt-4o-mini';
      const { provider, apiKey } = getApiKeyFromStore(effectiveModel);
      
      if (!apiKey) {
        toast.error(`${provider.toUpperCase()} API Key가 설정되지 않았습니다.\n설정 > AI 탭에서 입력해주세요.`);
        return;
      }
    }
    
    const options = {
      sourceLang,
      targetLang,
      model: model || undefined,
      temperature: modelParams.temperature ? Number(modelParams.temperature) : undefined,
      maxTokens: modelParams.max_tokens ? Number(modelParams.max_tokens) : undefined,
      topP: modelParams.top_p ? Number(modelParams.top_p) : undefined,
      topK: modelParams.top_k ? Number(modelParams.top_k) : undefined,
      presencePenalty: modelParams.presence_penalty ? Number(modelParams.presence_penalty) : undefined,
      frequencyPenalty: modelParams.frequency_penalty ? Number(modelParams.frequency_penalty) : undefined,
      chunkSize: modelParams.chunk_size ? Number(modelParams.chunk_size) : undefined,
      concurrency: modelParams.concurrency ? Number(modelParams.concurrency) : undefined,
      promptId: selectedPrompt?.id || undefined,
      customPrompt: customPromptText || undefined,
      pipelineMode,
      workInfo: pipelineMode === 'v2' ? {
        title: workInfoTitle.trim() || undefined,
        genre: workInfoGenre.trim() || undefined,
        description: workInfoDescription.trim() || undefined,
        glossary: workInfoGlossary.trim() || undefined,
      } : undefined,
      useContextSplit: pipelineMode === 'v2' ? useContextSplit : false,
      splitModel: pipelineMode === 'v2' && useContextSplit ? splitModel : undefined,
      splitReasoningEffort:
        pipelineMode === 'v2' && useContextSplit ? splitReasoningEffort : undefined,
    };

    onStart(options);
  };

  // ESC 키로 닫기
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // 파라미터 입력 필드 렌더링
  const renderParamInput = (paramKey, label, config = {}) => {
    const { min, max, step = 0.1, placeholder = '' } = config;
    const isSupported = isParamSupported(currentProvider, paramKey, model);
    const description = PARAM_DESCRIPTIONS[paramKey];

    // Provider별 파라미터 범위 보정
    // Claude는 temperature 0.0~1.0 (1.0 초과 시 API 400 에러)
    let effectiveMax = max;
    if (paramKey === 'temperature' && currentProvider === 'Claude') {
      effectiveMax = 1;
    }

    return (
      <div className="form-group" style={{ opacity: isSupported ? 1 : 0.5 }}>
        <Tooltip title={description || ''} placement="top" arrow>
          <label className="form-label" style={{ cursor: 'help' }}>
            {label}
            {!isSupported && (
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '4px' }}>
                (미지원)
              </span>
            )}
          </label>
        </Tooltip>
        <input
          type="number"
          className="form-input"
          min={min}
          max={effectiveMax}
          step={step}
          value={modelParams[paramKey]}
          onChange={(e) => handleParamChange(paramKey, e.target.value)}
          placeholder={placeholder}
          disabled={!isSupported}
        />
      </div>
    );
  };

  if (!isOpen) return null;

  // 프롬프트 수정 뷰
  if (viewMode === 'editPrompt' && editingPromptId) {
    return (
      <div
        className="stt-config-modal-overlay"
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-edit-title"
      >
        <div className="stt-config-modal" style={{ maxWidth: '650px' }}>
          <PromptEditView
            promptId={editingPromptId}
            onBack={handlePromptEditBack}
            onSave={handlePromptEditSave}
            onDelete={handlePromptEditDelete}
          />
        </div>
      </div>
    );
  }

  // 프롬프트 새로만들기 뷰
  if (viewMode === 'createPrompt') {
    return (
      <div
        className="stt-config-modal-overlay"
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-create-title"
      >
        <div className="stt-config-modal" style={{ maxWidth: '650px' }}>
          <PromptEditView
            onBack={handlePromptEditBack}
            onSave={handlePromptCreateSave}
          />
        </div>
      </div>
    );
  }

  // 번역 설정 뷰 (기본)
  return (
    <div
      className="stt-config-modal-overlay"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="translate-config-title"
    >
      <div className="stt-config-modal" style={{ maxWidth: '600px' }}>
        {/* 헤더 */}
        <div className="stt-config-header">
          <h2 id="translate-config-title">🌐 {t('translateConfig.direction')}</h2>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="stt-config-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* 파이프라인 모드 선택 */}
          <section className="stt-config-section">
            <h3>{t('translateConfig.pipelineMode')}</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  setPipelineMode('legacy');
                  setModelParams(getDefaultParams());
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: pipelineMode === 'legacy' ? '2px solid var(--accent, #4dabf7)' : '1px solid var(--border-color)',
                  background: pipelineMode === 'legacy' ? 'rgba(77, 171, 247, 0.15)' : 'var(--bg-secondary)',
                  fontWeight: pipelineMode === 'legacy' ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {t('translateConfig.pipelineLegacy')}
              </button>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  setPipelineMode('v2');
                  setModelParams(getV2DefaultParams());
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: pipelineMode === 'v2' ? '2px solid var(--success-color, #51cf66)' : '1px solid var(--border-color)',
                  background: pipelineMode === 'v2' ? 'rgba(81, 207, 102, 0.15)' : 'var(--bg-secondary)',
                  fontWeight: pipelineMode === 'v2' ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {t('translateConfig.pipelineV2')}
              </button>
            </div>
            <div style={{
              marginTop: '6px',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
            }}>
              {pipelineMode === 'v2'
                ? t('translateConfig.pipelineV2Desc')
                : t('translateConfig.pipelineLegacyDesc')}
            </div>
          </section>

          {/* 언어 선택 */}
          <section className="stt-config-section">
            <h3>{t('translateConfig.direction')}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* 출발어 선택 */}
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">{t('common.sourceLanguage')}</label>
                <select
                  className="form-select"
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name} ({lang.code.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* 화살표 */}
              <span style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '20px',
                marginTop: '24px'
              }}>→</span>

              {/* 도착어 선택 */}
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">{t('common.targetLanguage')}</label>
                <select
                  className="form-select"
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name} ({lang.code.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {sourceLang === targetLang && (
              <div style={{ 
                marginTop: '8px', 
                padding: '8px 12px', 
                background: 'var(--warning-bg, #fff3cd)', 
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--warning-text, #856404)'
              }}>
                {t('translateConfig.sameLanguageWarning')}
              </div>
            )}
          </section>

          {/* 프롬프트 선택 섹션 */}
          <section className="stt-config-section">
            <h3>{t('translateConfig.promptSelect')}</h3>
            <div className="form-group">
              <label className="form-label">{t('translateConfig.tagSelect')}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t('translateConfig.tagSearchPlaceholder')}
                value={tagSearchText}
                onChange={(e) => setTagSearchText(e.target.value)}
                style={{ marginBottom: '8px' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tagListLoading && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('translateConfig.tagLoading')}
                  </div>
                )}
                {!tagListLoading && filteredTags.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('translateConfig.noSearchResults')}
                  </div>
                )}
                {!tagListLoading && filteredTags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className="btn-cancel"
                      style={{
                        padding: '4px 8px',
                        borderRadius: '12px',
                        border: isSelected ? '1px solid var(--accent, #4dabf7)' : '1px solid var(--border-color)',
                        background: isSelected ? 'rgba(77, 171, 247, 0.15)' : 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('translateConfig.promptSelect')}</label>
              <div
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '8px',
                  background: 'var(--bg-secondary)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {promptListLoading && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('common.loading')}
                  </div>
                )}
                {!promptListLoading && filteredPrompts.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('translateConfig.noMatchingPrompts')}
                  </div>
                )}
                {!promptListLoading && filteredPrompts.map((prompt) => {
                  const isSelected = selectedPrompt?.id === prompt.id;
                  const isDefault = hasDefaultTag(prompt);
                  const promptSource = normalizeLang(prompt?.sourceLang || prompt?.source_lang) || '-';
                  const promptTarget = normalizeLang(prompt?.targetLang || prompt?.target_lang) || '-';
                  return (
                    <button
                      key={prompt.id}
                      type="button"
                      onClick={() => handlePromptSelect(prompt.id)}
                      className="btn-cancel"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid var(--accent, #4dabf7)' : '1px solid transparent',
                        background: isSelected ? 'rgba(77, 171, 247, 0.15)' : 'transparent',
                        marginBottom: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        {prompt.name} {isDefault && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t('translateConfig.defaultBadge')}</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {promptSource} → {promptTarget}
                        {prompt.model && ` | ${prompt.model}`}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {selectedPrompt && (
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={handleClearPrompt}
                    style={{ fontSize: '12px' }}
                  >
                    {t('translateConfig.clearSelection')}
                  </button>
                )}
                {selectedPrompt && (
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={handleEditPrompt}
                    style={{
                      fontSize: '12px',
                      border: '1px solid var(--accent, #4dabf7)',
                      color: 'var(--accent, #4dabf7)',
                    }}
                  >
                    {t('translateConfig.editButton')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={handleCreatePrompt}
                  style={{
                    fontSize: '12px',
                    border: '1px solid var(--success-color, #51cf66)',
                    color: 'var(--success-color, #51cf66)',
                    marginLeft: selectedPrompt ? '0' : 'auto',
                  }}
                >
                  {t('translateConfig.createNew')}
                </button>
              </div>
              {selectedPrompt && (
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '12px', 
                  color: 'var(--text-secondary)',
                  padding: '8px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '4px'
                }}>
                  <strong>{selectedPrompt.name}</strong>
                  {selectedPrompt.description && (
                    <div style={{ marginTop: '4px', fontSize: '11px' }}>
                      {selectedPrompt.description}
                    </div>
                  )}
                  {model && ` | ${model}`}
                  {currentProvider && ` | ${t('translateConfig.providerLabel', { provider: currentProvider })}`}
                </div>
              )}
            </div>
          </section>

          {/* V2 LLM 문맥 분할 섹션 */}
          {pipelineMode === 'v2' && (
            <section className="stt-config-section">
              <h3>{t('translateConfig.contextSplit')}</h3>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: useContextSplit ? 'rgba(81, 207, 102, 0.10)' : 'var(--bg-secondary)',
                  border: useContextSplit ? '1px solid var(--success-color, #51cf66)' : '1px solid var(--border-color)',
                }}
              >
                <input
                  type="checkbox"
                  checked={useContextSplit}
                  onChange={(e) => setUseContextSplit(e.target.checked)}
                  style={{ marginTop: '2px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>
                    {t('translateConfig.contextSplitLabel')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    {t('translateConfig.contextSplitDesc')}
                  </div>
                </div>
              </label>

              {useContextSplit && (
                <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t('translateConfig.splitModel')}</label>
                    <select
                      className="form-select"
                      value={splitModel}
                      onChange={(e) => setSplitModel(e.target.value)}
                    >
                      {Object.entries(llmModels).map(([provider, models]) => (
                        <optgroup key={provider} label={provider}>
                          {models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, opacity: splitModel.toLowerCase().startsWith('gemini-3') ? 1 : 0.5 }}>
                    <label className="form-label">
                      {t('translateConfig.splitReasoningEffort')}
                      {!splitModel.toLowerCase().startsWith('gemini-3') && (
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '4px' }}>
                          ({t('translateConfig.unsupported')})
                        </span>
                      )}
                    </label>
                    <select
                      className="form-select"
                      value={splitReasoningEffort}
                      onChange={(e) => setSplitReasoningEffort(e.target.value)}
                      disabled={!splitModel.toLowerCase().startsWith('gemini-3')}
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* V2 작품 정보 섹션 */}
          {pipelineMode === 'v2' && (
            <section className="stt-config-section">
              <h3>{t('translateConfig.workInfo')}</h3>
              <div style={{
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                marginBottom: '8px',
              }}>
                {t('translateConfig.workInfoDesc')}
              </div>
              <div className="form-group">
                <label className="form-label">{t('translateConfig.workInfoTitle')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={workInfoTitle}
                  onChange={(e) => setWorkInfoTitle(e.target.value)}
                  placeholder={t('translateConfig.workInfoTitlePlaceholder')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('translateConfig.workInfoGenre')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={workInfoGenre}
                  onChange={(e) => setWorkInfoGenre(e.target.value)}
                  placeholder={t('translateConfig.workInfoGenrePlaceholder')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('translateConfig.workInfoDescription')}</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={workInfoDescription}
                  onChange={(e) => setWorkInfoDescription(e.target.value)}
                  placeholder={t('translateConfig.workInfoDescriptionPlaceholder')}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('translateConfig.workInfoGlossary')}</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={workInfoGlossary}
                  onChange={(e) => setWorkInfoGlossary(e.target.value)}
                  placeholder={t('translateConfig.workInfoGlossaryPlaceholder')}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </section>
          )}

          {/* 모델 설정 섹션 */}
          <section className="stt-config-section">
            <h3>{t('translateConfig.modelSettings')}</h3>
            <div className="form-group">
              <label className="form-label">{t('translateConfig.llmModel')}</label>
              <select
                className="form-select"
                value={model}
                onChange={(e) => {
                  const newModel = e.target.value;
                  setModel(newModel);
                  // 모델 변경 시 max_tokens를 해당 모델의 최대값으로 자동 설정
                  if (newModel) {
                    const maxTokens = getMaxTokensForModel(newModel);
                    setModelParams(prev => ({ ...prev, max_tokens: String(maxTokens) }));
                  }
                }}
              >
                <option value="">{t('translateConfig.selectModel')}</option>
                {/* 현재 값이 목록에 없으면 먼저 표시 */}
                {model && !allModels.some(m => m.model === model) && (
                  <option value={model}>{model} {t('translateConfig.legacyValue')}</option>
                )}
                {/* 프로바이더별 그룹화된 모델 목록 */}
                {Object.entries(llmModels).map(([provider, models]) => (
                  <optgroup key={provider} label={provider}>
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {currentProvider && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {t('translateConfig.providerLabel', { provider: currentProvider })}
                </div>
              )}
            </div>
          </section>

          {/* 번역 파라미터 섹션 */}
          <section className="stt-config-section">
            <h3>{t('translateConfig.translateParams')}</h3>
            
            {/* 청크 크기 — V2 + 문맥분할 ON일 때는 안전 가드(최대 청크 크기)로 동작 */}
            <div className="form-group">
              <Tooltip
                title={
                  pipelineMode === 'v2' && useContextSplit
                    ? t('translateConfig.chunkSizeGuardDesc')
                    : PARAM_DESCRIPTIONS.chunk_size
                }
                placement="top"
                arrow
              >
                <label className="form-label" style={{ cursor: 'help' }}>
                  {pipelineMode === 'v2' && useContextSplit
                    ? t('translateConfig.chunkSizeGuard')
                    : t('translateConfig.chunkSize')}
                </label>
              </Tooltip>
              <input
                type="number"
                className="form-input"
                min={pipelineMode === 'v2' && useContextSplit ? 100 : 10}
                max={pipelineMode === 'v2' && useContextSplit ? 500 : 200}
                step="10"
                value={modelParams.chunk_size}
                onChange={(e) => handleParamChange('chunk_size', e.target.value)}
                placeholder={pipelineMode === 'v2' && useContextSplit ? '300' : '50'}
              />
            </div>

            {/* 동시작업 수 */}
            <div className="form-group">
              <Tooltip title={PARAM_DESCRIPTIONS.concurrency} placement="top" arrow>
                <label className="form-label" style={{ cursor: 'help' }}>{t('translateConfig.concurrency')}</label>
              </Tooltip>
              <input
                type="number"
                className="form-input"
                min="1"
                max="10"
                step="1"
                value={modelParams.concurrency}
                onChange={(e) => handleParamChange('concurrency', e.target.value)}
                placeholder="5"
              />
            </div>
          </section>

          {/* LLM 파라미터 섹션 */}
          <section className="stt-config-section">
            <h3>{t('translateConfig.llmParams')}</h3>
            
            {pipelineMode === 'v2' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {renderParamInput('temperature', 'Temperature', { min: 0, max: 2, step: 0.1, placeholder: '1' })}
                  {renderParamInput('top_p', 'Top P', { min: 0, max: 1, step: 0.05, placeholder: '0.95' })}
                  {renderParamInput('max_tokens', 'Max Tokens', { min: 1, max: 128000, step: 100, placeholder: t('translateConfig.maxTokensAuto') })}
                </div>
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: 'var(--text-tertiary)'
                }}>
                  {t('translateConfig.v2ParamsHint')}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {renderParamInput('temperature', 'Temperature', { min: 0, max: 2, step: 0.1, placeholder: '0.3' })}
                  {renderParamInput('max_tokens', 'Max Tokens', { min: 1, max: 128000, step: 100, placeholder: t('translateConfig.maxTokensAuto') })}
                  {renderParamInput('top_p', 'Top P', { min: 0, max: 1, step: 0.05, placeholder: '1.0' })}
                  {renderParamInput('top_k', 'Top K', { min: 1, max: 100, step: 1, placeholder: '40' })}
                  {renderParamInput('presence_penalty', 'Presence Penalty', { min: -2, max: 2, step: 0.1, placeholder: '0' })}
                  {renderParamInput('frequency_penalty', 'Frequency Penalty', { min: -2, max: 2, step: 0.1, placeholder: '0' })}
                </div>

                <div style={{ 
                  marginTop: '12px', 
                  padding: '8px 12px', 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: 'var(--text-tertiary)'
                }}>
                  {t('translateConfig.paramHint')}
                </div>
              </>
            )}
          </section>
        </div>

        {/* 푸터 */}
        <div className="stt-config-footer">
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button 
            className="btn-start" 
            onClick={handleStart}
            disabled={promptDetailLoading}
          >
            {promptDetailLoading ? t('translateConfig.loading') : `🚀 ${t('translateConfig.runTranslate')}`}
          </button>
        </div>
      </div>
    </div>
  );
}
