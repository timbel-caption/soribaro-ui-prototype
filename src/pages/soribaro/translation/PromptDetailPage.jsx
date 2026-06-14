import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { getPromptById, createPrompt, updatePrompt, deletePrompt } from '../../../api/v9/prompts';
import { usePromptsStore } from '../../../stores/promptsStore';

import { getAllTags } from '../../../api/v9/tags';
import ProcessModal from '../../../components/common/ProcessModal/ProcessModal';
import languageList from '../../../constants/language.json';
import llmModels from './llmModels.json';
import { getTagColor } from '../../../constants/tagColors';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './PromptDetailPage.css';

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

// 모델명으로 프로바이더 판별
const getProviderFromModel = (modelName) => {
  if (!modelName) return null;
  const lowerModel = modelName.toLowerCase();
  
  if (lowerModel.startsWith('claude')) return 'Claude';
  if (lowerModel.startsWith('gemini')) return 'Gemini';
  if (lowerModel.startsWith('gpt')) return 'OpenAI';
  
  // llmModels.json에서 찾기
  const found = allModels.find(m => m.model === modelName);
  return found ? found.provider : null;
};

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

// 파라미터 지원 여부 확인
const isParamSupported = (provider, param) => {
  if (!provider || !PROVIDER_PARAM_SUPPORT[provider]) return true;
  return PROVIDER_PARAM_SUPPORT[provider][param] ?? false;
};

// 날짜 포맷 함수
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  testText: '', // 테스트용 텍스트
});

