import { useState, useRef } from 'react';
import { updateSampleFiles, updateSampleSubjects } from './protoStore';
import { useParams, useNavigate } from 'react-router-dom';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import '../../../../styles/notion-list.css';
import './ProtoDetail.css';

const TAB_LABELS = [
  '기본정보', '파일관리', '프로젝트 관리', '배정관리', '매뉴얼·용어집 세팅',
  '작업툴 진행현황', 'AI QC 결과 요약', '납품관리', '정산확인', '이력/메모',
];

const STATUS_MAP = {
  WORKING:  { label: '작업중',  cls: 'proto-status-working' },
  CHECKING: { label: '검수중',  cls: 'proto-status-checking' },
  DONE:     { label: '완료',    cls: 'proto-status-done' },
};

function statusBadge(overallStatus) {
  const s = STATUS_MAP[overallStatus] ?? { label: overallStatus, cls: 'proto-status-wait' };
  return <span className={`proto-status-badge ${s.cls}`}>{s.label}</span>;
}

function assignBadge(status) {
  if (status === '완료') return <span className="proto-badge-done">{status}</span>;
  if (status === '작업중') return <span className="proto-badge-working">{status}</span>;
  if (status === '검수중') return <span className="proto-badge-check">{status}</span>;
  return <span className="proto-badge-wait">{status}</span>;
}

function severityBadge(sev) {
  if (sev === '높음') return <span className="proto-severity-high">{sev}</span>;
  if (sev === '중간') return <span className="proto-severity-mid">{sev}</span>;
  return <span className="proto-severity-low">{sev}</span>;
}

function deliveryBadge(status) {
  if (status === '납품완료') return <span className="proto-delivery-done">{status}</span>;
  if (status === '검수중') return <span className="proto-delivery-check">{status}</span>;
  return <span className="proto-delivery-pending">{status}</span>;
}

function settleBadge(status) {
  if (status === '정산완료') return <span className="proto-settle-badge-done">{status}</span>;
  if (status === '정산대기') return <span className="proto-settle-badge-wait">{status}</span>;
  if (status === '부분정산') return <span className="proto-settle-badge-partial">{status}</span>;
  return <span className="proto-settle-badge-pre">{status}</span>;
}

const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));

