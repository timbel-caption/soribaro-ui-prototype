import { useState, useEffect, useCallback, useMemo } from 'react';
import DepreciationTableTab from './depreciation/DepreciationTableTab';
import { getDepreciationTables } from '../../../api/v9/depreciationTables';
import { useCommonCodeStore } from '../../../stores/commonCodeStore';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './ManagePricingPage.css';

export default function ManageDepreciationPage() {
  const { t } = useTranslation('soribaro');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [depreciationTables, setDepreciationTables] = useState([]);

  const bssTypeOptions = useCommonCodeStore((s) => s.codes['BSS_TYPE'] || []);
  const fetchCode = useCommonCodeStore((s) => s.fetchCode);

  const refreshBssTypeOptions = useCallback(async () => {
    await fetchCode('BSS_TYPE');
  }, [fetchCode]);

  const refreshDepreciationTables = useCallback(async () => {
    try {
      const res = await getDepreciationTables();
      if (res.status === 'SUCCESS') setDepreciationTables(res.data || []);
    } catch (err) {
      console.error('DepreciationTables refresh error:', err);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDepreciationTables();
      if (res.status === 'SUCCESS') setDepreciationTables(res.data || []);
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
      console.error('Depreciation data load error:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  if (loading) {
    return (
      <div className="notion-page manage-pricing-page">
        <div className="loading-center">
          <span className="spinner" />
          <span>{t('manage.common.loadingData')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-page manage-pricing-page">
      <div className="page-header">
        <h1 className="page-title">{t('manage.depreciation.pageTitle')}</h1>
        <p className="page-description">{t('manage.depreciation.pageDescription')}</p>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      <div className="pricing-tab-panel" role="tabpanel">
        <DepreciationTableTab
          depreciationTables={depreciationTables}
          refreshDepreciationTables={refreshDepreciationTables}
          bssTypeOptions={bssTypeOptions}
          refreshBssTypeOptions={refreshBssTypeOptions}
        />
      </div>
    </div>
  );
}
