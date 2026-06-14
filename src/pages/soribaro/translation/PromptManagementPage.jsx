import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { getPrompts, deletePrompt } from '../../../api/v9/prompts';
import { getAllTags } from '../../../api/v9/tags';
import { usePromptsStore } from '../../../stores/promptsStore';
import languageList from '../../../constants/language.json';
import { getTagColor } from '../../../constants/tagColors';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './PromptManagementPage.css';

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

// 언어 레이블 매핑 (language.json 기반)
const LANG_LABELS = languageList.reduce((acc, lang) => {
  acc[lang.code] = `${lang.flag} ${lang.name}`;
  return acc;
}, {});

const TagsCellRenderer = (params) => {
  const tags = params.value || [];
  
  if (tags.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>-</span>;
  }

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px 0' }}>
      {tags.map((tag) => {
        const colors = getTagColor(tag.name);
        return (
          <Chip
            key={tag.id}
            label={tag.name}
            size="small"
            variant="outlined"
            sx={{
              color: colors.color,
              borderColor: colors.border,
              background: 'transparent',
              fontWeight: 600,
              fontSize: '11px',
              height: '22px',
              borderRadius: '10px',
              '& .MuiChip-label': { lineHeight: 1, paddingTop: '1px' },
            }}
          />
        );
      })}
    </div>
  );
};

