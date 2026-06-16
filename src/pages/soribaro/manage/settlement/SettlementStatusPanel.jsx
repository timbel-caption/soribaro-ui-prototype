import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { Download } from 'lucide-react';
import { toast } from '../../../../stores/toastStore';
import { getSettlementsByStatus, downloadSettlementByStatusExcel } from '../../../../api/v9/settlement';
import SettlementDetailModal from './SettlementDetailModal';
import SettlementFilterBar from './SettlementFilterBar';
import Pagination from './Pagination';

ModuleRegistry.registerModules([AllCommunityModule]);

// 상태별 기능 설정 — 상태 추가 시 이 객체만 수정
const STATUS_CONFIG = {
  ISSUED:          { selectable: true,  batch: true,  servTitle: true,  excel: false },
  WAITING_CONFIRM: { selectable: true,  batch: true,  servTitle: true,  excel: false },
  REJECTED:        { selectable: false, batch: false, servTitle: false, excel: false },
  WAITING_PAYMENT: { selectable: true,  batch: true,  servTitle: false, excel: true  },
  PAID:            { selectable: true,  batch: false, servTitle: false, excel: true  },
};

const formatNumber = (value) => value == null ? '-' : Number(value).toLocaleString();
const formatDate = (value) => value ? value.replace('T', ' ').slice(0, 16) : '-';

const INITIAL_FILTERS = {
  title: '',
  servTitle: '',
  bssType: '',
  servCd: '',
  memberKeyword: '',
  requesterKeyword: '',
  dateFrom: '',
  dateTo: '',
};

