import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMember, updateMember, deleteMember } from '../../../api/v9/member';
import { getWorkerLevels } from '../../../api/v9/workerLevels';
import { getPriceTables } from '../../../api/v9/priceTables';
import { useCommonCodeStore } from '../../../stores/commonCodeStore';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../stores/toastStore';
import EvaluationStatusTab from './evaluation/EvaluationStatusTab';
import ReviewTargetTab from './evaluation/ReviewTargetTab';
import { ProjectFilterBar, ProjectSections, SettlementTab, getDefaultDateRange } from '../mypage/WorkerTabs';
import { getTaskFilesByMembId } from '../../../api/v9';
import PROJECT_STATUSES from '../../../constants/projectStatus.json';
import { normalizeWorkerLevelIds, formatWorkerLevelNames } from '../../../utils/workerLevelUtils';
import '../../../styles/notion-list.css';

const HIDDEN_TAB_STATUSES = ['READONLY'];
const STATUS_KEYS = PROJECT_STATUSES.map((s) => s.status).filter((s) => !HIDDEN_TAB_STATUSES.includes(s));
import '../mypage/MyPage.css';
import './ManageWorkerDetailPage.css';

function PropRow({ label, value, wide, children }) {
  return (
    <div className={`prop-item${wide ? ' prop-item--wide' : ''}`}>
      <span className="prop-label">{label}</span>
      <span className="prop-value">{children || value || '-'}</span>
    </div>
  );
}

