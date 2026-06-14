import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { executeSettlement, confirmSettlement, rejectSettlement, paidSettlement, sendAlimtalk, updateSettlement, reExecuteSettlement, revertPaymentSettlement, deleteSettlement, previewSettlementPay } from '../../../../api/v9/settlement';
import { updateProjectFileEvaluationMetrics } from '../../../../api/v9/projectFileEvaluations';
import { useUserStore } from '../../../../stores/userStore';
import { toast } from '../../../../stores/toastStore';
import { useSettlementUiStore } from '../../../../stores/settlementUiStore';
import { formatWorkTime } from '../../../../utils/workTimeUtils';
import WorkDurationInput from './WorkDurationInput';
import WorkTimeModeToggle from './WorkTimeModeToggle';
import './SettlementDetailModal.css';

const formatDate = (value) => {
  if (!value) return '-';
  const s = typeof value === 'string' ? value : String(value);
  return s.replace('T', ' ').slice(0, 16);
};

const formatNumber = (value) => {
  if (value == null) return '-';
  return Number(value).toLocaleString();
};

/**
 * 정산서 상세 모달 (범용 — 단건/다건 지원)
 *
 * 단건: settlement prop 사용 (기존 호환)
 * 다건: settlements 배열 prop 사용 (네비게이션 + 전체 집행)
 */
