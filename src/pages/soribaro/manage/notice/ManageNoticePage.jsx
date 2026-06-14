import { useState, useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { useTranslation } from 'react-i18next';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';
import { getNoticeList } from '../../../../api/v8/notice';
import NoticeFormModal from './NoticeFormModal';
import '../../../../styles/notion-list.css';
import './ManageNoticePage.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return String(dateString).replace('T', ' ').slice(0, 16);
};

const LANG_OPTIONS = [
  { value: '', key: 'langAll' },
  { value: 'kr', label: '한국어' },
  { value: 'en', label: 'English' },
];

const NOTI_UP_YN_OPTIONS = [
  { value: '', key: 'notiUpYnAll' },
  { value: 'Y', key: 'Y' },
  { value: 'N', key: 'N' },
];

const PinBadge = (params) => {
  const { t } = useTranslation('soribaro');
  const isPinned = params.value === 'Y';
  return (
    <span className={`badge ${isPinned ? 'badge-pinned' : 'badge-normal'}`}>
      {isPinned ? t('manage.notice.notiUpYn.Y') : t('manage.notice.notiUpYn.N')}
    </span>
  );
};

const PopupBadge = (params) => {
  const { t } = useTranslation('soribaro');
  const isActive = params.value === 'Y';
  return (
    <span className={`badge ${isActive ? 'badge-popup-active' : 'badge-popup-inactive'}`}>
      {isActive ? t('manage.notice.popupYn.Y') : t('manage.notice.popupYn.N')}
    </span>
  );
};

