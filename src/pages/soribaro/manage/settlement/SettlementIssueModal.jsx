import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { calculatePrice } from '../../../../api/v9/priceCalculation';
import { createSettlement, previewSettlementPay } from '../../../../api/v9/settlement';
import { updateProjectFileEvaluationMetrics } from '../../../../api/v9/projectFileEvaluations';
import { toast } from '../../../../stores/toastStore';
import { useUserStore } from '../../../../stores/userStore';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';
import { useSettlementUiStore } from '../../../../stores/settlementUiStore';
import projectTypes from '../../../../constants/projectTypes.json';
import WorkDurationInput from './WorkDurationInput';
import WorkTimeModeToggle from './WorkTimeModeToggle';
import './SettlementIssueModal.css';

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
};

const formatDuration = (seconds, t) => {
  if (seconds == null) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (t) return `${m}${t('common.minuteUnit')} ${s < 10 ? '0' : ''}${s}${t('common.secondUnit')}`;
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
};

const formatSplitRange = (item, t) => {
  if (!item.isSplit) return null;
  return `${formatDuration(item.startSec, t)} ~ ${formatDuration(item.endSec, t)}`;
};

// 스플릿 파일의 경우 id만으로 고유하지 않을 수 있으므로 복합키 사용
const itemKey = (item) =>
  `${item.id}_${item.fileNo}_${item.startSec ?? ''}_${item.endSec ?? ''}`;

const calcWorkMinutes = (item) => {
  const seconds = item.workTime ?? item.duration;
  if (seconds == null || seconds <= 0) return 0;
  return Math.round(seconds / 60);
};

const calcPay = (price, workMinutes, penalty, taxRate, payRate = null) => {
  const rate = payRate != null ? Number(payRate) : 100;
  const subtotal = price * workMinutes * rate / 100;
  const afterPenalty = subtotal - penalty;
  const result = Math.round(afterPenalty - (afterPenalty * taxRate / 100));
  return result < 0 ? 0 : result;
};

