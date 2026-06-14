import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslateJobStore, STEPS } from '../stores/translateJobStore';
import {
  executeTranslateJob,
  cancelTranslateJob,
} from '../services/translateJobService';
import { getTranslation } from '../api/translates';
import { getPrompts, getPromptById } from '../api/v9/prompts';
import { confirm } from '../stores/modalStore';
import { ProcessModal } from '../components/common/ProcessModal';
import ConfirmModal from '../components/worktool/common/ConfirmModal';
import languageList from '../constants/language.json';
import './ProgressPage.css'; // ProgressPage와 동일한 스타일 사용

/**
 * 번역 작업 단계 목록
 */
const TRANSLATE_STEP_LIST = [
  STEPS.LOADING,
  STEPS.TRANSLATING,
  STEPS.SAVING,
  STEPS.COMPLETED,
];

/**
 * 언어 코드 → 이름 매핑 (language.json 기반)
 */
const LANGUAGE_NAMES = languageList.reduce((acc, lang) => {
  acc[lang.code] = lang.name;
  return acc;
}, {});

/**
 * 태그 칩 색상
 */
const TAG_COLORS = [
  { bg: '#3b82f6', color: '#ffffff' },
  { bg: '#10b981', color: '#ffffff' },
  { bg: '#f59e0b', color: '#ffffff' },
  { bg: '#8b5cf6', color: '#ffffff' },
  { bg: '#ec4899', color: '#ffffff' },
];

