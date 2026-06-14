/**
 * 작업자 배정 모달
 *
 * 프로젝트 파일에 작업자를 배정하기 위한 탭형 모달입니다.
 * - 탭 1: 웍스파이 신청자 중 선택
 * - 탭 2: 수동 배정 (전체 작업자 검색)
 *
 * @module WorkerAssignModal
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { getWorksfyApplicants, getWorksfyWorkers } from '../../../api/v9';
import { getMemberByEmail } from '../../../api/v9/member';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './WorkerAssignModal.css';

// ============================================================================
// 메모 호버 훅 (행 호버 시 회원 "비고"를 툴팁으로 표시)
// ============================================================================

const useMemoHover = () => {
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

  return { memoCache, memoTooltip, handleRowMouseEnter, handleRowMouseLeave };
};

const MemoTooltip = ({ memoTooltip, memoCache }) => {
  const { t } = useTranslation('common');
  if (!memoTooltip.visible || !memoTooltip.email) return null;
  return createPortal(
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
  );
};

// ============================================================================
// 상수
// ============================================================================

/** 탭 정의 */
const TABS = [
  { id: 'applicants', labelKey: 'workerAssign.tabApplicants' },
  { id: 'manual', labelKey: 'workerAssign.tabManual' },
];

/** 승인 상태별 Chip 스타일 */
const APPROVAL_CHIP = {
  true: { labelKey: 'workerAssign.approved', bg: '#e8f5e9', color: '#388e3c', border: '#81c784' },
  false: { labelKey: 'workerAssign.unapproved', bg: '#fff8e1', color: '#f57c00', border: '#ffb74d' },
  null: { labelKey: null, bg: '#f5f5f5', color: '#9e9e9e', border: '#e0e0e0' },
};

// ============================================================================
// 신청자 탭 컴포넌트
// ============================================================================

