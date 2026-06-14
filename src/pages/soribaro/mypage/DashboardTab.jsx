import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../../../stores/userStore';
import { getMyProjects, getSettlementsByStatus, getMySettlementMonthlySummary } from '../../../api/v9';
import { isWorkStartBlockedStatus, isReviewStartBlockedStatus } from '../../../utils/projectStatusUtils';
import { toAppUrl } from '../../../utils/worktoolRoute';
import {
  Building2, Users, CreditCard, Tags,
  UserCog, Star, Megaphone,
} from 'lucide-react';
import './DashboardTab.css';

const DETAIL_PATHS = {
  record: (servCd) => `/soribaro/recording/work/${servCd}`,
  meeting: (servCd) => `/soribaro/enterprise/meeting/${servCd}`,
  vod: (servCd) => `/soribaro/enterprise/vod/${servCd}`,
  translate: (servCd) => `/soribaro/translation/work/${servCd}`,
};

const WORK_TYPES = ['record', 'meeting', 'vod', 'translate'];
const SETTLEMENT_STATUSES = ['WAITING_CONFIRM', 'WAITING_PAYMENT', 'PAID'];

const ADMIN_LINKS = [
  { path: '/soribaro/manage/enterprise', labelKey: 'enterpriseManagement', icon: Building2 },
  { path: '/soribaro/manage/enterprise-customer', labelKey: 'enterpriseCustomerManagement', icon: Users },
  { path: '/soribaro/manage/settlement', labelKey: 'settlementManagement', icon: CreditCard },
  { path: '/soribaro/manage/pricing', labelKey: 'pricing', icon: Tags },
  { path: '/soribaro/manage/worker', labelKey: 'workerManagement', icon: UserCog },
  { path: '/soribaro/manage/evaluation', labelKey: 'evaluationManagement', icon: Star },
  { path: '/soribaro/manage/notice', labelKey: 'noticeManagement', icon: Megaphone },
];

const DAY_KEYS = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'];

function formatDateWithT(date, t) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dayLabel = t(`common.${DAY_KEYS[date.getDay()]}`);
  return `${y}. ${m}. ${d}. (${dayLabel})`;
}

