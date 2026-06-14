/**
 * 처리 모달 컴포넌트
 * STT/번역 처리를 통합하여 어떤 화면에서든 실행 가능하게 합니다.
 */
import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSttJobStore, STEPS as STT_STEPS } from '../../../stores/sttJobStore';
import { useTranslateJobStore, STEPS as TRANSLATE_STEPS } from '../../../stores/translateJobStore';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import { executeSttJob, executeSplitSttJob, cancelSttJob } from '../../../services/sttJobService';
import { executeTranslateJob, cancelTranslateJob } from '../../../services/translateJobService';
import ProcessSteps from './ProcessSteps';
import ProcessProgress from './ProcessProgress';
import { useTranslation } from 'react-i18next';
import './ProcessModal.css';

/**
 * STT 작업 단계 목록 (단일 모드)
 */
const STT_STEP_LIST = [
  STT_STEPS.DOWNLOADING,
  STT_STEPS.CONVERTING,
  STT_STEPS.STT_PROCESSING,
  STT_STEPS.SAVING,
  STT_STEPS.COMPLETED,
];

/**
 * STT 작업 단계 목록 (분할 모드)
 */
const STT_SPLIT_STEP_LIST = [
  STT_STEPS.DOWNLOADING,
  STT_STEPS.CONVERTING,
  STT_STEPS.SPLITTING,
  STT_STEPS.STT_PROCESSING,
  STT_STEPS.MERGING,
  STT_STEPS.COMPLETED,
];

/**
 * 번역 작업 단계 목록
 */
const TRANSLATE_STEP_LIST = [
  TRANSLATE_STEPS.LOADING,
  TRANSLATE_STEPS.SPLITTING,
  TRANSLATE_STEPS.TRANSLATING,
  TRANSLATE_STEPS.SAVING,
  TRANSLATE_STEPS.COMPLETED,
];

/**
 * FFmpeg.wasm 지원 확인
 */
