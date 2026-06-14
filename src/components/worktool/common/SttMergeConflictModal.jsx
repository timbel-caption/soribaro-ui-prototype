import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { applyResolutions } from '../../../utils/sttMergeUtils';
import { secondsToTimeCode, timeCodeToSeconds } from '../../../utils/timeUtils';
import './SttMergeConflictModal.css';

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(1);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(4, '0')}`;
  return `${m}:${String(s).padStart(4, '0')}`;
}

/**
 * A의 뒷부분과 B의 앞부분에서 가장 긴 공통 부분을 찾아 합집합 텍스트 생성
 * 예: A="안녕 반갑습니다 오늘", B="반갑습니다 오늘 날씨가" → "안녕 반갑습니다 오늘 날씨가"
 */
function computeUnionText(textA, textB) {
  if (!textA) return textB || '';
  if (!textB) return textA || '';

  const wordsA = textA.split(/\s+/);
  const wordsB = textB.split(/\s+/);

  const normalize = (s) => s.toLowerCase().replace(/[.,!?;:'"()\-—…·。、]+/g, '');

  let bestOverlap = 0;
  const maxCheck = Math.min(wordsA.length, wordsB.length);
  for (let len = 1; len <= maxCheck; len++) {
    const tailA = normalize(wordsA.slice(-len).join(' '));
    const headB = normalize(wordsB.slice(0, len).join(' '));
    if (tailA === headB) {
      bestOverlap = len;
    }
  }

  if (bestOverlap > 0) {
    return [...wordsA, ...wordsB.slice(bestOverlap)].join(' ');
  }

  return `${textA} ${textB}`;
}

const RESOLUTION_OPTIONS = ['keepA', 'keepB', 'merge', 'keepBoth'];

// 타임코드 raw text → 초. 유효하지 않으면 undefined.
function parseTimeOrUndefined(raw) {
  const sec = timeCodeToSeconds(raw);
  return Number.isFinite(sec) ? sec : undefined;
}

/**
 * STT 분할 결과 / 분할파일 병합검수 겹침 해결 모달
 * - keepA / keepB: 한 쪽 유지
 * - merge: B를 A로 흡수. 텍스트 + 시작/종료 시각 편집 가능
 * - keepBoth: 둘 다 유지. A, B 각각 텍스트 + 시각 자유 편집 (겹침이 남으면 다음 라운드에서 재검출)
 */
export default function SttMergeConflictModal({
  isOpen,
  subtitles = [],
  overlaps = [],
  onResolve,
  onClose,
}) {
  const { t } = useTranslation('worktool');

  const initialMergedTexts = useMemo(() =>
    overlaps.map((overlap) => computeUnionText(
      subtitles[overlap.indexA]?.text,
      subtitles[overlap.indexB]?.text,
    )),
  [overlaps, subtitles]);

  const [resolutions, setResolutions] = useState(() =>
    overlaps.map((overlap, i) => {
      const subA = subtitles[overlap.indexA];
      const subB = subtitles[overlap.indexB];
      const mergeStart = subA?.startTime ?? 0;
      const mergeEnd = Math.max(subA?.endTime ?? 0, subB?.endTime ?? 0);
      return {
        resolution: 'keepA',
        // merge 편집 상태 (raw timecode 문자열)
        mergedText: initialMergedTexts[i] || '',
        mergedStart: secondsToTimeCode(mergeStart),
        mergedEnd: secondsToTimeCode(mergeEnd),
        // keepBoth 편집 상태
        aText: subA?.text ?? '',
        aStart: secondsToTimeCode(subA?.startTime ?? 0),
        aEnd: secondsToTimeCode(subA?.endTime ?? 0),
        bText: subB?.text ?? '',
        bStart: secondsToTimeCode(subB?.startTime ?? 0),
        bEnd: secondsToTimeCode(subB?.endTime ?? 0),
      };
    })
  );

  const updateField = useCallback((index, patch) => {
    setResolutions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const handleAutoResolve = useCallback(() => {
    const fullResolutions = overlaps.map((overlap) => ({
      ...overlap,
      resolution: 'keepA',
    }));
    const resolved = applyResolutions(subtitles, fullResolutions);
    onResolve?.(resolved);
  }, [subtitles, overlaps, onResolve]);

  const handleApply = useCallback(() => {
    const fullResolutions = overlaps.map((overlap, i) => {
      const r = resolutions[i] || {};
      const base = { ...overlap, resolution: r.resolution || 'keepA' };
      if (r.resolution === 'merge') {
        return {
          ...base,
          mergedText: r.mergedText,
          mergedStart: parseTimeOrUndefined(r.mergedStart),
          mergedEnd: parseTimeOrUndefined(r.mergedEnd),
        };
      }
      if (r.resolution === 'keepBoth') {
        return {
          ...base,
          aText: r.aText,
          aStart: parseTimeOrUndefined(r.aStart),
          aEnd: parseTimeOrUndefined(r.aEnd),
          bText: r.bText,
          bStart: parseTimeOrUndefined(r.bStart),
          bEnd: parseTimeOrUndefined(r.bEnd),
        };
      }
      return base;
    });
    const resolved = applyResolutions(subtitles, fullResolutions);
    onResolve?.(resolved);
  }, [overlaps, resolutions, subtitles, onResolve]);

  const handleSkip = useCallback(() => {
    onResolve?.(subtitles);
  }, [subtitles, onResolve]);

  if (!isOpen) return null;

  if (overlaps.length === 0) {
    return (
      <div className="stt-merge-modal-overlay">
        <div className="stt-merge-modal">
          <div className="stt-merge-modal__header">
            <h2>{t('sttMerge.title')}</h2>
            <button className="stt-merge-modal__close" onClick={onClose}>✕</button>
          </div>
          <div className="stt-merge-modal__body">
            <p className="stt-merge-modal__no-overlap">{t('sttMerge.noOverlap')}</p>
          </div>
          <div className="stt-merge-modal__footer">
            <button className="stt-merge-modal__btn stt-merge-modal__btn--primary" onClick={handleSkip}>
              {t('sttMerge.apply')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderTimeRow = (startVal, endVal, onStartChange, onEndChange, accentClass = '') => (
    <div className="stt-merge-modal__time-row">
      <label className={`stt-merge-modal__time-field ${accentClass}`}>
        <span className="stt-merge-modal__time-field-label">
          {t('sttMerge.startTimeLabel')}
        </span>
        <input
          className="stt-merge-modal__time-input"
          type="text"
          value={startVal}
          onChange={(e) => onStartChange(e.target.value)}
          placeholder="HH:MM:SS.mmm"
          spellCheck={false}
        />
      </label>
      <label className={`stt-merge-modal__time-field ${accentClass}`}>
        <span className="stt-merge-modal__time-field-label">
          {t('sttMerge.endTimeLabel')}
        </span>
        <input
          className="stt-merge-modal__time-input"
          type="text"
          value={endVal}
          onChange={(e) => onEndChange(e.target.value)}
          placeholder="HH:MM:SS.mmm"
          spellCheck={false}
        />
      </label>
    </div>
  );

  return (
    <div className="stt-merge-modal-overlay">
      <div className="stt-merge-modal stt-merge-modal--wide">
        <div className="stt-merge-modal__header">
          <h2>{t('sttMerge.title')}</h2>
          <button className="stt-merge-modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="stt-merge-modal__body">
          <p className="stt-merge-modal__desc">
            {t('sttMerge.overlapDetected', { count: overlaps.length })}
          </p>

          <div className="stt-merge-modal__list">
            {overlaps.map((overlap, i) => {
              const subA = subtitles[overlap.indexA];
              const subB = subtitles[overlap.indexB];
              const r = resolutions[i] || {};
              const selected = r.resolution || 'keepA';

              const isKeepBoth = selected === 'keepBoth';
              const subASelected =
                selected === 'keepA' || selected === 'merge' || isKeepBoth;
              const subBSelected =
                selected === 'keepB' || selected === 'merge' || isKeepBoth;
              const subAClass = subASelected ? 'stt-merge-modal__sub--selected' : '';
              const subBClass = subBSelected ? 'stt-merge-modal__sub--selected' : '';

              return (
                <div key={i} className="stt-merge-modal__item">
                  <div className="stt-merge-modal__item-header">
                    <span className="stt-merge-modal__item-label">
                      {t('sttMerge.conflictLabel', { index: i + 1 })}
                    </span>
                    <span className="stt-merge-modal__item-overlap">
                      {t('sttMerge.overlapDuration', { sec: overlap.overlapSec.toFixed(1) })}
                    </span>
                  </div>

                  <div className="stt-merge-modal__subtitles">
                    {/* A 카드 */}
                    <div
                      className={`stt-merge-modal__sub ${!isKeepBoth ? 'stt-merge-modal__sub--clickable' : ''} ${subAClass}`}
                      onClick={!isKeepBoth ? () => updateField(i, { resolution: 'keepA' }) : undefined}
                    >
                      <div className="stt-merge-modal__sub-label">A</div>
                      {isKeepBoth ? (
                        <>
                          {renderTimeRow(
                            r.aStart,
                            r.aEnd,
                            (v) => updateField(i, { aStart: v }),
                            (v) => updateField(i, { aEnd: v }),
                          )}
                          <textarea
                            className="stt-merge-modal__merge-textarea"
                            value={r.aText ?? ''}
                            onChange={(e) => updateField(i, { aText: e.target.value })}
                            rows={2}
                          />
                        </>
                      ) : (
                        <>
                          <div className="stt-merge-modal__sub-time">
                            {formatTime(subA?.startTime)} ~ {formatTime(subA?.endTime)}
                          </div>
                          <div className="stt-merge-modal__sub-text">{subA?.text}</div>
                        </>
                      )}
                    </div>

                    {/* B 카드 */}
                    <div
                      className={`stt-merge-modal__sub ${!isKeepBoth ? 'stt-merge-modal__sub--clickable' : ''} ${subBClass}`}
                      onClick={!isKeepBoth ? () => updateField(i, { resolution: 'keepB' }) : undefined}
                    >
                      <div className="stt-merge-modal__sub-label">B</div>
                      {isKeepBoth ? (
                        <>
                          {renderTimeRow(
                            r.bStart,
                            r.bEnd,
                            (v) => updateField(i, { bStart: v }),
                            (v) => updateField(i, { bEnd: v }),
                          )}
                          <textarea
                            className="stt-merge-modal__merge-textarea"
                            value={r.bText ?? ''}
                            onChange={(e) => updateField(i, { bText: e.target.value })}
                            rows={2}
                          />
                        </>
                      ) : (
                        <>
                          <div className="stt-merge-modal__sub-time">
                            {formatTime(subB?.startTime)} ~ {formatTime(subB?.endTime)}
                          </div>
                          <div className="stt-merge-modal__sub-text">{subB?.text}</div>
                        </>
                      )}
                    </div>

                    {selected === 'merge' && (
                      <div className="stt-merge-modal__sub stt-merge-modal__sub--merge-preview">
                        <div className="stt-merge-modal__sub-label">
                          {t('sttMerge.mergePreviewLabel')}
                        </div>
                        {renderTimeRow(
                          r.mergedStart,
                          r.mergedEnd,
                          (v) => updateField(i, { mergedStart: v }),
                          (v) => updateField(i, { mergedEnd: v }),
                          'stt-merge-modal__time-field--merge',
                        )}
                        <textarea
                          className="stt-merge-modal__merge-textarea"
                          value={r.mergedText ?? initialMergedTexts[i] ?? ''}
                          onChange={(e) => updateField(i, { mergedText: e.target.value })}
                          rows={3}
                        />
                      </div>
                    )}
                  </div>

                  <div className="stt-merge-modal__options">
                    {RESOLUTION_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        className={`stt-merge-modal__option stt-merge-modal__option--${opt} ${selected === opt ? 'stt-merge-modal__option--active' : ''}`}
                        onClick={() => updateField(i, { resolution: opt })}
                      >
                        {t(`sttMerge.${opt}`)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stt-merge-modal__footer">
          <button
            className="stt-merge-modal__btn stt-merge-modal__btn--secondary"
            onClick={handleAutoResolve}
          >
            {t('sttMerge.autoResolve')}
          </button>
          <button
            className="stt-merge-modal__btn stt-merge-modal__btn--primary"
            onClick={handleApply}
          >
            {t('sttMerge.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
