/**
 * 작업시간(work_time) 편집 모달 — 관리자 전용
 *
 * project_files.work_time 값을 초 단위로 수정한다.
 * 연결된 미입금 정산서가 있으면 서버 측에서 work_duration/pay가 자동 재계산된다.
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { updateProjectFileWorkTime } from '../../../api/v9/projectFiles';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';
import './WorkTimeEditModal.css';

const pad2 = (n) => String(n).padStart(2, '0');

const secondsToHms = (totalSec) => {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return { hh, mm, ss };
};

const hmsToSeconds = (hh, mm, ss) => {
  const h = Math.max(0, Number(hh) || 0);
  const m = Math.max(0, Number(mm) || 0);
  const s = Math.max(0, Number(ss) || 0);
  return h * 3600 + m * 60 + s;
};

const formatHms = (totalSec) => {
  const { hh, mm, ss } = secondsToHms(totalSec);
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
};

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Function} props.onSaved - 저장 성공 후 콜백 (업데이트된 ProjectFile 반환)
 * @param {string} props.projectFileId - 대상 project_files.id
 * @param {string} [props.fileName] - 표시용 파일명
 * @param {number} [props.initialWorkTimeSec] - 현재 work_time (초)
 * @param {boolean} [props.hasRelatedSettlement] - 연결 정산서 존재 안내 표시 여부
 */
export default function WorkTimeEditModal({
  open,
  onClose,
  onSaved,
  projectFileId,
  fileName,
  initialWorkTimeSec = 0,
  hasRelatedSettlement = false,
}) {
  const { t } = useTranslation('common');
  const [hh, setHh] = useState(0);
  const [mm, setMm] = useState(0);
  const [ss, setSs] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const init = secondsToHms(initialWorkTimeSec);
      setHh(init.hh);
      setMm(init.mm);
      setSs(init.ss);
    }
  }, [open, initialWorkTimeSec]);

  const handleClose = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [onClose, saving]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  const newTotalSec = hmsToSeconds(hh, mm, ss);
  const changed = newTotalSec !== Math.max(0, Math.floor(Number(initialWorkTimeSec) || 0));

  const handleSave = useCallback(async () => {
    if (!projectFileId || saving || !changed) return;
    setSaving(true);
    try {
      const res = await updateProjectFileWorkTime(projectFileId, newTotalSec);
      if (res?.status === 'SUCCESS') {
        toast.success(t('workTimeEdit.toastSaved'));
        onSaved?.(res.data);
        onClose?.();
      } else {
        toast.error(res?.message || t('workTimeEdit.toastSaveFailed'));
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || t('workTimeEdit.toastSaveFailed');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [projectFileId, saving, changed, newTotalSec, onSaved, onClose, t]);

  if (!open) return null;

  const handleNumInput = (setter, max) => (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      setter(0);
      return;
    }
    let n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) n = 0;
    if (max != null && n > max) n = max;
    setter(n);
  };

  return (
    <div className="notion-modal-overlay" onClick={handleClose}>
      <div className="notion-modal work-time-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-header">
          <h3>{t('workTimeEdit.title')}</h3>
          <button className="notion-modal-close" onClick={handleClose} disabled={saving}>
            <X size={16} />
          </button>
        </div>

        <div className="work-time-edit-body">
          {fileName && (
            <div className="work-time-edit-file-name" title={fileName}>
              {fileName}
            </div>
          )}

          <div className="work-time-edit-current">
            <span className="work-time-edit-label">{t('workTimeEdit.currentLabel')}</span>
            <span className="work-time-edit-value">{formatHms(initialWorkTimeSec)}</span>
          </div>

          <div className="work-time-edit-input-group">
            <label className="work-time-edit-label">{t('workTimeEdit.newLabel')}</label>
            <div className="work-time-edit-hms">
              <input
                type="text"
                inputMode="numeric"
                value={pad2(hh)}
                onChange={handleNumInput(setHh, 999)}
                onFocus={(e) => e.target.select()}
                disabled={saving}
                aria-label="hours"
              />
              <span>:</span>
              <input
                type="text"
                inputMode="numeric"
                value={pad2(mm)}
                onChange={handleNumInput(setMm, 59)}
                onFocus={(e) => e.target.select()}
                disabled={saving}
                aria-label="minutes"
              />
              <span>:</span>
              <input
                type="text"
                inputMode="numeric"
                value={pad2(ss)}
                onChange={handleNumInput(setSs, 59)}
                onFocus={(e) => e.target.select()}
                disabled={saving}
                aria-label="seconds"
              />
              <span className="work-time-edit-unit">
                ({newTotalSec.toLocaleString()} {t('workTimeEdit.secondsUnit')})
              </span>
            </div>
          </div>

          {hasRelatedSettlement && (
            <div className="work-time-edit-notice">
              {t('workTimeEdit.settlementSyncNotice')}
            </div>
          )}

          <div className="work-time-edit-help">
            {t('workTimeEdit.adminOnlyNotice')}
          </div>
        </div>

        <div className="notion-modal-footer">
          <button className="btn-ghost" onClick={handleClose} disabled={saving}>
            {t('workTimeEdit.cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !changed}
          >
            {saving && <Loader2 size={14} className="spin" />}
            {saving ? t('workTimeEdit.saving') : t('workTimeEdit.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
