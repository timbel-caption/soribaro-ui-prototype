import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from '@mui/material/Tooltip';
import { getPromptById, createPrompt, updatePrompt, deletePrompt } from '../../../api/v9/prompts';
import { getAllTags } from '../../../api/v9/tags';
import { usePromptsStore } from '../../../stores/promptsStore';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import ProcessModal from '../../common/ProcessModal/ProcessModal';
import languageList from '../../../constants/language.json';
import llmModels from '../../../pages/soribaro/translation/llmModels.json';
import { toast } from '../../../stores/toastStore';
import './SttConfigModal.css';

// 모든 모델 목록 평탄화
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

// 프로바이더별 파라미터 지원 여부
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

// 모델명으로 프로바이더 판별
const getProviderFromModel = (modelName) => {
  if (!modelName) return null;
  const lowerModel = modelName.toLowerCase();
  if (lowerModel.startsWith('claude')) return 'Claude';
  if (lowerModel.startsWith('gemini')) return 'Gemini';
  if (lowerModel.startsWith('gpt') || lowerModel.includes('openai')) return 'OpenAI';
  return 'OpenAI';
};

// 파라미터 지원 여부 확인
const isParamSupported = (provider, param) => {
  if (!provider || !PROVIDER_PARAM_SUPPORT[provider]) return true;
  return PROVIDER_PARAM_SUPPORT[provider][param] ?? false;
};

// 초기 모델 파라미터
const getInitialModelParams = () => ({
  temperature: 0.7,
  max_tokens: 2000,
  top_p: 1.0,
  top_k: 40,
  presence_penalty: 0,
  frequency_penalty: 0,
  chunk_size: 50,
});

// 초기 폼 데이터
const getInitialFormData = () => ({
  name: '',
  description: '',
  prompt: '',
  tags: [],
  model: '',
  sourceLang: 'ko',
  targetLang: 'en',
  modelParams: getInitialModelParams(),
  testText: '',
});

/**
 * 모달 내 프롬프트 편집/생성 뷰
 * @param {Object} props
 * @param {string} [props.promptId] - 편집할 프롬프트 ID (없으면 생성 모드)
 * @param {Function} props.onBack - 뒤로가기 콜백
 * @param {Function} props.onSave - 저장 완료 콜백 (생성 시 새 프롬프트 ID 전달)
 * @param {Function} [props.onDelete] - 삭제 완료 콜백 (생성 모드에서는 미사용)
 */