const ApplicantsTab = ({ worksfyProjectKey, onAssign, onBatchAssign, assigning }) => {
  const { t } = useTranslation('common');
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { memoCache, memoTooltip, handleRowMouseEnter, handleRowMouseLeave } = useMemoHover();

  const fetchApplicants = useCallback(async () => {
    if (!worksfyProjectKey) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getWorksfyApplicants(worksfyProjectKey, { status: 'approved' });
      if (response?.status === 'SUCCESS') {
        setApplicants(response.data?.applicants || []);
      } else {
        setError(response?.message || t('workerAssign.failedToLoadApplicants'));
        setApplicants([]);
      }
    } catch (err) {
      setError(err.message || t('workerAssign.failedToLoadApplicants'));
      setApplicants([]);
    } finally {
      setLoading(false);
    }
  }, [worksfyProjectKey]);

  useEffect(() => {
    fetchApplicants();
  }, [fetchApplicants]);

  if (!worksfyProjectKey) {
    return (
      <div className="worker-assign-applicants-scroll">
        <div className="worker-assign-empty">
          {t('workerAssign.registerWorksfyFirst')}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="worker-assign-applicants-scroll">
        <div className="worker-assign-loading">
          <Loader2 size={20} className="spin-icon" />
          <span>{t('workerAssign.loadingApplicants')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="worker-assign-applicants-scroll">
        <div className="worker-assign-error">{error}</div>
      </div>
    );
  }

  if (applicants.length === 0) {
    return (
      <div className="worker-assign-applicants-scroll">
        <div className="worker-assign-empty">{t('workerAssign.noApplicants')}</div>
      </div>
    );
  }

  return (
    <div className="worker-assign-applicants-scroll">
      <table className="worker-assign-table">
        <thead>
          <tr>
            <th className="col-name">{t('workerAssign.name')}</th>
            <th className="col-email">{t('workerAssign.email')}</th>
            <th className="col-phone">{t('workerAssign.phone')}</th>
            <th className="col-status">{t('workerAssign.approvalStatus')}</th>
            <th className="col-action">{t('workerAssign.assign')}</th>
          </tr>
        </thead>
        <tbody>
          {applicants.map((applicant) => {
            const chipInfo = APPROVAL_CHIP[String(applicant.approved)] || APPROVAL_CHIP['null'];
            return (
              <tr
                key={applicant.workerId}
                onMouseEnter={(e) => handleRowMouseEnter(e, applicant.email)}
                onMouseLeave={handleRowMouseLeave}
              >
                <td className="col-name">{applicant.workerName || '-'}</td>
                <td className="col-email">{applicant.email || '-'}</td>
                <td className="col-phone">{applicant.mblTelNo || '-'}</td>
                <td className="col-status">
                  <span
                    className="status-chip"
                    style={{
                      backgroundColor: chipInfo.bg,
                      color: chipInfo.color,
                      borderColor: chipInfo.border,
                    }}
                  >
                    {chipInfo.labelKey ? t(chipInfo.labelKey) : '-'}
                  </span>
                </td>
                <td className="col-action">
                  <div className="action-btns">
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => onAssign(applicant.email, applicant.workerName)}
                      disabled={assigning}
                    >
                      {t('workerAssign.assign')}
                    </button>
                    {onBatchAssign && (
                      <button
                        className="btn-outline btn-sm btn-batch"
                        onClick={() => onBatchAssign(applicant.email, applicant.workerName)}
                        disabled={assigning}
                      >
                        {t('workerAssign.batchAssign')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <MemoTooltip memoTooltip={memoTooltip} memoCache={memoCache} />
    </div>
  );
};

// ============================================================================
// 수동 배정 탭 컴포넌트
// ============================================================================

/** 페이지 크기 */
const PAGE_SIZE = 10;

const ManualTab = ({ onAssign, onBatchAssign, assigning }) => {
  const { t } = useTranslation('common');
  const [search, setSearch] = useState('');
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [directEmail, setDirectEmail] = useState('');
  const { memoCache, memoTooltip, handleRowMouseEnter, handleRowMouseLeave } = useMemoHover();

  const validateDirectEmail = () => {
    const email = directEmail.trim();
    if (!email) { alert(t('workerAssign.enterEmail')); return null; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert(t('workerAssign.invalidEmailFormat')); return null; }
    return email;
  };

  const handleDirectAssign = () => {
    const email = validateDirectEmail();
    if (!email) return;
    onAssign(email, email);
    setDirectEmail('');
  };

  const handleDirectBatchAssign = () => {
    if (!onBatchAssign) return;
    const email = validateDirectEmail();
    if (!email) return;
    onBatchAssign(email, email);
    setDirectEmail('');
  };

  const fetchWorkers = useCallback(async (searchValue, pageNum = 0) => {
    setLoading(true);
    try {
      const params = { size: PAGE_SIZE, page: pageNum };
      if (searchValue.trim()) {
        params.search = searchValue.trim();
      }
      const response = await getWorksfyWorkers(params);
      if (response?.status === 'SUCCESS') {
        setWorkers(response.data?.workers || []);
        setTotalPages(response.data?.totalPages ?? 0);
        setTotalElements(response.data?.totalElements ?? 0);
        setPage(pageNum);
      } else {
        setWorkers([]);
        setTotalPages(0);
        setTotalElements(0);
      }
    } catch {
      setWorkers([]);
      setTotalPages(0);
      setTotalElements(0);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  const handleSearch = () => {
    setPage(0);
    fetchWorkers(search, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handlePageChange = (newPage) => {
    fetchWorkers(search, newPage);
  };

  return (
    <div className="worker-assign-manual">
      {/* 검색 */}
      <div className="worker-assign-search">
        <input
          type="text"
          placeholder={t('workerAssign.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn-primary"
          onClick={handleSearch}
          disabled={loading}
        >
          {t('workerAssign.search')}
        </button>
      </div>

      {/* 테이블 (스크롤 영역) */}
      <div className="worker-assign-table-area">
        {loading && (
          <div className="worker-assign-loading">
            <Loader2 size={20} className="spin-icon" />
            <span>{t('workerAssign.loadingWorkers')}</span>
          </div>
        )}

        {!loading && searched && workers.length === 0 && (
          <div className="worker-assign-empty">
            {t('workerAssign.noSearchResults')}
          </div>
        )}

        {!loading && workers.length > 0 && (
          <table className="worker-assign-table">
            <thead>
              <tr>
                <th className="col-name">{t('workerAssign.name')}</th>
                <th className="col-email">{t('workerAssign.email')}</th>
                <th className="col-phone">{t('workerAssign.phone')}</th>
                <th className="col-action">{t('workerAssign.assign')}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr
                  key={worker.wrkrId}
                  onMouseEnter={(e) => handleRowMouseEnter(e, worker.email)}
                  onMouseLeave={handleRowMouseLeave}
                >
                  <td className="col-name">{worker.wrkrNm || '-'}</td>
                  <td className="col-email">{worker.email || '-'}</td>
                  <td className="col-phone">{worker.mblTelNo || '-'}</td>
                  <td className="col-action">
                    <div className="action-btns">
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => onAssign(worker.email, worker.wrkrNm)}
                        disabled={assigning}
                      >
                        {t('workerAssign.assign')}
                      </button>
                      {onBatchAssign && (
                        <button
                          className="btn-outline btn-sm btn-batch"
                          onClick={() => onBatchAssign(worker.email, worker.wrkrNm)}
                          disabled={assigning}
                        >
                          {t('workerAssign.batchAssign')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {searched && totalPages > 1 && (
          <div className="worker-assign-pagination">
            <button
              className="btn-ghost btn-sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0 || loading}
            >
              {t('workerAssign.previous')}
            </button>
            <span className="pagination-info">
              {t('workerAssign.paginationInfo', { current: page + 1, totalPages, totalElements })}
            </span>
            <button
              className="btn-ghost btn-sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages - 1 || loading}
            >
              {t('workerAssign.next')}
            </button>
          </div>
        )}
      </div>

      {/* 이메일 직접 배정 (항상 하단 고정) */}
      <div className="worker-assign-direct">
        <span className="direct-label">{t('workerAssign.directAssignByEmail')}</span>
        <div className="direct-input-row">
          <input
            type="email"
            placeholder={t('workerAssign.enterEmailAddress')}
            value={directEmail}
            onChange={(e) => setDirectEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDirectAssign()}
          />
          <button
            className="btn-primary"
            onClick={handleDirectAssign}
            disabled={assigning || !directEmail.trim()}
          >
            {t('workerAssign.assign')}
          </button>
          {onBatchAssign && (
            <button
              className="btn-outline btn-batch"
              onClick={handleDirectBatchAssign}
              disabled={assigning || !directEmail.trim()}
            >
              {t('workerAssign.batchAssign')}
            </button>
          )}
        </div>
      </div>
      <MemoTooltip memoTooltip={memoTooltip} memoCache={memoCache} />
    </div>
  );
};

// ============================================================================
// 메인 모달 컴포넌트
// ============================================================================

/**
 * 작업자 배정 모달
 *
 * @param {Object} props
 * @param {boolean} props.open - 모달 표시 여부
 * @param {string|null} props.worksfyProjectKey - 웍스파이 프로젝트 ID (신청자 탭용)
 * @param {Function} props.onClose - 모달 닫기 콜백
 * @param {Function} props.onAssign - 배정 콜백 (email, workerName)
 * @param {boolean} props.assigning - 배정 처리 중 상태
 */
const WorkerAssignModal = ({ open, worksfyProjectKey, onClose, onAssign, onBatchAssign, assigning }) => {
  const { t } = useTranslation('common');
  const [activeTab, setActiveTab] = useState('applicants');

  // 모달 열릴 때 탭 초기화
  useEffect(() => {
    if (open) {
      setActiveTab('applicants');
    }
  }, [open]);

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

  if (!open) return null;

  return (
    <div className="notion-modal-overlay">
      <div className="notion-modal worker-assign-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="notion-modal-header">
          <h3>{t('workerAssign.title')}</h3>
          <button className="notion-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* 탭 바 */}
        <div className="worker-assign-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`worker-assign-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* 탭 본문 */}
        <div className="worker-assign-body">
          {activeTab === 'applicants' ? (
            <ApplicantsTab
              worksfyProjectKey={worksfyProjectKey}
              onAssign={onAssign}
              onBatchAssign={onBatchAssign}
              assigning={assigning}
            />
          ) : (
            <ManualTab
              onAssign={onAssign}
              onBatchAssign={onBatchAssign}
              assigning={assigning}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkerAssignModal;