// ─── 탭 1: 기본정보 ───
function BasicInfoTab({ s }) {
  const row1 = [
    { label: '작업 유형', value: s.bssTypeName },
    { label: '입체명', value: s.entNm },
    { label: '프로젝트명', value: s.servTitle },
    { label: '기관/학교명', value: s.orgNm || '-' },
    { label: '의뢰일', value: s.regDttm ? s.regDttm.split(' ')[0] : '-' },
    { label: '납품예정일', value: s.dueDate || '-' },
    { label: '실제 납품일', value: s.actualDeliveryDate || '-' },
  ];
  const row2 = [
    { label: '담당 관리자', value: s.managerNm || s.membNm },
    { label: '총 파일 수', value: `${s.files.length}개` },
    { label: '총 분량', value: s.totalDuration || s.totalPlayTm },
    { label: '납품 형식', value: s.deliveryFormats || '-' },
    { label: '프로젝트 상태', value: statusBadge(s.overallStatus), span2: true },
    { label: '정산 상태', value: s.settlement?.status || '-' },
  ];

  return (
    <div className="proto-tab-panel">
      <div className="proto-basic-card">
        <div className="proto-basic-card-header">
          <span>📋</span>
          <span>프로젝트 기본정보</span>
        </div>
        <div className="proto-basic-card-body">
          {row1.map(({ label, value }, i) => (
            <div
              key={label}
              className={`proto-basic-field${i === row1.length - 1 ? ' proto-basic-field--no-right' : ''}`}
            >
              <div className="proto-basic-field-label">{label}</div>
              <div className="proto-basic-field-value">{value}</div>
            </div>
          ))}
          {row2.map(({ label, value, span2 }, i) => (
            <div
              key={label}
              className={[
                'proto-basic-field',
                'proto-basic-field--last-row',
                span2 ? 'proto-basic-field--span2' : '',
                i === row2.length - 1 ? 'proto-basic-field--no-right' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="proto-basic-field-label">{label}</div>
              <div className="proto-basic-field-value">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="proto-basic-extra-row">
        <div className="proto-basic-extra-card proto-basic-extra-card--note">
          <div className="proto-basic-extra-header">
            <span className="proto-basic-extra-icon proto-basic-extra-icon--star">★</span>
            <span className="proto-basic-extra-title">특이사항</span>
          </div>
          <div className="proto-basic-extra-body proto-basic-extra-body--note">
            {s.specialNote || s.remark || '-'}
          </div>
        </div>
        <div className="proto-basic-extra-card proto-basic-extra-card--memo">
          <div className="proto-basic-extra-header">
            <span className="proto-basic-extra-icon proto-basic-extra-icon--memo">≡</span>
            <span className="proto-basic-extra-title">내부 메모</span>
          </div>
          <div className="proto-basic-extra-body proto-basic-extra-body--memo">
            {s.internalMemo || '-'}
          </div>
        </div>
      </div>

      <div className="proto-basic-status-history">
        <div className="proto-basic-history-header">
          <span>🗓</span>
          <span>상태 변경 이력</span>
        </div>
        <div className="proto-status-history-list">
          {(s.statusHistory || []).map((item, i) => (
            <div key={i} className="proto-status-history-item">
              <span className="proto-status-history-date">{item.date}</span>
              <span className="proto-status-history-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── 탭 2: 파일관리 ───
function FileManageTab({ s }) {
  const [files, setFiles] = useState(s.files);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();
  const isVod = s.bssTypeName !== '회의록';

  const addFiles = (fileList) => {
    const today = new Date().toISOString().split('T')[0];
    const base = files.length;
    const next = Array.from(fileList).map((f, i) => ({
      fileNo: base + i + 1,
      fileName: f.name,
      duration: '-',
      size: fmtSize(f.size),
      uploadDttm: today,
    }));
    const updated = [...files, ...next];
    setFiles(updated);
    updateSampleFiles(s.id, updated);
  };

  return (
    <div className="proto-tab-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <p className="proto-section-title" style={{ margin: 0 }}>원본 파일 목록</p>
        <button
          className="proto-file-add-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          + 파일 추가
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={isVod ? 'video/*' : 'audio/*'}
          style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <div
        className={`proto-file-drop-zone${dragOver ? ' proto-file-drop-zone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="proto-file-drop-icon">{isVod ? '🎬' : '🎙️'}</span>
        <span className="proto-file-drop-text">
          파일을 드래그하거나 클릭하여 추가
        </span>
        <span className="proto-file-drop-hint">
          {isVod ? 'MP4, MOV, AVI, MKV 등' : 'WAV, MP3, M4A 등'}
        </span>
      </div>

      <div className="proto-table-wrap" style={{ marginTop: '12px' }}>
        <table className="proto-table">
          <thead>
            <tr>
              <th>파일번호</th>
              <th>파일명</th>
              <th className="text-center">재생시간</th>
              <th className="text-center">파일크기</th>
              <th className="text-center">업로드일</th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>등록된 파일이 없습니다.</td></tr>
            ) : (
              files.map((f) => (
                <tr key={f.fileNo}>
                  <td className="text-center">{f.fileNo}</td>
                  <td>{f.fileName}</td>
                  <td className="text-center">{f.duration}</td>
                  <td className="text-center">{f.size}</td>
                  <td className="text-center">{f.uploadDttm}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
        총 {files.length}개 파일 · 전체 재생시간 {s.totalPlayTm}
      </p>
    </div>
  );
}

// ─── 탭 3: 프로젝트 관리 ───
const WEEK_STATUSES = ['미수령', '수령완료', '작업중', '검수중', '완료'];

function addWeeks(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + n * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekStatusBadge(status) {
  const map = {
    '완료':    'proto-badge-done',
    '검수중':  'proto-badge-check',
    '작업중':  'proto-badge-working',
    '수령완료':'proto-badge-recv',
    '미수령':  'proto-badge-wait',
  };
  return <span className={map[status] || 'proto-badge-wait'}>{status}</span>;
}

function ProjectManageTab({ s }) {
  const [subjects, setSubjects] = useState(s.subjects || []);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', totalWeeks: 14, startDate: '', worker: '', reviewer: '' });

  const setF = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const syncStore = (updated) => {
    setSubjects(updated);
    updateSampleSubjects(s.id, updated);
  };

  const addSubject = () => {
    if (!form.name.trim() || !form.startDate) return;
    const newSubj = {
      id: `subj-${Date.now()}`,
      name: form.name.trim(),
      totalWeeks: Number(form.totalWeeks) || 14,
      startDate: form.startDate,
      worker: form.worker.trim(),
      reviewer: form.reviewer.trim(),
      weekStatuses: {},
    };
    syncStore([...subjects, newSubj]);
    setForm({ name: '', totalWeeks: 14, startDate: '', worker: '', reviewer: '' });
    setShowForm(false);
    setExpandedId(newSubj.id);
  };

  const updateWeekStatus = (subjId, week, status) => {
    syncStore(subjects.map(subj =>
      subj.id === subjId
        ? { ...subj, weekStatuses: { ...subj.weekStatuses, [week]: status } }
        : subj
    ));
  };

  const getProgress = (subj) => {
    const done = Object.values(subj.weekStatuses || {}).filter(st => st === '완료').length;
    return { done, total: subj.totalWeeks, pct: Math.round((done / subj.totalWeeks) * 100) };
  };

  const isFormValid = form.name.trim() && form.startDate;

  return (
    <div className="proto-tab-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p className="proto-section-title" style={{ margin: 0 }}>프로젝트 현황</p>
        <button
          className="proto-file-add-btn"
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? '취소' : '+ 프로젝트 추가'}
        </button>
      </div>

      {showForm && (
        <div className="proto-subj-form">
          <div className="proto-subj-form-grid">
            <div className="proto-subj-form-field proto-subj-form-field--full">
              <label>과목명 <span className="preg-required">*</span></label>
              <input className="preg-input" value={form.name} onChange={setF('name')} placeholder="예: 지구과학개론" />
            </div>
            <div className="proto-subj-form-field">
              <label>총 주차수</label>
              <input className="preg-input" type="number" min={1} max={52} value={form.totalWeeks} onChange={setF('totalWeeks')} />
            </div>
            <div className="proto-subj-form-field">
              <label>1주차 예상 수령일 <span className="preg-required">*</span></label>
              <input className="preg-input" type="date" value={form.startDate} onChange={setF('startDate')} />
            </div>
            <div className="proto-subj-form-field">
              <label>담당 전사자</label>
              <input className="preg-input" value={form.worker} onChange={setF('worker')} placeholder="전사자 이름" />
            </div>
            <div className="proto-subj-form-field">
              <label>담당 검수자</label>
              <input className="preg-input" value={form.reviewer} onChange={setF('reviewer')} placeholder="검수자 이름" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              className={`preg-submit-btn${!isFormValid ? ' preg-submit-btn--disabled' : ''}`}
              disabled={!isFormValid}
              onClick={addSubject}
            >
              과목 등록
            </button>
          </div>
        </div>
      )}

      {subjects.length === 0 && !showForm && (
        <div className="proto-empty-state">
          <span style={{ fontSize: '30px' }}>📂</span>
          <p style={{ margin: '6px 0 2px', fontWeight: 500 }}>등록된 과목이 없습니다.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>과목을 추가하면 주차별 작업 일정을 한눈에 관리할 수 있습니다.</p>
        </div>
      )}

      <div className="proto-subj-list">
        {subjects.map((subj) => {
          const prog = getProgress(subj);
          const isExpanded = expandedId === subj.id;
          const endDate = addWeeks(subj.startDate, subj.totalWeeks - 1);

          return (
            <div key={subj.id} className="proto-subj-card">
              <div
                className="proto-subj-card-header"
                onClick={() => setExpandedId(isExpanded ? null : subj.id)}
              >
                <div className="proto-subj-card-left">
                  <span className="proto-subj-name">{subj.name}</span>
                  <span className="proto-subj-meta">총 {subj.totalWeeks}주차</span>
                  {subj.worker  && <span className="proto-subj-meta">전사 {subj.worker}</span>}
                  {subj.reviewer && <span className="proto-subj-meta">검수 {subj.reviewer}</span>}
                  <span className="proto-subj-meta">{subj.startDate} ~ {endDate}</span>
                </div>
                <div className="proto-subj-card-right">
                  <div className="proto-subj-progress">
                    <div className="proto-subj-progress-bar">
                      <div className="proto-subj-progress-fill" style={{ width: `${prog.pct}%` }} />
                    </div>
                    <span className="proto-subj-progress-text">{prog.done}/{prog.total}주차 완료</span>
                  </div>
                  <span className="proto-subj-toggle">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="proto-subj-weeks">
                  <div className="proto-table-wrap" style={{ marginBottom: 0 }}>
                    <table className="proto-table">
                      <thead>
                        <tr>
                          <th className="text-center" style={{ width: '70px' }}>주차</th>
                          <th className="text-center">예상 수령일</th>
                          <th className="text-center" style={{ width: '160px' }}>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: subj.totalWeeks }, (_, i) => {
                          const week = i + 1;
                          const expDate = addWeeks(subj.startDate, i);
                          const status = subj.weekStatuses?.[week] || '미수령';
                          return (
                            <tr key={week}>
                              <td className="text-center" style={{ fontWeight: 500 }}>{week}주차</td>
                              <td className="text-center">{expDate}</td>
                              <td className="text-center">
                                <select
                                  className="proto-week-status-select"
                                  value={status}
                                  onChange={(e) => updateWeekStatus(subj.id, week, e.target.value)}
                                >
                                  {WEEK_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 탭 4: 배정관리 ───
function AssignManageTab({ s }) {
  return (
    <div className="proto-tab-panel">
      <p className="proto-section-title">작업자 배정 현황</p>
      <div className="proto-table-wrap">
        <table className="proto-table">
          <thead>
            <tr>
              <th>파일번호</th>
              <th>파일명</th>
              <th>담당자</th>
              <th className="text-center">역할</th>
              <th className="text-center">배정일</th>
              <th className="text-center">작업상태</th>
            </tr>
          </thead>
          <tbody>
            {s.assignments.map((a, i) => (
              <tr key={i}>
                <td className="text-center">{a.fileNo}</td>
                <td>{a.fileName}</td>
                <td>{a.worker}</td>
                <td className="text-center">{a.role}</td>
                <td className="text-center">{a.assignDttm}</td>
                <td className="text-center">{assignBadge(a.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 탭 4: 매뉴얼·용어집 세팅 ───
function ManualGlossaryTab({ s }) {
  return (
    <div className="proto-tab-panel">
      <p className="proto-section-title">적용된 매뉴얼 · 용어집</p>
      <div className="proto-manual-cards">
        {s.manuals.map((m, i) => (
          <div key={i} className="proto-manual-card">
            <span className={`proto-manual-card-type ${m.type === '매뉴얼' ? 'manual' : 'glossary'}`}>
              {m.type}
            </span>
            <span className="proto-manual-card-name">{m.name}</span>
            <span className="proto-manual-card-date">적용일 {m.appliedDate}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
        총 {s.manuals.length}개 항목 적용됨 · 매뉴얼/용어집 추가는 정식 서비스에서 지원 예정
      </p>
    </div>
  );
}

// ─── 탭 5: 작업툴 진행현황 ───
function WorkProgressTab({ s }) {
  const handleOpenTool = (fileName) => {
    window.alert(`[프로토타입 안내]\n작업툴은 정식 서비스 단계에서 연동 예정입니다.\n\n파일: ${fileName}`);
  };

  return (
    <div className="proto-tab-panel">
      <p className="proto-section-title">파일별 작업툴 진행 현황</p>
      <div className="proto-table-wrap">
        <table className="proto-table">
          <thead>
            <tr>
              <th>파일번호</th>
              <th>파일명</th>
              <th>담당자</th>
              <th style={{ minWidth: '180px' }}>진행률</th>
              <th className="text-center">마지막 작업</th>
              <th className="text-center">작업툴</th>
            </tr>
          </thead>
          <tbody>
            {s.workProgress.map((w) => (
              <tr key={w.fileNo + w.worker}>
                <td className="text-center">{w.fileNo}</td>
                <td>{w.fileName}</td>
                <td>{w.worker}</td>
                <td>
                  <div className="proto-progress-wrap">
                    <div className="proto-progress-bar">
                      <div
                        className={`proto-progress-fill${w.progress === 100 ? ' complete' : ''}`}
                        style={{ width: `${w.progress}%` }}
                      />
                    </div>
                    <span className="proto-progress-text">{w.progress}%</span>
                  </div>
                </td>
                <td className="text-center" style={{ fontSize: '12px' }}>{w.lastWork}</td>
                <td className="text-center">
                  <button
                    className="proto-worktool-btn"
                    onClick={() => handleOpenTool(w.fileName)}
                    disabled={w.progress === 0}
                  >
                    작업툴 열기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 탭 6: AI QC 결과 요약 ───
function AiQcTab({ s }) {
  const scoreClass = s.qcScore >= 90 ? 'proto-qc-score-good' : s.qcScore >= 80 ? 'proto-qc-score-ok' : 'proto-qc-score-bad';
  const totalErrors = s.qcResults.reduce((acc, r) => acc + r.count, 0);

  return (
    <div className="proto-tab-panel">
      <div className="proto-qc-summary">
        <div className="proto-qc-score-card">
          <span className="proto-qc-score-label">AI 품질 점수</span>
          <span className={`proto-qc-score-value ${scoreClass}`}>{s.qcScore}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>/ 100</span>
        </div>
        <div className="proto-qc-score-card">
          <span className="proto-qc-score-label">총 발견 오류</span>
          <span className="proto-qc-score-value" style={{ color: totalErrors > 10 ? '#f87171' : '#fbbf24' }}>{totalErrors}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>건</span>
        </div>
        <div className="proto-qc-score-card">
          <span className="proto-qc-score-label">검출 유형</span>
          <span className="proto-qc-score-value" style={{ color: 'var(--text-muted)' }}>{s.qcResults.length}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>종류</span>
        </div>
      </div>

      <p className="proto-section-title">오류 유형별 상세</p>
      <div className="proto-table-wrap">
        <table className="proto-table">
          <thead>
            <tr>
              <th>오류 유형</th>
              <th className="text-center">발견 건수</th>
              <th className="text-center">심각도</th>
              <th>예시</th>
            </tr>
          </thead>
          <tbody>
            {s.qcResults.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.errorType}</td>
                <td className="text-center">{r.count}건</td>
                <td className="text-center">{severityBadge(r.severity)}</td>
                <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.example || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
        * AI QC는 보조 도구입니다. 최종 품질 판단은 검수 담당자가 결정합니다.
      </p>
    </div>
  );
}

// ─── 탭 7: 납품관리 ───
function DeliveryTab({ s }) {
  return (
    <div className="proto-tab-panel">
      <p className="proto-section-title">납품 현황</p>
      <div className="proto-table-wrap">
        <table className="proto-table">
          <thead>
            <tr>
              <th className="text-center">순번</th>
              <th className="text-center">납품예정일</th>
              <th className="text-center">실제 납품일</th>
              <th className="text-center">납품 형식</th>
              <th>납품 파일/범위</th>
              <th className="text-center">납품 상태</th>
            </tr>
          </thead>
          <tbody>
            {s.deliveries.map((d) => (
              <tr key={d.no}>
                <td className="text-center">{d.no}차</td>
                <td className="text-center">{d.dueDate}</td>
                <td className="text-center">{d.deliveredDate}</td>
                <td className="text-center">{d.format}</td>
                <td>{d.files}</td>
                <td className="text-center">{deliveryBadge(d.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 탭 8: 정산확인 ───
function SettlementTab({ s }) {
  const total = s.settlement.items.reduce((acc, it) => acc + it.amount, 0);
  const totalNet = s.settlement.items.reduce((acc, it) => acc + it.netAmount, 0);

  return (
    <div className="proto-tab-panel">
      <div className="proto-settle-status">
        <span className="proto-settle-status-label">정산 상태</span>
        {settleBadge(s.settlement.status)}
      </div>

      <p className="proto-section-title">작업자별 정산 내역</p>
      <div className="proto-table-wrap">
        <table className="proto-table">
          <thead>
            <tr>
              <th>담당자</th>
              <th className="text-center">역할</th>
              <th className="text-right">작업금액 (원)</th>
              <th className="text-center">세율</th>
              <th className="text-right">실수령액 (원)</th>
            </tr>
          </thead>
          <tbody>
            {s.settlement.items.map((it, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{it.worker}</td>
                <td className="text-center">{it.role}</td>
                <td className="text-right">{fmt(it.amount)}</td>
                <td className="text-center">{it.taxRate}%</td>
                <td className="text-right">{fmt(it.netAmount)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, background: 'var(--surface-light)' }}>
              <td colSpan={2}>합계</td>
              <td className="text-right">{fmt(total)}</td>
              <td className="text-center">-</td>
              <td className="text-right">{fmt(totalNet)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
        * 세금은 3.3% 원천징수 기준입니다. 정산 확정은 정식 서비스에서 처리됩니다.
      </p>
    </div>
  );
}

// ─── 탭 9: 이력/메모 ───
function HistoryMemoTab({ s }) {
  const handleAddMemo = () => {
    window.alert('[프로토타입 안내]\n메모 작성 기능은 정식 서비스 단계에서 구현 예정입니다.');
  };

  return (
    <div className="proto-tab-panel">
      <p className="proto-section-title">작업 이력</p>
      <div className="proto-timeline">
        {s.history.map((h, i) => (
          <div key={i} className="proto-timeline-item">
            <div className="proto-timeline-dot" />
            <div className="proto-timeline-dttm">{h.dttm}</div>
            <div>
              <span className="proto-timeline-event">{h.event}</span>
              <span className="proto-timeline-actor">· {h.actor}</span>
            </div>
            {h.detail && <div className="proto-timeline-detail">{h.detail}</div>}
          </div>
        ))}
      </div>

      <div className="proto-memo-section">
        <p className="proto-section-title">메모</p>
        <div className="proto-memo-list">
          {s.memos.length === 0
            ? <div className="proto-memo-empty">등록된 메모가 없습니다.</div>
            : s.memos.map((m, i) => (
              <div key={i} className="proto-memo-item">
                <div className="proto-memo-meta">{m.dttm} · {m.author}</div>
                <div className="proto-memo-content">{m.content}</div>
              </div>
            ))
          }
        </div>
        <button className="proto-memo-add-btn" onClick={handleAddMemo}>
          + 메모 추가
        </button>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───
export default function WorkDetailProto({ samples, backPath }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  const s = samples.find((v) => v.id === id);

  if (!s) {
    return (
      <div className="notion-page" style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>샘플 데이터를 찾을 수 없습니다.</p>
        <button className="btn-ghost" style={{ marginTop: '12px' }} onClick={() => navigate(backPath)}>
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const tabContent = [
    <BasicInfoTab s={s} />,
    <FileManageTab s={s} />,
    <ProjectManageTab s={s} />,
    <AssignManageTab s={s} />,
    <ManualGlossaryTab s={s} />,
    <WorkProgressTab s={s} />,
    <AiQcTab s={s} />,
    <DeliveryTab s={s} />,
    <SettlementTab s={s} />,
    <HistoryMemoTab s={s} />,
  ];

  return (
    <div className="notion-page proto-detail-page">
      {/* 헤더 */}
      <div className="proto-page-header">
        <button className="proto-back-btn" onClick={() => navigate(backPath)}>
          ← 목록으로
        </button>
        <div className="proto-header-info">
          <div className="proto-header-meta">
            <span className="proto-header-company">{s.entNm}</span>
            <span className="proto-header-type">{s.bssTypeName}</span>
          </div>
          <h1 className="proto-header-title">{s.servTitle}</h1>
          <div className="proto-header-badges">
            {statusBadge(s.overallStatus)}
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>납품기한 {s.dueDate}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>의뢰 {s.regDttm}</span>
          </div>
        </div>
        <span className="proto-notice-chip">5차 고도화 프로토타입</span>
      </div>

      {/* 탭 */}
      <Box>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: '1px solid var(--border-color)',
            minHeight: '40px',
            '& .MuiTab-root': {
              color: 'var(--text-secondary)',
              fontWeight: 500,
              fontSize: '13px',
              minHeight: '40px',
              padding: '8px 14px',
              textTransform: 'none',
            },
            '& .Mui-selected': { color: 'var(--accent-color) !important', fontWeight: 600 },
            '& .MuiTabs-indicator': { backgroundColor: 'var(--accent-color)' },
          }}
        >
          {TAB_LABELS.map((label) => <Tab key={label} label={label} />)}
        </Tabs>
      </Box>

      {tabContent[tab]}
    </div>
  );
}
