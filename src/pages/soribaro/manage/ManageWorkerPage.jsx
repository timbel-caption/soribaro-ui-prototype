import { useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePageParams } from "../../../hooks/usePageParams";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { getMemberList } from "../../../api/v9/member";
import { useCommonCodeStore } from "../../../stores/commonCodeStore";
import { useTranslation } from 'react-i18next';
import AddWorkerModal from './AddWorkerModal';
import BulkMemberUploadModal from './BulkMemberUploadModal';
import WorkerLevelBulkUploadModal from './WorkerLevelBulkUploadModal';
import "../../../styles/notion-list.css";
import "./ManageWorkerPage.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const SEARCH_TYPE_OPTIONS = [
  { value: "", key: "all" },
  { value: "name", key: "name" },
  { value: "email", key: "email" },
];

const SITE_TYPE_OPTIONS = [
  { value: "", key: "all" },
  { value: "ROLE_USER", key: "soribaro" },
  { value: "ROLE_USERC", key: "clipdesk" },
];

// 상태 렌더러
const StatRenderer = (params) => {
  const label = params.data?.statDtl || params.value || "-";
  return <span className="stat-badge">{label}</span>;
};

// 작업자 등급 셀 렌더러 (대표 1개 + +N 뱃지 + 툴팁)
const WorkerLevelCellRenderer = (params) => {
  const raw = params.value;
  if (!raw) return <span className="text-muted">-</span>;
  const names = typeof raw === 'string' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (names.length === 0) return <span className="text-muted">-</span>;

  const first = names[0];
  const rest = names.length - 1;
  const fullText = names.join(', ');

  return (
    <span className="wl-cell" title={fullText}>
      <span className="wl-cell-tag">{first}</span>
      {rest > 0 && <span className="wl-cell-more">+{rest}</span>}
    </span>
  );
};

