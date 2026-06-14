import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import {
  createDepreciationTable,
  updateDepreciationTable,
  deleteDepreciationTable,
} from '../../../../api/v9/depreciationTables';
import {
  getDepreciationItems,
  createDepreciationItem,
  updateDepreciationItem,
  deleteDepreciationItem,
} from '../../../../api/v9/depreciationItems';
import { toast } from '../../../../stores/toastStore';
import { useTranslation } from 'react-i18next';

ModuleRegistry.registerModules([AllCommunityModule]);

const INITIAL_TABLE_MODAL = { name: '', description: '', bssType: '' };
const INITIAL_ITEM_ROW = { accuracyMin: '', accuracyMax: '', payRate: '' };

// ============================================================
// 감가표 상세 뷰
// ============================================================
function DepreciationTableDetailView({
  table,
  onBack,
  refreshDepreciationTables,
  bssTypeOptions,
}) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState(INITIAL_ITEM_ROW);
  const [editModalLoading, setEditModalLoading] = useState(false);

  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false);
  const [deleteItemLoading, setDeleteItemLoading] = useState(false);

  const [isEditingTable, setIsEditingTable] = useState(false);
  const [tableForm, setTableForm] = useState({
    name: table.name,
    description: table.description || '',
    bssType: table.bssType || '',
  });
  const [tableFormLoading, setTableFormLoading] = useState(false);

  const [addRows, setAddRows] = useState([{ ...INITIAL_ITEM_ROW }]);
  const [batchAddLoading, setBatchAddLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res = await getDepreciationItems({ depreciationTableId: table.id });
      if (res.status === 'SUCCESS') setItems(res.data || []);
    } catch (err) {
      console.error('DepreciationItems fetch error:', err);
    } finally {
      setItemsLoading(false);
    }
  }, [table.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const bssTypeLabelMap = useMemo(
    () => Object.fromEntries(bssTypeOptions.map((o) => [o.dtlCd, o.dtlCdNm])),
    [bssTypeOptions],
  );

  const itemColumnDefs = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 70, cellClass: 'text-center' },
      {
        headerName: t('manage.depreciation.columns.accuracyRange'),
        flex: 1,
        minWidth: 160,
        cellClass: 'text-center',
        valueGetter: (p) =>
          `${Number(p.data.accuracyMin)}% ~ ${Number(p.data.accuracyMax)}%`,
      },
      {
        field: 'payRate',
        headerName: t('manage.depreciation.columns.payRate'),
        flex: 1,
        minWidth: 100,
        cellClass: 'text-right',
        valueFormatter: (p) => (p.value == null ? '-' : `${Number(p.value)}%`),
      },
    ],
    [t],
  );

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);

  // --- 다중행 추가 ---
  const handleAddRow = useCallback(() => {
    setAddRows((prev) => [...prev, { ...INITIAL_ITEM_ROW }]);
  }, []);

  const handleRemoveRow = useCallback((index) => {
    setAddRows((prev) => {
      if (prev.length <= 1) return [{ ...INITIAL_ITEM_ROW }];
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleRowChange = useCallback((index, field, value) => {
    setAddRows((prev) =>
      prev.map((row, i) => (i !== index ? row : { ...row, [field]: value })),
    );
  }, []);

  const isRowFilled = (row) =>
    row.accuracyMin !== '' && row.accuracyMax !== '' && row.payRate !== '';

  const isRowValid = (row) => {
    if (!isRowFilled(row)) return false;
    const min = Number(row.accuracyMin);
    const max = Number(row.accuracyMax);
    const rate = Number(row.payRate);
    if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(rate)) return false;
    if (min >= max) return false;
    if (rate < 0) return false;
    return true;
  };

  const handleBatchAdd = useCallback(async () => {
    const validRows = addRows.filter(isRowValid);
    if (validRows.length === 0) {
      alert(t('manage.depreciation.alertAddItems'));
      return;
    }

    setBatchAddLoading(true);
    const failedIndices = [];
    for (let i = 0; i < addRows.length; i++) {
      const row = addRows[i];
      if (!isRowFilled(row)) continue;
      if (!isRowValid(row)) {
        failedIndices.push(i);
        continue;
      }
      try {
        const res = await createDepreciationItem({
          depreciationTableId: table.id,
          accuracyMin: Number(row.accuracyMin),
          accuracyMax: Number(row.accuracyMax),
          payRate: Number(row.payRate),
        });
        if (res.status !== 'SUCCESS') failedIndices.push(i);
      } catch {
        failedIndices.push(i);
      }
    }

    if (failedIndices.length > 0) {
      setAddRows(failedIndices.map((i) => addRows[i]));
      alert(
        t('manage.pricing.priceTable.alertBatchResult', {
          success: addRows.filter(isRowFilled).length - failedIndices.length,
          fail: failedIndices.length,
        }),
      );
    } else {
      setAddRows([{ ...INITIAL_ITEM_ROW }]);
    }
    fetchItems();
    setBatchAddLoading(false);
  }, [addRows, table.id, fetchItems, t]);

  // --- 수정 ---
  const handleEditItem = useCallback(() => {
    if (!selectedItem) {
      alert(t('manage.depreciation.alertSelectEditItem'));
      return;
    }
    setEditModalData({
      accuracyMin: String(selectedItem.accuracyMin ?? ''),
      accuracyMax: String(selectedItem.accuracyMax ?? ''),
      payRate: String(selectedItem.payRate ?? ''),
    });
    setEditModalOpen(true);
  }, [selectedItem, t]);

  const handleItemDoubleClick = useCallback((e) => {
    setSelectedItem(e.data);
    setEditModalData({
      accuracyMin: String(e.data.accuracyMin ?? ''),
      accuracyMax: String(e.data.accuracyMax ?? ''),
      payRate: String(e.data.payRate ?? ''),
    });
    setEditModalOpen(true);
  }, []);

  const handleEditModalSave = useCallback(async () => {
    if (
      editModalData.accuracyMin === '' ||
      editModalData.accuracyMax === '' ||
      editModalData.payRate === ''
    ) {
      alert(t('manage.depreciation.alertAllFieldsRequired'));
      return;
    }
    const min = Number(editModalData.accuracyMin);
    const max = Number(editModalData.accuracyMax);
    const rate = Number(editModalData.payRate);
    if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(rate)) {
      alert(t('manage.depreciation.alertInvalidNumber'));
      return;
    }
    if (min >= max) {
      alert(t('manage.depreciation.alertInvalidRange'));
      return;
    }
    if (rate < 0) {
      alert(t('manage.depreciation.alertInvalidPayRate'));
      return;
    }

    setEditModalLoading(true);
    try {
      const res = await updateDepreciationItem(selectedItem.id, {
        accuracyMin: min,
        accuracyMax: max,
        payRate: rate,
      });
      if (res.status === 'SUCCESS') {
        setEditModalOpen(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertUpdateFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertUpdateFailed'));
    } finally {
      setEditModalLoading(false);
    }
  }, [editModalData, selectedItem, fetchItems, t]);

  // --- 삭제 ---
  const handleDeleteItemClick = useCallback(() => {
    if (!selectedItem) {
      alert(t('manage.depreciation.alertSelectDeleteItem'));
      return;
    }
    setDeleteItemDialogOpen(true);
  }, [selectedItem, t]);

  const handleDeleteItemConfirm = useCallback(async () => {
    setDeleteItemLoading(true);
    try {
      const res = await deleteDepreciationItem(selectedItem.id);
      if (res.status === 'SUCCESS') {
        setDeleteItemDialogOpen(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertDeleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertDeleteFailed'));
    } finally {
      setDeleteItemLoading(false);
    }
  }, [selectedItem, fetchItems, t]);

  const onItemSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedItem(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  // --- 감가표 정보 수정 ---
  const handleSaveTable = useCallback(async () => {
    if (!tableForm.name.trim()) {
      alert(t('manage.depreciation.alertTableNameRequired'));
      return;
    }
    if (!tableForm.bssType) {
      alert(t('manage.depreciation.alertBssTypeRequired'));
      return;
    }
    setTableFormLoading(true);
    try {
      const res = await updateDepreciationTable(table.id, {
        name: tableForm.name.trim(),
        description: tableForm.description.trim(),
        bssType: tableForm.bssType,
      });
      if (res.status === 'SUCCESS') {
        setIsEditingTable(false);
        refreshDepreciationTables();
      } else {
        alert(res.message || t('manage.pricing.priceTable.alertUpdateFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.pricing.priceTable.alertUpdateFailed'));
    } finally {
      setTableFormLoading(false);
    }
  }, [tableForm, table.id, refreshDepreciationTables, t]);

  const handleCancelEditTable = useCallback(() => {
    setTableForm({
      name: table.name,
      description: table.description || '',
      bssType: table.bssType || '',
    });
    setIsEditingTable(false);
  }, [table]);

  return (
    <div className="pricing-tab-content">
      <div className="detail-header">
        <button className="btn-ghost" onClick={onBack} style={{ marginRight: '8px' }}>
          {t('manage.pricing.priceTable.backToList')}
        </button>
        <h2 className="detail-title">{table.name}</h2>
        <span className="detail-badge">ID: {table.id}</span>
      </div>

      {/* 감가표 기본 정보 카드 */}
      <div className="detail-info-card">
        <div className="detail-info-header">
          <h3>{t('manage.depreciation.tableInfo')}</h3>
          {!isEditingTable ? (
            <button className="btn-ghost" onClick={() => setIsEditingTable(true)}>
              {t('manage.common.edit')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-ghost"
                onClick={handleCancelEditTable}
                disabled={tableFormLoading}
              >
                {t('manage.common.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveTable}
                disabled={tableFormLoading}
              >
                {tableFormLoading ? <span className="spinner" /> : t('manage.common.save')}
              </button>
            </div>
          )}
        </div>
        <div className="detail-info-body">
          <div className="detail-info-row">
            <label>{t('manage.depreciation.labelTableName')}</label>
            {isEditingTable ? (
              <input
                type="text"
                value={tableForm.name}
                onChange={(e) => setTableForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            ) : (
              <span>{table.name}</span>
            )}
          </div>
          <div className="detail-info-row">
            <label>{t('manage.pricing.priceTable.labelRequestType')}</label>
            {isEditingTable ? (
              <select
                value={tableForm.bssType}
                onChange={(e) => setTableForm((p) => ({ ...p, bssType: e.target.value }))}
              >
                <option value=""></option>
                {bssTypeOptions.map((o) => (
                  <option key={o.dtlCd} value={o.dtlCd}>
                    {o.dtlCdNm}
                  </option>
                ))}
              </select>
            ) : (
              <span>{bssTypeLabelMap[table.bssType] || table.bssType || '-'}</span>
            )}
          </div>
          <div className="detail-info-row">
            <label>{t('manage.pricing.priceTable.labelDescription')}</label>
            {isEditingTable ? (
              <textarea
                value={tableForm.description}
                onChange={(e) => setTableForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            ) : (
              <span>{table.description || '-'}</span>
            )}
          </div>
        </div>
      </div>

      {/* 감가 항목 섹션 */}
      <div className="detail-items-layout">
        <div className="detail-items-left">
          <div className="detail-section-header">
            <h3>
              {t('manage.depreciation.items')} (
              {t('manage.depreciation.itemCount', { count: items.length })})
            </h3>
            <div className="header-actions">
              <button
                className="btn-ghost"
                onClick={handleEditItem}
                disabled={!selectedItem}
                style={{ marginRight: '8px' }}
              >
                {t('manage.common.edit')}
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteItemClick}
                disabled={!selectedItem}
              >
                {t('manage.common.delete')}
              </button>
            </div>
          </div>
          <div className="grid-container">
            {itemsLoading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '200px',
                  color: 'var(--text-secondary)',
                }}
              >
                <span className="spinner" />
                <span style={{ marginLeft: '8px' }}>
                  {t('manage.pricing.priceTable.loading')}
                </span>
              </div>
            ) : (
              <AgGridReact
                ref={gridRef}
                rowData={items}
                columnDefs={itemColumnDefs}
                defaultColDef={defaultColDef}
                onRowDoubleClicked={handleItemDoubleClick}
                onSelectionChanged={onItemSelectionChanged}
                rowSelection="single"
                animateRows={true}
                getRowId={(p) => String(p.data.id)}
                headerHeight={44}
                rowHeight={42}
                overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.depreciation.noItems')}</span>`}
              />
            )}
          </div>
        </div>

        {/* 감가 항목 일괄 추가 */}
        <div className="detail-items-center">
          <div className="batch-add-form">
            <div className="batch-add-header">
              <h4>{t('manage.depreciation.addItem')}</h4>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {t('manage.common.recordCount', { count: addRows.length })}
              </span>
            </div>
            <div className="batch-add-rows">
              {addRows.map((row, idx) => (
                <div key={idx} className="batch-add-row">
                  <div className="form-group">
                    <label>{t('manage.depreciation.labelAccuracyMin')}</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={row.accuracyMin}
                      onChange={(e) => handleRowChange(idx, 'accuracyMin', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('manage.depreciation.labelAccuracyMax')}</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={row.accuracyMax}
                      onChange={(e) => handleRowChange(idx, 'accuracyMax', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('manage.depreciation.labelPayRate')}</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={row.payRate}
                      onChange={(e) => handleRowChange(idx, 'payRate', e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-icon row-delete-btn"
                    onClick={() => handleRemoveRow(idx)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="batch-add-actions">
              <button className="btn-ghost" onClick={handleAddRow}>
                {t('manage.pricing.priceTable.addRow')}
              </button>
              <button
                className="btn-primary"
                onClick={handleBatchAdd}
                disabled={batchAddLoading}
              >
                {batchAddLoading ? (
                  <span className="spinner" />
                ) : (
                  t('manage.pricing.priceTable.batchAdd')
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 수정 Dialog */}
      {editModalOpen && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.depreciation.editDialog.title')}</h3>
              <button className="notion-modal-close" onClick={() => setEditModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label>{t('manage.depreciation.labelAccuracyMin')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={editModalData.accuracyMin}
                    onChange={(e) =>
                      setEditModalData((p) => ({ ...p, accuracyMin: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('manage.depreciation.labelAccuracyMax')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={editModalData.accuracyMax}
                    onChange={(e) =>
                      setEditModalData((p) => ({ ...p, accuracyMax: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('manage.depreciation.labelPayRate')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editModalData.payRate}
                    onChange={(e) =>
                      setEditModalData((p) => ({ ...p, payRate: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
            </div>
            <div className="notion-modal-footer">
              <button
                className="btn-ghost"
                onClick={() => setEditModalOpen(false)}
                disabled={editModalLoading}
              >
                {t('manage.common.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleEditModalSave}
                disabled={editModalLoading}
              >
                {editModalLoading ? t('manage.common.saving') : t('manage.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 Dialog */}
      {deleteItemDialogOpen && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.depreciation.deleteDialog.title')}</h3>
              <button
                className="notion-modal-close"
                onClick={() => setDeleteItemDialogOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.depreciation.deleteDialog.message')}</p>
            </div>
            <div className="notion-modal-footer">
              <button
                className="btn-ghost"
                onClick={() => setDeleteItemDialogOpen(false)}
                disabled={deleteItemLoading}
              >
                {t('manage.common.cancel')}
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteItemConfirm}
                disabled={deleteItemLoading}
              >
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
// 감가표 목록 뷰 (메인)
// ============================================================
export default function DepreciationTableTab({
  depreciationTables,
  refreshDepreciationTables,
  bssTypeOptions,
}) {
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
    return depreciationTables.find((tbl) => String(tbl.id) === detailTableId) || null;
  }, [detailTableId, depreciationTables]);

  const setDetailTable = useCallback(
    (table) => {
      if (table) {
        setSearchParams((prev) => {
          prev.set('tableId', String(table.id));
          return prev;
        });
      } else {
        setSearchParams(
          (prev) => {
            prev.delete('tableId');
            return prev;
          },
          { replace: true },
        );
      }
    },
    [setSearchParams],
  );

  const rowData = useMemo(() => {
    if (!keyword) return depreciationTables;
    return depreciationTables.filter(
      (tbl) =>
        (tbl.name || '').includes(keyword) ||
        (tbl.description || '').includes(keyword),
    );
  }, [depreciationTables, keyword]);

  const columnDefs = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 80, cellClass: 'text-center' },
      {
        field: 'name',
        headerName: t('manage.depreciation.columns.tableName'),
        flex: 1,
        minWidth: 160,
      },
      {
        field: 'bssType',
        headerName: t('manage.pricing.priceTable.columns.requestType'),
        width: 120,
        cellClass: 'text-center',
        valueFormatter: (p) =>
          bssTypeOptions.find((o) => o.dtlCd === p.value)?.dtlCdNm || p.value || '-',
      },
      {
        field: 'description',
        headerName: t('manage.pricing.priceTable.columns.description'),
        flex: 2,
        minWidth: 200,
      },
      {
        field: 'createdAt',
        headerName: t('manage.pricing.priceTable.columns.createdAt'),
        width: 160,
      },
    ],
    [t, bssTypeOptions],
  );

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);

  const handleCreate = useCallback(() => {
    setModalMode('create');
    setModalData(INITIAL_TABLE_MODAL);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback(() => {
    if (!selectedRow) {
      alert(t('manage.depreciation.alertSelectEditTable'));
      return;
    }
    setModalMode('edit');
    setModalData({
      name: selectedRow.name,
      description: selectedRow.description || '',
      bssType: selectedRow.bssType || '',
    });
    setModalOpen(true);
  }, [selectedRow, t]);

  const handleRowDoubleClick = useCallback(
    (e) => {
      setDetailTable(e.data);
    },
    [setDetailTable],
  );

  const handleModalSave = useCallback(async () => {
    if (!modalData.name.trim()) {
      alert(t('manage.depreciation.alertTableNameRequired'));
      return;
    }
    if (!modalData.bssType) {
      alert(t('manage.depreciation.alertBssTypeRequired'));
      return;
    }
    setModalLoading(true);
    try {
      let res;
      if (modalMode === 'create') {
        res = await createDepreciationTable({
          name: modalData.name.trim(),
          description: modalData.description.trim(),
          bssType: modalData.bssType,
        });
      } else {
        res = await updateDepreciationTable(selectedRow.id, {
          name: modalData.name.trim(),
          description: modalData.description.trim(),
          bssType: modalData.bssType,
        });
      }
      if (res.status === 'SUCCESS') {
        setModalOpen(false);
        setSelectedRow(null);
        refreshDepreciationTables();
      } else {
        alert(res.message || t('manage.common.saveFailed'));
      }
    } catch (err) {
      // 409 Conflict: 동일 BSS_TYPE 감가표가 이미 존재
      if (err.status === 409) {
        alert(err.message || t('manage.depreciation.alertDuplicateBssType'));
      } else {
        alert(err.message || t('manage.common.saveFailed'));
      }
    } finally {
      setModalLoading(false);
    }
  }, [modalMode, modalData, selectedRow, refreshDepreciationTables, t]);

  const handleDeleteClick = useCallback(() => {
    if (!selectedRow) {
      alert(t('manage.depreciation.alertSelectDeleteTable'));
      return;
    }
    setDeleteDialogOpen(true);
  }, [selectedRow, t]);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const res = await deleteDepreciationTable(selectedRow.id);
      if (res.status === 'SUCCESS') {
        setDeleteDialogOpen(false);
        setSelectedRow(null);
        refreshDepreciationTables();
        toast.success(t('manage.common.deleteSuccess'));
      } else {
        alert(res.message || t('manage.common.deleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.deleteFailed'));
    } finally {
      setDeleteLoading(false);
    }
  }, [selectedRow, refreshDepreciationTables, t]);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRow(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setDetailTable(null);
    setSelectedRow(null);
    refreshDepreciationTables();
  }, [refreshDepreciationTables, setDetailTable]);

  if (detailTable) {
    return (
      <DepreciationTableDetailView
        table={detailTable}
        onBack={handleBackFromDetail}
        refreshDepreciationTables={refreshDepreciationTables}
        bssTypeOptions={bssTypeOptions}
      />
    );
  }

  return (
    <div className="pricing-tab-content">
      <div className="tab-header">
        <div className="header-actions">
          <button
            className="btn-primary"
            onClick={handleCreate}
            style={{ marginRight: '8px' }}
          >
            {t('manage.common.newRegistration')}
          </button>
          <button
            className="btn-ghost"
            onClick={handleEdit}
            disabled={!selectedRow}
            style={{ marginRight: '8px' }}
          >
            {t('manage.common.edit')}
          </button>
          <button className="btn-danger" onClick={handleDeleteClick} disabled={!selectedRow}>
            {t('manage.common.delete')}
          </button>
        </div>
      </div>

      <div className="search-filters">
        <div className="filter-row">
          <div className="filter-group filter-keyword">
            <label>{t('manage.common.searchKeyword')}</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('manage.depreciation.searchPlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              style={{ minWidth: '250px' }}
            />
          </div>
          <div className="filter-actions">
            <button className="btn-reset" onClick={() => setKeyword('')}>
              {t('manage.common.reset')}
            </button>
          </div>
        </div>
      </div>

      <div className="result-info">
        <span className="total-count">
          {t('manage.pricing.workerLevel.totalCount', { count: rowData.length })}
        </span>
        {selectedRow && (
          <span className="selected-info">
            {t('manage.pricing.workerLevel.selectedInfo', { name: selectedRow.name })}
          </span>
        )}
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
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>
                {modalMode === 'create'
                  ? t('manage.depreciation.dialog.createTitle')
                  : t('manage.depreciation.dialog.editTitle')}
              </h3>
              <button className="notion-modal-close" onClick={() => setModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label>{t('manage.depreciation.labelTableName')}</label>
                  <input
                    type="text"
                    value={modalData.name}
                    onChange={(e) =>
                      setModalData((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.priceTable.labelRequestType')}</label>
                  <select
                    value={modalData.bssType}
                    onChange={(e) =>
                      setModalData((p) => ({ ...p, bssType: e.target.value }))
                    }
                    required
                  >
                    <option value=""></option>
                    {bssTypeOptions.map((o) => (
                      <option key={o.dtlCd} value={o.dtlCd}>
                        {o.dtlCdNm}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.priceTable.labelDescription')}</label>
                  <textarea
                    value={modalData.description}
                    onChange={(e) =>
                      setModalData((p) => ({ ...p, description: e.target.value }))
                    }
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="notion-modal-footer">
              <button
                className="btn-ghost"
                onClick={() => setModalOpen(false)}
                disabled={modalLoading}
              >
                {t('manage.common.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleModalSave}
                disabled={modalLoading}
              >
                {modalLoading ? t('manage.common.saving') : t('manage.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 Dialog */}
      {deleteDialogOpen && (
        <div className="notion-modal-overlay">
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.depreciation.deleteTableDialog.title')}</h3>
              <button
                className="notion-modal-close"
                onClick={() => setDeleteDialogOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <p>
                {t('manage.depreciation.deleteTableDialog.message', {
                  name: selectedRow?.name,
                })}
              </p>
            </div>
            <div className="notion-modal-footer">
              <button
                className="btn-ghost"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleteLoading}
              >
                {t('manage.common.cancel')}
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? t('manage.common.deleting') : t('manage.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
