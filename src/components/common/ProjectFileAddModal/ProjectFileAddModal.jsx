import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

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

const ProjectFileAddModal = ({
  open,
  files,
  existingProjectFiles,
  currentProjectFiles,
  onClose,
  onSubmit,
  submitting,
}) => {
  const { t } = useTranslation("soribaro");
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    if (open) setSelectedItems([]);
  }, [open]);

  const fullyAssignedFileIds = useMemo(() => {
    const ids = new Set();
    const splitMap = {};
    (existingProjectFiles || []).forEach((pf) => {
      if (!pf.isSplit) {
        ids.add(pf.fileNo);
      } else {
        if (!splitMap[pf.fileNo]) splitMap[pf.fileNo] = [];
        splitMap[pf.fileNo].push({ startSec: pf.startSec, endSec: pf.endSec });
      }
    });
    files.forEach((f) => {
      if (ids.has(f.fileNo)) return;
      const splits = splitMap[f.fileNo];
      if (!splits || splits.length === 0) return;
      const totalSec = Number(f.playTm) || 0;
      if (totalSec <= 0) return;
      const sorted = [...splits].sort((a, b) => a.startSec - b.startSec);
      let covered = 0;
      let end = 0;
      for (const seg of sorted) {
        const segStart = Math.max(seg.startSec, end);
        if (segStart < seg.endSec) {
          covered += seg.endSec - segStart;
          end = Math.max(end, seg.endSec);
        }
      }
      if (covered >= totalSec) ids.add(f.fileNo);
    });
    return ids;
  }, [existingProjectFiles, files]);

  const assignedSegmentKeys = useMemo(() => {
    const keys = new Set();
    (existingProjectFiles || []).forEach((pf) => {
      if (pf.isSplit) keys.add(`${pf.fileNo}_${pf.startSec}_${pf.endSec}`);
    });
    return keys;
  }, [existingProjectFiles]);

  const currentSegmentKeys = useMemo(() => {
    const keys = new Set();
    (currentProjectFiles || []).forEach((pf) => {
      if (pf.isSplit) keys.add(`${pf.fileNo}_${pf.startSec}_${pf.endSec}`);
    });
    return keys;
  }, [currentProjectFiles]);

  const currentNonSplitFileNos = useMemo(() => {
    const nos = new Set();
    (currentProjectFiles || []).forEach((pf) => {
      if (!pf.isSplit) nos.add(pf.fileNo);
    });
    return nos;
  }, [currentProjectFiles]);

  const isSegmentAssigned = (fileNo, startSec, endSec) =>
    assignedSegmentKeys.has(`${fileNo}_${startSec}_${endSec}`);

  const isSegmentInCurrentProject = (fileNo, startSec, endSec) =>
    currentSegmentKeys.has(`${fileNo}_${startSec}_${endSec}`);

  const toggleWholeFile = (file) => {
    const exists = selectedItems.some((s) => s.fileNo === file.fileNo && !s.isSplit);
    if (exists) {
      setSelectedItems((prev) => prev.filter((s) => !(s.fileNo === file.fileNo && !s.isSplit)));
    } else {
      setSelectedItems((prev) => [...prev, { fileNo: file.fileNo, isSplit: false, startSec: 0, endSec: 0 }]);
    }
  };

  const toggleSegment = (fileNo, seg) => {
    const startSec = hhmmssToSec(seg.splitTimeSt);
    const endSec = hhmmssToSec(seg.splitTimeEd);
    const exists = selectedItems.some(
      (s) => s.fileNo === fileNo && s.isSplit && s.startSec === startSec && s.endSec === endSec,
    );
    if (exists) {
      setSelectedItems((prev) =>
        prev.filter((s) => !(s.fileNo === fileNo && s.isSplit && s.startSec === startSec && s.endSec === endSec)),
      );
    } else {
      setSelectedItems((prev) => [...prev, { fileNo, isSplit: true, splitSeq: seg.splitSeq, startSec, endSec }]);
    }
  };

  const isWholeFileSelected = (fileNo) =>
    selectedItems.some((s) => s.fileNo === fileNo && !s.isSplit);

  const isSegmentSelected = (fileNo, seg) => {
    const startSec = hhmmssToSec(seg.splitTimeSt);
    const endSec = hhmmssToSec(seg.splitTimeEd);
    return selectedItems.some(
      (s) => s.fileNo === fileNo && s.isSplit && s.startSec === startSec && s.endSec === endSec,
    );
  };

  const selectableItems = useMemo(() => {
    const items = [];
    files.forEach((file) => {
      const isFullyAssigned = fullyAssignedFileIds.has(file.fileNo);
      if (isFullyAssigned) return;
      const hasSplit = file.splitTp === "1" && file.timeSegments?.length > 0;
      if (hasSplit) {
        file.timeSegments.forEach((seg) => {
          const startSec = hhmmssToSec(seg.splitTimeSt);
          const endSec = hhmmssToSec(seg.splitTimeEd);
          if (!isSegmentAssigned(file.fileNo, startSec, endSec)) {
            items.push({ fileNo: file.fileNo, isSplit: true, splitSeq: seg.splitSeq, startSec, endSec });
          }
        });
      } else {
        const isNonSplitAssigned = (existingProjectFiles || []).some(
          (pf) => pf.fileNo === file.fileNo && !pf.isSplit,
        );
        if (!isNonSplitAssigned) {
          items.push({ fileNo: file.fileNo, isSplit: false, startSec: 0, endSec: 0 });
        }
      }
    });
    return items;
  }, [files, fullyAssignedFileIds, existingProjectFiles, assignedSegmentKeys]);

  const isAllSelected = selectableItems.length > 0 && selectedItems.length === selectableItems.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItems([]);
    } else {
      setSelectedItems([...selectableItems]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) return;
    onSubmit(selectedItems);
  };

  if (!open) return null;

  return (
    <div className="notion-modal-overlay" onClick={onClose}>
      <div
        className="notion-modal notion-modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t("common.projectFileAddModal.title")}</h3>
          <button className="notion-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="notion-modal-body" onSubmit={handleSubmit}>
          {selectableItems.length > 0 && (
            <div className="pf-add-file-row" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: 8, marginBottom: 4 }}>
              <label className="pf-add-checkbox-label">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  disabled={submitting}
                />
                <span className="pf-add-file-name" style={{ fontWeight: 600 }}>
                  {t("common.projectFileAddModal.selectAll")}
                </span>
              </label>
            </div>
          )}
          <div className="pf-add-file-list">
            {files.map((file) => {
              const isFullyAssigned = fullyAssignedFileIds.has(file.fileNo);
              const hasSplit = file.splitTp === "1" && file.timeSegments?.length > 0;
              const isNonSplitAssigned = (existingProjectFiles || []).some(
                (pf) => pf.fileNo === file.fileNo && !pf.isSplit,
              );
              const isNonSplitInCurrent = currentNonSplitFileNos.has(file.fileNo);

              return (
                <div key={file.fileNo} className="pf-add-file-item">
                  {hasSplit ? (
                    <>
                      <div className="pf-add-file-row pf-add-file-parent">
                        <span className="pf-add-file-name">
                          {file.fileNm}
                          <span className="pf-add-file-meta">
                            ({formatSec(file.playTm)} · {t("common.projectFileAddModal.splitLabel")})
                          </span>
                        </span>
                      </div>
                      {file.timeSegments.map((seg) => {
                        const segStart = hhmmssToSec(seg.splitTimeSt);
                        const segEnd = hhmmssToSec(seg.splitTimeEd);
                        const assigned = isSegmentAssigned(file.fileNo, segStart, segEnd);
                        const inCurrent = isSegmentInCurrentProject(file.fileNo, segStart, segEnd);
                        const checked = isSegmentSelected(file.fileNo, seg);
                        return (
                          <div key={seg.splitSeq} className="pf-add-file-row pf-add-segment-row">
                            <label className={`pf-add-checkbox-label ${assigned ? "pf-add-disabled" : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked || assigned}
                                disabled={assigned || isFullyAssigned || submitting}
                                onChange={() => toggleSegment(file.fileNo, seg)}
                              />
                              <span className="pf-add-segment-info">
                                {t("common.projectFileAddModal.segmentOption", {
                                  seq: seg.splitSeq,
                                  start: seg.splitTimeSt,
                                  end: seg.splitTimeEd,
                                  duration: formatSec(seg.splitTime),
                                })}
                              </span>
                              {assigned && (
                                <span className="pf-add-registered-badge">
                                  {inCurrent
                                    ? t("common.projectFileAddModal.registered")
                                    : t("common.projectFileAddModal.assignedToOther")}
                                </span>
                              )}
                            </label>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="pf-add-file-row">
                      <label className={`pf-add-checkbox-label ${isFullyAssigned || isNonSplitAssigned ? "pf-add-disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={isWholeFileSelected(file.fileNo) || isNonSplitAssigned}
                          disabled={isFullyAssigned || isNonSplitAssigned || submitting}
                          onChange={() => toggleWholeFile(file)}
                        />
                        <span className="pf-add-file-name">
                          {file.fileNm}
                          <span className="pf-add-file-meta">({formatSec(file.playTm)})</span>
                        </span>
                        {(isFullyAssigned || isNonSplitAssigned) && (
                          <span className="pf-add-registered-badge">
                            {isNonSplitInCurrent
                              ? t("common.projectFileAddModal.registered")
                              : t("common.projectFileAddModal.assignedToOther")}
                          </span>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedItems.length > 0 && (
            <div className="pf-add-selected-summary">
              {t("common.projectFileAddModal.selectedCount", { count: selectedItems.length })}
            </div>
          )}

          <div className="notion-modal-footer">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || selectedItems.length === 0}>
              {submitting
                ? t("common.processing")
                : t("common.projectFileAddModal.addFiles", { count: selectedItems.length })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectFileAddModal;