export default function ManageNoticePage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const getCodeOptions = useCommonCodeStore((s) => s.getCodeOptions);

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  const [pagination, setPagination] = useState({
    pageNo: 1,
    recordCountPerPage: 20,
    totalElements: 0,
    totalPages: 0,
  });

  const [filters, setFilters] = useState({
    searchTxt: '',
    notiTp: '',
    lang: '',
    notiMembTp: '',
    notiUpYn: '',
  });

  const [modal, setModal] = useState({ open: false, mode: 'view', notiNo: null });

  const notiTpOptions = useMemo(() => getCodeOptions('NOTI_TP'), [getCodeOptions]);
  const membTpOptions = useMemo(() => getCodeOptions('MEMB_TP'), [getCodeOptions]);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const req = {
        pageNo: params.pageNo ?? pagination.pageNo,
        recordCountPerPage: params.recordCountPerPage ?? pagination.recordCountPerPage,
        searchTxt: params.searchTxt ?? filters.searchTxt,
        notiTp: params.notiTp ?? filters.notiTp,
        lang: params.lang ?? filters.lang,
        notiMembTp: params.notiMembTp ?? filters.notiMembTp,
        notiUpYn: params.notiUpYn ?? filters.notiUpYn,
      };
      const response = await getNoticeList(req);
      if (response.status === 'SUCCESS') {
        const data = response.data;
        setRowData(data.content || []);
        setPagination({
          pageNo: req.pageNo,
          recordCountPerPage: data.size ?? req.recordCountPerPage,
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
  }, [filters, pagination.pageNo, pagination.recordCountPerPage, t]);

  const columnDefs = useMemo(() => [
    { field: 'notiNo', headerName: t('manage.notice.columns.notiNo'), width: 80, cellClass: 'text-center' },
    { field: 'notiSubj', headerName: t('manage.notice.columns.notiSubj'), flex: 1, minWidth: 240 },
    { field: 'notiTpNm', headerName: t('manage.notice.columns.notiTpNm'), width: 100, cellClass: 'text-center' },
    { field: 'lang', headerName: t('manage.notice.columns.lang'), width: 80, cellClass: 'text-center' },
    { field: 'notiMembTpNm', headerName: t('manage.notice.columns.notiMembTpNm'), width: 110, cellClass: 'text-center' },
    { field: 'notiUpYn', headerName: t('manage.notice.columns.notiUpYn'), width: 80, cellRenderer: PinBadge, cellClass: 'text-center' },
    { field: 'popupYn', headerName: t('manage.notice.columns.popupYn'), width: 80, cellRenderer: PopupBadge, cellClass: 'text-center' },
    { field: 'viewCnt', headerName: t('manage.notice.columns.viewCnt'), width: 80, cellClass: 'text-center' },
    { field: 'regr', headerName: t('manage.notice.columns.regr'), width: 100, cellClass: 'text-center' },
    { field: 'regDttm', headerName: t('manage.notice.columns.regDttm'), width: 150, valueFormatter: (p) => formatDate(p.value) },
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
    setSelectedRow(null);
    fetchData({ pageNo: 1 });
  }, [fetchData]);

  const handleReset = useCallback(() => {
    const empty = { searchTxt: '', notiTp: '', lang: '', notiMembTp: '', notiUpYn: '' };
    setFilters(empty);
    setSelectedRow(null);
    fetchData({ ...empty, pageNo: 1 });
  }, [fetchData]);

  const handleCreate = useCallback(() => {
    setModal({ open: true, mode: 'create', notiNo: null });
  }, []);

  const onGridReady = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const getRowId = useCallback((params) => String(params.data.notiNo), []);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRow(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  const handleRowDoubleClick = useCallback((event) => {
    setModal({ open: true, mode: 'view', notiNo: event.data.notiNo });
  }, []);

  const handlePageChange = useCallback((newPage) => {
    fetchData({ pageNo: newPage });
  }, [fetchData]);

  const handleModalClose = useCallback(() => {
    setModal({ open: false, mode: 'view', notiNo: null });
  }, []);

  const handleModalSuccess = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const displayPage = pagination.pageNo;

  return (
    <div className="notion-page manage-notice-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('manage.notice.pageTitle')}</h1>
          <p className="page-description">{t('manage.notice.pageDescription')}</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleCreate}>{t('manage.notice.newRegister')}</button>
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
            value={filters.searchTxt}
            onChange={(e) => handleFilterChange('searchTxt', e.target.value)}
            placeholder={t('manage.notice.searchPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <select className="filter-select" value={filters.notiTp} onChange={(e) => handleFilterChange('notiTp', e.target.value)}>
          <option value="">{t('manage.notice.notiTpAll')}</option>
          {notiTpOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select className="filter-select" value={filters.lang} onChange={(e) => handleFilterChange('lang', e.target.value)}>
          {LANG_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.key ? t(`manage.notice.${opt.key}`) : opt.label}
            </option>
          ))}
        </select>

        <select className="filter-select" value={filters.notiMembTp} onChange={(e) => handleFilterChange('notiMembTp', e.target.value)}>
          <option value="">{t('manage.notice.notiMembTpAll')}</option>
          {membTpOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select className="filter-select" value={filters.notiUpYn} onChange={(e) => handleFilterChange('notiUpYn', e.target.value)}>
          {NOTI_UP_YN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.key === 'notiUpYnAll' ? t('manage.notice.notiUpYnAll') : t(`manage.notice.notiUpYn.${opt.key}`)}
            </option>
          ))}
        </select>

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
        {selectedRow && (
          <span className="selected-info">
            {selectedRow.notiSubj} (No.{selectedRow.notiNo})
          </span>
        )}
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onRowDoubleClicked={handleRowDoubleClick}
          onSelectionChanged={onSelectionChanged}
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
            value={pagination.recordCountPerPage}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              setPagination((prev) => ({ ...prev, recordCountPerPage: newSize }));
              fetchData({ pageNo: 1, recordCountPerPage: newSize });
            }}
          >
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{t('manage.common.recordCount', { count: n })}</option>)}
          </select>
        </div>
        <div className="pagination-pages">
          <button disabled={displayPage <= 1} onClick={() => handlePageChange(1)}>&laquo;</button>
          <button disabled={displayPage <= 1} onClick={() => handlePageChange(displayPage - 1)}>&lsaquo;</button>
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
              <button key={p} className={p === current ? 'active' : ''} onClick={() => handlePageChange(p)}>{p}</button>
            ));
          })()}
          <button disabled={displayPage >= pagination.totalPages} onClick={() => handlePageChange(displayPage + 1)}>&rsaquo;</button>
          <button disabled={displayPage >= pagination.totalPages} onClick={() => handlePageChange(pagination.totalPages)}>&raquo;</button>
        </div>
        <span className="pagination-info">
          {displayPage} / {pagination.totalPages || 1}
        </span>
      </div>

      <NoticeFormModal
        open={modal.open}
        mode={modal.mode}
        notiNo={modal.notiNo}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
