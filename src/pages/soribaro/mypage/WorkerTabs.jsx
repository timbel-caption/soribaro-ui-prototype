import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { getMyTaskFiles, getSettlementsByStatus, getSettlements, getMySettlementMonthlySummary } from '../../../api/v9';
import SettlementDetailModal from '../manage/settlement/SettlementDetailModal';
import SettlementBatchConfirmModal from '../manage/settlement/SettlementBatchConfirmModal';
import { toast } from '../../../stores/toastStore';
import { isWorkStartBlockedStatus, isReviewStartBlockedStatus } from '../../../utils/projectStatusUtils';
import { toAppUrl } from '../../../utils/worktoolRoute';
import '../../../styles/notion-list.css';

ModuleRegistry.registerModules([AllCommunityModule]);

// ─── Constants ────────────────────────────────────────

const DETAIL_PATHS = {
  record: (servCd) => `/soribaro/recording/work/${servCd}`,
  meeting: (servCd) => `/soribaro/enterprise/meeting/${servCd}`,
  vod: (servCd) => `/soribaro/enterprise/vod/${servCd}`,
  translate: (servCd) => `/soribaro/translation/work/${servCd}`,
};

const SECTION_CONFIG = [
  { key: 'record', apiType: 'record' },
  { key: 'meeting', apiType: 'enterprise_audio' },
  { key: 'vod', apiType: 'enterprise_video' },
  { key: 'translate', apiType: 'translate' },
];

const SECTION_LABEL_KEYS = {
  record: 'mypage.sectionRecord',
  meeting: 'mypage.sectionMeeting',
  vod: 'mypage.sectionVod',
  translate: 'mypage.sectionTranslate',
};

const SETTLEMENT_STATUS_CLASS = {
  WAITING_CONFIRM: 'settlement-status-waiting',
  REJECTED: 'settlement-status-rejected',
  WAITING_PAYMENT: 'settlement-status-payment',
  PAID: 'settlement-status-paid',
};

const STATUS_API_MAPPING = {
  REVIEW_DONE: ['REVIEW_DONE', 'READONLY'],
};

const PAGE_SIZE_SETTLEMENT = 20;

// ─── Helpers ──────────────────────────────────────────

