/**
 * 수강생 본인 배정 목록 페이지
 *
 * - 본인의 모든 배정을 status 필터로 표시
 * - 행 클릭 → 배정 디테일 페이지로 이동
 *
 * 라우트: /soribaro/training/student
 * 권한: 인증 사용자 (TRAINEE 또는 ADMIN — TRAINEE 의 경우 본인 것만 백엔드가 반환)
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listMyAssignments } from '../../../api/v9/training/trainee';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FILTERS = ['all', 'ASSIGNED', 'IN_PROGRESS', 'SCORED'];

export default function TraineeAssignmentsPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMyAssignments({
        status: filter === 'all' ? undefined : filter,
        page: 0,
        size: 200,
      });
      const envelope = res?.data ?? res;
      const list = Array.isArray(envelope)
        ? envelope
        : Array.isArray(envelope?.content)
        ? envelope.content
        : [];
      setItems(list);
    } catch (err) {
      console.error('[TraineeAssignmentsPage] load failed:', err);
      toast.error(err?.message || t('training.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpen = useCallback(
    (item) => {
      const asid = item.id ?? item.assignmentStudentId;
      if (!asid) return;
      navigate(`/soribaro/training/student/${encodeURIComponent(asid)}`);
    },
    [navigate],
  );

  return (
    <div className="notion-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">{t('training.student.title')}</h1>
            <p className="page-description">{t('training.assignment.createDescription')}</p>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-actions" style={{ marginLeft: 0 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={filter === f ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
            >
              {t(`training.student.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="notion-empty">{t('training.loading')}</div>}
      {!loading && items.length === 0 && (
        <div className="notion-empty">{t('training.student.empty')}</div>
      )}

      <div className="notion-list-cards">
        {items.map((item) => {
          const asid = item.id ?? item.assignmentStudentId;
          const status = item.status || 'ASSIGNED';
          return (
            <div
              key={asid}
              className="notion-list-card"
              onClick={() => handleOpen(item)}
            >
              <div style={{ flex: 1 }}>
                <div className="title">{item.assignmentTitle || item.title || '-'}</div>
                <div className="sub">{item.fileTitle || item.fileName || ''}</div>
                <div className="meta">{formatDateTime(item.assignedAt || item.createdAt)}</div>
              </div>
              <div className="actions">
                <span className={`status-pill ${status}`}>
                  {t(`training.status.${status}`, { defaultValue: status })}
                </span>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpen(item);
                  }}
                >
                  {status === 'SCORED' || status === 'SUBMITTED'
                    ? t('training.student.view')
                    : t('training.student.open')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
