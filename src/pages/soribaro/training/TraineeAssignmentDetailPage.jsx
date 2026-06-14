/**
 * 수강생 본인 과제 디테일
 *
 * - 한 과제(assignment) 에 묶인 모든 파일을 카드로 표시 — 각 파일별 진행 상태/[시작 또는 보기] 버튼
 * - 채점 결과는 수강생에게 보여주지 않는다 (관리자만 가시).
 *
 * 라우트: /soribaro/training/student/:assignmentStudentId
 *   → 받은 assignmentStudentId 로 응답 조회 → response.siblings 가 같은 과제의 모든 파일 row
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyAssignment } from '../../../api/v9/training/trainee';
import { toast } from '../../../stores/toastStore';
import { toAppUrl } from '../../../utils/worktoolRoute';
import '../../../styles/notion-list.css';

/**
 * 초 단위 재생 시간을 HH:mm:ss 형식으로 — 1시간 미만이어도 두 자리 시:분:초.
 */
function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '-';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function TraineeAssignmentDetailPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { assignmentStudentId } = useParams();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!assignmentStudentId) return;
    setLoading(true);
    try {
      const res = await getMyAssignment(assignmentStudentId);
      // 응답: { assignment, latestWorkRevision, submitRevision, evaluation, siblings }
      setDetail(res?.data ?? res);
    } catch (err) {
      console.error('[TraineeAssignmentDetailPage] load failed:', err);
      toast.error(err?.message || t('training.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [assignmentStudentId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 카드로 표시할 파일 row 목록 — siblings 가 있으면 그 배열, 없으면 메인 1개로 폴백.
  const mainAssignment = detail?.assignment ?? null;
  const files = detail?.siblings && detail.siblings.length > 0
    ? detail.siblings
    : (mainAssignment ? [mainAssignment] : []);

  const handleStart = useCallback((row) => {
    const asid = row?.assignmentStudentId ?? row?.id;
    if (!asid) return;
    const trainingFileId = row?.trainingFileId;
    const tfidParam = trainingFileId
      ? `&trainingFileId=${encodeURIComponent(trainingFileId)}`
      : '';
    const url =
      `/worktool?mode=training&role=STUDENT&popup=true` +
      `&assignmentStudentId=${encodeURIComponent(asid)}` +
      tfidParam;
    window.open(toAppUrl(url), `worktool_student_${asid}`, 'popup,width=1400,height=900');
  }, []);

  return (
    <div className="notion-page">
      <div className="page-header">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => navigate('/soribaro/training/student')}
          style={{ marginBottom: '8px' }}
        >
          ← {t('training.student.backToList')}
        </button>
        <h1 className="page-title">
          {mainAssignment?.assignmentTitle || t('training.tabs.detail')}
        </h1>
        <p className="page-description">
          {mainAssignment?.assignmentDescription || ''}
        </p>
      </div>

      {loading && <div className="notion-empty">{t('training.loading')}</div>}

      {!loading && files.length === 0 && (
        <div className="notion-empty">{t('training.student.empty')}</div>
      )}

      {files.map((row) => {
        const asid = row.assignmentStudentId ?? row.id;
        const status = row.status || 'ASSIGNED';
        const isLocked = status === 'SUBMITTED' || status === 'SCORED';

        return (
          <div key={asid} className="notion-card">
            <div className="notion-card-row">
              <div style={{ flex: 1 }}>
                <div className="notion-card-title">
                  {row.fileTitle || row.fileName || '-'}
                </div>
                {row.fileName && row.fileTitle && row.fileName !== row.fileTitle && (
                  <div className="notion-card-sub">{row.fileName}</div>
                )}
                <div className="notion-card-sub">
                  {t('training.fields.duration')}: {formatDuration(row.fileDuration)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`status-pill ${status}`}>
                  {t(`training.status.${status}`, { defaultValue: status })}
                </span>
                <button
                  type="button"
                  className={isLocked ? 'btn-ghost' : 'btn-primary'}
                  onClick={() => handleStart(row)}
                >
                  {isLocked ? t('training.student.view') : t('training.student.open')}
                </button>
              </div>
            </div>
            {/* 채점 결과는 수강생에게 보여주지 않는다 — 상태 chip 으로 진행 여부만 노출. */}
          </div>
        );
      })}
    </div>
  );
}
