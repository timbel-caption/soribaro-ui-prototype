import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { createPriceTable, updatePriceTable, deletePriceTable } from '../../../../api/v9/priceTables';
import { getPriceItems, createPriceItem, updatePriceItem, deletePriceItem } from '../../../../api/v9/priceItems';
import { createFileDifficulty, deleteFileDifficulty } from '../../../../api/v9/fileDifficulties';
import { upsertCodeDetail, deleteCodeDetail } from '../../../../api/v8/commcode';
import { toast } from '../../../../stores/toastStore';
import { useTranslation } from 'react-i18next';

ModuleRegistry.registerModules([AllCommunityModule]);

const INITIAL_TABLE_MODAL = { name: '', description: '', bssType: '' };
const INITIAL_ITEM_MODAL = { fileDifficultId: '', price: '' };

const priceFormatter = (params, currencyUnit = '원') => {
  if (params.value == null) return '-';
  return `${Number(params.value).toLocaleString()}${currencyUnit}`;
};

// ============================================================
// 의뢰유형 관리 공용 컴포넌트 (모달·상세 패널 공유)
// ============================================================
function BssTypeManager({ bssTypeOptions, refreshBssTypeOptions, compact, t }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCd, setNewCd] = useState('');
  const [newNm, setNewNm] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!newCd.trim()) { alert(t('manage.pricing.priceTable.alertRequestTypeCodeRequired')); return; }
    if (!newNm.trim()) { alert(t('manage.pricing.priceTable.alertRequestTypeNameRequired')); return; }
    setAddLoading(true);
    try {
      const res = await upsertCodeDetail({ grpCd: 'BSS_TYPE', dtlCd: newCd.trim().toUpperCase(), dtlCdNm: newNm.trim(), useYn: 'Y' });
      if (res.status === 'SUCCESS') {
        setNewCd(''); setNewNm(''); setShowAddForm(false);
        refreshBssTypeOptions();
        toast.success(t('manage.pricing.priceTable.requestTypeAddSuccess'));
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertRequestTypeAddFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertRequestTypeAddFailed'));
    } finally { setAddLoading(false); }
  }, [newCd, newNm, refreshBssTypeOptions, t]);

  const handleDelete = useCallback(async (dtlCd) => {
    if (!window.confirm(t('manage.pricing.priceTable.confirmRequestTypeDelete', { code: dtlCd }))) return;
    try {
      const res = await deleteCodeDetail('BSS_TYPE', dtlCd);
      if (res.status === 'SUCCESS') {
        refreshBssTypeOptions();
        toast.success(t('manage.pricing.priceTable.requestTypeDeleteSuccess'));
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertRequestTypeDeleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertRequestTypeDeleteFailed'));
    }
  }, [refreshBssTypeOptions, t]);

  return (
    <div className={compact ? 'bss-manager-compact' : ''}>
      {bssTypeOptions.length > 0 ? (
        <div className="bss-type-list">
          {bssTypeOptions.map((o) => (
            <div key={o.dtlCd} className="difficulty-item">
              <div>
                <span className="difficulty-name">{o.dtlCdNm}</span>
                <span className="difficulty-desc">{o.dtlCd}</span>
              </div>
              <button className="btn-icon" onClick={() => handleDelete(o.dtlCd)}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-text">{t('manage.pricing.priceTable.noRequestTypes')}</p>
      )}
      {!showAddForm ? (
        <button className="btn-ghost" onClick={() => setShowAddForm(true)} style={{ marginTop: '8px', width: '100%' }}>
          {t('manage.pricing.priceTable.add')}
        </button>
      ) : (
        <div className="difficulty-add-row" style={{ marginTop: '8px', flexDirection: 'column', alignItems: 'stretch' }}>
          <input type="text" value={newCd} onChange={(e) => setNewCd(e.target.value)} placeholder={t('manage.pricing.priceTable.requestTypeCodePlaceholder')} />
          <input type="text" value={newNm} onChange={(e) => setNewNm(e.target.value)} placeholder={t('manage.pricing.priceTable.requestTypeNamePlaceholder')} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn-ghost" onClick={() => { setShowAddForm(false); setNewCd(''); setNewNm(''); }} style={{ flex: 1 }}>
              {t('manage.common.cancel')}
            </button>
            <button className="btn-primary" disabled={addLoading} onClick={handleAdd} style={{ flex: 1 }}>
              {addLoading ? <span className="spinner" /> : t('manage.pricing.priceTable.add')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 단가표 상세 뷰 (2컬럼: 왼쪽 그리드 + 오른쪽 관리 패널)
// ============================================================
function PriceTableDetailView({ table, onBack, refreshPriceTables, fileDifficulties, refreshFileDifficulties, bssTypeOptions, refreshBssTypeOptions }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const [priceItems, setPriceItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  // 수정 모달 (선택 항목 수정용)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState(INITIAL_ITEM_MODAL);
  const [editModalLoading, setEditModalLoading] = useState(false);

  // 삭제 확인
  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false);
  const [deleteItemLoading, setDeleteItemLoading] = useState(false);

  // 단가표 수정 상태
  const [isEditingTable, setIsEditingTable] = useState(false);
  const [tableForm, setTableForm] = useState({ name: table.name, description: table.description || '', bssType: table.bssType || '' });
  const [tableFormLoading, setTableFormLoading] = useState(false);

  // 중앙 패널: 다중행 단가 추가
  const EMPTY_ROW = { fileDifficultId: '', price: '' };
  const [addRows, setAddRows] = useState([{ ...EMPTY_ROW }]);
  const [batchAddLoading, setBatchAddLoading] = useState(false);

  // 오른쪽 패널: 섹션 토글
  const [bssSectionOpen, setBssSectionOpen] = useState(true);
  const [diffSectionOpen, setDiffSectionOpen] = useState(true);

  // 오른쪽 패널: 난이도 관리
  const [diffBssType, setDiffBssType] = useState('');
  const [newDiffName, setNewDiffName] = useState('');
  const [newDiffDesc, setNewDiffDesc] = useState('');
  const [diffAddLoading, setDiffAddLoading] = useState(false);

  // 오른쪽 패널: 난이도 추가폼 토글
  const [showDiffAddForm, setShowDiffAddForm] = useState(false);

  // 단가 항목 목록 조회
  const fetchPriceItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res = await getPriceItems({ priceTableId: table.id });
      if (res.status === 'SUCCESS') setPriceItems(res.data || []);
    } catch (err) {
      console.error('PriceItems fetch error:', err);
    } finally {
      setItemsLoading(false);
    }
  }, [table.id]);

  useEffect(() => { fetchPriceItems(); }, [fetchPriceItems]);

  // bssType 라벨 맵
  const bssTypeLabelMap = useMemo(() => Object.fromEntries(bssTypeOptions.map((o) => [o.dtlCd, o.dtlCdNm])), [bssTypeOptions]);

  // 행별 난이도 필터 함수
  const getDifficultiesForBssType = useCallback((bssType) => {
    if (!bssType) return [];
    return fileDifficulties.filter((d) => d.bssTypeCd === bssType);
  }, [fileDifficulties]);

  // 수정 모달: 선택한 bssType에 따른 난이도 필터
  const editFormDifficulties = useMemo(() => {
    if (!table.bssType) return [];
    return fileDifficulties.filter((d) => d.bssTypeCd === table.bssType);
  }, [table.bssType, fileDifficulties]);

  // 난이도 관리: 선택한 bssType에 따른 난이도 필터
  const manageDifficulties = useMemo(() => {
    if (!diffBssType) return [];
    return fileDifficulties.filter((d) => d.bssTypeCd === diffBssType);
  }, [diffBssType, fileDifficulties]);

  const itemColumnDefs = useMemo(() => [
    { field: 'id', headerName: 'ID', width: 70, cellClass: 'text-center' },
    { field: 'difficultyName', headerName: t('manage.pricing.priceTable.columns.difficulty'), flex: 1, minWidth: 100 },
    { field: 'price', headerName: t('manage.pricing.priceTable.columns.priceWon'), flex: 1, minWidth: 100, valueFormatter: (params) => params.value == null ? '-' : `${Number(params.value).toLocaleString()}${t('common.wonUnit')}`, cellClass: 'text-right' },
  ], [t]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);

  // --- 다중행 단가 추가 ---
  const handleAddRow = useCallback(() => {
    setAddRows((prev) => [...prev, { fileDifficultId: '', price: '' }]);
  }, []);

  const handleRemoveRow = useCallback((index) => {
    setAddRows((prev) => {
      if (prev.length <= 1) return [{ fileDifficultId: '', price: '' }];
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleRowChange = useCallback((index, field, value) => {
    setAddRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      return { ...row, [field]: value };
    }));
  }, []);

  const handleBatchAdd = useCallback(async () => {
    const validRows = addRows.filter((r) => r.fileDifficultId && r.price && Number(r.price) >= 0);
    if (validRows.length === 0) { alert(t('manage.pricing.priceTable.alertAddPriceItems')); return; }

    setBatchAddLoading(true);
    const failedIndices = [];
    for (let i = 0; i < addRows.length; i++) {
      const row = addRows[i];
      if (!row.fileDifficultId || !row.price || Number(row.price) < 0) {
        if (row.fileDifficultId || row.price) failedIndices.push(i);
        continue;
      }
      try {
        const res = await createPriceItem({
          priceTableId: table.id,
          fileDifficultId: Number(row.fileDifficultId),
          price: Number(row.price),
        });
        if (res.status !== 'SUCCESS') failedIndices.push(i);
      } catch {
        failedIndices.push(i);
      }
    }

    if (failedIndices.length > 0) {
      setAddRows(failedIndices.map((i) => addRows[i]));
      alert(t('manage.pricing.priceTable.alertBatchResult', { success: addRows.length - failedIndices.length, fail: failedIndices.length }));
    } else {
      setAddRows([{ fileDifficultId: '', price: '' }]);
    }
    fetchPriceItems();
    setBatchAddLoading(false);
  }, [addRows, table.id, fetchPriceItems]);

  // --- 수정 모달 ---
  const handleEditItem = useCallback(() => {
    if (!selectedItem) { alert(t('manage.pricing.priceTable.alertSelectEditItem')); return; }
    setEditModalData({
      fileDifficultId: selectedItem.fileDifficultId ? String(selectedItem.fileDifficultId) : '',
      price: String(selectedItem.price),
    });
    setEditModalOpen(true);
  }, [selectedItem]);

  const handleItemDoubleClick = useCallback((e) => {
    setSelectedItem(e.data);
    setEditModalData({
      fileDifficultId: e.data.fileDifficultId ? String(e.data.fileDifficultId) : '',
      price: String(e.data.price),
    });
    setEditModalOpen(true);
  }, []);

  const handleEditModalSave = useCallback(async () => {
    if (!editModalData.fileDifficultId) { alert(t('manage.pricing.priceTable.alertDifficultyRequired')); return; }
    if (!editModalData.price || Number(editModalData.price) < 0) { alert(t('manage.pricing.priceTable.alertPriceRequired')); return; }

    setEditModalLoading(true);
    try {
      const res = await updatePriceItem(selectedItem.id, {
        fileDifficultId: Number(editModalData.fileDifficultId),
        price: Number(editModalData.price),
      });
      if (res.status === 'SUCCESS') {
        setEditModalOpen(false);
        setSelectedItem(null);
        fetchPriceItems();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertUpdateFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertUpdateFailed'));
    } finally {
      setEditModalLoading(false);
    }
  }, [editModalData, selectedItem, table.id, fetchPriceItems, t]);

  // --- 삭제 ---
  const handleDeleteItemClick = useCallback(() => {
    if (!selectedItem) { alert(t('manage.pricing.priceTable.alertSelectDeleteItem')); return; }
    setDeleteItemDialogOpen(true);
  }, [selectedItem]);

  const handleDeleteItemConfirm = useCallback(async () => {
    setDeleteItemLoading(true);
    try {
      const res = await deletePriceItem(selectedItem.id);
      if (res.status === 'SUCCESS') {
        setDeleteItemDialogOpen(false);
        setSelectedItem(null);
        fetchPriceItems();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertDeleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertDeleteFailed'));
    } finally {
      setDeleteItemLoading(false);
    }
  }, [selectedItem, fetchPriceItems, t]);

  const onItemSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedItem(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  // --- 단가표 정보 수정 ---
  const handleSaveTable = useCallback(async () => {
    if (!tableForm.name.trim()) { alert(t('manage.pricing.priceTable.alertPriceTableNameRequired')); return; }
    if (!tableForm.bssType) { alert(t('manage.pricing.priceTable.alertRequestTypeRequired')); return; }
    setTableFormLoading(true);
    try {
      const res = await updatePriceTable(table.id, { name: tableForm.name.trim(), description: tableForm.description.trim(), bssType: tableForm.bssType });
      if (res.status === 'SUCCESS') {
        setIsEditingTable(false);
        refreshPriceTables();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertUpdateFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertUpdateFailed'));
    } finally {
      setTableFormLoading(false);
    }
  }, [tableForm, table.id, refreshPriceTables, t]);

  const handleCancelEditTable = useCallback(() => {
    setTableForm({ name: table.name, description: table.description || '', bssType: table.bssType || '' });
    setIsEditingTable(false);
  }, [table]);

  // --- 난이도 추가 ---
  const handleAddDifficulty = useCallback(async () => {
    if (!diffBssType) { alert(t('manage.pricing.priceTable.alertRequestTypeRequired')); return; }
    if (!newDiffName.trim()) { alert(t('manage.pricing.priceTable.alertDifficultyNameRequired')); return; }

    setDiffAddLoading(true);
    try {
      const res = await createFileDifficulty({ bssTypeCd: diffBssType, name: newDiffName.trim(), description: newDiffDesc.trim() || undefined });
      if (res.status === 'SUCCESS') {
        setNewDiffName('');
        setNewDiffDesc('');
        refreshFileDifficulties();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertDifficultyAddFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertDifficultyAddFailed'));
    } finally {
      setDiffAddLoading(false);
    }
  }, [diffBssType, newDiffName, newDiffDesc, refreshFileDifficulties]);

  // --- 난이도 삭제 ---
  const handleDeleteDifficulty = useCallback(async (diffId) => {
    if (!window.confirm(t('manage.pricing.priceTable.confirmDifficultyDelete'))) return;
    try {
      const res = await deleteFileDifficulty(diffId);
      if (res.status === 'SUCCESS') {
        refreshFileDifficulties();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertDifficultyDeleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertDifficultyDeleteFailed'));
    }
  }, [refreshFileDifficulties]);

  return (
    <div className="pricing-tab-content">
      {/* 상단 헤더 */}
      <div className="detail-header">
        <button className="btn-ghost" onClick={onBack} style={{ marginRight: '8px' }}>
          {t('manage.pricing.priceTable.backToList')}
        </button>
        <h2 className="detail-title">{table.name}</h2>
        <span className="detail-badge">ID: {table.id}</span>
      </div>

      {/* 단가표 기본 정보 카드 */}
      <div className="detail-info-card">
        <div className="detail-info-header">
          <h3>{t('manage.pricing.priceTable.priceTableInfo')}</h3>
          {!isEditingTable ? (
            <button className="btn-ghost" onClick={() => setIsEditingTable(true)}>{t('manage.common.edit')}</button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-ghost" onClick={handleCancelEditTable} disabled={tableFormLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-primary" onClick={handleSaveTable} disabled={tableFormLoading}>
                {tableFormLoading ? <span className="spinner" /> : t('manage.common.save')}
              </button>
            </div>
          )}
        </div>
        <div className="detail-info-body">
          <div className="detail-info-row">
            <label>{t('manage.pricing.priceTable.labelPriceTableName')}</label>
            {isEditingTable ? (
              <input type="text" value={tableForm.name} onChange={(e) => setTableForm((p) => ({ ...p, name: e.target.value }))} required />
            ) : (
              <span>{table.name}</span>
            )}
          </div>
          <div className="detail-info-row">
            <label>{t('manage.pricing.priceTable.labelRequestType')}</label>
            {isEditingTable ? (
              <select value={tableForm.bssType} onChange={(e) => setTableForm((p) => ({ ...p, bssType: e.target.value }))}>
                <option value=""></option>
                {bssTypeOptions.map((o) => <option key={o.dtlCd} value={o.dtlCd}>{o.dtlCdNm}</option>)}
              </select>
            ) : (
              <span>{bssTypeLabelMap[table.bssType] || table.bssType || '-'}</span>
            )}
          </div>
          <div className="detail-info-row">
            <label>{t('manage.pricing.priceTable.labelDescription')}</label>
            {isEditingTable ? (
              <textarea value={tableForm.description} onChange={(e) => setTableForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
            ) : (
              <span>{table.description || '-'}</span>
            )}
          </div>
        </div>
      </div>

      {/* 단가 항목 섹션: 3컬럼 레이아웃 */}
      <div className="detail-items-layout">
        {/* 좌측: 단가 항목 그리드 */}
        <div className="detail-items-left">
          <div className="detail-section-header">
            <h3>{t('manage.pricing.priceTable.priceItems')} ({t('manage.pricing.priceTable.priceItemCount', { count: priceItems.length })})</h3>
            <div className="header-actions">
              <button className="btn-ghost" onClick={handleEditItem} disabled={!selectedItem} style={{ marginRight: '8px' }}>{t('manage.common.edit')}</button>
              <button className="btn-danger" onClick={handleDeleteItemClick} disabled={!selectedItem}>{t('manage.common.delete')}</button>
            </div>
          </div>
          <div className="grid-container">
            {itemsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)' }}>
                <span className="spinner" />
                <span style={{ marginLeft: '8px' }}>{t('manage.pricing.priceTable.loading')}</span>
              </div>
            ) : (
              <AgGridReact
                ref={gridRef}
                rowData={priceItems}
                columnDefs={itemColumnDefs}
                defaultColDef={defaultColDef}
                onRowDoubleClicked={handleItemDoubleClick}
                onSelectionChanged={onItemSelectionChanged}
                rowSelection="single"
                animateRows={true}
                getRowId={(p) => String(p.data.id)}
                headerHeight={44}
                rowHeight={42}
                overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.pricing.priceTable.noPriceItems')}</span>`}
              />
            )}
          </div>
        </div>

        {/* 중앙: 단가 일괄 추가 */}
        <div className="detail-items-center">
          <div className="batch-add-form">
            <div className="batch-add-header">
              <h4>{t('manage.pricing.priceTable.addPriceItem')}</h4>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('manage.common.recordCount', { count: addRows.length })}</span>
            </div>
            <div className="batch-add-rows">
              {addRows.map((row, idx) => {
                const rowDifficulties = getDifficultiesForBssType(table.bssType);
                return (
                  <div key={idx} className="batch-add-row">
                    <div className="form-group">
                      <label>{t('manage.pricing.priceTable.labelDifficulty')}</label>
                      <select value={row.fileDifficultId} onChange={(e) => handleRowChange(idx, 'fileDifficultId', e.target.value)} disabled={!table.bssType}>
                        <option value=""></option>
                        {rowDifficulties.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{t('manage.pricing.priceTable.labelPriceWon')}</label>
                      <input type="number" value={row.price} onChange={(e) => handleRowChange(idx, 'price', e.target.value)} className="row-price" min={0} />
                    </div>
                    <button className="btn-icon row-delete-btn" onClick={() => handleRemoveRow(idx)}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="batch-add-actions">
              <button className="btn-ghost" onClick={handleAddRow}>
                {t('manage.pricing.priceTable.addRow')}
              </button>
              <button className="btn-primary" onClick={handleBatchAdd} disabled={batchAddLoading}>
                {batchAddLoading ? <span className="spinner" /> : t('manage.pricing.priceTable.batchAdd')}
              </button>
            </div>
          </div>
        </div>

        {/* 우측: 관리 패널 */}
        <div className="detail-right-panel">
          {/* 의뢰유형 관리 */}
          <div className="panel-card">
            <div className="panel-card-header" onClick={() => setBssSectionOpen(!bssSectionOpen)}>
              <h4>{t('manage.pricing.priceTable.requestTypeManagement')}</h4>
              <span className={`toggle-icon ${bssSectionOpen ? 'expanded' : ''}`}>▼</span>
            </div>
            {bssSectionOpen && (
              <div className="panel-card-body">
                <BssTypeManager bssTypeOptions={bssTypeOptions} refreshBssTypeOptions={refreshBssTypeOptions} t={t} />
              </div>
            )}
          </div>

          {/* 난이도 관리 */}
          <div className="panel-card difficulty-manager">
            <div className="panel-card-header" onClick={() => setDiffSectionOpen(!diffSectionOpen)}>
              <h4>{t('manage.pricing.priceTable.difficultyManagement')}</h4>
              <span className={`toggle-icon ${diffSectionOpen ? 'expanded' : ''}`}>▼</span>
            </div>
            {diffSectionOpen && (
              <div className="panel-card-body">
                <div className="difficulty-filter">
                  <div className="form-group">
                    <label>{t('manage.pricing.priceTable.labelRequestType')}</label>
                    <select value={diffBssType} onChange={(e) => setDiffBssType(e.target.value)}>
                      <option value="">{t('manage.pricing.priceTable.selectPlaceholder')}</option>
                      {bssTypeOptions.map((o) => <option key={o.dtlCd} value={o.dtlCd}>{o.dtlCdNm}</option>)}
                    </select>
                  </div>
                </div>

                {diffBssType ? (
                  <>
                    <div className="difficulty-list">
                      {manageDifficulties.length > 0 ? manageDifficulties.map((d) => (
                        <div key={d.id} className="difficulty-item">
                          <div>
                            <span className="difficulty-name">{d.name}</span>
                            {d.description && <span className="difficulty-desc">{d.description}</span>}
                          </div>
                          <button className="btn-icon" onClick={() => handleDeleteDifficulty(d.id)}>
                            ✕
                          </button>
                        </div>
                      )) : (
                        <p className="empty-text">{t('manage.pricing.priceTable.noDifficulties')}</p>
                      )}
                    </div>
                    {!showDiffAddForm ? (
                      <button className="btn-ghost" onClick={() => setShowDiffAddForm(true)} style={{ marginTop: '8px', width: '100%' }}>
                        {t('manage.pricing.priceTable.add')}
                      </button>
                    ) : (
                      <div className="difficulty-add-row" style={{ flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        <input type="text" value={newDiffName} onChange={(e) => setNewDiffName(e.target.value)} placeholder={t('manage.pricing.priceTable.difficultyNamePlaceholder')} />
                        <input type="text" value={newDiffDesc} onChange={(e) => setNewDiffDesc(e.target.value)} placeholder={t('manage.pricing.priceTable.difficultyDescPlaceholder')} />
                        <button className="btn-primary" disabled={diffAddLoading}
                          onClick={() => { handleAddDifficulty(); setShowDiffAddForm(false); }}
                        >
                          {diffAddLoading ? <span className="spinner" /> : t('manage.pricing.priceTable.add')}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="empty-text">{t('manage.pricing.priceTable.selectRequestTypeForDifficulty')}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 수정 Dialog (선택 항목) */}
      {editModalOpen && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" onClick={e => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.pricing.priceTable.editDialog.title')}</h3>
              <button className="notion-modal-close" onClick={() => setEditModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label>{t('manage.pricing.priceTable.labelDifficulty')}</label>
                  <select value={editModalData.fileDifficultId} onChange={(e) => setEditModalData((p) => ({ ...p, fileDifficultId: e.target.value }))} required disabled={!table.bssType}>
                    <option value=""></option>
                    {editFormDifficulties.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.priceTable.labelPriceWonInput')}</label>
                  <input type="number" value={editModalData.price} onChange={(e) => setEditModalData((p) => ({ ...p, price: e.target.value }))} required min={0} />
                </div>
              </div>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setEditModalOpen(false)} disabled={editModalLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-primary" onClick={handleEditModalSave} disabled={editModalLoading}>
                {editModalLoading ? t('manage.common.saving') : t('manage.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 Dialog */}
      {deleteItemDialogOpen && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" onClick={e => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.pricing.priceTable.deleteDialog.title')}</h3>
              <button className="notion-modal-close" onClick={() => setDeleteItemDialogOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body"><p>{t('manage.pricing.priceTable.deleteDialog.message')}</p></div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setDeleteItemDialogOpen(false)} disabled={deleteItemLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-danger" onClick={handleDeleteItemConfirm} disabled={deleteItemLoading}>
                {deleteItemLoading ? t('manage.common.deleting') : t('manage.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 단가표 목록 뷰 (메인)
// ============================================================
export default function PriceTableTab({ priceTables, refreshPriceTables, fileDifficulties, refreshFileDifficulties, bssTypeOptions, refreshBssTypeOptions }) {
  const { t } = useTranslation('soribaro');
  const [searchParams, setSearchParams] = useSearchParams();
  const gridRef = useRef(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [modalData, setModalData] = useState(INITIAL_TABLE_MODAL);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  const detailTableId = searchParams.get('tableId');
  const detailTable = useMemo(() => {
    if (!detailTableId) return null;
    return priceTables.find((t) => String(t.id) === detailTableId) || null;
  }, [detailTableId, priceTables]);

  const setDetailTable = useCallback((table) => {
    if (table) {
      setSearchParams((prev) => { prev.set('tableId', String(table.id)); return prev; });
    } else {
      setSearchParams((prev) => { prev.delete('tableId'); return prev; }, { replace: true });
    }
  }, [setSearchParams]);

  const rowData = useMemo(() => {
    if (!keyword) return priceTables;
    return priceTables.filter((t) => t.name.includes(keyword) || (t.description || '').includes(keyword));
  }, [priceTables, keyword]);

  const columnDefs = useMemo(() => [
    { field: 'id', headerName: 'ID', width: 80, cellClass: 'text-center' },
    { field: 'name', headerName: t('manage.pricing.priceTable.columns.priceTableName'), flex: 1, minWidth: 160 },
    {
      field: 'bssType',
      headerName: t('manage.pricing.priceTable.columns.requestType'),
      width: 120,
      cellClass: 'text-center',
      valueFormatter: (p) => bssTypeOptions.find((o) => o.dtlCd === p.value)?.dtlCdNm || p.value || '-',
    },
    { field: 'description', headerName: t('manage.pricing.priceTable.columns.description'), flex: 2, minWidth: 200 },
    { field: 'createdAt', headerName: t('manage.pricing.priceTable.columns.createdAt'), width: 160 },
  ], [t, bssTypeOptions]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);

  const handleCreate = useCallback(() => {
    setModalMode('create');
    setModalData(INITIAL_TABLE_MODAL);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback(() => {
    if (!selectedRow) { alert(t('manage.pricing.priceTable.alertSelectEditTable')); return; }
    setModalMode('edit');
    setModalData({ name: selectedRow.name, description: selectedRow.description || '', bssType: selectedRow.bssType || '' });
    setModalOpen(true);
  }, [selectedRow]);

  const handleRowDoubleClick = useCallback((e) => {
    setDetailTable(e.data);
  }, []);

  const handleModalSave = useCallback(async () => {
    if (!modalData.name.trim()) { alert(t('manage.pricing.priceTable.alertPriceTableNameRequired')); return; }
    if (!modalData.bssType) { alert(t('manage.pricing.priceTable.alertRequestTypeRequired')); return; }
    setModalLoading(true);
    try {
      let res;
      if (modalMode === 'create') {
        res = await createPriceTable({ name: modalData.name.trim(), description: modalData.description.trim(), bssType: modalData.bssType });
      } else {
        res = await updatePriceTable(selectedRow.id, { name: modalData.name.trim(), description: modalData.description.trim(), bssType: modalData.bssType });
      }
      if (res.status === 'SUCCESS') {
        setModalOpen(false);
        setSelectedRow(null);
        refreshPriceTables();
      } else {
        alert(res.message || t('manage.common.saveFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.saveFailed'));
    } finally {
      setModalLoading(false);
    }
  }, [modalMode, modalData, selectedRow, refreshPriceTables]);

  const handleDeleteClick = useCallback(() => {
    if (!selectedRow) { alert(t('manage.pricing.priceTable.alertSelectDeleteTable')); return; }
    setDeleteDialogOpen(true);
  }, [selectedRow]);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const res = await deletePriceTable(selectedRow.id);
      if (res.status === 'SUCCESS') {
        setDeleteDialogOpen(false);
        setSelectedRow(null);
        refreshPriceTables();
      } else {
        alert(res.message || t('manage.common.deleteFailed'));
      }
    } catch (err) {
      // 409 Conflict: 참조 중인 작업자 등급이 있음 → 강제 삭제 확인
      if (err.status === 409) {
        setDeleteDialogOpen(false);
        const confirmForce = window.confirm(err.message || t('manage.pricing.priceTable.deleteConflict'));
        if (confirmForce) {
          try {
            const forceRes = await deletePriceTable(selectedRow.id, true);
            if (forceRes.status === 'SUCCESS') {
              setSelectedRow(null);
              refreshPriceTables();
              toast.success(t('manage.common.deleteSuccess'));
            } else {
              alert(forceRes.message || t('manage.common.deleteFailed'));
            }
          } catch (forceErr) {
            alert(forceErr.message || t('manage.common.deleteFailed'));
          }
        }
      } else {
        alert(err.message || t('manage.common.deleteFailed'));
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [selectedRow, refreshPriceTables, t]);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRow(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setDetailTable(null);
    setSelectedRow(null);
    refreshPriceTables();
  }, [refreshPriceTables, setDetailTable]);

  // 상세 뷰
  if (detailTable) {
    return (
      <PriceTableDetailView
        table={detailTable}
        onBack={handleBackFromDetail}
        refreshPriceTables={refreshPriceTables}
        fileDifficulties={fileDifficulties}
        refreshFileDifficulties={refreshFileDifficulties}
        bssTypeOptions={bssTypeOptions}
        refreshBssTypeOptions={refreshBssTypeOptions}
      />
    );
  }

  // 목록 뷰
  return (
    <div className="pricing-tab-content">
      <div className="tab-header">
        <div className="header-actions">
          <button className="btn-primary" onClick={handleCreate} style={{ marginRight: '8px' }}>{t('manage.common.newRegistration')}</button>
          <button className="btn-ghost" onClick={handleEdit} disabled={!selectedRow} style={{ marginRight: '8px' }}>{t('manage.common.edit')}</button>
          <button className="btn-danger" onClick={handleDeleteClick} disabled={!selectedRow}>{t('manage.common.delete')}</button>
        </div>
      </div>

      <div className="search-filters">
        <div className="filter-row">
          <div className="filter-group filter-keyword">
            <label>{t('manage.common.searchKeyword')}</label>
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t('manage.pricing.priceTable.searchPlaceholder')} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} style={{ minWidth: '250px' }} />
          </div>
          <div className="filter-actions">
            <button className="btn-reset" onClick={() => setKeyword('')}>{t('manage.common.reset')}</button>
          </div>
        </div>
      </div>

      <div className="result-info">
        <span className="total-count">{t('manage.pricing.workerLevel.totalCount', { count: rowData.length })}</span>
        {selectedRow && <span className="selected-info">{t('manage.pricing.workerLevel.selectedInfo', { name: selectedRow.name })}</span>}
      </div>

      <div className="grid-container">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onRowDoubleClicked={handleRowDoubleClick}
          onSelectionChanged={onSelectionChanged}
          rowSelection="single"
          animateRows={true}
          getRowId={(p) => String(p.data.id)}
          headerHeight={44}
          rowHeight={42}
          overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
        />
      </div>

      {/* 등록/수정 Dialog */}
      {modalOpen && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" onClick={e => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{modalMode === 'create' ? t('manage.pricing.priceTable.dialog.createTitle') : t('manage.pricing.priceTable.dialog.editTitle')}</h3>
              <button className="notion-modal-close" onClick={() => setModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label>{t('manage.pricing.priceTable.labelPriceTableName')}</label>
                  <input type="text" value={modalData.name} onChange={(e) => setModalData((p) => ({ ...p, name: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.priceTable.labelRequestType')}</label>
                  <select value={modalData.bssType} onChange={(e) => setModalData((p) => ({ ...p, bssType: e.target.value }))} required>
                    <option value=""></option>
                    {bssTypeOptions.map((o) => <option key={o.dtlCd} value={o.dtlCd}>{o.dtlCdNm}</option>)}
                  </select>
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', userSelect: 'none' }}>
                      {t('manage.pricing.priceTable.requestTypeManagement')}
                    </summary>
                    <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px' }}>
                      <BssTypeManager bssTypeOptions={bssTypeOptions} refreshBssTypeOptions={refreshBssTypeOptions} compact t={t} />
                    </div>
                  </details>
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.priceTable.labelDescription')}</label>
                  <textarea value={modalData.description} onChange={(e) => setModalData((p) => ({ ...p, description: e.target.value }))} rows={3} />
                </div>
              </div>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setModalOpen(false)} disabled={modalLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-primary" onClick={handleModalSave} disabled={modalLoading}>
                {modalLoading ? t('manage.common.saving') : t('manage.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 Dialog */}
      {deleteDialogOpen && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" onClick={e => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.pricing.priceTable.deleteTableDialog.title')}</h3>
              <button className="notion-modal-close" onClick={() => setDeleteDialogOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.pricing.priceTable.deleteTableDialog.message', { name: selectedRow?.name })}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-danger" onClick={handleDeleteConfirm} disabled={deleteLoading}>
                {deleteLoading ? t('manage.common.deleting') : t('manage.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
