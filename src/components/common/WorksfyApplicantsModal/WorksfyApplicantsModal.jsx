/**
 * 웍스파이 모집인원 조회 모달
 *
 * 웍스파이 프로젝트의 신청자 목록을 조회하고,
 * 선택한 신청자에 대해 승인/승인해제를 수행합니다.
 *
 * @module WorksfyApplicantsModal
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import {
  getWorksfyApplicants,
  approveWorksfyApplicants,
  unapproveWorksfyApplicants,
} from '../../../api/v9';
import { getMemberByEmail } from '../../../api/v9/member';
import { useTranslation } from 'react-i18next';
import './WorksfyApplicantsModal.css';

// ============================================================================
// 상수
// ============================================================================

/** 상태 필터 옵션 */
const STATUS_FILTERS = [
  { value: 'all', labelKey: 'worksfyApplicants.filterAll' },
  { value: 'approved', labelKey: 'worksfyApplicants.filterApproved' },
  { value: 'unapproved', labelKey: 'worksfyApplicants.filterUnapproved' },
  { value: 'cancelled', labelKey: 'worksfyApplicants.filterCancelled' },
];

/** 승인 상태별 Chip 스타일 */
const APPROVAL_CHIPS = {
  cancelled: { labelKey: 'worksfyApplicants.cancelled', bg: '#fce4ec', color: '#c62828', border: '#ef9a9a' },
  approved: { labelKey: 'worksfyApplicants.approved', bg: '#e8f5e9', color: '#388e3c', border: '#81c784' },
  unapproved: { labelKey: 'worksfyApplicants.unapproved', bg: '#fff8e1', color: '#f57c00', border: '#ffb74d' },
  unknown: { labelKey: null, bg: '#f5f5f5', color: '#9e9e9e', border: '#e0e0e0' },
};

function getApplicantStatus(applicant) {
  if (applicant.cancelled) return 'cancelled';
  if (applicant.approved) return 'approved';
  return 'unapproved';
}

// ============================================================================
// 컴포넌트
// ============================================================================

/**
 * 웍스파이 모집인원 조회 모달
 *
 * @param {Object} props
 * @param {boolean} props.open - 모달 표시 여부
 * @param {string|null} props.worksfyProjectKey - 웍스파이 프로젝트 ID
 * @param {Function} props.onClose - 모달 닫기 콜백
 */
