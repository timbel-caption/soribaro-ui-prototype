import { useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getPendingSettlements } from '../../../../api/v9/settlement';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';
import { getProjectStatusChipSx } from '../../../../utils/projectStatusUtils';
import SettlementStatusPanel from './SettlementStatusPanel';
import SettlementAggregationPanel from './SettlementAggregationPanel';
import SettlementIssueModal from './SettlementIssueModal';
import { toast } from '../../../../components/common/Toast';
import '../../../../styles/notion-list.css';
import './ManageSettlementPage.css';

// ag-grid 모듈 등록
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

// 탭 패널 컴포넌트
function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return (
    <div className="settlement-tab-panel" role="tabpanel">
      {children}
    </div>
  );
}

// StatusCellRenderer는 컴포넌트 내부에서 useCallback으로 정의 (t 함수 접근 필요)

// 검색 필터 초기값
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

// 월 범위 계산 (로컬 기준). offset: 0=이번달, -1=저번달
// toISOString()은 UTC 변환되어 날짜가 하루 밀릴 수 있으므로 로컬 기준으로 직접 포맷팅
function getMonthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dateFrom: fmt(first), dateTo: fmt(last) };
}

// 기본 필터: 검색 필터 초기값 + 이번달 날짜 범위
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

  // 공통코드 스토어
  const getCodeOptions = useCommonCodeStore((s) => s.getCodeOptions);
  const getCodeLabel = useCommonCodeStore((s) => s.getCodeLabel);
  const bssTypeOptions = getCodeOptions('BSS_TYPE');

  const StatusCellRenderer = useCallback((params) => {
    if (!params.value) return '-';
    const chipSx = getProjectStatusChipSx(params.value);
    return (
      <span
        className="status-badge"
        style={{
          backgroundColor: chipSx.backgroundColor,
          color: chipSx.color,
          border: `1px solid ${chipSx.borderColor}`,
        }}
      >
        {t(`common.status_${params.value}`)}
      </span>
    );
  }, [t]);

  // 상태 관리
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);

  // 페이징 상태 (page 0-based)
  const [pagination, setPagination] = useState({
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });

  // 검색 필터 상태
  const [filters, setFilters] = useState(() => getDefaultFilters());
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // 정산서 발행 모달
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  // 정산대기 목록 조회
  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const requestParams = {
        page: params.page ?? pagination.page,
        size: params.size ?? pagination.size,
        title: params.title ?? filters.title,
        servTitle: params.servTitle ?? filters.servTitle,
        bssType: params.bssType ?? filters.bssType,
        servCd: params.servCd ?? filters.servCd,
        memberKeyword: params.memberKeyword ?? filters.memberKeyword,
        requesterKeyword: params.requesterKeyword ?? filters.requesterKeyword,
        dateFrom: params.dateFrom ?? filters.dateFrom,
        dateTo: params.dateTo ?? filters.dateTo,
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
  }, [filters, pagination.page, pagination.size]);

  // 컬럼 정의
  const columnDefs = useMemo(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      maxWidth: 50,
      suppressMovable: true,
      sortable: false,
      resizable: false,
    },
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
      valueGetter: (p) =>
        p.data?.bssTypeName ||
        getCodeLabel('BSS_TYPE', p.data?.bssType) ||
        p.data?.bssType ||
        '-',
    },
    { field: 'workerName', headerName: t('manage.settlement.columns.workerId'), width: 120, valueFormatter: (p) => p.value === 'unknown' ? '-' : (p.value || '-') },
    { field: 'checkerName', headerName: t('manage.settlement.columns.checkerId'), width: 120, valueFormatter: (p) => p.value === 'unknown' ? '-' : (p.value || '-') },
    { field: 'workType', headerName: t('manage.settlement.columns.workType'), width: 110, cellClass: 'text-center' },
    { field: 'status', headerName: t('manage.settlement.columns.status'), width: 130, cellRenderer: StatusCellRenderer, cellClass: 'text-center' },
    {
      field: 'accuracy',
      headerName: t('manage.settlement.columns.accuracy'),
      width: 100,
      cellClass: 'text-center',
      valueFormatter: (p) => p.value != null ? `${p.value}%` : '-',
    },
    {
      field: 'errorCount',
      headerName: t('manage.settlement.columns.errorCount'),
      width: 100,
      cellClass: 'text-center',
      valueFormatter: (p) => p.value != null ? `${p.value}` : '-',
    },
    {
      field: 'formErrorCount',
      headerName: t('manage.settlement.columns.formErrorCount'),
      width: 100,
      cellClass: 'text-center',
      valueFormatter: (p) => p.value != null ? `${p.value}` : '-',
    },
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

  const getRowId = useCallback((params) => `${params.data.id}-${params.data.fileNo}-${params.data.startSec}-${params.data.endSec}`, []);

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRows(selectedNodes ? selectedNodes.map((n) => n.data) : []);
  }, []);

  // 더블클릭 시 클립보드 복사 대상 컬럼 (필드명 → 라벨 매핑)
  const COPYABLE_FIELDS = useMemo(
    () => ({
      fileNo: t('manage.settlement.columns.fileNo'),
      servCd: t('manage.settlement.columns.servCd'),
      workerName: t('manage.settlement.columns.workerId'),
      checkerName: t('manage.settlement.columns.checkerId'),
    }),
    [t],
  );

  const handleCellDoubleClickedCopy = useCallback(
    async (params) => {
      const field = params?.colDef?.field;
      if (!field || !(field in COPYABLE_FIELDS)) return;

      const raw = params.value;
      if (raw == null || raw === '' || raw === 'unknown' || raw === '-') return;

      const value = String(raw);
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          // 폴백: 비-secure context 환경
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
    },
    [COPYABLE_FIELDS],
  );

  const handlePageChange = useCallback((newPage) => { fetchData({ page: newPage }); }, [fetchData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleOpenIssueModal = useCallback(() => { setIsIssueModalOpen(true); }, []);
  const handleCloseIssueModal = useCallback(() => { setIsIssueModalOpen(false); }, []);
  const handleIssueSuccess = useCallback(() => {
    setSelectedRows([]);
    fetchData({ page: 0 });
  }, [fetchData]);

  const displayPage = pagination.page + 1;

  return (
    <div className="notion-page manage-settlement-page">
      <div className="page-header">
        <h1 className="page-title">{t('manage.settlement.pageTitle')}</h1>
        <p className="page-description">{t('manage.settlement.pageDescription')}</p>
      </div>

      {/* 탭 네비게이션 */}
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
            '& .MuiTab-root': {
              color: 'var(--text-secondary)',
              fontWeight: 500,
              fontSize: '13px',
              minHeight: '40px',
              padding: '8px 16px',
              textTransform: 'none',
            },
            '& .Mui-selected': {
              color: 'var(--accent-color) !important',
              fontWeight: 600,
            },
            '& .MuiTabs-indicator': {
              backgroundColor: 'var(--accent-color)',
            },
          }}
        >
          {TABS.map((tab) => (
            <Tab key={tab.key} label={t(tab.key)} />
          ))}
        </Tabs>
      </Box>

      {/* 대기 탭 */}
      <TabPanel value={tabIndex} index={0}>

      <div className="filter-bar">
        <div className="filter-search">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="filter-input"
            value={filters.title}
            onChange={(e) => handleFilterChange('title', e.target.value)}
            placeholder={t('manage.settlement.searchPlaceholder')}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="filter-date-group">
          <input
            type="date"
            className="filter-date-input"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="filter-date-sep">~</span>
          <input
            type="date"
            className="filter-date-input"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="filter-month-btn" onClick={() => handleMonthPreset(0)}>
            {t('manage.settlement.thisMonth')}
          </button>
          <button type="button" className="filter-month-btn" onClick={() => handleMonthPreset(-1)}>
            {t('manage.settlement.lastMonth')}
          </button>
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

      </TabPanel>

      {/* 상태별 탭 (발행 ~ 확인완료) */}
      {TABS.slice(1).map((tab, idx) => (
        <TabPanel key={tab.status || tab.type} value={tabIndex} index={idx + 1}>
          {tab.type === 'aggregation'
            ? <SettlementAggregationPanel />
            : <SettlementStatusPanel status={tab.status} />
          }
        </TabPanel>
      ))}

      {/* 정산서 발행 모달 */}
      <SettlementIssueModal
        open={isIssueModalOpen}
        items={selectedRows}
        onClose={handleCloseIssueModal}
        onSuccess={handleIssueSuccess}
      />
    </div>
  );
}
