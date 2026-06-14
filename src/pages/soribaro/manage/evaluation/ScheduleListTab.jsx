import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { searchPromotionSchedules, deletePromotionSchedule, applyPromotionSchedule, rollbackPromotionSchedule, autoApplyPromotionSchedules } from '../../../../api/v9/promotionSchedules';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../../components/common/Toast';
import '../../../../styles/notion-list.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const toMonthStr = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const STATUS_MAP = { STANDBY: 'statusStandby', CANCELED: 'statusCanceled', DONE: 'statusDone' };

export default function ScheduleListTab({ isPromote }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [autoApplyModalOpen, setAutoApplyModalOpen] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return toMonthStr(d);
  });

  const nextMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return { str: toMonthStr(d), year: d.getFullYear(), month: d.getMonth() + 1 };
  }, []);

  const fetchData = useCallback(async (targetMonth) => {
    const m = targetMonth ?? month;
    if (!m) return;

    setLoading(true);
    setError(null);

    try {
      const response = await searchPromotionSchedules({ effectiveTarget: m, isPromote });

      if (response.status === 'SUCCESS') {
        setRowData(response.data || []);
      } else {
        setError(response.message || t('manage.common.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  }, [month, isPromote, t]);

  useEffect(() => {
    if (month) fetchData();
  }, [month]);

  const handleMonthPreset = useCallback((offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    setMonth(toMonthStr(d));
  }, []);

  const StatusRenderer = useCallback((params) => {
    const key = STATUS_MAP[params.value];
    const label = key ? t(`manage.evaluation.scheduleList.${key}`) : params.value;
    return <span className={`review-result-badge ${params.value === 'STANDBY' ? 'maintain' : params.value === 'DONE' ? 'promote' : 'demote'}`}>{label}</span>;
  }, [t]);

  const columnDefs = useMemo(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: (params) => params.data.status === 'STANDBY' || params.data.status === 'DONE',
      width: 50,
      maxWidth: 50,
      suppressMovable: true,
      sortable: false,
    },
    { field: 'workerName', headerName: t('manage.evaluation.scheduleList.columns.workerName'), width: 140, valueFormatter: (p) => p.value || '-' },
    { field: 'workerId', headerName: t('manage.evaluation.scheduleList.columns.workerId'), flex: 1, minWidth: 140 },
    {
      field: 'status',
      headerName: t('manage.evaluation.scheduleList.columns.status'),
      width: 100,
      cellClass: 'text-center',
      cellRenderer: StatusRenderer,
    },
    { field: 'fromLevelName', headerName: t('manage.evaluation.scheduleList.columns.fromLevelName'), width: 160, cellClass: 'text-center', valueFormatter: (p) => p.value || '-' },
    { field: 'toLevelName', headerName: t('manage.evaluation.scheduleList.columns.toLevelName'), width: 160, cellClass: 'text-center', valueFormatter: (p) => p.value || '-' },
    { field: 'description', headerName: t('manage.evaluation.scheduleList.columns.description'), flex: 1, minWidth: 160 },
    { field: 'effectiveTarget', headerName: t('manage.evaluation.scheduleList.columns.effectiveTarget'), width: 100, cellClass: 'text-center' },
    { field: 'createdAt', headerName: t('manage.evaluation.scheduleList.columns.createdAt'), width: 120, cellClass: 'text-center' },
  ], [t, StatusRenderer]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  const getRowId = useCallback((params) => String(params.data.id), []);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRows(nodes?.map((n) => n.data) || []);
  }, []);

  // 같은 상태인 건만 함께 처리한다. STANDBY=취소/즉시적용, DONE=롤백.
  const selectedAllStandby = useMemo(
    () => selectedRows.length > 0 && selectedRows.every((r) => r.status === 'STANDBY'),
    [selectedRows],
  );
  const selectedAllDone = useMemo(
    () => selectedRows.length > 0 && selectedRows.every((r) => r.status === 'DONE'),
    [selectedRows],
  );

  const handleCancel = useCallback(async () => {
    setCancelling(true);

    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => deletePromotionSchedule(row.id)),
      );

      const failed = results.filter((r) => r.status === 'rejected' || r.value?.status !== 'SUCCESS');
      if (failed.length > 0) {
        toast.error(t('manage.evaluation.scheduleList.cancelFailed'));
      } else {
        toast.success(t('manage.evaluation.scheduleList.cancelSuccess'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.evaluation.scheduleList.cancelFailed'));
    } finally {
      setCancelling(false);
      setCancelModalOpen(false);
      setSelectedRows([]);
      gridRef.current?.api?.deselectAll();
      fetchData();
    }
  }, [selectedRows, fetchData, t]);

  const handleApply = useCallback(async () => {
    setApplying(true);

    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => applyPromotionSchedule(row.id)),
      );

      const failed = results.filter((r) => r.status === 'rejected' || r.value?.status !== 'SUCCESS');
      if (failed.length > 0) {
        toast.error(t('manage.evaluation.scheduleList.applyFailed'));
      } else {
        toast.success(t('manage.evaluation.scheduleList.applySuccess'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.evaluation.scheduleList.applyFailed'));
    } finally {
      setApplying(false);
      setApplyModalOpen(false);
      setSelectedRows([]);
      gridRef.current?.api?.deselectAll();
      fetchData();
    }
  }, [selectedRows, fetchData, t]);

  const handleRollback = useCallback(async () => {
    setRollingBack(true);

    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => rollbackPromotionSchedule(row.id)),
      );

      const failed = results.filter((r) => r.status === 'rejected' || r.value?.status !== 'SUCCESS');
      if (failed.length > 0) {
        toast.error(t('manage.evaluation.scheduleList.rollbackFailed'));
      } else {
        toast.success(t('manage.evaluation.scheduleList.rollbackSuccess'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.evaluation.scheduleList.rollbackFailed'));
    } finally {
      setRollingBack(false);
      setRollbackModalOpen(false);
      setSelectedRows([]);
      gridRef.current?.api?.deselectAll();
      fetchData();
    }
  }, [selectedRows, fetchData, t]);

  const handleAutoApply = useCallback(async () => {
    setAutoApplying(true);
    try {
      const res = await autoApplyPromotionSchedules({ effectiveTarget: nextMonth.str });
      if (res.status === 'SUCCESS') {
        const { successCount, failureCount } = res.data;
        if (failureCount > 0) {
          toast.warning(t('manage.evaluation.scheduleList.autoApplyPartial', { success: successCount, failure: failureCount }));
        } else {
          toast.success(t('manage.evaluation.scheduleList.autoApplySuccess', { count: successCount }));
        }
      } else {
        toast.error(res.message || t('manage.evaluation.scheduleList.autoApplyFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.evaluation.scheduleList.autoApplyFailed'));
    } finally {
      setAutoApplying(false);
      setAutoApplyModalOpen(false);
      fetchData();
    }
  }, [nextMonth, fetchData, t]);

  return (
    <div className="evaluation-tab-panel">
      <div className="filter-bar">
        <input
          type="month"
          className="filter-select"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />

        <button className="btn-ghost" onClick={() => handleMonthPreset(-1)}>{t('manage.evaluation.lastMonth')}</button>
        <button className="btn-ghost" onClick={() => handleMonthPreset(0)}>{t('manage.evaluation.thisMonth')}</button>
        <button className="btn-ghost" onClick={() => handleMonthPreset(1)}>{t('manage.evaluation.nextMonth')}</button>

        <div className="filter-actions">
          <button className="btn-primary" onClick={() => setAutoApplyModalOpen(true)}>
            {t('manage.evaluation.scheduleList.autoApplyButton')}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      <div className="table-toolbar">
        <span className="record-count">
          {t('manage.common.recordCount', { count: rowData.length.toLocaleString() })}
        </span>
        {selectedRows.length > 0 && (
          <div className="toolbar-actions">
            <span className="selected-info">
              {t('manage.evaluation.scheduleList.selectedCount', { count: selectedRows.length })}
            </span>
            {selectedAllStandby && (
              <>
                <button className="btn-primary" onClick={() => setCancelModalOpen(true)}>
                  {t('manage.evaluation.scheduleList.cancelButton')}
                </button>
                <button className="btn-primary" onClick={() => setApplyModalOpen(true)}>
                  {t('manage.evaluation.scheduleList.applyButton')}
                </button>
              </>
            )}
            {selectedAllDone && (
              <button className="btn-primary" onClick={() => setRollbackModalOpen(true)}>
                {t('manage.evaluation.scheduleList.rollbackButton')}
              </button>
            )}
            {!selectedAllStandby && !selectedAllDone && (
              <span className="selected-info">
                {t('manage.evaluation.scheduleList.mixedSelectionHint')}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onSelectionChanged={onSelectionChanged}
          rowSelection="multiple"
          isRowSelectable={(params) => params.data.status === 'STANDBY' || params.data.status === 'DONE'}
          animateRows={true}
          loading={loading}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('manage.common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
          getRowId={getRowId}
          headerHeight={36}
          rowHeight={38}
        />
      </div>

      {cancelModalOpen && (
        <div className="notion-modal-overlay" onClick={() => !cancelling && setCancelModalOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.evaluation.scheduleList.cancelTitle')}</h3>
              <button className="notion-modal-close" onClick={() => !cancelling && setCancelModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.evaluation.scheduleList.cancelMessage', { count: selectedRows.length })}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setCancelModalOpen(false)} disabled={cancelling}>
                {t('manage.common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? t('manage.evaluation.scheduleList.cancelling') : t('manage.evaluation.scheduleList.cancelButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {applyModalOpen && (
        <div className="notion-modal-overlay" onClick={() => !applying && setApplyModalOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.evaluation.scheduleList.applyTitle')}</h3>
              <button className="notion-modal-close" onClick={() => !applying && setApplyModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.evaluation.scheduleList.applyMessage', { count: selectedRows.length })}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setApplyModalOpen(false)} disabled={applying}>
                {t('manage.common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? t('manage.evaluation.scheduleList.applying') : t('manage.evaluation.scheduleList.applyButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {rollbackModalOpen && (
        <div className="notion-modal-overlay" onClick={() => !rollingBack && setRollbackModalOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.evaluation.scheduleList.rollbackTitle')}</h3>
              <button className="notion-modal-close" onClick={() => !rollingBack && setRollbackModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.evaluation.scheduleList.rollbackMessage', { count: selectedRows.length })}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setRollbackModalOpen(false)} disabled={rollingBack}>
                {t('manage.common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleRollback} disabled={rollingBack}>
                {rollingBack ? t('manage.evaluation.scheduleList.rollingBack') : t('manage.evaluation.scheduleList.rollbackButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {autoApplyModalOpen && (
        <div className="notion-modal-overlay" onClick={() => !autoApplying && setAutoApplyModalOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.evaluation.scheduleList.autoApplyTitle')}</h3>
              <button className="notion-modal-close" onClick={() => !autoApplying && setAutoApplyModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.evaluation.scheduleList.autoApplyMessage', { year: nextMonth.year, month: nextMonth.month })}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setAutoApplyModalOpen(false)} disabled={autoApplying}>
                {t('manage.common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleAutoApply} disabled={autoApplying}>
                {autoApplying ? t('manage.evaluation.scheduleList.autoApplying') : t('manage.evaluation.scheduleList.autoApplyButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
