import { useState, useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import {
  searchProjectFileEvaluations,
  getProjectFileEvaluation,
  upsertProjectFileEvaluation,
} from '../../../../api/v9/projectFileEvaluations';
import { getLatestSubtitleWorkByStatus } from '../../../../api/v9/subtitleWorks/index';
import { useTranslation } from 'react-i18next';
import AccuracyModal from '../../../../components/worktool/subtitle/AccuracyModal';
import { toast } from '../../../../stores/toastStore';
import { parseSubtitleJson } from '../../../../utils/subtitleJsonFormat';
import '../../../../styles/notion-list.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return dateString;
  }
};

const formatAccuracy = (value) => {
  if (value === null || value === undefined) return '-';
  return `${value}%`;
};

const toDateStr = (date) => date.toISOString().slice(0, 10);

const getMonthRange = (offset) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  return { createdAtFrom: toDateStr(from), createdAtTo: toDateStr(to) };
};

export default function EvaluationStatusTab({ workerId: fixedWorkerId, autoHeight = false }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const isWorkerFixed = Boolean(fixedWorkerId);

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [pagination, setPagination] = useState({
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailProjectFileId, setDetailProjectFileId] = useState(null);
  const [detailReviewSubs, setDetailReviewSubs] = useState([]);
  const [detailEvalData, setDetailEvalData] = useState(null);

  const handleRowDoubleClicked = useCallback(async (event) => {
    const pfId = event.data?.projectFileId;
    if (!pfId) return;
    setDetailProjectFileId(pfId);
    setDetailReviewSubs([]);
    setDetailEvalData(null);
    try {
      const [evalRes, reviewRes] = await Promise.all([
        getProjectFileEvaluation(pfId).catch(() => null),
        getLatestSubtitleWorkByStatus(pfId, 'REVIEW_DONE').catch(() => null),
      ]);
      if (evalRes?.status === 'SUCCESS' && evalRes.data) {
        setDetailEvalData(evalRes.data);
      }
      if (reviewRes?.status === 'SUCCESS' && reviewRes.data?.subtitle) {
        setDetailReviewSubs(parseSubtitleJson(reviewRes.data.subtitle)?.subtitles ?? []);
      }
      setDetailModalOpen(true);
    } catch (err) {
      console.error('평가 상세 데이터 조회 실패:', err);
      toast.error(t('manage.common.failedToLoadData'));
    }
  }, [t]);

  const [filters, setFilters] = useState({
    workerId: fixedWorkerId || '',
    checkerId: '',
    createdAtFrom: '',
    createdAtTo: '',
  });

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const requestParams = {
        page: params.page ?? pagination.page,
        size: params.size ?? pagination.size,
        workerId: isWorkerFixed ? fixedWorkerId : (params.workerId ?? filters.workerId),
        checkerId: params.checkerId ?? filters.checkerId,
        createdAtFrom: params.createdAtFrom ?? filters.createdAtFrom,
        createdAtTo: params.createdAtTo ?? filters.createdAtTo,
      };

      Object.keys(requestParams).forEach((key) => {
        if (requestParams[key] === '') delete requestParams[key];
      });

      const response = await searchProjectFileEvaluations(requestParams);

      if (response.status === 'SUCCESS') {
        const data = response.data;
        setRowData(data.content || []);
        setPagination({
          page: data.page ?? requestParams.page,
          size: data.size ?? requestParams.size,
          totalElements: data.totalElements ?? 0,
          totalPages: data.totalPages ?? 0,
        });
      } else {
        setError(response.message || t('manage.common.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.size, t]);

  const handleSaveEvaluation = useCallback(async (info) => {
    if (!detailEvalData) return;
    try {
      const res = await upsertProjectFileEvaluation({
        projectFileId: detailEvalData.projectFileId,
        workRevision: info.loadedRevision ?? detailEvalData.workRevision,
        checkRevision: detailEvalData.checkRevision,
        accuracy: info.accuracy,
        errorCount: info.errorCount,
        formErrorCount: info.formErrorCount ?? detailEvalData.formErrorCount ?? 0,
        createdBy: detailEvalData.createdBy,
        reason: info.reason,
      });
      if (res?.status === 'SUCCESS') {
        toast.success(t('manage.evaluation.detail.saveSuccess'));
        setDetailModalOpen(false);
        fetchData();
      } else {
        toast.error(res?.message || t('manage.evaluation.detail.saveFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.evaluation.detail.saveFailed'));
    }
  }, [detailEvalData, t, fetchData]);

  const columnDefs = useMemo(() => [
    { field: 'projectTitle', headerName: t('manage.evaluation.columns.projectTitle'), flex: 1, minWidth: 180 },
    { field: 'fileName', headerName: t('manage.evaluation.columns.fileName'), flex: 1, minWidth: 160 },
    {
      field: 'workerId',
      headerName: t('manage.evaluation.columns.workerId'),
      width: 200,
      valueFormatter: (p) => {
        const { workerName, workerId } = p.data || {};
        if (!workerId) return '-';
        return workerName ? `${workerName}(${workerId})` : workerId;
      },
    },
    {
      field: 'checkerId',
      headerName: t('manage.evaluation.columns.checkerId'),
      width: 200,
      valueFormatter: (p) => {
        const { checkerName, checkerId } = p.data || {};
        if (!checkerId) return '-';
        return checkerName ? `${checkerName}(${checkerId})` : checkerId;
      },
    },
    {
      field: 'accuracy',
      headerName: t('manage.evaluation.columns.accuracy'),
      width: 110,
      cellClass: 'text-center',
      valueFormatter: (p) => formatAccuracy(p.value),
    },
    {
      field: 'errorCount',
      headerName: t('manage.evaluation.columns.errorCount'),
      width: 110,
      cellClass: 'text-center',
    },
    {
      field: 'formErrorCount',
      headerName: t('manage.evaluation.columns.formErrorCount'),
      width: 110,
      cellClass: 'text-center',
      valueFormatter: (p) => p.value != null ? `${p.value}` : '-',
    },
    {
      field: 'createdAt',
      headerName: t('manage.evaluation.columns.createdAt'),
      width: 170,
      valueFormatter: (p) => formatDate(p.value),
    },
  ], [t]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSearch = useCallback(() => {
    fetchData({ page: 0 });
  }, [fetchData]);

  const handleReset = useCallback(() => {
    setFilters({ workerId: isWorkerFixed ? fixedWorkerId : '', checkerId: '', createdAtFrom: '', createdAtTo: '' });
    fetchData({ workerId: isWorkerFixed ? fixedWorkerId : '', checkerId: '', createdAtFrom: '', createdAtTo: '', page: 0 });
  }, [fetchData, isWorkerFixed, fixedWorkerId]);

  const handleMonthPreset = useCallback((offset) => {
    const range = getMonthRange(offset);
    setFilters((prev) => ({ ...prev, ...range }));
  }, []);

  const onGridReady = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const getRowId = useCallback((params) => String(params.data.projectFileId), []);

  const handlePageChange = useCallback((newPage) => {
    fetchData({ page: newPage });
  }, [fetchData]);

  const displayPage = pagination.page + 1;

  return (
    <div className={`evaluation-tab-panel${autoHeight ? ' evaluation-tab-panel--auto-height' : ''}`}>
      <div className="filter-bar">
        <div className="filter-search" style={{ minWidth: 140 }}>
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="filter-input"
            value={filters.workerId}
            onChange={(e) => handleFilterChange('workerId', e.target.value)}
            placeholder={t('manage.evaluation.workerIdPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            disabled={isWorkerFixed}
          />
        </div>

        <input
          type="text"
          className="filter-input filter-input-inline"
          value={filters.checkerId}
          onChange={(e) => handleFilterChange('checkerId', e.target.value)}
          placeholder={t('manage.evaluation.checkerIdPlaceholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />

        <input type="date" className="filter-select" value={filters.createdAtFrom} onChange={(e) => handleFilterChange('createdAtFrom', e.target.value)} title={t('manage.evaluation.createdAtFrom')} />
        <input type="date" className="filter-select" value={filters.createdAtTo} onChange={(e) => handleFilterChange('createdAtTo', e.target.value)} title={t('manage.evaluation.createdAtTo')} />

        <button className="btn-ghost" onClick={() => handleMonthPreset(-1)}>{t('manage.evaluation.lastMonth')}</button>
        <button className="btn-ghost" onClick={() => handleMonthPreset(0)}>{t('manage.evaluation.thisMonth')}</button>

        <div className="filter-actions">
          <button className="btn-ghost" onClick={handleReset}>{t('manage.common.reset')}</button>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? t('manage.common.searching') : t('manage.common.search')}
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
          {t('manage.common.recordCount', { count: pagination.totalElements.toLocaleString() })}
        </span>
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onRowDoubleClicked={handleRowDoubleClicked}
          animateRows={true}
          loading={loading}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('manage.common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
          getRowId={getRowId}
          headerHeight={36}
          rowHeight={38}
          domLayout={autoHeight ? 'autoHeight' : undefined}
        />
      </div>

      <div className="pagination">
        <div className="pagination-size">
          <select
            value={pagination.size}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              setPagination((prev) => ({ ...prev, size: newSize }));
              fetchData({ page: 0, size: newSize });
            }}
          >
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{t('manage.common.recordCount', { count: n })}</option>)}
          </select>
        </div>
        <div className="pagination-pages">
          <button disabled={pagination.page <= 0} onClick={() => handlePageChange(0)}>&laquo;</button>
          <button disabled={pagination.page <= 0} onClick={() => handlePageChange(pagination.page - 1)}>&lsaquo;</button>
          {(() => {
            const total = pagination.totalPages || 1;
            const current = displayPage;
            const range = 5;
            let start = Math.max(1, current - Math.floor(range / 2));
            let end = Math.min(total, start + range - 1);
            if (end - start + 1 < range) start = Math.max(1, end - range + 1);
            const pages = [];
            for (let i = start; i <= end; i++) pages.push(i);
            return pages.map((p) => (
              <button
                key={p}
                className={p === current ? 'active' : ''}
                onClick={() => handlePageChange(p - 1)}
              >
                {p}
              </button>
            ));
          })()}
          <button disabled={pagination.page >= pagination.totalPages - 1} onClick={() => handlePageChange(pagination.page + 1)}>&rsaquo;</button>
          <button disabled={pagination.page >= pagination.totalPages - 1} onClick={() => handlePageChange(pagination.totalPages - 1)}>&raquo;</button>
        </div>
        <span className="pagination-info">
          {displayPage} / {pagination.totalPages || 1}
        </span>
      </div>
      <AccuracyModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onConfirm={handleSaveEvaluation}
        projectFileId={detailProjectFileId}
        currentSubtitles={detailReviewSubs}
        hideConfirmUntilDirty={true}
      />
    </div>
  );
}
