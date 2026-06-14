/**
 * 연수 파일 관리 페이지
 *
 * - AG Grid Community 로 목록 표시 (서버 페이징)
 * - 등록/삭제 버튼은 관리자에게만 노출
 * - 실행 버튼: 모든 인증 사용자
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { useTranslation } from 'react-i18next';
import {
  listTrainingFiles,
  deleteTrainingFile,
} from '../../../api/v9/training';
import { useUserStore } from '../../../stores/userStore';
import { toast } from '../../../stores/toastStore';
import { toAppUrl } from '../../../utils/worktoolRoute';
import TrainingFileUploadModal from './TrainingFileUploadModal';
import '../../../styles/notion-list.css';
import './TrainingFilesPage.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg']);

function classifyKind(format) {
  if (!format) return 'unknown';
  const ext = String(format).toLowerCase().replace(/^\./, '');
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'unknown';
}

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '-';
  const total = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function formatSize(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return '-';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEFAULT_PAGE_SIZE = 20;

export default function TrainingFilesPage() {
  const { t } = useTranslation('common');
  const gridRef = useRef(null);

  const isAdmin = useUserStore((state) => {
    const roles = state.user?.roles ?? [];
    return roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER');
  });

  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [committedKeyword, setCommittedKeyword] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleRun = useCallback((id) => {
    if (!id) return;
    // 연수 파일 단위 정답지 작성 모드 — assignmentId 는 사용하지 않음 (정답지는 trainingFileId 단위).
    const url = `/worktool?mode=training&role=ANSWER&popup=true&trainingFileId=${encodeURIComponent(id)}`;
    window.open(toAppUrl(url), `worktool_answer_${id}`, 'popup,width=1400,height=900');
  }, []);

  const fetchData = useCallback(
    async (targetPage, search, targetSize) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listTrainingFiles({
          page: targetPage,
          size: targetSize ?? pageSize,
          keyword: search || undefined,
        });
        const envelope = res?.data ?? res;
        // envelope가 페이지 객체 또는 배열일 수 있음 — 양쪽 모두 호환
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
        console.error('[TrainingFilesPage] load failed:', err);
        const msg = err?.message || t('training.errors.loadFailed');
        setError(msg);
        toast.error(msg);
        setRowData([]);
        setTotalElements(0);
        setTotalPages(0);
      } finally {
        setLoading(false);
      }
    },
    [pageSize, t]
  );

  const handleDelete = useCallback(
    (row) => {
      if (!isAdmin) {
        toast.error(t('training.permissionDenied'));
        return;
      }
      setDeleteTarget(row);
    },
    [isAdmin, t]
  );

  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTrainingFile(deleteTarget.id);
      toast.success(t('training.actions.delete'));
      setDeleteTarget(null);
      // 현재 페이지가 비어버리면 한 페이지 이전으로
      if (rowData.length === 1 && page > 0) {
        setPage((p) => p - 1);
      } else {
        fetchData(page, committedKeyword);
      }
    } catch (err) {
      console.error('[TrainingFilesPage] delete failed:', err);
      toast.error(err?.message || t('training.errors.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, rowData.length, page, committedKeyword, t, fetchData]);

  const ActionsCellRenderer = useCallback(
    (params) => {
      const row = params.data;
      if (!row) return null;
      return (
        <div className="training-actions">
          <button
            type="button"
            className="training-action-btn run"
            onClick={() => handleRun(row.id)}
          >
            {t('training.actions.run')}
          </button>
          {isAdmin && (
            <button
              type="button"
              className="training-action-btn delete"
              onClick={() => handleDelete(row)}
            >
              {t('training.actions.delete')}
            </button>
          )}
        </div>
      );
    },
    [handleRun, handleDelete, isAdmin, t]
  );

  const columnDefs = useMemo(
    () => [
      { field: 'name', headerName: t('training.fields.name'), flex: 1, minWidth: 180, tooltipField: 'name' },
      { field: 'title', headerName: t('training.fields.title'), flex: 1, minWidth: 160, tooltipField: 'title' },
      {
        field: 'format',
        headerName: t('training.fields.kind'),
        width: 90,
        cellClass: 'text-center',
        valueFormatter: (p) => {
          const kind = classifyKind(p.value);
          return t(`training.kind.${kind}`);
        },
      },
      {
        field: 'duration',
        headerName: t('training.fields.duration'),
        width: 110,
        cellClass: 'text-center',
        valueFormatter: (p) => formatDuration(p.value),
      },
      {
        field: 'size',
        headerName: t('training.fields.size'),
        width: 100,
        cellClass: 'text-center',
        valueFormatter: (p) => formatSize(p.value),
      },
      {
        field: 'createdAt',
        headerName: t('training.fields.createdAt'),
        width: 160,
        cellClass: 'text-center',
        valueFormatter: (p) => formatDateTime(p.value),
      },
      {
        field: 'createdBy',
        headerName: t('training.fields.createdBy'),
        width: 120,
        cellClass: 'text-center',
        valueFormatter: (p) => p.value || '-',
      },
      {
        headerName: t('training.fields.actions'),
        width: isAdmin ? 160 : 90,
        cellRenderer: ActionsCellRenderer,
        cellClass: 'text-center',
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
      },
    ],
    [t, isAdmin, ActionsCellRenderer]
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      suppressMovable: false,
    }),
    []
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
    [handleSearch]
  );

  const handlePageChange = useCallback(
    (newPage) => {
      // 1-based UI 페이지 → 0-based 상태
      setPage(Math.max(0, newPage - 1));
    },
    []
  );

  const handlePageSizeChange = useCallback(
    (e) => {
      const newSize = Number(e.target.value);
      setPageSize(newSize);
      setPage(0);
      fetchData(0, committedKeyword, newSize);
    },
    [committedKeyword, fetchData]
  );

  const handleRowDoubleClick = useCallback(
    (event) => {
      if (event?.data?.id) handleRun(event.data.id);
    },
    [handleRun]
  );

  // UI 표시용 1-based 페이지
  const displayPage = page + 1;
  const displayTotalPages = Math.max(totalPages, 1);

  return (
    <div className="notion-page training-files-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">{t('training.title')}</h1>
            <p className="page-description">{t('training.description')}</p>
          </div>
          {isAdmin && (
            <div className="header-actions">
              <button className="btn-primary" onClick={() => setUploadOpen(true)}>
                {t('training.upload')}
              </button>
            </div>
          )}
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
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('training.searchPlaceholder')}
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
          {t('training.totalCount', { count: totalElements })}
        </span>
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('training.loading')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('training.empty')}</span>`}
          loading={loading}
          rowSelection="single"
          animateRows={true}
          onRowDoubleClicked={handleRowDoubleClick}
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
        <span className="pagination-info">
          {displayPage} / {displayTotalPages}
        </span>
      </div>

      {/* 모달은 닫혀있을 때 unmount 하여 폼 상태가 매번 깨끗하게 초기화되도록 한다. */}
      {uploadOpen && (
        <TrainingFileUploadModal
          open
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            fetchData(page, committedKeyword);
          }}
        />
      )}

      {deleteTarget && (
        <div className="notion-modal-overlay" onClick={closeDeleteModal}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('training.confirm.deleteTitle')}</h3>
              <button
                type="button"
                className="notion-modal-close"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <p>{t('training.confirm.delete')}</p>
              <p className="text-muted">
                {deleteTarget.title || deleteTarget.name}
              </p>
            </div>
            <div className="notion-modal-footer">
              <button
                type="button"
                className="btn-ghost"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                {t('training.cancel')}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? t('training.loading') : t('training.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