export default function SettlementDetailModal({ open, settlement: singleSettlement, settlements: multiSettlements, status, onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const isAdmin = useUserStore((s) => s.isAdmin);
  const user = useUserStore((s) => s.user);
  const workTimeMode = useSettlementUiStore((s) => s.workTimeDisplayMode);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editForm, setEditForm] = useState(null);
  const [rejectReasonOpen, setRejectReasonOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isMulti = Array.isArray(multiSettlements) && multiSettlements.length > 0;
  const items = isMulti ? multiSettlements : (singleSettlement ? [singleSettlement] : []);
  const settlement = items[currentIndex] || null;
  const total = items.length;
  const isRejectedEdit = status === 'REJECTED' && !isMulti;
  const isPaymentRevertEdit = status === 'WAITING_PAYMENT' && !isMulti && isAdmin();
  const showEditForm = isRejectedEdit || isPaymentRevertEdit;

  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setEditForm(null);
      setRejectReasonOpen(false);
      setRejectReason('');
    }
  }, [open]);

  // REJECTED 단건 / WAITING_PAYMENT(관리자) 단건 → 편집 폼 초기화
  useEffect(() => {
    if (open && settlement && showEditForm) {
      setEditForm({
        price: Number(settlement.price) || 0,
        penalty: Number(settlement.penalty) || 0,
        taxRate: Number(settlement.taxRate) || 0,
        // 재발행(REJECTED)에서만 수정 가능. 입금대기 수정은 금액 항목만 사용.
        workMinutes: Number(settlement.workDuration) || 0,
        accuracy: settlement.accuracy ?? '',
        errorCount: settlement.errorCount ?? '',
        formErrorCount: settlement.formErrorCount ?? 0,
        _payRate: settlement.payRate != null ? Number(settlement.payRate) : null,
      });
    } else if (!showEditForm) {
      setEditForm(null);
    }
  }, [open, settlement?.id, showEditForm]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const handleAction = useCallback(async (actionFn, successKey, failKey) => {
    if (!settlement) return;
    setProcessing(true);
    try {
      const res = await actionFn(settlement.id);
      if (res?.status === 'SUCCESS') {
        toast.success(t(successKey));
        onSuccess?.();
        onClose();
      } else {
        toast.error(res?.message || t(failKey));
      }
    } catch (err) {
      toast.error(err.message || t(failKey));
    } finally {
      setProcessing(false);
    }
  }, [settlement, onSuccess, onClose, t]);

  const handleExecute = useCallback(() => handleAction(executeSettlement, 'manage.settlement.detailModal.toastExecuted', 'manage.settlement.detailModal.toastExecuteFailed'), [handleAction]);
  const handleConfirm = useCallback(() => handleAction(confirmSettlement, 'manage.settlement.detailModal.toastConfirmed', 'manage.settlement.detailModal.toastConfirmFailed'), [handleAction]);
  const handleRejectClick = useCallback(() => {
    setRejectReasonOpen(true);
    setRejectReason('');
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    if (!settlement) return;
    setProcessing(true);
    try {
      const res = await rejectSettlement(settlement.id, rejectReason || null);
      if (res?.status === 'SUCCESS') {
        toast.success(t('manage.settlement.detailModal.toastRejected'));
        setRejectReasonOpen(false);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res?.message || t('manage.settlement.detailModal.toastRejectFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.settlement.detailModal.toastRejectFailed'));
    } finally {
      setProcessing(false);
    }
  }, [settlement, rejectReason, onSuccess, onClose, t]);
  const handlePaid = useCallback(() => handleAction(paidSettlement, 'manage.settlement.detailModal.toastPaid', 'manage.settlement.detailModal.toastPaidFailed'), [handleAction]);
  const handleSendAlimtalk = useCallback(() => handleAction(sendAlimtalk, 'manage.settlement.detailModal.toastAlimtalkSent', 'manage.settlement.detailModal.toastAlimtalkFailed'), [handleAction]);
  const handleDelete = useCallback(() => handleAction(deleteSettlement, 'manage.settlement.detailModal.toastDeleted', 'manage.settlement.detailModal.toastDeleteFailed'), [handleAction]);

  const handleBatchExecute = useCallback(async () => {
    if (items.length === 0) return;
    setProcessing(true);
    let successCount = 0, failCount = 0;
    try {
      for (const item of items) {
        try {
          const res = await executeSettlement(item.id);
          if (res?.status === 'SUCCESS') successCount++;
          else { failCount++; toast.error(res?.message || t('manage.settlement.detailModal.toastExecuteFailed')); }
        } catch (err) { failCount++; toast.error(err.message || t('manage.settlement.detailModal.toastExecuteFailed')); }
      }
      if (failCount === 0) toast.success(t('manage.settlement.statusPanel.toastBatchExecuted', { count: successCount }));
      else toast.error(t('manage.settlement.statusPanel.toastBatchExecuteResult', { success: successCount, fail: failCount }));
      onSuccess?.();
      onClose();
    } finally { setProcessing(false); }
  }, [items, onSuccess, onClose, t]);

  const handleBatchPaid = useCallback(async () => {
    if (items.length === 0) return;
    setProcessing(true);
    let successCount = 0, failCount = 0;
    try {
      for (const item of items) {
        try {
          const res = await paidSettlement(item.id);
          if (res?.status === 'SUCCESS') successCount++;
          else { failCount++; toast.error(res?.message || t('manage.settlement.detailModal.toastPaidFailed')); }
        } catch (err) { failCount++; toast.error(err.message || t('manage.settlement.detailModal.toastPaidFailed')); }
      }
      if (failCount === 0) toast.success(t('manage.settlement.statusPanel.toastBatchPaid', { count: successCount }));
      else toast.error(t('manage.settlement.statusPanel.toastBatchPaidResult', { success: successCount, fail: failCount }));
      onSuccess?.();
      onClose();
    } finally { setProcessing(false); }
  }, [items, onSuccess, onClose, t]);

  const handleBatchConfirm = useCallback(async () => {
    if (items.length === 0) return;
    setProcessing(true);
    let successCount = 0, failCount = 0;
    try {
      for (const item of items) {
        try {
          const res = await confirmSettlement(item.id);
          if (res?.status === 'SUCCESS') successCount++;
          else { failCount++; toast.error(res?.message || t('manage.settlement.detailModal.toastConfirmFailed')); }
        } catch (err) { failCount++; toast.error(err.message || t('manage.settlement.detailModal.toastConfirmFailed')); }
      }
      if (failCount === 0) toast.success(t('manage.settlement.statusPanel.toastBatchConfirmed', { count: successCount }));
      else toast.error(t('manage.settlement.statusPanel.toastBatchConfirmResult', { success: successCount, fail: failCount }));
      onSuccess?.();
      onClose();
    } finally { setProcessing(false); }
  }, [items, onSuccess, onClose, t]);

  const handleBatchDelete = useCallback(async () => {
    if (items.length === 0) return;
    setProcessing(true);
    let successCount = 0, failCount = 0;
    try {
      for (const item of items) {
        try {
          const res = await deleteSettlement(item.id);
          if (res?.status === 'SUCCESS') successCount++;
          else { failCount++; toast.error(res?.message || t('manage.settlement.detailModal.toastDeleteFailed')); }
        } catch (err) { failCount++; toast.error(err.message || t('manage.settlement.detailModal.toastDeleteFailed')); }
      }
      if (failCount === 0) toast.success(t('manage.settlement.statusPanel.toastBatchDeleted', { count: successCount }));
      else toast.error(t('manage.settlement.statusPanel.toastBatchDeleteResult', { success: successCount, fail: failCount }));
      onSuccess?.();
      onClose();
    } finally { setProcessing(false); }
  }, [items, onSuccess, onClose, t]);

  const handleRevertPayment = useCallback(async () => {
    if (!settlement || !editForm) return;
    setProcessing(true);
    try {
      const newPrice = Number(editForm.price) || 0;
      const newPenalty = Number(editForm.penalty) || 0;
      const newTaxRate = Number(editForm.taxRate) || 0;
      const wd = Number(settlement.workDuration) || 0;
      // payRate 스냅샷이 있으면 감가 적용 후 페널티/세금 차감 (백엔드 recalculatePay 와 동일 공식)
      const rate = settlement.payRate != null ? Number(settlement.payRate) : 100;
      const subtotal = Math.round(newPrice * wd * rate / 100);
      const base = subtotal - newPenalty;
      const rawPay = Math.round(base - (base * newTaxRate / 100));
      const newPay = rawPay < 0 ? 0 : rawPay;

      const valuesChanged =
        newPrice !== Number(settlement.price) ||
        newPenalty !== Number(settlement.penalty) ||
        newTaxRate !== Number(settlement.taxRate);

      if (valuesChanged) {
        const updateRes = await updateSettlement(settlement.id, {
          price: newPrice,
          penalty: newPenalty,
          pay: newPay,
          taxRate: newTaxRate,
        });
        if (updateRes?.status !== 'SUCCESS') {
          toast.error(updateRes?.message || t('manage.settlement.detailModal.toastRevertFailed'));
          return;
        }
      }

      const revertRes = await revertPaymentSettlement(settlement.id);
      if (revertRes?.status === 'SUCCESS') {
        toast.success(t('manage.settlement.detailModal.toastReverted'));
        onSuccess?.();
        onClose();
      } else {
        toast.error(revertRes?.message || t('manage.settlement.detailModal.toastRevertFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.settlement.detailModal.toastRevertFailed'));
    } finally { setProcessing(false); }
  }, [settlement, editForm, onSuccess, onClose, t]);

  // 재발행 시 정확도/작업시간 변경에 따른 감가(payRate) 미리보기 갱신 — 표시용. 최종값은 서버가 재계산.
  const refreshReissuePayRate = useCallback(async () => {
    if (!editForm || !settlement?.bssType) return;
    const acc = (editForm.accuracy === '' || editForm.accuracy == null) ? null : Number(editForm.accuracy);
    if (acc == null) { setEditForm((f) => (f ? { ...f, _payRate: null } : f)); return; }
    try {
      const w = await previewSettlementPay({
        bssType: settlement.bssType,
        price: Number(editForm.price) || 0,
        workDuration: Number(editForm.workMinutes) || 0,
        penalty: 0,
        taxRate: 0,
        accuracy: acc,
      });
      const rate = (w?.status === 'SUCCESS' && w.data?.depreciationApplied) ? Number(w.data.payRate) : null;
      setEditForm((f) => (f ? { ...f, _payRate: rate } : f));
    } catch { /* 미리보기 실패는 재발행 흐름을 막지 않음 */ }
  }, [editForm, settlement]);

  const handleReissue = useCallback(async () => {
    if (!settlement || !editForm) return;
    setProcessing(true);
    try {
      const newPrice = Number(editForm.price) || 0;
      const newPenalty = Number(editForm.penalty) || 0;
      const newTaxRate = Number(editForm.taxRate) || 0;
      const workMinutes = Number(editForm.workMinutes) || 0;
      const effAccuracy = (editForm.accuracy === '' || editForm.accuracy == null) ? null : Number(editForm.accuracy);
      const effErrorCount = (editForm.errorCount === '' || editForm.errorCount == null) ? null : Number(editForm.errorCount);
      const effFormErrorCount = Number(editForm.formErrorCount) || 0;

      // 1단계: 평가 지표가 바뀌었으면 원천(project_file_evaluation) 먼저 갱신 (발행 모달과 동일)
      const metricsChanged =
        effAccuracy !== (settlement.accuracy == null ? null : Number(settlement.accuracy)) ||
        effErrorCount !== (settlement.errorCount == null ? null : Number(settlement.errorCount)) ||
        effFormErrorCount !== (Number(settlement.formErrorCount) || 0);
      if (metricsChanged) {
        if (effAccuracy == null || effErrorCount == null) {
          toast.error(t('manage.settlement.detailModal.toastEvalValueMissing'));
          return;
        }
        if (settlement.projectFileId) {
          const er = await updateProjectFileEvaluationMetrics(settlement.projectFileId, {
            accuracy: effAccuracy,
            errorCount: effErrorCount,
            formErrorCount: effFormErrorCount,
            updatedBy: user?.membNo != null ? String(user.membNo) : undefined,
          });
          if (er?.status !== 'SUCCESS') {
            toast.error(er?.message || t('manage.settlement.detailModal.toastReissueFailed'));
            return;
          }
        }
      }

      // 2단계: 정산서 수정 — 작업시간/정확도/오류 반영. pay·payRate 는 서버에서 재계산.
      const updateRes = await updateSettlement(settlement.id, {
        price: newPrice,
        penalty: newPenalty,
        taxRate: newTaxRate,
        workDuration: workMinutes,
        accuracy: effAccuracy,
        errorCount: effErrorCount,
        formErrorCount: effFormErrorCount,
      });
      if (updateRes?.status !== 'SUCCESS') {
        toast.error(updateRes?.message || t('manage.settlement.detailModal.toastReissueFailed'));
        return;
      }

      // 3단계: 재집행 (REJECTED → WAITING_CONFIRM)
      const execRes = await reExecuteSettlement(settlement.id);
      if (execRes?.status === 'SUCCESS') {
        toast.success(t('manage.settlement.detailModal.toastReissued'));
        onSuccess?.();
        onClose();
      } else {
        toast.error(execRes?.message || t('manage.settlement.detailModal.toastReissueFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.settlement.detailModal.toastReissueFailed'));
    } finally { setProcessing(false); }
  }, [settlement, editForm, user, onSuccess, onClose, t]);

  if (!open) return null;

  if (!settlement) {
    return (
      <div className="notion-modal-overlay" onClick={onClose}>
        <div className="notion-modal si-modal" onClick={(e) => e.stopPropagation()}>
          <div className="notion-modal-header">
            <h3>{t('manage.settlement.detailModal.title')}</h3>
            <button className="notion-modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="notion-modal-body"><p>{t('manage.settlement.detailModal.noSettlement')}</p></div>
          <div className="notion-modal-footer"><button className="btn-ghost" onClick={onClose}>{t('manage.settlement.detailModal.close')}</button></div>
        </div>
      </div>
    );
  }

  const price = editForm ? Number(editForm.price) || 0 : Number(settlement.price) || 0;
  // 재발행 시에는 작업시간/감가도 수정값(editForm)을 사용
  const workDuration = (editForm && isRejectedEdit) ? (Number(editForm.workMinutes) || 0) : (Number(settlement.workDuration) || 0);
  const penalty = editForm ? Number(editForm.penalty) || 0 : Number(settlement.penalty) || 0;
  const taxRate = editForm ? Number(editForm.taxRate) || 0 : Number(settlement.taxRate) || 0;
  const payRate = (editForm && isRejectedEdit)
    ? (editForm._payRate != null ? Number(editForm._payRate) : null)
    : (settlement.payRate != null ? Number(settlement.payRate) : null); // null = 감가 미적용
  const subtotal = price * workDuration;
  const subtotalAfterDepr = payRate != null ? Math.round(subtotal * payRate / 100) : subtotal;
  const afterPenalty = subtotalAfterDepr - penalty;
  const tax = Math.round(afterPenalty * taxRate / 100);
  const editedPay = afterPenalty - tax;
  const pay = editForm ? (editedPay < 0 ? 0 : editedPay) : Number(settlement.pay) || 0;

  return (
    <div className="notion-modal-overlay" onClick={onClose}>
      <div className="notion-modal si-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="notion-modal-header si-header">
          <h3>{t('manage.settlement.detailModal.title')}</h3>
          {isMulti && (
            <div className="si-nav">
              <button className="si-nav-btn" disabled={currentIndex <= 0} onClick={() => setCurrentIndex((p) => p - 1)}><ChevronLeft size={14} /></button>
              <span className="si-nav-label">{currentIndex + 1} / {total}</span>
              <button className="si-nav-btn" disabled={currentIndex >= total - 1} onClick={() => setCurrentIndex((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
          <button className="notion-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body — 2 column */}
        <div className="notion-modal-body si-body">
          {/* LEFT: file info */}
          <div className="si-info">
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelProjectTitle')}</span><span className="si-prop-value">{settlement.projectTitle}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelServiceName')}</span><span className="si-prop-value">{settlement.servTitle}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelEntNm')}</span><span className="si-prop-value">{settlement.entNm || '-'}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelServCd')}</span><span className="si-prop-value si-prop-mono">{settlement.servCd || '-'}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFileNo')}</span><span className="si-prop-value si-prop-mono">{settlement.fileNo}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFileName')}</span><span className="si-prop-value">{settlement.fileName}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelWorkType')}</span><span className="si-prop-value">{settlement.bssTypeName}</span></div>
            {settlement.fileDifficultName && (
              <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFileDifficulty')}</span><span className="si-prop-value">{settlement.fileDifficultName}</span></div>
            )}
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelExecutor')}</span><span className="si-prop-value">{settlement.executorName}</span></div>
            {isRejectedEdit ? (
              <>
                <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelAccuracy')}</span><span className="si-prop-value">
                  <input type="number" className="si-inline-input si-inline-input-sm" value={editForm?.accuracy ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, accuracy: e.target.value }))} onBlur={refreshReissuePayRate} min={0} max={100} step="0.01" placeholder="-" /> %
                </span></div>
                <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelErrorCount')}</span><span className="si-prop-value">
                  <input type="number" className="si-inline-input si-inline-input-sm" value={editForm?.errorCount ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, errorCount: e.target.value }))} min={0} step={1} placeholder="-" />
                </span></div>
                <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFormErrorCount')}</span><span className="si-prop-value">
                  <input type="number" className="si-inline-input si-inline-input-sm" value={editForm?.formErrorCount ?? 0} onChange={(e) => setEditForm((f) => ({ ...f, formErrorCount: e.target.value }))} min={0} step={1} />
                </span></div>
              </>
            ) : (
              <>
                {settlement.accuracy != null && (
                  <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelAccuracy')}</span><span className="si-prop-value">{settlement.accuracy}%</span></div>
                )}
                {settlement.errorCount != null && (
                  <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelErrorCount')}</span><span className="si-prop-value">{settlement.errorCount}</span></div>
                )}
                {settlement.formErrorCount != null && (
                  <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelFormErrorCount')}</span><span className="si-prop-value">{settlement.formErrorCount}</span></div>
                )}
              </>
            )}
            {payRate != null && (
              <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelPayRate')}</span><span className="si-prop-value">{payRate}%</span></div>
            )}

            <div className="si-info-sep" />

            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelRequestDate')}</span><span className="si-prop-value si-prop-mono">{formatDate(settlement.requestedDate)}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelWorkCompleteDate')}</span><span className="si-prop-value si-prop-mono">{formatDate(settlement.workedDate)}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelCreatedAt')}</span><span className="si-prop-value si-prop-mono">{formatDate(settlement.createdAt)}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.detailModal.labelWorkDuration')}</span><span className="si-prop-value">{formatWorkTime(workDuration, workTimeMode, t)}</span></div>
            {settlement.workerRejectReason && (
              <>
                <div className="si-info-sep" />
                <div className="si-prop">
                  <span className="si-prop-label">{t('manage.settlement.detailModal.labelRejectReason')}</span>
                  <span className="si-prop-value" style={{ color: 'var(--color-danger, #e53e3e)', whiteSpace: 'pre-wrap' }}>{settlement.workerRejectReason}</span>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: invoice */}
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
                  {editForm ? (
                    <span className="si-line-value">
                      <input type="number" className="si-inline-input" value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} />
                      <span className="si-line-unit">{t('manage.settlement.detailModal.wonUnit')}</span>
                    </span>
                  ) : (
                    <span className="si-line-value si-line-readonly">{formatNumber(price)} {t('manage.settlement.detailModal.wonUnit')}</span>
                  )}
                </div>
                <div className="si-line">
                  <span className="si-line-label si-line-label-with-toggle">
                    {t('manage.settlement.detailModal.labelWorkDuration')}
                    <WorkTimeModeToggle />
                  </span>
                  {isRejectedEdit ? (
                    <span className="si-line-value">
                      <span className="si-line-minus">×</span>
                      <WorkDurationInput
                        valueMinutes={editForm?.workMinutes ?? 0}
                        mode={workTimeMode}
                        onChangeMinutes={(v) => setEditForm((f) => ({ ...f, workMinutes: v }))}
                        onBlur={refreshReissuePayRate}
                      />
                    </span>
                  ) : (
                    <span className="si-line-value si-line-readonly">× {formatWorkTime(workDuration, workTimeMode, t)}</span>
                  )}
                </div>

                <div className="si-invoice-sep-light" />

                <div className="si-line">
                  <span className="si-line-label si-line-label-sub">{t('manage.settlement.issueModal.subtotal')}</span>
                  <span className="si-line-value si-line-readonly">{subtotal.toLocaleString()} {t('manage.settlement.detailModal.wonUnit')}</span>
                </div>
                {payRate != null && (
                  <div className="si-line">
                    <span className="si-line-label si-line-label-sub">
                      {t('manage.settlement.detailModal.depreciation')} ({payRate}%)
                    </span>
                    <span className="si-line-value si-line-readonly">
                      {subtotalAfterDepr.toLocaleString()} {t('manage.settlement.detailModal.wonUnit')}
                    </span>
                  </div>
                )}
                <div className="si-line">
                  <span className="si-line-label">{t('manage.settlement.detailModal.labelPenalty')}</span>
                  {editForm ? (
                    <span className="si-line-value">
                      <span className="si-line-minus">-</span>
                      <input type="number" className="si-inline-input" value={editForm.penalty} onChange={(e) => setEditForm((f) => ({ ...f, penalty: e.target.value }))} />
                      <span className="si-line-unit">{t('manage.settlement.detailModal.wonUnit')}</span>
                    </span>
                  ) : (
                    <span className="si-line-value si-line-readonly">-{formatNumber(penalty)} {t('manage.settlement.detailModal.wonUnit')}</span>
                  )}
                </div>
                {isAdmin() && (
                  <div className="si-line">
                    <span className="si-line-label">{t('manage.settlement.detailModal.labelTaxRate')}</span>
                    {editForm ? (
                      <span className="si-line-value">
                        <input type="number" className="si-inline-input si-inline-input-sm" value={editForm.taxRate} onChange={(e) => setEditForm((f) => ({ ...f, taxRate: e.target.value }))} step="0.1" />
                        <span className="si-line-unit">%</span>
                      </span>
                    ) : (
                      <span className="si-line-value si-line-readonly">{taxRate}%</span>
                    )}
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

        {/* Footer */}
        <div className="notion-modal-footer">
          {status === 'ISSUED' && !isMulti && (
            <>
              <button className="btn-primary" onClick={handleExecute} disabled={processing}>
                {processing ? t('manage.settlement.detailModal.executing') : t('manage.settlement.detailModal.execute')}
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={processing}>
                {processing ? t('manage.common.processing') : t('manage.settlement.detailModal.cancelIssue')}
              </button>
            </>
          )}
          {status === 'ISSUED' && isMulti && (
            <>
              <button className="btn-primary" onClick={handleBatchExecute} disabled={processing}>
                {processing ? t('manage.settlement.detailModal.executing') : t('manage.settlement.statusPanel.batchExecute', { count: total })}
              </button>
              <button className="btn-danger" onClick={handleBatchDelete} disabled={processing}>
                {processing ? t('manage.common.processing') : t('manage.settlement.statusPanel.batchCancelIssue', { count: total })}
              </button>
            </>
          )}
          {status === 'REJECTED' && isRejectedEdit && (
            <button className="btn-primary" onClick={handleReissue} disabled={processing}>
              {processing ? t('manage.common.processing') : t('manage.settlement.detailModal.reissue')}
            </button>
          )}
          {status === 'WAITING_CONFIRM' && !isMulti && (
            <>
              {isAdmin() && (
                <button
                  className="btn-secondary"
                  onClick={handleSendAlimtalk}
                  disabled={processing || settlement.isMessageSent}
                >
                  {processing
                    ? t('manage.settlement.detailModal.sendingAlimtalk')
                    : settlement.isMessageSent
                      ? t('manage.settlement.detailModal.alimtalkAlreadySent')
                      : t('manage.settlement.detailModal.sendAlimtalk')}
                </button>
              )}
              <button className="btn-primary" onClick={handleConfirm} disabled={processing}>
                {processing ? t('manage.common.processing') : t('manage.settlement.detailModal.confirmDone')}
              </button>
              <button className="btn-danger" onClick={handleRejectClick} disabled={processing}>
                {processing ? t('manage.common.processing') : t('manage.settlement.detailModal.reject')}
              </button>
            </>
          )}
          {status === 'WAITING_CONFIRM' && isMulti && (
            <button className="btn-primary" onClick={handleBatchConfirm} disabled={processing}>
              {processing ? t('manage.common.processing') : t('manage.settlement.statusPanel.batchConfirm', { count: total })}
            </button>
          )}
          {status === 'WAITING_PAYMENT' && !isMulti && (
            <>
              {isPaymentRevertEdit && (
                <button className="btn-secondary" onClick={handleRevertPayment} disabled={processing}>
                  {processing ? t('manage.common.processing') : t('manage.settlement.detailModal.revertPayment')}
                </button>
              )}
              <button className="btn-primary" onClick={handlePaid} disabled={processing}>
                {processing ? t('manage.common.processing') : t('manage.settlement.detailModal.paymentComplete')}
              </button>
            </>
          )}
          {status === 'WAITING_PAYMENT' && isMulti && (
            <button className="btn-primary" onClick={handleBatchPaid} disabled={processing}>
              {processing ? t('manage.common.processing') : t('manage.settlement.statusPanel.batchPaid', { count: total })}
            </button>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={processing}>
            {t('manage.settlement.detailModal.close')}
          </button>
        </div>
      </div>
      {rejectReasonOpen && (
        <div className="notion-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.settlement.detailModal.rejectReasonTitle')}</h3>
              <button className="notion-modal-close" onClick={() => !processing && setRejectReasonOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <textarea
                style={{ width: '100%', minHeight: '100px', resize: 'vertical', padding: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('manage.settlement.detailModal.rejectReasonPlaceholder')}
                autoFocus
              />
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setRejectReasonOpen(false)} disabled={processing}>
                {t('manage.common.cancel')}
              </button>
              <button className="btn-danger" onClick={handleRejectConfirm} disabled={processing}>
                {processing ? t('manage.common.processing') : t('manage.settlement.detailModal.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
