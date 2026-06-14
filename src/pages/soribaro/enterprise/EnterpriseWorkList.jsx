import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageParams } from '../../../hooks/usePageParams';
import { useFilterParams } from '../../../hooks/useFilterParams';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { getEnterpriseWorkList, getEnterpriseList } from '../../../api/v9';
import { useCommonCodeStore } from '../../../stores/commonCodeStore';
import serviceStatuses from '../../../constants/serviceStatus.json';
import WorkStatusChipWithOverlay from '../../../components/common/WorkStatusChipWithOverlay';
import RequestRegisterModal from '../../../components/common/RequestRegisterModal';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './EnterpriseWorkList.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const parseDateString = (str) => {
  if (!str) return null;
  const trimmed = str.trim();
  if (trimmed.includes('-')) {
    const date = new Date(trimmed.replace(' ', 'T'));
    return isNaN(date.getTime()) ? null : date;
  }
  if (trimmed.length >= 14) {
    const y = trimmed.substring(0, 4);
    const m = trimmed.substring(4, 6);
    const d = trimmed.substring(6, 8);
    const h = trimmed.substring(8, 10);
    const mi = trimmed.substring(10, 12);
    const s = trimmed.substring(12, 14);
    return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}`);
  }
  return null;
};

const formatDateFull = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateString(dateString);
  if (!date || isNaN(date.getTime())) return dateString;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatRelativeTime = (dateString, t) => {
  if (!dateString) return '-';
  const date = parseDateString(dateString);
  if (!date || isNaN(date.getTime())) return dateString;
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);
  if (diffSec < 60) return t('common.justNow');
  if (diffMin < 60) return t('common.minutesAgo', { minutes: diffMin });
  if (diffHour < 24) return t('common.hoursAgo', { hours: diffHour });
  if (diffDay < 30) return t('common.daysAgo', { days: diffDay });
  if (diffMonth < 12) return t('common.monthsAgo', { months: diffMonth });
  return t('common.yearsAgo', { years: diffYear });
};

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
};

export default function EnterpriseWorkList({ videoYn, title, description }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const navigate = useNavigate();

  const getCodesByGroup = useCommonCodeStore((s) => s.getCodesByGroup);

  const SEARCH_FIELDS = useMemo(() => [
    { value: 'title', label: t('enterprise.searchFieldTitle') },
    { value: 'servCd', label: t('enterprise.searchFieldServiceCode') },
    { value: 'memberName', label: t('enterprise.searchFieldRequesterName') },
    { value: 'phone', label: t('enterprise.searchFieldContact') },
    { value: 'workerName', label: t('enterprise.searchFieldWorkerName') },
  ], [t]);

  const CancelCellRenderer = useCallback((params) => {
    const isCanceled = params.value === 'Y';
    if (!isCanceled) return <span className="cancel-badge">-</span>;
    return <span className="cancel-badge cancel-yes">{t('common.canceledLabel')}</span>;
  }, [t]);

  const getWorkStatLabel = useCallback((value) => {
    if (value == null || value === '') return '-';
    const codes = getCodesByGroup('WORK_STATUS');
    const strVal = String(value);
    const found = codes.find((c) => c.dtlCd === strVal);
    if (found) return found.dtlCdNm;
    const padded = strVal.padStart(2, '0');
    const foundPadded = codes.find((c) => c.dtlCd === padded);
    if (foundPadded) return foundPadded.dtlCdNm;
    return strVal;
  }, [getCodesByGroup]);

  // 상태
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [enterprises, setEnterprises] = useState([]);

  const { page: urlPage, size: urlSize, setPageParams } = usePageParams();
  const [pagination, setPagination] = useState({
    page: urlPage,
    size: urlSize,
    totalElements: 0,
    totalPages: 0,
  });

  const defaultFilters = useMemo(() => {
    const range = getDefaultDateRange();
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      overallStatus: '',
      cnlYn: '',
      company: '',
      searchField: 'title',
      searchText: '',
    };
  }, []);

  const { filters, setFilter, commit: commitFilters, reset: resetFilters } =
    useFilterParams(defaultFilters);

  // 업체 목록 로드
  useEffect(() => {
    const fetchEnterprises = async () => {
      try {
        const res = await getEnterpriseList({ page: 0, size: 1000 });
        if (res?.status === 'SUCCESS') {
          setEnterprises(res.data?.content || []);
        }
      } catch {
        // silent
      }
    };
    fetchEnterprises();
  }, []);

  const WorkStatusCellRenderer = useCallback((params) => {
    return <WorkStatusChipWithOverlay overallStatus={params.data?.overallStatus} servCd={params.data?.servCd} />;
  }, []);

  const columnDefs = useMemo(() => [
    { field: 'servCd', headerName: t('enterprise.columnServiceCode'), width: 150 },
    { field: 'servTitle', headerName: t('enterprise.columnTitle'), flex: 1, minWidth: 200, tooltipField: 'servTitle' },
    { field: 'entNm', headerName: t('enterprise.columnCompany'), width: 120 },
    { field: 'membNm', headerName: t('enterprise.columnRequester'), width: 100 },
    {
      field: 'overallStatus',
      headerName: t('enterprise.columnWorkStatus'),
      width: 120,
      cellRenderer: WorkStatusCellRenderer,
      cellClass: 'text-center',
    },
    { field: 'totalPlayTm', headerName: t('enterprise.columnPlayTime'), width: 100, cellClass: 'text-center', valueFormatter: (params) => params.value?.split('.')[0] || '-' },
    {
      field: 'worker',
      headerName: t('enterprise.columnWorker'),
      width: 140,
      tooltipValueGetter: (params) => params.data?.workerArr || '',
    },
    {
      field: 'regDttm',
      headerName: t('enterprise.columnRequestDate'),
      width: 140,
      valueFormatter: (params) => formatDateFull(params.value),
    },
    {
      field: 'cnlYn',
      headerName: t('enterprise.columnCancel'),
      width: 70,
      cellRenderer: CancelCellRenderer,
      cellClass: 'text-center',
    },
  ], [WorkStatusCellRenderer, CancelCellRenderer, t]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  const fetchData = useCallback(async (page = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: page + 1,
        size: pagination.size,
        videoYn,
        startDate: filters.startDate,
        endDate: filters.endDate,
        ...(filters.overallStatus && { overallStatus: filters.overallStatus }),
        ...(filters.cnlYn && { cnlYn: filters.cnlYn }),
        ...(filters.company && { company: filters.company }),
        ...(filters.searchText && { searchType: filters.searchField, searchText: filters.searchText }),
      };

      const response = await getEnterpriseWorkList(params);
      if (response.status === 'SUCCESS') {
        const data = response.data;
        setRowData(data.content || []);
        setPagination((prev) => ({
          ...prev,
          page: data.page,
          totalElements: data.totalElements,
          totalPages: data.totalPages,
        }));
      } else {
        setError(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      setError(err.message || t('common.loadDataFailed'));
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.size, videoYn]);

  const handleRowDoubleClicked = useCallback((event) => {
    const section = videoYn === 'Y' ? 'vod' : 'meeting';
    navigate(`/soribaro/enterprise/${section}/${event.data.servCd}`);
  }, [navigate, videoYn]);

  const handleSearch = useCallback(() => {
    // setSearchParams 두 번 호출 race 방지 — page/size 도 commit 의 overrides 로 같이 처리
    commitFilters({ page: 0, size: pagination.size });
    fetchData(0);
  }, [fetchData, pagination.size, commitFilters]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 0 && newPage < pagination.totalPages) {
      setPageParams(newPage, pagination.size);
      fetchData(newPage);
    }
  }, [fetchData, pagination.totalPages, pagination.size, setPageParams]);

  const handlePageSizeChange = useCallback((e) => {
    const newSize = Number(e.target.value);
    setPageParams(0, newSize);
    setPagination((prev) => ({ ...prev, size: newSize, page: 0 }));
  }, [setPageParams]);

  const prevSizeRef = useRef(pagination.size);
  useEffect(() => {
    if (prevSizeRef.current !== pagination.size && rowData.length > 0) {
      fetchData(0);
    }
    prevSizeRef.current = pagination.size;
  }, [pagination.size, fetchData, rowData.length]);

  const handleFilterChange = useCallback((field, value) => {
    setFilter(field, value);
  }, [setFilter]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleReset = useCallback(() => {
    resetFilters({ page: 0 });
    setRowData([]);
    setError(null);
    setPagination((prev) => ({ ...prev, page: 0, totalElements: 0, totalPages: 0 }));
  }, [resetFilters]);

  const onGridReady = useCallback(() => {
    fetchData(pagination.page);
  }, [fetchData, pagination.page]);

  const getRowId = useCallback((params) => params.data.servCd, []);

  const getRowClass = useCallback((params) => {
    if (params.data?.cnlYn === 'Y') return 'row-disabled';
    return '';
  }, []);

  // 의뢰 등록 모달
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const openRegisterModal = useCallback(() => setRegisterModalOpen(true), []);
  const closeRegisterModal = useCallback(() => setRegisterModalOpen(false), []);
  const handleRegisterSubmit = useCallback((result) => {
    console.log('의뢰 등록 완료:', result);
    fetchData(0);
  }, [fetchData]);

  const displayPage = pagination.page + 1;

  return (
    <div className="notion-page enterprise-work-page">
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>

      <div className="filter-bar">
        <input
          type="date"
          className="filter-date"
          value={filters.startDate}
          onChange={(e) => handleFilterChange('startDate', e.target.value)}
        />
        <span className="filter-date-separator">~</span>
        <input
          type="date"
          className="filter-date"
          value={filters.endDate}
          onChange={(e) => handleFilterChange('endDate', e.target.value)}
        />

        <select
          className="filter-select"
          value={filters.overallStatus}
          onChange={(e) => handleFilterChange('overallStatus', e.target.value)}
        >
          <option value="">{t('common.allWorkStatus')}</option>
          {serviceStatuses.map((opt) => (
            <option key={opt.status} value={opt.status}>{t(`common.status_${opt.status}`)}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.company}
          onChange={(e) => handleFilterChange('company', e.target.value)}
        >
          <option value="">{t('enterprise.allCompany')}</option>
          {enterprises.map((ent) => (
            <option key={ent.entNo} value={ent.entNo}>{ent.entNm}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.cnlYn}
          onChange={(e) => handleFilterChange('cnlYn', e.target.value)}
        >
          <option value="">{t('common.allCancelStatus')}</option>
          <option value="N">{t('common.cancelStatusNormal')}</option>
          <option value="Y">{t('common.cancelStatusCanceled')}</option>
        </select>

        <select
          className="filter-select"
          value={filters.searchField}
          onChange={(e) => handleFilterChange('searchField', e.target.value)}
        >
          {SEARCH_FIELDS.map((sf) => (
            <option key={sf.value} value={sf.value}>{sf.label}</option>
          ))}
        </select>

        <div className="filter-search">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="filter-input"
            value={filters.searchText}
            onChange={(e) => handleFilterChange('searchText', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('common.searchPlaceholder')}
          />
        </div>

        <div className="filter-actions">
          <button className="btn-ghost" onClick={handleReset}>{t('common.reset')}</button>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? t('common.searching') : t('common.search')}
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
          {t('common.countUnit', { count: pagination.totalElements.toLocaleString() })}
        </span>
        <button className="btn-primary" onClick={openRegisterModal}>
          {t('common:requestRegister.title')}
        </button>
      </div>

      <RequestRegisterModal
        open={registerModalOpen}
        onClose={closeRegisterModal}
        onSubmit={handleRegisterSubmit}
        type="enterprise"
        videoYn={videoYn}
      />

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onRowDoubleClicked={handleRowDoubleClicked}
          rowSelection="single"
          animateRows={true}
          loading={loading}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('common.noData')}</span>`}
          getRowId={getRowId}
          getRowClass={getRowClass}
          tooltipShowDelay={300}
          headerHeight={36}
          rowHeight={38}
        />
      </div>

      <div className="pagination">
        <div className="pagination-size">
          <select value={pagination.size} onChange={handlePageSizeChange}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{t('common.countUnit', { count: n })}</option>)}
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
    </div>
  );
}