const parseDateString = (str) => {
  if (!str) return null;
  const trimmed = str.trim();
  if (trimmed.includes('-')) return new Date(trimmed.replace(' ', 'T'));
  if (trimmed.length >= 14) {
    const y = trimmed.substring(0, 4), m = trimmed.substring(4, 6), d = trimmed.substring(6, 8);
    const h = trimmed.substring(8, 10), mi = trimmed.substring(10, 12), s = trimmed.substring(12, 14);
    return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}`);
  }
  return null;
};

const formatRelativeTime = (dateString, t) => {
  if (!dateString) return '-';
  const date = parseDateString(dateString);
  if (!date || isNaN(date.getTime())) return dateString;
  const diffMs = Date.now() - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return t('common.justNow');
  if (diffMin < 60) return t('common.minutesAgo', { minutes: diffMin });
  if (diffHour < 24) return t('common.hoursAgo', { hours: diffHour });
  if (diffDay < 30) return t('common.daysAgo', { days: diffDay });
  return dateString;
};

const formatDateFull = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateString(dateString);
  if (!date || isNaN(date.getTime())) return dateString;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatSecondsToHMS = (totalSec) => {
  const sec = Math.round(totalSec);
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const formatWorkTime = (row) => {
  if (row.isSplit) {
    const duration = (row.endSec ?? 0) - (row.startSec ?? 0);
    return formatSecondsToHMS(duration);
  }
  return row.totalPlayTm || '-';
};

function getSettlementStatus(item) {
  if (item.isPaid) return 'PAID';
  if (item.isWorkerConfirmed) return 'WAITING_PAYMENT';
  if (item.isWorkerReject) return 'REJECTED';
  if (item.isExecutorConfirmed) return 'WAITING_CONFIRM';
  return 'ISSUED';
}

export function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ─── AccordionGridSection ─────────────────────────────

function AccordionGridSection({ sectionKey, apiType, role, status, fetchFn = getMyTaskFiles, filters, searchTrigger, t, navigate }) {
  const [expanded, setExpanded] = useState(true);
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 0, totalElements: 0, totalPages: 0 });
  const hasFetchedRef = useRef(false);
  const PAGE_SIZE = 5;


  const fetchData = useCallback(async (page = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        role,
        status: STATUS_API_MAPPING[status] || status,
        type: apiType,
        page: page + 1,
        size: PAGE_SIZE,
      };
      if (filters?.startDate) params.startDate = filters.startDate;
      if (filters?.endDate) params.endDate = filters.endDate;
      const searchText = filters?.searchText?.trim();
      if (searchText && filters?.searchField) {
        params.searchType = filters.searchField;
        params.searchText = searchText;
      }
      const response = await fetchFn(params);
      if (response.status === 'SUCCESS') {
        const data = response.data;
        const items = data.content || [];
        setRowData((prev) => page === 0 ? items : [...prev, ...items]);
        setPagination({ page: data.page, totalElements: data.totalElements, totalPages: data.totalPages });
        if (page === 0) {
          setExpanded(data.totalElements > 0);
        }
      } else {
        setError(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      setError(err.message || t('common.loadDataFailed'));
    } finally {
      setLoading(false);
    }
  }, [apiType, role, status, fetchFn, t, filters?.startDate, filters?.endDate, filters?.searchField, filters?.searchText]);

  useEffect(() => {
    hasFetchedRef.current = false;
    setRowData([]);
    setPagination({ page: 0, totalElements: 0, totalPages: 0 });
  }, [role, status]);

  useEffect(() => {
    if (expanded && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchData(0);
    }
  }, [expanded, fetchData, role, status]);

  useEffect(() => {
    if (searchTrigger > 0 && hasFetchedRef.current) {
      fetchData(0);
    }
  }, [searchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRowClick = useCallback((row) => {
    const servCd = row.servCd;
    if (!servCd) return;
    const pathFn = DETAIL_PATHS[sectionKey];
    if (pathFn) navigate(pathFn(servCd));
  }, [sectionKey, navigate]);

  const isWorkStartDisabled = useCallback((row) => {
    if (!row) return false;
    if (role === 'checker' || row.assignRole === 'CHECKER') return isReviewStartBlockedStatus(row.fileStatus);
    return false;
  }, [role]);

  const handleStartWork = useCallback((row) => {
    if (isWorkStartDisabled(row)) return;
    const { projectFileId, fileNo, servCd, assignRole, isSplit, startSec, endSec, playTm, fileStatus } = row;
    if (!projectFileId || !fileNo || !servCd) return;
    const isWorkerReadOnly = role === 'worker' && isWorkStartBlockedStatus(fileStatus);
    const roleParam = assignRole === 'CHECKER' ? 'START_REVIEW' : 'START';
    let path = `/worktool/${projectFileId}/${fileNo}/${servCd}?role=${roleParam}&isSplit=${!!isSplit}`;
    if (isSplit) path += `&start_sec=${startSec}&end_sec=${endSec}`;
    const duration = isSplit ? (endSec - startSec) : playTm;
    if (duration) path += `&play_tm=${duration}`;
    if (isWorkerReadOnly) path += '&readonly=true';
    path += '&popup=true';
    const workCategory = sectionKey === 'translate' ? 'translation' : sectionKey;
    if (['vod', 'meeting', 'record', 'translation'].includes(workCategory)) {
      path += `&workCategory=${workCategory}`;
    }
    window.open(toAppUrl(path), `worktool_${projectFileId}`, 'popup,width=1400,height=900');
  }, [isWorkStartDisabled, role, sectionKey]);

  const handleLoadMore = useCallback(() => {
    fetchData(pagination.page + 1);
  }, [fetchData, pagination.page]);

  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);

  const ProjectCellRenderer = useCallback((params) => {
    const row = params.data;
    if (!row) return '-';
    return (
      <div className="cell-project-inner">
        <span className="cell-project-name" title={row.projectTitle}>{row.projectTitle || '-'}</span>
        {(row.commentCnt > 0 || row.reviewTagCnt > 0) && (
          <span className="cell-badges">
            {row.commentCnt > 0 && (
              <span className="cell-badge cell-badge-comment" title={t('mypage.commentCount')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {row.commentCnt}
              </span>
            )}
            {row.reviewTagCnt > 0 && (
              <span className="cell-badge cell-badge-tag" title={t('mypage.reviewTagCount')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                {row.reviewTagCnt}
              </span>
            )}
          </span>
        )}
      </div>
    );
  }, [t]);

  const FileStatusCellRenderer = useCallback((params) => {
    const status = params.value;
    return (
      <span className={`status-badge status-file-${status?.toLowerCase()}`}>
        {status ? t(`common.status_${status}`) : '-'}
      </span>
    );
  }, [t]);

  const AssignRoleCellRenderer = useCallback((params) => {
    const role = params.value;
    return (
      <span className={`role-badge role-${role?.toLowerCase()}`}>
        {t(`mypage.assignRole_${role}`) || '-'}
      </span>
    );
  }, [t]);

  const ActionsCellRenderer = useCallback((params) => {
    const row = params.data;
    if (!row) return null;
    const workStartDisabled = isWorkStartDisabled(row);
    return (
      <div className="action-buttons">
        <button className="btn-action-detail" onClick={() => handleRowClick(row)}>{t('mypage.buttonViewDetail')}</button>
        <button className="btn-action-work" onClick={() => handleStartWork(row)} disabled={workStartDisabled}>{t('mypage.buttonStartWork')}</button>
      </div>
    );
  }, [handleRowClick, handleStartWork, isWorkStartDisabled, t]);

  const columnDefs = useMemo(() => [
    { field: 'projectTitle', headerName: t('mypage.columnProjectName'), width: 180, cellRenderer: ProjectCellRenderer, tooltipField: 'projectTitle' },
    { field: 'servTitle', headerName: t('mypage.columnServiceTitle'), flex: 1, minWidth: 120, tooltipField: 'servTitle' },
    { field: 'servCd', headerName: t('mypage.columnServiceCode'), width: 150 },
    { field: 'fileNo', headerName: t('mypage.columnFileNo'), width: 80, cellClass: 'text-center' },
    { field: 'fileStatus', headerName: t('mypage.columnFileStatus'), width: 90, cellRenderer: FileStatusCellRenderer, cellClass: 'text-center' },
    { field: 'assignRole', headerName: t('mypage.columnAssignRole'), width: 90, cellRenderer: AssignRoleCellRenderer, cellClass: 'text-center' },
    { field: 'workTime', headerName: t('mypage.columnSplitRange'), width: 120, cellClass: 'text-center', valueGetter: (params) => formatWorkTime(params.data || {}) },
    { field: 'createdAt', headerName: t('mypage.columnRegistrationDate'), width: 140, valueFormatter: (params) => formatDateFull(params.value) },
    { field: 'updatedAt', headerName: t('mypage.columnUpdatedAt'), width: 140, valueFormatter: (params) => formatDateFull(params.value) },
    { headerName: '', width: 160, cellRenderer: ActionsCellRenderer, sortable: false, resizable: false },
  ], [t, ProjectCellRenderer, FileStatusCellRenderer, AssignRoleCellRenderer, ActionsCellRenderer]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: true,
  }), []);

  const getRowId = useCallback((params) => String(params.data.projectFileId || `${params.data.servCd}-${params.data.fileNo}`), []);

  const handleRowDoubleClicked = useCallback((params) => {
    handleRowClick(params.data);
  }, [handleRowClick]);

  const hasMore = pagination.page + 1 < pagination.totalPages;
  const isEmpty = hasFetchedRef.current && !loading && rowData.length === 0;

  return (
    <div className={`accordion-section ${expanded ? 'expanded' : 'collapsed'}`}>
      <button className="accordion-header" onClick={toggleExpanded}>
        <svg className="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="accordion-title">{t(SECTION_LABEL_KEYS[sectionKey])}</span>
        <span className="accordion-count">{t('common.countUnit', { count: pagination.totalElements?.toLocaleString() ?? '0' })}</span>
      </button>

      {expanded && (
        <div className="accordion-body">
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError(null)}>&#x2715;</button>
            </div>
          )}

          {isEmpty ? (
            <p className="accordion-empty">{t('common.noData')}</p>
          ) : (
            <>
              <div className="grid-container">
                <AgGridReact
                  rowData={rowData}
                  columnDefs={columnDefs}
                  defaultColDef={defaultColDef}
                  domLayout="autoHeight"
                  headerHeight={36}
                  rowHeight={38}
                  animateRows={true}
                  getRowId={getRowId}
                  onRowDoubleClicked={handleRowDoubleClicked}
                  overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('common.noData')}</span>`}
                  tooltipShowDelay={300}
                />
              </div>

              {loading && <div className="accordion-loading">{t('common.loadingData')}</div>}

              {hasMore && (
                <button className="btn-load-more" onClick={handleLoadMore} disabled={loading}>
                  {t('mypage.loadMore')}
                </button>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}

// ─── ProjectFilterBar ─────────────────────────────────

export function ProjectFilterBar({ filters, searchFields, onFilterChange, onSearch, onReset, onKeyDown, t }) {
  return (
    <div className="filter-bar">
      <input type="date" className="filter-date" value={filters.startDate} onChange={(e) => onFilterChange('startDate', e.target.value)} />
      <span className="filter-date-separator">~</span>
      <input type="date" className="filter-date" value={filters.endDate} onChange={(e) => onFilterChange('endDate', e.target.value)} />

      <select className="filter-select" value={filters.searchField} onChange={(e) => onFilterChange('searchField', e.target.value)}>
        {searchFields.map((sf) => <option key={sf.value} value={sf.value}>{sf.label}</option>)}
      </select>

      <div className="filter-search">
        <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          className="filter-input"
          value={filters.searchText}
          onChange={(e) => onFilterChange('searchText', e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('common.searchPlaceholder')}
        />
      </div>

      <div className="filter-actions">
        <button className="btn-ghost" onClick={onReset}>{t('common.reset')}</button>
        <button className="btn-primary" onClick={onSearch}>{t('common.search')}</button>
      </div>
    </div>
  );
}

// ─── ProjectSections ──────────────────────────────────

export function ProjectSections({ status, role, fetchFn, filters, searchTrigger, t, navigate }) {
  return (
    <div className="accordion-list">
      {SECTION_CONFIG.map(({ key, apiType }) => (
        <AccordionGridSection
          key={`${status}-${role}-${key}`}
          sectionKey={key}
          apiType={apiType}
          role={role}
          status={status}
          fetchFn={fetchFn}
          filters={filters}
          searchTrigger={searchTrigger}
          t={t}
          navigate={navigate}
        />
      ))}
    </div>
  );
}

// ─── Settlement Components ────────────────────────────

const formatPay = (value, t) => {
  if (value == null) return '-';
  const unit = t ? t('common.wonUnit') : '원';
  return `${Number(value).toLocaleString()} ${unit}`;
};

const formatSettlementDate = (value) => {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
};

function SettlementTable({ rows, t, onRowClick, selectable, selectedIds, onSelectionChange }) {
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectedIds?.has(r.id));
  const someSelected = selectable && rows.some((r) => selectedIds?.has(r.id));

  const handleToggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(rows.map((r) => r.id)));
    }
  }, [allSelected, rows, onSelectionChange]);

  const handleToggleRow = useCallback((id, e) => {
    e.stopPropagation();
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }, [selectedIds, onSelectionChange]);

  return (
    <table className="accordion-table settlement-table">
      <thead>
        <tr>
          {selectable && (
            <th className="col-checkbox">
              <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={handleToggleAll} />
            </th>
          )}
          <th className="col-file-no">{t('mypage.settlementColumnFileNo')}</th>
          <th className="col-file-name">{t('mypage.settlementColumnFileName')}</th>
          <th className="col-project">{t('mypage.settlementColumnProjectTitle')}</th>
          <th className="col-bss-type">{t('mypage.settlementColumnBssType')}</th>
          <th className="col-pay">{t('mypage.settlementColumnPay')}</th>
          <th className="col-settle-status">{t('mypage.settlementColumnStatus')}</th>
          <th className="col-date">{t('mypage.settlementColumnCreatedAt')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const status = getSettlementStatus(row);
          const isChecked = selectable && selectedIds?.has(row.id);
          return (
            <tr key={row.id} className={`${onRowClick ? 'clickable-row' : ''}${isChecked ? ' selected-row' : ''}`} onClick={() => onRowClick?.(row)}>
              {selectable && (
                <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isChecked} onChange={(e) => handleToggleRow(row.id, e)} />
                </td>
              )}
              <td className="col-file-no">{row.fileNo ?? '-'}</td>
              <td className="col-file-name" title={row.fileName}>{row.fileName || '-'}</td>
              <td className="col-project" title={row.projectTitle}>{row.projectTitle || '-'}</td>
              <td className="col-bss-type">{row.bssTypeName || '-'}</td>
              <td className="col-pay">{formatPay(row.pay, t)}</td>
              <td className="col-settle-status">
                <span className={`status-badge ${SETTLEMENT_STATUS_CLASS[status] || ''}`}>
                  {t(`mypage.settlementStatus_${status}`)}
                </span>
              </td>
              <td className="col-date">{formatSettlementDate(row.createdAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SettlementPagination({ pagination, loading, onPrev, onNext, t }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="settlement-pagination">
      <button className="btn-ghost" onClick={onPrev} disabled={pagination.page <= 0 || loading}>←</button>
      <span className="settlement-page-info">
        {t('mypage.settlementPageInfo', { page: pagination.page + 1, totalPages: pagination.totalPages })}
      </span>
      <button className="btn-ghost" onClick={onNext} disabled={pagination.page + 1 >= pagination.totalPages || loading}>→</button>
    </div>
  );
}

// work_duration 합계(분) → "{h}시간 {m}분" / "{h}시간" / "{m}분"
function formatWorkMinutes(totalMin, t) {
  const min = Math.max(0, Math.round(Number(totalMin) || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return t('mypage.dashboardWorkTimeHM', { h, m });
  if (h > 0) return t('mypage.dashboardWorkTimeH', { h });
  return t('mypage.dashboardWorkTimeM', { m });
}

export function SettlementTab({ workerId, t }) {
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [pendingData, setPendingData] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingPagination, setPendingPagination] = useState({ page: 0, totalElements: 0, totalPages: 0 });

  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPagination, setHistoryPagination] = useState({ page: 0, totalElements: 0, totalPages: 0 });

  const [error, setError] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSettlement, setDetailSettlement] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchItems, setBatchItems] = useState([]);

  const fetchPending = useCallback(async (page = 0) => {
    if (!workerId) return;
    setPendingLoading(true);
    try {
      const res = await getSettlementsByStatus({ status: 'WAITING_CONFIRM', workerId, page, size: PAGE_SIZE_SETTLEMENT });
      if (res.status === 'SUCCESS') {
        const d = res.data;
        setPendingData(d.content || []);
        setPendingPagination({ page: d.page ?? page, totalElements: d.totalElements ?? 0, totalPages: d.totalPages ?? 0 });
      } else {
        setError(res.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      setError(err.message || t('common.loadDataFailed'));
    } finally {
      setPendingLoading(false);
    }
  }, [workerId, t]);

  const fetchHistory = useCallback(async (page = 0) => {
    if (!workerId) return;
    setHistoryLoading(true);
    try {
      const res = await getSettlements({ workerId, page, size: PAGE_SIZE_SETTLEMENT });
      if (res.status === 'SUCCESS') {
        const d = res.data;
        const filtered = (d.content || []).filter((item) => {
          if (!item.isExecutorConfirmed) return false;
          const status = getSettlementStatus(item);
          return status !== 'WAITING_CONFIRM';
        });
        setHistoryData(filtered);
        setHistoryPagination({ page: d.page ?? page, totalElements: d.totalElements ?? 0, totalPages: d.totalPages ?? 0 });
      } else {
        setError(res.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      setError(err.message || t('common.loadDataFailed'));
    } finally {
      setHistoryLoading(false);
    }
  }, [workerId, t]);

  const fetchMonthlySummary = useCallback(async () => {
    if (!workerId) return;
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    try {
      const res = await getMySettlementMonthlySummary({ workerId, yearMonth });
      const d = res?.status === 'SUCCESS' ? res.data : null;
      setMonthlySummary({
        workDurationTotal: d?.workDurationTotal ?? 0,
        count: d?.count ?? 0,
        payTotal: d?.payTotal ?? 0,
      });
    } catch {
      setMonthlySummary({ workDurationTotal: 0, count: 0, payTotal: 0 });
    }
  }, [workerId]);

  useEffect(() => {
    fetchPending(0);
    fetchHistory(0);
    fetchMonthlySummary();
  }, [fetchPending, fetchHistory, fetchMonthlySummary]);

  const handlePendingRowClick = useCallback((row) => {
    setDetailSettlement(row);
    setDetailOpen(true);
  }, []);

  const handleDetailSuccess = useCallback(() => {
    fetchPending(0);
    fetchHistory(0);
    setSelectedIds(new Set());
  }, [fetchPending, fetchHistory]);

  const handleDetailClose = useCallback(() => {
    setDetailOpen(false);
    setDetailSettlement(null);
  }, []);

  const handleBatchConfirmOpen = useCallback(() => {
    const selected = pendingData.filter((row) => selectedIds.has(row.id));
    if (selected.length === 0) return;
    setBatchItems(selected);
    setBatchOpen(true);
  }, [pendingData, selectedIds]);

  const handleBatchSuccess = useCallback(() => {
    fetchPending(0);
    fetchHistory(0);
    setSelectedIds(new Set());
  }, [fetchPending, fetchHistory]);

  const handleBatchClose = useCallback(() => {
    setBatchOpen(false);
    setBatchItems([]);
  }, []);

  const isAllEmpty = pendingData.length === 0 && historyData.length === 0 && !pendingLoading && !historyLoading;

  return (
    <div className="settlement-tab">
      <div className="settlement-summary-bar">
        <span className="settlement-summary-title">
          {t('mypage.dashboardMonthlySummaryTitle')}
          <span className="settlement-summary-month">
            {t('mypage.dashboardMonthlySummaryMonth', {
              year: new Date().getFullYear(),
              month: new Date().getMonth() + 1,
            })}
          </span>
        </span>
        <span className="settlement-summary-items">
          <span className="settlement-summary-item">
            <span className="settlement-summary-label">{t('mypage.dashboardMonthlyWorkCount')}</span>
            <span className="settlement-summary-value">
              {monthlySummary === null
                ? <span className="dash-count-loading" />
                : t('mypage.dashboardCountUnit', { count: monthlySummary.count })}
            </span>
          </span>
          <span className="settlement-summary-sep" aria-hidden="true">·</span>
          <span className="settlement-summary-item">
            <span className="settlement-summary-label">{t('mypage.dashboardMonthlyWorkTime')}</span>
            <span className="settlement-summary-value">
              {monthlySummary === null
                ? <span className="dash-count-loading" />
                : formatWorkMinutes(monthlySummary.workDurationTotal, t)}
            </span>
          </span>
          <span className="settlement-summary-sep" aria-hidden="true">·</span>
          <span className="settlement-summary-item">
            <span className="settlement-summary-label">{t('mypage.dashboardMonthlyPay')}</span>
            <span className="settlement-summary-value">
              {monthlySummary === null
                ? <span className="dash-count-loading" />
                : t('mypage.dashboardPayUnit', { amount: Number(monthlySummary.payTotal).toLocaleString() })}
            </span>
          </span>
        </span>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      {(pendingLoading || historyLoading) && isAllEmpty ? (
        <div className="accordion-loading">{t('common.loadingData')}</div>
      ) : isAllEmpty ? (
        <div className="empty-tab-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          <p>{t('mypage.settlementNoData')}</p>
        </div>
      ) : (
        <>
          <div className="settlement-section">
            <div className="settlement-section-header">
              <h3 className="settlement-section-title">{t('mypage.settlementSectionPending')}</h3>
              {pendingPagination.totalElements > 0 && (
                <span className="settlement-pending-badge">{pendingPagination.totalElements}</span>
              )}
              {selectedIds.size > 0 && (
                <button className="btn-primary btn-batch-confirm" onClick={handleBatchConfirmOpen}>
                  {t('mypage.settlementBatchConfirm.openButton', { count: selectedIds.size })}
                </button>
              )}
            </div>
            {pendingLoading && pendingData.length === 0 ? (
              <div className="accordion-loading">{t('common.loadingData')}</div>
            ) : pendingData.length === 0 ? (
              <p className="settlement-empty-text">{t('mypage.settlementNoPending')}</p>
            ) : (
              <>
                <SettlementTable
                  rows={pendingData} t={t} onRowClick={handlePendingRowClick}
                  selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
                />
                <SettlementPagination
                  pagination={pendingPagination} loading={pendingLoading}
                  onPrev={() => fetchPending(pendingPagination.page - 1)}
                  onNext={() => fetchPending(pendingPagination.page + 1)} t={t}
                />
              </>
            )}
          </div>

          <div className="settlement-section">
            <div className="settlement-section-header">
              <h3 className="settlement-section-title">{t('mypage.settlementSectionHistory')}</h3>
            </div>
            {historyLoading && historyData.length === 0 ? (
              <div className="accordion-loading">{t('common.loadingData')}</div>
            ) : historyData.length === 0 ? (
              <p className="settlement-empty-text">{t('mypage.settlementNoData')}</p>
            ) : (
              <>
                <SettlementTable rows={historyData} t={t} />
                <SettlementPagination
                  pagination={historyPagination} loading={historyLoading}
                  onPrev={() => fetchHistory(historyPagination.page - 1)}
                  onNext={() => fetchHistory(historyPagination.page + 1)} t={t}
                />
              </>
            )}
          </div>
        </>
      )}

      <SettlementDetailModal
        open={detailOpen} settlement={detailSettlement} status="WAITING_CONFIRM"
        onClose={handleDetailClose} onSuccess={handleDetailSuccess}
      />
      <SettlementBatchConfirmModal
        open={batchOpen} items={batchItems}
        onClose={handleBatchClose} onSuccess={handleBatchSuccess}
      />
    </div>
  );
}