function InvoiceSection({ label, id, levelName, form, disabled, accuracy, onToggle, onFormChange, onFormBlur, onAutoCalc, workMinutes, onWorkMinutesChange, onWorkMinutesBlur, workTimeMode, t }) {
  const prefix = label === 'worker' ? 'worker' : 'checker';
  const pay = Number(form[`${prefix}Pay`]) || 0;
  const penalty = Number(form[`${prefix}Penalty`]) || 0;
  const taxRate = Number(form[`${prefix}TaxRate`]) || 0;
  const payRate = form[`_${prefix}PayRate`];
  const subtotalBase = pay * workMinutes;
  const subtotalAfterDepr = payRate != null
    ? Math.round(subtotalBase * Number(payRate) / 100)
    : subtotalBase;
  const afterPenalty = subtotalAfterDepr - penalty;
  const tax = Math.round(afterPenalty * taxRate / 100);
  const totalRaw = afterPenalty - tax;
  const total = totalRaw < 0 ? 0 : totalRaw;
  const isChecker = label === 'checker';

  return (
    <div className={`si-invoice${disabled ? ' si-invoice-disabled' : ''}`}>
      <div className="si-invoice-head">
        {isChecker && (
          <label className="si-toggle">
            <input type="checkbox" checked={!disabled} onChange={(e) => onToggle(e.target.checked)} />
            <span className="si-toggle-track"><span className="si-toggle-thumb" /></span>
          </label>
        )}
        <span className="si-invoice-role">{isChecker ? t('manage.settlement.issueModal.checker') : t('manage.settlement.issueModal.worker')}</span>
        <span className="si-invoice-id">{id || 'unknown'}</span>
        {levelName && <span className="si-badge">{levelName}</span>}
      </div>

      <div className="si-invoice-sep" />

      <div className="si-invoice-lines">
        <div className="si-line">
          <span className="si-line-label">{t('manage.settlement.issueModal.unitPrice')}</span>
          <span className="si-line-value">
            <input type="number" className="si-inline-input" disabled={disabled} value={form[`${prefix}Pay`]} onChange={(e) => onFormChange(`${prefix}Pay`, e.target.value)} onBlur={() => onFormBlur(`${prefix}Pay`)} placeholder="0" />
            <span className="si-line-unit">{t('manage.settlement.issueModal.wonUnit')}</span>
            <button className="si-line-auto" type="button" disabled={disabled} onClick={() => onAutoCalc(label)} title={t('manage.settlement.issueModal.autoCalc')}><RotateCcw size={11} /></button>
          </span>
        </div>
        <div className="si-line">
          <span className="si-line-label si-line-label-with-toggle">
            {t('manage.settlement.issueModal.labelWorkDuration')}
            <WorkTimeModeToggle />
          </span>
          <span className="si-line-value">
            <span className="si-line-minus">×</span>
            <WorkDurationInput
              valueMinutes={workMinutes}
              mode={workTimeMode}
              onChangeMinutes={onWorkMinutesChange}
              onBlur={onWorkMinutesBlur}
              disabled={disabled}
            />
          </span>
        </div>

        <div className="si-invoice-sep-light" />

        <div className="si-line">
          <span className="si-line-label si-line-label-sub">{t('manage.settlement.issueModal.subtotal')}</span>
          <span className="si-line-value si-line-readonly">{subtotalBase.toLocaleString()} {t('manage.settlement.issueModal.wonUnit')}</span>
        </div>
        {accuracy != null && (
          <div className="si-line">
            <span className="si-line-label si-line-label-sub">
              {payRate != null
                ? `${t('manage.settlement.issueModal.depreciation')} (${Number(payRate)}%)`
                : `${t('manage.settlement.issueModal.depreciation')} (${t('manage.settlement.issueModal.depreciationNotFound')})`}
            </span>
            <span className="si-line-value si-line-readonly">
              {subtotalAfterDepr.toLocaleString()} {t('manage.settlement.issueModal.wonUnit')}
            </span>
          </div>
        )}
        <div className="si-line">
          <span className="si-line-label">{t('manage.settlement.issueModal.penalty')}</span>
          <span className="si-line-value">
            <span className="si-line-minus">-</span>
            <input type="number" className="si-inline-input" disabled={disabled} value={form[`${prefix}Penalty`]} onChange={(e) => onFormChange(`${prefix}Penalty`, e.target.value)} onBlur={() => onFormBlur(`${prefix}Penalty`)} placeholder="0" />
            <span className="si-line-unit">{t('manage.settlement.issueModal.wonUnit')}</span>
          </span>
        </div>
        <div className="si-line">
          <span className="si-line-label">{t('manage.settlement.issueModal.taxRate')}</span>
          <span className="si-line-value">
            <input type="number" className="si-inline-input si-inline-input-sm" disabled={disabled} value={form[`${prefix}TaxRate`]} onChange={(e) => onFormChange(`${prefix}TaxRate`, e.target.value)} onBlur={() => onFormBlur(`${prefix}TaxRate`)} placeholder="3.3" step="0.1" />
            <span className="si-line-unit">%</span>
          </span>
        </div>
        <div className="si-line">
          <span className="si-line-label si-line-label-sub">{t('manage.settlement.issueModal.taxAmount')}</span>
          <span className="si-line-value si-line-readonly">-{tax.toLocaleString()} {t('manage.settlement.issueModal.wonUnit')}</span>
        </div>

        <div className="si-invoice-sep" />

        <div className="si-line si-line-total">
          <span className="si-line-label">{t('manage.settlement.issueModal.finalAmount')}</span>
          <span className="si-line-value si-line-total-value">{total.toLocaleString()} <small>{t('manage.settlement.issueModal.wonUnit')}</small></span>
        </div>
      </div>
    </div>
  );
}

