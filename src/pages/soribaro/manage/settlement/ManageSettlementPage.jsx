import { useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import { getPendingSettlements } from '../../../../api/v9/settlement';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';
import { getProjectStatusChipSx } from '../../../../utils/projectStatusUtils';
import SettlementStatusPanel from './SettlementStatusPanel';
import SettlementAggregationPanel from './SettlementAggregationPanel';
import SettlementIssueModal from './SettlementIssueModal';
import SettlementFilterBar from './SettlementFilterBar';
import Pagination from './Pagination';
import { toast } from '../../../../components/common/Toast';
import '../../../../styles/notion-list.css';
import './ManageSettlementPage.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const TABS = [
  { key: 'manage.settlement.tabs.pending' },
  { key: 'manage.settlement.tabs.issued', status: 'ISSUED' },
  { key: 'manage.settlement.tabs.waitingConfirm', status: 'WAITING_CONFIRM' },
  { key: 'manage.settlement.tabs.rejected', status: 'REJECTED' },
  { key: 'manage.settlement.tabs.waitingPayment', status: 'WAITING_PAYMENT' },
  { key: 'manage.settlement.tabs.paid', status: 'PAID' },
  { key: 'manage.settlement.tabs.aggregation', type: 'aggregation' },
];

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return <div className="settlement-tab-panel" role="tabpanel">{children}</div>;
}

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

function getMonthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dateFrom: fmt(first), dateTo: fmt(last) };
}

function getDefaultFilters() {
  return { ...INITIAL_FILTERS, ...getMonthRange(0) };
}

function getInitialTabIndex(searchParams) {
  const tabParam = searchParams.get('tab');
  if (!tabParam) return 0;
  const idx = TABS.findIndex((tab) => (tab.status || tab.type || 'pending') === tabParam);
  return idx >= 0 ? idx : 0;
}