function parseDateString(str) {
  if (!str) return null;
  const trimmed = str.trim();
  if (trimmed.includes('-')) return new Date(trimmed.replace(' ', 'T'));
  if (trimmed.length >= 14) {
    const y = trimmed.substring(0, 4), m = trimmed.substring(4, 6), d = trimmed.substring(6, 8);
    const h = trimmed.substring(8, 10), mi = trimmed.substring(10, 12), s = trimmed.substring(12, 14);
    return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}`);
  }
  return null;
}

function formatDateFull(dateString) {
  if (!dateString) return '-';
  const date = parseDateString(dateString);
  if (!date || isNaN(date.getTime())) return dateString;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSecondsToHMS(totalSec) {
  const sec = Math.round(totalSec);
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatWorkTime(row) {
  if (row.isSplit) {
    const duration = (row.endSec ?? 0) - (row.startSec ?? 0);
    return formatSecondsToHMS(duration);
  }
  return row.totalPlayTm || '-';
}

// work_duration 합계(분) → "{h}시간 {m}분" / "{h}시간" / "{m}분"
function formatWorkMinutes(totalMin, t) {
  const min = Math.max(0, Math.round(Number(totalMin) || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return t('soribaro:mypage.dashboardWorkTimeHM', { h, m });
  if (h > 0) return t('soribaro:mypage.dashboardWorkTimeH', { h });
  return t('soribaro:mypage.dashboardWorkTimeM', { m });
}

export default function DashboardTab({ onTabChange }) {
  const { t } = useTranslation(['soribaro', 'common']);
  const navigate = useNavigate();
  const user = useUserStore((state) => state.user);
  const isAdmin = useUserStore((state) => state.isAdmin);

  const [workCounts, setWorkCounts] = useState({ record: null, meeting: null, vod: null, translate: null });
  const [settlementCounts, setSettlementCounts] = useState({ WAITING_CONFIRM: null, WAITING_PAYMENT: null, PAID: null });
  const [recentItems, setRecentItems] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [monthlySummary, setMonthlySummary] = useState(null);

  const fetchWorkCounts = useCallback(async () => {
    const results = {};
    await Promise.all([
      (async () => {
        try {
          const res = await getMyProjects({ type: 'record', page: 1, size: 1 });
          results.record = res?.status === 'SUCCESS' ? (res.data?.totalElements ?? 0) : 0;
        } catch { results.record = 0; }
      })(),
      (async () => {
        try {
          const res = await getMyProjects({ type: 'enterprise', page: 1, size: 200 });
          if (res?.status === 'SUCCESS' && res.data?.content) {
            const items = res.data.content;
            results.meeting = items.filter((i) => i.videoYn !== 'Y').length;
            results.vod = items.filter((i) => i.videoYn === 'Y').length;
          } else {
            results.meeting = 0;
            results.vod = 0;
          }
        } catch { results.meeting = 0; results.vod = 0; }
      })(),
      (async () => {
        try {
          const res = await getMyProjects({ type: 'translate', page: 1, size: 1 });
          results.translate = res?.status === 'SUCCESS' ? (res.data?.totalElements ?? 0) : 0;
        } catch { results.translate = 0; }
      })(),
    ]);
    setWorkCounts(results);
  }, []);

  const fetchSettlementCounts = useCallback(async () => {
    const results = {};
    await Promise.all(
      SETTLEMENT_STATUSES.map(async (key) => {
        try {
          const res = await getSettlementsByStatus({ status: key, page: 0, size: 1 });
          results[key] = res?.status === 'SUCCESS' ? (res.data?.totalElements ?? 0) : 0;
        } catch {
          results[key] = 0;
        }
      })
    );
    setSettlementCounts(results);
  }, []);

  const fetchRecentItems = useCallback(async () => {
    setRecentLoading(true);
    try {
      const allItems = [];
      const apiTypes = [
        { apiType: 'record', typeKey: 'record' },
        { apiType: 'enterprise', typeKey: null },
        { apiType: 'translate', typeKey: 'translate' },
      ];
      await Promise.all(
        apiTypes.map(async ({ apiType, typeKey }) => {
          try {
            const res = await getMyProjects({ type: apiType, page: 1, size: 5 });
            if (res?.status === 'SUCCESS' && res.data?.content) {
              allItems.push(...res.data.content.map((item) => ({
                ...item,
                _type: typeKey ?? (item.videoYn === 'Y' ? 'vod' : 'meeting'),
              })));
            }
          } catch { /* skip */ }
        })
      );
      allItems.sort((a, b) => {
        const dateA = parseDateString(a.updatedAt || a.createdAt);
        const dateB = parseDateString(b.updatedAt || b.createdAt);
        return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
      });
      setRecentItems(allItems.slice(0, 5));
    } finally {
      setRecentLoading(false);
    }
  }, []);

  const fetchMonthlySummary = useCallback(async () => {
    const membId = user?.membId;
    if (!membId) return;
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    try {
      const res = await getMySettlementMonthlySummary({ workerId: membId, yearMonth });
      const data = res?.status === 'SUCCESS' ? res.data : null;
      setMonthlySummary({
        workDurationTotal: data?.workDurationTotal ?? 0,
        count: data?.count ?? 0,
        payTotal: data?.payTotal ?? 0,
      });
    } catch {
      setMonthlySummary({ workDurationTotal: 0, count: 0, payTotal: 0 });
    }
  }, [user?.membId]);

  useEffect(() => {
    fetchWorkCounts();
    fetchSettlementCounts();
    fetchRecentItems();
    fetchMonthlySummary();
  }, [fetchWorkCounts, fetchSettlementCounts, fetchRecentItems, fetchMonthlySummary]);

  const handleRowClick = useCallback((item) => {
    const pathFn = DETAIL_PATHS[item._type];
    if (pathFn && item.servCd) navigate(pathFn(item.servCd));
  }, [navigate]);

  const isWorkStartDisabled = useCallback((item) => {
    if (!item) return false;
    if (item.assignRole === 'CHECKER') return isReviewStartBlockedStatus(item.fileStatus);
    return false;
  }, []);

  const handleStartWork = useCallback((item) => {
    if (isWorkStartDisabled(item)) return;
    const { projectFileId, fileNo, servCd, assignRole, isSplit, startSec, endSec, playTm, fileStatus } = item;
    if (!projectFileId || !fileNo || !servCd) return;
    const isWorkerReadOnly = assignRole !== 'CHECKER' && isWorkStartBlockedStatus(fileStatus);
    const role = assignRole === 'CHECKER' ? 'START_REVIEW' : 'START';
    let path = `/worktool/${projectFileId}/${fileNo}/${servCd}?role=${role}&isSplit=${!!isSplit}`;
    if (isSplit) path += `&start_sec=${startSec}&end_sec=${endSec}`;
    const duration = isSplit ? (endSec - startSec) : playTm;
    if (duration) path += `&play_tm=${duration}`;
    if (isWorkerReadOnly) path += '&readonly=true';
    path += '&popup=true';
    const workCategory = item._type === 'translate' ? 'translation' : item._type;
    if (['vod', 'meeting', 'record', 'translation'].includes(workCategory)) {
      path += `&workCategory=${workCategory}`;
    }
    window.open(toAppUrl(path), `worktool_${projectFileId}`, 'popup,width=1400,height=900');
  }, [isWorkStartDisabled]);

  return (
    <div className="dashboard-tab">
      {/* 인사 헤더 */}
      <div className="dash-header">
        <h2 className="dash-greeting">
          {t('soribaro:mypage.dashboardWelcome', { name: user?.membNm || '' })}
        </h2>
        <p className="dash-header-sub">
          {user?.membId}
          <span className="dash-meta-dot">·</span>
          {isAdmin()
            ? t('soribaro:mypage.dashboardRoleAdmin')
            : t('soribaro:mypage.dashboardRoleWorker')}
          <span className="dash-meta-dot">·</span>
          {formatDateWithT(new Date(), t)}
        </p>
      </div>

      {/* 이번달 작업 요약 */}
      <section className="dash-section">
        <h3 className="dash-section-title">
          {t('soribaro:mypage.dashboardMonthlySummaryTitle')}
          <span className="dash-month-badge">
            {t('soribaro:mypage.dashboardMonthlySummaryMonth', {
              year: new Date().getFullYear(),
              month: new Date().getMonth() + 1,
            })}
          </span>
        </h3>
        <div className="dash-stat-grid">
          <div className="dash-stat-card">
            <span className="dash-stat-label">{t('soribaro:mypage.dashboardMonthlyWorkTime')}</span>
            <span className="dash-stat-value">
              {monthlySummary === null
                ? <span className="dash-count-loading" />
                : formatWorkMinutes(monthlySummary.workDurationTotal, t)}
            </span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">{t('soribaro:mypage.dashboardMonthlyWorkCount')}</span>
            <span className="dash-stat-value">
              {monthlySummary === null
                ? <span className="dash-count-loading" />
                : t('soribaro:mypage.dashboardCountUnit', { count: monthlySummary.count })}
            </span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">{t('soribaro:mypage.dashboardMonthlyPay')}</span>
            <span className="dash-stat-value">
              {monthlySummary === null
                ? <span className="dash-count-loading" />
                : t('soribaro:mypage.dashboardPayUnit', { amount: Number(monthlySummary.payTotal).toLocaleString() })}
            </span>
          </div>
        </div>
      </section>

      {/* 관리자 전용: 빠른 관리 */}
      {isAdmin() && (
        <section className="dash-section">
          <h3 className="dash-section-title">{t('soribaro:mypage.dashboardQuickAccess')}</h3>
          <div className="dash-quick-grid">
            {ADMIN_LINKS.map(({ path, labelKey, icon: Icon }) => (
              <button key={path} className="dash-quick-item" onClick={() => navigate(path)}>
                <Icon size={15} strokeWidth={1.75} />
                <span>{t(`common:sidebar.${labelKey}`)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 작업 현황 + 정산 요약 (2열) */}
      <div className="dash-two-col">
        <section className="dash-section">
          <h3 className="dash-section-title">{t('soribaro:mypage.dashboardWorkOverview')}</h3>
          <div className="dash-list">
            {WORK_TYPES.map((key) => (
              <div key={key} className="dash-list-item" onClick={() => onTabChange?.('STANDBY')}>
                <span className="dash-dot" />
                <span className="dash-list-label">{t(`soribaro:mypage.dashboardWork_${key}`)}</span>
                <span className="dash-list-count">
                  {workCounts[key] === null
                    ? <span className="dash-count-loading" />
                    : workCounts[key].toLocaleString()
                  }
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-section">
          <h3 className="dash-section-title">{t('soribaro:mypage.dashboardSettlementOverview')}</h3>
        <div className="dash-list">
          {SETTLEMENT_STATUSES.map((key) => (
            <div key={key} className="dash-list-item" onClick={() => navigate('/soribaro/manage/settlement')}>
              <span className="dash-dot" />
              <span className="dash-list-label">{t(`soribaro:mypage.dashboardSettlement_${key}`)}</span>
              <span className="dash-list-count">
                {settlementCounts[key] === null
                  ? <span className="dash-count-loading" />
                  : settlementCounts[key].toLocaleString()
                }
              </span>
            </div>
          ))}
        </div>
        </section>
      </div>

      {/* 최근 작업 */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h3 className="dash-section-title">{t('soribaro:mypage.dashboardRecentWork')}</h3>
          <button className="dash-view-all" onClick={() => onTabChange?.('STANDBY')}>
            {t('soribaro:mypage.dashboardViewAll')}
          </button>
        </div>

        {recentLoading ? (
          <p className="dash-empty">{t('soribaro:mypage.dashboardLoading')}</p>
        ) : recentItems.length === 0 ? (
          <p className="dash-empty">{t('soribaro:mypage.noAssignedProjects')}</p>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>{t('soribaro:mypage.columnProjectName')}</th>
                <th>{t('soribaro:mypage.columnFileName')}</th>
                <th style={{ width: 120 }}>{t('soribaro:mypage.columnServiceTitle')}</th>
                <th style={{ width: 130 }}>{t('soribaro:mypage.columnServiceCode')}</th>
                <th style={{ width: 70, textAlign: 'center' }}>{t('soribaro:mypage.columnFileNo')}</th>
                <th style={{ width: 80, textAlign: 'center' }}>{t('soribaro:mypage.columnFileStatus')}</th>
                <th style={{ width: 80, textAlign: 'center' }}>{t('soribaro:mypage.columnAssignRole')}</th>
                <th style={{ width: 100, textAlign: 'center' }}>{t('soribaro:mypage.columnSplitRange')}</th>
                <th style={{ width: 130 }}>{t('soribaro:mypage.columnRegistrationDate')}</th>
                <th style={{ width: 130 }}>{t('soribaro:mypage.columnUpdatedAt')}</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {recentItems.map((item) => (
                <tr key={item.projectFileId || `${item.servCd}-${item.fileNo}`} onDoubleClick={() => handleRowClick(item)}>
                  <td title={item.projectTitle}>
                    <div className="cell-project-inner">
                      <span className="cell-project-name">{item.projectTitle || '-'}</span>
                      {(item.commentCnt > 0 || item.reviewTagCnt > 0) && (
                        <span className="cell-badges">
                          {item.commentCnt > 0 && (
                            <span className="cell-badge cell-badge-comment" title={t('soribaro:mypage.commentCount')}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              {item.commentCnt}
                            </span>
                          )}
                          {item.reviewTagCnt > 0 && (
                            <span className="cell-badge cell-badge-tag" title={t('soribaro:mypage.reviewTagCount')}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                <line x1="7" y1="7" x2="7.01" y2="7" />
                              </svg>
                              {item.reviewTagCnt}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td title={item.fileName}>{item.fileName || '-'}</td>
                  <td title={item.servTitle}>{item.servTitle || '-'}</td>
                  <td>{item.servCd || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{item.fileNo ?? '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`status-badge status-file-${item.fileStatus?.toLowerCase()}`}>
                      {item.fileStatus ? t(`common.status_${item.fileStatus}`) : '-'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`role-badge role-${item.assignRole?.toLowerCase()}`}>
                      {item.assignRole ? t(`soribaro:mypage.assignRole_${item.assignRole}`) : '-'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{formatWorkTime(item)}</td>
                  <td>{formatDateFull(item.createdAt)}</td>
                  <td>{formatDateFull(item.updatedAt)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-action-detail" onClick={() => handleRowClick(item)}>{t('soribaro:mypage.buttonViewDetail')}</button>
                      <button className="btn-action-work" onClick={() => handleStartWork(item)} disabled={isWorkStartDisabled(item)}>{t('soribaro:mypage.buttonStartWork')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
