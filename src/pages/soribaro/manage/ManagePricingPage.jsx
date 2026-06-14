import { useState, useEffect, useCallback, useMemo } from 'react';
import PriceTableTab from './pricing/PriceTableTab';
import ReviewTagTab from './evaluation/ReviewTagTab';
import { getPriceTables } from '../../../api/v9/priceTables';
import { getFileDifficulties } from '../../../api/v9/fileDifficulties';
import { getAllReviewTags } from '../../../api/v9/reviewTags';
import { getAllReviewTagGroups } from '../../../api/v9/reviewTagGroups';
import { useCommonCodeStore } from '../../../stores/commonCodeStore';
import { useTranslation } from 'react-i18next';
import '../../../styles/notion-list.css';
import './ManagePricingPage.css';

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return (
    <div className="pricing-tab-panel" role="tabpanel">
      {children}
    </div>
  );
}

export default function ManagePricingPage() {
  const { t } = useTranslation('soribaro');
  const [tabIndex, setTabIndex] = useState(0);

  const TABS = useMemo(() => [
    { key: 0, label: t('manage.pricing.tabPriceTable') },
    { key: 1, label: t('manage.pricing.tabReviewTag') },
  ], [t]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // API 데이터 상태
  const [priceTables, setPriceTables] = useState([]);
  const [fileDifficulties, setFileDifficulties] = useState([]);
  const [reviewTags, setReviewTags] = useState([]);
  const [groups, setGroups] = useState([]);

  // BSS_TYPE 공통코드 (의뢰유형) — codes 데이터를 직접 구독하여 반응형으로 갱신
  const bssTypeOptions = useCommonCodeStore((s) => s.codes['BSS_TYPE'] || []);
  const fetchCode = useCommonCodeStore((s) => s.fetchCode);

  // BSS_TYPE 공통코드 갱신 (의뢰유형 추가/삭제 후 호출)
  const refreshBssTypeOptions = useCallback(async () => {
    await fetchCode('BSS_TYPE');
  }, [fetchCode]);

  // 초기 데이터 로드
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ptRes, fdRes, tagsRes, groupsRes] = await Promise.all([
        getPriceTables(),
        getFileDifficulties(),
        getAllReviewTags(),
        getAllReviewTagGroups(),
      ]);

      if (ptRes.status === 'SUCCESS') setPriceTables(ptRes.data || []);
      if (fdRes.status === 'SUCCESS') setFileDifficulties(fdRes.data || []);
      if (tagsRes.status === 'SUCCESS') setReviewTags(tagsRes.data || []);
      if (groupsRes.status === 'SUCCESS') setGroups(groupsRes.data || []);
    } catch (err) {
      setError(err.message || t('manage.common.failedToLoadData'));
      console.error('Pricing data load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // 단가표 목록 갱신
  const refreshPriceTables = useCallback(async () => {
    try {
      const res = await getPriceTables();
      if (res.status === 'SUCCESS') setPriceTables(res.data || []);
    } catch (err) {
      console.error('PriceTables refresh error:', err);
    }
  }, []);

  // 파일 난이도 목록 갱신
  const refreshFileDifficulties = useCallback(async () => {
    try {
      const res = await getFileDifficulties();
      if (res.status === 'SUCCESS') setFileDifficulties(res.data || []);
    } catch (err) {
      console.error('FileDifficulties refresh error:', err);
    }
  }, []);

  // 검수 태그 목록 갱신
  const refreshReviewTags = useCallback(async () => {
    try {
      const res = await getAllReviewTags();
      if (res.status === 'SUCCESS') setReviewTags(res.data || []);
    } catch (err) {
      console.error('ReviewTags refresh error:', err);
    }
  }, []);

  // 검수 태그 그룹 목록 갱신
  const refreshGroups = useCallback(async () => {
    try {
      const res = await getAllReviewTagGroups();
      if (res.status === 'SUCCESS') setGroups(res.data || []);
    } catch (err) {
      console.error('ReviewTagGroups refresh error:', err);
    }
  }, []);

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
        <h1 className="page-title">{t('manage.pricing.pageTitle')}</h1>
        <p className="page-description">{t('manage.pricing.pageDescription')}</p>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="pricing-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`pricing-tab ${tabIndex === tab.key ? 'active' : ''}`}
            onClick={() => setTabIndex(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 패널 */}
      <TabPanel value={tabIndex} index={0}>
        <PriceTableTab
          priceTables={priceTables}
          refreshPriceTables={refreshPriceTables}
          fileDifficulties={fileDifficulties}
          refreshFileDifficulties={refreshFileDifficulties}
          bssTypeOptions={bssTypeOptions}
          refreshBssTypeOptions={refreshBssTypeOptions}
        />
      </TabPanel>
      <TabPanel value={tabIndex} index={1}>
        <ReviewTagTab
          reviewTags={reviewTags}
          refreshReviewTags={refreshReviewTags}
          groups={groups}
          refreshGroups={refreshGroups}
        />
      </TabPanel>
    </div>
  );
}