export default function SettlementStatusPanel({ status }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const cfg = STATUS_CONFIG[status] ?? {};

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 0, size: 20, totalElements: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ ...INITIAL_FILTERS });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isBatchDetailOpen, setIsBatchDetailOpen] = useState(false);
  const [excelDownloading, setExcelDownloading] = useState(false);

  // stable refs — fetchData reads these instead of closing over state
  const filtersRef = useRef(filters);
  const paginationRef = useRef(pagination);
  filtersRef.current = filters;
  paginationRef.current = pagination;

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    const f = filtersRef.current;
    const p = paginationRef.current;
    try {
      const title = params.title ?? f.title;
      const servTitle = params.servTitle ?? f.servTitle;
      const bssType = params.bssType ?? f.bssType;
      const servCd = params.servCd ?? f.servCd;
      const memberKeyword = params.memberKeyword ?? f.memberKeyword;
      const requesterKeyword = params.requesterKeyword ?? f.requesterKeyword;
      const dateFrom = params.dateFrom ?? f.dateFrom;
      const dateTo = params.dateTo ?? f.dateTo;

      const requestParams = {
        status,
        page: params.page ?? p.page,
        size: params.size ?? p.size,
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
        ...(title && { title }),
        ...(servTitle && { servTitle }),
        ...(bssType && { bssType }),
        ...(servCd && { servCd }),
        ...(memberKeyword && { memberKeyword }),
        ...(requesterKeyword && { requesterKeyword }),
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
  }, [status]); // stable — reads state via refs

  useEffect(() => {
    setRowData([]);
    setSelectedRow(null);
    setSelectedRows([]);
    setFilters({ ...INITIAL_FILTERS });
    setIsFilterOpen(false);
    setPagination((prev) => ({ ...prev, page: 0, totalElements: 0, totalPages: 0 }));
  }, [status]);

  const columnDefs = useMemo(() => [
    ...(cfg.selectable ? [{
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
    ...(cfg.servTitle ? [{ field: 'servTitle', headerName: t('manage.settlement.statusPanel.columns.servTitle'), flex: 1, minWidth: 140, valueFormatter: (p) => p.value || '-' }] : []),
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
  ], [t, cfg.selectable, cfg.servTitle]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, suppressMovable: false }), []);

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSearch = useCallback(() => {
    setSelectedRow(null);
    setSelectedRows([]);
    fetchData({ page: 0 });
  }, [fetchData]);

  const handleReset = useCallback(() => {
    setFilters({ ...INITIAL_FILTERS });
    setIsFilterOpen(false);
    setSelectedRow(null);
    setSelectedRows([]);
    // pass explicit empty values since ref may not be updated yet
    fetchData({ ...INITIAL_FILTERS, page: 0 });
  }, [fetchData]);

  const onGridReady = useCallback(() => { fetchData(); }, [fetchData]);
  const getRowId = useCallback((params) => String(params.data.id), []);

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api?.getSelectedNodes();
    if (cfg.selectable) {
      setSelectedRows(selectedNodes ? selectedNodes.map((n) => n.data) : []);
    } else {
      setSelectedRow(selectedNodes?.length > 0 ? selectedNodes[0].data : null);
    }
  }, [cfg.selectable]);

  const handlePageChange = useCallback((newPage) => { fetchData({ page: newPage }); }, [fetchData]);
  const handleSizeChange = useCallback((newSize) => {
    setPagination((prev) => ({ ...prev, size: newSize }));
    fetchData({ page: 0, size: newSize });
  }, [fetchData]);

  const onRowClicked = useCallback((event) => {
    setSelectedRow(event.data);
    setIsDetailOpen(true);
  }, []);
  const handleDetailClose = useCallback(() => { setIsDetailOpen(false); }, []);
  const handleDetailSuccess = useCallback(() => { setSelectedRows([]); fetchData(); }, [fetchData]);

  const handleOpenBatchDetail = useCallback(() => { setIsBatchDetailOpen(true); }, []);
  const handleCloseBatchDetail = useCallback(() => { setIsBatchDetailOpen(false); }, []);
  const handleBatchDetailSuccess = useCallback(() => {
    setSelectedRows([]);
    setIsBatchDetailOpen(false);
    fetchData();
  }, [fetchData]);

  const handleExcelDownload = useCallback(async () => {
    setExcelDownloading(true);
    try {
      const f = filtersRef.current;
      const hasSelection = cfg.selectable && selectedRows.length > 0;
      const params = {
        status,
        ...(hasSelection
          ? { ids: selectedRows.map((r) => r.id) }
          : {
              ...(f.dateFrom && { dateFrom: f.dateFrom }),
              ...(f.dateTo && { dateTo: f.dateTo }),
              ...(f.title && { title: f.title }),
              ...(f.servTitle && { servTitle: f.servTitle }),
              ...(f.bssType && { bssType: f.bssType }),
              ...(f.servCd && { servCd: f.servCd }),
              ...(f.memberKeyword && { memberKeyword: f.memberKeyword }),
              ...(f.requesterKeyword && { requesterKeyword: f.requesterKeyword }),
            }),
      };
      await downloadSettlementByStatusExcel(params);
    } catch (err) {
      toast.error(t('manage.settlement.statusPanel.toastExcelDownloadFailed'));
      console.error('Excel download error:', err);
    } finally {
      setExcelDownloading(false);
    }
  }, [status, cfg.selectable, selectedRows, t]);

  return (
    <>
      <SettlementFilterBar
        filters={filters}
        onChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
        loading={loading}
        isOpen={isFilterOpen}
        onToggleOpen={() => setIsFilterOpen((prev) => !prev)}
      />

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      <div className="table-toolbar">
        <span className="record-count">
          {t('manage.common.recordCount', { count: pagination.totalElements.toLocaleString() })}
          {cfg.selectable && selectedRows.length > 0 && (
            <span className="selected-info">{t('manage.settlement.selectedCount', { count: selectedRows.length })}</span>
          )}
        </span>
        {cfg.batch && selectedRows.length > 0 && (
          <button className="btn-issue" onClick={handleOpenBatchDetail}>
            {status === 'WAITING_PAYMENT'
              ? t('manage.settlement.statusPanel.batchPaid', { count: selectedRows.length })
              : status === 'WAITING_CONFIRM'
                ? t('manage.settlement.statusPanel.batchConfirm', { count: selectedRows.length })
                : t('manage.settlement.statusPanel.batchExecute', { count: selectedRows.length })}
          </button>
        )}
        {cfg.excel && (
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

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          onRowClicked={onRowClicked}
          rowSelection={cfg.selectable ? 'multiple' : 'single'}
          animateRows={true}
          loading={loading}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('manage.common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
          getRowId={getRowId}
          headerHeight={36}
          rowHeight={38}
        />
      </div>

      <Pagination
        pagination={pagination}
        onPageChange={handlePageChange}
        onSizeChange={handleSizeChange}
        t={t}
      />

      <SettlementDetailModal
        open={isDetailOpen}
        settlement={selectedRow}
        status={status}
        onClose={handleDetailClose}
        onSuccess={handleDetailSuccess}
      />

      {cfg.batch && (
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
