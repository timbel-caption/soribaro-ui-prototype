import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { createWorkerLevel, updateWorkerLevel, deleteWorkerLevel } from '../../../../api/v9/workerLevels';
import { useTranslation } from 'react-i18next';

ModuleRegistry.registerModules([AllCommunityModule]);

const INITIAL_MODAL = { levelName: '', priceTableId: '', accuracyAvgLevel: '', errorCountAvgLevel: '', workingTime: '' };

const formatWorkingTime = (seconds) => {
  if (seconds == null) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function WorkerLevelTab({ workerLevels, refreshWorkerLevels, priceTables }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [modalData, setModalData] = useState(INITIAL_MODAL);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  // 단가표 이름 맵
  const tableNameMap = useMemo(() => Object.fromEntries(priceTables.map((t) => [t.id, t.name])), [priceTables]);

  // 행 데이터
  const rowData = useMemo(() => {
    const filtered = keyword
      ? workerLevels.filter((l) => l.levelName.includes(keyword))
      : workerLevels;
    return filtered.map((l) => ({
      ...l,
      priceTableName: l.priceTableId ? (tableNameMap[l.priceTableId] || `ID:${l.priceTableId}`) : '-',
    }));
  }, [workerLevels, keyword, tableNameMap]);

  const columnDefs = useMemo(() => [
    { field: 'id', headerName: t('manage.pricing.workerLevel.columns.id'), width: 80, cellClass: 'text-center' },
    { field: 'levelName', headerName: t('manage.pricing.workerLevel.columns.levelName'), flex: 1, minWidth: 150 },
    { field: 'bssType', headerName: t('manage.pricing.priceTable.columns.requestType'), width: 100, cellClass: 'text-center', valueFormatter: (p) => p.value || '-' },
    { field: 'priceTableName', headerName: t('manage.pricing.workerLevel.columns.priceTableName'), flex: 1, minWidth: 160 },
    { field: 'accuracyAvgLevel', headerName: t('manage.pricing.workerLevel.columns.accuracyAvgLevel'), width: 130, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? p.value : '-' },
    { field: 'errorCountAvgLevel', headerName: t('manage.pricing.workerLevel.columns.errorCountAvgLevel'), width: 140, cellClass: 'text-center', valueFormatter: (p) => p.value != null ? p.value : '-' },
    { field: 'workingTime', headerName: t('manage.pricing.workerLevel.columns.workingTime'), width: 130, cellClass: 'text-center', valueFormatter: (p) => formatWorkingTime(p.value) },
  ], [t]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);

  const handleCreate = useCallback(() => {
    setModalMode('create');
    setModalData(INITIAL_MODAL);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback(() => {
    if (!selectedRow) { alert(t('manage.pricing.workerLevel.alertSelectEdit')); return; }
    setModalMode('edit');
    setModalData({
      levelName: selectedRow.levelName,
      priceTableId: selectedRow.priceTableId ? String(selectedRow.priceTableId) : '',
      accuracyAvgLevel: selectedRow.accuracyAvgLevel != null ? String(selectedRow.accuracyAvgLevel) : '',
      errorCountAvgLevel: selectedRow.errorCountAvgLevel != null ? String(selectedRow.errorCountAvgLevel) : '',
      workingTime: selectedRow.workingTime != null ? String(Math.round(selectedRow.workingTime / 60)) : '',
    });
    setModalOpen(true);
  }, [selectedRow]);

  const handleRowDoubleClick = useCallback((e) => {
    setSelectedRow(e.data);
    setModalMode('edit');
    setModalData({
      levelName: e.data.levelName,
      priceTableId: e.data.priceTableId ? String(e.data.priceTableId) : '',
      accuracyAvgLevel: e.data.accuracyAvgLevel != null ? String(e.data.accuracyAvgLevel) : '',
      errorCountAvgLevel: e.data.errorCountAvgLevel != null ? String(e.data.errorCountAvgLevel) : '',
      workingTime: e.data.workingTime != null ? String(Math.round(e.data.workingTime / 60)) : '',
    });
    setModalOpen(true);
  }, []);

  const handleModalSave = useCallback(async () => {
    if (!modalData.levelName.trim()) { alert(t('manage.pricing.workerLevel.alertLevelNameRequired')); return; }
    if (!modalData.priceTableId) { alert(t('manage.pricing.workerLevel.createDialog.helperText')); return; }

    setModalLoading(true);
    try {
      const payload = {
        levelName: modalData.levelName.trim(),
        priceTableId: Number(modalData.priceTableId),
        accuracyAvgLevel: modalData.accuracyAvgLevel !== '' ? Number(modalData.accuracyAvgLevel) : null,
        errorCountAvgLevel: modalData.errorCountAvgLevel !== '' ? parseInt(modalData.errorCountAvgLevel, 10) : null,
        workingTime: modalData.workingTime !== '' ? Number(modalData.workingTime) * 60 : null,
      };

      let res;
      if (modalMode === 'create') {
        res = await createWorkerLevel(payload);
      } else {
        res = await updateWorkerLevel(selectedRow.id, payload);
      }

      if (res.status === 'SUCCESS') {
        setModalOpen(false);
        setSelectedRow(null);
        refreshWorkerLevels();
      } else {
        alert(res.message || t('manage.common.saveFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.saveFailed'));
    } finally {
      setModalLoading(false);
    }
  }, [modalMode, modalData, selectedRow, refreshWorkerLevels, t]);

  useEffect(() => {
    if (!modalOpen) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [modalOpen]);

  const handleDeleteClick = useCallback(() => {
    if (!selectedRow) { alert(t('manage.pricing.workerLevel.alertSelectDelete')); return; }
    setDeleteDialogOpen(true);
  }, [selectedRow]);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const res = await deleteWorkerLevel(selectedRow.id);
      if (res.status === 'SUCCESS') {
        setDeleteDialogOpen(false);
        setSelectedRow(null);
        refreshWorkerLevels();
      } else {
        alert(res.message || t('manage.common.deleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.deleteFailed'));
    } finally {
      setDeleteLoading(false);
    }
  }, [selectedRow, refreshWorkerLevels]);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRow(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  return (
    <div className="pricing-tab-content">
      <div className="tab-header">
        <div className="header-actions">
          <button className="btn-primary" onClick={handleCreate}>{t('manage.common.newRegister')}</button>
          <button className="btn-ghost" onClick={handleEdit} disabled={!selectedRow}>{t('manage.common.edit')}</button>
          <button className="btn-danger" onClick={handleDeleteClick} disabled={!selectedRow}>{t('manage.common.delete')}</button>
        </div>
      </div>

      <div className="search-filters">
        <div className="filter-row">
          <div className="filter-group filter-keyword">
            <label>{t('manage.pricing.workerLevel.searchLabel')}</label>
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t('manage.pricing.workerLevel.searchPlaceholder')} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
          </div>
          <div className="filter-actions">
            <button className="btn-reset" onClick={() => setKeyword('')}>{t('manage.common.reset')}</button>
          </div>
        </div>
      </div>

      <div className="result-info">
        <span className="total-count">{t('manage.pricing.workerLevel.totalCount', { count: rowData.length })}</span>
        {selectedRow && <span className="selected-info">{t('manage.pricing.workerLevel.selected', { name: selectedRow.levelName })}</span>}
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
          <div className="notion-modal">
            <div className="notion-modal-header">
              <h3>{modalMode === 'create' ? t('manage.pricing.workerLevel.createDialog.title') : t('manage.pricing.workerLevel.createDialog.editTitle')}</h3>
              <button className="notion-modal-close" onClick={() => setModalOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
                <div className="form-group">
                  <label>{t('manage.pricing.workerLevel.createDialog.labelLevelName')}</label>
                  <input type="text" value={modalData.levelName} onChange={(e) => setModalData((p) => ({ ...p, levelName: e.target.value }))} required autoFocus placeholder={t('manage.pricing.workerLevel.createDialog.placeholderLevelName')} />
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.workerLevel.createDialog.labelPriceTable')}</label>
                  <select value={modalData.priceTableId} onChange={(e) => setModalData((p) => ({ ...p, priceTableId: e.target.value }))}>
                    <option value="">{t('manage.pricing.priceTable.selectPlaceholder')}</option>
                    {priceTables.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                  </select>
                  <span className="text-muted" style={{ fontSize: '12px' }}>{t('manage.pricing.workerLevel.createDialog.helperText')}</span>
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.workerLevel.createDialog.labelAccuracyAvgLevel')}</label>
                  <input type="number" step="0.1" min="0" value={modalData.accuracyAvgLevel} onChange={(e) => setModalData((p) => ({ ...p, accuracyAvgLevel: e.target.value }))} placeholder={t('manage.pricing.workerLevel.createDialog.placeholderAccuracyAvgLevel')} />
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.workerLevel.createDialog.labelErrorCountAvgLevel')}</label>
                  <input type="number" step="1" min="0" value={modalData.errorCountAvgLevel} onChange={(e) => setModalData((p) => ({ ...p, errorCountAvgLevel: e.target.value }))} placeholder={t('manage.pricing.workerLevel.createDialog.placeholderErrorCountAvgLevel')} />
                </div>
                <div className="form-group">
                  <label>{t('manage.pricing.workerLevel.createDialog.labelWorkingTime')}</label>
                  <input type="number" step="1" min="0" value={modalData.workingTime} onChange={(e) => setModalData((p) => ({ ...p, workingTime: e.target.value }))} placeholder={t('manage.pricing.workerLevel.createDialog.placeholderWorkingTime')} />
                  <span className="text-muted" style={{ fontSize: '12px' }}>{t('manage.pricing.workerLevel.createDialog.workingTimeUnit')}</span>
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
        <div className="notion-modal-overlay" onClick={() => setDeleteDialogOpen(false)}>
          <div className="notion-modal" onClick={e => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.pricing.workerLevel.deleteDialog.title')}</h3>
              <button className="notion-modal-close" onClick={() => setDeleteDialogOpen(false)}>&times;</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.pricing.workerLevel.deleteDialog.confirmMessage', { name: selectedRow?.levelName })}</p>
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
