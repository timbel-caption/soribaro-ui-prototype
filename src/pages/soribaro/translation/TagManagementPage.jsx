import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip from '@mui/material/Chip';
import { getTags, createTag, updateTag, deleteTag } from '../../../api/v9/tags';
import { useTranslation } from 'react-i18next';
import './TagManagementPage.css';

// ag-grid 모듈 등록
ModuleRegistry.registerModules([AllCommunityModule]);

// 날짜 포맷 함수
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 프롬프트 수 셀 렌더러
const PromptCountCellRenderer = (params) => {
  const { t } = useTranslation('soribaro');
  const count = params.value || 0;
  return (
    <Chip
      label={t('translation.tagManagement.promptCountLabel', { count })}
      size="small"
      variant="outlined"
      sx={{
        backgroundColor: count > 0 ? '#e3f2fd' : '#f5f5f5',
        color: count > 0 ? '#1976d2' : '#757575',
        borderColor: count > 0 ? '#64b5f6' : '#bdbdbd',
        fontWeight: 500,
        fontSize: '12px',
        height: '24px',
      }}
    />
  );
};

export default function TagManagementPage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  
  // 상태 관리
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // 페이징 상태
  const [pagination, setPagination] = useState({
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });
  
  // 검색 상태
  const [keyword, setKeyword] = useState('');
  
  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [modalData, setModalData] = useState({ name: '', description: '' });
  const [modalLoading, setModalLoading] = useState(false);
  
  // 삭제 확인 다이얼로그
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 태그 목록 조회
  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getTags({
        keyword: params.keyword ?? keyword,
        page: params.page ?? pagination.page,
        size: params.size ?? pagination.size,
      });

      if (response.status === 'SUCCESS') {
        const data = response.data;
        setRowData(data.content || []);
        setPagination({
          page: data.page,
          size: data.size,
          totalElements: data.totalElements,
          totalPages: data.totalPages,
        });
      } else {
        setError(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      setError(err.message || t('common.loadDataFailed'));
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  }, [keyword, pagination.page, pagination.size]);

  // 컬럼 정의
  const columnDefs = useMemo(() => [
    { 
      field: 'name', 
      headerName: t('translation.tagManagement.columns.name'), 
      flex: 1,
      minWidth: 150,
    },
    { 
      field: 'description', 
      headerName: t('translation.tagManagement.columns.description'), 
      flex: 2,
      minWidth: 200,
    },
    { 
      field: 'promptCount', 
      headerName: t('translation.tagManagement.columns.promptCount'), 
      width: 120,
      cellRenderer: PromptCountCellRenderer,
      cellClass: 'text-center',
    },
    { 
      field: 'createdAt', 
      headerName: t('translation.tagManagement.columns.createdAt'), 
      width: 160,
      valueFormatter: (params) => formatDate(params.value),
    },
    { 
      field: 'updatedAt', 
      headerName: t('translation.tagManagement.columns.updatedAt'), 
      width: 160,
      valueFormatter: (params) => formatDate(params.value),
    },
  ], [t]);

  // 기본 컬럼 설정
  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  // 검색
  const handleSearch = useCallback(() => {
    fetchData({ page: 0 });
  }, [fetchData]);

  // 초기화
  const handleReset = useCallback(() => {
    setKeyword('');
    fetchData({ keyword: '', page: 0 });
  }, [fetchData]);

  // 신규 등록 모달 열기
  const handleCreate = useCallback(() => {
    setModalMode('create');
    setModalData({ name: '', description: '' });
    setModalOpen(true);
  }, []);

  // 수정 모달 열기
  const handleEdit = useCallback(() => {
    if (!selectedRow) {
      alert(t('translation.tagManagement.alertSelectEditTag'));
      return;
    }
    setModalMode('edit');
    setModalData({
      name: selectedRow.name || '',
      description: selectedRow.description || '',
    });
    setModalOpen(true);
  }, [selectedRow]);

  // 모달 저장
  const handleModalSave = useCallback(async () => {
    if (!modalData.name.trim()) {
      alert(t('translation.tagManagement.alertTagNameRequired'));
      return;
    }

    setModalLoading(true);
    try {
      let response;
      if (modalMode === 'create') {
        response = await createTag({
          name: modalData.name.trim(),
          description: modalData.description.trim(),
        });
      } else {
        response = await updateTag(selectedRow.id, {
          name: modalData.name.trim(),
          description: modalData.description.trim(),
        });
      }

      if (response.status === 'SUCCESS') {
        setModalOpen(false);
        setSelectedRow(null);
        fetchData();
      } else {
        alert(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      alert(err.message || t('common.loadDataFailed'));
      console.error('Save error:', err);
    } finally {
      setModalLoading(false);
    }
  }, [modalMode, modalData, selectedRow, fetchData]);

  // 삭제 버튼 클릭
  const handleDeleteClick = useCallback(() => {
    if (!selectedRow) {
      alert(t('translation.tagManagement.alertSelectDeleteTag'));
      return;
    }
    if (selectedRow.promptCount > 0) {
      alert(t('translation.tagManagement.alertTagInUse', { count: selectedRow.promptCount }));
      return;
    }
    setDeleteDialogOpen(true);
  }, [selectedRow]);

  // 삭제 확인
  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedRow) return;

    setDeleteLoading(true);
    try {
      const response = await deleteTag(selectedRow.id);
      if (response.status === 'SUCCESS') {
        setDeleteDialogOpen(false);
        setSelectedRow(null);
        fetchData();
      } else {
        alert(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      alert(err.message || t('common.loadDataFailed'));
      console.error('Delete error:', err);
    } finally {
      setDeleteLoading(false);
    }
  }, [selectedRow, fetchData]);

  // 그리드 준비 완료
  const onGridReady = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // 행 ID 가져오기
  const getRowId = useCallback((params) => {
    return params.data.id;
  }, []);

  // 행 선택 변경
  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api?.getSelectedNodes();
    if (selectedNodes && selectedNodes.length > 0) {
      setSelectedRow(selectedNodes[0].data);
    } else {
      setSelectedRow(null);
    }
  }, []);

  // 행 더블클릭 - 수정 모달 열기
  const handleRowDoubleClick = useCallback((event) => {
    setSelectedRow(event.data);
    setModalMode('edit');
    setModalData({
      name: event.data.name || '',
      description: event.data.description || '',
    });
    setModalOpen(true);
  }, []);

  // 페이지 변경
  const handlePageChange = useCallback((newPage) => {
    fetchData({ page: newPage });
  }, [fetchData]);

  return (
    <div className="tag-management-page">
      {/* 헤더 */}
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-icon">🏷️</span>
          {t('translation.tagManagement.pageTitle')}
        </h1>
        <div className="header-actions">
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            sx={{ mr: 1 }}
          >
            + {t('common.register')}
          </Button>
          <Button
            variant="outlined"
            color="primary"
            onClick={handleEdit}
            disabled={!selectedRow}
            sx={{ mr: 1 }}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={handleDeleteClick}
            disabled={!selectedRow}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {/* 검색 필터 */}
      <div className="search-filters">
        <div className="filter-row">
          <div className="filter-group filter-keyword">
            <label>{t('translation.tagManagement.searchLabel')}</label>
            <TextField
              size="small"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('translation.tagManagement.searchPlaceholder')}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              sx={{ minWidth: 250 }}
            />
          </div>

          <div className="filter-actions">
            <button className="btn-reset" onClick={handleReset}>
              {t('common.reset')}
            </button>
            <button className="btn-search" onClick={handleSearch} disabled={loading}>
              {loading ? t('common.searching') : t('common.search')}
            </button>
          </div>
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* 결과 정보 */}
      <div className="result-info">
        <span className="total-count">
          {t('translation.tagManagement.totalCount', { count: pagination.totalElements.toLocaleString() })}
        </span>
        {selectedRow && (
          <span className="selected-info">
            {t('translation.tagManagement.selected', { name: selectedRow.name })}
          </span>
        )}
      </div>

      {/* AG Grid */}
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
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('common.noData')}</span>`}
          getRowId={getRowId}
          headerHeight={44}
          rowHeight={42}
        />
      </div>

      {/* 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <Button
            size="small"
            disabled={pagination.page === 0}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            {t('translation.tagManagement.prev')}
          </Button>
          <span className="page-info">
            {pagination.page + 1} / {pagination.totalPages}
          </span>
          <Button
            size="small"
            disabled={pagination.page >= pagination.totalPages - 1}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            {t('translation.tagManagement.next')}
          </Button>
        </div>
      )}

      {/* 등록/수정 모달 */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {modalMode === 'create' ? t('translation.tagManagement.createDialog.title') : t('translation.tagManagement.createDialog.editTitle')}
        </DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
            <TextField
              label={t('translation.tagManagement.createDialog.labelTagName')}
              value={modalData.name}
              onChange={(e) => setModalData(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
              autoFocus
            />
            <TextField
              label={t('translation.tagManagement.createDialog.labelDescription')}
              value={modalData.description}
              onChange={(e) => setModalData(prev => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              rows={3}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)} disabled={modalLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleModalSave}
            variant="contained"
            disabled={modalLoading}
          >
            {modalLoading ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>
          {t('translation.tagManagement.deleteDialog.title')}
        </DialogTitle>
        <DialogContent>
          <p>
            {t('translation.tagManagement.deleteDialog.confirmMessage', { name: selectedRow?.name })}
            <br />
            {t('translation.tagManagement.deleteDialog.confirmNote')}
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? t('common.processing') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
