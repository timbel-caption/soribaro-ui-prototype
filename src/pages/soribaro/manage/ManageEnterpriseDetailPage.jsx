import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getEnterpriseDetail,
  createEnterprise,
  updateEnterprise,
  deleteEnterprise,
} from '../../../api/v9/enterprise';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../stores/toastStore';
import { useCommonCodeStore } from '../../../stores/commonCodeStore';
import '../../../styles/notion-list.css';
import './ManageEnterpriseDetailPage.css';

const getInitialFormData = () => ({
  entNm: '',
  entDomain: '',
  entDesc: '',
  bssType: '',
  picTelNo: '',
  useYn: 'Y',
});

function PropRow({ label, value, wide, children }) {
  return (
    <div className={`prop-item${wide ? ' prop-item--wide' : ''}`}>
      <span className="prop-label">{label}</span>
      <span className="prop-value">{children || value || '-'}</span>
    </div>
  );
}

export default function ManageEnterpriseDetailPage() {
  const { t } = useTranslation('soribaro');
  const { entNo } = useParams();
  const navigate = useNavigate();

  const isCreateMode = entNo === 'new';
  const bssTypeOptions = useCommonCodeStore((s) => s.getCodesByGroup('BSS_TYPE'));

  const [loading, setLoading] = useState(!isCreateMode);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(getInitialFormData());
  const [originalData, setOriginalData] = useState(null);
  const [isEditMode, setIsEditMode] = useState(isCreateMode);

  const fetchDetail = useCallback(async () => {
    if (isCreateMode) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getEnterpriseDetail(entNo);
      if (response.status === 'SUCCESS') {
        const data = response.data;
        setOriginalData(data);
        setFormData({
          entNm: data.entNm || '',
          entDomain: data.entDomain || '',
          entDesc: data.entDesc || '',
          bssType: data.bssType || '',
          picTelNo: data.picTelNo || '',
          useYn: data.useYn || 'Y',
        });
      } else {
        setError(response.message || t('manage.common.failedToLoadData'));
      }
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [entNo, isCreateMode, t]);

  useEffect(() => {
    if (!isCreateMode) fetchDetail();
  }, [fetchDetail, isCreateMode]);

  const handleChange = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.entNm.trim()) {
      toast.error(t('manage.enterprise.detail.alertEntNmRequired'));
      return;
    }
    setSaveLoading(true);
    try {
      const payload = {
        entNm: formData.entNm.trim(),
        entDomain: formData.entDomain.trim() || undefined,
        entDesc: formData.entDesc.trim() || undefined,
        bssType: formData.bssType || undefined,
        picTelNo: formData.picTelNo.trim() || undefined,
        useYn: formData.useYn,
      };
      const response = isCreateMode
        ? await createEnterprise(payload)
        : await updateEnterprise(entNo, payload);

      if (response.status === 'SUCCESS') {
        toast.success(isCreateMode ? t('manage.enterprise.detail.alertCreated') : t('manage.enterprise.detail.alertUpdated'));
        navigate('/soribaro/manage/enterprise');
      } else {
        toast.error(response.message || t('manage.enterprise.detail.alertSaveFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.enterprise.detail.alertSaveFailed'));
    } finally {
      setSaveLoading(false);
    }
  }, [formData, isCreateMode, entNo, navigate, t]);

  const handleDelete = useCallback(async () => {
    if (isCreateMode) return;
    if (!window.confirm(t('manage.enterprise.detail.confirmDelete', { name: originalData?.entNm }))) return;
    setDeleteLoading(true);
    try {
      const response = await deleteEnterprise(entNo);
      if (response.status === 'SUCCESS') {
        toast.success(t('manage.enterprise.detail.alertDeleted'));
        navigate('/soribaro/manage/enterprise');
      } else {
        toast.error(response.message || t('manage.enterprise.detail.alertDeleteFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.enterprise.detail.alertDeleteFailed'));
    } finally {
      setDeleteLoading(false);
    }
  }, [isCreateMode, entNo, originalData, navigate, t]);

  const handleEditMode = useCallback(() => setIsEditMode(true), []);

  const handleCancelEdit = useCallback(() => {
    if (originalData) {
      setFormData({
        entNm: originalData.entNm || '',
        entDomain: originalData.entDomain || '',
        entDesc: originalData.entDesc || '',
        bssType: originalData.bssType || '',
        picTelNo: originalData.picTelNo || '',
        useYn: originalData.useYn || 'Y',
      });
    }
    setIsEditMode(false);
  }, [originalData]);

  const handleBack = () => navigate(-1);

  if (loading) {
    return (
      <div className="notion-page manage-enterprise-detail-page">
        <div className="loading-center">
          <span className="spinner" />
          <span>{t('manage.common.loadingData')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notion-page manage-enterprise-detail-page">
        <div className="error-center">
          <p>{error}</p>
          <button className="btn-ghost" onClick={handleBack}>{t('manage.enterprise.detail.goBackToList')}</button>
        </div>
      </div>
    );
  }

  const isEditable = isEditMode || isCreateMode;

  const pageTitle = isCreateMode
    ? t('manage.enterprise.detail.pageTitleCreate')
    : isEditMode
      ? t('manage.enterprise.detail.pageTitleEdit')
      : t('manage.enterprise.detail.pageTitleView');

  const renderProps = () => (
    <div className="prop-list">
      <PropRow label={t('manage.enterprise.detail.labelEntNm')}>
        {isEditable
          ? <input type="text" value={formData.entNm} onChange={(e) => handleChange('entNm', e.target.value)} placeholder={t('manage.enterprise.detail.placeholderEntNm')} />
          : originalData?.entNm || '-'}
      </PropRow>
      <PropRow label={t('manage.enterprise.detail.labelPicTelNo')}>
        {isEditable
          ? <input type="text" value={formData.picTelNo} onChange={(e) => handleChange('picTelNo', e.target.value)} placeholder={t('manage.enterprise.detail.placeholderPicTelNo')} />
          : originalData?.picTelNo || '-'}
      </PropRow>
      <PropRow label={t('manage.enterprise.detail.labelEntDomain')}>
        {isEditable
          ? <input type="text" value={formData.entDomain} onChange={(e) => handleChange('entDomain', e.target.value)} placeholder={t('manage.enterprise.detail.placeholderEntDomain')} />
          : originalData?.entDomain || '-'}
      </PropRow>
      <PropRow label={t('manage.enterprise.detail.labelBssType')}>
        {isEditable ? (
          <select value={formData.bssType} onChange={(e) => handleChange('bssType', e.target.value)}>
            <option value="">{t('manage.enterprise.detail.selectNone')}</option>
            {bssTypeOptions.map((o) => (
              <option key={o.dtlCd} value={o.dtlCd}>{o.dtlCdNm}</option>
            ))}
          </select>
        ) : (originalData?.bssTypeNm || '-')}
      </PropRow>
      <PropRow label={t('manage.enterprise.detail.labelUseYn')}>
        {isEditable ? (
          <select value={formData.useYn} onChange={(e) => handleChange('useYn', e.target.value)}>
            <option value="Y">{t('manage.enterprise.useYn.use')}</option>
            <option value="N">{t('manage.enterprise.useYn.notUse')}</option>
          </select>
        ) : (originalData?.useYn === 'Y' ? t('manage.enterprise.useYn.use') : t('manage.enterprise.useYn.notUse'))}
      </PropRow>
      <PropRow label={t('manage.enterprise.detail.labelEntDesc')} wide>
        {isEditable
          ? <textarea rows={3} value={formData.entDesc} onChange={(e) => handleChange('entDesc', e.target.value)} placeholder={t('manage.enterprise.detail.placeholderEntDesc')} />
          : originalData?.entDesc || '-'}
      </PropRow>
      {!isCreateMode && originalData && (
        <>
          <PropRow label={t('manage.enterprise.detail.labelRegr')} value={originalData.regr} />
          <PropRow label={t('manage.enterprise.detail.labelRegDttm')} value={originalData.regDttm} />
          <PropRow label={t('manage.enterprise.detail.labelChgr')} value={originalData.chgr} />
          <PropRow label={t('manage.enterprise.detail.labelChgDttm')} value={originalData.chgDttm} />
        </>
      )}
    </div>
  );

  return (
    <div className="notion-page manage-enterprise-detail-page">
      <button className="btn-back" onClick={handleBack}>{t('manage.enterprise.detail.backToList')}</button>

      <div className="page-header">
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <p className="page-description">{t('manage.enterprise.pageDescription')}</p>
        </div>
        <div className="header-actions">
          {!isCreateMode && originalData?.entNo && <span className="ent-no-badge">No. {originalData.entNo}</span>}
          {isCreateMode ? (
            <button className="btn-primary" onClick={handleSave} disabled={saveLoading}>
              {saveLoading ? t('manage.common.saving') : t('manage.enterprise.detail.register')}
            </button>
          ) : isEditMode ? (
            <>
              <button className="btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? t('manage.common.processing') : t('manage.enterprise.detail.delete')}
              </button>
              <button className="btn-ghost" onClick={handleCancelEdit}>{t('manage.enterprise.detail.cancel')}</button>
              <button className="btn-primary" onClick={handleSave} disabled={saveLoading}>
                {saveLoading ? t('manage.common.saving') : t('manage.enterprise.detail.save')}
              </button>
            </>
          ) : (
            <>
              <button className="btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? t('manage.common.processing') : t('manage.enterprise.detail.delete')}
              </button>
              <button className="btn-primary" onClick={handleEditMode}>{t('manage.enterprise.detail.edit')}</button>
            </>
          )}
        </div>
      </div>

      {renderProps()}
    </div>
  );
}
