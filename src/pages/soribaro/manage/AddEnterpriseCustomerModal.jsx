import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createMember, getCompanyOptions } from '../../../api/v9/member';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PWD_REGEX = /^(?=.*\d)(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/`~]).{8,}$/;

const INITIAL_FORM = {
  membId: '',
  membNm: '',
  mblTelNo: '',
  membPwd: '',
  entNo: '',
  siteType: '',
  recvEmail: '',
};

const SITE_TYPE_OPTIONS = [
  { value: 'SORI', key: 'siteTypeSori' },
  { value: 'CLIP', key: 'siteTypeClip' },
];

export default function AddEnterpriseCustomerModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setSubmitting(false);

    let cancelled = false;
    (async () => {
      setCompanyLoading(true);
      try {
        const res = await getCompanyOptions();
        if (!cancelled && res.status === 'SUCCESS') {
          setCompanyOptions(res.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(t('manage.enterprise.customer.addCustomerModal.alertLoadCompanyFailed'));
        }
      } finally {
        if (!cancelled) setCompanyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const validate = useCallback(() => {
    const prefix = 'manage.enterprise.customer.addCustomerModal';
    if (!form.membId.trim()) return t(`${prefix}.alertMembIdRequired`);
    if (!EMAIL_REGEX.test(form.membId.trim())) return t(`${prefix}.alertMembIdInvalid`);
    if (!form.membNm.trim()) return t(`${prefix}.alertMembNmRequired`);
    if (!form.mblTelNo.trim()) return t(`${prefix}.alertMblTelNoRequired`);
    if (!form.membPwd.trim()) return t(`${prefix}.alertMembPwdRequired`);
    if (!PWD_REGEX.test(form.membPwd.trim())) return t(`${prefix}.alertMembPwdInvalid`);
    if (!form.entNo) return t(`${prefix}.alertEntNoRequired`);
    return null;
  }, [form, t]);

  const handleSubmit = useCallback(async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        membId: form.membId.trim(),
        membNm: form.membNm.trim(),
        mblTelNo: form.mblTelNo.trim(),
        membPwd: form.membPwd.trim(),
        membLvl: '5',
        entNo: form.entNo,
      };
      if (form.siteType) payload.siteType = form.siteType;
      if (form.recvEmail.trim()) payload.recvEmail = form.recvEmail.trim();

      const res = await createMember(payload);

      if (res.status === 'SUCCESS') {
        toast.success(t('manage.enterprise.customer.addCustomerModal.alertCreated'));
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || t('manage.enterprise.customer.addCustomerModal.alertCreateFailed'));
      }
    } catch (err) {
      toast.error(err.data?.message || err.message || t('manage.enterprise.customer.addCustomerModal.alertCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, onClose, onSuccess, t]);

  if (!open) return null;

  const prefix = 'manage.enterprise.customer.addCustomerModal';

  return (
    <div className="notion-modal-overlay" onClick={onClose}>
      <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-header">
          <h3>{t(`${prefix}.title`)}</h3>
          <button className="notion-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="notion-modal-body">
          <div className="form-group">
            <label>{t(`${prefix}.labelMembId`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
            <input
              type="text"
              value={form.membId}
              onChange={(e) => handleChange('membId', e.target.value)}
              placeholder={t(`${prefix}.placeholderMembId`)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>{t(`${prefix}.labelMembNm`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
            <input
              type="text"
              value={form.membNm}
              onChange={(e) => handleChange('membNm', e.target.value)}
              placeholder={t(`${prefix}.placeholderMembNm`)}
            />
          </div>

          <div className="form-group">
            <label>{t(`${prefix}.labelMblTelNo`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
            <input
              type="text"
              value={form.mblTelNo}
              onChange={(e) => handleChange('mblTelNo', e.target.value)}
              placeholder={t(`${prefix}.placeholderMblTelNo`)}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label>{t(`${prefix}.labelMembPwd`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
            <input
              type="password"
              value={form.membPwd}
              onChange={(e) => handleChange('membPwd', e.target.value)}
              placeholder={t(`${prefix}.placeholderMembPwd`)}
              autoComplete="new-password"
            />
            <span className="text-muted" style={{ fontSize: '11px' }}>{t(`${prefix}.pwdHint`)}</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t(`${prefix}.labelEntNo`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
              <select
                value={form.entNo}
                onChange={(e) => handleChange('entNo', e.target.value)}
                disabled={companyLoading}
              >
                <option value="">{companyLoading ? '...' : t(`${prefix}.selectEntNo`)}</option>
                {companyOptions.map((c) => (
                  <option key={c.entNo} value={String(c.entNo)}>{c.entNm}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t(`${prefix}.labelSiteType`)} <span className="text-muted">{t(`${prefix}.optional`)}</span></label>
              <select
                value={form.siteType}
                onChange={(e) => handleChange('siteType', e.target.value)}
              >
                <option value="">{t(`${prefix}.selectSiteType`)}</option>
                {SITE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(`${prefix}.${o.key}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>{t(`${prefix}.labelRecvEmail`)} <span className="text-muted">{t(`${prefix}.optional`)}</span></label>
            <input
              type="text"
              value={form.recvEmail}
              onChange={(e) => handleChange('recvEmail', e.target.value)}
              placeholder={t(`${prefix}.placeholderRecvEmail`)}
            />
          </div>
        </div>

        <div className="notion-modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={submitting}>
            {t(`${prefix}.cancel`)}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t(`${prefix}.registering`) : t(`${prefix}.register`)}
          </button>
        </div>
      </div>
    </div>
  );
}