export default function PromptEditView({ promptId, onBack, onSave, onDelete }) {
  const { t } = useTranslation('worktool');
  const isCreateMode = !promptId;
  const [loading, setLoading] = useState(!isCreateMode);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(getInitialFormData());
  const [originalData, setOriginalData] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [tagSearchText, setTagSearchText] = useState('');

  // 테스트 관련 상태
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);

  // 현재 프로바이더
  const currentProvider = useMemo(() => getProviderFromModel(formData.model), [formData.model]);

  // 태그 필터링
  const filteredTags = useMemo(() => {
    const keyword = tagSearchText.trim().toLowerCase();
    if (!keyword) return allTags;
    return allTags.filter(tag => (tag?.name || '').toLowerCase().includes(keyword));
  }, [allTags, tagSearchText]);

  // 태그 목록 조회
  const fetchTags = useCallback(async () => {
    const isServerMode = useSubtitleStore.getState().isServerMode;
    const promptsStore = usePromptsStore.getState();

    // 로컬모드이거나 API 실패 상태이면 Store에서 로드
    if (!isServerMode || promptsStore.isApiFailed) {
      const cached = promptsStore.getTags();
      setAllTags(cached);
      return;
    }

    try {
      const response = await getAllTags();
      if (response.status === 'SUCCESS') {
        setAllTags(response.data || []);
      }
    } catch (err) {
      console.error('태그 조회 실패:', err);
      // API 실패 시 Store 폴백
      const cached = promptsStore.getTags();
      if (cached.length > 0) {
        setAllTags(cached);
      }
    }
  }, []);

  // 프롬프트 데이터를 폼에 적용하는 헬퍼
  const applyPromptData = useCallback((data) => {
    setOriginalData(data);

    let parsedParams = getInitialModelParams();
    try {
      const savedParams = typeof data.params === 'string'
        ? JSON.parse(data.params || '{}')
        : (data.params || {});
      parsedParams = { ...parsedParams, ...savedParams };
    } catch {
      // 파싱 실패 시 기본값
    }

    setFormData({
      name: data.name || '',
      description: data.description || '',
      prompt: data.prompt || '',
      tags: data.tags || [],
      model: data.model || '',
      sourceLang: data.sourceLang || 'ko',
      targetLang: data.targetLang || 'en',
      modelParams: parsedParams,
      testText: '',
    });
  }, []);

  // 프롬프트 상세 조회
  const fetchDetail = useCallback(async () => {
    if (!promptId) return;
    setLoading(true);
    setError(null);

    const isServerMode = useSubtitleStore.getState().isServerMode;
    const promptsStore = usePromptsStore.getState();

    // 로컬모드이거나 API 실패 상태이면 Store에서 로드
    if (!isServerMode || promptsStore.isApiFailed) {
      const cached = promptsStore.getPromptById(promptId);
      if (cached) {
        applyPromptData(cached);
      } else {
        setError(t('promptEdit.promptNotFound'));
      }
      setLoading(false);
      return;
    }

    try {
      const response = await getPromptById(promptId);
      if (response.status === 'SUCCESS') {
        applyPromptData(response.data);
      } else {
        setError(response.message || t('promptEdit.loadFailed'));
      }
    } catch (err) {
      setError(err.message || t('promptEdit.loadFailed'));
      // API 실패 시 Store 폴백
      const cached = promptsStore.getPromptById(promptId);
      if (cached) {
        applyPromptData(cached);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [promptId, applyPromptData]);

  // 초기 로드
  useEffect(() => {
    fetchTags();
    fetchDetail();
  }, [fetchTags, fetchDetail]);

  // 폼 변경 핸들러
  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // 모델 파라미터 변경
  const handleParamChange = useCallback((param, value) => {
    setFormData(prev => ({
      ...prev,
      modelParams: { ...prev.modelParams, [param]: value },
    }));
  }, []);

  // 태그 토글
  const handleTagToggle = useCallback((tag) => {
    setFormData(prev => {
      const exists = prev.tags.some(t => t.id === tag.id);
      if (exists) {
        return { ...prev, tags: prev.tags.filter(t => t.id !== tag.id) };
      }
      return { ...prev, tags: [...prev.tags, tag] };
    });
  }, []);

  // 테스트 결과 포맷팅
  const formatTestResult = useCallback((rawResponses) => {
    if (!rawResponses || rawResponses.length === 0) return t('promptEdit.noTranslationResult');
    return rawResponses.join(`\n\n${t('promptEdit.chunkSeparator')}\n\n`);
  }, []);

  // 테스트 시작
  const handleStartTest = useCallback(() => {
    if (!formData.prompt) { toast.warning(t('promptEdit.promptTextPlaceholder')); return; }
    if (!formData.testText) { toast.warning(t('promptEdit.testTextPlaceholder')); return; }
    if (!formData.model) { toast.warning(t('promptEdit.selectModel')); return; }
    setTestResult(null);
    setTestError(null);
    setIsTestModalOpen(true);
  }, [formData]);

  // 테스트 완료
  const handleTestComplete = useCallback((result) => {
    if (result?.rawResponses) {
      setTestResult(formatTestResult(result.rawResponses));
    }
    setIsTestModalOpen(false);
  }, [formatTestResult]);

  // 테스트 에러
  const handleTestError = useCallback((err) => {
    setTestError(err.message || t('promptEdit.testError'));
    setIsTestModalOpen(false);
  }, []);

  // 저장
  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) { toast.warning(t('promptEdit.promptNamePlaceholder')); return; }
    if (!formData.prompt.trim()) { toast.warning(t('promptEdit.promptTextPlaceholder')); return; }
    if (!formData.model) { toast.warning(t('promptEdit.selectModel')); return; }

    const isServerMode = useSubtitleStore.getState().isServerMode;
    const promptsStore = usePromptsStore.getState();
    const paramsJson = JSON.stringify(formData.modelParams);

    const promptBody = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      prompt: formData.prompt,
      tags: formData.tags,
      model: formData.model,
      sourceLang: formData.sourceLang,
      targetLang: formData.targetLang,
      params: paramsJson,
    };

    setSaveLoading(true);

    // 로컬모드: Store에 직접 저장
    if (!isServerMode || promptsStore.isApiFailed) {
      if (isCreateMode) {
        const newId = promptsStore.addPromptLocal(promptBody);
        setSaveLoading(false);
        toast.success(t('promptEdit.createdLocal'));
        onSave?.(newId);
      } else {
        const success = promptsStore.updatePromptLocal(promptId, promptBody);
        setSaveLoading(false);
        if (success) {
          toast.success(t('promptEdit.updatedLocal'));
          onSave?.();
        } else {
          toast.error(t('promptEdit.promptNotFound'));
        }
      }
      return;
    }

    // 서버모드: API 호출
    try {
      const apiBody = {
        ...promptBody,
        tagIds: formData.tags.map(tag => tag.id),
      };
      delete apiBody.tags;

      let response;
      if (isCreateMode) {
        response = await createPrompt(apiBody);
      } else {
        response = await updatePrompt(promptId, apiBody);
      }

      if (response.status === 'SUCCESS') {
        toast.success(isCreateMode ? t('promptEdit.created') : t('promptEdit.updated'));
        const newId = isCreateMode ? response.data?.id : undefined;
        onSave?.(newId);
      } else {
        toast.error(response.message || t('promptEdit.saveFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('promptEdit.saveFailed'));
    } finally {
      setSaveLoading(false);
    }
  }, [formData, promptId, isCreateMode, onSave]);

  // 삭제
  const handleDelete = useCallback(async () => {
    if (!window.confirm(t('promptEdit.deleteConfirm'))) return;

    const isServerMode = useSubtitleStore.getState().isServerMode;

    setDeleteLoading(true);

    // 로컬모드: Store에서 직접 삭제
    if (!isServerMode) {
      const success = usePromptsStore.getState().deletePromptLocal(promptId);
      setDeleteLoading(false);
      if (success) {
        toast.success(t('promptEdit.deletedLocal'));
        onDelete?.();
      } else {
        toast.error(t('promptEdit.promptNotFound'));
      }
      return;
    }

    // 서버모드: API 호출
    try {
      const response = await deletePrompt(promptId);
      if (response.status === 'SUCCESS') {
        toast.success(t('promptEdit.deleted'));
        onDelete?.();
      } else {
        toast.error(response.message || t('promptEdit.deleteFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('promptEdit.deleteFailed'));
    } finally {
      setDeleteLoading(false);
    }
  }, [promptId, onDelete]);

  // 파라미터 입력 필드 렌더링
  const renderParamInput = (paramKey, label, config = {}) => {
    const { min, max, step = 0.1, placeholder = '' } = config;
    const isSupported = isParamSupported(currentProvider, paramKey);
    const description = t(`soribaro:translation.promptDetail.paramDesc_${paramKey}`);

    // Provider별 파라미터 범위 보정
    // Claude는 temperature 0.0~1.0 (1.0 초과 시 API 400 에러)
    let effectiveMax = max;
    if (paramKey === 'temperature' && currentProvider === 'Claude') {
      effectiveMax = 1;
    }

    return (
      <div className="form-group" style={{ opacity: isSupported ? 1 : 0.5, marginBottom: '8px' }}>
        <Tooltip title={description || ''} placement="top" arrow>
          <label className="form-label" style={{ cursor: 'help', fontSize: '12px' }}>
            {label}
            {!isSupported && (
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '4px' }}>(미지원)</span>
            )}
          </label>
        </Tooltip>
        <input
          type="number"
          className="form-input"
          min={min}
          max={effectiveMax}
          step={step}
          value={formData.modelParams[paramKey]}
          onChange={(e) => handleParamChange(paramKey, Number(e.target.value))}
          placeholder={placeholder}
          disabled={!isSupported}
          style={{ padding: '8px 10px', fontSize: '13px' }}
        />
      </div>
    );
  };

  // 로딩
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="stt-config-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="close-btn"
              onClick={onBack}
              style={{ fontSize: '16px', padding: '4px 8px' }}
            >
              ←
            </button>
            <h2 style={{ margin: 0 }}>{isCreateMode ? t('promptEdit.createTitle') : t('promptEdit.editTitle')}</h2>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          {t('promptEdit.loadingData')}
        </div>
      </div>
    );
  }

  // 에러
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="stt-config-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="close-btn"
              onClick={onBack}
              style={{ fontSize: '16px', padding: '4px 8px' }}
            >
              ←
            </button>
            <h2 style={{ margin: 0 }}>{isCreateMode ? t('promptEdit.createTitle') : t('promptEdit.editTitle')}</h2>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px', gap: '12px' }}>
          <p style={{ color: 'var(--accent-secondary, #ff6b6b)', fontSize: '14px' }}>⚠️ {error}</p>
          <button className="btn-cancel" onClick={onBack} style={{ padding: '8px 16px', fontSize: '13px' }}>
            {t('promptEdit.backButton')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 헤더 */}
      <div className="stt-config-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="close-btn"
            onClick={onBack}
            style={{ fontSize: '16px', padding: '4px 8px' }}
            title={t('promptEdit.backButton')}
          >
            ←
          </button>
          <h2 style={{ margin: 0 }}>{isCreateMode ? t('promptEdit.createTitle') : t('promptEdit.editTitle')}</h2>
          {!isCreateMode && originalData?.id && (
            <span style={{
              fontSize: '11px',
              fontFamily: 'Consolas, Monaco, monospace',
              color: 'var(--text-tertiary)',
              background: 'var(--bg-tertiary)',
              padding: '2px 8px',
              borderRadius: '10px',
            }}>
              {originalData.id.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="stt-config-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        {/* 기본 정보 */}
        <section className="stt-config-section">
          <h3>{t('promptEdit.basicInfo')}</h3>
          <div className="form-group">
            <label className="form-label">{t('promptEdit.promptName')}</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder={t('promptEdit.promptNamePlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('promptEdit.description')}</label>
            <input
              type="text"
              className="form-input"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder={t('promptEdit.descriptionPlaceholder')}
            />
          </div>

          {/* 태그 선택 */}
          <div className="form-group">
            <label className="form-label">{t('promptEdit.tags')}</label>
            <input
              type="text"
              className="form-input"
              placeholder={t('promptEdit.tagSearchPlaceholder')}
              value={tagSearchText}
              onChange={(e) => setTagSearchText(e.target.value)}
              style={{ marginBottom: '8px' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {filteredTags.map((tag) => {
                const isSelected = formData.tags.some(t => t.id === tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleTagToggle(tag)}
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

          {/* 언어 설정 */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('promptEdit.sourceLanguage')}</label>
              <select
                className="form-select"
                value={formData.sourceLang}
                onChange={(e) => handleChange('sourceLang', e.target.value)}
              >
                <option value="ALL">🌐 {t('promptEdit.allLanguages')}</option>
                {languageList.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.code.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('promptEdit.targetLanguage')}</label>
              <select
                className="form-select"
                value={formData.targetLang}
                onChange={(e) => handleChange('targetLang', e.target.value)}
              >
                <option value="ALL">🌐 {t('promptEdit.allLanguages')}</option>
                {languageList.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.code.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 모델 설정 */}
        <section className="stt-config-section">
          <h3>{t('promptEdit.modelSettings')}</h3>
          <div className="form-group">
            <label className="form-label">{t('promptEdit.llmModel')}</label>
            <select
              className="form-select"
              value={formData.model}
              onChange={(e) => handleChange('model', e.target.value)}
            >
              <option value="">{t('promptEdit.selectModel')}</option>
              {formData.model && !allModels.some(m => m.model === formData.model) && (
                <option value={formData.model}>{formData.model} {t('promptEdit.legacyValue')}</option>
              )}
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
                {t('promptEdit.providerLabel', { provider: currentProvider })}
              </div>
            )}
          </div>

          {/* 모델 파라미터 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
            {renderParamInput('temperature', 'Temperature', { min: 0, max: 2, step: 0.1, placeholder: '0.7' })}
            {renderParamInput('max_tokens', 'Max Tokens', { min: 1, max: 128000, step: 100, placeholder: '2000' })}
            {renderParamInput('top_p', 'Top P', { min: 0, max: 1, step: 0.05, placeholder: '1.0' })}
            {renderParamInput('top_k', 'Top K', { min: 1, max: 100, step: 1, placeholder: '40' })}
            {renderParamInput('presence_penalty', 'Presence Penalty', { min: -2, max: 2, step: 0.1, placeholder: '0' })}
            {renderParamInput('frequency_penalty', 'Frequency Penalty', { min: -2, max: 2, step: 0.1, placeholder: '0' })}
          </div>
          <div className="form-group" style={{ marginTop: '8px' }}>
            {renderParamInput('chunk_size', 'Chunk Size', { min: 10, max: 200, step: 10, placeholder: '50' })}
          </div>
        </section>

        {/* 프롬프트 내용 */}
        <section className="stt-config-section">
          <h3>{t('promptEdit.promptContent')}</h3>
          <div className="form-group">
            <label className="form-label">{t('promptEdit.promptText')}</label>
            <textarea
              className="form-input"
              value={formData.prompt}
              onChange={(e) => handleChange('prompt', e.target.value)}
              placeholder={t('promptEdit.promptTextPlaceholder')}
              rows={10}
              style={{
                fontFamily: 'Consolas, Monaco, Courier New, monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
              }}
            />
          </div>
        </section>

        {/* 프롬프트 테스트 */}
        <section className="stt-config-section">
          <h3>{t('promptEdit.promptTest')}</h3>
          <div className="form-group">
            <label className="form-label">{t('promptEdit.testText')}</label>
            <textarea
              className="form-input"
              value={formData.testText}
              onChange={(e) => handleChange('testText', e.target.value)}
              placeholder={t('promptEdit.testTextPlaceholder')}
              rows={5}
              style={{
                fontFamily: 'Consolas, Monaco, Courier New, monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              className="btn-start"
              onClick={handleStartTest}
              disabled={!formData.prompt || !formData.testText || !formData.model}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                borderRadius: '6px',
                cursor: (!formData.prompt || !formData.testText || !formData.model) ? 'not-allowed' : 'pointer',
                opacity: (!formData.prompt || !formData.testText || !formData.model) ? 0.5 : 1,
                background: 'var(--primary, #7aa2f7)',
                border: '1px solid var(--primary, #7aa2f7)',
                color: 'white',
              }}
            >
              {t('promptEdit.runTest')}
            </button>
          </div>

          {/* 테스트 에러 */}
          {testError && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid var(--error-color, #ff6b6b)',
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--error-color, #ff6b6b)', marginBottom: '4px' }}>
                {t('promptEdit.testFailed')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--error-color, #ff6b6b)' }}>{testError}</div>
              <button
                className="btn-cancel"
                onClick={() => setTestError(null)}
                style={{ marginTop: '8px', padding: '4px 12px', fontSize: '12px' }}
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {/* 테스트 결과 */}
          {testResult && (
            <div style={{
              marginTop: '12px',
              background: 'var(--surface-dark)',
              border: '1px solid var(--success-color, #51cf66)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(81, 207, 102, 0.1)',
                borderBottom: '1px solid var(--success-color, #51cf66)',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success-color, #51cf66)' }}>
                  {t('promptEdit.testResult')}
                </span>
                <button
                  className="btn-cancel"
                  onClick={() => setTestResult(null)}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                >
                  {t('common.close')}
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '12px',
                fontFamily: 'Consolas, Monaco, Courier New, monospace',
                fontSize: '12px',
                lineHeight: '1.6',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '200px',
                overflowY: 'auto',
              }}>
                {testResult}
              </pre>
            </div>
          )}
        </section>
      </div>

      {/* 푸터 */}
      <div className="stt-config-footer" style={{ justifyContent: isCreateMode ? 'flex-end' : 'space-between' }}>
        {!isCreateMode && (
          <button
            className="btn-cancel"
            onClick={handleDelete}
            disabled={deleteLoading}
            style={{
              padding: '10px 20px',
              fontSize: '0.9rem',
              color: 'var(--error-color, #ff6b6b)',
              borderColor: 'var(--error-color, #ff6b6b)',
            }}
          >
            {deleteLoading ? t('common.deleting') : t('promptEdit.deleteButton')}
          </button>
        )}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-cancel" onClick={onBack}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-start"
            onClick={handleSave}
            disabled={saveLoading}
          >
            {saveLoading ? (isCreateMode ? t('common.creating') : t('common.saving')) : (isCreateMode ? t('common.create') : t('common.save'))}
          </button>
        </div>
      </div>

      {/* 프롬프트 테스트 모달 */}
      <ProcessModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        type="translate"
        translateOptions={{
          testMode: true,
          isPromptTest: true,
          sourceLang: formData.sourceLang,
          lang: languageList.find(l => l.code === formData.targetLang)?.name || 'English',
          inlineSubtitleData: formData.testText || '',
          customPrompt: formData.prompt || '',
          model: formData.model,
          temperature: formData.modelParams.temperature,
          maxTokens: formData.modelParams.max_tokens,
          topP: formData.modelParams.top_p,
          frequencyPenalty: formData.modelParams.frequency_penalty,
          presencePenalty: formData.modelParams.presence_penalty,
          chunkSize: formData.modelParams.chunk_size,
        }}
        onComplete={handleTestComplete}
        onError={handleTestError}
      />
    </div>
  );
}
