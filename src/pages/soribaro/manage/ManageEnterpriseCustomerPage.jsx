import { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageParams } from '../../../hooks/usePageParams';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import {
  getEnterpriseCustomerList,
  downloadEnterpriseCustomerExcel,
} from '../../../api/v9';
import { useTranslation } from 'react-i18next';
import AddEnterpriseCustomerModal from './AddEnterpriseCustomerModal';
import '../../../styles/notion-list.css';
import './ManageEnterpriseCustomerPage.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const PLATFORM_OPTIONS = [
  { value: '', key: 'all' },
  { value: '소리바로', key: 'soribaro' },
  { value: '클립데스크', key: 'clipdesk' },
];

const STATUS_OPTIONS = [
  { value: '', key: 'all' },
  { value: '정상', key: 'active' },
  { value: '대기', key: 'pending' },
  { value: '탈퇴', key: 'withdrawn' },
];

const StatusCellRenderer = (params) => {
  const status = params.value;
  const cls = status === '정상' ? 'active' : status === '대기' ? 'pending' : status === '탈퇴' ? 'withdrawn' : '';
  return <span className={`customer-status-badge ${cls}`}>{status || '-'}</span>;
};

export default function ManageEnterpriseCustomerPage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { page: urlPage, size: urlSize, setPageParams } = usePageParams();
  const [pagination, setPagination] = useState({
    page: urlPage,
    size: urlSize,
    totalElements: 0,
    totalPages: 0,
  });

  const [filters, setFilters] = useState({
    platform: '',
    status: '',
    searchText: '',
  });

  const navigate = useNavigate();

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const requestParams = {
        page: (params.page ?? pagination.page) + 1,
        size: params.size ?? pagination.size,
        platform: params.platform ?? filters.platform,
        status: params.status ?? filters.status,
        searchText: params.searchText ?? filters.searchText,
      };
      const response = await getEnterpriseCustomerList(requestParams);
      if (response.status === 'SUCCESS') {
        const data = response.data;
        setRowData(data.content || []);
        setPagination({
          page: data.page ?? 0,
          size: data.size ?? requestParams.size,
          totalElements: data.totalElements ?? 0,
          totalPages: data.totalPages ?? 0,
        });
      } else {
        setError(response.message || t('manage.common.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.size]);

  const columnDefs = useMemo(() => [
    { field: 'membNo', headerName: t('manage.enterprise.customer.columns.membNo'), width: 80, cellClass: 'text-center' },
    { field: 'platform', headerName: t('manage.enterprise.customer.columns.platform'), width: 110, cellClass: 'text-center' },
    { field: 'membId', headerName: t('manage.enterprise.customer.columns.membId'), width: 200 },
    { field: 'membNm', headerName: t('manage.enterprise.customer.columns.membNm'), width: 100 },
    { field: 'entNm', headerName: t('manage.enterprise.customer.columns.entNm'), flex: 1, minWidth: 150 },
    { field: 'mblTelNo', headerName: t('manage.enterprise.customer.columns.mblTelNo'), width: 140 },
    { field: 'status', headerName: t('manage.enterprise.customer.columns.status'), width: 90, cellRenderer: StatusCellRenderer, cellClass: 'text-center' },
    { field: 'regDttm', headerName: t('manage.enterprise.customer.columns.regDttm'), width: 160 },
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
    setPageParams(0, pagination.size);
    fetchData({ page: 0 });
  }, [fetchData, setPageParams, pagination.size]);

  const handleReset = useCallback(() => {
    setFilters({ platform: '', status: '', searchText: '' });
    setPageParams(0, pagination.size);
    fetchData({ platform: '', status: '', searchText: '', page: 0 });
  }, [fetchData, setPageParams, pagination.size]);

  const handleExcelDownload = useCallback(async () => {
    setExcelLoading(true);
    try {
      await downloadEnterpriseCustomerExcel({
        platform: filters.platform,
        status: filters.status,
        searchText: filters.searchText,
      });
    } catch (err) {
      alert(err.message || t('manage.enterprise.customer.excelDownloadFailed'));
    } finally {
      setExcelLoading(false);
    }
  }, [filters]);

  const onGridReady = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const getRowId = useCallback((params) => String(params.data.membNo), []);

  const handleRowDoubleClick = useCallback((event) => {
    navigate(`/soribaro/manage/enterprise-customer/${event.data.membNo}`);
  }, [navigate]);

  const handlePageChange = useCallback((newPage) => {
    setPageParams(newPage, pagination.size);
    fetchData({ page: newPage });
  }, [fetchData, setPageParams, pagination.size]);

  const displayPage = pagination.page + 1;

  return (
    <div className="notion-page manage-enterprise-customer-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">{t('manage.enterprise.customer.pageTitle')}</h1>
            <p className="page-description">{t('manage.enterprise.customer.pageDescription')}</p>
          </div>
          <button className="btn-primary" onClick={() => setAddModalOpen(true)}>
            {t('manage.enterprise.customer.addCustomer')}
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="filter-input"
            value={filters.searchText}
            onChange={(e) => handleFilterChange('searchText', e.target.value)}
            placeholder={t('manage.enterprise.customer.searchPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <select className="filter-select" value={filters.platform} onChange={(e) => handleFilterChange('platform', e.target.value)}>
          {PLATFORM_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{t(`manage.enterprise.customer.platform.${opt.key}`)}</option>)}
        </select>

        <select className="filter-select" value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
          {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{t(`manage.enterprise.customer.status.${opt.key}`)}</option>)}
        </select>

        <div className="filter-actions">
          <button className="btn-ghost" onClick={handleReset}>{t('manage.common.reset')}</button>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? t('manage.common.searching') : t('manage.common.search')}
          </button>
          <button className="btn-ghost btn-excel" onClick={handleExcelDownload} disabled={excelLoading}>
            {excelLoading ? t('manage.enterprise.customer.downloading') : t('manage.enterprise.customer.excelDownload')}
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
        <span className="record-count">{t('manage.common.recordCount', { count: pagination.totalElements.toLocaleString() })}</span>
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onRowDoubleClicked={handleRowDoubleClick}
          rowSelection="single"
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
              setPageParams(0, newSize);
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
              <button key={p} className={p === current ? 'active' : ''} onClick={() => handlePageChange(p - 1)}>{p}</button>
            ));
          })()}
          <button disabled={pagination.page >= pagination.totalPages - 1} onClick={() => handlePageChange(pagination.page + 1)}>&rsaquo;</button>
          <button disabled={pagination.page >= pagination.totalPages - 1} onClick={() => handlePageChange(pagination.totalPages - 1)}>&raquo;</button>
        </div>
        <span className="pagination-info">{displayPage} / {pagination.totalPages || 1}</span>
      </div>

      <AddEnterpriseCustomerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => fetchData({ page: 0 })}
      />
    </div>
  );
}
