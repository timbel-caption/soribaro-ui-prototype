import { useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserStore } from '../../../stores/userStore';
import { useTranslation } from 'react-i18next';
import DashboardTab from './DashboardTab';
import { ProjectFilterBar, ProjectSections, SettlementTab, getDefaultDateRange } from './WorkerTabs';
import PROJECT_STATUSES from '../../../constants/projectStatus.json';
import '../../../styles/notion-list.css';
import './MyPage.css';

const HIDDEN_TAB_STATUSES = ['READONLY'];
const STATUS_KEYS = PROJECT_STATUSES.map((s) => s.status).filter((s) => !HIDDEN_TAB_STATUSES.includes(s));
const VALID_TABS = ['dashboard', ...STATUS_KEYS, 'settlement'];
const TAB_FALLBACK = { READONLY: 'REVIEW_DONE' };

export default function MyPage() {
  const { t } = useTranslation('soribaro');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useUserStore((state) => state.user);
  const isAdmin = useUserStore((state) => state.isAdmin);

  const TABS = useMemo(() => [
    { key: 'dashboard', label: t('mypage.tabDashboard') },
    ...PROJECT_STATUSES
      .filter((s) => !HIDDEN_TAB_STATUSES.includes(s.status))
      .map((s) => ({ key: s.status, label: t(`common.status_${s.status}`) })),
    { key: 'settlement', label: t('mypage.tabSettlement') },
  ], [t]);

  const SEARCH_FIELDS = useMemo(() => [
    { value: 'title', label: t('mypage.searchFieldProjectName') },
    { value: 'servCd', label: t('mypage.searchFieldServiceCode') },
  ], [t]);

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    if (VALID_TABS.includes(tab)) return tab;
    if (TAB_FALLBACK[tab]) return TAB_FALLBACK[tab];
    return 'dashboard';
  });
  const [role, setRole] = useState('worker');
  const [searchTrigger, setSearchTrigger] = useState(0);

  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [filters, setFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    searchField: 'title',
    searchText: '',
  });

  const handleTabChange = useCallback((tabKey) => {
    setActiveTab(tabKey);
    setSearchParams(tabKey === 'dashboard' ? {} : { tab: tabKey }, { replace: true });
  }, [setSearchParams]);

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSearch = useCallback(() => {
    setSearchTrigger((prev) => prev + 1);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleReset = useCallback(() => {
    const range = getDefaultDateRange();
    setFilters({ startDate: range.startDate, endDate: range.endDate, searchField: 'title', searchText: '' });
    setSearchTrigger((prev) => prev + 1);
  }, []);

  const showProjectTabs = STATUS_KEYS.includes(activeTab);

  return (
    <div className="notion-page mypage">
      <div className="page-header">
        <h1 className="page-title">{t('mypage.pageTitle')}</h1>
        <p className="page-description">{t('mypage.pageDescription')}</p>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mypage-content">
        {activeTab === 'dashboard' && (
          <DashboardTab onTabChange={handleTabChange} />
        )}

        {showProjectTabs && (
          <>
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
              filters={filters}
              searchFields={SEARCH_FIELDS}
              onFilterChange={handleFilterChange}
              onSearch={handleSearch}
              onReset={handleReset}
              onKeyDown={handleKeyDown}
              t={t}
            />
            <ProjectSections
              status={activeTab}
              role={role}
              filters={filters}
              searchTrigger={searchTrigger}
              t={t}
              navigate={navigate}
            />
          </>
        )}

        {activeTab === 'settlement' && (
          <SettlementTab workerId={user?.membId} t={t} />
        )}
      </div>
    </div>
  );
}
