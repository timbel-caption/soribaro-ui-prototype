/**
 * 수강생 관리 페이지 (관리자 전용)
 *
 * - MEMB_LVL='7' 수강생 목록 + 평균 정확도 / 제출(채점) / 대기 카운트
 * - 페이지네이션 + 테이블 내부 스크롤 (회원이 많아도 전체 화면 스크롤 X)
 * - 체크박스 다중 선택 + [선택 삭제] (soft delete: MEMB_STAT '1' → '3')
 * - [수강생 추가] (단건) / [엑셀 일괄 업로드]
 *
 * 라우트: /soribaro/training/students
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listTraineeStudents,
  deactivateTrainees,
} from '../../../api/v9/training/evaluations';
import { accuracyColor } from '../../../components/training/ScoreTable';
import AddStudentModal from '../../../components/training/AddStudentModal';
import TraineeBulkUploadModal from '../../../components/training/TraineeBulkUploadModal';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function TrainingStudentsManagePage() {
  const { t } = useTranslation('common');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [committedKeyword, setCommittedKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(
    async (targetPage, search, targetSize) => {
      setLoading(true);
      try {
        const res = await listTraineeStudents({
          keyword: search || undefined,
          page: targetPage,
          size: targetSize ?? pageSize,
        });
        const envelope = res?.data ?? res;
        if (Array.isArray(envelope)) {
          setRows(envelope);
          setTotalElements(envelope.length);
          setTotalPages(1);
        } else if (envelope && Array.isArray(envelope.content)) {
          setRows(envelope.content);
          setTotalElements(envelope.totalElements ?? envelope.content.length);
          setTotalPages(envelope.totalPages ?? 1);
        } else {
          setRows([]);
          setTotalElements(0);
          setTotalPages(0);
        }
        // 페이지 전환 시 선택 초기화 (현재 페이지 외 선택 유지하면 사용자 혼란)
        setSelected(new Set());
      } catch (err) {
        console.error('[TrainingStudentsManagePage] load failed:', err);
        toast.error(err?.message || t('training.errors.loadFailed'));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [pageSize, t],
  );

  useEffect(() => {
    fetchData(page, committedKeyword);
  }, [fetchData, page, committedKeyword]);

  const handleSearch = useCallback(() => {
    setPage(0);
    setCommittedKeyword(keyword.trim());
  }, [keyword]);

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

  // ── 체크박스 선택 ──
  const allOnPageChecked = rows.length > 0 && rows.every((r) => selected.has(r.membId));

  const toggleOne = useCallback((membId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(membId)) next.delete(membId);
      else next.add(membId);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageChecked) {
        rows.forEach((r) => next.delete(r.membId));
      } else {
        rows.forEach((r) => next.add(r.membId));
      }
      return next;
    });
  }, [rows, allOnPageChecked]);

  // ── 일괄 삭제 ──
  const confirmDelete = useCallback(async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await deactivateTrainees(Array.from(selected));
      const affected = res?.data?.affected ?? 0;
      toast.success(t('training.studentsManage.deactivated', { count: affected }));
      setDeleteOpen(false);
      setSelected(new Set());
      fetchData(page, committedKeyword);
    } catch (err) {
      console.error('[TrainingStudentsManagePage] deactivate failed:', err);
      toast.error(err?.message || t('training.studentsManage.deactivateFailed'));
    } finally {
      setDeleting(false);
    }
  }, [selected, page, committedKeyword, fetchData, t]);

  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setDeleteOpen(false);
  }, [deleting]);

  const displayPage = page + 1;
  const displayTotalPages = Math.max(totalPages, 1);

  const pageNumbers = useMemo(() => {
    const range = 5;
    let start = Math.max(1, displayPage - Math.floor(range / 2));
    let end = Math.min(displayTotalPages, start + range - 1);
    if (end - start + 1 < range) start = Math.max(1, end - range + 1);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [displayPage, displayTotalPages]);

  return (
    <div className="notion-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">{t('training.studentsManage.title')}</h1>
            <p className="page-description">{t('training.studentsManage.description')}</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" onClick={() => setBulkOpen(true)}>
              {t('training.assign.uploadExcel')}
            </button>
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              {t('training.addStudent.button')}
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
            placeholder={t('training.searchPlaceholder')}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="filter-actions">
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? t('training.loading') : t('training.search')}
          </button>
        </div>
      </div>

      <div className="table-toolbar">
        <span className="record-count">
          {t('training.totalCount', { count: totalElements })}
          {selected.size > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--accent-color)' }}>
              ({t('training.studentsManage.selectedCount', { count: selected.size })})
            </span>
          )}
        </span>
        <button
          className="btn-danger"
          onClick={() => setDeleteOpen(true)}
          disabled={selected.size === 0}
          style={{ marginLeft: 'auto' }}
        >
          {t('training.studentsManage.deleteSelected')}
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 200,
          overflow: 'auto',
          border: '1px solid var(--border-color)',
          borderRadius: 4,
        }}
      >
        <table className="notion-simple-table">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1 }}>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allOnPageChecked}
                  onChange={toggleAllOnPage}
                  disabled={rows.length === 0}
                />
              </th>
              <th>{t('training.assign.studentMembId')}</th>
              <th>{t('training.assign.studentName')}</th>
              <th className="text-center">{t('training.score.averageAccuracy')}</th>
              <th className="text-center">{t('training.score.submittedCount')}</th>
              <th className="text-center">{t('training.score.pendingCount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6}>{t('training.studentsManage.empty')}</td>
              </tr>
            )}
            {rows.map((r) => {
              const avg = r.averageAccuracy ?? r.avgAccuracy;
              const color = avg != null ? accuracyColor(avg) : undefined;
              const id = r.membId || r.studentMembId;
              const checked = selected.has(id);
              return (
                <tr key={id} style={checked ? { background: 'var(--bg-hover)' } : undefined}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(id)}
                    />
                  </td>
                  <td>{id}</td>
                  <td>{r.membNm || r.studentName || '-'}</td>
                  <td className="text-center">
                    {avg == null ? (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    ) : (
                      <span style={{ fontWeight: 600, color }}>
                        {Number(avg).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="text-center">{r.submittedCount ?? r.submitted ?? '-'}</td>
                  <td className="text-center">{r.pendingCount ?? r.pending ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div className="pagination-size">
          <select value={pageSize} onChange={handlePageSizeChange}>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{t('training.totalCount', { count: n })}</option>
            ))}
          </select>
        </div>
        <div className="pagination-pages">
          <button disabled={displayPage <= 1} onClick={() => handlePageChange(1)}>&laquo;</button>
          <button disabled={displayPage <= 1} onClick={() => handlePageChange(displayPage - 1)}>&lsaquo;</button>
          {pageNumbers.map((p) => (
            <button key={p} className={p === displayPage ? 'active' : ''} onClick={() => handlePageChange(p)}>{p}</button>
          ))}
          <button disabled={displayPage >= displayTotalPages} onClick={() => handlePageChange(displayPage + 1)}>&rsaquo;</button>
          <button disabled={displayPage >= displayTotalPages} onClick={() => handlePageChange(displayTotalPages)}>&raquo;</button>
        </div>
        <span className="pagination-info">{displayPage} / {displayTotalPages}</span>
      </div>

      <AddStudentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => fetchData(page, committedKeyword)}
      />

      <TraineeBulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSuccess={() => fetchData(page, committedKeyword)}
      />

      {deleteOpen && (
        <div className="notion-modal-overlay" onClick={closeDeleteModal}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('training.studentsManage.deleteTitle')}</h3>
              <button className="notion-modal-close" onClick={closeDeleteModal} disabled={deleting}>
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <p>{t('training.studentsManage.deleteConfirm', { count: selected.size })}</p>
              <p className="text-muted">{t('training.studentsManage.deleteNote')}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={closeDeleteModal} disabled={deleting}>
                {t('training.cancel')}
              </button>
              <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? t('training.loading') : t('training.studentsManage.deleteSelected')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