export default function ManageSettlementPage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabIndex, setTabIndex] = useState(() => getInitialTabIndex(searchParams));

  const getCodeLabel = useCommonCodeStore((s) => s.getCodeLabel);

  const StatusCellRenderer = useCallback((params) => {
    if (!params.value) return '-';
    const chipSx = getProjectStatusChipSx(params.value);
    return (
      <span
        className="status-badge"
        style={{ backgroundColor: chipSx.backgroundColor, color: chipSx.color, border: `1px solid ${chipSx.borderColor}` }}
      >
        {t(`common.status_${params.value}`)}
      </span>
    );
  }, [t]);

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 0, size: 20, totalElements: 0, totalPages: 0 });
  const [filters, setFilters] = useState(() => getDefaultFilters());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

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
      const requestParams = {
        page: params.page ?? p.page,
        size: params.size ?? p.size,
        title: params.title ?? f.title,
        servTitle: params.servTitle ?? f.servTitle,
        bssType: params.bssType ?? f.bssType,
        servCd: params.servCd ?? f.servCd,
        memberKeyword: params.memberKeyword ?? f.memberKeyword,
        requesterKeyword: params.requesterKeyword ?? f.requesterKeyword,
        dateFrom: params.dateFrom ?? f.dateFrom,
        dateTo: params.dateTo ?? f.dateTo,
      };
      const response = await getPendingSettlements(requestParams);
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
  }, []); // stable — reads state via refs

  const columnDefs = useMemo(() => [
    { headerCheckboxSelection: true, checkboxSelection: true, width: 50, maxWidth: 50, suppressMovable: true, sortable: false, resizable: false },
    { field: 'fileNo', headerName: t('manage.settlement.columns.fileNo'), width: 100, cellClass: 'text-center' },
    { field: 'servCd', headerName: t('manage.settlement.columns.servCd'), width: 160 },
    { field: 'entNm', headerName: t('manage.settlement.columns.entNm'), width: 140, valueFormatter: (p) => p.value || '-' },
    { field: 'fileNm', headerName: t('manage.settlement.columns.fileNm'), flex: 1, minWidth: 180 },
    { field: 'title', headerName: t('manage.settlement.columns.title'), flex: 1, minWidth: 160 },
    { field: 'servTitle', headerName: t('manage.settlement.columns.servTitle'), width: 130 },
    {
      field: 'bssTypeName',
      headerName: t('manage.settlement.columns.bssType'),
      width: 100,
      cellClass: 'text-center',
      valueGetter: (p) => p.data?.bssTypeName || getCodeLabel('BSS_TYPE', p.data?.bssType) || p.data?.bssType || '-',
    },
    { field: 'workerName', headerName: t('manage.settlement.columns.workerId'), width: 120, valueFormatter: (p) => p.value === 'unknown' ? '-' : (p.value || '-') },
    { field: 'checkerName', headerName: t('manage.settlement.columns.checkerId'), width: 120, valueFormatter: (p) => p.value === 'unknown' ? '-' : (p.value || '-') },
    { field: 'workType', headerName: t('manage.settlement.columns.workType'), width: 110, cellClass: 'text-center' },
    { field: 'status', headerName: t('manage.settlement.columns.status'), width: 130, cellRenderer: StatusCellRenderer, cellClass: 'text-center' },
    { field: 'accuracy', headerName: t('manage.settlement.columns.accuracy'), width: 100, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? `${p.value}%` : '-' },
    { field: 'errorCount', headerName: t('manage.settlement.columns.errorCount'), width: 100, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? `${p.value}` : '-' },
    { field: 'formErrorCount', headerName: t('manage.settlement.columns.formErrorCount'), width: 100, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? `${p.value}` : '-' },
  ], [getCodeLabel, t]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, suppressMovable: false }), []);

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSearch = useCallback(() => {
    setSelectedRows([]);
    fetchData({ page: 0 });
  }, [fetchData]);

  const handleMonthPreset = useCallback((offset) => {
    const range = getMonthRange(offset);
    setFilters((prev) => ({ ...prev, ...range }));
    setSelectedRows([]);
    // pass explicit date override since ref may not be updated yet
    fetchData({ ...range, page: 0 });
  }, [fetchData]);

  const handleReset = useCallback(() => {
    const next = getDefaultFilters();
    setFilters(next);
    setIsFilterOpen(false);
    setSelectedRows([]);
    fetchData({ ...next, page: 0 });
  }, [fetchData]);

  const onGridReady = useCallback(() => { fetchData(); }, [fetchData]);

  const getRowId = useCallback((params) =>
    `${params.data.id}-${params.data.fileNo}-${params.data.startSec}-${params.data.endSec}`, []);

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRows(selectedNodes ? selectedNodes.map((n) => n.data) : []);
  }, []);

  const COPYABLE_FIELDS = useMemo(() => ({
    fileNo: t('manage.settlement.columns.fileNo'),
    servCd: t('manage.settlement.columns.servCd'),
    workerName: t('manage.settlement.columns.workerId'),
    checkerName: t('manage.settlement.columns.checkerId'),
  }), [t]);

  const handleCellDoubleClickedCopy = useCallback(async (params) => {
    const field = params?.colDef?.field;
    if (!field || !(field in COPYABLE_FIELDS)) return;
    const raw = params.value;
    if (raw == null || raw === '' || raw === 'unknown' || raw === '-') return;
    const value = String(raw);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success(`${COPYABLE_FIELDS[field]} 복사됨: ${value}`);
    } catch (err) {
      toast.error(`복사에 실패했습니다: ${err?.message || ''}`);
    }
  }, [COPYABLE_FIELDS]);

  const handlePageChange = useCallback((newPage) => { fetchData({ page: newPage }); }, [fetchData]);
  const handleSizeChange = useCallback((newSize) => {
    setPagination((prev) => ({ ...prev, size: newSize }));
    fetchData({ page: 0, size: newSize });
  }, [fetchData]);

  const handleOpenIssueModal = useCallback(() => { setIsIssueModalOpen(true); }, []);
  const handleCloseIssueModal = useCallback(() => { setIsIssueModalOpen(false); }, []);
  const handleIssueSuccess = useCallback(() => {
    setSelectedRows([]);
    fetchData({ page: 0 });
  }, [fetchData]);

  return (
    <div className="notion-page manage-settlement-page">
      <div className="page-header">
        <h1 className="page-title">{t('manage.settlement.pageTitle')}</h1>
        <p className="page-description">{t('manage.settlement.pageDescription')}</p>
      </div>

      <Box className="settlement-tabs-container">
        <Tabs
          value={tabIndex}
          onChange={(_, newValue) => {
            setTabIndex(newValue);
            const tab = TABS[newValue];
            const tabKey = tab.status || tab.type || 'pending';
            setSearchParams({ tab: tabKey }, { replace: true });
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: '1px solid var(--border-color)',
            minHeight: '40px',
            '& .MuiTab-root': { color: 'var(--text-secondary)', fontWeight: 500, fontSize: '13px', minHeight: '40px', padding: '8px 16px', textTransform: 'none' },
            '& .Mui-selected': { color: 'var(--accent-color) !important', fontWeight: 600 },
            '& .MuiTabs-indicator': { backgroundColor: 'var(--accent-color)' },
          }}
        >
          {TABS.map((tab) => <Tab key={tab.key} label={t(tab.key)} />)}
        </Tabs>
      </Box>

      <TabPanel value={tabIndex} index={0}>
        <SettlementFilterBar
          filters={filters}
          onChange={handleFilterChange}
          onSearch={handleSearch}
          onReset={handleReset}
          loading={loading}
          isOpen={isFilterOpen}
          onToggleOpen={() => setIsFilterOpen((prev) => !prev)}
          showTitleInBar
          showMonthPresets
          onMonthPreset={handleMonthPreset}
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
            {selectedRows.length > 0 && (
              <span className="selected-info">{t('manage.settlement.selectedCount', { count: selectedRows.length })}</span>
            )}
          </span>
          {selectedRows.length > 0 && (
            <button className="btn-issue" onClick={handleOpenIssueModal}>
              {t('manage.settlement.issueSettlement')}
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
            onCellDoubleClicked={handleCellDoubleClickedCopy}
            rowSelection="multiple"
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
      </TabPanel>

      {TABS.slice(1).map((tab, idx) => (
        <TabPanel key={tab.status || tab.type} value={tabIndex} index={idx + 1}>
          {tab.type === 'aggregation'
            ? <SettlementAggregationPanel />
            : <SettlementStatusPanel status={tab.status} />
          }
        </TabPanel>
      ))}

      <SettlementIssueModal
        open={isIssueModalOpen}
        items={selectedRows}
        onClose={handleCloseIssueModal}
        onSuccess={handleIssueSuccess}
      />
    </div>
  );
}
