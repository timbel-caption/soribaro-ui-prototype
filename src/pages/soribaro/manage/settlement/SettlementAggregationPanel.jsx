import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { Download } from 'lucide-react';
import { getSettlementAggregation, getSettlements, downloadAggregationExcel } from '../../../../api/v9/settlement';
import { useCommonCodeStore } from '../../../../stores/commonCodeStore';
import SettlementDetailModal from './SettlementDetailModal';

ModuleRegistry.registerModules([AllCommunityModule]);

const formatNumber = (value) => {
  if (value == null) return '-';
  return Number(value).toLocaleString();
};

function getCurrentYearMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function SettlementAggregationPanel() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const detailGridRef = useRef(null);
  const getCodeOptions = useCommonCodeStore((s) => s.getCodeOptions);
  const bssTypeOptions = getCodeOptions('BSS_TYPE');

  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth);
  const [memberKeyword, setMemberKeyword] = useState('');
  const [bssType, setBssType] = useState('');
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 0, size: 20, totalElements: 0, totalPages: 0 });

  const [selectedWorker, setSelectedWorker] = useState(null);
  const [detailData, setDetailData] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPagination, setDetailPagination] = useState({ page: 0, size: 20, totalElements: 0, totalPages: 0 });

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalSettlement, setDetailModalSettlement] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettlementAggregation({
        yearMonth: params.yearMonth ?? yearMonth,
        memberKeyword: params.memberKeyword ?? memberKeyword,
        bssType: params.bssType ?? bssType,
        page: params.page ?? pagination.page,
        size: params.size ?? pagination.size,
      });
      if (res.status === 'SUCCESS') {
        const d = res.data;
        setRowData(d.content || []);
        setPagination({
          page: d.page ?? (params.page ?? pagination.page),
          size: d.size ?? (params.size ?? pagination.size),
          totalElements: d.totalElements ?? 0,
          totalPages: d.totalPages ?? 0,
        });
      } else {
        setError(res.message || t('manage.common.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [yearMonth, memberKeyword, bssType, pagination.page, pagination.size, t]);

  const fetchDetailData = useCallback(async (workerId, yearMonth, page = 0) => {
    if (!workerId) return;
    setDetailLoading(true);
    try {
      // 집계 목록과 동일 기준(해당 월 확인 완료분)으로 서버에서 필터링·페이징한다.
      // 클라이언트에서 거르면 페이지네이션 총계가 어긋나므로 서버 필터를 사용한다.
      const res = await getSettlements({
        workerId,
        yearMonth,
        confirmedOnly: true,
        page,
        size: detailPagination.size,
      });
      if (res.status === 'SUCCESS') {
        const d = res.data;
        setDetailData(d.content || []);
        setDetailPagination((prev) => ({
          ...prev,
          page: d.page ?? page,
          totalElements: d.totalElements ?? 0,
          totalPages: d.totalPages ?? 0,
        }));
      }
    } catch {
      setDetailData([]);
    } finally {
      setDetailLoading(false);
    }
  }, [detailPagination.size]);

  useEffect(() => {
    fetchData({ page: 0 });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const columnDefs = useMemo(() => [
    { field: 'workerName', headerName: t('manage.settlement.aggregation.workerName'), width: 120 },
    { field: 'workerId', headerName: t('manage.settlement.aggregation.workerId'), width: 180 },
    { field: 'yearMonth', headerName: t('manage.settlement.aggregation.yearMonth'), width: 110, cellClass: 'text-center' },
    { field: 'totalCount', headerName: t('manage.settlement.aggregation.totalCount'), width: 90, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'totalPay', headerName: t('manage.settlement.aggregation.totalPay'), flex: 1, minWidth: 130, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'totalPenalty', headerName: t('manage.settlement.aggregation.totalPenalty'), width: 120, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'totalTax', headerName: t('manage.settlement.aggregation.totalTax'), width: 120, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
  ], [t]);

  const detailColumnDefs = useMemo(() => [
    { field: 'fileNo', headerName: t('manage.settlement.statusPanel.columns.fileNo'), width: 90, cellClass: 'text-center' },
    { field: 'fileName', headerName: t('manage.settlement.statusPanel.columns.fileName'), flex: 1, minWidth: 160 },
    { field: 'projectTitle', headerName: t('manage.settlement.statusPanel.columns.title'), flex: 1, minWidth: 160 },
    { field: 'bssTypeName', headerName: t('manage.settlement.statusPanel.columns.bssTypeName'), width: 100, cellClass: 'text-center' },
    { field: 'accuracy', headerName: t('manage.settlement.statusPanel.columns.accuracy'), width: 90, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? `${p.value}%` : '-' },
    { field: 'price', headerName: t('manage.settlement.statusPanel.columns.price'), width: 90, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'penalty', headerName: t('manage.settlement.statusPanel.columns.penalty'), width: 90, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
    { field: 'payRate', headerName: t('manage.settlement.statusPanel.columns.payRate'), width: 90, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? `${Number(p.value)}%` : '-' },
    { field: 'pay', headerName: t('manage.settlement.statusPanel.columns.pay'), width: 100, cellClass: 'text-right', valueFormatter: (p) => formatNumber(p.value) },
  ], [t]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, suppressMovable: false }), []);

  const handleSearch = useCallback(() => {
    setSelectedWorker(null);
    setDetailData([]);
    fetchData({ page: 0 });
  }, [fetchData]);

  const handleReset = useCallback(() => {
    setYearMonth(getCurrentYearMonth());
    setMemberKeyword('');
    setBssType('');
    setSelectedWorker(null);
    setDetailData([]);
    fetchData({ yearMonth: getCurrentYearMonth(), memberKeyword: '', bssType: '', page: 0 });
  }, [fetchData]);

  const handleDownloadExcel = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadAggregationExcel({ yearMonth, bssType, memberKeyword });
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
    } finally {
      setDownloading(false);
    }
  }, [yearMonth, bssType, memberKeyword, t]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const onGridReady = useCallback(() => { /* data already fetched in useEffect */ }, []);
  const getRowId = useCallback((params) => `${params.data.workerId}-${params.data.yearMonth}`, []);
  const getDetailRowId = useCallback((params) => String(params.data.id), []);

  const onRowClicked = useCallback((event) => {
    const worker = event.data;
    setSelectedWorker(worker);
    setDetailPagination((prev) => ({ ...prev, page: 0 }));
    fetchDetailData(worker.workerId, worker.yearMonth, 0);
  }, [fetchDetailData]);

  const onDetailRowClicked = useCallback((event) => {
    setDetailModalSettlement(event.data);
    setDetailModalOpen(true);
  }, []);

  const handlePageChange = useCallback((newPage) => { fetchData({ page: newPage }); }, [fetchData]);
  const handleDetailPageChange = useCallback((newPage) => {
    if (selectedWorker) fetchDetailData(selectedWorker.workerId, selectedWorker.yearMonth, newPage);
  }, [selectedWorker, fetchDetailData]);

  const displayPage = pagination.page + 1;
  const detailDisplayPage = detailPagination.page + 1;

  return (
    <>
      {/* 필터 바 */}
      <div className="filter-bar">
        <div className="filter-date-group">
          <input
            type="month"
            className="filter-date-input"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <select
          className="filter-date-input"
          value={bssType}
          onChange={(e) => setBssType(e.target.value)}
          style={{ width: 140 }}
        >
          <option value="">{t('manage.settlement.labelWorkType')}</option>
          {bssTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="filter-search" style={{ maxWidth: 240 }}>
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="filter-input"
            value={memberKeyword}
            onChange={(e) => setMemberKeyword(e.target.value)}
            placeholder={t('manage.settlement.memberKeywordPlaceholder')}
            onKeyDown={handleKeyDown}
          />
        </div>
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

      {/* 집계 테이블 */}
      <div className="table-toolbar">
        <span className="record-count">
          {t('manage.common.recordCount', { count: pagination.totalElements.toLocaleString() })}
        </span>
        <button
          className="btn-issue"
          onClick={handleDownloadExcel}
          disabled={downloading || loading || pagination.totalElements === 0}
        >
          <Download size={14} />
          {downloading ? t('manage.settlement.aggregation.downloading') : t('manage.settlement.aggregation.downloadExcel')}
        </button>
      </div>

      <div className="grid-container" style={{ flex: 1 }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onRowClicked={onRowClicked}
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

      {/* 집계 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
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
      )}

      {/* 작업자 상세 드릴다운 */}
      {selectedWorker && (
        <div className="aggregation-detail-section">
          <div className="table-toolbar">
            <span className="record-count">
              <strong>{selectedWorker.workerName}</strong> ({selectedWorker.workerId}) — {selectedWorker.yearMonth}
              {' · '}
              {t('manage.common.recordCount', { count: detailPagination.totalElements.toLocaleString() })}
            </span>
            <button className="btn-ghost" onClick={() => { setSelectedWorker(null); setDetailData([]); }}>
              {t('manage.settlement.detailModal.close')}
            </button>
          </div>
          {/* 상위 섹션이 flex 컬럼이므로 flex:1 로 영역을 채운다. (min-height:0 으로 2:1 비율 보장) */}
          <div className="grid-container" style={{ flex: 1, minHeight: 0 }}>
            <AgGridReact
              ref={detailGridRef}
              rowData={detailData}
              columnDefs={detailColumnDefs}
              defaultColDef={defaultColDef}
              onRowClicked={onDetailRowClicked}
              rowSelection="single"
              animateRows={true}
              loading={detailLoading}
              overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('manage.common.loadingData')}</span>`}
              overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
              getRowId={getDetailRowId}
              headerHeight={36}
              rowHeight={38}
            />
          </div>
          {detailPagination.totalPages > 1 && (
            <div className="pagination">
              <div className="pagination-pages">
                <button disabled={detailPagination.page <= 0} onClick={() => handleDetailPageChange(0)}>&laquo;</button>
                <button disabled={detailPagination.page <= 0} onClick={() => handleDetailPageChange(detailPagination.page - 1)}>&lsaquo;</button>
                {(() => {
                  const total = detailPagination.totalPages || 1;
                  const current = detailDisplayPage;
                  const range = 5;
                  let start = Math.max(1, current - Math.floor(range / 2));
                  let end = Math.min(total, start + range - 1);
                  if (end - start + 1 < range) start = Math.max(1, end - range + 1);
                  const pages = [];
                  for (let i = start; i <= end; i++) pages.push(i);
                  return pages.map((p) => (
                    <button key={p} className={p === current ? 'active' : ''} onClick={() => handleDetailPageChange(p - 1)}>{p}</button>
                  ));
                })()}
                <button disabled={detailPagination.page >= detailPagination.totalPages - 1} onClick={() => handleDetailPageChange(detailPagination.page + 1)}>&rsaquo;</button>
                <button disabled={detailPagination.page >= detailPagination.totalPages - 1} onClick={() => handleDetailPageChange(detailPagination.totalPages - 1)}>&raquo;</button>
              </div>
              <span className="pagination-info">{detailDisplayPage} / {detailPagination.totalPages || 1}</span>
            </div>
          )}
        </div>
      )}

      <SettlementDetailModal
        open={detailModalOpen}
        settlement={detailModalSettlement}
        status="AGGREGATION_DETAIL"
        onClose={() => setDetailModalOpen(false)}
        onSuccess={() => {
          setDetailModalOpen(false);
          if (selectedWorker) fetchDetailData(selectedWorker.workerId, selectedWorker.yearMonth, detailPagination.page);
          fetchData();
        }}
      />
    </>
  );
}