export default function ManageWorkerPage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const navigate = useNavigate();
  const getCodeLabel = useCommonCodeStore((s) => s.getCodeLabel);
  const getCodeOptions = useCommonCodeStore((s) => s.getCodeOptions);
  const userLvlOptions = getCodeOptions("USER_LEVEL");

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [workerLevelBulkModalOpen, setWorkerLevelBulkModalOpen] = useState(false);

  const { page: urlPage, size: urlSize, setPageParams } = usePageParams({ defaultPage: 1, defaultSize: 20 });
  const [pagination, setPagination] = useState({
    pageNo: urlPage,
    recordCountPerPage: urlSize,
    totalElements: 0,
    totalPages: 0,
  });

  const [filters, setFilters] = useState({
    searchTxt: "",
    searchType: "",
    siteType: "",
    userLvl: "",
  });

  const fetchData = useCallback(
    async (params = {}) => {
      setLoading(true);
      setError(null);
      try {
        const requestParams = {
          pageNo: params.pageNo ?? pagination.pageNo,
          recordCountPerPage:
            params.recordCountPerPage ?? pagination.recordCountPerPage,
          searchTxt: params.searchTxt ?? filters.searchTxt,
          searchType: params.searchType ?? filters.searchType,
          siteType: params.siteType ?? filters.siteType,
          userLvl: params.userLvl ?? filters.userLvl,
        };

        const response = await getMemberList(requestParams);

        if (response.status === "SUCCESS") {
          const data = response.data;
          setRowData(data.content || []);
          setPagination({
            pageNo: data.page != null ? data.page + 1 : requestParams.pageNo,
            recordCountPerPage: data.size ?? requestParams.recordCountPerPage,
            totalElements: data.totalElements ?? 0,
            totalPages: data.totalPages ?? 0,
          });
        } else {
          setError(response.message || t('manage.common.failedToLoadData'));
        }
      } catch (err) {
        setError(err.message || t('manage.common.failedToLoadData'));
        console.error("API Error:", err);
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination.pageNo, pagination.recordCountPerPage],
  );

  const columnDefs = useMemo(
    () => [
      {
        field: "membNo",
        headerName: t('manage.worker.columns.membNo'),
        width: 80,
        cellClass: "text-center",
        headerClass: "text-center",
      },
      { field: "membId", headerName: t('manage.worker.columns.membId'), width: 220 },
      { field: "membNm", headerName: t('manage.worker.columns.membNm'), width: 180 },
      { field: "entNm", headerName: t('manage.worker.columns.entNm'), flex: 1, minWidth: 140 },
      {
        field: "membLvl",
        headerName: t('manage.worker.columns.membLvl'),
        width: 100,
        cellClass: "text-center",
        headerClass: "text-center",
      },
      {
        field: "workerLevelNames",
        headerName: t('manage.worker.columns.workerLevelName'),
        width: 180,
        headerClass: "text-center",
        cellRenderer: WorkerLevelCellRenderer,
      },
      { field: "mblTelNo", headerName: t('manage.worker.columns.mblTelNo'), width: 140 },
      {
        field: "membStat",
        headerName: t('manage.worker.columns.membStat'),
        width: 100,
        cellRenderer: StatRenderer,
        cellClass: "text-center",
        headerClass: "text-center",
      },
      {
        field: "snsTp",
        headerName: t('manage.worker.columns.snsTp'),
        width: 100,
        cellClass: "text-center",
        headerClass: "text-center",
      },
    ],
    [t],
  );

  const defaultColDef = useMemo(
    () => ({ sortable: true, resizable: true }),
    [],
  );

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSearch = useCallback(() => {
    setSelectedRow(null);
    setPageParams(1, pagination.recordCountPerPage);
    fetchData({ pageNo: 1 });
  }, [fetchData, setPageParams, pagination.recordCountPerPage]);

  const handleReset = useCallback(() => {
    setFilters({ searchTxt: "", searchType: "", siteType: "", userLvl: "" });
    setSelectedRow(null);
    setPageParams(1, pagination.recordCountPerPage);
    fetchData({
      searchTxt: "",
      searchType: "",
      siteType: "",
      userLvl: "",
      pageNo: 1,
    });
  }, [fetchData, setPageParams, pagination.recordCountPerPage]);

  const onGridReady = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const getRowId = useCallback((params) => String(params.data.membNo), []);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRow(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  const handleRowDoubleClick = useCallback(
    (event) => {
      navigate(`/soribaro/manage/worker/${event.data.membNo}`);
    },
    [navigate],
  );

  const handlePageChange = useCallback(
    (newPageNo) => {
      setPageParams(newPageNo, pagination.recordCountPerPage);
      fetchData({ pageNo: newPageNo });
    },
    [fetchData, setPageParams, pagination.recordCountPerPage],
  );

  const handlePageSizeChange = useCallback(
    (newSize) => {
      setPageParams(1, newSize);
      setPagination((prev) => ({ ...prev, recordCountPerPage: newSize }));
      fetchData({ pageNo: 1, recordCountPerPage: newSize });
    },
    [fetchData, setPageParams],
  );

  return (
    <div className="notion-page manage-worker-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">{t('manage.worker.pageTitle')}</h1>
            <p className="page-description">
              {t('manage.worker.pageDescription')}
            </p>
          </div>
          <div className="page-header-actions">
            <button className="btn-ghost" onClick={() => setWorkerLevelBulkModalOpen(true)}>
              {t('manage.worker.workerLevelBulkUpload')}
            </button>
            <button className="btn-ghost" onClick={() => setBulkModalOpen(true)}>
              {t('manage.worker.bulkUpload')}
            </button>
            <button className="btn-primary" onClick={() => setAddModalOpen(true)}>
              {t('manage.worker.addMember')}
            </button>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <select
          className="filter-select"
          value={filters.searchType}
          onChange={(e) => handleFilterChange("searchType", e.target.value)}
        >
          {SEARCH_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(`manage.worker.searchType.${o.key}`)}
            </option>
          ))}
        </select>

        <div className="filter-search">
          <svg
            className="search-icon"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="filter-input"
            value={filters.searchTxt}
            onChange={(e) => handleFilterChange("searchTxt", e.target.value)}
            placeholder={t('manage.worker.searchPlaceholder')}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        <select
          className="filter-select"
          value={filters.siteType}
          onChange={(e) => handleFilterChange("siteType", e.target.value)}
        >
          {SITE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === "" ? t('manage.worker.siteType.platformAll') : t(`manage.worker.siteType.${o.key}`)}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.userLvl}
          onChange={(e) => handleFilterChange("userLvl", e.target.value)}
        >
          <option value="">{t('manage.worker.gradeAll')}</option>
          {userLvlOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="filter-actions">
          <button className="btn-ghost" onClick={handleReset}>
            {t('manage.common.reset')}
          </button>
          <button
            className="btn-primary"
            onClick={handleSearch}
            disabled={loading}
          >
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
            {selectedRow.membNm} ({selectedRow.membId})
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
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {t('manage.common.recordCount', { count: n })}
              </option>
            ))}
          </select>
        </div>
        <div className="pagination-pages">
          <button
            disabled={pagination.pageNo <= 1}
            onClick={() => handlePageChange(1)}
          >
            &laquo;
          </button>
          <button
            disabled={pagination.pageNo <= 1}
            onClick={() => handlePageChange(pagination.pageNo - 1)}
          >
            &lsaquo;
          </button>
          {(() => {
            const total = pagination.totalPages || 1;
            const current = pagination.pageNo;
            const range = 5;
            let start = Math.max(1, current - Math.floor(range / 2));
            let end = Math.min(total, start + range - 1);
            if (end - start + 1 < range) start = Math.max(1, end - range + 1);
            const pages = [];
            for (let i = start; i <= end; i++) pages.push(i);
            return pages.map((p) => (
              <button
                key={p}
                className={p === current ? "active" : ""}
                onClick={() => handlePageChange(p)}
              >
                {p}
              </button>
            ));
          })()}
          <button
            disabled={pagination.pageNo >= pagination.totalPages}
            onClick={() => handlePageChange(pagination.pageNo + 1)}
          >
            &rsaquo;
          </button>
          <button
            disabled={pagination.pageNo >= pagination.totalPages}
            onClick={() => handlePageChange(pagination.totalPages)}
          >
            &raquo;
          </button>
        </div>
        <span className="pagination-info">
          {pagination.pageNo} / {pagination.totalPages || 1}
        </span>
      </div>

      <AddWorkerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => fetchData({ pageNo: 1 })}
      />

      <BulkMemberUploadModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => fetchData({ pageNo: 1 })}
      />

      <WorkerLevelBulkUploadModal
        open={workerLevelBulkModalOpen}
        onClose={() => setWorkerLevelBulkModalOpen(false)}
        onSuccess={() => fetchData({ pageNo: 1 })}
      />
    </div>
  );
}