export default function PromptDetailPage() {
  const { t } = useTranslation('soribaro');
  const { id } = useParams();
  const navigate = useNavigate();
  
  // 생성 모드 여부
  const isCreateMode = id === 'new';
  
  // 상태
  const [loading, setLoading] = useState(!isCreateMode);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(getInitialFormData());
  const [originalData, setOriginalData] = useState(null);
  const [allTags, setAllTags] = useState([]);

  // 테스트 관련 상태
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);

  // 현재 선택된 모델의 프로바이더
  const currentProvider = useMemo(() => {
    return getProviderFromModel(formData.model);
  }, [formData.model]);

  // 태그 목록 조회
  const fetchTags = useCallback(async () => {
    const promptsStore = usePromptsStore.getState();

    // API 실패 상태이면 Store에서 로드
    if (promptsStore.isApiFailed) {
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
      console.error('Tags fetch error:', err);
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
      // 파싱 실패시 기본값 사용
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
    });
  }, []);

  // 프롬프트 상세 조회
  const fetchDetail = useCallback(async () => {
    if (isCreateMode) return;
    
    setLoading(true);
    setError(null);

    const promptsStore = usePromptsStore.getState();

    // API 실패 상태이면 Store에서 로드
    if (promptsStore.isApiFailed) {
      const cached = promptsStore.getPromptById(id);
      if (cached) {
        applyPromptData(cached);
      } else {
        setError(t('translation.promptManagement.alertStoreNotFound'));
      }
      setLoading(false);
      return;
    }
    
    try {
      const response = await getPromptById(id);
      if (response.status === 'SUCCESS') {
        applyPromptData(response.data);
      } else {
        setError(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      console.error('API Error:', err);
      // API 실패 시 Store 폴백
      const cached = promptsStore.getPromptById(id);
      if (cached) {
        applyPromptData(cached);
      } else {
        setError(err.message || t('common.loadDataFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [id, isCreateMode, applyPromptData]);

  // 초기 데이터 로드
  useEffect(() => {
    fetchTags();
    if (!isCreateMode) {
      fetchDetail();
    }
  }, [fetchTags, fetchDetail, isCreateMode]);

  // 폼 데이터 변경
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

  // 태그 변경
  const handleTagsChange = useCallback((event, newValue) => {
    setFormData(prev => ({ ...prev, tags: newValue }));
  }, []);

  // 테스트 결과 포맷팅 (LLM 원본 응답 그대로 표시)
  const formatTestResult = useCallback((rawResponses) => {
    if (!rawResponses || rawResponses.length === 0) return t('translation.promptDetail.noTestResult');
    return rawResponses.join(`\n\n${t('translation.promptDetail.chunkSeparator')}\n\n`);
  }, []);

  // 테스트 시작
  const handleStartTest = useCallback(() => {
    if (!formData.prompt) {
      alert(t('translation.promptDetail.alertPromptContentRequired'));
      return;
    }
    if (!formData.testText) {
      alert(t('translation.promptDetail.alertTestTextRequired'));
      return;
    }
    if (!formData.model) {
      alert(t('translation.promptDetail.alertModelRequired'));
      return;
    }

    setTestResult(null);
    setTestError(null);
    setIsTestModalOpen(true);
  }, [formData]);

  // 테스트 완료 처리
  const handleTestComplete = useCallback((result) => {
    if (result?.rawResponses) {
      setTestResult(formatTestResult(result.rawResponses));
    }
    setIsTestModalOpen(false);
  }, [formatTestResult]);

  // 테스트 에러 처리
  const handleTestError = useCallback((err) => {
    setTestError(err.message || t('translation.promptDetail.alertTestError'));
    setIsTestModalOpen(false);
  }, []);

  // 저장
  const handleSave = useCallback(async () => {
    // 유효성 검사
    if (!formData.name.trim()) {
      alert(t('translation.promptDetail.alertPromptNameRequired'));
      return;
    }
    if (!formData.prompt.trim()) {
      alert(t('translation.promptDetail.alertPromptContentRequired'));
      return;
    }
    if (!formData.model) {
      alert(t('translation.promptDetail.alertModelRequired'));
      return;
    }

    const promptsStore = usePromptsStore.getState();
    const paramsJson = JSON.stringify(formData.modelParams);

    setSaveLoading(true);

    // API 실패 상태이면 Store에 직접 저장
    if (promptsStore.isApiFailed) {
      if (isCreateMode) {
        alert(t('translation.promptDetail.alertOfflineNoCreate'));
        setSaveLoading(false);
        return;
      }

      const updates = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        prompt: formData.prompt,
        tags: formData.tags,
        model: formData.model,
        sourceLang: formData.sourceLang,
        targetLang: formData.targetLang,
        params: paramsJson,
      };
      const success = promptsStore.updatePromptLocal(id, updates);
      setSaveLoading(false);
      if (success) {
        alert(t('translation.promptDetail.alertSavedLocal'));
        navigate('/soribaro/translation/prompt');
      } else {
        alert(t('translation.promptManagement.alertStoreNotFound'));
      }
      return;
    }

    try {
      const body = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        prompt: formData.prompt,
        tagIds: formData.tags.map(tag => tag.id),
        model: formData.model,
        sourceLang: formData.sourceLang,
        targetLang: formData.targetLang,
        params: paramsJson,
      };

      let response;
      if (isCreateMode) {
        response = await createPrompt(body);
      } else {
        response = await updatePrompt(id, body);
      }

      if (response.status === 'SUCCESS') {
        alert(isCreateMode ? t('translation.promptDetail.alertCreated') : t('translation.promptDetail.alertUpdated'));
        navigate('/soribaro/translation/prompt');
      } else {
        alert(response.message || t('translation.promptDetail.alertSavedLocal'));
      }
    } catch (err) {
      alert(err.message || t('translation.promptDetail.alertSavedLocal'));
      console.error('Save API Error:', err);
    } finally {
      setSaveLoading(false);
    }
  }, [formData, isCreateMode, id, navigate]);

  // 삭제
  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDelete = useCallback(async () => {
    if (isCreateMode) return;
    if (!window.confirm(t('translation.promptDetail.confirmDelete'))) return;

    const promptsStore = usePromptsStore.getState();

    setDeleteLoading(true);

    // API 실패 상태이면 Store에서 직접 삭제
    if (promptsStore.isApiFailed) {
      const success = promptsStore.deletePromptLocal(id);
      setDeleteLoading(false);
      if (success) {
        alert(t('translation.promptDetail.alertDeletedLocal'));
        navigate('/soribaro/translation/prompt');
      } else {
        alert(t('translation.promptManagement.alertStoreNotFound'));
      }
      return;
    }

    try {
      const response = await deletePrompt(id);
      if (response.status === 'SUCCESS') {
        alert(t('translation.promptDetail.alertDeleted'));
        navigate('/soribaro/translation/prompt');
      } else {
        alert(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      alert(err.message || t('common.loadDataFailed'));
    } finally {
      setDeleteLoading(false);
    }
  }, [isCreateMode, id, navigate]);

  // 목록으로 돌아가기
  const handleBack = () => {
    navigate('/soribaro/translation/prompt');
  };

  if (loading) {
    return (
      <div className="notion-page prompt-detail-page">
        <div className="loading-center">
          <span className="spinner" />
          <span>{t('common.loadingData')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notion-page prompt-detail-page">
        <div className="error-center">
          <p>{error}</p>
          <button className="btn-ghost" onClick={handleBack}>
            {t('translation.promptDetail.backToList')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-page prompt-detail-page">
      <button className="btn-back" onClick={handleBack}>
        {t('translation.promptDetail.backToList')}
      </button>

      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isCreateMode ? t('translation.promptDetail.pageTitleCreate') : t('translation.promptDetail.pageTitleEdit')}
          </h1>
          <p className="page-description">{t('translation.promptDetail.pageDescription')}</p>
        </div>
        <div className="header-actions">
          {!isCreateMode && originalData?.id && (
            <span className="prompt-id-badge">ID: {originalData.id}</span>
          )}
          {!isCreateMode && (
            <button className="btn-danger" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? t('common.processing') : t('common.delete')}
            </button>
          )}
          <button className="btn-primary" onClick={handleSave} disabled={saveLoading}>
            {saveLoading ? t('common.processing') : (isCreateMode ? t('translation.promptDetail.register') : t('common.save'))}
          </button>
        </div>
      </div>

      <div className="form-container">
        {/* 등록 정보 (수정 모드) */}
        {!isCreateMode && originalData && (
          <div className="form-section">
            <h2 className="section-title">{t('translation.promptDetail.registrationInfo')}</h2>
            <div className="prop-list">
              <div className="prop-item">
                <span className="prop-label">{t('translation.promptDetail.labelCreatedAt')}</span>
                <span className="prop-value">{formatDate(originalData.createdAt)}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">{t('translation.promptDetail.labelUpdatedAt')}</span>
                <span className="prop-value">{formatDate(originalData.updatedAt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 기본 정보 */}
        <div className="form-section">
          <h2 className="section-title">{t('translation.promptDetail.basicInfo')}</h2>
          <div className="form-card">
            <div className="form-row two-cols">
              <TextField
                label={t('translation.promptDetail.labelPromptName')}
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                size="small"
                fullWidth
                required
                placeholder={t('translation.promptDetail.placeholderPromptName')}
              />
              <TextField
                label={t('translation.promptDetail.labelDescription')}
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                size="small"
                fullWidth
                placeholder={t('translation.promptDetail.placeholderDescription')}
              />
            </div>

            <div className="form-row">
              <Autocomplete
                multiple
                options={allTags}
                getOptionLabel={(option) => option.name || ''}
                value={formData.tags}
                onChange={handleTagsChange}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderTags={(value, getTagProps) =>
                  value.map((tag, index) => {
                    const colors = getTagColor(tag.name);
                    return (
                      <Chip
                        key={tag.id}
                        label={tag.name}
                        {...getTagProps({ index })}
                        size="small"
                        variant="outlined"
                        sx={{
                          color: colors.color,
                          borderColor: colors.border,
                          background: 'transparent',
                          borderRadius: '10px',
                          fontWeight: 600,
                          '& .MuiChip-label': { lineHeight: 1, paddingTop: '1px' },
                          '& .MuiChip-deleteIcon': {
                            color: colors.color,
                            opacity: 0.7,
                            '&:hover': { color: colors.color, opacity: 1 },
                          },
                        }}
                      />
                    );
                  })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('translation.promptDetail.labelTags')}
                    placeholder={formData.tags.length === 0 ? t('translation.promptDetail.placeholderTags') : ""}
                    size="small"
                    helperText={t('translation.promptDetail.tagsHelperText')}
                  />
                )}
                fullWidth
              />
            </div>

            <div className="form-row two-cols">
              <TextField
                select
                label={t('translation.promptDetail.labelSourceLang')}
                value={formData.sourceLang}
                onChange={(e) => handleChange('sourceLang', e.target.value)}
                size="small"
                fullWidth
              >
                <MenuItem value="ALL">
                  <span style={{ marginRight: '8px' }}>🌐</span>
                  {t('translation.promptDetail.allLangs')}
                </MenuItem>
                {languageList.map((lang) => (
                  <MenuItem key={lang.code} value={lang.code}>
                    <span style={{ marginRight: '8px' }}>{lang.flag}</span>
                    {lang.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t('translation.promptDetail.labelTargetLang')}
                value={formData.targetLang}
                onChange={(e) => handleChange('targetLang', e.target.value)}
                size="small"
                fullWidth
              >
                <MenuItem value="ALL">
                  <span style={{ marginRight: '8px' }}>🌐</span>
                  {t('translation.promptDetail.allLangs')}
                </MenuItem>
                {languageList.map((lang) => (
                  <MenuItem key={lang.code} value={lang.code}>
                    <span style={{ marginRight: '8px' }}>{lang.flag}</span>
                    {lang.name}
                  </MenuItem>
                ))}
              </TextField>
            </div>
          </div>
        </div>

        {/* 모델 설정 */}
        <div className="form-section">
          <h2 className="section-title">{t('translation.promptDetail.modelSettings')}</h2>
          <div className="form-card">
            <div className="form-row">
              <TextField
                select
                label={t('translation.promptDetail.labelModel')}
                value={formData.model}
                onChange={(e) => handleChange('model', e.target.value)}
                size="small"
                fullWidth
                required
              >
                {formData.model && !allModels.some(m => m.model === formData.model) && (
                  <MenuItem value={formData.model}>
                    {formData.model} {t('translation.promptDetail.existingValue')}
                  </MenuItem>
                )}
                {Object.entries(llmModels).map(([provider, models]) => [
                  <ListSubheader key={provider} sx={{ backgroundColor: 'var(--surface-dark)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {provider}
                  </ListSubheader>,
                  ...models.map(model => (
                    <MenuItem key={model} value={model} sx={{ pl: 3 }}>
                      {model}
                    </MenuItem>
                  ))
                ])}
              </TextField>
            </div>

            {currentProvider && (
              <div className="provider-info">
                {t('translation.promptDetail.selectedProvider', { provider: currentProvider })}
              </div>
            )}

            <div className="params-section">
              <h3 className="params-title">{t('translation.promptDetail.modelParams')}</h3>
              <div className="params-grid">
                <div className="param-item">
                  <div className="param-header">
                    <span className="param-name">Temperature</span>
                    <Tooltip title={t("translation.promptDetail.paramDesc_temperature")} arrow placement="top"
                      componentsProps={{ tooltip: { sx: { maxWidth: 300, fontSize: '12px', lineHeight: 1.5 } } }}>
                      <span className="param-help">?</span>
                    </Tooltip>
                  </div>
                  <TextField type="number" value={formData.modelParams.temperature}
                    onChange={(e) => handleParamChange('temperature', Number(e.target.value))}
                    size="small" disabled={!isParamSupported(currentProvider, 'temperature')}
                    inputProps={{ min: 0, max: currentProvider === 'Claude' ? 1 : 2, step: 0.1 }}
                    fullWidth placeholder={currentProvider === 'Claude' ? '0 ~ 1' : '0 ~ 2'} />
                </div>

                <div className="param-item">
                  <div className="param-header">
                    <span className="param-name">Max Tokens</span>
                    <Tooltip title={t("translation.promptDetail.paramDesc_max_tokens")} arrow placement="top"
                      componentsProps={{ tooltip: { sx: { maxWidth: 300, fontSize: '12px', lineHeight: 1.5 } } }}>
                      <span className="param-help">?</span>
                    </Tooltip>
                  </div>
                  <TextField type="number" value={formData.modelParams.max_tokens}
                    onChange={(e) => handleParamChange('max_tokens', Number(e.target.value))}
                    size="small" disabled={!isParamSupported(currentProvider, 'max_tokens')}
                    inputProps={{ min: 1, max: 128000 }} fullWidth placeholder="1 ~ 128000" />
                </div>

                <div className="param-item">
                  <div className="param-header">
                    <span className="param-name">Top P</span>
                    <Tooltip title={t("translation.promptDetail.paramDesc_top_p")} arrow placement="top"
                      componentsProps={{ tooltip: { sx: { maxWidth: 300, fontSize: '12px', lineHeight: 1.5 } } }}>
                      <span className="param-help">?</span>
                    </Tooltip>
                  </div>
                  <TextField type="number" value={formData.modelParams.top_p}
                    onChange={(e) => handleParamChange('top_p', Number(e.target.value))}
                    size="small" disabled={!isParamSupported(currentProvider, 'top_p')}
                    inputProps={{ min: 0, max: 1, step: 0.05 }} fullWidth placeholder="0 ~ 1" />
                </div>

                {isParamSupported(currentProvider, 'top_k') && (
                  <div className="param-item">
                    <div className="param-header">
                      <span className="param-name">Top K</span>
                      <Tooltip title={t("translation.promptDetail.paramDesc_top_k")} arrow placement="top"
                        componentsProps={{ tooltip: { sx: { maxWidth: 300, fontSize: '12px', lineHeight: 1.5 } } }}>
                        <span className="param-help">?</span>
                      </Tooltip>
                    </div>
                    <TextField type="number" value={formData.modelParams.top_k}
                      onChange={(e) => handleParamChange('top_k', Number(e.target.value))}
                      size="small" inputProps={{ min: 1, max: 100 }} fullWidth placeholder="1 ~ 100" />
                  </div>
                )}

                {isParamSupported(currentProvider, 'presence_penalty') && (
                  <div className="param-item">
                    <div className="param-header">
                      <span className="param-name">Presence Penalty</span>
                      <Tooltip title={t("translation.promptDetail.paramDesc_presence_penalty")} arrow placement="top"
                        componentsProps={{ tooltip: { sx: { maxWidth: 300, fontSize: '12px', lineHeight: 1.5 } } }}>
                        <span className="param-help">?</span>
                      </Tooltip>
                    </div>
                    <TextField type="number" value={formData.modelParams.presence_penalty}
                      onChange={(e) => handleParamChange('presence_penalty', Number(e.target.value))}
                      size="small" inputProps={{ min: -2, max: 2, step: 0.1 }} fullWidth placeholder="-2 ~ 2" />
                  </div>
                )}

                {isParamSupported(currentProvider, 'frequency_penalty') && (
                  <div className="param-item">
                    <div className="param-header">
                      <span className="param-name">Frequency Penalty</span>
                      <Tooltip title={t("translation.promptDetail.paramDesc_frequency_penalty")} arrow placement="top"
                        componentsProps={{ tooltip: { sx: { maxWidth: 300, fontSize: '12px', lineHeight: 1.5 } } }}>
                        <span className="param-help">?</span>
                      </Tooltip>
                    </div>
                    <TextField type="number" value={formData.modelParams.frequency_penalty}
                      onChange={(e) => handleParamChange('frequency_penalty', Number(e.target.value))}
                      size="small" inputProps={{ min: -2, max: 2, step: 0.1 }} fullWidth placeholder="-2 ~ 2" />
                  </div>
                )}

                <div className="param-item">
                  <div className="param-header">
                    <span className="param-name">Chunk Size</span>
                    <Tooltip title={t("translation.promptDetail.paramDesc_chunk_size")} arrow placement="top"
                      componentsProps={{ tooltip: { sx: { maxWidth: 300, fontSize: '12px', lineHeight: 1.5 } } }}>
                      <span className="param-help">?</span>
                    </Tooltip>
                  </div>
                  <TextField type="number" value={formData.modelParams.chunk_size}
                    onChange={(e) => handleParamChange('chunk_size', Number(e.target.value))}
                    size="small" inputProps={{ min: 10, max: 200, step: 10 }} fullWidth placeholder="10 ~ 200" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 프롬프트 내용 */}
        <div className="form-section">
          <h2 className="section-title">{t('translation.promptDetail.promptContent')}</h2>
          <div className="form-card">
            <TextField
              label={t('translation.promptDetail.labelPromptText')}
              value={formData.prompt}
              onChange={(e) => handleChange('prompt', e.target.value)}
              multiline
              rows={12}
              fullWidth
              required
              placeholder={t('translation.promptDetail.placeholderPromptText')}
              className="prompt-text-field"
            />
          </div>
        </div>

        {/* 테스트 */}
        <div className="form-section">
          <h2 className="section-title">{t('translation.promptDetail.promptTest')}</h2>
          <div className="form-card">
            <TextField
              label={t('translation.promptDetail.labelTestText')}
              value={formData.testText}
              onChange={(e) => handleChange('testText', e.target.value)}
              multiline
              rows={8}
              fullWidth
              placeholder={t('translation.promptDetail.placeholderTestText')}
              className="prompt-text-field"
            />
            <div className="test-button-container">
              <button
                className="btn-primary"
                onClick={handleStartTest}
                disabled={!formData.prompt || !formData.testText || !formData.model}
              >
                {t('translation.promptDetail.runTest')}
              </button>
            </div>

            {testError && (
              <div className="test-error-container">
                <h3>{t('translation.promptDetail.testFailed')}</h3>
                <p>{testError}</p>
                <button className="btn-ghost" onClick={() => setTestError(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {testResult && (
              <div className="test-result-container">
                <div className="test-result-header">
                  <h3>{t('translation.promptDetail.testResult')}</h3>
                  <button className="btn-ghost btn-sm" onClick={() => setTestResult(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
                <pre className="test-result-content">{testResult}</pre>
              </div>
            )}
          </div>
        </div>

      </div>

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