export default function PromptManagementPage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  
  // 상태 관리
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // 삭제 확인 다이얼로그
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // 필터 상태 (V9 API 스펙에 맞춤)
  const [filters, setFilters] = useState({
    tag_ids: [], // 다중 태그 선택
    source_lang: '',
    target_lang: '',
    model: '',
  });

  // 필터 옵션 추출 (데이터 기반)
  const filterOptions = useMemo(() => {
    const models = [...new Set(rowData.map(item => item.model).filter(Boolean))].sort();
    const sourceLangs = [...new Set(rowData.map(item => item.sourceLang).filter(Boolean))].sort();
    const targetLangs = [...new Set(rowData.map(item => item.targetLang).filter(Boolean))].sort();
    
    return { models, sourceLangs, targetLangs };
  }, [rowData]);

  // 태그 목록 조회
  const fetchTags = useCallback(async () => {
    try {
      const response = await getAllTags();
      if (response.status === 'SUCCESS') {
        const tagList = response.data || [];
        setAllTags(tagList);
        // store에 태그 캐시
        usePromptsStore.getState().setTags(tagList);
      }
    } catch (err) {
      console.error('Tags fetch error:', err);
      // API 실패 시 store에서 태그 로드
      const cachedTags = usePromptsStore.getState().getTags();
      if (cachedTags.length > 0) {
        setAllTags(cachedTags);
      }
    }
  }, []);

  // 프롬프트 목록 조회
  const fetchData = useCallback(async (filterParams = {}) => {
    setLoading(true);
    setError(null);

    // 빈 값은 제외하고 파라미터 구성
    const params = {};
    Object.entries(filterParams).forEach(([key, value]) => {
      if (key === 'tag_ids' && Array.isArray(value) && value.length > 0) {
        // 다중 태그: 쉼표로 구분하여 전달
        params.tag_ids = value.join(',');
      } else if (value && !Array.isArray(value)) {
        params[key] = value;
      }
    });
    const hasFilters = Object.keys(params).length > 0;

    try {
      const response = await getPrompts(params);

      if (response.status === 'SUCCESS') {
        const list = response.data || [];
        setRowData(list);
        // API 성공 시 store에 캐시 (필터 없는 전체 조회일 때만)
        if (!hasFilters) {
          usePromptsStore.getState().setPrompts(list);
        }
      } else {
        setError(response.message || '데이터를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('API Error:', err);
      // API 실패 시 store에서 폴백
      usePromptsStore.getState().setApiFailed();
      const cachedPrompts = usePromptsStore.getState().getPrompts();
      if (cachedPrompts.length > 0) {
        const list = hasFilters
          ? usePromptsStore.getState().searchPrompts(params)
          : cachedPrompts;
        setRowData(list);
        const lastSynced = usePromptsStore.getState().lastSyncedAt;
        const syncInfo = lastSynced
          ? t('translation.promptManagement.lastSynced', { time: new Date(lastSynced).toLocaleString('ko-KR') })
          : '';
        setError(t('translation.promptManagement.offlineCacheMessage', { syncInfo }));
      } else {
        setError(err.message || t('translation.promptManagement.failedNoCacheData'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 컬럼 정의
  const columnDefs = useMemo(() => [
    { 
      field: 'name', 
      headerName: t('translation.promptManagement.columns.name'), 
      width: 200,
      wrapText: true,
      autoHeight: true,
    },
    { 
      field: 'tags', 
      headerName: t('translation.promptManagement.columns.tags'), 
      width: 200,
      cellRenderer: TagsCellRenderer,
      autoHeight: true,
      wrapText: true,
    },
    { 
      field: 'model', 
      headerName: t('translation.promptManagement.columns.model'), 
      width: 150,
    },
    { 
      field: 'sourceLang', 
      headerName: t('translation.promptManagement.columns.sourceLang'), 
      width: 100,
      cellClass: 'text-center',
      valueFormatter: (params) => LANG_LABELS[params.value] || params.value || '-',
    },
    { 
      field: 'targetLang', 
      headerName: t('translation.promptManagement.columns.targetLang'), 
      width: 100,
      cellClass: 'text-center',
      valueFormatter: (params) => LANG_LABELS[params.value] || params.value || '-',
    },
    { 
      field: 'description', 
      headerName: t('translation.promptManagement.columns.description'), 
      flex: 1,
      minWidth: 200,
      tooltipField: 'description',
      wrapText: true,
      autoHeight: true,
    },
    { 
      field: 'createdAt', 
      headerName: t('translation.promptManagement.columns.createdAt'), 
      width: 180,
      minWidth: 180,
      valueFormatter: (params) => formatDate(params.value),
    },
    { 
      field: 'updatedAt', 
      headerName: t('translation.promptManagement.columns.updatedAt'), 
      width: 180,
      minWidth: 180,
      valueFormatter: (params) => formatDate(params.value),
    },
  ], [t]);

  // 기본 컬럼 설정
  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  // 필터 변경 핸들러
  const handleFilterChange = useCallback((field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  // 검색 버튼 클릭
  const handleSearch = useCallback(() => {
    fetchData(filters);
  }, [fetchData, filters]);

  // 초기화 버튼 클릭
  const handleReset = useCallback(() => {
    const resetFilters = {
      tag_ids: [],
      source_lang: '',
      target_lang: '',
      model: '',
    };
    setFilters(resetFilters);
    fetchData(resetFilters);
  }, [fetchData]);

  // 신규 등록 버튼 클릭
  const handleCreate = useCallback(() => {
    navigate('/soribaro/translation/prompt/new');
  }, [navigate]);

  // 삭제 버튼 클릭
  const handleDeleteClick = useCallback(() => {
    if (!selectedRow) {
      alert(t('translation.promptManagement.alertSelectDeletePrompt'));
      return;
    }
    setDeleteTarget(selectedRow);
    setDeleteDialogOpen(true);
  }, [selectedRow]);

  // 삭제 확인
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleteLoading(true);
    const promptsStore = usePromptsStore.getState();

    // API 실패 상태이면 Store에서 직접 삭제
    if (promptsStore.isApiFailed) {
      const success = promptsStore.deletePromptLocal(deleteTarget.id);
      setDeleteLoading(false);
      if (success) {
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
        setSelectedRow(null);
        // Store에서 다시 로드
        setRowData(promptsStore.getPrompts());
        alert(t('translation.promptManagement.alertDeletedLocal'));
      } else {
        alert(t('translation.promptManagement.alertStoreNotFound'));
      }
      return;
    }

    try {
      const response = await deletePrompt(deleteTarget.id);
      if (response.status === 'SUCCESS') {
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
        setSelectedRow(null);
        // 목록 새로고침
        fetchData(filters);
      } else {
        alert(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      alert(err.message || t('common.loadDataFailed'));
      console.error('Delete error:', err);
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, fetchData, filters]);

  // 삭제 취소
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  }, []);

  // Import: JSON 파일에서 프롬프트 목록 가져오기
  const handleImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        const result = usePromptsStore.getState().importPrompts(jsonData);

        if (result.success) {
          const importedPrompts = usePromptsStore.getState().getPrompts();
          setRowData(importedPrompts);
          alert(t('translation.promptManagement.alertImportSuccess', { count: result.count }));
        } else {
          alert(t('translation.promptManagement.alertImportFailed', { error: result.error }));
        }
      } catch (err) {
        alert(t('translation.promptManagement.alertImportParseError'));
        console.error('Import error:', err);
      }
    };
    reader.readAsText(file);

    // 같은 파일 재선택 가능하도록 초기화
    event.target.value = '';
  }, []);

  // Export: 현재 프롬프트 목록을 JSON 파일로 내보내기
  const handleExport = useCallback(() => {
    // 현재 rowData를 기반으로 store에 최신 데이터 반영 후 export
    const store = usePromptsStore.getState();
    // rowData가 있으면 그것을 기준으로, 없으면 store 데이터
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      prompts: rowData.length > 0 ? rowData : store.getPrompts(),
      tags: store.getTags(),
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `prompts_export_${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rowData]);

  // 그리드 준비 완료
  const onGridReady = useCallback(() => {
    fetchTags();
    fetchData(filters);
  }, [fetchData, fetchTags, filters]);

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

  // 행 더블클릭 - 상세 페이지로 이동
  const handleRowDoubleClick = useCallback((event) => {
    const id = event.data.id;
    navigate(`/soribaro/translation/prompt/${id}`);
  }, [navigate]);

  return (
    <div className="notion-page prompt-management-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('translation.promptManagement.pageTitle')}</h1>
          <p className="page-description">{t('translation.promptManagement.pageDescription')}</p>
        </div>
        <div className="header-actions">
          <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}>{t('translation.promptManagement.import')}</button>
          <button className="btn-ghost" onClick={handleExport} disabled={rowData.length === 0}>{t('translation.promptManagement.export')}</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button className="btn-primary" onClick={handleCreate}>+ {t('common.register')}</button>
          <button className="btn-danger" onClick={handleDeleteClick} disabled={!selectedRow}>{t('common.delete')}</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="tag-filter-group">
          <Autocomplete
            multiple
            size="small"
            options={allTags}
            getOptionLabel={(option) => option.name || ''}
            value={allTags.filter(t => filters.tag_ids.includes(t.id))}
            onChange={(e, newValue) => handleFilterChange('tag_ids', newValue.map(t => t.id))}
            renderInput={(params) => (
              <TextField 
                {...params} 
                placeholder={filters.tag_ids.length === 0 ? t('translation.promptManagement.tagSelectPlaceholder') : ""}
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const colors = getTagColor(option.name);
                return (
                  <Chip
                    key={option.id}
                    label={option.name}
                    size="small"
                    variant="outlined"
                    {...getTagProps({ index })}
                    sx={{
                      color: colors.color,
                      borderColor: colors.border,
                      background: 'transparent',
                      fontWeight: 600,
                      fontSize: '11px',
                      height: '24px',
                      borderRadius: '10px',
                      margin: '2px',
                      '& .MuiChip-label': { padding: '0 8px', lineHeight: 1, paddingTop: '1px' },
                      '& .MuiChip-deleteIcon': {
                        color: colors.color,
                        opacity: 0.7,
                        fontSize: '14px',
                        margin: '0 4px 0 -4px',
                        '&:hover': { opacity: 1 },
                      },
                    }}
                  />
                );
              })
            }
            isOptionEqualToValue={(option, value) => option.id === value?.id}
            sx={{ minWidth: 200, maxWidth: 400, width: 'auto' }}
          />
        </div>

        <select
          className="filter-select"
          value={filters.source_lang}
          onChange={(e) => handleFilterChange('source_lang', e.target.value)}
        >
          <option value="">{t('translation.promptManagement.sourceLangAll')}</option>
          {filterOptions.sourceLangs.map((lang) => (
            <option key={lang} value={lang}>{LANG_LABELS[lang] || lang}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.target_lang}
          onChange={(e) => handleFilterChange('target_lang', e.target.value)}
        >
          <option value="">{t('translation.promptManagement.targetLangAll')}</option>
          {filterOptions.targetLangs.map((lang) => (
            <option key={lang} value={lang}>{LANG_LABELS[lang] || lang}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.model}
          onChange={(e) => handleFilterChange('model', e.target.value)}
        >
          <option value="">{t('translation.promptManagement.modelAll')}</option>
          {filterOptions.models.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>

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
          {t('common.countUnit', { count: rowData.length.toLocaleString() })}
        </span>
        {selectedRow && (
          <span className="selected-info">{selectedRow.name}</span>
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
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('common.loadingData')}</span>`}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('common.noData')}</span>`}
          getRowId={getRowId}
          headerHeight={36}
          rowHeight={48}
        />
      </div>

      {/* 삭제 확인 모달 */}
      {deleteDialogOpen && (
        <div className="notion-modal-overlay" onClick={handleDeleteCancel}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('translation.promptManagement.deleteDialog.title')}</h3>
              <button className="notion-modal-close" onClick={handleDeleteCancel}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>
                {t('translation.promptManagement.deleteDialog.confirmMessage', { name: deleteTarget?.name })}
              </p>
              <p className="text-muted">
                {t('translation.promptManagement.deleteDialog.confirmNote')}
              </p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={handleDeleteCancel} disabled={deleteLoading}>
                {t('common.cancel')}
              </button>
              <button className="btn-danger" onClick={handleDeleteConfirm} disabled={deleteLoading}>
                {deleteLoading ? t('common.processing') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
