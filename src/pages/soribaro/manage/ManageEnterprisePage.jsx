import { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageParams } from '../../../hooks/usePageParams';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { getEnterpriseList } from '../../../api/v9/enterprise';
import { getRequestTypes, addRequestType, deleteRequestType } from './manageProtoStore';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './ManageEnterprisePage.css';

ModuleRegistry.registerModules([AllCommunityModule]);

function RequestTypeManageModal({ onClose }) {
  const [types, setTypes] = useState(getRequestTypes());
  const [newName, setNewName] = useState('');
  const [newContracts, setNewContracts] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    addRequestType({
      id: `rt-${Date.now()}`,
      name: newName.trim(),
      contractTypes: newContracts.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setTypes(getRequestTypes());
    setNewName('');
    setNewContracts('');
  };

  const handleDelete = (id) => {
    deleteRequestType(id);
    setTypes(getRequestTypes());
  };

  return (
    <div className="req-type-modal-overlay" onClick={onClose}>
      <div className="req-type-modal" onClick={(e) => e.stopPropagation()}>
        <div className="req-type-modal-header">
          <span>의뢰유형 관리</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="req-type-modal-body">
          {types.map((rt) => (
            <div key={rt.id} className="req-type-row">
              <span className="req-type-name">{rt.name}</span>
              <div className="req-type-contracts">
                {rt.contractTypes.map((ct) => (
                  <span key={ct} className="req-type-contract-tag">{ct}</span>
                ))}
              </div>
              <button className="proto-note-cancel-btn" onClick={() => handleDelete(rt.id)}>삭제</button>
            </div>
          ))}
          <div className="req-type-add-form">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="유형명 (예: 자막)" />
            <input value={newContracts} onChange={(e) => setNewContracts(e.target.value)} placeholder="계약구분 (쉼표로 구분, 예: 단건계약, 연간계약)" />
            <button className="proto-note-save-btn" style={{ alignSelf: 'flex-end', padding: '6px 14px' }} onClick={handleAdd}>추가</button>
          </div>
        </div>
        <div className="req-type-modal-footer">
          <button className="preg-cancel-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// 날짜 포맷 함수
const formatDate = (dateString) => {
  if (!dateString) return '-';
  return dateString;
};

const BSS_TYPE_OPTIONS = [
  { value: '', key: 'all' },
  { value: 'media', key: 'media' },
  { value: 'general', key: 'general' },
  { value: 'public', key: 'public' },
  { value: 'edu', key: 'edu' },
];

const USE_YN_OPTIONS = [
  { value: '', key: 'all' },
  { value: 'Y', key: 'use' },
  { value: 'N', key: 'notUse' },
];

const UseYnCellRenderer = (params) => {
  const { t } = useTranslation('soribaro');
  const isActive = params.value === 'Y';
  return (
    <span className={`use-yn-badge ${isActive ? 'active' : 'inactive'}`}>
      {isActive ? t('manage.enterprise.useYn.use') : t('manage.enterprise.useYn.notUse')}
    </span>
  );
};

export default function ManageEnterprisePage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const navigate = useNavigate();

  const [showReqTypeModal, setShowReqTypeModal] = useState(false);

  // 상태 관리
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  // 페이징 상태 (v9: page는 0부터 시작)
  const { page: urlPage, size: urlSize, setPageParams } = usePageParams();
  const [pagination, setPagination] = useState({
    page: urlPage,
    size: urlSize,
    totalElements: 0,
    totalPages: 0,
  });

  // 검색 필터 상태
  const [filters, setFilters] = useState({
    searchTxt: '',
    bssType: '',
    useYn: '',
  });

  // 업체 목록 조회
  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const requestParams = {
        page: params.page ?? pagination.page,
        size: params.size ?? pagination.size,
        searchTxt: params.searchTxt ?? filters.searchTxt,
        bssType: params.bssType ?? filters.bssType,
        useYn: params.useYn ?? filters.useYn,
      };

      const response = await getEnterpriseList(requestParams);

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
        setError(response.message || t('manage.enterprise.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.enterprise.failedToLoadData'));
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.size]);

  // 컬럼 정의
  const columnDefs = useMemo(() => [
    { field: 'entNo', headerName: t('manage.enterprise.columns.entNo'), width: 100, cellClass: 'text-center' },
    { field: 'entNm', headerName: t('manage.enterprise.columns.entNm'), flex: 1, minWidth: 180 },
    { field: 'bssTypeNm', headerName: t('manage.enterprise.columns.bssTypeNm'), width: 120, cellClass: 'text-center' },
    { field: 'picTelNo', headerName: t('manage.enterprise.columns.picTelNo'), width: 150 },
    { field: 'useYn', headerName: t('manage.enterprise.columns.useYn'), width: 100, cellRenderer: UseYnCellRenderer, cellClass: 'text-center' },
    { field: 'regDttm', headerName: t('manage.enterprise.columns.regDttm'), width: 160, valueFormatter: (p) => formatDate(p.value) },
    { field: 'chgDttm', headerName: t('manage.enterprise.columns.chgDttm'), width: 160, valueFormatter: (p) => formatDate(p.value) },
  ], [t]);

  // 기본 컬럼 설정
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
    setPageParams(0, pagination.size);
    fetchData({ page: 0 });
  }, [fetchData, setPageParams, pagination.size]);

  const handleReset = useCallback(() => {
    setFilters({ searchTxt: '', bssType: '', useYn: '' });
    setSelectedRow(null);
    setPageParams(0, pagination.size);
    fetchData({ searchTxt: '', bssType: '', useYn: '', page: 0 });
  }, [fetchData, setPageParams, pagination.size]);

  const handleCreate = useCallback(() => {
    navigate('/soribaro/manage/enterprise/new');
  }, [navigate]);

  const onGridReady = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const getRowId = useCallback((params) => String(params.data.entNo), []);

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRow(selectedNodes?.length > 0 ? selectedNodes[0].data : null);
  }, []);

  const handleRowDoubleClick = useCallback((event) => {
    navigate(`/soribaro/manage/enterprise/${event.data.entNo}`);
  }, [navigate]);

  const handlePageChange = useCallback((newPage) => {
    setPageParams(newPage, pagination.size);
    fetchData({ page: newPage });
  }, [fetchData, setPageParams, pagination.size]);

  const displayPage = pagination.page + 1;

  return (
    <>
    <div className="notion-page manage-enterprise-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('manage.enterprise.pageTitle')}</h1>
          <p className="page-description">{t('manage.enterprise.pageDescription')}</p>
        </div>
        <div className="header-actions">
          <button className="proto-register-page-btn" style={{ background: 'var(--surface-light)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }} onClick={() => setShowReqTypeModal(true)}>
            의뢰유형 관리
          </button>
          <button className="btn-primary" onClick={handleCreate}>{t('manage.enterprise.newRegister')}</button>
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
            placeholder={t('manage.enterprise.searchPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <select
          className="filter-select"
          value={filters.bssType}
          onChange={(e) => handleFilterChange('bssType', e.target.value)}
        >
          {BSS_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value === '' ? t('manage.enterprise.bssTypeAll') : t(`manage.enterprise.bssType.${opt.key}`)}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.useYn}
          onChange={(e) => handleFilterChange('useYn', e.target.value)}
        >
          {USE_YN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value === '' ? t('manage.enterprise.useYnAll') : t(`manage.enterprise.useYn.${opt.key}`)}
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
            {selectedRow.entNm} (No.{selectedRow.entNo})
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
      {showReqTypeModal && <RequestTypeManageModal onClose={() => setShowReqTypeModal(false)} />}
    </>
  );
}
