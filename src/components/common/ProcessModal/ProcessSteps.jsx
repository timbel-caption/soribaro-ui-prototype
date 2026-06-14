/**
 * 처리 단계 표시 컴포넌트
 * 작업 진행 단계를 시각적으로 표시합니다.
 */

/**
 * ProcessSteps Props
 * @typedef {Object} ProcessStepsProps
 * @property {Array} steps - 단계 목록
 * @property {Object} currentStep - 현재 단계
 * @property {number} completedStepId - 완료 단계 ID
 * @property {number} failedStepId - 실패 단계 ID
 */

/**
 * @param {ProcessStepsProps} props
 */
export default function ProcessSteps({
  steps,
  currentStep,
  completedStepId,
  failedStepId,
}) {
  return (
    <div className="process-steps">
      {steps.map((step, index) => {
        const isActive = currentStep.id === step.id;
        const isDone = currentStep.id > step.id || 
          (currentStep.id === completedStepId && step.id === completedStepId);
        const isFailed = currentStep.id === failedStepId;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="process-step-item">
            <div className="process-step-content">
              <div
                className={`process-step-dot ${isDone ? 'done' : ''} ${isActive ? 'current' : ''} ${isFailed && isActive ? 'failed' : ''}`}
              >
                {isDone ? '✓' : isFailed && index === 0 ? '!' : index + 1}
              </div>
              <span className={`process-step-label ${isActive ? 'current' : ''}`}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`process-step-connector ${isDone ? 'done' : ''}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
