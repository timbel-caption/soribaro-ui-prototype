import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { createReviewTag, updateReviewTag, deleteReviewTag } from '../../../../api/v9/reviewTags';
import { createReviewTagGroup, updateReviewTagGroup, deleteReviewTagGroup } from '../../../../api/v9/reviewTagGroups';
import './ReviewTagTab.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const INITIAL_TAG_MODAL = { tag: '', score: 0, description: '' };
const INITIAL_GROUP_MODAL = { name: '', description: '' };

export default function ReviewTagTab({ reviewTags, refreshReviewTags, groups, refreshGroups }) {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);

  // 그룹 선택
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  // 태그 상태
  const [selectedRow, setSelectedRow] = useState(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalMode, setTagModalMode] = useState('create');
  const [tagModalData, setTagModalData] = useState(INITIAL_TAG_MODAL);
  const [tagModalLoading, setTagModalLoading] = useState(false);
  const [tagDeleteOpen, setTagDeleteOpen] = useState(false);
  const [tagDeleteLoading, setTagDeleteLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  // 그룹 상태
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState('create');
  const [groupModalData, setGroupModalData] = useState(INITIAL_GROUP_MODAL);
  const [groupModalLoading, setGroupModalLoading] = useState(false);
  const [groupDeleteOpen, setGroupDeleteOpen] = useState(false);
  const [groupDeleteLoading, setGroupDeleteLoading] = useState(false);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  // 선택된 그룹 기준으로 태그 필터링
  const rowData = useMemo(() => {
    let filtered = reviewTags;
    if (selectedGroupId) {
      filtered = filtered.filter((t) => t.groupId === selectedGroupId);
    }
    if (keyword) {
      const lower = keyword.toLowerCase();
      filtered = filtered.filter(
        (t) => t.tag?.toLowerCase().includes(lower) || t.description?.toLowerCase().includes(lower),
      );
    }
    return filtered;
  }, [reviewTags, selectedGroupId, keyword]);

  const columnDefs = useMemo(() => {
    const cols = [
      { field: 'tag', headerName: t('manage.evaluation.columns.tagName'), flex: 1, minWidth: 150 },
      { field: 'score', headerName: t('manage.evaluation.columns.score'), width: 80, cellClass: 'text-center' },
      { field: 'description', headerName: t('manage.evaluation.columns.description'), flex: 2, minWidth: 200 },
      { field: 'createdAt', headerName: t('manage.evaluation.columns.createdAt'), width: 120, cellClass: 'text-center' },
    ];
    if (!selectedGroupId) {
      cols.splice(1, 0, { field: 'groupName', headerName: t('manage.evaluation.columns.group'), width: 140 });
    }
    return cols;
  }, [selectedGroupId]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);

  // ── 태그 CRUD ──

  const handleTagCreate = useCallback(() => {
    if (!selectedGroupId) { alert(t('manage.evaluation.alertSelectGroupFirst')); return; }
    setTagModalMode('create');
    setTagModalData(INITIAL_TAG_MODAL);
    setTagModalOpen(true);
  }, [selectedGroupId]);

  const handleTagEdit = useCallback(() => {
    if (!selectedRow) { alert(t('manage.evaluation.alertSelectEditTag')); return; }
    setTagModalMode('edit');
    setTagModalData({
      tag: selectedRow.tag || '',
      score: selectedRow.score ?? 0,
      description: selectedRow.description || '',
    });
    setTagModalOpen(true);
  }, [selectedRow]);

  const handleTagRowDoubleClick = useCallback((e) => {
    setSelectedRow(e.data);
    setTagModalMode('edit');
    setTagModalData({
      tag: e.data.tag || '',
      score: e.data.score ?? 0,
      description: e.data.description || '',
    });
    setTagModalOpen(true);
  }, []);

  const handleTagSave = useCallback(async () => {
    if (!tagModalData.tag.trim()) { alert(t('manage.evaluation.alertTagNameRequired')); return; }

    setTagModalLoading(true);
    try {
      const groupId = tagModalMode === 'create' ? selectedGroupId : (selectedRow?.groupId || selectedGroupId);
      const payload = {
        groupId,
        tag: tagModalData.tag.trim(),
        score: Number(tagModalData.score) || 0,
        description: tagModalData.description?.trim() || '',
      };

      const res = tagModalMode === 'create'
        ? await createReviewTag(payload)
        : await updateReviewTag(selectedRow.id, payload);

      if (res.status === 'SUCCESS') {
        setTagModalOpen(false);
        setSelectedRow(null);
        refreshReviewTags();
      } else {
        alert(res.message || t('manage.common.saveFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.saveFailed'));
    } finally {
      setTagModalLoading(false);
    }
  }, [tagModalMode, tagModalData, selectedRow, selectedGroupId, refreshReviewTags]);

  const handleTagDeleteClick = useCallback(() => {
    if (!selectedRow) { alert(t('manage.evaluation.alertSelectDeleteTag')); return; }
    setTagDeleteOpen(true);
  }, [selectedRow]);

  const handleTagDeleteConfirm = useCallback(async () => {
    setTagDeleteLoading(true);
    try {
      const res = await deleteReviewTag(selectedRow.id);
      if (res.status === 'SUCCESS') {
        setTagDeleteOpen(false);
        setSelectedRow(null);
        refreshReviewTags();
      } else {
        alert(res.message || t('manage.common.deleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.deleteFailed'));
    } finally {
      setTagDeleteLoading(false);
    }
  }, [selectedRow, refreshReviewTags]);

  const onSelectionChanged = useCallback(() => {
    const nodes = gridRef.current?.api?.getSelectedNodes();
    setSelectedRow(nodes?.length > 0 ? nodes[0].data : null);
  }, []);

  // ── 그룹 CRUD ──

  const handleGroupCreate = useCallback(() => {
    setGroupModalMode('create');
    setGroupModalData(INITIAL_GROUP_MODAL);
    setGroupModalOpen(true);
  }, []);

  const handleGroupEdit = useCallback(() => {
    if (!selectedGroup) { alert(t('manage.evaluation.alertSelectEditGroup')); return; }
    setGroupModalMode('edit');
    setGroupModalData({ name: selectedGroup.name || '', description: selectedGroup.description || '' });
    setGroupModalOpen(true);
  }, [selectedGroup]);

  const handleGroupSave = useCallback(async () => {
    if (!groupModalData.name.trim()) { alert(t('manage.evaluation.alertGroupNameRequired')); return; }

    setGroupModalLoading(true);
    try {
      const payload = {
        name: groupModalData.name.trim(),
        description: groupModalData.description?.trim() || '',
      };

      const res = groupModalMode === 'create'
        ? await createReviewTagGroup(payload)
        : await updateReviewTagGroup(selectedGroupId, payload);

      if (res.status === 'SUCCESS') {
        setGroupModalOpen(false);
        refreshGroups();
        if (groupModalMode === 'create' && res.data?.id) {
          setSelectedGroupId(res.data.id);
        }
      } else {
        alert(res.message || t('manage.common.saveFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.saveFailed'));
    } finally {
      setGroupModalLoading(false);
    }
  }, [groupModalMode, groupModalData, selectedGroupId, refreshGroups]);

  const handleGroupDeleteClick = useCallback(() => {
    if (!selectedGroup) { alert(t('manage.evaluation.alertSelectDeleteGroup')); return; }
    setGroupDeleteOpen(true);
  }, [selectedGroup]);

  const handleGroupDeleteConfirm = useCallback(async () => {
    setGroupDeleteLoading(true);
    try {
      const res = await deleteReviewTagGroup(selectedGroupId);
      if (res.status === 'SUCCESS') {
        setGroupDeleteOpen(false);
        setSelectedGroupId(null);
        refreshGroups();
        refreshReviewTags();
      } else {
        alert(res.message || t('manage.common.deleteFailed'));
      }
    } catch (err) {
      alert(err.message || t('manage.common.deleteFailed'));
    } finally {
      setGroupDeleteLoading(false);
    }
  }, [selectedGroupId, refreshGroups, refreshReviewTags]);

  // 그룹 선택 시 태그 선택 초기화
  const handleGroupSelect = useCallback((groupId) => {
    setSelectedGroupId((prev) => (prev === groupId ? null : groupId));
    setSelectedRow(null);
    gridRef.current?.api?.deselectAll();
  }, []);

  return (
    <div className="review-tag-layout">
      {/* ── 좌측: 그룹 패널 ── */}
      <div className="group-panel">
        <div className="group-panel-header">
          <span className="group-panel-title">{t('manage.evaluation.tagGroup')}</span>
          <button className="btn-primary" onClick={handleGroupCreate}>{t('manage.evaluation.addGroup')}</button>
        </div>
        <div className="group-list">
          {groups.length === 0 && (
            <div className="group-empty">{t('manage.evaluation.noGroups')}</div>
          )}
          {groups.map((g) => {
            const tagCount = reviewTags.filter((t) => t.groupId === g.id).length;
            return (
              <div
                key={g.id}
                className={`group-item ${selectedGroupId === g.id ? 'active' : ''}`}
                onClick={() => handleGroupSelect(g.id)}
              >
                <span className="group-item-name">{g.name}</span>
                <span className="group-item-count">{tagCount}</span>
              </div>
            );
          })}
        </div>
        {selectedGroup && (
          <div className="group-panel-actions">
            <button className="btn-ghost" onClick={handleGroupEdit}>{t('manage.common.edit')}</button>
            <button className="btn-ghost" onClick={handleGroupDeleteClick}>{t('manage.common.delete')}</button>
          </div>
        )}
      </div>

      {/* ── 우측: 태그 목록 ── */}
      <div className="tag-content">
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
              placeholder={t('manage.evaluation.searchPlaceholder')}
            />
          </div>
          <div className="filter-actions">
            <button className="btn-ghost" onClick={() => setKeyword('')}>{t('manage.common.reset')}</button>
            <button className="btn-primary" onClick={handleTagCreate}>{t('manage.evaluation.addTag')}</button>
            <button className="btn-ghost" onClick={handleTagEdit} disabled={!selectedRow}>{t('manage.common.edit')}</button>
            <button className="btn-ghost" onClick={handleTagDeleteClick} disabled={!selectedRow}>{t('manage.common.delete')}</button>
          </div>
        </div>

        <div className="table-toolbar">
          <span className="record-count">
            {selectedGroup ? `${selectedGroup.name} — ` : `${t('manage.evaluation.allLabel')} — `}{t('manage.evaluation.recordCount', { count: rowData.length })}
          </span>
          {selectedRow && (
            <span className="selected-info">{t('manage.evaluation.selectedTag', { name: selectedRow.tag })}</span>
          )}
        </div>

        <div className="grid-container">
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            onRowDoubleClicked={handleTagRowDoubleClick}
            onSelectionChanged={onSelectionChanged}
            rowSelection="single"
            animateRows={true}
            getRowId={(p) => String(p.data.id)}
            headerHeight={36}
            rowHeight={38}
            overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('manage.common.noData')}</span>`}
          />
        </div>
      </div>

      {/* ── 태그 등록/수정 모달 ── */}
      {tagModalOpen && (
        <div className="notion-modal-overlay" onClick={() => setTagModalOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{tagModalMode === 'create' ? t('manage.evaluation.tagModal.createTitle') : t('manage.evaluation.tagModal.editTitle')}</h3>
              <button className="notion-modal-close" onClick={() => setTagModalOpen(false)}>✕</button>
            </div>
            <div className="notion-modal-body">
              <div className="form-group">
                <label>{t('manage.evaluation.tagModal.labelTagName')}</label>
                <input
                  type="text"
                  value={tagModalData.tag}
                  onChange={(e) => setTagModalData((p) => ({ ...p, tag: e.target.value }))}
                  placeholder={t('manage.evaluation.tagModal.placeholderTagName')}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>{t('manage.evaluation.tagModal.labelScore')}</label>
                <input
                  type="number"
                  value={tagModalData.score}
                  onChange={(e) => setTagModalData((p) => ({ ...p, score: e.target.value }))}
                  placeholder={t('manage.evaluation.tagModal.placeholderScore')}
                />
              </div>
              <div className="form-group">
                <label>{t('manage.evaluation.tagModal.labelDescription')}</label>
                <textarea
                  value={tagModalData.description}
                  onChange={(e) => setTagModalData((p) => ({ ...p, description: e.target.value }))}
                  placeholder={t('manage.evaluation.tagModal.placeholderDescription')}
                  rows={3}
                />
              </div>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setTagModalOpen(false)} disabled={tagModalLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-primary" onClick={handleTagSave} disabled={tagModalLoading}>
                {tagModalLoading ? t('manage.common.saving') : t('manage.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 태그 삭제 확인 모달 ── */}
      {tagDeleteOpen && (
        <div className="notion-modal-overlay" onClick={() => setTagDeleteOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.evaluation.tagDeleteModal.title')}</h3>
              <button className="notion-modal-close" onClick={() => setTagDeleteOpen(false)}>✕</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.evaluation.tagDeleteModal.confirmMessage', { name: selectedRow?.tag })}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setTagDeleteOpen(false)} disabled={tagDeleteLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-danger" onClick={handleTagDeleteConfirm} disabled={tagDeleteLoading}>
                {tagDeleteLoading ? t('manage.common.deleting') : t('manage.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 그룹 등록/수정 모달 ── */}
      {groupModalOpen && (
        <div className="notion-modal-overlay" onClick={() => setGroupModalOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{groupModalMode === 'create' ? t('manage.evaluation.groupModal.createTitle') : t('manage.evaluation.groupModal.editTitle')}</h3>
              <button className="notion-modal-close" onClick={() => setGroupModalOpen(false)}>✕</button>
            </div>
            <div className="notion-modal-body">
              <div className="form-group">
                <label>{t('manage.evaluation.groupModal.labelGroupName')}</label>
                <input
                  type="text"
                  value={groupModalData.name}
                  onChange={(e) => setGroupModalData((p) => ({ ...p, name: e.target.value }))}
                  placeholder={t('manage.evaluation.groupModal.placeholderGroupName')}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>{t('manage.evaluation.groupModal.labelDescription')}</label>
                <textarea
                  value={groupModalData.description}
                  onChange={(e) => setGroupModalData((p) => ({ ...p, description: e.target.value }))}
                  placeholder={t('manage.evaluation.groupModal.placeholderDescription')}
                  rows={2}
                />
              </div>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setGroupModalOpen(false)} disabled={groupModalLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-primary" onClick={handleGroupSave} disabled={groupModalLoading}>
                {groupModalLoading ? t('manage.common.saving') : t('manage.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 그룹 삭제 확인 모달 ── */}
      {groupDeleteOpen && (
        <div className="notion-modal-overlay" onClick={() => setGroupDeleteOpen(false)}>
          <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notion-modal-header">
              <h3>{t('manage.evaluation.groupDeleteModal.title')}</h3>
              <button className="notion-modal-close" onClick={() => setGroupDeleteOpen(false)}>✕</button>
            </div>
            <div className="notion-modal-body">
              <p>{t('manage.evaluation.groupDeleteModal.confirmMessage', { name: selectedGroup?.name })}</p>
              <p className="text-muted">{t('manage.evaluation.groupDeleteModal.subTagsWarning')}</p>
            </div>
            <div className="notion-modal-footer">
              <button className="btn-ghost" onClick={() => setGroupDeleteOpen(false)} disabled={groupDeleteLoading}>{t('manage.common.cancel')}</button>
              <button className="btn-danger" onClick={handleGroupDeleteConfirm} disabled={groupDeleteLoading}>
                {groupDeleteLoading ? t('manage.common.deleting') : t('manage.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
