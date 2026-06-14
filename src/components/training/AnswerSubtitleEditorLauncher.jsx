/**
 * 정답지 작성 워크툴 진입 버튼 (관리자 전용)
 *
 * 워크툴을 새 창으로 열고 다음 파라미터를 전달:
 *   /worktool?mode=training&role=ANSWER&assignmentId=...&trainingFileId=...&popup=true
 *
 * 워크툴 측은:
 *   - mode=training & role=ANSWER 이면 미디어는 trainingFileId 로 로드 (기존 분기)
 *   - 진입 시 기존 정답지 자막 prefill (TrainingAnswerLoader 또는 SubtitleList 측에서)
 *   - 저장 시 PUT /v9/api/training-files/{trainingFileId}/answer 호출 (파일 단위)
 *   - URL 의 assignmentId 는 backward-compat 으로 유지하나 백엔드는 사용하지 않는다.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export default function AnswerSubtitleEditorLauncher({
  assignmentId,
  trainingFileId,
  hasAnswer = false,
  fileName,
  disabled = false,
}) {
  const { t } = useTranslation('common');

  const handleClick = useCallback(() => {
    if (!assignmentId || !trainingFileId) return;
    const url =
      `/worktool?mode=training&role=ANSWER&popup=true` +
      `&assignmentId=${encodeURIComponent(assignmentId)}` +
      `&trainingFileId=${encodeURIComponent(trainingFileId)}`;
    window.open(
      url,
      `worktool_answer_${assignmentId}_${trainingFileId}`,
      'popup,width=1400,height=900',
    );
  }, [assignmentId, trainingFileId]);

  return (
    <button
      type="button"
      className={`btn-${hasAnswer ? 'ghost' : 'primary'}`}
      onClick={handleClick}
      disabled={disabled || !assignmentId || !trainingFileId}
      title={fileName || ''}
    >
      {hasAnswer ? t('training.answer.edit') : t('training.answer.upload')}
    </button>
  );
}