function checkFFmpegSupport() {
  return typeof SharedArrayBuffer !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/**
 * ProcessModal Props
 * @typedef {Object} ProcessModalProps
 * @property {boolean} isOpen - 모달 열림 상태
 * @property {() => void} onClose - 모달 닫기 콜백
 * @property {'stt' | 'translate'} type - 처리 타입
 * @property {string} [fileId] - 파일 ID (testMode가 아닐 때, sttOptions.fileId/mediaUrl이 없을 때 필수)
 * @property {Object} [sttOptions] - STT 옵션
 * @property {string} [sttOptions.fileId] - MinIO 파일 ID (fileId prop 대체 가능)
 * @property {string} [sttOptions.mediaUrl] - 로컬 파일 ObjectURL (fileId 없을 때 사용)
 * @property {Object} [translateOptions] - 번역 옵션
 * @property {boolean} [translateOptions.testMode] - 테스트 모드 여부 (DB 저장 안함)
 * @property {boolean} [translateOptions.isPromptTest] - 프롬프트 테스트 모드 여부 (UI 표시용)
 * @property {string} [translateOptions.inlineSubtitleData] - 테스트용 자막 텍스트 (testMode일 때 필수)
 * @property {string} [translateOptions.customPrompt] - 시스템 프롬프트 텍스트 (testMode일 때 필수)
 * @property {(result: any) => void} [onComplete] - 완료 콜백
 * @property {(error: Error) => void} [onError] - 에러 콜백
 * @property {string} [redirectOnComplete] - 완료 후 이동 경로 (testMode/skipRedirect에서는 무시됨)
 * @property {boolean} [skipRedirect] - true면 완료 후 라우팅 스킵 (onComplete만 호출)
 */

/**
 * @param {ProcessModalProps} props
 */
export default function ProcessModal({
  isOpen,
  onClose,
  type,
  fileId,
  sttOptions = {},
  translateOptions = {},
  onComplete,
  onError,
  redirectOnComplete,
  skipRedirect = false,
}) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  // STT Store
  const sttStore = useSttJobStore();
  const {
    currentStep: sttCurrentStep,
    detailProgress: sttDetailProgress,
    error: sttError,
    fileName: sttFileName,
    reset: sttReset,
    getTotalProgress: getSttTotalProgress,
    isProcessing: isSttProcessing,
    isSplitMode: sttIsSplitMode,
    totalChunks: sttTotalChunks,
    completedChunks: sttCompletedChunks,
  } = sttStore;

  // Translate Store
  const translateStore = useTranslateJobStore();
  const {
    currentStep: translateCurrentStep,
    detailProgress: translateDetailProgress,
    error: translateError,
    totalChunks,
    completedChunks,
    failedChunks,
    reset: translateReset,
    getTotalProgress: getTranslateTotalProgress,
    isProcessing: isTranslateProcessing,
  } = translateStore;

  // 서버/로컬 모드 확인 (API Key 소스 결정)
  const isServerMode = useSubtitleStore((state) => state.isServerMode);

  // 타입에 따른 상태 선택
  const isSttMode = type === 'stt';
  const isSplitSttMode = isSttMode && (sttOptions.enableSplit || sttIsSplitMode);
  const currentStep = isSttMode ? sttCurrentStep : translateCurrentStep;
  const detailProgress = isSttMode ? sttDetailProgress : translateDetailProgress;
  const error = isSttMode ? sttError : translateError;
  const STEPS = isSttMode ? STT_STEPS : TRANSLATE_STEPS;
  const STEP_LIST = isSttMode
    ? (isSplitSttMode ? STT_SPLIT_STEP_LIST : STT_STEP_LIST)
    : TRANSLATE_STEP_LIST;
  const getTotalProgress = isSttMode ? getSttTotalProgress : getTranslateTotalProgress;
  const isProcessing = isSttMode ? isSttProcessing : isTranslateProcessing;
  const reset = isSttMode ? sttReset : translateReset;

  // 브라우저 지원 확인 (STT only)
  const isSupported = isSttMode ? checkFFmpegSupport() : true;

  // 모달이 닫힐 때 store 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  // 탭 종료 방지
  useEffect(() => {
    if (!isOpen) return;

    const handleBeforeUnload = (e) => {
      if (isProcessing()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, isProcessing]);

  // 테스트 모드 여부 (DB 저장 안함)
  const isTestMode = !isSttMode && translateOptions.testMode;
  // 프롬프트 테스트 모드 여부 (UI 표시용)
  const isPromptTest = !isSttMode && translateOptions.isPromptTest;

  // STT 모드에서 mode 확인 (legacy 모드 여부)
  const isLegacyMode = isSttMode && sttOptions.mode === 'legacy';
  
  // STT 모드에서 사용할 fileId 결정 (legacy 모드일 때만 사용)
  const effectiveFileId = isSttMode 
    ? (isLegacyMode ? (sttOptions.fileId || fileId) : undefined)
    : fileId;
  
  // STT 모드에서 mediaUrl 확인 (legacy가 아닐 때 사용)
  const hasMediaUrl = isSttMode && !isLegacyMode && sttOptions.mediaUrl;

  // 작업 실행
  useEffect(() => {
    if (!isOpen) return;
    
    // STT 모드: legacy면 fileId 필요, 아니면 mediaUrl 필요
    // 번역 모드: testMode가 아닐 때 fileId 필수
    if (isSttMode && isLegacyMode && !effectiveFileId) return;
    if (isSttMode && !isLegacyMode && !hasMediaUrl) return;
    if (!isSttMode && !isTestMode && !fileId) return;
    if (isSttMode && !isSupported) return;

    // 이미 처리 중이면 무시
    if (isProcessing()) return;

    // 디버깅 로그 (작업 시작 시 한 번만 출력)
    if (isSttMode) {
      console.log('[ProcessModal] STT 작업 시작 - 분기 확인:');
      console.log('  - sttOptions.mode:', sttOptions.mode);
      console.log('  - isLegacyMode:', isLegacyMode);
      console.log('  - effectiveFileId:', effectiveFileId);
      console.log('  - hasMediaUrl:', hasMediaUrl);
    }

    reset();

    const executeJob = async () => {
      try {
        let result;
        
        if (isSttMode) {
          const {
            language = 'ko-KR',
            bucketType = 'order',
            model,
            maxSegmentLength,
            splitTimeGap,
            mediaUrl,
            mode,
            enableSplit,
            splitSegments,
            overlapSec,
            allowedStartSec,
            allowedEndSec,
          } = sttOptions;

          const baseOpts = {
            mode,
            fileId: effectiveFileId ? Number(effectiveFileId) : undefined,
            mediaUrl,
            language,
            bucketType,
            model,
            maxSegmentLength,
            splitTimeGap,
            isServerMode,
            allowedStartSec,
            allowedEndSec,
          };

          if (enableSplit && splitSegments?.length > 1) {
            result = await executeSplitSttJob({
              ...baseOpts,
              splitSegments,
              concurrency: 5,
              overlapSec,
            });
          } else {
            result = await executeSttJob(baseOpts);
          }
        } else {
          const {
            lang,
            sourceLang,
            model,
            chunkSize,
            concurrency,
            temperature,
            maxTokens,
            topP,
            frequencyPenalty,
            presencePenalty,
            promptId,
            // 테스트 모드 옵션
            testMode,
            inlineSubtitleData,
            customPrompt,
            // V2 파이프라인 옵션
            pipelineMode,
            workInfo,
            useContextSplit,
            splitModel,
            splitReasoningEffort,
          } = translateOptions;

          if (!lang) {
            throw new Error(t('processModal.langRequired'));
          }

          if (!sourceLang) {
            throw new Error(t('processModal.sourceLangRequired'));
          }

          result = await executeTranslateJob(fileId, {
            lang,
            sourceLang,
            model,
            chunkSize,
            concurrency,
            temperature,
            maxTokens,
            topP,
            frequencyPenalty,
            presencePenalty,
            promptId,
            // 테스트 모드 옵션 전달
            testMode,
            inlineSubtitleData,
            customPrompt,
            // 서버/로컬 모드
            isServerMode,
            // V2 파이프라인 옵션 전달
            pipelineMode,
            workInfo,
            useContextSplit,
            splitModel,
            splitReasoningEffort,
          });
        }

        // 완료 콜백
        onComplete?.(result);

        // 테스트 모드 또는 skipRedirect일 때는 redirect 하지 않음
        if (isTestMode || skipRedirect) {
          // 완료 후 잠시 대기 후 모달 닫기
          setTimeout(() => {
            onClose();
          }, 1000);
        } else {
          // 완료 후 이동
          const targetPath = redirectOnComplete || `/worktool/${effectiveFileId || fileId}`;
          setTimeout(() => {
            onClose();
            navigate(targetPath);
          }, 1500);
        }
      } catch (err) {
        console.error(`${isSttMode ? 'STT' : '번역'} 작업 실패:`, err);
        onError?.(err);
      }
    };

    executeJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fileId, effectiveFileId, hasMediaUrl, isLegacyMode, type, isTestMode, skipRedirect]);

  // 취소 핸들러
  const handleCancel = useCallback(() => {
    if (window.confirm(t('processModal.cancelConfirm'))) {
      if (isSttMode) {
        cancelSttJob();
      } else {
        cancelTranslateJob();
      }
      onClose();
    }
  }, [isSttMode, onClose, t]);

  // 재시도 핸들러
  const handleRetry = useCallback(() => {
    reset();
    // 다시 실행하기 위해 모달을 닫았다 열기
    onClose();
    setTimeout(() => {
      // 부모에서 다시 열도록 유도
      window.location.reload();
    }, 100);
  }, [reset, onClose]);

  // ESC 키로 닫기 (처리 중이 아닐 때만)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isProcessing()) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  const totalProgress = getTotalProgress();
  const isCompleted = currentStep.id === STEPS.COMPLETED.id;
  const isFailed = currentStep.id === STEPS.FAILED.id;
  const processing = isProcessing();

  // 타이틀 결정
  const getTitle = () => {
    const modeLabel = isPromptTest ? t('processModal.promptTest') : (isSttMode ? t('processModal.sttProcessing') : t('processModal.translate'));
    if (isCompleted) return t('processModal.titleCompleted', { mode: modeLabel });
    if (isFailed) return t('processModal.titleFailed', { mode: modeLabel });
    return t('processModal.titleInProgress', { mode: modeLabel });
  };

  return (
    <div className="process-modal-overlay">
      <div className="process-modal">
        {/* 헤더 */}
        <div className="process-modal-header">
          <div className="process-modal-title">
            {isFailed && <span className="process-modal-icon">❌</span>}
            {processing && <div className="process-modal-spinner" />}
            <h2>{getTitle()}</h2>
          </div>
          <button
            className="process-modal-close"
            onClick={onClose}
            disabled={processing}
            title={processing ? t('processModal.cannotCloseDuringProcess') : t('processModal.close')}
          >
            ×
          </button>
        </div>

        {/* 파일 정보 */}
        <div className="process-modal-subtitle">
          {isSttMode && sttFileName && t('processModal.fileLabel', { fileName: sttFileName })}
          {isSttMode && !sttFileName && currentStep.id > 0 && t('processModal.processingFile')}
          {!isSttMode && isPromptTest && (
            <span className="test-mode-badge">
              {t('processModal.promptTestBadge', { sourceLang: translateOptions.sourceLang || '?', targetLang: translateOptions.lang || '?' })}
            </span>
          )}
          {!isSttMode && !isPromptTest && t('processModal.langDirection', { sourceLang: translateOptions.sourceLang || '?', targetLang: translateOptions.lang || '?' })}
        </div>

        {/* 브라우저 미지원 (STT only) */}
        {isSttMode && !isSupported && (
          <div className="process-modal-error">
            <p style={{ whiteSpace: 'pre-line' }}>
              {t('processModal.ffmpegNotSupported')}
            </p>
            <button className="process-modal-btn" onClick={onClose}>
              {t('processModal.close')}
            </button>
          </div>
        )}

        {/* 처리 UI */}
        {(isSupported || !isSttMode) && (
          <>
            {/* 단계별 진행 */}
            <ProcessSteps
              steps={STEP_LIST}
              currentStep={currentStep}
              completedStepId={STEPS.COMPLETED.id}
              failedStepId={STEPS.FAILED.id}
            />

            {/* 진행률 */}
            <ProcessProgress
              totalProgress={totalProgress}
              detailProgress={detailProgress}
              currentStep={currentStep}
              completedStepId={STEPS.COMPLETED.id}
              failedStepId={STEPS.FAILED.id}
              totalChunks={isSplitSttMode ? sttTotalChunks : (!isSttMode ? totalChunks : 0)}
              completedChunks={isSplitSttMode ? sttCompletedChunks : (!isSttMode ? completedChunks : 0)}
              failedChunks={!isSttMode ? failedChunks : []}
              isTranslateMode={!isSttMode}
              isSplitSttMode={isSplitSttMode}
            />

            {/* 에러 표시 */}
            {error && (
              <div className="process-modal-error">
                <h3>{t('processModal.errorOccurred')}</h3>
                <p>{error}</p>
                <div className="process-modal-actions">
                  <button className="process-modal-btn" onClick={onClose}>
                    {t('processModal.close')}
                  </button>
                  <button className="process-modal-btn primary" onClick={handleRetry}>
                    {t('processModal.retry')}
                  </button>
                </div>
              </div>
            )}

            {/* 완료 메시지 */}
            {isCompleted && (
              <div className="process-modal-success">
                <p>
                  {isPromptTest ? t('processModal.promptTestCompleted') : (isSttMode ? t('processModal.sttCompleted') : t('processModal.translateCompleted'))}
                  {!isPromptTest && !skipRedirect && (
                    <>
                      <br />
                      {t('processModal.redirectingToWorkPage')}
                    </>
                  )}
                </p>
              </div>
            )}

            {/* 취소 버튼 */}
            {processing && !error && (
              <div className="process-modal-actions">
                <button className="process-modal-btn cancel" onClick={handleCancel}>
                  {t('processModal.cancelJob')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
