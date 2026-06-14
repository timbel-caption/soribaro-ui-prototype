import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { secondsToTimeCode } from '../../../utils/timeUtils';
import { useSettingsStore } from '../../../stores/settingsStore';
import './GapFillModal.css';

export default function GapFillModal({ isOpen, onClose, subtitles, onApply }) {
  const { t } = useTranslation('worktool');

  const subtitleEditor = useSettingsStore((state) => state.subtitleEditor);
  const updateSubtitleEditor = useSettingsStore((state) => state.updateSubtitleEditor);

  const detectGapMs = subtitleEditor?.gapFillDetectMs ?? 400;
  const fillGapMs = subtitleEditor?.gapFillTargetMs ?? 0;

  const [detectedGaps, setDetectedGaps] = useState([]);
  const [isDetected, setIsDetected] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (isOpen) {
      setDetectedGaps([]);
      setIsDetected(false);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const handleDetectGapChange = useCallback((value) => {
    const ms = parseInt(value, 10);
    if (Number.isFinite(ms) && ms > 0) {
      updateSubtitleEditor({ gapFillDetectMs: ms });
    }
  }, [updateSubtitleEditor]);

  const handleFillGapChange = useCallback((value) => {
    const ms = parseInt(value, 10);
    if (Number.isFinite(ms) && ms >= 0) {
      updateSubtitleEditor({ gapFillTargetMs: ms });
    }
  }, [updateSubtitleEditor]);

  const handleDetect = useCallback(() => {
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapMs = Math.round((sorted[i + 1].startTime - sorted[i].endTime) * 1000);
      if (gapMs > 0 && gapMs < detectGapMs) {
        gaps.push({
          subtitle: sorted[i],
          nextSubtitle: sorted[i + 1],
          gapMs,
        });
      }
    }
    setDetectedGaps(gaps);
    setIsDetected(true);
    setSelectedIds(new Set());
  }, [subtitles, detectGapMs]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isAllSelected = useMemo(
    () => detectedGaps.length > 0 && selectedIds.size === detectedGaps.length,
    [detectedGaps, selectedIds],
  );

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(detectedGaps.map((g) => g.subtitle.id)));
    }
  }, [isAllSelected, detectedGaps]);

  const buildAdjustments = useCallback((gaps) => {
    return gaps.map((gap) => ({
      subtitleId: gap.subtitle.id,
      newEndTime: gap.nextSubtitle.startTime - fillGapMs / 1000,
    }));
  }, [fillGapMs]);

  const handleApplyAll = useCallback(() => {
    onApply(buildAdjustments(detectedGaps));
    onClose();
  }, [detectedGaps, buildAdjustments, onApply, onClose]);

  const handleApplySelected = useCallback(() => {
    const selected = detectedGaps.filter((g) => selectedIds.has(g.subtitle.id));
    if (selected.length === 0) return;
    onApply(buildAdjustments(selected));
    onClose();
  }, [detectedGaps, selectedIds, buildAdjustments, onApply, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div className="gap-fill-modal-overlay">
      <div className="gap-fill-modal">
        <div className="gap-fill-modal-header">
          <h3>{t('subtitle.gapFillModal.title')}</h3>
          <button className="gap-fill-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="gap-fill-modal-body">
          <div className="gap-fill-settings">
            <div className="gap-fill-setting-row">
              <label>{t('subtitle.gapFillModal.detectGap')}</label>
              <div className="gap-fill-input-group">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={detectGapMs}
                  onChange={(e) => handleDetectGapChange(e.target.value)}
                />
                <span className="gap-fill-unit">ms</span>
              </div>
            </div>
            <div className="gap-fill-setting-row">
              <label>{t('subtitle.gapFillModal.fillGap')}</label>
              <div className="gap-fill-input-group">
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={fillGapMs}
                  onChange={(e) => handleFillGapChange(e.target.value)}
                />
                <span className="gap-fill-unit">ms</span>
              </div>
            </div>
            <button className="gap-fill-detect-btn" onClick={handleDetect}>
              {t('subtitle.gapFillModal.detect')}
            </button>
          </div>

          {isDetected && (
            <div className="gap-fill-results">
              <div className="gap-fill-results-header">
                {detectedGaps.length > 0
                  ? t('subtitle.gapFillModal.detected', { count: detectedGaps.length })
                  : t('subtitle.gapFillModal.noGaps')}
              </div>
              {detectedGaps.length > 0 && (
                <div className="gap-fill-table-wrapper">
                  <table className="gap-fill-table">
                    <thead>
                      <tr>
                        <th className="gap-fill-checkbox-col">
                          <input
                            type="checkbox"
                            className="gap-fill-checkbox"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            title={t('subtitle.gapFillModal.selectAll')}
                          />
                        </th>
                        <th>#</th>
                        <th>{t('subtitle.gapFillModal.colText')}</th>
                        <th>{t('subtitle.gapFillModal.colEndTime')}</th>
                        <th>{t('subtitle.gapFillModal.colCurrentGap')}</th>
                        <th>{t('subtitle.gapFillModal.colAfterGap')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detectedGaps.map((gap, idx) => {
                        const isSelected = selectedIds.has(gap.subtitle.id);
                        return (
                          <tr
                            key={gap.subtitle.id}
                            className={isSelected ? 'selected' : ''}
                            onClick={() => toggleSelect(gap.subtitle.id)}
                          >
                            <td className="gap-fill-checkbox-col">
                              <input
                                type="checkbox"
                                className="gap-fill-checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(gap.subtitle.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td>{idx + 1}</td>
                            <td className="gap-fill-text-cell" title={gap.subtitle.text}>
                              {gap.subtitle.text?.substring(0, 30) || '-'}
                              {gap.subtitle.text?.length > 30 ? '...' : ''}
                            </td>
                            <td>{secondsToTimeCode(gap.subtitle.endTime)}</td>
                            <td>{gap.gapMs}ms</td>
                            <td>{fillGapMs}ms</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="gap-fill-modal-footer">
          <button className="gap-fill-btn-cancel" onClick={onClose}>
            {t('subtitle.gapFillModal.cancel')}
          </button>
          <button
            className="gap-fill-btn-apply-selected"
            onClick={handleApplySelected}
            disabled={selectedIds.size === 0}
          >
            {t('subtitle.gapFillModal.applySelected', { count: selectedIds.size })}
          </button>
          <button
            className="gap-fill-btn-apply"
            onClick={handleApplyAll}
            disabled={detectedGaps.length === 0}
          >
            {t('subtitle.gapFillModal.applyAll')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