export default function TranslatesPage() {
  const { id: fileId } = useParams(); // /translates/:id 형태로 fileId 전달
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // 번역 파라미터
  const lang = searchParams.get('lang'); // 필수
  const sourceLang = searchParams.get('sourceLang');
  const model = searchParams.get('model');
  const chunkSize = searchParams.get('chunkSize')
    ? Number(searchParams.get('chunkSize'))
    : undefined;
  const temperature = searchParams.get('temperature')
    ? Number(searchParams.get('temperature'))
    : undefined;
  const promptId = searchParams.get('promptId');

  // 번역 작업 상태
  const {
    currentStep,
    detailProgress,
    error,
    totalChunks,
    completedChunks,
    failedChunks,
    reset,
    getTotalProgress,
    isProcessing,
  } = useTranslateJobStore();

  // 탭 종료 방지
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isProcessing()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  // 번역 작업 실행 (URL 직접 접근)
  useEffect(() => {
    if (!fileId) {
      return;
    }

    if (!lang) {
      useTranslateJobStore.getState().setError('번역 대상 언어(lang)가 필요합니다.');
      return;
    }

    const checkAndExecute = async () => {
      // 기존 번역 존재 확인
      try {
        const result = await getTranslation(fileId, { lang });
        if (result?.success && result?.data?.translates?.length > 0) {
          const targetLangName = LANGUAGE_NAMES[lang] || lang;
          const confirmed = await confirm(
            `이미 ${targetLangName} 번역 데이터가 있습니다. 그래도 작업을 진행하시겠습니까?\n아니오 선택 시 기존 번역 데이터를 사용합니다.`,
            {
              title: '번역 실행 확인',
              confirmText: '예',
              cancelText: '아니오',
            }
          );

          if (!confirmed) {
            // "아니오" 선택 시 worktool 페이지로 이동하여 기존 번역 표시
            navigate(`/worktool/${fileId}`);
            return;
          }
        }
      } catch (error) {
        // 번역 조회 실패 시 (번역 없음으로 간주) 계속 진행
        console.log('번역 조회 실패 또는 없음:', error);
      }

      // 번역 작업 실행
      reset();

      // fileId가 있으면 서버모드 (서버에서 파일 로드)
      const isServerMode = !!fileId;
      
      executeTranslateJob(fileId, {
        lang,
        sourceLang,
        model,
        chunkSize,
        temperature,
        promptId,
        isServerMode,
      })
        .then((result) => {
          console.log('번역 작업 완료:', result);
          // 완료 후 작업툴 페이지로 이동
          setTimeout(() => navigate(`/worktool/${fileId}`), 1500);
        })
        .catch((err) => {
          console.error('번역 작업 실패:', err);
        });
    };

    checkAndExecute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, lang, sourceLang, model, chunkSize, temperature, promptId]);

  // 취소 핸들러
  const handleCancel = useCallback(() => {
    if (window.confirm('작업을 취소하시겠습니까?')) {
      cancelTranslateJob();
      navigate(-1);
    }
  }, [navigate]);

  // 재시도 핸들러
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  // ==================== 입력 폼 모드 (fileId 없을 때) ====================
  const [formFileId, setFormFileId] = useState('');
  const [formSourceLang, setFormSourceLang] = useState('ko'); // 원본 언어 (필수)
  const [formLang, setFormLang] = useState('en'); // 번역 대상 언어 (필수)
  const [formModel, setFormModel] = useState('');
  const [formChunkSize, setFormChunkSize] = useState('50');
  const [formTemperature, setFormTemperature] = useState('0.3');

  // ==================== 프롬프트 선택 관련 상태 ====================
  const [promptList, setPromptList] = useState([]);
  const [promptListLoading, setPromptListLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [promptDetailLoading, setPromptDetailLoading] = useState(false);

  // 프롬프트 선택 시 언어가 ALL인지 여부 (사용자 선택 유지 여부)
  const [isSourceLangFromPrompt, setIsSourceLangFromPrompt] = useState(false);
  const [isTargetLangFromPrompt, setIsTargetLangFromPrompt] = useState(false);

  // ==================== 모달 상태 ====================
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ==================== 프롬프트 목록 조회 ====================
  const fetchPromptList = useCallback(async () => {
    setPromptListLoading(true);
    try {
      const response = await getPrompts();
      if (response.status === 'SUCCESS') {
        setPromptList(response.data || []);
      }
    } catch (err) {
      console.error('프롬프트 목록 조회 실패:', err);
    } finally {
      setPromptListLoading(false);
    }
  }, []);

  // 페이지 로드 시 프롬프트 목록 조회
  useEffect(() => {
    if (!fileId) {
      fetchPromptList();
    }
  }, [fileId, fetchPromptList]);

  // ==================== 프롬프트 선택 핸들러 ====================
  const handlePromptSelect = useCallback(async (event, newValue) => {
    setSelectedPrompt(newValue);

    if (!newValue) {
      // 프롬프트 선택 해제 시 초기화
      setIsSourceLangFromPrompt(false);
      setIsTargetLangFromPrompt(false);
      return;
    }

    // 프롬프트 상세 조회
    setPromptDetailLoading(true);
    try {
      const response = await getPromptById(newValue.id);
      if (response.status === 'SUCCESS') {
        const promptData = response.data;

        // 모델 설정
        if (promptData.model) {
          setFormModel(promptData.model);
        }

        // 원본 언어 설정 (ALL이 아닌 경우에만)
        if (promptData.sourceLang && promptData.sourceLang !== 'ALL') {
          setFormSourceLang(promptData.sourceLang);
          setIsSourceLangFromPrompt(true);
        } else {
          setIsSourceLangFromPrompt(false);
        }

        // 대상 언어 설정 (ALL이 아닌 경우에만)
        if (promptData.targetLang && promptData.targetLang !== 'ALL') {
          setFormLang(promptData.targetLang);
          setIsTargetLangFromPrompt(true);
        } else {
          setIsTargetLangFromPrompt(false);
        }

        // params JSON 파싱하여 파라미터 설정
        try {
          const params = JSON.parse(promptData.params || '{}');
          if (params.temperature !== undefined) {
            setFormTemperature(String(params.temperature));
          }
          if (params.chunk_size !== undefined) {
            setFormChunkSize(String(params.chunk_size));
          }
        } catch {
          // 파싱 실패 시 무시
        }
      }
    } catch (err) {
      console.error('프롬프트 상세 조회 실패:', err);
    } finally {
      setPromptDetailLoading(false);
    }
  }, []);

  // 언어 옵션 메모이제이션
  const languageOptions = useMemo(() => {
    return languageList.map((lang) => ({
      code: lang.code,
      label: `${lang.flag} ${lang.name} (${lang.code})`,
    }));
  }, []);

  // 번역 시작 핸들러 - 번역 확인 후 모달 열기
  const handleStartTranslation = useCallback(async () => {
    if (!formFileId.trim()) {
      alert('파일 ID를 입력해주세요.');
      return;
    }
    if (!formSourceLang) {
      alert('원본 언어를 선택해주세요.');
      return;
    }
    if (!formLang) {
      alert('번역 대상 언어를 선택해주세요.');
      return;
    }
    if (formSourceLang === formLang) {
      alert('원본 언어와 번역 대상 언어가 같습니다.');
      return;
    }

    // 기존 번역 존재 확인
    try {
      const result = await getTranslation(formFileId.trim(), { lang: formLang });
      if (result?.success && result?.data?.translates?.length > 0) {
        const targetLangName = LANGUAGE_NAMES[formLang] || formLang;
        const confirmed = await confirm(
          `이미 ${targetLangName} 번역 데이터가 있습니다. 그래도 작업을 진행하시겠습니까?\n아니오 선택 시 기존 번역 데이터를 사용합니다.`,
          {
            title: '번역 실행 확인',
            confirmText: '예',
            cancelText: '아니오',
          }
        );

        if (!confirmed) {
          // "아니오" 선택 시 worktool 페이지로 이동하여 기존 번역 표시
          navigate(`/worktool/${formFileId.trim()}`);
          return;
        }
      }
    } catch (error) {
      // 번역 조회 실패 시 (번역 없음으로 간주) 계속 진행
      console.log('번역 조회 실패 또는 없음:', error);
    }

    setIsModalOpen(true);
  }, [formFileId, formSourceLang, formLang, navigate]);

  // 모달 닫기 핸들러
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // fileId가 없는 경우 - 입력 폼 표시
  if (!fileId) {
    return (
      <div className="progress-page">
        <div className="progress-page-header">
          <h1 className="progress-page-title">
            <span className="progress-page-icon">🌐</span>
            번역 처리
          </h1>
          <p className="progress-page-subtitle">
            클라이언트 사이드 LLM 번역을 실행합니다.
          </p>
        </div>
        <div className="progress-cards">
          {/* 입력 폼 */}
          <section className="progress-card">
            <h2 className="progress-card-title">번역 설정</h2>

            {/* 프롬프트 선택 */}
            <div className="form-group">
              <label className="form-label">프롬프트 선택</label>
              <Autocomplete
                options={promptList}
                getOptionLabel={(option) => option.name || ''}
                value={selectedPrompt}
                onChange={handlePromptSelect}
                loading={promptListLoading}
                isOptionEqualToValue={(option, value) => option.id === value?.id}
                renderOption={(props, option) => {
                  const { key, ...restProps } = props;
                  return (
                    <li key={key} {...restProps} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                      <div style={{ fontWeight: 500 }}>{option.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {option.description || '설명 없음'}
                      </div>
                      {option.tags && option.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {option.tags.map((tag, idx) => {
                            const colors = TAG_COLORS[idx % TAG_COLORS.length];
                            return (
                              <Chip
                                key={tag.id}
                                label={tag.name}
                                size="small"
                                sx={{
                                  backgroundColor: colors.bg,
                                  color: colors.color,
                                  fontSize: '10px',
                                  height: '18px',
                                }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="프롬프트를 선택하세요 (선택 시 설정 자동 반영)"
                    size="small"
                    slotProps={{
                      input: {
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {promptListLoading || promptDetailLoading ? (
                              <CircularProgress color="inherit" size={20} />
                            ) : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      },
                    }}
                  />
                )}
                sx={{ width: '100%' }}
              />
              {selectedPrompt && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  선택된 프롬프트: <strong>{selectedPrompt.name}</strong>
                  {selectedPrompt.model && ` | 모델: ${selectedPrompt.model}`}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="fileId">파일 ID (필수)</label>
              <input
                type="text"
                id="fileId"
                value={formFileId}
                onChange={(e) => setFormFileId(e.target.value)}
                placeholder="예: abc123-def456"
                className="form-input"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="sourceLang">
                  원본 언어 (필수)
                  {isSourceLangFromPrompt && (
                    <span style={{ fontSize: '11px', color: 'var(--primary)', marginLeft: '8px' }}>
                      (프롬프트에서 설정됨)
                    </span>
                  )}
                </label>
                <select
                  id="sourceLang"
                  value={formSourceLang}
                  onChange={(e) => setFormSourceLang(e.target.value)}
                  className="form-select"
                  disabled={isSourceLangFromPrompt}
                >
                  {languageOptions.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lang">
                  번역 대상 언어 (필수)
                  {isTargetLangFromPrompt && (
                    <span style={{ fontSize: '11px', color: 'var(--primary)', marginLeft: '8px' }}>
                      (프롬프트에서 설정됨)
                    </span>
                  )}
                </label>
                <select
                  id="lang"
                  value={formLang}
                  onChange={(e) => setFormLang(e.target.value)}
                  className="form-select"
                  disabled={isTargetLangFromPrompt}
                >
                  {languageOptions.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="model">
                LLM 모델 (선택)
                {selectedPrompt && formModel && (
                  <span style={{ fontSize: '11px', color: 'var(--primary)', marginLeft: '8px' }}>
                    (프롬프트에서 설정됨)
                  </span>
                )}
              </label>
              <input
                type="text"
                id="model"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                placeholder="예: gpt-4o-mini (기본값: aiStore 설정)"
                className="form-input"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="chunkSize">청크 크기</label>
                <input
                  type="number"
                  id="chunkSize"
                  value={formChunkSize}
                  onChange={(e) => setFormChunkSize(e.target.value)}
                  min="10"
                  max="200"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="temperature">Temperature</label>
                <input
                  type="number"
                  id="temperature"
                  value={formTemperature}
                  onChange={(e) => setFormTemperature(e.target.value)}
                  min="0"
                  max="2"
                  step="0.1"
                  className="form-input"
                />
              </div>
            </div>

            <div className="progress-step-controls" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="progress-step-btn primary"
                onClick={handleStartTranslation}
                disabled={promptDetailLoading}
              >
                {promptDetailLoading ? '로딩 중...' : '번역 시작'}
              </button>
            </div>
          </section>

          {/* 사용법 안내 */}
          <section className="progress-card">
            <h2 className="progress-card-title">URL 직접 접근</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              다음 형식으로 URL에 직접 접근할 수 있습니다:
            </p>
            <code style={{ 
              display: 'block', 
              padding: '0.75rem', 
              background: 'var(--bg-secondary)', 
              borderRadius: '4px',
              fontSize: '0.875rem',
              wordBreak: 'break-all'
            }}>
              /translates/{'{fileId}'}?lang={'{언어코드}'}&model={'{모델명}'}
            </code>
          </section>
        </div>

        {/* 번역 처리 모달 */}
        <ProcessModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          type="translate"
          fileId={formFileId.trim()}
          translateOptions={{
            sourceLang: formSourceLang,
            lang: formLang,
            model: formModel || undefined,
            chunkSize: formChunkSize ? Number(formChunkSize) : undefined,
            temperature: formTemperature ? Number(formTemperature) : undefined,
            promptId: selectedPrompt?.id || undefined,
          }}
        />

        {/* 확인 모달 */}
        <ConfirmModal />
      </div>
    );
  }

  const totalProgress = getTotalProgress();
  const targetLangName = LANGUAGE_NAMES[lang] || lang;

  return (
    <div className="progress-page">
      <div className="progress-page-header">
        <h1 className="progress-page-title">
          <span className="progress-page-icon">
            {currentStep.id === STEPS.COMPLETED.id
              ? '✅'
              : currentStep.id === STEPS.FAILED.id
                ? '❌'
                : '🌐'}
          </span>
          {currentStep.id === STEPS.COMPLETED.id
            ? '번역 완료'
            : currentStep.id === STEPS.FAILED.id
              ? '번역 실패'
              : '번역 처리 중'}
        </h1>
        <p className="progress-page-subtitle">
          {lang && `대상 언어: ${targetLangName}`}
          {model && ` | 모델: ${model}`}
        </p>
      </div>

      <div className="progress-cards">
        {/* 단계별 진행 */}
        <section className="progress-card">
          <h2 className="progress-card-title">처리 단계</h2>
          <div className="progress-steps">
            {TRANSLATE_STEP_LIST.map((step, index) => {
              const isActive = currentStep.id === step.id;
              const isDone =
                currentStep.id > step.id ||
                (currentStep.id === STEPS.COMPLETED.id &&
                  step.id === STEPS.COMPLETED.id);
              const isFailed = currentStep.id === STEPS.FAILED.id;
              const isLast = index === TRANSLATE_STEP_LIST.length - 1;

              return (
                <div key={step.id} className="progress-step-item">
                  <div className="progress-step-content">
                    <div
                      className={`progress-step-dot ${isDone ? 'done' : ''} ${isActive ? 'current' : ''} ${isFailed && isActive ? 'failed' : ''}`}
                    >
                      {isDone ? '✓' : isFailed && index === 0 ? '!' : index + 1}
                    </div>
                    <span
                      className={`progress-step-label ${isActive ? 'current' : ''}`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className={`progress-step-connector ${isDone ? 'done' : ''}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 진행률 */}
        <section className="progress-card">
          <h2 className="progress-card-title">전체 진행률</h2>
          <div className="progress-linear-wrap">
            <div
              className={`progress-linear-bar ${currentStep.id === STEPS.FAILED.id ? 'failed' : ''}`}
              style={{
                width: `${totalProgress}%`,
              }}
            />
          </div>
          <div className="progress-linear-meta">
            <span className="progress-percent">
              {Math.round(totalProgress)}%
            </span>
            {currentStep.id === STEPS.TRANSLATING.id && totalChunks > 0 && (
              <span className="progress-detail">
                청크: {completedChunks}/{totalChunks}
                {failedChunks.length > 0 && ` (실패: ${failedChunks.length})`}
              </span>
            )}
            {currentStep.id > 0 &&
              currentStep.id < STEPS.COMPLETED.id &&
              currentStep.id !== STEPS.TRANSLATING.id && (
                <span className="progress-detail">
                  {currentStep.label}: {Math.round(detailProgress)}%
                </span>
              )}
          </div>
        </section>

        {/* 에러 표시 */}
        {error && (
          <section className="progress-card progress-card-error">
            <h2 className="progress-card-title">오류 발생</h2>
            <p className="progress-error-text">{error}</p>
            <div className="progress-step-controls">
              <button
                type="button"
                className="progress-step-btn"
                onClick={() => navigate(-1)}
              >
                돌아가기
              </button>
              <button
                type="button"
                className="progress-step-btn primary"
                onClick={handleRetry}
              >
                다시 시도
              </button>
            </div>
          </section>
        )}

        {/* 완료 메시지 */}
        {currentStep.id === STEPS.COMPLETED.id && (
          <section className="progress-card progress-card-success">
            <h2 className="progress-card-title">번역 완료</h2>
            <p className="progress-success-text">
              번역이 완료되었습니다. 잠시 후 작업 페이지로 이동합니다.
            </p>
          </section>
        )}

        {/* 취소 버튼 (진행 중일 때만) */}
        {isProcessing() && !error && (
          <section className="progress-card">
            <button
              type="button"
              className="progress-cancel-btn"
              onClick={handleCancel}
            >
              작업 취소
            </button>
          </section>
        )}
      </div>

      {/* 확인 모달 */}
      <ConfirmModal />
    </div>
  );
}
