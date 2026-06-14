/**
 * 처리 진행률 표시 컴포넌트
 * 전체 진행률과 세부 진행 상황을 표시합니다.
 */

import { useTranslation } from 'react-i18next';

/**
 * ProcessProgress Props
 * @typedef {Object} ProcessProgressProps
 * @property {number} totalProgress - 전체 진행률 (0-100)
 * @property {number} detailProgress - 세부 진행률 (0-100)
 * @property {Object} currentStep - 현재 단계
 * @property {number} completedStepId - 완료 단계 ID
 * @property {number} failedStepId - 실패 단계 ID
 * @property {number} [totalChunks] - 전체 청크 수 (번역용)
 * @property {number} [completedChunks] - 완료된 청크 수 (번역용)
 * @property {Array} [failedChunks] - 실패한 청크 목록 (번역용)
 * @property {boolean} [isTranslateMode] - 번역 모드 여부
 */

/**
 * @param {ProcessProgressProps} props
 */
export default function ProcessProgress({
  totalProgress,
  detailProgress,
  currentStep,
  completedStepId,
  failedStepId,
  totalChunks = 0,
  completedChunks = 0,
  failedChunks = [],
  isTranslateMode = false,
  isSplitSttMode = false,
}) {
  const { t } = useTranslation('common');
  const isFailed = currentStep.id === failedStepId;
  const isCompleted = currentStep.id === completedStepId;
  const isProcessing = currentStep.id > 0 && currentStep.id < completedStepId;

  // 번역 모드에서 TRANSLATING 단계인지 확인
  const isTranslatingStep = isTranslateMode && currentStep.id === 3;
  // 분할 STT 모드에서 STT_PROCESSING 단계인지 확인 (id === 4)
  const isSplitSttProcessingStep = isSplitSttMode && currentStep.id === 4;

  return (
    <div className="process-progress">
      <h3 className="process-progress-title">{t('processProgress.overallProgress')}</h3>
      
      {/* 진행률 바 */}
      <div className="process-progress-bar-wrap">
        <div
          className={`process-progress-bar ${isFailed ? 'failed' : ''}`}
          style={{ width: `${totalProgress}%` }}
        />
      </div>
      
      {/* 진행률 메타 정보 */}
      <div className="process-progress-meta">
        <span className="process-progress-percent">
          {Math.round(totalProgress)}%
        </span>
        
        {/* 번역 청크 정보 */}
        {isTranslateMode && isTranslatingStep && totalChunks > 0 && (
          <span className="process-progress-detail">
            {t('processProgress.chunks', { completed: completedChunks, total: totalChunks })}
            {failedChunks.length > 0 && ` ${t('processProgress.chunksFailed', { count: failedChunks.length })}`}
          </span>
        )}

        {/* 분할 STT 청크 정보 */}
        {isSplitSttProcessingStep && totalChunks > 0 && (
          <span className="process-progress-detail">
            {t('processProgress.chunks', { completed: completedChunks, total: totalChunks })}
          </span>
        )}
        
        {/* 일반 세부 진행률 */}
        {isProcessing && !isTranslatingStep && !isSplitSttProcessingStep && (
          <span className="process-progress-detail">
            {t('processProgress.stepProgress', { stepLabel: currentStep.label, percent: Math.round(detailProgress) })}
          </span>
        )}
      </div>
    </div>
  );
}
