import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { toast } from '../../../../stores/toastStore';
import { getSettlementsByStatus, downloadSettlementByStatusExcel } from '../../../../api/v9/settlement';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';
import SettlementDetailModal from './SettlementDetailModal';

ModuleRegistry.registerModules([AllCommunityModule]);

const formatNumber = (value) => {
  if (value == null) return '-';
  return Number(value).toLocaleString();
};

const formatDate = (value) => {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
};

/**
 * 상태별 정산서 목록 패널 (재사용 컴포넌트)
 * notion-list.css 스타일 기반
 * @param {{ status: 'ISSUED' | 'WAITING_CONFIRM' | 'REJECTED' | 'WAITING_PAYMENT' | 'PAID' }} props
 */
const INITIAL_FILTERS = {
  title: '',
  servTitle: '',
  bssType: '',
  servCd: '',
  memberKeyword: '',
  requesterKeyword: '',
};

export default function SettlementStatusPanel({ status }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const getCodeOptions = useCommonCodeStore((s) => s.getCodeOptions);
  const bssTypeOptions = getCodeOptions('BSS_TYPE');

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);

  const isSelectable = status === 'ISSUED' || status === 'WAITING_CONFIRM' || status === 'WAITING_PAYMENT' || status === 'PAID';
  const hasBatchAction = status === 'ISSUED' || status === 'WAITING_CONFIRM' || status === 'WAITING_PAYMENT';
  // 의뢰명(servTitle) 컬럼은 발행/작업자 확인 탭에서만 노출
  const showServTitle = status === 'ISSUED' || status === 'WAITING_CONFIRM';

  const [pagination, setPagination] = useState({
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filters, setFilters] = useState({ ...INITIAL_FILTERS });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [excelDownloading, setExcelDownloading] = useState(false);

  const isExcelDownloadable = status === 'WAITING_PAYMENT' || status === 'PAID';

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const currentFilters = params.filters ?? filters;
      const requestParams = {
        status,
        page: params.page ?? pagination.page,
        size: params.size ?? pagination.size,
        dateFrom: params.dateFrom ?? dateFrom,
        dateTo: params.dateTo ?? dateTo,
        ...(currentFilters.title && { title: currentFilters.title }),
        ...(currentFilters.servTitle && { servTitle: currentFilters.servTitle }),
        ...(currentFilters.bssType && { bssType: currentFilters.bssType }),
        ...(currentFilters.servCd && { servCd: currentFilters.servCd }),
        ...(currentFilters.memberKeyword && { memberKeyword: currentFilters.memberKeyword }),
        ...(currentFilters.requesterKeyword && { requesterKeyword: currentFilters.requesterKeyword }),
      };

      const response = await getSettlementsByStatus(requestParams);

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
  }, [status, dateFrom, dateTo, filters, pagination.page, pagination.size]);

  useEffect(() => {
    setRowData([]);
    setSelectedRow(null);
    setDateFrom('');
    setDateTo('');
    setFilters({ ...INITIAL_FILTERS });
    setIsFilterOpen(false);
    setPagination((prev) => ({ ...prev, page: 0, totalElements: 0, totalPages: 0 }));
  }, [status]);

  const columnDefs = useMemo(() => [
    ...(isSelectable ? [{
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      maxWidth: 50,
      suppressMovable: true,
      sortable: false,
      resizable: false,
    }] : []),
    { field: 'fileNo', headerName: t('manage.settlement.statusPanel.columns.fileNo'), width: 100, cellClass: 'text-center' },
    { field: 'servCd', headerName: t('manage.settlement.statusPanel.columns.servCd'), width: 160 },
    ...(showServTitle ? [{ field: 'servTitle', headerName: t('manage.settlement.statusPanel.columns.servTitle'), flex: 1, minWidth: 140, valueFormatter: (p) => p.value || '-' }] : []),
    { field: 'entNm', headerName: t('manage.settlement.statusPanel.columns.entNm'), width: 140, valueFormatter: (p) => p.value || '-' },
    { field: 'fileName', headerName: t('manage.settlement.statusPanel.columns.fileName'), flex: 1, minWidth: 160 },
    { field: 'projectTitle', headerName: t('manage.settlement.statusPanel.columns.title'), flex: 1, minWidth: 160 },
    { field: 'workerName', headerName: t('manage.settlement.statusPanel.columns.workerName'), width: 100 },
    { field: 'executorName', headerName: t('manage.settlement.statusPanel.columns.executorName'), width: 100 },
    { field: 'bssTypeName', headerName: t('manage.settlement.statusPanel.columns.bssTypeName'), width: 100, cellClass: 'text-center' },
    { field: 'price', headerName: t('manage.settlement.statusPanel.columns.price'), width: 90, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'penalty', headerName: t('manage.settlement.statusPanel.columns.penalty'), width: 90, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'pay', headerName: t('manage.settlement.statusPanel.columns.pay'), width: 90, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'taxRate', headerName: t('manage.settlement.statusPanel.columns.taxRate'), width: 70, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? `${p.value}%` : '-' },
    { field: 'payRate', headerName: t('manage.settlement.statusPanel.columns.payRate'), width: 80, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? `${Number(p.value)}%` : '-' },
    { field: 'createdAt', headerName: t('manage.settlement.statusPanel.columns.createdAt'), width: 140, valueFormatter: (p) => formatDate(p.value) },
  ], [t, isSelectable, showServTitle]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, suppressMovable: false }), []);

  const handleSearch = useCallback(() => {
    setSelectedRow(null);
    fetchData({ page: 0 });
  }, [fetchData]);

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setDateFrom('');
    setDateTo('');
    setFilters({ ...INITIAL_FILTERS });
    setIsFilterOpen(false);
    setSelectedRow(null);
    fetchData({ dateFrom: '', dateTo: '', filters: INITIAL_FILTERS, page: 0 });
  }, [fetchData]);

  const onGridReady = useCallback(() => { fetchData(); }, [fetchData]);
  const getRowId = useCallback((params) => String(params.data.id), []);

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api?.getSelectedNodes();
    if (isSelectable) {
      setSelectedRows(selectedNodes ? selectedNodes.map((n) => n.data) : []);
    } else {
      setSelectedRow(selectedNodes?.length > 0 ? selectedNodes[0].data : null);
    }
  }, [isSelectable]);

  const handlePageChange = useCallback((newPage) => { fetchData({ page: newPage }); }, [fetchData]);

  const onRowClicked = useCallback((event) => {
    setSelectedRow(event.data);
    setIsDetailOpen(true);
  }, []);
  const handleDetailClose = useCallback(() => { setIsDetailOpen(false); }, []);
  const handleDetailSuccess = useCallback(() => { setSelectedRows([]); fetchData(); }, [fetchData]);

  const [isBatchDetailOpen, setIsBatchDetailOpen] = useState(false);
  const handleOpenBatchDetail = useCallback(() => { setIsBatchDetailOpen(true); }, []);
  const handleCloseBatchDetail = useCallback(() => { setIsBatchDetailOpen(false); }, []);
  const handleBatchDetailSuccess = useCallback(() => { setSelectedRows([]); setIsBatchDetailOpen(false); fetchData(); }, [fetchData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleExcelDownload = useCallback(async () => {
    setExcelDownloading(true);
    try {
      const hasSelection = isSelectable && selectedRows.length > 0;
      const params = {
        status,
        ...(hasSelection
          ? { ids: selectedRows.map((r) => r.id) }
          : {
              ...(dateFrom && { dateFrom }),
              ...(dateTo && { dateTo }),
              ...(filters.title && { title: filters.title }),
              ...(filters.servTitle && { servTitle: filters.servTitle }),
              ...(filters.bssType && { bssType: filters.bssType }),
              ...(filters.servCd && { servCd: filters.servCd }),
              ...(filters.memberKeyword && { memberKeyword: filters.memberKeyword }),
              ...(filters.requesterKeyword && { requesterKeyword: filters.requesterKeyword }),
            }),
      };
      await downloadSettlementByStatusExcel(params);
    } catch (err) {
      toast.error(t('manage.settlement.statusPanel.toastExcelDownloadFailed'));
      console.error('Excel download error:', err);
    } finally {
      setExcelDownloading(false);
    }
  }, [status, dateFrom, dateTo, filters, isSelectable, selectedRows, t]);

  const displayPage = pagination.page + 1;

  return (
    <>
      {/* 검색 필터 */}
      <div className="filter-bar">
        <div className="filter-date-group">
          <input
            type="date"
            className="filter-date-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="filter-date-sep">~</span>
          <input
            type="date"
            className="filter-date-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          className={`filter-toggle ${isFilterOpen ? 'open' : ''}`}
          onClick={() => setIsFilterOpen((prev) => !prev)}
          type="button"
        >
          <span>{t('manage.settlement.advancedSearch')}</span>
          {isFilterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="filter-actions">
          <button className="btn-ghost" onClick={handleReset}>{t('manage.common.reset')}</button>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? t('manage.common.searching') : t('manage.common.search')}
          </button>
        </div>
      </div>

      <div className={`filter-advanced ${isFilterOpen ? 'open' : ''}`}>
        <div className="filter-advanced-grid">
          <div className="filter-field">
            <label>{t('manage.settlement.labelProjectName')}</label>
            <input
              type="text"
              value={filters.title}
              onChange={(e) => handleFilterChange('title', e.target.value)}
              placeholder={t('manage.settlement.searchPlaceholder')}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelServiceName')}</label>
            <input
              type="text"
              value={filters.servTitle}
              onChange={(e) => handleFilterChange('servTitle', e.target.value)}
              placeholder={t('manage.settlement.serviceNamePlaceholder')}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelWorkType')}</label>
            <select
              value={filters.bssType}
              onChange={(e) => handleFilterChange('bssType', e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {bssTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelServiceCode')}</label>
            <input
              type="text"
              value={filters.servCd}
              onChange={(e) => handleFilterChange('servCd', e.target.value)}
              placeholder={t('manage.settlement.serviceCodePlaceholder')}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelMemberKeyword')}</label>
            <input
              type="text"
              value={filters.memberKeyword}
              onChange={(e) => handleFilterChange('memberKeyword', e.target.value)}
              placeholder={t('manage.settlement.memberKeywordPlaceholder')}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="filter-field">
            <label>{t('manage.settlement.labelRequesterKeyword')}</label>
            <input
              type="text"
              value={filters.requesterKeyword}
              onChange={(e) => handleFilterChange('requesterKeyword', e.target.value)}
              placeholder={t('manage.settlement.requesterKeywordPlaceholder')}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      {/* 테이블 툴바 */}
      <div className="table-toolbar">
        <span className="record-count">
          {t('manage.common.recordCount', { count: pagination.totalElements.toLocaleString() })}
          {isSelectable && selectedRows.length > 0 && (
            <span className="selected-info">{t('manage.settlement.selectedCount', { count: selectedRows.length })}</span>
          )}
        </span>
        {hasBatchAction && selectedRows.length > 0 && (
          <button className="btn-issue" onClick={handleOpenBatchDetail}>
            {status === 'WAITING_PAYMENT'
              ? t('manage.settlement.statusPanel.batchPaid', { count: selectedRows.length })
              : status === 'WAITING_CONFIRM'
                ? t('manage.settlement.statusPanel.batchConfirm', { count: selectedRows.length })
                : t('manage.settlement.statusPanel.batchExecute', { count: selectedRows.length })}
          </button>
        )}
        {isExcelDownloadable && (
          <button
            className="btn-issue"
            onClick={handleExcelDownload}
            disabled={excelDownloading || loading || pagination.totalElements === 0}
          >
            <Download size={14} />
            {excelDownloading
              ? t('manage.settlement.statusPanel.excelDownloading')
              : t('manage.settlement.statusPanel.excelDownload')}
          </button>
        )}
      </div>

      {/* AG Grid */}
      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          onRowClicked={onRowClicked}
          rowSelection={isSelectable ? "multiple" : "single"}
          animateRows={true}
          loading={loading}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('manage.common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
          getRowId={getRowId}
          headerHeight={36}
          rowHeight={38}
        />
      </div>

      {/* 페이지네이션 */}
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

      {/* 정산서 상세 모달 (단건) */}
      <SettlementDetailModal
        open={isDetailOpen}
        settlement={selectedRow}
        status={status}
        onClose={handleDetailClose}
        onSuccess={handleDetailSuccess}
      />

      {/* 정산서 상세 모달 (다건 — 전체 집행) */}
      {hasBatchAction && (
        <SettlementDetailModal
          open={isBatchDetailOpen}
          settlements={selectedRows}
          status={status}
          onClose={handleCloseBatchDetail}
          onSuccess={handleBatchDetailSuccess}
        />
      )}
    </>
  );
}