const WorksfyApplicantsModal = ({ open, worksfyProjectKey, onClose }) => {
  const { t } = useTranslation('common');
  // 내부 상태
  const [applicants, setApplicants] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [memoCache, setMemoCache] = useState({});
  const [memoTooltip, setMemoTooltip] = useState({ visible: false, email: null, x: 0, y: 0 });
  const memoFetchingRef = useRef(new Set());
  const hoverTimerRef = useRef(null);

  const handleRowMouseEnter = useCallback((e, email) => {
    if (!email) return;
    clearTimeout(hoverTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 4;
    hoverTimerRef.current = setTimeout(async () => {
      setMemoTooltip({ visible: true, email, x, y });

      if (memoCache[email] !== undefined || memoFetchingRef.current.has(email)) return;
      memoFetchingRef.current.add(email);
      try {
        const res = await getMemberByEmail(email);
        if (res?.status === 'SUCCESS' && res.data) {
          setMemoCache((prev) => ({ ...prev, [email]: res.data.memo || '' }));
        } else {
          setMemoCache((prev) => ({ ...prev, [email]: '' }));
        }
      } catch {
        setMemoCache((prev) => ({ ...prev, [email]: '' }));
      } finally {
        memoFetchingRef.current.delete(email);
      }
    }, 300);
  }, [memoCache]);

  const handleRowMouseLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    setMemoTooltip({ visible: false, email: null, x: 0, y: 0 });
  }, []);

  // ========== API 호출 ==========

  /**
   * 신청자 목록 조회
   */
  const fetchApplicants = useCallback(async (status) => {
    if (!worksfyProjectKey) return;
    setLoading(true);
    setError(null);
    try {
      const params = status && status !== 'all' ? { status } : {};
      const response = await getWorksfyApplicants(worksfyProjectKey, params);
      if (response?.status === 'SUCCESS') {
        setApplicants(response.data?.applicants || []);
        setTotalCount(response.data?.totalCount ?? 0);
      } else {
        setError(response?.message || t('worksfyApplicants.failedToLoadApplicants'));
        setApplicants([]);
      }
    } catch (err) {
      setError(err.message || t('worksfyApplicants.failedToLoadApplicants'));
      setApplicants([]);
    } finally {
      setLoading(false);
    }
  }, [worksfyProjectKey]);

  // 모달 열릴 때 데이터 로드
  useEffect(() => {
    if (open && worksfyProjectKey) {
      setStatusFilter('all');
      setSelectedIds(new Set());
      fetchApplicants('all');
    }
  }, [open, worksfyProjectKey, fetchApplicants]);

  // ESC 키 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // ========== 핸들러 ==========

  /** 필터 변경 */
  const handleFilterChange = (value) => {
    setStatusFilter(value);
    setSelectedIds(new Set());
    fetchApplicants(value);
  };

  /** 체크박스 개별 토글 */
  const handleToggleSelect = (workerId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) {
        next.delete(workerId);
      } else {
        next.add(workerId);
      }
      return next;
    });
  };

  /** 전체 선택/해제 */
  const handleToggleAll = () => {
    if (selectedIds.size === applicants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applicants.map((a) => a.workerId)));
    }
  };

  /** 일괄 승인 */
  const handleApprove = async () => {
    if (selectedIds.size === 0) {
      alert(t('worksfyApplicants.selectApplicantsToApprove'));
      return;
    }
    setActionSubmitting(true);
    try {
      const response = await approveWorksfyApplicants(worksfyProjectKey, {
        workerIds: Array.from(selectedIds),
      });
      if (response?.status === 'SUCCESS') {
        setSelectedIds(new Set());
        await fetchApplicants(statusFilter);
      } else {
        alert(response?.message || t('worksfyApplicants.approvalFailed'));
      }
    } catch (err) {
      alert(err.message || t('worksfyApplicants.approvalError'));
    } finally {
      setActionSubmitting(false);
    }
  };

  /** 일괄 승인해제 */
  const handleUnapprove = async () => {
    if (selectedIds.size === 0) {
      alert(t('worksfyApplicants.selectApplicantsToUnapprove'));
      return;
    }
    setActionSubmitting(true);
    try {
      const response = await unapproveWorksfyApplicants(worksfyProjectKey, {
        workerIds: Array.from(selectedIds),
      });
      if (response?.status === 'SUCCESS') {
        setSelectedIds(new Set());
        await fetchApplicants(statusFilter);
      } else {
        alert(response?.message || t('worksfyApplicants.unapprovalFailed'));
      }
    } catch (err) {
      alert(err.message || t('worksfyApplicants.unapprovalError'));
    } finally {
      setActionSubmitting(false);
    }
  };

  // ========== 렌더링 ==========

  if (!open) return null;

  const isAllSelected = applicants.length > 0 && selectedIds.size === applicants.length;

  return (
    <div className="worksfy-applicants-overlay" onClick={onClose}>
      <div className="worksfy-applicants-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="worksfy-applicants-header">
          <h3>{t('worksfyApplicants.title')}</h3>
          <button className="worksfy-modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 툴바 */}
        <div className="worksfy-applicants-toolbar">
          <div className="worksfy-filter-group">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                className={`worksfy-filter-btn ${statusFilter === f.value ? 'active' : ''}`}
                onClick={() => handleFilterChange(f.value)}
              >
                {t(f.labelKey)}
              </button>
            ))}
            <span className="worksfy-total-count">{t('worksfyApplicants.totalCount', { count: totalCount })}</span>
          </div>
          <div className="worksfy-action-group">
            <Button
              variant="contained"
              size="small"
              onClick={handleApprove}
              disabled={selectedIds.size === 0 || actionSubmitting}
              sx={{ fontSize: '12px', textTransform: 'none' }}
            >
              {t('worksfyApplicants.bulkApprove', { count: selectedIds.size })}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleUnapprove}
              disabled={selectedIds.size === 0 || actionSubmitting}
              sx={{ fontSize: '12px', textTransform: 'none' }}
            >
              {t('worksfyApplicants.bulkUnapprove', { count: selectedIds.size })}
            </Button>
          </div>
        </div>

        {/* 본문 */}
        <div className="worksfy-applicants-body">
          {loading ? (
            <div className="worksfy-applicants-loading">
              <CircularProgress size={24} />
              <span>{t('worksfyApplicants.loadingApplicants')}</span>
            </div>
          ) : error ? (
            <div className="worksfy-applicants-error">{error}</div>
          ) : applicants.length === 0 ? (
            <div className="worksfy-applicants-empty">{t('worksfyApplicants.noApplicants')}</div>
          ) : (
            <table className="worksfy-applicants-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleAll}
                    />
                  </th>
                  <th className="col-name">{t('worksfyApplicants.name')}</th>
                  <th className="col-email">{t('worksfyApplicants.email')}</th>
                  <th className="col-phone">{t('worksfyApplicants.phone')}</th>
                  <th className="col-status">{t('worksfyApplicants.approvalStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map((applicant) => {
                  const chipInfo = APPROVAL_CHIPS[getApplicantStatus(applicant)] || APPROVAL_CHIPS.unknown;
                  return (
                    <tr
                      key={applicant.workerId}
                      className={selectedIds.has(applicant.workerId) ? 'selected' : ''}
                      onMouseEnter={(e) => handleRowMouseEnter(e, applicant.email)}
                      onMouseLeave={handleRowMouseLeave}
                    >
                      <td className="col-check">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(applicant.workerId)}
                          onChange={() => handleToggleSelect(applicant.workerId)}
                        />
                      </td>
                      <td className="col-name">{applicant.workerName || '-'}</td>
                      <td className="col-email">{applicant.email || '-'}</td>
                      <td className="col-phone">{applicant.mblTelNo || '-'}</td>
                      <td className="col-status">
                        <Chip
                          label={chipInfo.labelKey ? t(chipInfo.labelKey) : '-'}
                          size="small"
                          variant="outlined"
                          sx={{
                            backgroundColor: chipInfo.bg,
                            color: chipInfo.color,
                            borderColor: chipInfo.border,
                            fontWeight: 500,
                            fontSize: '11px',
                            height: '22px',
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

        </div>
      </div>

      {memoTooltip.visible && memoTooltip.email && createPortal(
        <div
          className="worksfy-memo-tooltip"
          style={{ left: memoTooltip.x, top: memoTooltip.y }}
        >
          <span className="worksfy-memo-label">{t('worksfyApplicants.memo')}</span>
          <span className="worksfy-memo-content">
            {memoCache[memoTooltip.email] === undefined
              ? t('worksfyApplicants.memoLoading')
              : memoCache[memoTooltip.email] || t('worksfyApplicants.memoEmpty')}
          </span>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default WorksfyApplicantsModal;
