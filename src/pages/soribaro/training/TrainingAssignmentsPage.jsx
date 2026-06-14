/**
 * 연수 과제 목록 페이지 (관리자 전용)
 *
 * - AG Grid Community 서버 페이징 (TrainingFilesPage 와 동일 패턴)
 * - [과제 등록] 버튼 → AssignmentCreateModal
 * - 행 클릭 → /soribaro/training/assignments/:id 디테일 페이지로 이동
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { useTranslation } from 'react-i18next';
import {
  listAssignments,
  deleteAssignment,
  archiveAllAssignments,
} from '../../../api/v9/training/assignments';
import { toast } from '../../../stores/toastStore';
import AssignmentCreateModal from '../../../components/training/AssignmentCreateModal';
import '../../../styles/notion-list.css';
import './TrainingAssignmentsPage.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const DEFAULT_PAGE_SIZE = 20;

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TrainingAssignmentsPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const gridRef = useRef(null);

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [committedKeyword, setCommittedKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchData = useCallback(
    async (targetPage, search, targetSize) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listAssignments({
          page: targetPage,
          size: targetSize ?? pageSize,
          keyword: search || undefined,
        });
        const envelope = res?.data ?? res;
        if (Array.isArray(envelope)) {
          setRowData(envelope);
          setTotalElements(envelope.length);
          setTotalPages(1);
        } else if (envelope && Array.isArray(envelope.content)) {
          setRowData(envelope.content);
          setTotalElements(envelope.totalElements ?? envelope.content.length);
          setTotalPages(envelope.totalPages ?? 1);
        } else {
          setRowData([]);
          setTotalElements(0);
          setTotalPages(0);
        }
      } catch (err) {
        console.error('[TrainingAssignmentsPage] load failed:', err);
        const msg = err?.message || t('training.errors.loadFailed');
        setError(msg);
        toast.error(msg);
        setRowData([]);
      } finally {
        setLoading(false);
      }
    },
    [pageSize, t],
  );

  const openDetail = useCallback(
    (row) => {
      if (!row?.id) return;
      navigate(`/soribaro/training/assignments/${encodeURIComponent(row.id)}`);
    },
    [navigate],
  );

  const handleDelete = useCallback((row) => setDeleteTarget(row), []);
  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAssignment(deleteTarget.id);
      toast.success(t('training.assignment.deleted'));
      setDeleteTarget(null);
      fetchData(page, committedKeyword);
    } catch (err) {
      console.error('[TrainingAssignmentsPage] delete failed:', err);
      toast.error(err?.message || t('training.errors.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, page, committedKeyword, t, fetchData]);

  const closeArchiveModal = useCallback(() => {
    if (archiving) return;
    setArchiveOpen(false);
  }, [archiving]);

  // ── 일괄 삭제 ──
  const closeBulkDeleteModal = useCallback(() => {
    if (bulkDeleting) return;
    setBulkDeleteOpen(false);
  }, [bulkDeleting]);

  const confirmBulkDelete = useCallback(async () => {
    if (selectedRows.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedRows.map((r) => deleteAssignment(r.id)),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok > 0) {
        toast.success(t('training.assignment.bulkDelete.success', { count: ok }));
      }
      if (fail > 0) {
        toast.warning(t('training.assignment.bulkDelete.partialFailed', { count: fail }));
      }
      setBulkDeleteOpen(false);
      setSelectedRows([]);
      gridRef.current?.api?.deselectAll?.();
      fetchData(page, committedKeyword);
    } catch (err) {
      console.error('[TrainingAssignmentsPage] bulk delete failed:', err);
      toast.error(err?.message || t('training.assignment.bulkDelete.failed'));
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedRows, page, committedKeyword, fetchData, t]);

  const onSelectionChanged = useCallback(() => {
    const sel = gridRef.current?.api?.getSelectedRows?.() ?? [];
    setSelectedRows(sel);
  }, []);

  const confirmArchive = useCallback(async () => {
    setArchiving(true);
    try {
      const res = await archiveAllAssignments();
      const data = res?.data ?? {};
      toast.success(t('training.assignment.archive.success', {
        assignments: data.assignments ?? 0,
        trainees: data.deletedTrainees ?? 0,
      }));
      setArchiveOpen(false);
      fetchData(0, committedKeyword);
      setPage(0);
    } catch (err) {
      console.error('[TrainingAssignmentsPage] archive failed:', err);
      toast.error(err?.message || t('training.assignment.archive.failed'));
    } finally {
      setArchiving(false);
    }
  }, [committedKeyword, fetchData, t]);

  const StatusCell = useCallback((params) => {
    const status = params.value || 'OPEN';
    return (
      <span className={`status-pill ${status}`}>
        {params.context.t(`training.status.${status}`, { defaultValue: status })}
      </span>
    );
  }, []);

  const ActionsCell = useCallback(
    (params) => {
      const row = params.data;
      if (!row) return null;
      return (
        <div className="assignment-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => openDetail(row)}
          >
            {t('training.score.detail')}
          </button>
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={() => handleDelete(row)}
          >
            {t('training.actions.delete')}
          </button>
        </div>
      );
    },
    [openDetail, handleDelete, t],
  );

  const columnDefs = useMemo(
    () => [
      {
        headerName: '',
        checkboxSelection: true,
        headerCheckboxSelection: true,
        width: 44,
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
        pinned: 'left',
      },
      { field: 'title', headerName: t('training.assignment.title'), flex: 2, minWidth: 200, tooltipField: 'title' },
      { field: 'description', headerName: t('training.assignment.description'), flex: 2, minWidth: 200, tooltipField: 'description' },
      {
        field: 'status',
        headerName: t('training.assignment.status'),
        width: 110,
        cellClass: 'text-center',
        cellRenderer: StatusCell,
      },
      {
        field: 'fileCount',
        headerName: t('training.assignment.fileCount'),
        width: 90,
        cellClass: 'text-center',
        valueFormatter: (p) => (p.value != null ? p.value : '-'),
      },
      {
        field: 'studentCount',
        headerName: t('training.assignment.studentCount'),
        width: 90,
        cellClass: 'text-center',
        valueFormatter: (p) => (p.value != null ? p.value : '-'),
      },
      {
        field: 'createdAt',
        headerName: t('training.assignment.fields.createdAt'),
        width: 160,
        cellClass: 'text-center',
        valueFormatter: (p) => formatDateTime(p.value),
      },
      {
        headerName: t('training.fields.actions'),
        width: 160,
        cellRenderer: ActionsCell,
        cellClass: 'text-center',
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
      },
    ],
    [t, StatusCell, ActionsCell],
  );

  const defaultColDef = useMemo(
    () => ({ sortable: true, resizable: true, suppressMovable: false }),
    [],
  );

  useEffect(() => {
    fetchData(page, committedKeyword);
  }, [fetchData, page, committedKeyword]);

  const handleSearch = useCallback(() => {
    setPage(0);
    setCommittedKeyword(keyword.trim());
  }, [keyword]);

  const handleReset = useCallback(() => {
    setKeyword('');
    setCommittedKeyword('');
    setPage(0);
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handlePageChange = useCallback((newPage) => {
    setPage(Math.max(0, newPage - 1));
  }, []);

  const handlePageSizeChange = useCallback(
    (e) => {
      const newSize = Number(e.target.value);
      setPageSize(newSize);
      setPage(0);
      fetchData(0, committedKeyword, newSize);
    },
    [committedKeyword, fetchData],
  );

  const handleRowDoubleClick = useCallback(
    (event) => {
      if (event?.data?.id) openDetail(event.data);
    },
    [openDetail],
  );

  const displayPage = page + 1;
  const displayTotalPages = Math.max(totalPages, 1);

  return (
    <div className="notion-page training-assignments-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">{t('training.tabs.assignments')}</h1>
            <p className="page-description">{t('training.assignment.createDescription')}</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: 6 }}>
            <button className="btn-danger" onClick={() => setArchiveOpen(true)}>
              {t('training.assignment.archive.button')}
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              {t('training.assignment.create')}
            </button>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <input
            type="text"
            className="filter-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('training.assignment.searchPlaceholder')}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="filter-actions">
          <button className="btn-ghost" onClick={handleReset}>{t('training.reset')}</button>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? t('training.loading') : t('training.search')}
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
          {t('training.assignment.totalCount', { count: totalElements })}
          {selectedRows.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--accent-color)' }}>
              ({t('training.assignment.bulkDelete.selectedCount', { count: selectedRows.length })})
            </span>
          )}
        </span>
        <button
          className="btn-danger"
          onClick={() => setBulkDeleteOpen(true)}
          disabled={selectedRows.length === 0}
          style={{ marginLeft: 'auto' }}
        >
          {t('training.assignment.bulkDelete.button')}
        </button>
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={{ t }}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('training.loading')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('training.assignment.empty')}</span>`}
          loading={loading}
          rowSelection="multiple"
          suppressRowClickSelection={true}
          animateRows={true}
          onRowDoubleClicked={handleRowDoubleClick}
          onSelectionChanged={onSelectionChanged}
          headerHeight={36}
          rowHeight={38}
        />
      </div>

      <div className="pagination">
        <div className="pagination-size">
          <select value={pageSize} onChange={handlePageSizeChange}>
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{t('training.totalCount', { count: n })}</option>
            ))}
          </select>
        </div>
        <div className="pagination-pages">
          <button disabled={displayPage <= 1} onClick={() => handlePageChange(1)}>&laquo;</button>
          <button disabled={displayPage <= 1} onClick={() => handlePageChange(displayPage - 1)}>&lsaquo;</button>
          {(() => {
            const total = displayTotalPages;
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
          <button disabled={displayPage >= displayTotalPages} onClick={() => handlePageChange(displayPage + 1)}>&rsaquo;</button>
          <button disabled={displayPage >= displayTotalPages} onClick={() => handlePageChange(displayTotalPages)}>&raquo;</button>
        </div>
        <span className="pagination-info">{displayPage} / {displayTotalPages}</span>
      </div>

      {createOpen && (
        <AssignmentCreateModal
          open
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            if (id) navigate(`/soribaro/training/assignments/${encodeURIComponent(id)}`);
            else fetchData(page, committedKeyword);
          }}
        />
      )}

      {bulkDeleteOpen && (
        <div className="notion-modal-overlay" onClick={closeBulkDeleteModal}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('training.assignment.bulkDelete.title')}</h3>
              <button className="notion-modal-close" onClick={closeBulkDeleteModal} disabled={bulkDeleting}>
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <p>{t('training.assignment.bulkDelete.confirm', { count: selectedRows.length })}</p>
              <p className="text-muted">{t('training.assignment.bulkDelete.note')}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={closeBulkDeleteModal} disabled={bulkDeleting}>
                {t('training.cancel')}
              </button>
              <button className="btn-danger" onClick={confirmBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? t('training.loading') : t('training.assignment.bulkDelete.button')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="notion-modal-overlay" onClick={closeDeleteModal}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('training.confirm.deleteTitle')}</h3>
              <button className="notion-modal-close" onClick={closeDeleteModal} disabled={deleting}>
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <p>{t('training.assignment.deleteConfirm')}</p>
              <p className="text-muted">{deleteTarget.title}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={closeDeleteModal} disabled={deleting}>
                {t('training.cancel')}
              </button>
              <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? t('training.loading') : t('training.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveOpen && (
        <div className="notion-modal-overlay" onClick={closeArchiveModal}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('training.assignment.archive.title')}</h3>
              <button className="notion-modal-close" onClick={closeArchiveModal} disabled={archiving}>
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <p>{t('training.assignment.archive.confirm')}</p>
              <p className="text-muted">{t('training.assignment.archive.note')}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={closeArchiveModal} disabled={archiving}>
                {t('training.cancel')}
              </button>
              <button className="btn-danger" onClick={confirmArchive} disabled={archiving}>
                {archiving ? t('training.loading') : t('training.assignment.archive.button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
