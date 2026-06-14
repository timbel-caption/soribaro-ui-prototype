/**
 * 연수 과제 디테일 페이지 (관리자 전용)
 *
 * 내부 탭 4개:
 *   1. 기본정보 (제목, 설명, 상태 수정)
 *   2. 수강생 배정 (단건 추가 + 엑셀 일괄 + 배정 목록)
 *   3. 완료 상태 (배정별 status 컬러 테이블)
 *   4. 채점 (파일별 정답지 [작성] + 학생별 정확도/오류 ScoreTable)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getAssignment,
  updateAssignment,
  addAssignmentFiles,
  removeAssignmentFile,
  listAssignmentStudents,
  removeAssignmentStudent,
} from '../../../api/v9/training/assignments';
import { listTrainingFiles } from '../../../api/v9/training';
import { toast } from '../../../stores/toastStore';
import AssignmentStudentExcelModal from '../../../components/training/AssignmentStudentExcelModal';
import AssignmentStudentAddModal from '../../../components/training/AssignmentStudentAddModal';
import AssignmentStudentBulkPickerModal from '../../../components/training/AssignmentStudentBulkPickerModal';
import AnswerSubtitleEditorLauncher from '../../../components/training/AnswerSubtitleEditorLauncher';
import ScoreTable from '../../../components/training/ScoreTable';
import TrainingAccuracyModal from '../../../components/training/TrainingAccuracyModal';
import '../../../styles/notion-list.css';
import './TrainingAssignmentsPage.css';

const TABS = ['info', 'assign', 'progress', 'scoring'];

// 클라이언트 사이드 페이지네이션 — 백엔드 listAssignmentStudents 가 page+size 지원하지만
// 채점 탭/완료 상태 탭은 전체 데이터에 대한 클라이언트 필터/그룹핑이 필요해 현재 구조에서는
// 전체 fetch 후 탭마다 슬라이싱이 더 단순.
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusBadge({ status }) {
  const { t } = useTranslation('common');
  return (
    <span className={`status-pill ${status}`}>
      {t(`training.status.${status}`, { defaultValue: status })}
    </span>
  );
}

export default function TrainingAssignmentDetailPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { id: assignmentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // 탭 상태는 URL 쿼리(?tab=...)로 동기화 — 새로고침 시 현재 탭 유지
  const urlTab = searchParams.get('tab');
  const tab = TABS.includes(urlTab) ? urlTab : TABS[0];
  const setTab = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams);
      params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]); // 배정 목록
  const [excelOpen, setExcelOpen] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('OPEN');
  const [saving, setSaving] = useState(false);

  // 단건 배정: 모달 오픈 여부만 페이지에서 관리. 검색/선택/등록은 모달이 책임.
  const [singleAddOpen, setSingleAddOpen] = useState(false);
  // 수강생 목록 → 일괄 배정 (미배정 수강생 picker)
  const [pickListOpen, setPickListOpen] = useState(false);

  // 파일 추가 (전체 파일 picker)
  const [allTrainingFiles, setAllTrainingFiles] = useState([]);

  // 완료 상태 탭 — 파일/상태/키워드 필터 (클라이언트 사이드)
  const [progressFileFilter, setProgressFileFilter] = useState('all');
  const [progressStatusFilter, setProgressStatusFilter] = useState('all');
  const [progressKeyword, setProgressKeyword] = useState('');

  // 탭별 페이지 / 페이지 크기
  const [assignPage, setAssignPage] = useState(0);
  const [assignPageSize, setAssignPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [progressPage, setProgressPage] = useState(0);
  const [progressPageSize, setProgressPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [scoringPageSize, setScoringPageSize] = useState(10);
  const [scoringDetail, setScoringDetail] = useState(null); // 선택된 evaluation 행

  // 필터/리스트/페이지크기 변경 시 페이지 리셋
  useEffect(() => {
    setAssignPage(0);
  }, [students.length, assignPageSize]);
  useEffect(() => {
    setProgressPage(0);
  }, [progressFileFilter, progressStatusFilter, progressKeyword, students.length, progressPageSize]);

  const fetchAssignment = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    try {
      const res = await getAssignment(assignmentId);
      const data = res?.data ?? res;
      // 백엔드 응답: { assignment: { ...meta }, files: [], studentCount, submittedCount, scoredCount }
      const meta = data?.assignment ?? data ?? {};
      const merged = {
        ...meta,
        files: data?.files ?? meta?.files ?? [],
        studentCount: data?.studentCount,
        submittedCount: data?.submittedCount,
        scoredCount: data?.scoredCount,
      };
      setAssignment(merged);
      setEditTitle(merged.title || '');
      setEditDescription(merged.description || '');
      setEditStatus(merged.status || 'OPEN');
    } catch (err) {
      console.error('[TrainingAssignmentDetailPage] load failed:', err);
      toast.error(err?.message || t('training.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, t]);

  const fetchStudents = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const res = await listAssignmentStudents(assignmentId, { page: 0, size: 500 });
      const envelope = res?.data ?? res;
      const list = Array.isArray(envelope)
        ? envelope
        : Array.isArray(envelope?.content)
        ? envelope.content
        : [];
      setStudents(list);
    } catch (err) {
      console.error('[TrainingAssignmentDetailPage] students load failed:', err);
    }
  }, [assignmentId]);

  const fetchAllFiles = useCallback(async () => {
    try {
      const res = await listTrainingFiles({ page: 0, size: 200 });
      const envelope = res?.data ?? res;
      const list = Array.isArray(envelope) ? envelope : envelope?.content || [];
      setAllTrainingFiles(list);
    } catch (err) {
      console.error('[TrainingAssignmentDetailPage] all files load failed:', err);
    }
  }, []);

  useEffect(() => {
    fetchAssignment();
    fetchStudents();
    fetchAllFiles();
  }, [fetchAssignment, fetchStudents, fetchAllFiles]);

  const handleSaveInfo = useCallback(async () => {
    if (!assignmentId) return;
    setSaving(true);
    try {
      await updateAssignment(assignmentId, {
        title: editTitle.trim(),
        description: editDescription,
        status: editStatus,
      });
      toast.success(t('training.assignment.saved'));
      fetchAssignment();
    } catch (err) {
      toast.error(err?.message || t('training.errors.uploadFailed'));
    } finally {
      setSaving(false);
    }
  }, [assignmentId, editTitle, editDescription, editStatus, t, fetchAssignment]);

  const handleAddFiles = useCallback(
    async (fileIdsToAdd) => {
      if (!assignmentId || !fileIdsToAdd?.length) return;
      try {
        await addAssignmentFiles(assignmentId, fileIdsToAdd);
        toast.success(t('training.assignment.saved'));
        fetchAssignment();
      } catch (err) {
        toast.error(err?.message || t('training.errors.uploadFailed'));
      }
    },
    [assignmentId, t, fetchAssignment],
  );

  const handleRemoveFile = useCallback(
    async (trainingFileId) => {
      if (!assignmentId || !trainingFileId) return;
      try {
        await removeAssignmentFile(assignmentId, trainingFileId);
        toast.success(t('training.assign.deleted'));
        fetchAssignment();
      } catch (err) {
        toast.error(err?.message || t('training.errors.deleteFailed'));
      }
    },
    [assignmentId, t, fetchAssignment],
  );

  const handleRemoveStudent = useCallback(
    async (assignmentStudentId) => {
      if (!assignmentId || !assignmentStudentId) return;
      const ok = window.confirm(t('training.assign.deleteConfirm'));
      if (!ok) return;
      try {
        await removeAssignmentStudent(assignmentId, assignmentStudentId);
        toast.success(t('training.assign.deleted'));
        fetchStudents();
      } catch (err) {
        toast.error(err?.message || t('training.errors.deleteFailed'));
      }
    },
    [assignmentId, t, fetchStudents],
  );

  const files = assignment?.files || [];

  // 채점 탭에서 사용: students 를 file 별로 group 화
  const studentsByFile = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      const fid = s.trainingFileId || s.training_file_id;
      if (!map.has(fid)) map.set(fid, []);
      map.get(fid).push(s);
    }
    return map;
  }, [students]);

  // 페이지네이션 슬라이싱 — assign 탭
  const assignTotalPages = Math.max(1, Math.ceil(students.length / assignPageSize));
  const assignSafePage = Math.min(assignPage, assignTotalPages - 1);
  const assignPageRows = useMemo(() => {
    const start = assignSafePage * assignPageSize;
    return students.slice(start, start + assignPageSize);
  }, [students, assignSafePage, assignPageSize]);

  // 완료 상태 탭에서 사용: 파일/상태/키워드 필터링된 students
  const filteredProgressStudents = useMemo(() => {
    const keyword = progressKeyword.trim().toLowerCase();
    return students.filter((s) => {
      if (progressFileFilter !== 'all') {
        const fid = s.trainingFileId || s.training_file_id;
        if (fid !== progressFileFilter) return false;
      }
      if (progressStatusFilter !== 'all' && s.status !== progressStatusFilter) {
        return false;
      }
      if (keyword) {
        const id = String(s.studentMembId || '').toLowerCase();
        const nm = String(s.studentMembNm || s.studentName || '').toLowerCase();
        if (!id.includes(keyword) && !nm.includes(keyword)) return false;
      }
      return true;
    });
  }, [students, progressFileFilter, progressStatusFilter, progressKeyword]);

  // 페이지네이션 슬라이싱 — progress 탭
  const progressTotalPages = Math.max(1, Math.ceil(filteredProgressStudents.length / progressPageSize));
  const progressSafePage = Math.min(progressPage, progressTotalPages - 1);
  const progressPageRows = useMemo(() => {
    const start = progressSafePage * progressPageSize;
    return filteredProgressStudents.slice(start, start + progressPageSize);
  }, [filteredProgressStudents, progressSafePage, progressPageSize]);

  // 항상 노출되는 페이지네이션 바 (1/1 이라도 표시) + 페이지 크기 select
  const renderPager = useCallback((cur, total, onPageChange, size, onSizeChange) => {
    const range = 5;
    let start = Math.max(1, cur + 1 - Math.floor(range / 2));
    let end = Math.min(total, start + range - 1);
    if (end - start + 1 < range) start = Math.max(1, end - range + 1);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return (
      <div className="pagination" style={{ marginTop: 8 }}>
        <div className="pagination-size">
          <select
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t('training.totalCount', { count: n })}
              </option>
            ))}
          </select>
        </div>
        <div className="pagination-pages">
          <button disabled={cur <= 0} onClick={() => onPageChange(0)}>&laquo;</button>
          <button disabled={cur <= 0} onClick={() => onPageChange(cur - 1)}>&lsaquo;</button>
          {pages.map((p) => (
            <button
              key={p}
              className={p === cur + 1 ? 'active' : ''}
              onClick={() => onPageChange(p - 1)}
            >
              {p}
            </button>
          ))}
          <button disabled={cur >= total - 1} onClick={() => onPageChange(cur + 1)}>&rsaquo;</button>
          <button disabled={cur >= total - 1} onClick={() => onPageChange(total - 1)}>&raquo;</button>
        </div>
        <span className="pagination-info">{cur + 1} / {total}</span>
      </div>
    );
  }, [t]);

  return (
    <div className="notion-page training-assignments-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => navigate('/soribaro/training/assignments')}
              style={{ marginBottom: '8px' }}
            >
              ← {t('training.student.backToList')}
            </button>
            <h1 className="page-title">
              {assignment?.title || (loading ? t('training.loading') : t('training.tabs.detail'))}
            </h1>
            <p className="page-description">{assignment?.description || ''}</p>
          </div>
        </div>
      </div>

      {/* 탭 헤더 */}
      <div className="notion-tabs">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`notion-tab-btn ${tab === k ? 'active' : ''}`}
          >
            {t(`training.assignment.detail.${k}`)}
          </button>
        ))}
      </div>

      {/* 1. 기본정보 */}
      {tab === 'info' && (
        <div className="info-tab" style={{ maxWidth: '720px' }}>
          <div className="form-group">
            <label>{t('training.assignment.title')}</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label>{t('training.assignment.description')}</label>
            <textarea
              rows={4}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label>{t('training.assignment.status')}</label>
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={saving}>
              <option value="OPEN">{t('training.assignment.open')}</option>
              <option value="CLOSED">{t('training.assignment.closed')}</option>
            </select>
          </div>
          <div className="form-row" style={{ marginTop: '4px' }}>
            <button className="btn-primary" onClick={handleSaveInfo} disabled={saving}>
              {saving ? t('training.loading') : t('training.register')}
            </button>
          </div>

          {/* 파일 관리 */}
          <div style={{ marginTop: '24px' }}>
            <h3 className="notion-section-header">{t('training.tabs.files')}</h3>
            <table className="notion-simple-table">
              <tbody>
                {files.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={2}>{t('training.assignment.noFilesSelected')}</td>
                  </tr>
                )}
                {files.map((f) => (
                  <tr key={f.id || f.trainingFileId}>
                    <td>{f.fileTitle || f.fileName || f.title || f.name}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => handleRemoveFile(f.trainingFileId || f.id)}
                      >
                        {t('training.actions.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <FilesAdder
              allFiles={allTrainingFiles}
              alreadyIds={new Set(files.map((f) => f.trainingFileId || f.id))}
              onAdd={handleAddFiles}
            />
          </div>
        </div>
      )}

      {/* 2. 수강생 배정 */}
      {tab === 'assign' && (
        <div className="assign-tab">
          <div className="form-row">
            <button className="btn-primary" onClick={() => setSingleAddOpen(true)}>
              {t('training.assign.addSingle')}
            </button>
            <button className="btn-ghost" onClick={() => setPickListOpen(true)}>
              {t('training.assign.pickList.button')}
            </button>
            <button className="btn-ghost" onClick={() => setExcelOpen(true)}>
              {t('training.assign.uploadExcel')}
            </button>
          </div>

          <div className="table-toolbar" style={{ marginTop: 8 }}>
            <span className="record-count">
              {t('training.totalCount', { count: students.length })}
            </span>
          </div>

          <table className="notion-simple-table">
            <thead>
              <tr>
                <th>{t('training.assign.studentMembId')}</th>
                <th>{t('training.assign.studentName')}</th>
                <th>{t('training.assign.files')}</th>
                <th className="text-center">{t('training.assignment.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}>{t('training.assign.empty')}</td>
                </tr>
              )}
              {assignPageRows.map((s) => (
                <tr key={s.id ?? s.assignmentStudentId}>
                  <td>{s.studentMembId}</td>
                  <td>{s.studentMembNm || s.studentName || '-'}</td>
                  <td>{s.fileTitle || s.fileName || s.trainingFileId}</td>
                  <td className="text-center">
                    <StatusBadge status={s.status || 'ASSIGNED'} />
                  </td>
                  <td className="text-right">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => handleRemoveStudent(s.id ?? s.assignmentStudentId)}
                    >
                      {t('training.actions.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {renderPager(assignSafePage, assignTotalPages, setAssignPage, assignPageSize, setAssignPageSize)}
        </div>
      )}

      {/* 3. 완료 상태 */}
      {tab === 'progress' && (
        <div className="progress-tab">
          <div className="filter-bar">
            <select
              className="filter-select"
              value={progressFileFilter}
              onChange={(e) => setProgressFileFilter(e.target.value)}
            >
              <option value="all">{t('training.assign.allFiles')}</option>
              {files.map((f) => {
                const fid = f.trainingFileId || f.id;
                return (
                  <option key={fid} value={fid}>
                    {f.fileTitle || f.fileName || f.title || f.name || fid}
                  </option>
                );
              })}
            </select>
            <select
              className="filter-select"
              value={progressStatusFilter}
              onChange={(e) => setProgressStatusFilter(e.target.value)}
            >
              <option value="all">{t('training.assign.allStatus')}</option>
              <option value="ASSIGNED">{t('training.status.ASSIGNED')}</option>
              <option value="IN_PROGRESS">{t('training.status.IN_PROGRESS')}</option>
              <option value="SUBMITTED">{t('training.status.SUBMITTED')}</option>
              <option value="SCORED">{t('training.status.SCORED')}</option>
            </select>
            <div className="filter-search">
              <input
                type="text"
                className="filter-input"
                value={progressKeyword}
                onChange={(e) => setProgressKeyword(e.target.value)}
                placeholder={t('training.assign.searchPlaceholder')}
              />
            </div>
            <div className="filter-actions">
              <span className="record-count">
                {t('training.totalCount', { count: filteredProgressStudents.length })}
              </span>
            </div>
          </div>

          <table className="notion-simple-table">
            <thead>
              <tr>
                <th>{t('training.assign.studentMembId')}</th>
                <th>{t('training.assign.studentName')}</th>
                <th>{t('training.assign.files')}</th>
                <th className="text-center">{t('training.assignment.status')}</th>
                <th>{t('training.assignment.fields.updatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProgressStudents.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}>{t('training.assign.empty')}</td>
                </tr>
              )}
              {progressPageRows.map((s) => (
                <tr key={s.id ?? s.assignmentStudentId}>
                  <td>{s.studentMembId}</td>
                  <td>{s.studentMembNm || s.studentName || '-'}</td>
                  <td>{s.fileTitle || s.fileName || s.trainingFileId}</td>
                  <td className="text-center">
                    <StatusBadge status={s.status || 'ASSIGNED'} />
                  </td>
                  <td>{formatDateTime(s.updatedAt || s.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {renderPager(progressSafePage, progressTotalPages, setProgressPage, progressPageSize, setProgressPageSize)}
        </div>
      )}

      {/* 4. 채점 */}
      {tab === 'scoring' && (
        <div className="scoring-tab">
          {files.map((f) => {
            const fid = f.trainingFileId || f.id;
            const submissions = (studentsByFile.get(fid) || []).filter(
              (s) => s.status === 'SUBMITTED' || s.status === 'SCORED',
            );
            const evaluations = submissions.map((s) => ({
              id: s.id ?? s.assignmentStudentId,
              assignmentStudentId: s.id ?? s.assignmentStudentId,
              trainingFileId: s.trainingFileId ?? fid,
              studentMembId: s.studentMembId,
              studentName: s.studentMembNm || s.studentName,
              accuracy: s.accuracy,
              errorCount: s.errorCount,
              formErrorCount: s.formErrorCount,
              submittedAt: s.submittedAt || s.evaluatedAt,
            }));

            const handleReview = (ev) => {
              const asid = ev.assignmentStudentId;
              const tfid = ev.trainingFileId;
              if (!asid) return;
              // worktool 검수(REVIEW) 모드: 읽기 전용으로 학생 자막 표시.
              const url =
                `/worktool?mode=training&role=REVIEW&popup=true&readonly=true`
                + `&assignmentId=${encodeURIComponent(assignmentId)}`
                + `&assignmentStudentId=${encodeURIComponent(asid)}`
                + (tfid ? `&trainingFileId=${encodeURIComponent(tfid)}` : '');
              window.open(
                url,
                `worktool_review_${asid}`,
                'popup,width=1400,height=900',
              );
            };
            return (
              <div key={fid} className="notion-card">
                <div className="notion-card-row" style={{ marginBottom: '8px' }}>
                  <div>
                    <div className="notion-card-title">{f.fileTitle || f.fileName || f.title || f.name}</div>
                    {!f.hasAnswer && (
                      <div className="notion-card-sub">{t('training.answer.missing')}</div>
                    )}
                  </div>
                  <AnswerSubtitleEditorLauncher
                    assignmentId={assignmentId}
                    trainingFileId={fid}
                    hasAnswer={f.hasAnswer}
                    fileName={f.fileTitle || f.fileName || f.title || f.name}
                  />
                </div>
                <ScoreTable
                  evaluations={evaluations}
                  onReview={handleReview}
                  onDetail={(ev) => setScoringDetail(ev)}
                  pageSize={scoringPageSize}
                  onPageSizeChange={setScoringPageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                />
              </div>
            );
          })}
          {files.length === 0 && (
            <div className="notion-empty">{t('training.assignment.noFilesSelected')}</div>
          )}
        </div>
      )}

      {scoringDetail && (
        <TrainingAccuracyModal
          assignmentId={assignmentId}
          evaluation={scoringDetail}
          onClose={() => setScoringDetail(null)}
        />
      )}

      {excelOpen && (
        <AssignmentStudentExcelModal
          open
          assignmentId={assignmentId}
          onClose={() => setExcelOpen(false)}
          onCompleted={() => {
            setExcelOpen(false);
            fetchStudents();
          }}
        />
      )}

      {singleAddOpen && (
        <AssignmentStudentAddModal
          open
          assignmentId={assignmentId}
          onClose={() => setSingleAddOpen(false)}
          onAssigned={() => {
            setSingleAddOpen(false);
            fetchStudents();
          }}
        />
      )}

      {pickListOpen && (
        <AssignmentStudentBulkPickerModal
          open
          assignmentId={assignmentId}
          onClose={() => setPickListOpen(false)}
          onAssigned={() => {
            setPickListOpen(false);
            fetchStudents();
          }}
        />
      )}
    </div>
  );
}

/**
 * 파일 추가 picker (간단형) — 기본정보 탭 하단에서 사용
 */
function FilesAdder({ allFiles, alreadyIds, onAdd }) {
  const { t } = useTranslation('common');
  const [selected, setSelected] = useState(new Set());

  const available = allFiles.filter((f) => !alreadyIds.has(f.id));

  if (available.length === 0) return null;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)' }}>
          {t('training.assignment.selectFiles')}
        </summary>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '8px', maxHeight: '200px', overflow: 'auto' }}>
          {available.map((f) => (
            <li
              key={f.id}
              style={{
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
              onClick={() => toggle(f.id)}
            >
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
              <span>{f.title || f.name}</span>
            </li>
          ))}
        </ul>
        <button
          className="btn-primary btn-sm"
          disabled={selected.size === 0}
          onClick={() => {
            const arr = Array.from(selected);
            setSelected(new Set());
            onAdd(arr);
          }}
        >
          {t('training.assignment.create')} ({selected.size})
        </button>
      </details>
    </div>
  );
}
