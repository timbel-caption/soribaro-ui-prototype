/**
 * 채점 결과 테이블 — accuracy 컬러링 셀
 *
 * AccuracyModal 의 accuracyColor() 패턴 그대로 재사용:
 *   95+ : 초록 (#34d399)
 *   80+ : 노랑 (#fbbf24)
 *   60+ : 주황 (#fb923c)
 *   그 외: 빨강 (#f87171)
 *
 * Props:
 *   evaluations: Array<{
 *     id, assignmentStudentId, studentMembId, studentName,
 *     accuracy, errorCount, formErrorCount, submittedAt, status,
 *   }>
 *   onDetail?: (evaluation) => void
 *   onReview?: (evaluation) => void
 *   showStudent?: boolean (default true)
 *   pageSize?: number          // 0/null 이면 페이지네이션 비활성. 양수면 활성 + 항상 페이저 노출.
 *   onPageSizeChange?: (n) => void  // 외부에서 페이지 크기 제어 시 (없으면 내부 state)
 *   pageSizeOptions?: number[] // select 옵션 (default [10,20,50,100])
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// eslint-disable-next-line react-refresh/only-export-components -- accuracyColor 는 다른 페이지/오버레이에서도 사용. Fast Refresh 영향 미미.
export function accuracyColor(value) {
  if (value == null || Number.isNaN(value)) return '#94a3b8';
  if (value >= 95) return '#34d399';
  if (value >= 80) return '#fbbf24';
  if (value >= 60) return '#fb923c';
  return '#f87171';
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function AccuracyBadge({ value }) {
  if (value == null) return <span style={{ color: '#94a3b8' }}>-</span>;
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: '60px',
        padding: '3px 8px',
        borderRadius: '4px',
        fontWeight: 600,
        textAlign: 'center',
        color: '#fff',
        background: accuracyColor(value),
      }}
    >
      {Number(value).toFixed(2)}%
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScoreTable({
  evaluations = [],
  onDetail,
  onReview,
  showStudent = true,
  pageSize = 0,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}) {
  const { t } = useTranslation('common');
  const [page, setPage] = useState(0); // 0-based
  // 외부 onPageSizeChange 가 없으면 내부 state 로 자체 제어
  const [internalSize, setInternalSize] = useState(pageSize || DEFAULT_PAGE_SIZE_OPTIONS[1]);
  const effectiveSize = onPageSizeChange ? pageSize : internalSize;
  const handleSizeChange = (n) => {
    if (onPageSizeChange) onPageSizeChange(n);
    else setInternalSize(n);
  };

  const enablePaging = effectiveSize > 0;
  const total = evaluations.length;
  const totalPages = enablePaging ? Math.max(1, Math.ceil(total / effectiveSize)) : 1;
  const safePage = Math.min(page, Math.max(0, totalPages - 1));

  // 페이지 크기/데이터 변경 시 1페이지로 리셋
  useEffect(() => {
    setPage(0);
  }, [effectiveSize, total]);

  const pageRows = useMemo(() => {
    if (!enablePaging) return evaluations;
    const start = safePage * effectiveSize;
    return evaluations.slice(start, start + effectiveSize);
  }, [enablePaging, evaluations, safePage, effectiveSize]);

  const pageNumbers = useMemo(() => {
    const range = 5;
    let start = Math.max(1, safePage + 1 - Math.floor(range / 2));
    let end = Math.min(totalPages, start + range - 1);
    if (end - start + 1 < range) start = Math.max(1, end - range + 1);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [safePage, totalPages]);

  if (!evaluations.length) {
    return (
      <div className="score-table-empty" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
        {t('training.score.empty')}
      </div>
    );
  }

  return (
    <div className="score-table-wrap">
      <table className="score-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color, #2d2d2d)' }}>
            {showStudent && (
              <>
                <th style={{ padding: '8px', textAlign: 'left' }}>{t('training.assign.studentMembId')}</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>{t('training.assign.studentName')}</th>
              </>
            )}
            <th style={{ padding: '8px', textAlign: 'center' }}>{t('training.score.accuracy')}</th>
            <th style={{ padding: '8px', textAlign: 'center' }}>{t('training.score.errorCount')}</th>
            <th style={{ padding: '8px', textAlign: 'center' }}>{t('training.score.formError')}</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>{t('training.assignment.fields.createdAt')}</th>
            {onReview && <th style={{ padding: '8px', textAlign: 'center' }}>{t('training.score.reviewWork')}</th>}
            {onDetail && <th style={{ padding: '8px' }}>{t('training.score.detail')}</th>}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((ev) => (
            <tr
              key={ev.id ?? ev.assignmentStudentId}
              style={{ borderBottom: '1px solid var(--border-color, #2d2d2d)' }}
            >
              {showStudent && (
                <>
                  <td style={{ padding: '8px' }}>{ev.studentMembId}</td>
                  <td style={{ padding: '8px' }}>{ev.studentName || '-'}</td>
                </>
              )}
              <td style={{ padding: '8px', textAlign: 'center' }}>
                <AccuracyBadge value={ev.accuracy} />
              </td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{ev.errorCount ?? '-'}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{ev.formErrorCount ?? '-'}</td>
              <td style={{ padding: '8px' }}>{formatDateTime(ev.submittedAt || ev.createdAt)}</td>
              {onReview && (
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => onReview(ev)}
                  >
                    {t('training.score.reviewWork')}
                  </button>
                </td>
              )}
              {onDetail && (
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => onDetail(ev)}
                  >
                    {t('training.score.detail')}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {enablePaging && (
        <div className="pagination" style={{ marginTop: 8 }}>
          <div className="pagination-size">
            <select
              value={effectiveSize}
              onChange={(e) => handleSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {t('training.totalCount', { count: n })}
                </option>
              ))}
            </select>
          </div>
          <div className="pagination-pages">
            <button disabled={safePage <= 0} onClick={() => setPage(0)}>&laquo;</button>
            <button disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}>&lsaquo;</button>
            {pageNumbers.map((p) => (
              <button
                key={p}
                className={p === safePage + 1 ? 'active' : ''}
                onClick={() => setPage(p - 1)}
              >
                {p}
              </button>
            ))}
            <button disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>&rsaquo;</button>
            <button disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>&raquo;</button>
          </div>
          <span className="pagination-info">{safePage + 1} / {totalPages}</span>
        </div>
      )}
    </div>
  );
}

export default memo(ScoreTable);
