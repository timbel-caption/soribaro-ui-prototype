import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEnterpriseCustomerDetail, updateEnterpriseCustomer } from '../../../api/v9/enterpriseCustomer';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';
import './ManageEnterpriseCustomerDetailPage.css';

function PropRow({ label, value, wide, children }) {
  return (
    <div className={`prop-item${wide ? ' prop-item--wide' : ''}`}>
      <span className="prop-label">{label}</span>
      <span className="prop-value">{children || value || '-'}</span>
    </div>
  );
}

export default function ManageEnterpriseCustomerDetailPage() {
  const { t } = useTranslation('soribaro');
  const { membNo } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEnterpriseCustomerDetail(membNo);
      if (res.status === 'SUCCESS') {
        setData(res.data);
        setForm({
          membNm: res.data.membNm || '',
          mblTelNo: res.data.mblTelNo || '',
          recvEmail: res.data.recvEmail || '',
          zipCd: res.data.zipCd || '',
          baseAddr: res.data.baseAddr || '',
          dtlAddr: res.data.dtlAddr || '',
        });
      } else {
        setError(res.message || t('manage.enterprise.customer.modal.failedToLoadDetail'));
      }
    } catch (err) {
      setError(err.message || t('manage.enterprise.customer.modal.failedToLoadDetail'));
    } finally {
      setLoading(false);
    }
  }, [membNo, t]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleEditMode = useCallback(() => setIsEditMode(true), []);

  const handleCancelEdit = useCallback(() => {
    if (data) {
      setForm({
        membNm: data.membNm || '',
        mblTelNo: data.mblTelNo || '',
        recvEmail: data.recvEmail || '',
        zipCd: data.zipCd || '',
        baseAddr: data.baseAddr || '',
        dtlAddr: data.dtlAddr || '',
      });
    }
    setIsEditMode(false);
  }, [data]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await updateEnterpriseCustomer(membNo, form);
      if (res.status === 'SUCCESS') {
        toast.success(t('manage.enterprise.customer.modal.alertUpdated'));
        setIsEditMode(false);
        fetchDetail();
      } else {
        toast.error(res.message || t('manage.enterprise.customer.modal.alertUpdateFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('manage.enterprise.customer.modal.alertUpdateError'));
    } finally {
      setSaving(false);
    }
  }, [form, membNo, fetchDetail, t]);

  const handleBack = () => navigate(-1);

  const buildAddress = () => {
    const parts = [data?.zipCd, data?.baseAddr, data?.dtlAddr].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  };

  if (loading) {
    return (
      <div className="notion-page manage-ent-customer-detail-page">
        <div className="loading-center">
          <span className="spinner" />
          <span>{t('manage.enterprise.customer.modal.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notion-page manage-ent-customer-detail-page">
        <div className="error-center">
          <p>{error}</p>
          <button className="btn-ghost" onClick={handleBack}>{t('manage.common.goBackToList')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-page manage-ent-customer-detail-page">
      <button className="btn-back" onClick={handleBack}>{t('manage.common.backToList')}</button>

      <div className="page-header">
        <div>
          <h1 className="page-title">{t('manage.enterprise.customer.modal.title')}</h1>
          <p className="page-description">{t('manage.enterprise.customer.pageDescription')}</p>
        </div>
        <div className="header-actions">
          {data?.membNo && <span className="ent-no-badge">No. {data.membNo}</span>}
          {isEditMode ? (
            <>
              <button className="btn-ghost" onClick={handleCancelEdit}>{t('manage.common.cancel')}</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('manage.enterprise.customer.modal.saving') : t('manage.enterprise.customer.modal.save')}
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={handleEditMode}>{t('manage.common.edit')}</button>
          )}
        </div>
      </div>

      <div className="prop-list">
        <PropRow label={t('manage.enterprise.customer.modal.labelMembNo')} value={data?.membNo} />
        <PropRow label={t('manage.enterprise.customer.modal.labelMembId')} value={data?.membId} />
        <PropRow label={t('manage.enterprise.customer.modal.labelPlatform')} value={data?.platform} />
        <PropRow label={t('manage.enterprise.customer.modal.labelEntNm')} value={data?.entNm} />
        <PropRow label={t('manage.enterprise.customer.modal.labelStatus')}>
          <span className={`customer-status-badge ${data?.status === '정상' ? 'active' : data?.status === '대기' ? 'pending' : 'withdrawn'}`}>
            {data?.status || '-'}
          </span>
        </PropRow>
        <PropRow label={t('manage.enterprise.customer.modal.labelName')}>
          {isEditMode
            ? <input type="text" value={form.membNm} onChange={(e) => handleChange('membNm', e.target.value)} />
            : data?.membNm || '-'}
        </PropRow>
        <PropRow label={t('manage.enterprise.customer.modal.labelContact')}>
          {isEditMode
            ? <input type="text" value={form.mblTelNo} onChange={(e) => handleChange('mblTelNo', e.target.value)} placeholder={t('manage.enterprise.customer.modal.contactPlaceholder')} />
            : data?.mblTelNo || '-'}
        </PropRow>
        <PropRow label={t('manage.enterprise.customer.modal.labelEmail')}>
          {isEditMode
            ? <input type="text" value={form.recvEmail} onChange={(e) => handleChange('recvEmail', e.target.value)} />
            : data?.recvEmail || '-'}
        </PropRow>
        <PropRow label={t('manage.enterprise.customer.modal.labelZipCode') + ' / ' + t('manage.enterprise.customer.modal.labelBaseAddr') + ' / ' + t('manage.enterprise.customer.modal.labelDtlAddr')} wide>
          {isEditMode ? (
            <div className="prop-addr-inputs">
              <input type="text" value={form.zipCd} onChange={(e) => handleChange('zipCd', e.target.value)} placeholder={t('manage.enterprise.customer.modal.zipCodePlaceholder')} />
              <input type="text" value={form.baseAddr} onChange={(e) => handleChange('baseAddr', e.target.value)} placeholder={t('manage.enterprise.customer.modal.labelBaseAddr')} />
              <input type="text" value={form.dtlAddr} onChange={(e) => handleChange('dtlAddr', e.target.value)} placeholder={t('manage.enterprise.customer.modal.labelDtlAddr')} />
            </div>
          ) : buildAddress() || '-'}
        </PropRow>
        <PropRow label={t('manage.enterprise.customer.modal.labelRegDttm')} value={data?.regDttm} />
        <PropRow label={t('manage.enterprise.customer.modal.labelChgDttm')} value={data?.chgDttm} />
        {data?.wdlRsn && (
          <PropRow label={t('manage.enterprise.customer.modal.labelWdlReason')} value={data.wdlRsn} wide />
        )}
      </div>
    </div>
  );
}
