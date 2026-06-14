import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageParams } from '../../../hooks/usePageParams';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { getTranslates, getTranslateReqDtl, getEnterpriseList } from '../../../api/v9';
import { useCommonCodeStore } from '../../../stores/commonCodeStore';
import serviceStatuses from '../../../constants/serviceStatus.json';
import PROJECT_STATUSES from '../../../constants/projectStatus.json';
import { getProjectStatusChipSx } from '../../../utils/projectStatusUtils';
import WorkStatusChipWithOverlay from '../../../components/common/WorkStatusChipWithOverlay';
import RequestRegisterModal from '../../../components/common/RequestRegisterModal';
import { useTranslation } from 'react-i18next';
import { getLanguageNameByLegacyCode } from '../../../utils/languageUtils';
import '../../../styles/notion-list.css';
import './TranslationWorkPage.css';

// ag-grid 모듈 등록
ModuleRegistry.registerModules([AllCommunityModule]);

// 날짜 문자열 파싱 (여러 형식 지원)
// - "2026-02-10 10:26:33.0" (API 반환 형식)
// - "20260210102633" (yyyyMMddHHmmss 압축 형식)
const parseDateString = (str) => {
  if (!str) return null;
  const trimmed = str.trim();

  // "YYYY-MM-DD HH:MM:SS" 계열 (구분자 포함)
  if (trimmed.includes('-')) {
    const date = new Date(trimmed.replace(' ', 'T'));
    return isNaN(date.getTime()) ? null : date;
  }

  // yyyyMMddHHmmss 압축 형식
  if (trimmed.length >= 14) {
    const y = trimmed.substring(0, 4);
    const m = trimmed.substring(4, 6);
    const d = trimmed.substring(6, 8);
    const h = trimmed.substring(8, 10);
    const mi = trimmed.substring(10, 12);
    const s = trimmed.substring(12, 14);
    return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}`);
  }

  return null;
};

const formatDateFull = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateString(dateString);
  if (!date || isNaN(date.getTime())) return dateString;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// 검색 구분 옵션 (API searchType 파라미터와 일치)
const SEARCH_FIELDS = [
  { value: 'title', labelKey: 'translation.workPage.searchFields.title' },
  { value: 'servCd', labelKey: 'translation.workPage.searchFields.serviceCode' },
  { value: 'memberName', labelKey: 'translation.workPage.searchFields.requesterName' },
  { value: 'phone', labelKey: 'translation.workPage.searchFields.phone' },
  { value: 'workerName', labelKey: 'translation.workPage.searchFields.workerName' },
];

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
};

// 상태별 Chip 색상 설정
const STATUS_CHIP_COLORS = {
  '1': { bg: '#fff8e1', color: '#f57c00', border: '#ffb74d' },
  '2': { bg: '#e3f2fd', color: '#1976d2', border: '#64b5f6' },
  '3': { bg: '#f3e5f5', color: '#7b1fa2', border: '#ba68c8' },
  '4': { bg: '#e8f5e9', color: '#388e3c', border: '#81c784' },
  '5': { bg: '#e0f7fa', color: '#0097a7', border: '#4dd0e1' },
};

// 취소 여부 셀 렌더러
const CancelCellRenderer = (params) => {
  const { t } = useTranslation('soribaro');
  const isCanceled = params.value === 'Y';
  if (!isCanceled) return <span className="cancel-badge">-</span>;
  return <span className="cancel-badge cancel-yes">{t('translation.workPage.cancelBadge')}</span>;
};

// 오른쪽 상세 패널 컴포넌트
const DetailSidePanel = ({ selectedItem, detailData, detailLoading, detailError, getLangLabel }) => {
  const { t } = useTranslation('soribaro');

  const groupedByFile = useMemo(() => {
    if (!detailData || detailData.length === 0) return {};
    return detailData.reduce((acc, item) => {
      const key = item.fileNm || t('translation.workPage.detailPanel.noFileName');
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [detailData]);

  if (!selectedItem) {
    return (
      <div className="detail-side-panel detail-side-empty">
        <div className="empty-icon">📋</div>
        <p>{t('translation.workPage.detailPanel.emptyMessage').split('\n').map((line, i) => (
          <span key={i}>{line}{i === 0 && <br />}</span>
        ))}</p>
      </div>
    );
  }

  const fileNames = Object.keys(groupedByFile);

  return (
    <div className="detail-side-panel">
      <div className="detail-side-header">
        <h3>{selectedItem.servTitle}</h3>
        <span className="serv-cd">{selectedItem.servCd}</span>
      </div>

      <div className="detail-side-actions">
        <Link to={`/soribaro/translation/work/${selectedItem.servCd}`}>
          <Button
            variant="contained"
            size="small"
            fullWidth
            sx={{
              fontSize: '13px',
              textTransform: 'none',
            }}
          >
            {t('translation.workPage.detailPanel.viewDetail')}
          </Button>
        </Link>
      </div>

      <div className="detail-side-content">
        {detailLoading && (
          <div className="detail-loading-state">
            <CircularProgress size={24} />
            <span>{t('translation.workPage.detailPanel.loadingDetail')}</span>
          </div>
        )}

        {detailError && (
          <div className="detail-error-state">
            ⚠️ {detailError}
          </div>
        )}

        {!detailLoading && !detailError && fileNames.length === 0 && (
          <div className="detail-empty-state">
            📂 {t('translation.workPage.detailPanel.noDetail')}
          </div>
        )}

        {!detailLoading && !detailError && fileNames.length > 0 && (
          <div className="detail-files-list">
            {fileNames.map((fileNm, index) => {
              const items = groupedByFile[fileNm];
              return (
                <div key={fileNm} className="detail-file-item">
                  <div className="file-header">
                    <span className="file-ord">{index + 1}.</span>
                    <span className="file-name">{fileNm}</span>
                  </div>
                  <table className="file-status-table">
                    <thead>
                      <tr>
                        <th>{t('translation.workPage.detailPanel.translationType')}</th>
                        <th>{t('translation.workPage.detailPanel.translationLang')}</th>
                        <th>{t('translation.workPage.detailPanel.worker')}</th>
                        <th>{t('translation.workPage.detailPanel.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items
                        .slice()
                        .sort((a, b) => a.reqSeq - b.reqSeq)
                        .map((dtl) => (
                        <tr key={dtl.reqSeq}>
                          <td>
                            {dtl.startLangYn === 'Y' ? (
                              <Chip
                                label={t('translation.workPage.detailPanel.startLang')}
                                size="small"
                                variant="outlined"
                                sx={{
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  borderColor: '#64b5f6',
                                  fontWeight: 500,
                                  fontSize: '11px',
                                  height: '22px',
                                }}
                              />
                            ) : dtl.midLangYn === 'Y' ? (
                              <Chip
                                label={t('translation.workPage.detailPanel.midLang')}
                                size="small"
                                variant="outlined"
                                sx={{
                                  backgroundColor: '#fff3e0',
                                  color: '#f57c00',
                                  borderColor: '#ffcc80',
                                  fontWeight: 500,
                                  fontSize: '11px',
                                  height: '22px',
                                }}
                              />
                            ) : (
                              <Chip
                                label={t('translation.workPage.detailPanel.targetLang')}
                                size="small"
                                variant="outlined"
                                sx={{
                                  backgroundColor: '#e8f5e9',
                                  color: '#388e3c',
                                  borderColor: '#a5d6a7',
                                  fontWeight: 500,
                                  fontSize: '11px',
                                  height: '22px',
                                }}
                              />
                            )}
                          </td>
                          <td>{getLangLabel(dtl.trnsLangCd)}</td>
                          <td>{dtl.workerNm || t('translation.workPage.detailPanel.unassigned')}</td>
                          <td>
                            {(() => {
                              const info = PROJECT_STATUSES.find((s) => s.status === dtl.projectFileStatus);
                              if (!info) return dtl.projectFileStatus || '-';
                              return (
                                <Chip
                                  label={t(`common.status_${info.status}`)}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    ...getProjectStatusChipSx(info.status),
                                    fontWeight: 500,
                                    fontSize: '11px',
                                    height: '22px',
                                  }}
                                />
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default function TranslationWorkPage() {
  const { t } = useTranslation('soribaro');
  const gridRef = useRef(null);
  const navigate = useNavigate();

  // commonCodeStore
  const getCodeLabel = useCommonCodeStore((s) => s.getCodeLabel);
  const getCodesByGroup = useCommonCodeStore((s) => s.getCodesByGroup);
  /**
   * 작업상태 코드 → 라벨 변환 (fallback 포함)
   * value가 "0"이면 "0"으로 검색, 없으면 "00"으로 검색
   * value가 "1"이면 "1"로 검색, 없으면 "01"로 검색
   */
  const getWorkStatLabel = useCallback((value) => {
    if (value == null || value === '') return '-';
    const codes = getCodesByGroup('WORK_STATUS');
    const strVal = String(value);
    // 1) 원본 값으로 검색
    const found = codes.find((c) => c.dtlCd === strVal);
    if (found) return found.dtlCdNm;
    // 2) fallback: 앞에 0을 붙여서 검색 (예: "1" → "01")
    const padded = strVal.padStart(2, '0');
    const foundPadded = codes.find((c) => c.dtlCd === padded);
    if (foundPadded) return foundPadded.dtlCdNm;
    return strVal;
  }, [getCodesByGroup]);

  // 언어 코드 라벨 헬퍼 (i18n 대응)
  const getLangLabel = useCallback(
    (langCd) => {
      const i18nName = getLanguageNameByLegacyCode(langCd);
      if (i18nName && i18nName !== langCd) return i18nName;
      return getCodeLabel('TRNS_LANG_CD', langCd);
    },
    [getCodeLabel],
  );

  // 상태 관리
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [enterprises, setEnterprises] = useState([]);

  useEffect(() => {
    const fetchEnterprises = async () => {
      try {
        const res = await getEnterpriseList({ page: 0, size: 1000 });
        if (res?.status === 'SUCCESS') {
          setEnterprises(res.data?.content || []);
        }
      } catch {
        // silent
      }
    };
    fetchEnterprises();
  }, []);

  // 오른쪽 패널용 상태
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // 페이지네이션 상태 (API는 0-based page)
  const { page: urlPage, size: urlSize, setPageParams } = usePageParams();
  const [pagination, setPagination] = useState({
    page: urlPage,
    size: urlSize,
    totalElements: 0,
    totalPages: 0,
  });

  const defaultRange = useMemo(() => getDefaultDateRange(), []);

  // 검색 필터 상태
  const [filters, setFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    overallStatus: '',
    cnlYn: '',
    company: '',
    searchField: 'title',
    searchText: '',
  });

  const WorkStatusCellRenderer = useCallback((params) => {
    return <WorkStatusChipWithOverlay overallStatus={params.data?.overallStatus} servCd={params.data?.servCd} />;
  }, []);

  // 컬럼 정의
  const columnDefs = useMemo(() => [
    {
      field: 'servCd',
      headerName: t('translation.workPage.columns.servCd'),
      width: 150,
    },
    {
      field: 'servTitle',
      headerName: t('translation.workPage.columns.servTitle'),
      flex: 1,
      minWidth: 200,
      tooltipField: 'servTitle',
    },
    {
      field: 'membNm',
      headerName: t('translation.workPage.columns.membNm'),
      width: 120,
    },
    {
      field: 'entNm',
      headerName: t('translation.workPage.columns.entNm'),
      width: 140,
      tooltipField: 'entNm',
    },
    {
      field: 'totalPlayTm',
      headerName: t('translation.workPage.columns.totalPlayTm'),
      width: 100,
      cellClass: 'text-center',
    },
    {
      field: 'overallStatus',
      headerName: t('translation.workPage.columns.workStat'),
      width: 140,
      cellRenderer: WorkStatusCellRenderer,
      cellClass: 'text-center',
    },
    {
      field: 'regDttm',
      headerName: t('translation.workPage.columns.regDttm'),
      width: 140,
      valueFormatter: (params) => formatDateFull(params.value),
    },
    {
      field: 'cnlYn',
      headerName: t('translation.workPage.columns.cnlYn'),
      width: 80,
      cellRenderer: CancelCellRenderer,
      cellClass: 'text-center',
    },
  ], [WorkStatusCellRenderer, t]);

  // 기본 컬럼 설정
  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  // 데이터 조회
  const fetchData = useCallback(async (page = 0) => {
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    setDetailData(null);
    setDetailError(null);

    try {
      // 검색 파라미터 구성
      const params = {
        page,
        size: pagination.size,
        startDate: filters.startDate,
        endDate: filters.endDate,
        ...(filters.overallStatus && { overallStatus: filters.overallStatus }),
        ...(filters.cnlYn && { cnlYn: filters.cnlYn }),
        ...(filters.company && { company: filters.company }),
        ...(filters.searchText && { searchType: filters.searchField, searchText: filters.searchText }),
      };

      const response = await getTranslates(params);

      if (response.status === 'SUCCESS') {
        const data = response.data;
        setRowData(data.content || []);
        setPagination((prev) => ({
          ...prev,
          page: data.page,
          totalElements: data.totalElements,
          totalPages: data.totalPages,
        }));
      } else {
        setError(response.message || t('common.loadDataFailed'));
      }
    } catch (err) {
      setError(err.message || t('common.loadDataFailed'));
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.size]);

  // 아이템 선택 및 상세 데이터 조회
  const selectItem = useCallback(async (item) => {
    if (selectedItem?.servCd === item.servCd) {
      return;
    }

    setSelectedItem(item);
    setDetailLoading(true);
    setDetailData(null);
    setDetailError(null);

    try {
      const response = await getTranslateReqDtl(item.servCd);

      if (response.status === 'SUCCESS') {
        setDetailData(response.data || []);
      } else {
        setDetailError(response.message || t('translation.workPage.detailPanel.failedToLoadDetail'));
      }
    } catch (err) {
      setDetailError(err.message || t('translation.workPage.detailPanel.failedToLoadDetail'));
    } finally {
      setDetailLoading(false);
    }
  }, [selectedItem?.servCd]);

  // 행 클릭 - 오른쪽 패널에 상세 정보 표시
  const handleRowClicked = useCallback((event) => {
    selectItem(event.data);
  }, [selectItem]);

  // 행 더블클릭 - 상세보기 페이지로 이동
  const handleRowDoubleClicked = useCallback((event) => {
    navigate(`/soribaro/translation/work/${event.data.servCd}`);
  }, [navigate]);

  // 검색 실행
  const handleSearch = useCallback(() => {
    setPageParams(0, pagination.size);
    fetchData(0);
  }, [fetchData, setPageParams, pagination.size]);

  // 페이지 변경 (display는 1-based, API는 0-based)
  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 0 && newPage < pagination.totalPages) {
      setPageParams(newPage, pagination.size);
      fetchData(newPage);
    }
  }, [fetchData, pagination.totalPages, pagination.size, setPageParams]);

  // 페이지 사이즈 변경
  const handlePageSizeChange = useCallback((e) => {
    const newSize = Number(e.target.value);
    setPageParams(0, newSize);
    setPagination((prev) => ({ ...prev, size: newSize, page: 0 }));
  }, [setPageParams]);

  // 페이지 사이즈 변경 시 데이터 재조회
  const prevSizeRef = useRef(pagination.size);
  useEffect(() => {
    if (prevSizeRef.current !== pagination.size && rowData.length > 0) {
      fetchData(0);
    }
    prevSizeRef.current = pagination.size;
  }, [pagination.size, fetchData, rowData.length]);

  // 필터 변경
  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  // 엔터키 검색
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  // 초기화
  const handleReset = useCallback(() => {
    const range = getDefaultDateRange();
    setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      overallStatus: '',
      cnlYn: '',
      company: '',
      searchField: 'title',
      searchText: '',
    });
    setRowData([]);
    setSelectedItem(null);
    setDetailData(null);
    setDetailError(null);
    setPagination((prev) => ({ ...prev, page: 0, totalElements: 0, totalPages: 0 }));
  }, []);

  // 그리드 준비 완료
  const onGridReady = useCallback(() => {
    fetchData(pagination.page);
  }, [fetchData, pagination.page]);

  // 행 ID 가져오기
  const getRowId = useCallback((params) => {
    return params.data.servCd;
  }, []);

  // 행 클래스 설정 (취소된 항목 disable)
  const getRowClass = useCallback((params) => {
    if (params.data?.cnlYn === 'Y') {
      return 'row-disabled';
    }
    return '';
  }, []);

  // 의뢰 등록 모달
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const openRegisterModal = useCallback(() => setRegisterModalOpen(true), []);
  const closeRegisterModal = useCallback(() => setRegisterModalOpen(false), []);
  const handleRegisterSubmit = useCallback((result) => {
    console.log('의뢰 등록 완료:', result);
    fetchData(0);
  }, [fetchData]);

  // 표시용 현재 페이지 (1-based)
  const displayPage = pagination.page + 1;

  return (
    <div className="notion-page translation-work-page">
      <div className="page-header">
        <h1 className="page-title">{t('translation.workPage.pageTitle')}</h1>
        <p className="page-description">{t('translation.workPage.pageDescription')}</p>
      </div>

      <div className="filter-bar">
        <input
          type="date"
          className="filter-date"
          value={filters.startDate}
          onChange={(e) => handleFilterChange('startDate', e.target.value)}
        />
        <span className="filter-date-separator">~</span>
        <input
          type="date"
          className="filter-date"
          value={filters.endDate}
          onChange={(e) => handleFilterChange('endDate', e.target.value)}
        />

        <select
          className="filter-select"
          value={filters.overallStatus}
          onChange={(e) => handleFilterChange('overallStatus', e.target.value)}
        >
          <option value="">{t('translation.workPage.workStatusAll')}</option>
          {serviceStatuses.map((opt) => (
            <option key={opt.status} value={opt.status}>{t(`common.status_${opt.status}`)}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.company}
          onChange={(e) => handleFilterChange('company', e.target.value)}
        >
          <option value="">{t('translation.workPage.allCompany')}</option>
          {enterprises.map((ent) => (
            <option key={ent.entNo} value={ent.entNo}>{ent.entNm}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.cnlYn}
          onChange={(e) => handleFilterChange('cnlYn', e.target.value)}
        >
          <option value="">{t('common.allCancelStatus')}</option>
          <option value="N">{t('common.cancelStatusNormal')}</option>
          <option value="Y">{t('common.cancelStatusCanceled')}</option>
        </select>

        <select
          className="filter-select"
          value={filters.searchField}
          onChange={(e) => handleFilterChange('searchField', e.target.value)}
        >
          {SEARCH_FIELDS.map((sf) => (
            <option key={sf.value} value={sf.value}>{t(sf.labelKey)}</option>
          ))}
        </select>

        <div className="filter-search">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="filter-input"
            value={filters.searchText}
            onChange={(e) => handleFilterChange('searchText', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('translation.workPage.searchPlaceholder')}
          />
        </div>

        <div className="filter-actions">
          <button className="btn-ghost" onClick={handleReset}>{t('common.reset')}</button>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? t('translation.workPage.searchingLabel') : t('common.search')}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      <div className="table-toolbar">
        <span className="record-count">
          {t('common.countUnit', { count: pagination.totalElements.toLocaleString() })}
        </span>
        <button className="btn-primary" onClick={openRegisterModal}>
          {t('common:requestRegister.title')}
        </button>
      </div>

      <RequestRegisterModal
        open={registerModalOpen}
        onClose={closeRegisterModal}
        onSubmit={handleRegisterSubmit}
        type="translation"
      />

      {/* AG Grid와 상세 패널 */}
      <div className="grid-and-detail-container">
        <div className="grid-container">
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            onGridReady={onGridReady}
            onRowClicked={handleRowClicked}
            onRowDoubleClicked={handleRowDoubleClicked}
            rowSelection="single"
            animateRows={true}
            loading={loading}
            overlayLoadingTemplate={`<span class="ag-overlay-loading-center">${t('common.loadingData')}</span>`}
            overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t('common.noData')}</span>`}
            getRowId={getRowId}
            getRowClass={getRowClass}
            tooltipShowDelay={300}
            headerHeight={36}
            rowHeight={38}
          />
        </div>

        {/* 오른쪽 상세 패널 */}
        <DetailSidePanel
          selectedItem={selectedItem}
          detailData={detailData}
          detailLoading={detailLoading}
          detailError={detailError}
          getLangLabel={getLangLabel}
        />
      </div>

      <div className="pagination">
        <div className="pagination-size">
          <select value={pagination.size} onChange={handlePageSizeChange}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{t('common.countUnit', { count: n })}</option>)}
          </select>
        </div>
        <div className="pagination-pages">
          <button disabled={pagination.page <= 0} onClick={() => handlePageChange(0)}>&laquo;</button>
          <button disabled={pagination.page <= 0} onClick={() => handlePageChange(pagination.page - 1)}>&lsaquo;</button>
          {(() => {
            const total = pagination.totalPages || 1;
            const current = displayPage;
            const range = 5;
            let start = Math.max(1, current - Math.floor(range / 2));
            let end = Math.min(total, start + range - 1);
            if (end - start + 1 < range) start = Math.max(1, end - range + 1);
            const pages = [];
            for (let i = start; i <= end; i++) pages.push(i);
            return pages.map((p) => (
              <button
                key={p}
                className={p === current ? 'active' : ''}
                onClick={() => handlePageChange(p - 1)}
              >
                {p}
              </button>
            ));
          })()}
          <button disabled={pagination.page >= pagination.totalPages - 1} onClick={() => handlePageChange(pagination.page + 1)}>&rsaquo;</button>
          <button disabled={pagination.page >= pagination.totalPages - 1} onClick={() => handlePageChange(pagination.totalPages - 1)}>&raquo;</button>
        </div>
        <span className="pagination-info">
          {displayPage} / {pagination.totalPages || 1}
        </span>
      </div>
    </div>
  );
}
