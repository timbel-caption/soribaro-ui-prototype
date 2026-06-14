/**
 * 수강생 단건 등록 모달 (관리자 전용)
 *
 * - membLvl='7' 고정 (백엔드 service 가 강제)
 * - notion-modal 디자인 시스템 — 테마 변수(다크/라이트) 자동 반영
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTraineeStudent } from '../../api/v9/training/evaluations';
import { toast } from '../../stores/toastStore';
import '../../styles/notion-list.css';

const EMPTY = { membId: '', membNm: '', mblTelNo: '', membPwd: '', recvEmail: '' };

export default function AddStudentModal({ open, onClose, onCreated }) {
  const { t } = useTranslation('common');
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = () => {
    if (!form.membId.trim()) return t('training.addStudent.errors.emailRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.membId.trim()))
      return t('training.addStudent.errors.emailInvalid');
    if (!form.membNm.trim()) return t('training.addStudent.errors.nameRequired');
    if (!form.mblTelNo.trim()) return t('training.addStudent.errors.phoneRequired');
    const digits = form.mblTelNo.replace(/[^0-9]/g, '');
    if (digits.length < 9) return t('training.addStudent.errors.phoneInvalid');
    return null;
  };

  const handleSubmit = useCallback(async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        membId: form.membId.trim(),
        membNm: form.membNm.trim(),
        mblTelNo: form.mblTelNo.replace(/[^0-9]/g, ''),
        membLvl: '7', // 백엔드 @NotBlank 통과용. service 단에서 어차피 '7' 로 강제됨
      };
      if (form.membPwd.trim()) body.membPwd = form.membPwd;
      if (form.recvEmail.trim()) body.recvEmail = form.recvEmail.trim();

      const res = await createTraineeStudent(body);
      if (res?.status && res.status !== 'SUCCESS') {
        throw new Error(res.message || t('training.addStudent.errors.createFailed'));
      }
      toast.success(t('training.addStudent.created'));
      setForm(EMPTY);
      onCreated?.();
      onClose?.();
    } catch (e) {
      console.error('[AddStudentModal] create failed:', e);
      toast.error(e?.message || t('training.addStudent.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, t, onCreated, onClose]);

  if (!open) return null;

  return (
    <div className="notion-modal-overlay">
      <div
        className="notion-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notion-modal-header">
          <h3>{t('training.addStudent.title')}</h3>
          <button
            type="button"
            className="notion-modal-close"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        <div className="notion-modal-body">
          <div className="form-group">
            <label>
              {t('training.addStudent.fields.email')}
              <span style={{ color: 'var(--accent-secondary)', marginLeft: 4 }}>*</span>
            </label>
            <input
              type="email"
              value={form.membId}
              onChange={handleChange('membId')}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>
              {t('training.addStudent.fields.name')}
              <span style={{ color: 'var(--accent-secondary)', marginLeft: 4 }}>*</span>
            </label>
            <input
              type="text"
              value={form.membNm}
              onChange={handleChange('membNm')}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label>
              {t('training.addStudent.fields.phone')}
              <span style={{ color: 'var(--accent-secondary)', marginLeft: 4 }}>*</span>
            </label>
            <input
              type="text"
              value={form.mblTelNo}
              onChange={handleChange('mblTelNo')}
              disabled={submitting}
              placeholder="01012345678"
            />
            <span className="form-hint" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {t('training.addStudent.fields.phoneHelper')}
            </span>
          </div>

          <div className="form-group">
            <label>{t('training.addStudent.fields.password')}</label>
            <input
              type="password"
              value={form.membPwd}
              onChange={handleChange('membPwd')}
              disabled={submitting}
            />
            <span className="form-hint" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {t('training.addStudent.fields.passwordHelper')}
            </span>
          </div>

          <div className="form-group">
            <label>{t('training.addStudent.fields.recvEmail')}</label>
            <input
              type="email"
              value={form.recvEmail}
              onChange={handleChange('recvEmail')}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="notion-modal-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
          >
            {t('training.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? t('training.loading') : t('training.addStudent.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
