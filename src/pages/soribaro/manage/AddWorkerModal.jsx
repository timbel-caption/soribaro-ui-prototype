import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createMember } from '../../../api/v9/member';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INITIAL_FORM = {
  membId: '',
  membNm: '',
  mblTelNo: '',
  membPwd: '',
  membLvl: '',
  siteType: '',
  recvEmail: '',
};

const MEMB_LVL_OPTIONS = [
  { value: '1', key: 'membLvl1' },
  { value: '3', key: 'membLvl3' },
  { value: '6', key: 'membLvl6' },
  { value: '2', key: 'membLvl4' },
];

const SITE_TYPE_OPTIONS = [
  { value: 'SORI', key: 'siteTypeSori' },
  { value: 'CLIP', key: 'siteTypeClip' },
];

export default function AddWorkerModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation('soribaro');
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setSubmitting(false);
    }
  }, [open]);

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
    const prefix = 'manage.worker.addMemberModal';
    if (!form.membId.trim()) return t(`${prefix}.alertMembIdRequired`);
    if (!EMAIL_REGEX.test(form.membId.trim())) return t(`${prefix}.alertMembIdInvalid`);
    if (!form.membNm.trim()) return t(`${prefix}.alertMembNmRequired`);
    if (!form.mblTelNo.trim()) return t(`${prefix}.alertMblTelNoRequired`);
    if (!form.membLvl) return t(`${prefix}.alertMembLvlRequired`);
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
        membLvl: form.membLvl,
      };
      if (form.membPwd.trim()) payload.membPwd = form.membPwd.trim();
      if (form.siteType) payload.siteType = form.siteType;
      if (form.recvEmail.trim()) payload.recvEmail = form.recvEmail.trim();

      const res = await createMember(payload);

      if (res.status === 'SUCCESS') {
        toast.success(t('manage.worker.addMemberModal.alertCreated'));
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || t('manage.worker.addMemberModal.alertCreateFailed'));
      }
    } catch (err) {
      toast.error(err.data?.message || err.message || t('manage.worker.addMemberModal.alertCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, onClose, onSuccess, t]);

  if (!open) return null;

  const prefix = 'manage.worker.addMemberModal';

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
            <label>{t(`${prefix}.labelMembPwd`)} <span className="text-muted">{t(`${prefix}.optional`)}</span></label>
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
              <label>{t(`${prefix}.labelMembLvl`)} <span className="text-required">{t(`${prefix}.required`)}</span></label>
              <select
                value={form.membLvl}
                onChange={(e) => handleChange('membLvl', e.target.value)}
              >
                <option value="">{t(`${prefix}.selectMembLvl`)}</option>
                {MEMB_LVL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(`${prefix}.${o.key}`)}</option>
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
