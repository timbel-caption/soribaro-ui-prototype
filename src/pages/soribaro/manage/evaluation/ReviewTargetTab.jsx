import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { getWorkerStatistics, getWorkerMonthlyDetails, createPromotionSchedule, searchPromotionSchedules } from '../../../../api/v9/promotionSchedules';
import { getWorkerLevels } from '../../../../api/v9/workerLevels';
import { useUserStore } from '../../../../stores/userStore';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../../components/common/Toast';
import '../../../../styles/notion-list.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const meetsLevelCriteria = (accuracyAvg, errorCountAvg, level) => {
  const accOk = level.accuracyAvgLevel == null || accuracyAvg >= level.accuracyAvgLevel;
  const errOk = level.errorCountAvgLevel == null || errorCountAvg <= level.errorCountAvgLevel;
  return accOk && errOk;
};

const parsePrimaryLevelId = (workerLevel) => {
  if (typeof workerLevel === 'number') return workerLevel;
  if (typeof workerLevel === 'string') {
    const first = workerLevel.split(',').map((v) => v.trim()).find(Boolean);
    const parsed = Number(first);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isEvaluationLevel = (level) =>
  level.accuracyAvgLevel != null || level.errorCountAvgLevel != null;

const meetsWorkingTimeCriteria = (totalWorkingTime, level) =>
  level.workingTime == null || (totalWorkingTime != null && totalWorkingTime >= level.workingTime);

const formatWorkingTime = (seconds) => {
  if (seconds == null) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// 등급 서열은 id 순서가 아니라 기준 강도 순으로 정렬한다.
// (H/회의록은 Pro→Elite→Rookie 순서로 생성되어 id 정렬이 서열 역순 — Pro의 "다음 등급"이 Elite로 잡히는 버그가 있었음)
// 정확도 기준 오름차순(기준 낮음 = 하위 등급), 동률이면 허용 오류 내림차순(허용 오류 많음 = 하위 등급).
const rankSortEvalLevels = (levels) =>
  [...levels].sort((a, b) => {
    const accA = a.accuracyAvgLevel ?? -1;
    const accB = b.accuracyAvgLevel ?? -1;
    if (accA !== accB) return accA - accB;
    const errA = a.errorCountAvgLevel ?? Number.POSITIVE_INFINITY;
    const errB = b.errorCountAvgLevel ?? Number.POSITIVE_INFINITY;
    return errB - errA;
  });

const getEvalLevelsForRow = (row, sortedLevels) =>
  rankSortEvalLevels(sortedLevels.filter((l) => isEvaluationLevel(l) && l.bssType === row.bssType));

const getReviewResult = (row, sortedLevels) => {
  const evalLevels = getEvalLevelsForRow(row, sortedLevels);
  if (!evalLevels.length || row.accuracyAvg == null || row.errorCountAvg == null) return 'maintain';

  const currentLevelId = parsePrimaryLevelId(row.workerLevel);
  const currentIdx = evalLevels.findIndex((l) => l.id === currentLevelId);
  if (currentIdx === -1) return 'maintain';

  const nextLevel = evalLevels[currentIdx + 1];
  if (nextLevel && meetsLevelCriteria(row.accuracyAvg, row.errorCountAvg, nextLevel)
      && meetsWorkingTimeCriteria(row.totalWorkingTime, nextLevel)) {
    return 'promote';
  }

  const currentLevel = evalLevels[currentIdx];
  if (!meetsLevelCriteria(row.accuracyAvg, row.errorCountAvg, currentLevel) && currentIdx > 0) {
    return 'demote';
  }

  return 'maintain';
};

const getExpectedLevel = (row, sortedLevels) => {
  const evalLevels = getEvalLevelsForRow(row, sortedLevels);
  if (!evalLevels.length || row.accuracyAvg == null || row.errorCountAvg == null) return row.workerLevelName ?? '-';

  const currentLevelId = parsePrimaryLevelId(row.workerLevel);
  const currentIdx = evalLevels.findIndex((l) => l.id === currentLevelId);
  if (currentIdx === -1) return row.workerLevelName ?? '-';

  const nextLevel = evalLevels[currentIdx + 1];
  if (nextLevel && meetsLevelCriteria(row.accuracyAvg, row.errorCountAvg, nextLevel)
      && meetsWorkingTimeCriteria(row.totalWorkingTime, nextLevel)) {
    return nextLevel.levelName;
  }

  const currentLevel = evalLevels[currentIdx];
  if (!meetsLevelCriteria(row.accuracyAvg, row.errorCountAvg, currentLevel) && currentIdx > 0) {
    return evalLevels[currentIdx - 1].levelName;
  }

  return currentLevel.levelName;
};

const getExpectedLevelId = (row, sortedLevels) => {
  const evalLevels = getEvalLevelsForRow(row, sortedLevels);
  if (!evalLevels.length || row.accuracyAvg == null || row.errorCountAvg == null) return row.workerLevel;

  const currentLevelId = parsePrimaryLevelId(row.workerLevel);
  const currentIdx = evalLevels.findIndex((l) => l.id === currentLevelId);
  if (currentIdx === -1 || currentLevelId == null) return null;

  const nextLevel = evalLevels[currentIdx + 1];
  if (nextLevel && meetsLevelCriteria(row.accuracyAvg, row.errorCountAvg, nextLevel)
      && meetsWorkingTimeCriteria(row.totalWorkingTime, nextLevel)) {
    return nextLevel.id;
  }

  const currentLevel = evalLevels[currentIdx];
  if (!meetsLevelCriteria(row.accuracyAvg, row.errorCountAvg, currentLevel) && currentIdx > 0) {
    return evalLevels[currentIdx - 1].id;
  }

  return currentLevel.id;
};

// 심사월(yyyy-MM)의 다음 달 = 반영(적용)월. 오늘이 아니라 선택한 심사월 기준으로 계산.
const getEffectiveMonth = (month) => {
  const [y, m] = month.split('-').map(Number); // m: 1-indexed
  const d = new Date(y, m, 1);                  // m(1-indexed)을 0-indexed로 사용 → 다음 달
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

const toEffectiveTargetStr = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

const toDateStr = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const toMonthStr = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const monthToRange = (month) => {
  const [year, mon] = month.split('-').map(Number);
  return {
    startDate: toDateStr(new Date(year, mon - 1, 1)),
    endDate: toDateStr(new Date(year, mon, 0)),
  };
};

export default function ReviewTargetTab({ workerId: fixedWorkerId }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const user = useUserStore((s) => s.user);
  const isWorkerFixed = Boolean(fixedWorkerId);

  const [workerLevels, setWorkerLevels] = useState([]);
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  // 확정 상태 판정 키: `${workerId}-${등급id}`. 행은 (작업자 × bssType) 단위이고
  // 등급 id 는 bssType 마다 고유하므로, workerId 만으로 판정하면 같은 작업자의 다른
  // bssType 행까지 확정됨으로 잘못 표시되는 문제를 막는다.
  const [scheduledKeys, setScheduledKeys] = useState(new Set());
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalRow, setDetailModalRow] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailConfirming, setDetailConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getWorkerLevels();
        if (res.status === 'SUCCESS') setWorkerLevels(res.data || []);
      } catch (err) {
        console.error('WorkerLevels load error:', err);
      }
    })();
  }, []);

  const [filters, setFilters] = useState({
    month: toMonthStr(new Date()),
    workerName: '',
    workerId: fixedWorkerId || '',
    bssType: '',
    reviewResult: '',
    reviewStatus: '',
  });

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const fetchData = useCallback(async (params = {}) => {
    const month = params.month ?? filters.month;
    if (!month) return;

    setLoading(true);
    setError(null);

    try {
      const effectiveTarget = toEffectiveTargetStr(getEffectiveMonth(month));
      const scheduleRes = await searchPromotionSchedules({ effectiveTarget });
      setScheduledKeys(new Set((scheduleRes.data || []).map((s) => `${s.workerId}-${s.fromLevel}`)));

      const { startDate, endDate } = monthToRange(month);
      const response = await getWorkerStatistics({ startDate, endDate });

      if (response.status === 'SUCCESS') {
        setRowData((response.data || []).map((row) => ({
          ...row,
          workerLevelName: row.workerLevelName || '-',
        })));
      } else {
        setError(response.message || t('manage.common.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.month, t]);

  const sortedLevels = useMemo(
    () => [...workerLevels].sort((a, b) => a.id - b.id),
    [workerLevels],
  );

  const bssTypeOptions = useMemo(
    () => [...new Set(workerLevels.map((l) => l.bssType).filter(Boolean))],
    [workerLevels],
  );

  const displayData = useMemo(() => {
    let data = rowData;
    if (filters.workerName) {
      const q = filters.workerName.toLowerCase();
      data = data.filter((r) => r.workerName?.toLowerCase().includes(q));
    }
    const effectiveWorkerId = isWorkerFixed ? fixedWorkerId : filters.workerId;
    if (effectiveWorkerId) {
      const q = effectiveWorkerId.toLowerCase();
      data = data.filter((r) => r.workerId?.toLowerCase().includes(q));
    }
    if (filters.bssType) {
      data = data.filter((r) => r.bssType === filters.bssType);
    }
    if (filters.reviewResult) {
      data = data.filter((r) => getReviewResult(r, sortedLevels) === filters.reviewResult);
    }
    if (filters.reviewStatus === 'done') {
      data = data.filter((r) => scheduledKeys.has(`${r.workerId}-${parsePrimaryLevelId(r.workerLevel)}`));
    } else if (filters.reviewStatus === 'pending') {
      data = data.filter((r) => !scheduledKeys.has(`${r.workerId}-${parsePrimaryLevelId(r.workerLevel)}`));
    }
    return data;
  }, [rowData, filters.workerName, filters.workerId, filters.bssType, filters.reviewResult, filters.reviewStatus, sortedLevels, scheduledKeys]);

  const RESULT_LABELS = useMemo(() => ({
    maintain: t('manage.evaluation.reviewTarget.resultMaintain'),
    promote: t('manage.evaluation.reviewTarget.resultPromote'),
    demote: t('manage.evaluation.reviewTarget.resultDemote'),
  }), [t]);

  const ReviewResultRenderer = useCallback((params) => {
    const result = params.value;
    if (!result) return '-';
    return <span className={`review-result-badge ${result}`}>{RESULT_LABELS[result] ?? result}</span>;
  }, [RESULT_LABELS]);

  const ReviewStatusRenderer = useCallback((params) => {
    const done = scheduledKeys.has(`${params.data.workerId}-${parsePrimaryLevelId(params.data.workerLevel)}`);
    const label = done ? t('manage.evaluation.reviewTarget.statusDone') : t('manage.evaluation.reviewTarget.statusPending');
    return <span className={`review-result-badge ${done ? 'promote' : 'maintain'}`}>{label}</span>;
  }, [scheduledKeys, t]);

  const columnDefs = useMemo(() => [
    ...(!isWorkerFixed ? [{
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      maxWidth: 50,
      suppressMovable: true,
      sortable: false,
    }] : []),
    {
      colId: 'reviewStatus',
      headerName: t('manage.evaluation.reviewTarget.columns.reviewStatus'),
      width: 100,
      cellClass: 'text-center',
      cellRenderer: ReviewStatusRenderer,
      sortable: true,
    },
    { field: 'workerName', headerName: t('manage.evaluation.reviewTarget.columns.workerName'), width: 140 },
    { field: 'workerId', headerName: t('manage.evaluation.reviewTarget.columns.workerId'), flex: 1, minWidth: 140 },
    { field: 'bssType', headerName: t('manage.evaluation.reviewTarget.columns.bssType'), width: 100, cellClass: 'text-center' },
    { field: 'workerLevelName', headerName: t('manage.evaluation.reviewTarget.columns.workerLevelName'), width: 100, cellClass: 'text-center' },
    { field: 'workCount', headerName: t('manage.evaluation.reviewTarget.columns.workCount'), width: 110, cellClass: 'text-center' },
    {
      field: 'accuracyAvg',
      headerName: t('manage.evaluation.reviewTarget.columns.accuracyAvg'),
      width: 130,
      cellClass: 'text-center',
      valueFormatter: (p) => p.value != null ? `${Number(p.value).toFixed(2)}%` : '-',
    },
    {
      field: 'errorCountAvg',
      headerName: t('manage.evaluation.reviewTarget.columns.errorCountAvg'),
      width: 130,
      cellClass: 'text-center',
      valueFormatter: (p) => p.value != null ? p.value.toFixed(1) : '-',
    },
    {
      field: 'totalWorkingTime',
      headerName: t('manage.evaluation.reviewTarget.columns.totalWorkingTime'),
      width: 130,
      cellClass: 'text-center',
      valueFormatter: (p) => formatWorkingTime(p.value),
    },
    {
      colId: 'reviewResult',
      headerName: t('manage.evaluation.reviewTarget.columns.reviewResult'),
      width: 120,
      cellClass: 'text-center',
      valueGetter: (p) => getReviewResult(p.data, sortedLevels),
      cellRenderer: ReviewResultRenderer,
    },
    {
      colId: 'expectedLevel',
      headerName: t('manage.evaluation.reviewTarget.columns.expectedLevel'),
      width: 120,
      cellClass: 'text-center',
      valueGetter: (p) => getExpectedLevel(p.data, sortedLevels),
    },
  ], [t, sortedLevels, ReviewResultRenderer, ReviewStatusRenderer]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  const handleMonthPreset = useCallback((offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    setFilters((prev) => ({ ...prev, month: toMonthStr(d) }));
  }, []);

  useEffect(() => {
    if (filters.month) fetchData();
  }, [filters.month]);

  const handleRowDoubleClicked = useCallback((e) => {
    setDetailModalRow(e.data);
    setDetailItems([]);
    setDetailModalOpen(true);
  }, []);

  useEffect(() => {
    if (!detailModalOpen || !detailModalRow) return;
    const { startDate, endDate } = monthToRange(filters.month);
    setDetailLoading(true);
    getWorkerMonthlyDetails({
      workerId: detailModalRow.workerId,
      startDate,
      endDate,
      bssType: detailModalRow.bssType,
    }).then((res) => {
      if (res.status === 'SUCCESS') setDetailItems(res.data || []);
    }).catch((err) => {
      console.error('MonthlyDetails load error:', err);
    }).finally(() => setDetailLoading(false));
  }, [detailModalOpen, detailModalRow, filters.month]);

  const handleDetailConfirm = useCallback(async () => {
    if (!detailModalRow) return;
    setDetailConfirming(true);
    const { year, month } = getEffectiveMonth(filters.month);
    const effectedAt = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
    const effectiveTarget = `${year}-${String(month).padStart(2, '0')}`;
    const createdBy = (user?.membId || '').trim();

    try {
      const fromLevel = parsePrimaryLevelId(detailModalRow.workerLevel);
      const toLevel = getExpectedLevelId(detailModalRow, sortedLevels);
      if (fromLevel == null || toLevel == null) {
        toast.error(t('manage.evaluation.reviewTarget.confirmFailed'));
        return;
      }
      const res = await createPromotionSchedule({
        workerId: detailModalRow.workerId,
        fromLevel,
        toLevel,
        isPromote: getReviewResult(detailModalRow, sortedLevels) === 'promote',
        createdBy,
        effectedAt,
        effectiveTarget,
      });
      if (res.status === 'SUCCESS') {
        toast.success(t('manage.evaluation.reviewTarget.confirmSuccess'));
        setDetailModalOpen(false);
        setDetailModalRow(null);
        fetchData();
      } else {
        toast.error(res.message || t('manage.evaluation.reviewTarget.confirmFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.evaluation.reviewTarget.confirmFailed'));
    } finally {
      setDetailConfirming(false);
    }
  }, [detailModalRow, sortedLevels, user, fetchData, t, filters.month]);

  const closeDetailModal = useCallback(() => {
    if (detailConfirming) return;
    setDetailModalOpen(false);
    setDetailModalRow(null);
  }, [detailConfirming]);

  const getRowId = useCallback((params) => `${params.data.workerId}-${params.data.bssType}`, []);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRows(nodes?.map((n) => n.data) || []);
  }, []);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    const { year, month } = getEffectiveMonth(filters.month);
    const effectedAt = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
    const effectiveTarget = `${year}-${String(month).padStart(2, '0')}`;
    const createdBy = (user?.membId || '').trim();

    try {
      // 순차 처리: 동일 effective_target 에 대해 create(delete+insert)을 병렬로 보내면
      // promotion_schedule 테이블에서 InnoDB 데드락이 발생하므로 한 건씩 처리한다.
      // 결과를 성공/건너뜀(대상 등급 산정 불가)/실패(API 오류)로 분리 집계한다.
      let successCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      for (const row of selectedRows) {
        const fromLevel = parsePrimaryLevelId(row.workerLevel);
        const toLevel = getExpectedLevelId(row, sortedLevels);
        if (fromLevel == null || toLevel == null) {
          skippedCount++;
          continue;
        }
        try {
          const res = await createPromotionSchedule({
            workerId: row.workerId,
            fromLevel,
            toLevel,
            isPromote: getReviewResult(row, sortedLevels) === 'promote',
            createdBy,
            effectedAt,
            effectiveTarget,
          });
          if (res?.status === 'SUCCESS') successCount++;
          else errorCount++;
        } catch {
          errorCount++;
        }
      }

      if (errorCount > 0) {
        toast.error(t('manage.evaluation.reviewTarget.confirmFailed'));
      } else if (skippedCount > 0) {
        // 실제 API 오류는 없음 — 일부/전부가 대상 등급 산정 불가로 제외됨
        toast.warning(t('manage.evaluation.reviewTarget.confirmPartial', {
          success: successCount,
          skipped: skippedCount,
        }));
      } else {
        toast.success(t('manage.evaluation.reviewTarget.confirmSuccess'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.evaluation.reviewTarget.confirmFailed'));
    } finally {
      setConfirming(false);
      setConfirmModalOpen(false);
      setSelectedRows([]);
      gridRef.current?.api?.deselectAll();
      fetchData();
    }
  }, [selectedRows, sortedLevels, user, fetchData, t, filters.month]);

  return (
    <div className="evaluation-tab-panel">
      <div className="filter-bar">
        <input
          type="month"
          className="filter-select"
          value={filters.month}
          onChange={(e) => handleFilterChange('month', e.target.value)}
        />

        <button className="btn-ghost" onClick={() => handleMonthPreset(-1)}>{t('manage.evaluation.lastMonth')}</button>
        <button className="btn-ghost" onClick={() => handleMonthPreset(0)}>{t('manage.evaluation.thisMonth')}</button>

        <input
          type="text"
          className="filter-input"
          value={filters.workerName}
          onChange={(e) => handleFilterChange('workerName', e.target.value)}
          placeholder={t('manage.evaluation.reviewTarget.workerNamePlaceholder')}
        />

        <input
          type="text"
          className="filter-input"
          value={isWorkerFixed ? fixedWorkerId : filters.workerId}
          onChange={(e) => handleFilterChange('workerId', e.target.value)}
          placeholder={t('manage.evaluation.reviewTarget.workerIdPlaceholder')}
          disabled={isWorkerFixed}
        />

        <select
          className="filter-select"
          value={filters.bssType}
          onChange={(e) => handleFilterChange('bssType', e.target.value)}
        >
          <option value="">{t('manage.evaluation.reviewTarget.bssTypeAll')}</option>
          {bssTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>

        <select
          className="filter-select"
          value={filters.reviewResult}
          onChange={(e) => handleFilterChange('reviewResult', e.target.value)}
        >
          <option value="">{t('manage.evaluation.reviewTarget.reviewResultAll')}</option>
          <option value="promote">{t('manage.evaluation.reviewTarget.resultPromote')}</option>
          <option value="demote">{t('manage.evaluation.reviewTarget.resultDemote')}</option>
          <option value="maintain">{t('manage.evaluation.reviewTarget.resultMaintain')}</option>
        </select>

        <select
          className="filter-select"
          value={filters.reviewStatus}
          onChange={(e) => handleFilterChange('reviewStatus', e.target.value)}
        >
          <option value="">{t('manage.evaluation.reviewTarget.reviewStatusAll')}</option>
          <option value="done">{t('manage.evaluation.reviewTarget.statusDone')}</option>
          <option value="pending">{t('manage.evaluation.reviewTarget.statusPending')}</option>
        </select>
      </div>

      {!isWorkerFixed && workerLevels.length > 0 && (
        <div className="level-criteria-panel">
          <span className="level-criteria-title">{t('manage.evaluation.reviewTarget.levelCriteriaTitle')}</span>
          {workerLevels.map((level) => (
            <div key={level.id} className="level-criteria-card">
              <span className="level-name">{level.levelName} ({level.bssType})</span>
              <span className="level-stat">{t('manage.evaluation.reviewTarget.accuracyLabel')} {level.accuracyAvgLevel ?? '-'}%</span>
              <span className="level-stat">{t('manage.evaluation.reviewTarget.errorCountLabel')} {level.errorCountAvgLevel ?? '-'}</span>
              <span className="level-stat">{t('manage.evaluation.reviewTarget.workingTimeLabel')} {level.workingTime != null ? formatWorkingTime(level.workingTime) : '-'}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      <div className="table-toolbar">
        <span className="record-count">
          {t('manage.common.recordCount', { count: displayData.length.toLocaleString() })}
        </span>
        {!isWorkerFixed && selectedRows.length > 0 && (
          <>
            <span className="selected-info">
              {t('manage.evaluation.reviewTarget.selectedCount', { count: selectedRows.length })}
            </span>
            <button className="btn-primary" onClick={() => setConfirmModalOpen(true)}>
              {t('manage.evaluation.reviewTarget.confirmButton')}
            </button>
          </>
        )}
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={displayData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onSelectionChanged={onSelectionChanged}
          onRowDoubleClicked={handleRowDoubleClicked}
          rowSelection={isWorkerFixed ? 'single' : 'multiple'}
          animateRows={true}
          loading={loading}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('manage.common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
          getRowId={getRowId}
          headerHeight={36}
          rowHeight={38}
        />
      </div>

      {confirmModalOpen && (
        <div className="notion-modal-overlay" onClick={() => !confirming && setConfirmModalOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.evaluation.reviewTarget.confirmTitle')}</h3>
              <button className="notion-modal-close" onClick={() => !confirming && setConfirmModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.evaluation.reviewTarget.confirmMessage', {
                count: selectedRows.length,
                year: getEffectiveMonth(filters.month).year,
                month: getEffectiveMonth(filters.month).month,
              })}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setConfirmModalOpen(false)} disabled={confirming}>
                {t('manage.common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleConfirm} disabled={confirming}>
                {confirming ? t('manage.evaluation.reviewTarget.confirming') : t('manage.evaluation.reviewTarget.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
      {detailModalOpen && detailModalRow && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" style={{ maxWidth: '800px', width: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{detailModalRow.workerName} ({detailModalRow.bssType}) - {t('manage.evaluation.reviewTarget.detailModalTitle')}</h3>
              <button className="notion-modal-close" onClick={closeDetailModal} disabled={detailConfirming}>&times;</button>
            </div>
            <div className="notion-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {detailLoading ? (
                <p style={{ textAlign: 'center', padding: '24px' }}>{t('manage.common.loadingData')}</p>
              ) : detailItems.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px' }}>{t('manage.common.noData')}</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color, #e0e0e0)' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>{t('manage.evaluation.reviewTarget.detailColumns.projectTitle')}</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>{t('manage.evaluation.reviewTarget.detailColumns.fileName')}</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>{t('manage.evaluation.reviewTarget.detailColumns.accuracy')}</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>{t('manage.evaluation.reviewTarget.detailColumns.errorCount')}</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>{t('manage.evaluation.reviewTarget.detailColumns.workingTime')}</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>{t('manage.evaluation.reviewTarget.detailColumns.workDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color, #eee)' }}>
                        <td style={{ padding: '8px' }}>{item.projectTitle}</td>
                        <td style={{ padding: '8px' }}>{item.fileName}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{item.accuracy != null ? `${Number(item.accuracy).toFixed(2)}%` : '-'}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{item.errorCount ?? '-'}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{formatWorkingTime(item.workingTime)}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{item.workDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={closeDetailModal} disabled={detailConfirming}>
                {t('manage.common.close')}
              </button>
              <button className="btn-primary" onClick={handleDetailConfirm} disabled={detailConfirming}>
                {detailConfirming ? t('manage.evaluation.reviewTarget.confirming') : t('manage.evaluation.reviewTarget.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
