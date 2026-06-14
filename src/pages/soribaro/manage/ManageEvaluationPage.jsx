import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EvaluationStatusTab from './evaluation/EvaluationStatusTab';
import WorkerLevelTab from './pricing/WorkerLevelTab';
import ReviewTargetTab from './evaluation/ReviewTargetTab';
import ScheduleListTab from './evaluation/ScheduleListTab';
import { getWorkerLevels } from '../../../api/v9/workerLevels';
import { getPriceTables } from '../../../api/v9/priceTables';
import '../../../styles/notion-list.css';
import './ManageEvaluationPage.css';

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return (
    <div className="evaluation-tab-panel" role="tabpanel">
      {children}
    </div>
  );
}

export default function ManageEvaluationPage() {
  const { t } = useTranslation('soribaro');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabIndex, setTabIndex] = useState(() => {
    const tab = Number(searchParams.get('tab'));
    return Number.isFinite(tab) && tab >= 0 && tab <= 4 ? tab : 0;
  });

  const handleTabChange = useCallback((index) => {
    setTabIndex(index);
    setSearchParams({ tab: String(index) }, { replace: true });
  }, [setSearchParams]);

  const TABS = useMemo(() => [
    { key: 0, label: t('manage.evaluation.tabEvaluationStatus') },
    { key: 1, label: t('manage.evaluation.tabWorkerLevel') },
    { key: 2, label: t('manage.evaluation.tabReviewTarget') },
    { key: 3, label: t('manage.evaluation.tabPromotionTarget') },
    { key: 4, label: t('manage.evaluation.tabDemotionTarget') },
  ], [t]);

  const [workerLevels, setWorkerLevels] = useState([]);
  const [priceTables, setPriceTables] = useState([]);

  const fetchWorkerLevelData = useCallback(async () => {
    try {
      const [wlRes, ptRes] = await Promise.all([
        getWorkerLevels(),
        getPriceTables(),
      ]);
      if (wlRes.status === 'SUCCESS') setWorkerLevels(wlRes.data || []);
      if (ptRes.status === 'SUCCESS') setPriceTables(ptRes.data || []);
    } catch (err) {
      console.error('WorkerLevel data load error:', err);
    }
  }, []);

  useEffect(() => {
    fetchWorkerLevelData();
  }, [fetchWorkerLevelData]);

  const refreshWorkerLevels = useCallback(async () => {
    try {
      const res = await getWorkerLevels();
      if (res.status === 'SUCCESS') setWorkerLevels(res.data || []);
    } catch (err) {
      console.error('WorkerLevels refresh error:', err);
    }
  }, []);

  return (
    <div className="notion-page manage-evaluation-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('manage.evaluation.pageTitle')}</h1>
          <p className="page-description">{t('manage.evaluation.pageDescription')}</p>
        </div>
      </div>

      <div className="evaluation-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`evaluation-tab ${tabIndex === tab.key ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <TabPanel value={tabIndex} index={0}>
        <EvaluationStatusTab />
      </TabPanel>
      <TabPanel value={tabIndex} index={1}>
        <WorkerLevelTab
          workerLevels={workerLevels}
          refreshWorkerLevels={refreshWorkerLevels}
          priceTables={priceTables}
        />
      </TabPanel>
      <TabPanel value={tabIndex} index={2}>
        <ReviewTargetTab />
      </TabPanel>
      <TabPanel value={tabIndex} index={3}>
        <ScheduleListTab isPromote={true} />
      </TabPanel>
      <TabPanel value={tabIndex} index={4}>
        <ScheduleListTab isPromote={false} />
      </TabPanel>
    </div>
  );
}