function WorkerLevelMultiSelect({ options, selectedIds, onChange, priceTableMap, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const getRole = (opt) =>
    (opt?.accuracyAvgLevel == null && opt?.errorCountAvgLevel == null) ? 'CHECKER' : 'WORKER';

  const toggle = useCallback((id) => {
    const strId = String(id);
    if (selectedIds.includes(strId)) {
      onChange(selectedIds.filter((v) => v !== strId));
      return;
    }
    const target = options.find((o) => String(o.id) === strId);
    if (target) {
      const targetRole = getRole(target);
      const conflict = selectedIds.some((sid) => {
        const opt = options.find((o) => String(o.id) === sid);
        return opt && opt.bssType === target.bssType && getRole(opt) === targetRole;
      });
      if (conflict) {
        toast.error(t('manage.worker.detail.alertWorkerLevelDuplicate'));
        return;
      }
    }
    onChange([...selectedIds, strId]);
  }, [selectedIds, onChange, options, t]);

  const remove = useCallback((id) => {
    onChange(selectedIds.filter((v) => v !== String(id)));
  }, [selectedIds, onChange]);

  const selectedLabels = useMemo(() =>
    selectedIds.map((id) => {
      const opt = options.find((o) => String(o.id) === id);
      if (!opt) return null;
      const pt = opt.priceTableId ? priceTableMap[opt.priceTableId] : null;
      return { id, bssType: opt.bssType, levelName: opt.levelName, priceTableName: pt?.name };
    }).filter(Boolean),
  [selectedIds, options, priceTableMap]);

  return (
    <div className="wl-multi-select" ref={ref}>
      <div className="wl-chips-area" onClick={() => setOpen((p) => !p)}>
        {selectedLabels.length > 0 ? (
          selectedLabels.map((s) => (
            <span key={s.id} className="wl-chip">
              {s.bssType && <span className="wl-chip-type">{s.bssType}</span>}
              <span>{s.levelName}</span>
              {s.priceTableName && <span className="wl-chip-table">{s.priceTableName}</span>}
              <button type="button" className="wl-chip-remove" onClick={(e) => { e.stopPropagation(); remove(s.id); }}>×</button>
            </span>
          ))
        ) : (
          <span className="wl-placeholder">{t('manage.worker.detail.selectWorkerLevels')}</span>
        )}
        <span className="wl-arrow">▾</span>
      </div>
      {open && (
        <div className="wl-dropdown">
          {options.length === 0 ? (
            <div className="wl-dropdown-empty">{t('manage.common.noData')}</div>
          ) : (
            options.map((opt) => {
              const strId = String(opt.id);
              const checked = selectedIds.includes(strId);
              const pt = opt.priceTableId ? priceTableMap[opt.priceTableId] : null;
              return (
                <label key={opt.id} className={`wl-dropdown-item${checked ? ' wl-dropdown-item--checked' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(opt.id)} />
                  <span className="wl-dropdown-item-info">
                    <span className="wl-dropdown-item-main">
                      {opt.bssType && <span className="wl-dropdown-item-type">{opt.bssType}</span>}
                      {opt.levelName}
                    </span>
                    {pt && <span className="wl-dropdown-item-table">{pt.name}</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function ManageWorkerDetailPage() {
  const { t } = useTranslation('soribaro');
  const { membNo } = useParams();
  const navigate = useNavigate();
  const getCodeOptions = useCommonCodeStore((s) => s.getCodeOptions);
  const userLvlOptions = getCodeOptions('USER_LEVEL');

  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [formData, setFormData] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [workerLevelOptions, setWorkerLevelOptions] = useState([]);
  const [priceTableMap, setPriceTableMap] = useState({});
  const [activeTab, setActiveTab] = useState('STANDBY');
  const [role, setRole] = useState('worker');
  const isStatusTab = STATUS_KEYS.includes(activeTab);

  const taskFetchFn = useCallback((params) => {
    return getTaskFilesByMembId({ ...params, membId: originalData?.membId });
  }, [originalData?.membId]);

  const SEARCH_FIELDS = useMemo(() => [
    { value: 'title', label: t('mypage.searchFieldProjectName') },
    { value: 'servCd', label: t('mypage.searchFieldServiceCode') },
  ], [t]);

  const [searchTrigger, setSearchTrigger] = useState(0);
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [projectFilters, setProjectFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    searchField: 'title',
    searchText: '',
  });

  const handleProjectFilterChange = useCallback((field, value) => {
    setProjectFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleProjectSearch = useCallback(() => {
    setSearchTrigger((prev) => prev + 1);
  }, []);

  const handleProjectKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleProjectSearch();
  }, [handleProjectSearch]);

  const handleProjectReset = useCallback(() => {
    const range = getDefaultDateRange();
    setProjectFilters({ startDate: range.startDate, endDate: range.endDate, searchField: 'title', searchText: '' });
    setSearchTrigger((prev) => prev + 1);
  }, []);

  const TABS = useMemo(() => [
    ...PROJECT_STATUSES
      .filter((s) => !HIDDEN_TAB_STATUSES.includes(s.status))
      .map((s) => ({ key: s.status, label: s.name })),
    { key: 'evaluation', label: t('manage.worker.detail.tabEvaluationStatus') },
    { key: 'review', label: t('manage.worker.detail.tabReviewStatus') },
    { key: 'settlement', label: t('manage.worker.detail.tabSettlement') },
  ], [t]);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMember(membNo);
      if (response.status === 'SUCCESS') {
        const data = response.data;
        setOriginalData(data);
        setFormData({
          membNm: data.membNm || '',
          recvEmail: data.recvEmail || '',
          mblTelNo: data.mblTelNo || '',
          membLvl: data.membLvl || '',
          workerLevelIds: normalizeWorkerLevelIds(data.workerLevelIds ?? data.workerLevelId).map(String),
          zipCd: data.zipCd || '',
          baseAddr: data.baseAddr || '',
          dtlAddr: data.dtlAddr || '',
          mblRecvYn: data.mblRecvYn || 'N',
          mblNotiYn: data.mblNotiYn || 'N',
          memo: data.memo || '',
        });
      } else {
        setError(response.message || t('manage.common.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [membNo, t]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  useEffect(() => {
    (async () => {
      try {
        const [wlRes, ptRes] = await Promise.all([getWorkerLevels(), getPriceTables()]);
        if (wlRes.status === 'SUCCESS') setWorkerLevelOptions(wlRes.data || []);
        if (ptRes.status === 'SUCCESS') {
          setPriceTableMap(Object.fromEntries((ptRes.data || []).map((pt) => [pt.id, pt])));
        }
      } catch (err) {
        console.error('WorkerLevels/PriceTables fetch error:', err);
      }
    })();
  }, []);

  useEffect(() => {
    if (workerLevelOptions.length === 0) return;
    const validIds = new Set(workerLevelOptions.map((o) => String(o.id)));
    setFormData((prev) => {
      if (!prev?.workerLevelIds) return prev;
      const filtered = prev.workerLevelIds.filter((id) => validIds.has(String(id)));
      if (filtered.length === prev.workerLevelIds.length) return prev;
      return { ...prev, workerLevelIds: filtered };
    });
  }, [workerLevelOptions]);

  const handleChange = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleEditMode = useCallback(() => setIsEditMode(true), []);

  const handleCancelEdit = useCallback(() => {
    if (originalData) {
      setFormData({
        membNm: originalData.membNm || '',
        recvEmail: originalData.recvEmail || '',
        mblTelNo: originalData.mblTelNo || '',
        membLvl: originalData.membLvl || '',
        workerLevelIds: normalizeWorkerLevelIds(originalData.workerLevelIds ?? originalData.workerLevelId).map(String),
        zipCd: originalData.zipCd || '',
        baseAddr: originalData.baseAddr || '',
        dtlAddr: originalData.dtlAddr || '',
        mblRecvYn: originalData.mblRecvYn || 'N',
        mblNotiYn: originalData.mblNotiYn || 'N',
        memo: originalData.memo || '',
      });
    }
    setIsEditMode(false);
  }, [originalData]);

  const handleSave = useCallback(async () => {
    if (!formData.membNm?.trim()) { toast.error(t('manage.worker.detail.alertNameRequired')); return; }
    setSaveLoading(true);
    try {
      const payload = {
        membNm: formData.membNm.trim(),
        recvEmail: formData.recvEmail?.trim() || undefined,
        mblTelNo: formData.mblTelNo?.trim() || undefined,
        membLvl: formData.membLvl || undefined,
        workerLevelIds: (formData.workerLevelIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
        zipNo: formData.zipCd?.trim() || undefined,
        baseAddr: formData.baseAddr?.trim() || undefined,
        dtlAddr: formData.dtlAddr?.trim() || undefined,
        mblRecvYn: formData.mblRecvYn,
        mblNotiYn: formData.mblNotiYn,
        memo: formData.memo?.trim() || undefined,
      };
      const res = await updateMember(membNo, payload);
      if (res.status === 'SUCCESS') {
        toast.success(t('manage.worker.detail.alertUpdated'));
        setIsEditMode(false);
        fetchDetail();
      } else {
        toast.error(res.message || t('manage.worker.detail.alertUpdateFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.worker.detail.alertUpdateFailed'));
    } finally {
      setSaveLoading(false);
    }
  }, [formData, membNo, fetchDetail, t]);

  const handleDelete = useCallback(async () => {
    const name = originalData?.membNm || originalData?.membId;
    if (!window.confirm(t('manage.worker.detail.confirmWithdraw', { name }))) return;
    setDeleteLoading(true);
    try {
      const res = await deleteMember(membNo);
      if (res.status === 'SUCCESS') {
        toast.success(t('manage.worker.detail.alertWithdrawn'));
        navigate('/soribaro/manage/worker');
      } else {
        toast.error(res.message || t('manage.worker.detail.alertWithdrawFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.worker.detail.alertWithdrawFailed'));
    } finally {
      setDeleteLoading(false);
    }
  }, [membNo, originalData, navigate, t]);

  const handleBack = () => navigate(-1);

  const formatDttm = (val) => {
    if (!val) return '-';
    if (val.length === 14) {
      return `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)} ${val.slice(8,10)}:${val.slice(10,12)}:${val.slice(12,14)}`;
    }
    return val;
  };

  const getUserLvlLabel = (val) => {
    const found = userLvlOptions.find((o) => o.value === val);
    return found?.label || val || '-';
  };

  const renderWorkerLevelChips = useCallback((ids, names) => {
    const levelIds = normalizeWorkerLevelIds(ids);
    if (!levelIds.length && !names) return t('manage.worker.detail.unassigned');

    const resolved = levelIds.map((id) => {
      const wl = workerLevelOptions.find((o) => o.id === id);
      if (!wl) return null;
      const pt = wl.priceTableId ? priceTableMap[wl.priceTableId] : null;
      return { id, bssType: wl.bssType, levelName: wl.levelName, priceTableName: pt?.name };
    }).filter(Boolean);

    if (!resolved.length) {
      const byName = formatWorkerLevelNames(names);
      return byName || t('manage.worker.detail.unassigned');
    }

    return (
      <div className="wl-view-chips">
        {resolved.map((r) => (
          <span key={r.id} className="wl-view-chip">
            {r.bssType && <span className="wl-view-chip-type">{r.bssType}</span>}
            <span className="wl-view-chip-name">{r.levelName}</span>
            {r.priceTableName && <span className="wl-view-chip-table">{r.priceTableName}</span>}
          </span>
        ))}
      </div>
    );
  }, [workerLevelOptions, priceTableMap, t]);

  if (loading) {
    return (
      <div className="notion-page manage-worker-detail-page">
        <div className="loading-center">
          <span className="spinner" />
          <span>{t('manage.common.loadingData')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notion-page manage-worker-detail-page">
        <div className="error-center">
          <p>{error}</p>
          <button className="btn-ghost" onClick={handleBack}>{t('manage.common.goBackToList')}</button>
        </div>
      </div>
    );
  }

  const buildAddress = () => {
    const parts = [originalData?.zipCd, originalData?.baseAddr, originalData?.dtlAddr].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  };

  const renderViewMode = () => (
    <div className="prop-list">
      <PropRow label={t('manage.worker.detail.labelMembId')} value={originalData?.membId} />
      <PropRow label={t('manage.worker.detail.labelMembNm')} value={originalData?.membNm} />
      <PropRow label={t('manage.worker.detail.labelEmail')} value={originalData?.recvEmail} />
      <PropRow label={t('manage.worker.detail.labelPhone')} value={originalData?.mblTelNo} />
      <PropRow label={t('manage.worker.detail.labelEntNm')} value={originalData?.entNm} />
      <PropRow label={t('manage.worker.detail.labelSnsTp')} value={originalData?.snsTp || originalData?.snsNm} />
      <PropRow label={t('manage.worker.detail.labelGrade')} value={getUserLvlLabel(originalData?.membLvl)} />
      <PropRow label={t('manage.worker.detail.labelWorkerLevel')}>
        {renderWorkerLevelChips(originalData?.workerLevelIds ?? originalData?.workerLevelId, originalData?.workerLevelNames)}
      </PropRow>
      <PropRow label={t('manage.worker.detail.addressInfo')} value={buildAddress()} wide />
      <PropRow label={t('manage.worker.detail.labelMarketingConsent')} value={originalData?.mblRecvYn === 'Y' ? t('manage.worker.detail.agree') : t('manage.worker.detail.disagree')} />
      <PropRow label={t('manage.worker.detail.labelNotificationConsent')} value={originalData?.mblNotiYn === 'Y' ? t('manage.worker.detail.agree') : t('manage.worker.detail.disagree')} />
      <PropRow label={t('manage.worker.detail.labelMemo')} value={originalData?.memo} wide />
      <PropRow label={t('manage.worker.detail.labelRegDttm')} value={formatDttm(originalData?.regDttm)} />
      <PropRow label={t('manage.worker.detail.labelPossPoint')} value={originalData?.possPoint != null ? `${Number(originalData.possPoint).toLocaleString()}P` : '-'} />
    </div>
  );

  const renderEditMode = () => (
    <div className="prop-list">
      <PropRow label={t('manage.worker.detail.labelMembId')} value={originalData?.membId || '-'} />
      <PropRow label={t('manage.worker.detail.labelMembNm')}>
        <input type="text" value={formData.membNm} onChange={(e) => handleChange('membNm', e.target.value)} />
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelEmail')}>
        <input type="text" value={formData.recvEmail} onChange={(e) => handleChange('recvEmail', e.target.value)} />
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelPhone')}>
        <input type="text" value={formData.mblTelNo} onChange={(e) => handleChange('mblTelNo', e.target.value)} />
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelEntNm')} value={originalData?.entNm || '-'} />
      <PropRow label={t('manage.worker.detail.labelSnsTp')} value={originalData?.snsTp || originalData?.snsNm || '-'} />
      <PropRow label={t('manage.worker.detail.labelGrade')}>
        <select value={formData.membLvl} onChange={(e) => handleChange('membLvl', e.target.value)}>
          {userLvlOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelWorkerLevel')}>
        <WorkerLevelMultiSelect
          options={workerLevelOptions}
          selectedIds={formData.workerLevelIds || []}
          onChange={(ids) => handleChange('workerLevelIds', ids)}
          priceTableMap={priceTableMap}
          t={t}
        />
      </PropRow>
      <PropRow label={t('manage.worker.detail.addressInfo')} wide>
        <div className="prop-addr-inputs">
          <input type="text" value={formData.zipCd} onChange={(e) => handleChange('zipCd', e.target.value)} placeholder={t('manage.worker.detail.labelZipCode')} />
          <input type="text" value={formData.baseAddr} onChange={(e) => handleChange('baseAddr', e.target.value)} placeholder={t('manage.worker.detail.labelBaseAddr')} />
          <input type="text" value={formData.dtlAddr} onChange={(e) => handleChange('dtlAddr', e.target.value)} placeholder={t('manage.worker.detail.labelDtlAddr')} />
        </div>
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelMarketingConsent')}>
        <select value={formData.mblRecvYn} onChange={(e) => handleChange('mblRecvYn', e.target.value)}>
          <option value="Y">{t('manage.worker.detail.agree')}</option>
          <option value="N">{t('manage.worker.detail.disagree')}</option>
        </select>
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelNotificationConsent')}>
        <select value={formData.mblNotiYn} onChange={(e) => handleChange('mblNotiYn', e.target.value)}>
          <option value="Y">{t('manage.worker.detail.agree')}</option>
          <option value="N">{t('manage.worker.detail.disagree')}</option>
        </select>
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelMemo')} wide>
        <textarea
          value={formData.memo}
          onChange={(e) => handleChange('memo', e.target.value)}
          placeholder={t('manage.worker.detail.memoPlaceholder')}
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </PropRow>
      <PropRow label={t('manage.worker.detail.labelRegDttm')} value={formatDttm(originalData?.regDttm)} />
      <PropRow label={t('manage.worker.detail.labelPossPoint')} value={originalData?.possPoint != null ? `${Number(originalData.possPoint).toLocaleString()}P` : '-'} />
    </div>
  );

  return (
    <div className="notion-page manage-worker-detail-page">
      {/* 뒤로가기 */}
      <button className="btn-back" onClick={handleBack}>{t('manage.common.backToList')}</button>

      {/* 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {t('manage.worker.detail.pageTitle')}
            {isEditMode ? ` ${t('manage.worker.detail.pageTitleEdit')}` : ''}
          </h1>
          <p className="page-description">{t('manage.worker.pageDescription')}</p>
        </div>
        <div className="header-actions">
          {originalData?.membNo && <span className="memb-no-badge">No. {originalData.membNo}</span>}
          {isEditMode ? (
            <>
              <button className="btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? t('manage.common.processing') : t('manage.worker.detail.withdraw')}
              </button>
              <button className="btn-ghost" onClick={handleCancelEdit}>{t('manage.common.cancel')}</button>
              <button className="btn-primary" onClick={handleSave} disabled={saveLoading}>
                {saveLoading ? t('manage.common.saving') : t('manage.common.save')}
              </button>
            </>
          ) : (
            <>
              <button className="btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? t('manage.common.processing') : t('manage.worker.detail.withdraw')}
              </button>
              <button className="btn-primary" onClick={handleEditMode}>{t('manage.common.edit')}</button>
            </>
          )}
        </div>
      </div>

      {/* 속성 목록 또는 수정 폼 */}
      {isEditMode ? renderEditMode() : renderViewMode()}

      {/* 탭 영역 */}
      <div className="detail-tabs-area">
        <div className="worker-detail-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`worker-detail-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isStatusTab && (
          <div className="worker-detail-tab-panel" role="tabpanel">
            <div className="mypage">
              <div className="role-sub-tabs">
                <button
                  className={`role-sub-tab ${role === 'worker' ? 'active' : ''}`}
                  onClick={() => setRole('worker')}
                >
                  {t('mypage.roleWorker')}
                </button>
                <button
                  className={`role-sub-tab ${role === 'checker' ? 'active' : ''}`}
                  onClick={() => setRole('checker')}
                >
                  {t('mypage.roleChecker')}
                </button>
              </div>
              <ProjectFilterBar
                filters={projectFilters}
                searchFields={SEARCH_FIELDS}
                onFilterChange={handleProjectFilterChange}
                onSearch={handleProjectSearch}
                onReset={handleProjectReset}
                onKeyDown={handleProjectKeyDown}
                t={t}
              />
              <ProjectSections
                status={activeTab}
                role={role}
                fetchFn={taskFetchFn}
                filters={projectFilters}
                searchTrigger={searchTrigger}
                t={t}
                navigate={navigate}
              />
            </div>
          </div>
        )}

        {activeTab === 'evaluation' && (
          <div className="worker-detail-tab-panel" role="tabpanel">
            {originalData?.membId ? (
              <EvaluationStatusTab workerId={originalData.membId} autoHeight />
            ) : (
              <div className="tab-placeholder">{t('manage.worker.detail.tabPlaceholder')}</div>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="worker-detail-tab-panel" role="tabpanel">
            {originalData?.membId ? (
              <ReviewTargetTab workerId={originalData.membId} />
            ) : (
              <div className="tab-placeholder">{t('manage.worker.detail.tabPlaceholder')}</div>
            )}
          </div>
        )}

        {activeTab === 'settlement' && (
          <div className="worker-detail-tab-panel" role="tabpanel">
            {originalData?.membId ? (
              <div className="mypage">
                <SettlementTab workerId={originalData.membId} t={t} />
              </div>
            ) : (
              <div className="tab-placeholder">{t('manage.worker.detail.tabPlaceholder')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
