/**
 * 연수 전용 채점결과 모달 — 정답 vs 학생 자막 나란히 비교.
 * 메인 AccuracyModal 과 별도(데이터를 관리자 연수 API 로 가져옴)지만,
 * 시각 스타일은 AccuracyModal 과 동일하게 맞춘다(AccuracyModal.css 재사용 + 동일 마크업).
 *   - 정답지: getAnswer(trainingFileId)
 *   - 학생 제출물: getStudentReviewWork(assignmentId, assignmentStudentId)
 * 정확도/오류는 accuracyScore.computeAccuracyComparison 로 라이브 재계산 → 점수와 화면 일치.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getAnswer, getStudentReviewWork } from '../../api/v9/training/assignments';
import { parseSubtitleJson } from '../../utils/subtitleJsonFormat';
import { computeAccuracyComparison } from '../../utils/accuracyScore';
import { accuracyColor } from './ScoreTable';
import { secondsToTimeCode } from '../../utils/timeUtils';
// AccuracyModal 과 동일한 스타일 재사용
import '../worktool/subtitle/AccuracyModal.css';

function decodeSubtitle(subtitleStr) {
  if (!subtitleStr) return [];
  try {
    const parsed = parseSubtitleJson(subtitleStr);
    const list = parsed?.subtitles || parsed?.data || parsed;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// AccuracyModal.formatCueTime 과 동일 규칙 — 시작/종료 타임코드 2줄 표기.
function formatCueTime(sub, side) {
  if (!sub) return '';
  const fmt = (val) => {
    if (val == null) return '';
    return typeof val === 'string' ? val : secondsToTimeCode(val);
  };
  const startPrimary = side === 'orig' ? sub.start : sub.startTime;
  const startFallback = side === 'orig' ? sub.startTime : sub.start;
  const endPrimary = side === 'orig' ? sub.end : sub.endTime;
  const endFallback = side === 'orig' ? sub.endTime : sub.end;
  const start = fmt(startPrimary != null ? startPrimary : startFallback);
  const end = fmt(endPrimary != null ? endPrimary : endFallback);
  if (!start && !end) return '';
  if (!end) return start;
  if (!start) return `- ${end}`;
  return `${start}\n- ${end}`;
}

export default function TrainingAccuracyModal({ assignmentId, evaluation, onClose }) {
  // accuracy.* 라벨은 worktool 네임스페이스(AccuracyModal 과 공유), 연수 전용 라벨은 common.
  const { t } = useTranslation(['worktool', 'common']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answerSubs, setAnswerSubs] = useState([]);
  const [studentSubs, setStudentSubs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [ansRes, workRes] = await Promise.all([
          getAnswer(evaluation.trainingFileId),
          getStudentReviewWork(assignmentId, evaluation.assignmentStudentId),
        ]);
        if (cancelled) return;
        // 응답 shape: { data: { subtitle: '...' } } 또는 { subtitle: '...' }
        setAnswerSubs(decodeSubtitle((ansRes?.data ?? ansRes)?.subtitle));
        setStudentSubs(decodeSubtitle((workRes?.data ?? workRes)?.subtitle));
      } catch (err) {
        if (!cancelled) setError(err?.message || t('training.score.loadFailed', { ns: 'common' }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId, evaluation.trainingFileId, evaluation.assignmentStudentId, t]);

  // ESC 로 닫기 (AccuracyModal 동작과 통일)
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const result = useMemo(() => {
    if (!answerSubs.length && !studentSubs.length) return null;
    return computeAccuracyComparison({ originalSubtitles: answerSubs, currentSubtitles: studentSubs });
  }, [answerSubs, studentSubs]);

  const accuracy = result?.overallAccuracy ?? 0;
  const c = result?.errorCounts || {};
  const errorCount = (c.typo || 0) + (c.omission || 0) + (c.addition || 0);
  const formErrorCount = (c.space || 0) + (c.punc || 0);

  const renderCell = (sub, idx, side, hasErr) => {
    if (!sub) return <div className="accuracy-cell-placeholder" />;
    const text = (sub.text || '').trim();
    return (
      <div className={`accuracy-line-item ${hasErr ? 'changed' : ''}`}>
        <span className="accuracy-line-num">{idx + 1}</span>
        <span className="accuracy-line-time">{formatCueTime(sub, side)}</span>
        <span className="accuracy-line-text">
          {text ? text : <span className="accuracy-empty-text">{t('accuracy.emptyText')}</span>}
        </span>
      </div>
    );
  };

  return createPortal(
    <div className="accuracy-modal-overlay" onClick={onClose}>
      <div className="accuracy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="accuracy-modal-header">
          <h3>{t('accuracy.title')} — {evaluation.studentName || evaluation.studentMembId}</h3>
          <button onClick={onClose} className="accuracy-close-btn">✕</button>
        </div>

        {loading && (
          <div className="accuracy-loading">
            <span className="accuracy-spinner"></span>
            <span>{t('accuracy.loading')}</span>
          </div>
        )}

        {error && !loading && (
          <div className="accuracy-error">
            <span className="accuracy-error-icon">!</span>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && result && (
          <>
            <div className="accuracy-summary">
              <div className="accuracy-progress-section">
                <span className="accuracy-progress-label">{t('accuracy.overallAccuracy')}</span>
                <div className="accuracy-progress-bar">
                  <div
                    className="accuracy-progress-fill"
                    style={{ width: `${accuracy}%`, background: accuracyColor(accuracy) }}
                  />
                </div>
                <span className="accuracy-badge" style={{ '--badge-color': accuracyColor(accuracy) }}>
                  {Number(accuracy).toFixed(2)}%
                </span>
              </div>
              <div className="accuracy-properties">
                <div className="accuracy-property">
                  <span className="accuracy-prop-label">{t('accuracy.origWords', { count: result.origWordCount })}</span>
                </div>
                <span className="accuracy-prop-dot" />
                <div className="accuracy-property">
                  <span className="accuracy-prop-label">{t('accuracy.currWords', { count: result.currWordCount })}</span>
                </div>
                <span className="accuracy-prop-dot" />
                <div className="accuracy-property">
                  <span className="accuracy-prop-label">{t('accuracy.errorCount', { count: errorCount })}</span>
                </div>
                <span className="accuracy-prop-dot" />
                <div className="accuracy-property accuracy-form-error">
                  <span className="accuracy-prop-label">{t('accuracy.formErrorCountLabel')}</span>
                  <span className="accuracy-prop-label">{formErrorCount}{t('accuracy.formErrorCountUnit')}</span>
                </div>
              </div>
              <div className="accuracy-error-types">
                <span className="accuracy-error-type err-typo">{t('accuracy.errorTypes.typo')} {c.typo || 0}</span>
                <span className="accuracy-error-type err-space">{t('accuracy.errorTypes.space')} {c.space || 0}</span>
                <span className="accuracy-error-type err-punc">{t('accuracy.errorTypes.punc')} {c.punc || 0}</span>
                <span className="accuracy-error-type err-omission">{t('accuracy.errorTypes.omission')} {c.omission || 0}</span>
                <span className="accuracy-error-type err-addition">{t('accuracy.errorTypes.addition')} {c.addition || 0}</span>
              </div>
            </div>

            <div className="accuracy-column-headers">
              <div className="accuracy-col-header">{t('training.score.answer', { ns: 'common' })}</div>
              <div className="accuracy-col-header">{t('training.score.student', { ns: 'common' })}</div>
            </div>

            <div className="accuracy-aligned-content">
              {(result.alignedRows || []).map((row, rIdx) => {
                const orig = row.origIdx != null ? result.sortedOrig?.[row.origIdx] : null;
                const curr = row.currIdx != null ? result.sortedCurr?.[row.currIdx] : null;
                const rowKindClass =
                  row.kind === 'equal'
                    ? (row.modified ? 'kind-modified' : 'kind-equal')
                    : `kind-${row.kind}`;
                const hasOrigErr = row.kind === 'delete' || row.kind === 'replace';
                const hasCurrErr = row.kind === 'insert' || row.kind === 'replace';
                return (
                  <div
                    key={`${row.origIdx ?? 'x'}-${row.currIdx ?? 'x'}-${rIdx}`}
                    className={`accuracy-aligned-row ${rowKindClass}`}
                    data-row-idx={rIdx}
                  >
                    <div className="accuracy-aligned-cells">
                      <div className="accuracy-aligned-cell left">
                        {renderCell(orig, row.origIdx, 'orig', hasOrigErr)}
                      </div>
                      <div className="accuracy-aligned-cell right">
                        {renderCell(curr, row.currIdx, 'curr', hasCurrErr)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && !error && !result && (
          <div className="accuracy-empty">
            <span className="accuracy-empty-icon">—</span>
            <p>{t('accuracy.noData')}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