const defaultForm = {
  workMinutes: 0,
  workerPay: 0, workerPenalty: 0, workerTaxRate: 0,
  checkerEnabled: false, checkerPay: 0, checkerPenalty: 0, checkerTaxRate: 0,
  accuracy: '', errorCount: '', formErrorCount: 0,
  _workerLevelName: null, _workerLevelId: null,
  _checkerLevelName: null, _checkerLevelId: null,
  _workerPayRate: null, _checkerPayRate: null,
};

const toNullableNumber = (v) => (v === '' || v == null ? null : Number(v));

export default function SettlementIssueModal({ open, items = [], onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [formDataMap, setFormDataMap] = useState({});
  const [issuing, setIssuing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const batchIdRef = useRef(0);

  const user = useUserStore((s) => s.user);
  const getCodeLabel = useCommonCodeStore((s) => s.getCodeLabel);
  const workTimeMode = useSettlementUiStore((s) => s.workTimeDisplayMode);

  useEffect(() => {
    if (!open || items.length === 0) return;
    setCurrentIndex(0);
    setFormDataMap({});
    setInitialLoading(true);

    const batchId = ++batchIdRef.current;

    (async () => {
      const workerResults = await Promise.allSettled(
        items.map((item) =>
          calculatePrice({ fileNo: item.fileNo, servCd: item.servCd, bssType: item.bssType, workerId: item.workerId, role: 'WORKER' })
        )
      );

      const checkerResults = await Promise.allSettled(
        items.map((item) =>
          item.checkerId
            ? calculatePrice({ fileNo: item.fileNo, servCd: item.servCd, bssType: item.bssType, workerId: item.checkerId, role: 'CHECKER' })
            : Promise.resolve(null)
        )
      );

      if (batchId !== batchIdRef.current) return;

      const newFormDataMap = {};
      workerResults.forEach((result, i) => {
        const item = items[i];
        const key = itemKey(item);
        let workerPay = 0, workerLevelName = null, workerLevelId = null;

        if (result.status === 'fulfilled' && result.value?.status === 'SUCCESS') {
          const data = result.value.data;
          workerPay = data.pricePerMinute;
          workerLevelName = data.workerLevelName;
          workerLevelId = data.workerLevelId;
        } else {
          const msg = result.status === 'fulfilled' ? result.value?.message : result.reason?.message;
          toast.error(msg || t('manage.settlement.issueModal.toastWorkerPriceFailed'));
        }

        let checkerEnabled = false, checkerPay = 0, checkerLevelName = null, checkerLevelId = null;

        if (item.checkerId) {
          const cResult = checkerResults[i];
          if (cResult.status === 'fulfilled' && cResult.value?.status === 'SUCCESS') {
            const cData = cResult.value.data;
            checkerEnabled = true;
            checkerPay = cData.pricePerMinute;
            checkerLevelName = cData.workerLevelName;
            checkerLevelId = cData.workerLevelId;
          }
        }

        newFormDataMap[key] = {
          ...defaultForm,
          workMinutes: calcWorkMinutes(item),
          accuracy: item.accuracy ?? '',
          errorCount: item.errorCount ?? '',
          formErrorCount: item.formErrorCount ?? 0,
          workerPay,
          _workerLevelName: workerLevelName,
          _workerLevelId: workerLevelId,
          checkerEnabled,
          checkerPay,
          _checkerLevelName: checkerLevelName,
          _checkerLevelId: checkerLevelId,
        };
      });

      setFormDataMap(newFormDataMap);
      setInitialLoading(false);

      // 감가 미리보기 — accuracy가 있는 항목만, 실패해도 발행 흐름 차단하지 않음
      const previewPromises = items.map((item) => {
        if (item.accuracy == null || !item.bssType) return Promise.resolve(null);
        const form = newFormDataMap[itemKey(item)];
        const workMinutes = Number(form?.workMinutes) || 0;
        const workerPreview = form?.workerPay
          ? previewSettlementPay({
              bssType: item.bssType,
              price: Number(form.workerPay) || 0,
              workDuration: workMinutes,
              penalty: 0,
              taxRate: 0,
              accuracy: item.accuracy,
            })
          : Promise.resolve(null);
        return workerPreview.then((w) => ({ key: itemKey(item), w }));
      });

      const previewResults = await Promise.allSettled(previewPromises);
      if (batchId !== batchIdRef.current) return;

      setFormDataMap((prev) => {
        const next = { ...prev };
        previewResults.forEach((r) => {
          if (r.status !== 'fulfilled' || !r.value) return;
          const { key, w } = r.value;
          const cur = next[key];
          if (!cur) return;
          const workerPayRate = (w?.status === 'SUCCESS' && w.data?.depreciationApplied) ? w.data.payRate : null;
          next[key] = { ...cur, _workerPayRate: workerPayRate };
        });
        return next;
      });
    })();
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const currentItem = items[currentIndex] || null;
  const total = items.length;
  const currentKey = currentItem ? itemKey(currentItem) : null;
  const currentForm = (currentKey && formDataMap[currentKey]) || defaultForm;

  const fetchCheckerPrice = useCallback(async () => {
    if (!currentItem || !currentKey) return;
    try {
      const res = await calculatePrice({ fileNo: currentItem.fileNo, servCd: currentItem.servCd, bssType: currentItem.bssType, workerId: currentItem.checkerId });
      if (res?.status === 'SUCCESS') {
        const data = res.data;
        setFormDataMap((prev) => ({
          ...prev,
          [currentKey]: {
            ...(prev[currentKey] || defaultForm),
            checkerEnabled: true,
            checkerPay: data.pricePerMinute,
            _checkerLevelName: data.workerLevelName,
            _checkerLevelId: data.workerLevelId,
            _checkerPayRate: null,
          },
        }));
      } else toast.error(res?.message || t('manage.settlement.issueModal.toastCheckerPriceFailed'));
    } catch (err) { toast.error(err.message || t('manage.settlement.issueModal.toastCheckerPriceFailed')); }
  }, [currentItem, currentKey]);

  const handleFormChange = useCallback((field, value) => {
    if (field === 'checkerEnabled' && value === true) {
      const form = (currentKey && formDataMap[currentKey]) || defaultForm;
      if (!form.checkerPay) { fetchCheckerPrice(); return; }
    }
    setFormDataMap((prev) => ({
      ...prev,
      [currentKey]: { ...(prev[currentKey] || defaultForm), [field]: value },
    }));
  }, [currentKey, formDataMap, fetchCheckerPrice]);

  const handleFormBlur = useCallback((field) => {
    setFormDataMap((prev) => {
      const cur = prev[currentKey] || defaultForm;
      if (cur[field] === '' || cur[field] == null) return { ...prev, [currentKey]: { ...cur, [field]: 0 } };
      return prev;
    });
  }, [currentKey]);

  const handleWorkMinutesChange = useCallback((value) => {
    setFormDataMap((prev) => ({
      ...prev,
      [currentKey]: { ...(prev[currentKey] || defaultForm), workMinutes: value },
    }));
  }, [currentKey]);

  const handleWorkMinutesBlur = useCallback(() => {
    setFormDataMap((prev) => {
      const cur = prev[currentKey] || defaultForm;
      const val = Number(cur.workMinutes);
      if (!val || val < 0) return { ...prev, [currentKey]: { ...cur, workMinutes: 0 } };
      return { ...prev, [currentKey]: { ...cur, workMinutes: Math.round(val) } };
    });
  }, [currentKey]);

  const handleAccuracyBlur = useCallback(async () => {
    let clamped = null;
    setFormDataMap((prev) => {
      const cur = prev[currentKey] || defaultForm;
      if (cur.accuracy === '' || cur.accuracy == null) return prev;
      const num = Number(cur.accuracy);
      clamped = Math.round(Math.min(100, Math.max(0, isNaN(num) ? 0 : num)) * 100) / 100;
      return { ...prev, [currentKey]: { ...cur, accuracy: clamped } };
    });

    if (clamped == null || !currentItem?.bssType) return;
    const form = (currentKey && formDataMap[currentKey]) || defaultForm;
    if (!form.workerPay) return;
    try {
      const w = await previewSettlementPay({
        bssType: currentItem.bssType,
        price: Number(form.workerPay) || 0,
        workDuration: Number(form.workMinutes) || 0,
        penalty: 0,
        taxRate: 0,
        accuracy: clamped,
      });
      const workerPayRate = (w?.status === 'SUCCESS' && w.data?.depreciationApplied) ? w.data.payRate : null;
      setFormDataMap((prev) => ({
        ...prev,
        [currentKey]: { ...(prev[currentKey] || defaultForm), _workerPayRate: workerPayRate },
      }));
    } catch { /* 미리보기 실패는 발행 흐름을 막지 않음 */ }
  }, [currentKey, currentItem, formDataMap]);

  const handleEvalCountBlur = useCallback((field) => {
    setFormDataMap((prev) => {
      const cur = prev[currentKey] || defaultForm;
      if (cur[field] === '' || cur[field] == null) return prev;
      const num = Math.max(0, Math.floor(Number(cur[field]) || 0));
      return { ...prev, [currentKey]: { ...cur, [field]: num } };
    });
  }, [currentKey]);

  const handleAutoCalcPrice = useCallback(async (role) => {
    if (!currentItem) return;
    const workerId = role === 'worker' ? currentItem.workerId : currentItem.checkerId;
    try {
      const res = await calculatePrice({ fileNo: currentItem.fileNo, servCd: currentItem.servCd, bssType: currentItem.bssType, workerId });
      if (res?.status === 'SUCCESS') handleFormChange(role === 'worker' ? 'workerPay' : 'checkerPay', res.data.pricePerMinute);
      else toast.error(res?.message || t('manage.settlement.issueModal.toastPriceFetchFailed'));
    } catch (err) { toast.error(err.message || t('manage.settlement.issueModal.toastPriceFetchFailed')); }
  }, [currentItem, handleFormChange]);

  const validationErrors = useMemo(() => {
    if (initialLoading) return {};
    const errors = {};
    items.forEach((item, i) => {
      const form = formDataMap[itemKey(item)] || defaultForm;
      const itemErrors = [];

      if (!item.workerId) itemErrors.push('workerIdMissing');
      const hasWorkerLevel = item.workerLevelName || item.workerLevelId || form._workerLevelName || form._workerLevelId;
      if (!hasWorkerLevel) itemErrors.push('workerLevelMissing');
      if (Number(form.workMinutes) <= 0) itemErrors.push('workDurationZero');
      if (!item.fileNo || !item.servCd || !item.bssType || !item.id) itemErrors.push('requiredFieldMissing');
      if (Number(form.workerPay) <= 0) itemErrors.push('workerPriceZero');

      if (form.checkerEnabled) {
        const hasCheckerLevel = item.checkerLevelName || item.checkerLevelId || form._checkerLevelName || form._checkerLevelId;
        if (!hasCheckerLevel) itemErrors.push('checkerLevelMissing');
        if (Number(form.checkerPay) <= 0) itemErrors.push('checkerPriceZero');
      }

      if (itemErrors.length > 0) errors[i] = itemErrors;
    });
    return errors;
  }, [items, formDataMap, initialLoading]);

  const hasErrors = Object.keys(validationErrors).length > 0;
  const errorItemCount = Object.keys(validationErrors).length;

  const handleIssue = useCallback(async () => {
    if (!user) { toast.error(t('manage.settlement.issueModal.toastLoginRequired')); return; }
    setIssuing(true);
    let successCount = 0, failCount = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const form = formDataMap[itemKey(item)] || defaultForm;
        const workMinutes = Number(form.workMinutes) || 0;
        const bssTypeName = item.bssTypeName || getCodeLabel('BSS_TYPE', item.bssType) || item.bssType;

        const effAccuracy = toNullableNumber(form.accuracy);
        const effErrorCount = toNullableNumber(form.errorCount);
        const effFormErrorCount = Number(form.formErrorCount) || 0;

        const metricsChanged =
          effAccuracy !== toNullableNumber(item.accuracy) ||
          effErrorCount !== toNullableNumber(item.errorCount) ||
          effFormErrorCount !== (Number(item.formErrorCount) || 0);
        if (metricsChanged) {
          if (effAccuracy == null || effErrorCount == null) {
            failCount++;
            toast.error(t('manage.settlement.issueModal.toastEvalUpdateFailed', { fileNo: item.fileNo, message: t('manage.settlement.issueModal.evalValueMissing') }));
            continue;
          }
          try {
            const er = await updateProjectFileEvaluationMetrics(item.projectFileId || item.id, {
              accuracy: effAccuracy,
              errorCount: effErrorCount,
              formErrorCount: effFormErrorCount,
              updatedBy: String(user.membNo),
            });
            if (er?.status !== 'SUCCESS') {
              failCount++;
              toast.error(t('manage.settlement.issueModal.toastEvalUpdateFailed', { fileNo: item.fileNo, message: er?.message || t('manage.settlement.issueModal.toastUnknownError') }));
              continue;
            }
          } catch (err) {
            failCount++;
            toast.error(t('manage.settlement.issueModal.toastEvalUpdateFailed', { fileNo: item.fileNo, message: err.message }));
            continue;
          }
        }

        const basePayload = { fileNo: item.fileNo, servCd: item.servCd, bssType: item.bssType, workDuration: workMinutes, projectFileId: item.projectFileId || item.id, executorId: String(user.membNo), executorName: user.membNm, fileName: item.fileNm, servTitle: item.servTitle, projectTitle: item.projectTitle || item.title, fileDifficultName: item.fileDifficultName, bssTypeName, accuracy: effAccuracy, errorCount: effErrorCount, formErrorCount: effFormErrorCount, requestedDate: item.requestedDate ?? null, workedDate: item.workedDate ?? null };
        const wP = Number(form.workerPay) || 0, wPn = Number(form.workerPenalty) || 0, wT = Number(form.workerTaxRate) || 0;
        const wPR = form._workerPayRate;
        try {
          const r = await createSettlement({ ...basePayload, workerId: item.workerId, workerName: item.workerName || item.workerId, workerLevelName: item.workerLevelName || form._workerLevelName, price: wP, penalty: wPn, pay: calcPay(wP, workMinutes, wPn, wT, wPR), taxRate: wT });
          if (r?.status === 'SUCCESS') successCount++; else { failCount++; toast.error(t('manage.settlement.issueModal.toastWorkerIssueFailed', { fileNo: item.fileNo, message: r?.message || t('manage.settlement.issueModal.toastUnknownError') })); }
        } catch (err) { failCount++; toast.error(t('manage.settlement.issueModal.toastWorkerIssueFailed', { fileNo: item.fileNo, message: err.message })); }
        if (form.checkerEnabled) {
          const cP = Number(form.checkerPay) || 0, cPn = Number(form.checkerPenalty) || 0, cT = Number(form.checkerTaxRate) || 0;
          const cPR = form._checkerPayRate;
          try {
            const r = await createSettlement({ ...basePayload, workerId: item.checkerId, workerName: item.checkerName || item.checkerId, workerLevelName: item.checkerLevelName || form._checkerLevelName, price: cP, penalty: cPn, pay: calcPay(cP, workMinutes, cPn, cT, cPR), taxRate: cT });
            if (r?.status === 'SUCCESS') successCount++; else { failCount++; toast.error(t('manage.settlement.issueModal.toastCheckerIssueFailed', { fileNo: item.fileNo, message: r?.message || t('manage.settlement.issueModal.toastUnknownError') })); }
          } catch (err) { failCount++; toast.error(t('manage.settlement.issueModal.toastCheckerIssueFailed', { fileNo: item.fileNo, message: err.message })); }
        }
      }
      if (failCount === 0) { toast.success(t('manage.settlement.issueModal.toastIssueSuccess', { count: successCount })); onSuccess?.(); onClose(); }
      else toast.error(t('manage.settlement.issueModal.toastIssueResult', { success: successCount, fail: failCount }));
    } finally { setIssuing(false); }
  }, [items, formDataMap, user, getCodeLabel, onSuccess, onClose]);

  if (!open) return null;

  if (!currentItem) {
    return (
      <div className="notion-modal-overlay" onClick={onClose}>
        <div className="notion-modal si-modal" onClick={(e) => e.stopPropagation()}>
          <div className="notion-modal-header">
            <h3>{t('manage.settlement.issueModal.title')}</h3>
            <button className="notion-modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="notion-modal-body"><p>{t('manage.settlement.issueModal.noItems')}</p></div>
          <div className="notion-modal-footer"><button className="btn-ghost" onClick={onClose}>{t('manage.common.close')}</button></div>
        </div>
      </div>
    );
  }

  const splitRange = formatSplitRange(currentItem, t);

  return (
    <div className="notion-modal-overlay" onClick={onClose}>
      <div className="notion-modal si-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-header si-header">
          <h3>{t('manage.settlement.issueModal.title')}</h3>
          <div className="si-nav">
            <button className="si-nav-btn" disabled={currentIndex <= 0} onClick={() => setCurrentIndex((p) => p - 1)}><ChevronLeft size={14} /></button>
            <span className={`si-nav-label${!initialLoading && validationErrors[currentIndex] ? ' si-nav-label-error' : ''}`}>{currentIndex + 1} / {total}</span>
            <button className="si-nav-btn" disabled={currentIndex >= total - 1} onClick={() => setCurrentIndex((p) => p + 1)}><ChevronRight size={14} /></button>
            {!initialLoading && hasErrors && <span className="si-nav-error-badge"><AlertTriangle size={11} /> {t('manage.settlement.issueModal.validation.errorCount', { count: errorItemCount })}</span>}
          </div>
          <button className="notion-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="notion-modal-body si-body">
          <div className="si-info">
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelProjectTitle')}</span><span className="si-prop-value">{currentItem.projectTitle || currentItem.title}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelServiceName')}</span><span className="si-prop-value">{currentItem.servTitle}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelEntNm')}</span><span className="si-prop-value">{currentItem.entNm || '-'}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelServCd')}</span><span className="si-prop-value si-prop-mono">{currentItem.servCd}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelFileNo')}</span><span className="si-prop-value si-prop-mono">{currentItem.fileNo}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelFileName')}</span><span className="si-prop-value">{currentItem.fileNm}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelWorkType')}</span><span className="si-prop-value">{getCodeLabel('BSS_TYPE', currentItem.bssType)}</span></div>
            {currentItem.fileDifficultName && (
              <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelFileDifficulty')}</span><span className="si-prop-value">{currentItem.fileDifficultName}</span></div>
            )}
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelRequester')}</span><span className="si-prop-value">{currentItem.requestMemberName}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelAccuracy')}</span><span className="si-prop-value si-prop-edit">
              <input type="number" className="si-inline-input si-prop-eval-input" value={currentForm.accuracy} onChange={(e) => handleFormChange('accuracy', e.target.value)} onBlur={handleAccuracyBlur} min={0} max={100} step="0.01" placeholder="-" />
              <span className="si-prop-unit">%</span>
            </span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelErrorCount')}</span><span className="si-prop-value si-prop-edit">
              <input type="number" className="si-inline-input si-prop-eval-input" value={currentForm.errorCount} onChange={(e) => handleFormChange('errorCount', e.target.value)} onBlur={() => handleEvalCountBlur('errorCount')} min={0} step={1} placeholder="-" />
            </span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelFormErrorCount')}</span><span className="si-prop-value si-prop-edit">
              <input type="number" className="si-inline-input si-prop-eval-input" value={currentForm.formErrorCount} onChange={(e) => handleFormChange('formErrorCount', e.target.value)} onBlur={() => handleEvalCountBlur('formErrorCount')} min={0} step={1} />
            </span></div>

            <div className="si-info-sep" />

            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelRequestDate')}</span><span className="si-prop-value si-prop-mono">{formatDateTime(currentItem.requestedDate)}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelWorkCompleteDate')}</span><span className="si-prop-value si-prop-mono">{formatDateTime(currentItem.workedDate)}</span></div>
            <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelVideoLength')}</span><span className="si-prop-value">{formatDuration(currentItem.duration, t)}</span></div>
            {splitRange && (
              <div className="si-prop"><span className="si-prop-label">{t('manage.settlement.issueModal.labelSplitRange')}</span><span className="si-prop-value">{splitRange}</span></div>
            )}
          </div>

          <div className="si-right">
            {initialLoading ? (
              <div className="si-loading">
                <Loader2 size={20} className="si-loading-spinner" />
                <span>{t('manage.settlement.issueModal.loadingPrices')}</span>
              </div>
            ) : (
              <>
                <InvoiceSection
                  label="worker"
                  id={currentItem.workerId}
                  levelName={currentItem.workerLevelName || currentForm._workerLevelName}
                  form={currentForm}
                  disabled={false}
                  accuracy={toNullableNumber(currentForm.accuracy)}
                  onFormChange={handleFormChange}
                  onFormBlur={handleFormBlur}
                  onAutoCalc={handleAutoCalcPrice}
                  workMinutes={currentForm.workMinutes}
                  onWorkMinutesChange={handleWorkMinutesChange}
                  onWorkMinutesBlur={handleWorkMinutesBlur}
                  workTimeMode={workTimeMode}
                  t={t}
                />
                {currentItem.checkerId && (
                  <InvoiceSection
                    label="checker"
                    id={currentItem.checkerId}
                    levelName={currentItem.checkerLevelName || currentForm._checkerLevelName}
                    form={currentForm}
                    disabled={!currentForm.checkerEnabled}
                    accuracy={null}
                    onToggle={(checked) => handleFormChange('checkerEnabled', checked)}
                    onFormChange={handleFormChange}
                    onFormBlur={handleFormBlur}
                    onAutoCalc={handleAutoCalcPrice}
                    workMinutes={currentForm.workMinutes}
                    onWorkMinutesChange={handleWorkMinutesChange}
                    onWorkMinutesBlur={handleWorkMinutesBlur}
                    workTimeMode={workTimeMode}
                    t={t}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {!initialLoading && hasErrors && (
          <div className="si-validation-banner">
            <AlertTriangle size={14} />
            {validationErrors[currentIndex] ? (
              <ul className="si-validation-list">
                {validationErrors[currentIndex].map((err) => (
                  <li key={err}>{t(`manage.settlement.issueModal.validation.${err}`)}</li>
                ))}
              </ul>
            ) : (
              <span>{t('manage.settlement.issueModal.validation.otherItemsHaveErrors', { count: errorItemCount })}</span>
            )}
          </div>
        )}

        <div className="notion-modal-footer">
          <button className="btn-primary" onClick={handleIssue} disabled={initialLoading || issuing || hasErrors}>
            {initialLoading ? t('manage.settlement.issueModal.loadingPrices') : issuing ? t('manage.settlement.issueModal.issuing') : t('manage.settlement.issueModal.issueAll', { count: total })}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={issuing}>{t('manage.common.close')}</button>
        </div>
      </div>
    </div>
  );
}
