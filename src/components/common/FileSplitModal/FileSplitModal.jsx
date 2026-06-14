import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  updateFileSplitSegments,
  cancelFileSplit,
  getFileStreamUrl,
} from "../../../api/v9";
import { toast } from "../Toast";
import SplitWaveformPreview from "../../../pages/soribaro/translation/SplitWaveformPreview";

const formatSec = (sec) => {
  if (sec == null) return "-";
  const totalSec = Math.floor(Number(sec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const hhmmssToSec = (str) => {
  const [h, m, s] = (str || "").split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

const secToHms = (sec) => {
  const totalSec = Math.floor(Number(sec) || 0);
  return {
    h: String(Math.floor(totalSec / 3600)).padStart(2, "0"),
    m: String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0"),
    s: String(totalSec % 60).padStart(2, "0"),
  };
};

const TimeInput = ({ value, onChange, min = 0, max = 86400 }) => {
  const hms = secToHms(value);
  const [local, setLocal] = useState(hms);

  useEffect(() => {
    setLocal(secToHms(value));
  }, [value]);

  const handleLocalChange = (field, raw) => {
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
    setLocal((prev) => ({ ...prev, [field]: cleaned }));
  };

  const commitValue = useCallback(() => {
    const h = Math.min(99, Number(local.h) || 0);
    const m = Math.min(59, Number(local.m) || 0);
    const s = Math.min(59, Number(local.s) || 0);
    const sec = h * 3600 + m * 60 + s;
    const clamped = Math.max(min, Math.min(max, sec));
    onChange(clamped);
    setLocal(secToHms(clamped));
  }, [local, min, max, onChange]);

  const handleFocus = (e) => e.target.select();

  return (
    <div className="split-time-fields">
      <input type="text" inputMode="numeric" maxLength={2} value={local.h}
        onChange={(e) => handleLocalChange("h", e.target.value)}
        onBlur={commitValue} onFocus={handleFocus} className="split-time-unit" />
      <span className="split-time-sep">:</span>
      <input type="text" inputMode="numeric" maxLength={2} value={local.m}
        onChange={(e) => handleLocalChange("m", e.target.value)}
        onBlur={commitValue} onFocus={handleFocus} className="split-time-unit" />
      <span className="split-time-sep">:</span>
      <input type="text" inputMode="numeric" maxLength={2} value={local.s}
        onChange={(e) => handleLocalChange("s", e.target.value)}
        onBlur={commitValue} onFocus={handleFocus} className="split-time-unit" />
    </div>
  );
};

const FileSplitModal = ({ open, file, servCd, onClose, onSaved }) => {
  const { t } = useTranslation("soribaro");
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [segments, setSegments] = useState([]);
  const [saving, setSaving] = useState(false);

  const maxSec = useMemo(() => {
    if (!file?.playTm) return 0;
    return Number(file.playTm) || 0;
  }, [file]);

  const hasTimeSegments =
    file?.splitTp === "1" && file?.timeSegments?.length > 0;

  useEffect(() => {
    if (open && file) {
      setAudioUrl(null);
      const existingSegs = hasTimeSegments
        ? file.timeSegments.map((seg) => ({
            splitSeq: seg.splitSeq,
            startSec: hhmmssToSec(seg.splitTimeSt),
            endSec: hhmmssToSec(seg.splitTimeEd),
          }))
        : [];
      setSegments(existingSegs);
      const lastEnd =
        existingSegs.length > 0
          ? Math.max(...existingSegs.map((s) => s.endSec))
          : 0;
      setStartSec(lastEnd < maxSec ? lastEnd : 0);
      setEndSec(maxSec);
    }
  }, [open, file, maxSec, hasTimeSegments]);

  useEffect(() => {
    if (!open || !file) {
      setAudioUrl(null);
      return;
    }
    let cancelled = false;
    const fetchUrl = async () => {
      try {
        const response = await getFileStreamUrl(file.fileNo);
        const d = response?.data || response;
        if (!cancelled && d?.url) {
          setAudioUrl(d.url);
        }
      } catch {
        if (!cancelled) setAudioUrl(null);
      }
    };
    fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [open, file]);

  const existingSplitBars = useMemo(() => {
    if (!maxSec) return [];
    return segments.map((seg, idx) => ({
      id: idx,
      startSec: seg.startSec,
      endSec: seg.endSec,
      leftPct: (seg.startSec / maxSec) * 100,
      widthPct: ((seg.endSec - seg.startSec) / maxSec) * 100,
    }));
  }, [segments, maxSec]);

  const rangePercent =
    maxSec > 0
      ? { left: (startSec / maxSec) * 100, right: (endSec / maxSec) * 100 }
      : { left: 0, right: 100 };

  const handleAddSegment = () => {
    if (startSec >= endSec) return;
    const updated = [
      ...segments,
      { splitSeq: segments.length + 1, startSec: Number(startSec), endSec: Number(endSec) },
    ].sort((a, b) => a.startSec - b.startSec);
    setSegments(updated);
    const lastEnd = Math.max(...updated.map((s) => s.endSec));
    setStartSec(lastEnd < maxSec ? lastEnd : 0);
    setEndSec(maxSec);
  };

  const handleRemoveSegment = (idx) => {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  };

  // segments 가 비어있고 파일에 기존 분할이 있으면 "분할 해제" 모드.
  // segments 가 비어있고 기존에도 분할이 없으면 할 일 없음 (저장 버튼 자체가 비활성).
  const isClearMode = segments.length === 0 && hasTimeSegments;

  const handleSave = async () => {
    if (!file) return;
    if (segments.length === 0 && !hasTimeSegments) return;

    if (isClearMode) {
      if (!window.confirm(t("common.fileSplitModal.confirmClear"))) return;
      setSaving(true);
      try {
        const res = await cancelFileSplit(file.fileNo, servCd);
        if (res.status === "SUCCESS") {
          toast.success(t("common.fileSplitModal.clearSuccess"));
          onClose();
          onSaved?.();
        } else {
          toast.error(res.message || t("common.fileSplitModal.clearFailed"));
        }
      } catch (err) {
        toast.error(err.message || t("common.fileSplitModal.clearFailed"));
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const payload = segments.map((seg, idx) => ({
        splitSeq: idx + 1,
        splitTimeSt: formatSec(seg.startSec),
        splitTimeEd: formatSec(seg.endSec),
        splitTime: seg.endSec - seg.startSec,
      }));
      const res = await updateFileSplitSegments(file.fileNo, servCd, payload);
      if (res.status === "SUCCESS") {
        toast.success(t("common.fileSplitModal.saveSuccess"));
        onClose();
        onSaved?.();
      } else {
        toast.error(res.message || t("common.fileSplitModal.saveFailed"));
      }
    } catch (err) {
      toast.error(err.message || t("common.fileSplitModal.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !file) return null;

  return (
    <div className="notion-modal-overlay" onClick={onClose}>
      <div
        className="notion-modal project-modal-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t("common.fileSplitModal.title")}</h3>
          <button className="notion-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="notion-modal-body">
          <div className="selected-file-info">
            <span className="sfi-label">{file.fileNm}</span>
            <span className="sfi-value">{formatSec(maxSec)}</span>
          </div>

          {maxSec > 0 && (
            <div className="split-range-area">
              <SplitWaveformPreview
                audioUrl={audioUrl}
                duration={maxSec}
                startSec={startSec}
                endSec={endSec}
                existingSplits={existingSplitBars}
              />
              <div className="range-bar-container">
                <div className="range-bar-bg">
                  {existingSplitBars.map((es) => (
                    <div
                      key={es.id}
                      className="range-bar-existing"
                      style={{ left: `${es.leftPct}%`, width: `${es.widthPct}%` }}
                      title={`${formatSec(es.startSec)} ~ ${formatSec(es.endSec)}`}
                    />
                  ))}
                  <div
                    className="range-bar-fill"
                    style={{
                      left: `${rangePercent.left}%`,
                      width: `${rangePercent.right - rangePercent.left}%`,
                    }}
                  />
                </div>
                <div className="range-bar-labels">
                  <span>{formatSec(0)}</span>
                  <span>{formatSec(maxSec)}</span>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>
                    {t("common.fileSplitModal.labelStart", { time: formatSec(startSec) })}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={maxSec}
                    step="1"
                    value={startSec}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setStartSec(v < endSec ? v : Number(endSec) - 1);
                    }}
                  />
                  <TimeInput value={startSec} onChange={setStartSec} min={0} max={Math.max(0, endSec - 1)} />
                </div>
                <div className="form-group">
                  <label>
                    {t("common.fileSplitModal.labelEnd", { time: formatSec(endSec) })}
                  </label>
                  <input
                    type="range"
                    min={Number(startSec) + 1}
                    max={maxSec}
                    step="1"
                    value={endSec}
                    onChange={(e) => setEndSec(Number(e.target.value))}
                  />
                  <TimeInput value={endSec} onChange={setEndSec} min={startSec + 1} max={maxSec} />
                </div>
              </div>
              <div className="split-summary">
                {t("common.fileSplitModal.selectedRange")}{" "}
                <strong>{formatSec(startSec)}</strong> ~{" "}
                <strong>{formatSec(endSec)}</strong>
                <span className="split-duration">
                  ({formatSec(endSec - startSec)})
                </span>
              </div>
              <button
                type="button"
                className="btn-ghost file-split-add-btn"
                onClick={handleAddSegment}
                disabled={startSec >= endSec}
              >
                {t("common.fileSplitModal.addSegment")}
              </button>
            </div>
          )}

          {segments.length > 0 && (
            <div className="file-split-segments-list">
              <h4 className="nota-info-title">
                {t("common.fileSplitModal.segmentList")}
              </h4>
              <table className="speaker-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("common.fileSplitModal.start")}</th>
                    <th>{t("common.fileSplitModal.end")}</th>
                    <th>{t("common.fileSplitModal.duration")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((seg, idx) => (
                    <tr key={idx}>
                      <td className="text-center">{idx + 1}</td>
                      <td>{formatSec(seg.startSec)}</td>
                      <td>{formatSec(seg.endSec)}</td>
                      <td>{formatSec(seg.endSec - seg.startSec)}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ fontSize: "11px", padding: "2px 6px", color: "#d32f2f" }}
                          onClick={() => handleRemoveSegment(idx)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="notion-modal-footer">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={(segments.length === 0 && !hasTimeSegments) || saving}
            >
              {saving
                ? t("common.processing")
                : isClearMode
                  ? t("common.fileSplitModal.clear")
                  : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileSplitModal;
