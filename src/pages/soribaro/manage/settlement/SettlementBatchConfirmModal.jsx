import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import { confirmSettlement, rejectSettlement } from '../../../../api/v9/settlement';
import { useUserStore } from '../../../../stores/userStore';
import { toast } from '../../../../stores/toastStore';
import './SettlementBatchConfirmModal.css';

const formatDate = (value) => {
  if (!value) return '-';
  const s = typeof value === 'string' ? value : String(value);
  return s.replace('T', ' ').slice(0, 16);
};

const formatNumber = (value) => {
  if (value == null) return '-';
  return Number(value).toLocaleString();
};

export default function SettlementBatchConfirmModal({ open, items = [], onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const isAdmin = useUserStore((s) => s.isAdmin);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingItems, setRemainingItems] = useState([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (open && items.length > 0) {
      setRemainingItems([...items]);
      setCurrentIndex(0);
    }
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && !processing) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose, processing]);

  const total = remainingItems.length;
  const settlement = remainingItems[currentIndex] || null;

  const handleConfirmAll = useCallback(async () => {
    if (remainingItems.length === 0) return;
    setProcessing(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const item of remainingItems) {
        try {
          const res = await confirmSettlement(item.id);
          if (res?.status === 'SUCCESS') {
            successCount++;
          } else {
            failCount++;
            toast.error(res?.message || t('mypage.settlementBatchConfirm.toastConfirmFailed'));
          }
        } catch (err) {
          failCount++;
          toast.error(err.message || t('mypage.settlementBatchConfirm.toastConfirmFailed'));
        }
      }
      if (failCount === 0) {
        toast.success(t('mypage.settlementBatchConfirm.toastConfirmAllSuccess', { count: successCount }));
      } else {
        toast.error(t('mypage.settlementBatchConfirm.toastConfirmResult', { success: successCount, fail: failCount }));
      }
      onSuccess?.();
      onClose();
    } finally {
      setProcessing(false);
    }
  }, [remainingItems, onSuccess, onClose, t]);

  const handleReject = useCallback(async () => {
    if (!settlement) return;
    setProcessing(true);
    try {
      const res = await rejectSettlement(settlement.id);
      if (res?.status === 'SUCCESS') {
        toast.success(t('mypage.settlementBatchConfirm.toastRejected'));
        const newItems = remainingItems.filter((_, i) => i !== currentIndex);
        if (newItems.length === 0) {
          onSuccess?.();
          onClose();
          return;
        }
        setRemainingItems(newItems);
        setCurrentIndex((prev) => prev >= newItems.length ? newItems.length - 1 : prev);
        onSuccess?.();
      } else {
        toast.error(res?.message || t('mypage.settlementBatchConfirm.toastRejectFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('mypage.settlementBatchConfirm.toastRejectFailed'));
    } finally {
      setProcessing(false);
    }
  }, [settlement, remainingItems, currentIndex, onSuccess, onClose, t]);

  const price = useMemo(() => Number(settlement?.price) || 0, [settlement]);
  const workDuration = useMemo(() => Number(settlement?.workDuration) || 0, [settlement]);
  const penalty = useMemo(() => Number(settlement?.penalty) || 0, [settlement]);
  const taxRate = useMemo(() => Number(settlement?.taxRate) || 0, [settlement]);
  const subtotal = price * workDuration;
  const afterPenalty = subtotal - penalty;
  const tax = Math.round(afterPenalty * taxRate / 100);
  const pay = useMemo(() => Number(settlement?.pay) || 0, [settlement]);

  if (!open) return null;

  if (!settlement) {
    return (
      <div className="notion-modal-overlay" onClick={onClose}>
        <div className="notion-modal si-modal" onClick={(e) => e.stopPropagation()}>
          <div className="notion-modal-header">
            <h3>{t('mypage.settlementBatchConfirm.title')}</h3>
            <button className="notion-modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="notion-modal-body"><p>{t('mypage.settlementBatchConfirm.noItems')}</p></div>
          <div className="notion-modal-footer"><button className="btn-ghost" onClick={onClose}>{t('manage.settlement.detailModal.close')}</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-modal-overlay" onClick={processing ? undefined : onClose}>
      <div className="notion-modal si-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-header si-header">
          <h3>{t('mypage.settlementBatchConfirm.title')}</h3>
          <div className="si-nav">
            <button className="si-nav-btn" disabled={currentIndex <= 0 || processing} onClick={() => setCurrentIndex((p) => p - 1)}><ChevronLeft size={14} /></button>
            <span className="si-nav-label">{currentIndex + 1} / {total}</span>
            <button className="si-nav-btn" disabled={currentIndex >= total - 1 || processing} onClick={() => setCurrentIndex((p) => p + 1)}><ChevronRight size={14} /></button>
          </div>
          <button className="notion-modal-close" onClick={onClose} disabled={processing}><X size={16} /></button>
        </div>

        <div className="notion-modal-body si-body">
          <div className="si-info">
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelProjectTitle')}</span><span className="si-prop-value">{settlement.projectTitle}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelServiceName')}</span><span className="si-prop-value">{settlement.servTitle}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelServCd')}</span><span className="si-prop-value si-prop-mono">{settlement.servCd || '-'}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFileNo')}</span><span className="si-prop-value si-prop-mono">{settlement.fileNo}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFileName')}</span><span className="si-prop-value">{settlement.fileName}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelWorkType')}</span><span className="si-prop-value">{settlement.bssTypeName}</span></div>
            {settlement.fileDifficultName && (
              <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFileDifficulty')}</span><span className="si-prop-value">{settlement.fileDifficultName}</span></div>
            )}
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelExecutor')}</span><span className="si-prop-value">{settlement.executorName}</span></div>

            <div className="si-info-sep" />

            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelCreatedAt')}</span><span className="si-prop-value si-prop-mono">{formatDate(settlement.createdAt)}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelWorkDuration')}</span><span className="si-prop-value">{t('manage.settlement.detailModal.workDurationMinutes', { minutes: workDuration })}</span></div>
          </div>

          <div className="si-right">
            <div className="si-invoice">
              <div className="si-invoice-head">
                <span className="si-invoice-role">{t('manage.settlement.detailModal.labelWorker')}</span>
                <span className="si-invoice-id">{settlement.workerName} ({settlement.workerId})</span>
                {settlement.workerLevelName && <span className="si-badge">{settlement.workerLevelName}</span>}
              </div>

              <div className="si-invoice-sep" />

              <div className="si-invoice-lines">
                <div className="si-line">
                  <span className="si-line-label">{t('manage.settlement.detailModal.labelUnitPrice')}</span>
                  <span className="si-line-value si-line-readonly">{formatNumber(price)} {t('manage.settlement.detailModal.wonUnit')}</span>
                </div>
                <div className="si-line">
                  <span className="si-line-label">{t('manage.settlement.detailModal.labelWorkDuration')}</span>
                  <span className="si-line-value si-line-readonly">× {workDuration} {t('common.minuteUnit')}</span>
                </div>

                <div className="si-invoice-sep-light" />

                <div className="si-line">
                  <span className="si-line-label si-line-label-sub">{t('manage.settlement.issueModal.subtotal')}</span>
                  <span className="si-line-value si-line-readonly">{subtotal.toLocaleString()} {t('manage.settlement.detailModal.wonUnit')}</span>
                </div>
                <div className="si-line">
                  <span className="si-line-label">{t('manage.settlement.detailModal.labelPenalty')}</span>
                  <span className="si-line-value si-line-readonly">-{formatNumber(penalty)} {t('manage.settlement.detailModal.wonUnit')}</span>
                </div>
                {isAdmin() && (
                  <div className="si-line">
                    <span className="si-line-label">{t('manage.settlement.detailModal.labelTaxRate')}</span>
                    <span className="si-line-value si-line-readonly">{taxRate}%</span>
                  </div>
                )}
                {isAdmin() && (
                  <div className="si-line">
                    <span className="si-line-label si-line-label-sub">{t('manage.settlement.issueModal.taxAmount')}</span>
                    <span className="si-line-value si-line-readonly">-{tax.toLocaleString()} {t('manage.settlement.detailModal.wonUnit')}</span>
                  </div>
                )}

                <div className="si-invoice-sep" />

                <div className="si-line si-line-total">
                  <span className="si-line-label">{t('manage.settlement.detailModal.labelPayAmount')}</span>
                  <span className="si-line-value si-line-total-value">{pay.toLocaleString()} <small>{t('manage.settlement.detailModal.wonUnit')}</small></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="notion-modal-footer sbc-footer">
          <button className="btn-primary" onClick={handleConfirmAll} disabled={processing}>
            {processing
              ? <><Loader2 size={14} className="sbc-spinner" /> {t('manage.common.processing')}</>
              : t('mypage.settlementBatchConfirm.confirmAll', { count: total })}
          </button>
          <button className="btn-danger" onClick={handleReject} disabled={processing}>
            {processing ? t('manage.common.processing') : t('mypage.settlementBatchConfirm.reject')}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={processing}>
            {t('manage.settlement.detailModal.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
