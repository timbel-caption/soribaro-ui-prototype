/**
 * 일괄 배정 파일 선택 모달
 *
 * 프로젝트 파일 목록을 체크박스로 선택하여
 * 선택된 파일에만 작업자/검수자를 배정합니다.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './BatchAssignFileSelectModal.css';

const formatSec = (sec) => {
  if (sec == null) return '-';
  const totalSec = Math.floor(Number(sec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * @param {Object} props
 * @param {boolean} props.open - 모달 표시 여부
 * @param {Array} props.projectFiles - 프로젝트 파일 배열
 * @param {Object} props.fileMap - fileNo -> FileDto 매핑
 * @param {Array} [props.files] - 의뢰 파일 배열 (정렬 기준용)
 * @param {'worker'|'checker'} props.assignType - 배정 유형
 * @param {Function} props.onConfirm - 선택 확인 콜백 (selectedFileIds: string[])
 * @param {Function} props.onClose - 모달 닫기
 * @param {boolean} props.loading - 파일 목록 로딩 중
 * @param {boolean} props.assigning - 배정 처리 중
 */
const BatchAssignFileSelectModal = ({
  open,
  projectFiles = [],
  fileMap = {},
  files = [],
  assignType = 'worker',
  onConfirm,
  onClose,
  loading = false,
  assigning = false,
}) => {
  const { t } = useTranslation('common');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const assignField = assignType === 'checker' ? 'checkerId' : 'workerId';

  const sortedProjectFiles = useMemo(() => {
    if (!files || files.length === 0) return projectFiles;
    return [...projectFiles].sort((a, b) => {
      const idxA = files.findIndex((f) => f.fileNo === a.fileNo);
      const idxB = files.findIndex((f) => f.fileNo === b.fileNo);
      if (idxA !== idxB) return idxA - idxB;
      return (a.startSec || 0) - (b.startSec || 0);
    });
  }, [projectFiles, files]);

  const unassignedFiles = useMemo(
    () => sortedProjectFiles.filter((pf) => !pf[assignField]),
    [sortedProjectFiles, assignField],
  );

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(unassignedFiles.map((pf) => pf.id)));
    }
  }, [open, unassignedFiles]);

  const toggleFile = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === sortedProjectFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedProjectFiles.map((pf) => pf.id)));
    }
  }, [selectedIds.size, sortedProjectFiles]);

  const handleConfirm = useCallback(() => {
    if (selectedIds.size === 0) {
      alert(t('workerAssign.batchAssignNoSelection'));
      return;
    }
    onConfirm([...selectedIds]);
  }, [selectedIds, onConfirm, t]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isAllSelected = sortedProjectFiles.length > 0 && selectedIds.size === sortedProjectFiles.length;

  return (
    <div className="notion-modal-overlay" onClick={onClose}>
      <div
        className="notion-modal batch-assign-file-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t('workerAssign.batchAssignSelectTitle')}</h3>
          <button className="notion-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="batch-assign-file-body">
          {loading ? (
            <div className="batch-assign-loading">
              <Loader2 size={20} className="spin" />
              <span>{t('workerAssign.loadingFiles')}</span>
            </div>
          ) : sortedProjectFiles.length === 0 ? (
            <div className="batch-assign-empty">
              {t('workerAssign.batchAssignNoTarget')}
            </div>
          ) : (
            <>
              <table className="batch-assign-table">
                <thead>
                  <tr>
                    <th className="batch-assign-th-check">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleAll}
                        disabled={assigning}
                      />
                    </th>
                    <th>{t('workerAssign.batchAssignFileName')}</th>
                    <th className="batch-assign-th-duration">
                      {t('workerAssign.batchAssignDuration')}
                    </th>
                    <th className="batch-assign-th-status">
                      {t('workerAssign.batchAssignStatus')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProjectFiles.map((pf) => {
                    const file = fileMap[pf.fileNo];
                    const isAssigned = !!pf[assignField];
                    const checked = selectedIds.has(pf.id);
                    const fileName = file?.fileNm || `File #${pf.fileNo}`;
                    const duration = pf.isSplit
                      ? (pf.endSec - pf.startSec)
                      : (file?.playTm || 0);

                    return (
                      <tr
                        key={pf.id}
                        className={checked ? 'batch-assign-row-selected' : ''}
                        onClick={() => !assigning && toggleFile(pf.id)}
                      >
                        <td className="batch-assign-td-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFile(pf.id)}
                            disabled={assigning}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="batch-assign-td-name">
                          {fileName}
                          {pf.isSplit && (
                            <span className="batch-assign-split-badge">
                              {formatSec(pf.startSec)} ~ {formatSec(pf.endSec)}
                            </span>
                          )}
                        </td>
                        <td className="batch-assign-td-duration">
                          {formatSec(duration)}
                        </td>
                        <td className="batch-assign-td-status">
                          <span className={`batch-assign-status-chip ${isAssigned ? 'assigned' : 'unassigned'}`}>
                            {isAssigned
                              ? t('workerAssign.batchAssignAssigned')
                              : t('workerAssign.batchAssignUnassigned')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="batch-assign-footer">
          <span className="batch-assign-selected-count">
            {t('workerAssign.batchAssignSelected', { count: selectedIds.size })}
          </span>
          <div className="batch-assign-footer-buttons">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={assigning}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirm}
              disabled={assigning || selectedIds.size === 0}
            >
              {assigning ? (
                <>
                  <Loader2 size={14} className="spin" />
                  {t('processing')}
                </>
              ) : (
                t('workerAssign.batchAssignConfirmBtn', { count: selectedIds.size })
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchAssignFileSelectModal;
