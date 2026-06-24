import { useState, useRef } from 'react';
import { getVodSamples, getMeetingSamples, updateSampleFiles, updateSampleSubjects, updateSampleNoteEntries, updateSampleMemoEntries, updateSampleSpecialNote } from './protoStore';
import { useUserStore } from '../../../../stores/userStore';
import { useParams, useNavigate } from 'react-router-dom';
import { toAppUrl } from '../../../../utils/worktoolRoute';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import '../../../../styles/notion-list.css';
import './ProtoDetail.css';

const TAB_LABELS = [
  '기본정보', '파일관리', '프로젝트 관리', '매뉴얼·용어집 세팅',
  'AI QC 결과 요약', '납품관리', '정산확인', '이력/메모',
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

// 현재 시각을 'YYYY-MM-DD HH:MM' 형식으로 반환 (로그 기록용)
function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── 특이사항 / 내부 메모: 작성자·시각 로그가 남는 추가·수정·삭제 카드 ───
function EditableLogCard({ variant, icon, iconClass, title, entries, author, onChange, hideAdd }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const confirmAdd = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...entries, { id: `log-${Date.now()}`, author, dttm: nowStamp(), content: text }]);
    setDraft('');
    setAdding(false);
  };

  const startEdit = (entry) => { setEditingId(entry.id); setEditDraft(entry.content); };

  const confirmEdit = (id) => {
    const text = editDraft.trim();
    if (!text) return;
    onChange(entries.map((e) => (e.id === id ? { ...e, content: text } : e)));
    setEditingId(null);
  };

  const removeEntry = (id) => onChange(entries.filter((e) => e.id !== id));

  return (
    <div className={`proto-basic-extra-card proto-basic-extra-card--${variant}`}>
      <div className="proto-basic-extra-header">
        <span className={`proto-basic-extra-icon ${iconClass}`}>{icon}</span>
        <span className="proto-basic-extra-title">{title}</span>
        {!hideAdd && <button className="proto-log-add-btn" onClick={() => { setAdding(true); setDraft(''); }} title="추가">+</button>}
      </div>
      <div className={`proto-basic-extra-body proto-basic-extra-body--${variant}`}>
        {adding && (
          <div className="proto-log-input-row">
            <textarea
              className="proto-log-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="내용을 입력하세요"
              rows={2}
              autoFocus
            />
            <div className="proto-log-input-actions">
              <button className="proto-log-btn proto-log-btn--save" onClick={confirmAdd}>등록</button>
              <button className="proto-log-btn" onClick={() => setAdding(false)}>취소</button>
            </div>
          </div>
        )}

        {entries.length === 0 && !adding ? (
          <div className="proto-log-empty">등록된 내용이 없습니다.</div>
        ) : (
          <div className="proto-log-list">
            {entries.map((entry) => (
              <div key={entry.id} className="proto-log-item">
                {editingId === entry.id ? (
                  <div className="proto-log-input-row">
                    <textarea
                      className="proto-log-input"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                    <div className="proto-log-input-actions">
                      <button className="proto-log-btn proto-log-btn--save" onClick={() => confirmEdit(entry.id)}>저장</button>
                      <button className="proto-log-btn" onClick={() => setEditingId(null)}>취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="proto-log-item-head">
                      <span className="proto-log-meta">{entry.dttm} · {entry.author}</span>
                      <span className="proto-log-actions">
                        <button className="proto-log-action" onClick={() => startEdit(entry)}>수정</button>
                        <button className="proto-log-action proto-log-action--del" onClick={() => removeEntry(entry.id)}>삭제</button>
                      </span>
                    </div>
                    <div className="proto-log-content">{entry.content}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 탭 1: 기본정보 ───
function BasicInfoTab({ s }) {
  // VOD 작업관리에서만 특이사항/내부 메모를 로그형(추가·수정·삭제) 카드로 제공
  const isVod = s.bssTypeName !== '회의록';
  const authorName = useUserStore((st) => st.user?.membNm) || '관리자';

  // 탭 전환 후 재마운트 시 store 최신값으로 복원 (stale prop 스냅샷 방지)
  const [noteEntries, setNoteEntries] = useState(() => {
    const store = isVod ? getVodSamples() : getMeetingSamples();
    const cur = store.find((v) => v.id === s.id);
    const entries = cur?.noteEntries ?? s.noteEntries;
    if (entries) return entries;
    const seed = s.specialNote || s.remark;
    return seed ? [{ id: 'note-seed', author: '관리자', dttm: s.regDttm || '', content: seed }] : [];
  });
  const [memoEntries, setMemoEntries] = useState(() => {
    const store = isVod ? getVodSamples() : getMeetingSamples();
    const cur = store.find((v) => v.id === s.id);
    const entries = cur?.memoEntries ?? s.memoEntries;
    if (entries) return entries;
    return s.internalMemo ? [{ id: 'memo-seed', author: '관리자', dttm: s.regDttm || '', content: s.internalMemo }] : [];
  });

  const syncNotes = (next) => {
    setNoteEntries(next);
    updateSampleNoteEntries(s.id, next);
    if (!isVod) updateSampleSpecialNote(s.id, next[next.length - 1]?.content ?? '');
  };
  const syncMemos = (next) => { setMemoEntries(next); updateSampleMemoEntries(s.id, next); };

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
        <EditableLogCard
          variant="note"
          icon="★"
          iconClass="proto-basic-extra-icon--star"
          title="특이사항"
          entries={noteEntries}
          author={authorName}
          onChange={syncNotes}
          hideAdd={!isVod}
        />
        <EditableLogCard
          variant="memo"
          icon="≡"
          iconClass="proto-basic-extra-icon--memo"
          title="내부 메모"
          entries={memoEntries}
          author={authorName}
          onChange={syncMemos}
          hideAdd={!isVod}
        />
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

// ─── 탭 2: 파일관리 ───
function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// 'HH:MM:SS' → 초(number)
function durationToSec(d) {
  if (!d || d === '-') return 0;
  const parts = d.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// 초 → 'HH:MM:SS'
function secToDuration(sec) {
  if (sec <= 0) return '00:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function FileManageTab({ s }) {
  const isVod = s.bssTypeName !== '회의록';
  // 탭 전환 후 재마운트 시 store 최신값으로 복원 (stale prop 스냅샷 방지)
  const [files, setFiles] = useState(() => {
    const store = isVod ? getVodSamples() : getMeetingSamples();
    return store.find((v) => v.id === s.id)?.files ?? s.files;
  });
  const [dragOver, setDragOver] = useState(false);
  const [checked, setChecked] = useState(new Set());
  const fileInputRef = useRef();

  // 파일 한 개의 미디어 재생시간을 브라우저 API로 추출 ('HH:MM:SS')
  const extractDuration = (file) => new Promise((resolve) => {
    const el = document.createElement(isVod ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(secToDuration(Math.round(el.duration))); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve('-'); };
    el.src = url;
  });

  const addFiles = async (fileList) => {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const uploadDttm = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
    const base = files.length;
    const arr = Array.from(fileList);
    const durations = await Promise.all(arr.map(extractDuration));
    const next = arr.map((f, i) => ({
      fileNo: base + i + 1,
      fileName: f.name,
      duration: durations[i],
      size: fmtSize(f.size),
      uploadDttm,
    }));
    const updated = [...files, ...next];
    setFiles(updated);
    updateSampleFiles(s.id, updated);
  };

  const toggleCheck = (fileNo) => setChecked((prev) => {
    const next = new Set(prev);
    next.has(fileNo) ? next.delete(fileNo) : next.add(fileNo);
    return next;
  });

  const toggleAll = () => {
    setChecked(checked.size === files.length ? new Set() : new Set(files.map((f) => f.fileNo)));
  };

  const deleteSelected = () => {
    const updated = files.filter((f) => !checked.has(f.fileNo));
    setFiles(updated);
    setChecked(new Set());
    updateSampleFiles(s.id, updated);
  };

  const deleteAll = () => {
    setFiles([]);
    setChecked(new Set());
    updateSampleFiles(s.id, []);
  };

  const totalSec = files.reduce((acc, f) => acc + durationToSec(f.duration), 0);
  const selectedSec = files
    .filter((f) => checked.has(f.fileNo))
    .reduce((acc, f) => acc + durationToSec(f.duration), 0);
  // duration이 있는 파일이 하나라도 있으면 합산값 표시, 전부 '-'이면 s.totalPlayTm 폴백
  const hasKnownDuration = files.some((f) => f.duration && f.duration !== '-');
  const totalDuration = hasKnownDuration ? secToDuration(totalSec) : (s.totalPlayTm || '-');

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

      <div className="proto-file-bulk-actions">
        <button
          className="proto-file-bulk-btn proto-file-bulk-btn--all"
          onClick={deleteAll}
          disabled={files.length === 0}
        >
          일괄 삭제
        </button>
        <button
          className="proto-file-bulk-btn proto-file-bulk-btn--sel"
          onClick={deleteSelected}
          disabled={checked.size === 0}
        >
          선택 삭제 {checked.size > 0 ? `(${checked.size})` : ''}
        </button>
      </div>

      <div className="proto-table-wrap proto-table-wrap--scroll">
        <table className="proto-table">
          <thead>
            <tr>
              <th className="text-center" style={{ width: '36px' }}>
                <input
                  type="checkbox"
                  checked={files.length > 0 && checked.size === files.length}
                  onChange={toggleAll}
                />
              </th>
              <th>파일번호</th>
              <th>파일명</th>
              <th className="text-center">재생시간</th>
              <th className="text-center">파일크기</th>
              <th className="text-center">업로드일</th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>등록된 파일이 없습니다.</td></tr>
            ) : (
              files.map((f) => (
                <tr key={f.fileNo} className={checked.has(f.fileNo) ? 'proto-row-checked' : ''}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={checked.has(f.fileNo)}
                      onChange={() => toggleCheck(f.fileNo)}
                    />
                  </td>
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
      <div className="proto-file-summary">
        <span>총 {files.length}개 파일</span>
        <span className="proto-file-summary-sep">·</span>
        <span>전체 재생시간 {totalDuration}</span>
        {checked.size > 0 && (
          <>
            <span className="proto-file-summary-sep">·</span>
            <span className="proto-file-summary-sel">선택 재생시간 {secToDuration(selectedSec)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 탭 3: 프로젝트 관리 ───

function FileSelectModal({ files, usedFileNos, onConfirm, onClose }) {
  const [selected, setSelected] = useState(new Set());

  const toggle = (fileNo) => setSelected(prev => {
    const next = new Set(prev);
    next.has(fileNo) ? next.delete(fileNo) : next.add(fileNo);
    return next;
  });

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-hd">
          <span className="pm-modal-title">파일 선택</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>
        <p className="pm-modal-hint">이미 다른 프로젝트에 사용 중인 파일은 선택할 수 없습니다.</p>
        <div className="proto-table-wrap pm-file-select-table">
          <table className="proto-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>파일명</th>
                <th className="text-center">재생시간</th>
                <th className="text-center">파일크기</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>파일관리 탭에 등록된 파일이 없습니다.</td></tr>
              ) : files.map(f => {
                const used = usedFileNos.has(f.fileNo);
                return (
                  <tr key={f.fileNo}>
                    <td className="text-center">
                      <input type="checkbox" checked={selected.has(f.fileNo)} disabled={used} onChange={() => !used && toggle(f.fileNo)} />
                    </td>
                    <td style={{ color: used ? 'var(--text-muted)' : undefined }}>
                      {f.fileName}
                      {used && <span className="pm-used-tag">사용중</span>}
                    </td>
                    <td className="text-center" style={{ color: used ? 'var(--text-muted)' : undefined }}>{f.duration}</td>
                    <td className="text-center" style={{ color: used ? 'var(--text-muted)' : undefined }}>{f.size}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pm-modal-ft">
          <button className="proto-log-btn" onClick={onClose}>취소</button>
          <button
            className="proto-log-btn proto-log-btn--save"
            onClick={() => { if (selected.size > 0) onConfirm(selected); }}
            disabled={selected.size === 0}
          >
            선택 완료 ({selected.size}개)
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignPickModal({ title, current, onConfirm, onClose }) {
  const [name, setName] = useState(current || '');
  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal pm-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-hd">
          <span className="pm-modal-title">{title}</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <label className="preg-label" style={{ display: 'block', marginBottom: '6px' }}>이름</label>
          <input
            className="preg-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="이름을 입력하세요"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && onConfirm(name.trim())}
          />
        </div>
        <div className="pm-modal-ft">
          <button className="proto-log-btn" onClick={onClose}>취소</button>
          <button className="proto-log-btn proto-log-btn--save" onClick={() => onConfirm(name.trim())}>확인</button>
        </div>
      </div>
    </div>
  );
}

// projFiles의 workTime 합산 → 'HH:MM:SS'
function calcProjWorkTime(projFiles) {
  if (!projFiles || projFiles.length === 0) return '0:00:00';
  const total = projFiles.reduce((acc, f) => acc + durationToSec(f.workTime), 0);
  return total > 0 ? secToDuration(total) : '0:00:00';
}

// ─── 웍스파이 등록 모달 ───
function WorkspyRegisterModal({ proj, onConfirm, onClose }) {
  const now = new Date();
  const fmtLocal = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [form, setForm] = useState({
    name: proj.name,
    desc: proj.name,
    workers: '1',
    unitPrice: '내부 기준 적용',
    recruitStart: fmtLocal(new Date(now.getTime())),
    recruitEnd:   fmtLocal(new Date(now.getTime() + 3600000)),
    workStart:    fmtLocal(new Date(now.getTime() + 7200000)),
    workEnd:      fmtLocal(new Date(now.getTime() + 10800000)),
    isImportant: false,
    openApply: true,
  });

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal pm-modal--workspy" onClick={(e) => e.stopPropagation()}>
        <div className="pm-modal-hd">
          <span className="pm-modal-title">새 프로젝트</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="pm-workspy-body">
          <div className="pm-workspy-field">
            <label className="preg-label">프로젝트명 *</label>
            <input className="preg-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div className="pm-workspy-field">
            <label className="preg-label">프로젝트 설명 *</label>
            <div className="pm-desc-editor">
              <div className="pm-desc-toolbar">
                {['B', '/', 'S', 'H2', 'H3', '• 목록', '1. 목록', '" 인용'].map((t) => (
                  <button key={t} className="pm-desc-tool-btn" type="button">{t}</button>
                ))}
              </div>
              <textarea
                className="pm-desc-textarea"
                value={form.desc}
                onChange={(e) => set('desc', e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="pm-workspy-row">
            <div className="pm-workspy-field">
              <label className="preg-label">작업자 수 *</label>
              <input className="preg-input" type="number" min="1" value={form.workers} onChange={(e) => set('workers', e.target.value)} />
            </div>
            <div className="pm-workspy-field">
              <label className="preg-label">단가 *</label>
              <input className="preg-input" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} />
            </div>
          </div>

          <div className="pm-workspy-row">
            <div className="pm-workspy-field">
              <label className="preg-label">모집 시작 *</label>
              <input className="preg-input" type="datetime-local" value={form.recruitStart} onChange={(e) => set('recruitStart', e.target.value)} />
            </div>
            <div className="pm-workspy-field">
              <label className="preg-label">모집 종료 *</label>
              <input className="preg-input" type="datetime-local" value={form.recruitEnd} onChange={(e) => set('recruitEnd', e.target.value)} />
            </div>
          </div>

          <div className="pm-workspy-row">
            <div className="pm-workspy-field">
              <label className="preg-label">작업 시작 *</label>
              <input className="preg-input" type="datetime-local" value={form.workStart} onChange={(e) => set('workStart', e.target.value)} />
            </div>
            <div className="pm-workspy-field">
              <label className="preg-label">작업 종료 *</label>
              <input className="preg-input" type="datetime-local" value={form.workEnd} onChange={(e) => set('workEnd', e.target.value)} />
            </div>
          </div>

          <div className="pm-workspy-checks">
            <label className="pm-workspy-check-label">
              <input type="checkbox" checked={form.isImportant} onChange={(e) => set('isImportant', e.target.checked)} />
              <span>중요 프로젝트</span>
            </label>
            <label className="pm-workspy-check-label">
              <input type="checkbox" checked={form.openApply} onChange={(e) => set('openApply', e.target.checked)} />
              <span>누구나 지원 가능</span>
            </label>
          </div>
        </div>

        <div className="pm-modal-ft">
          <button className="proto-log-btn" onClick={onClose}>취소</button>
          <button className="proto-log-btn proto-log-btn--save" onClick={() => onConfirm(form)}>등록</button>
        </div>
      </div>
    </div>
  );
}

const SEED_PROJ_FILES = [
  { fileNo: 'seed-1', fileName: '20260512135718_2026-12 피해교원 진술_심의장.wav', split: '분할', range: '00:07:55 ~ 00:44:05', workTime: '00:36:05', status: '검수완료', progress: 100, lastWork: '2026-06-07 17:00', worker: '유진_작업자(dbwls0681@naver.com)', reviewer: '' },
  { fileNo: 'seed-2', fileName: '20260512144220_2026-12 관련학생 진술_심의장.wav', split: '-',    range: '',                     workTime: '00:17:57', status: '검수완료', progress: 55,  lastWork: '2026-06-11 16:00', worker: '박현정_0459(phj951124@naver.com)', reviewer: '' },
  { fileNo: 'seed-3', fileName: '20260512151913_2026-12 심의_심의장.wav',           split: '-',    range: '',                     workTime: '00:17:58', status: '검수완료', progress: 100, lastWork: '2026-06-07 17:00', worker: '헌정은(yataome81@naver.com)', reviewer: '' },
];

// ─── VOD 전용: 과목 → 주차/차수 → 파일 계층 뷰 ───────────────────────────
const VOD_SUBJECT_SEED = [
  {
    id: 'vsubj-001',
    name: '지구과학개론',
    expanded: true,
    batches: [
      {
        id: 'vbatch-001-1',
        label: '1주차 / 1차 입고',
        workspyRegistered: true,
        status: '작업중',
        filesExpanded: false,
        projFiles: [
          { fileNo: 1, fileName: '1강_오리엔테이션.mp4',  split: '-',    range: '',                    workTime: '00:52:30', workspyStatus: '등록완료', regMethod: '묶음 등록', bundleGroup: 'A', status: '완료',   progress: 100, worker: '이민정(minjeong@edu.kr)', reviewer: '정채원(jcw@edu.kr)' },
          { fileNo: 2, fileName: '2강_기초개념.mp4',       split: '-',    range: '',                    workTime: '00:48:20', workspyStatus: '등록완료', regMethod: '묶음 등록', bundleGroup: 'A', status: '완료',   progress: 100, worker: '이민정(minjeong@edu.kr)', reviewer: '정채원(jcw@edu.kr)' },
          { fileNo: 3, fileName: '3강_핵심이론.mp4',       split: '분할', range: '00:00:00 ~ 00:27:00', workTime: '00:27:15', workspyStatus: '등록완료', regMethod: '묶음 등록', bundleGroup: 'A', status: '작업중', progress: 68,  worker: '이민정(minjeong@edu.kr)', reviewer: '' },
          { fileNo: 4, fileName: '4강_응용예제.mp4',       split: '-',    range: '',                    workTime: '01:15:50', workspyStatus: '미등록',   regMethod: '미등록',   bundleGroup: '',  status: '대기',   progress: 0,   worker: '',                        reviewer: '' },
          { fileNo: 5, fileName: '5강_종합정리.mp4',       split: '-',    range: '',                    workTime: '00:40:15', workspyStatus: '미등록',   regMethod: '미등록',   bundleGroup: '',  status: '대기',   progress: 0,   worker: '',                        reviewer: '' },
        ],
      },
      {
        id: 'vbatch-001-2',
        label: '2주차 / 2차 입고',
        workspyRegistered: false,
        status: '배정대기',
        filesExpanded: false,
        projFiles: [
          { fileNo: 6, fileName: '6강_실습I.mp4',    split: '-', range: '', workTime: '00:50:00', workspyStatus: '미등록', regMethod: '미등록', bundleGroup: '', status: '대기', progress: 0, worker: '', reviewer: '' },
          { fileNo: 7, fileName: '7강_실습II.mp4',   split: '-', range: '', workTime: '00:47:30', workspyStatus: '등록완료', regMethod: '개별 등록', bundleGroup: '', status: '대기', progress: 0, worker: '', reviewer: '' },
          { fileNo: 8, fileName: '8강_중간정리.mp4', split: '-', range: '', workTime: '00:53:10', workspyStatus: '미등록', regMethod: '미등록', bundleGroup: '', status: '대기', progress: 0, worker: '', reviewer: '' },
          { fileNo: 9, fileName: '9강_응용심화.mp4', split: '-', range: '', workTime: '01:02:00', workspyStatus: '미등록', regMethod: '미등록', bundleGroup: '', status: '대기', progress: 0, worker: '', reviewer: '' },
        ],
      },
    ],
  },
  {
    id: 'vsubj-002',
    name: '기초영어회화',
    expanded: true,
    batches: [
      {
        id: 'vbatch-002-1',
        label: '1주차 / 1차 입고',
        workspyRegistered: true,
        status: '검수중',
        filesExpanded: false,
        projFiles: [
          { fileNo: 1, fileName: 'Unit01_Greetings.mp4',  split: '-', range: '', workTime: '00:45:00', workspyStatus: '등록완료', regMethod: '묶음 등록', bundleGroup: 'A', status: '검수중', progress: 85,  worker: '박정호(jhpark@edu.kr)', reviewer: '정채원(jcw@edu.kr)' },
          { fileNo: 2, fileName: 'Unit02_Daily_Life.mp4', split: '-', range: '', workTime: '00:42:30', workspyStatus: '등록완료', regMethod: '묶음 등록', bundleGroup: 'A', status: '완료',   progress: 100, worker: '박정호(jhpark@edu.kr)', reviewer: '정채원(jcw@edu.kr)' },
          { fileNo: 3, fileName: 'Unit03_Shopping.mp4',   split: '-', range: '', workTime: '00:48:00', workspyStatus: '등록대기', regMethod: '미등록',   bundleGroup: '',  status: '대기',   progress: 0,   worker: '',                      reviewer: '' },
        ],
      },
    ],
  },
  {
    id: 'vsubj-003',
    name: '컴퓨터활용',
    expanded: false,
    batches: [],
  },
];

const BATCH_STATUS_META = {
  '작업중':  { cls: 'proto-status-working',  label: '작업중'  },
  '검수중':  { cls: 'proto-status-checking', label: '검수중'  },
  '완료':    { cls: 'proto-status-done',     label: '완료'    },
  '배정대기': { cls: 'proto-status-wait',    label: '배정대기' },
};

function batchStatusBadge(st) {
  const m = BATCH_STATUS_META[st] ?? { cls: 'proto-status-wait', label: st };
  return <span className={`proto-status-badge ${m.cls}`} style={{ fontSize: '11px' }}>{m.label}</span>;
}

const VOD_DUMMY_WORKERS   = ['이민정', '박정호', '현정은', '김지수', '오나연'];
const VOD_DUMMY_REVIEWERS = ['정채원', '김검수', '최검수', '한지민'];

function VodRegModalForm({ form, set }) {
  return (
    <>
      <div className="pm-workspy-field">
        <label className="preg-label">프로젝트명 *</label>
        <input className="preg-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div className="pm-workspy-field">
        <label className="preg-label">프로젝트 설명 *</label>
        <div className="pm-desc-editor">
          <div className="pm-desc-toolbar">
            {['B', '/', 'S', 'H2', 'H3', '• 목록', '1. 목록', '" 인용'].map((t) => (
              <button key={t} className="pm-desc-tool-btn" type="button">{t}</button>
            ))}
          </div>
          <textarea className="pm-desc-textarea" value={form.desc} onChange={(e) => set('desc', e.target.value)} rows={3} />
        </div>
      </div>
      <div className="pm-workspy-row">
        <div className="pm-workspy-field">
          <label className="preg-label">작업자 수 *</label>
          <input className="preg-input" type="number" min="1" value={form.workers} onChange={(e) => set('workers', e.target.value)} />
        </div>
        <div className="pm-workspy-field">
          <label className="preg-label">단가 *</label>
          <input className="preg-input" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} />
        </div>
      </div>
      <div className="pm-workspy-row">
        <div className="pm-workspy-field">
          <label className="preg-label">모집 시작 *</label>
          <input className="preg-input" type="datetime-local" value={form.recruitStart} onChange={(e) => set('recruitStart', e.target.value)} />
        </div>
        <div className="pm-workspy-field">
          <label className="preg-label">모집 종료 *</label>
          <input className="preg-input" type="datetime-local" value={form.recruitEnd} onChange={(e) => set('recruitEnd', e.target.value)} />
        </div>
      </div>
      <div className="pm-workspy-row">
        <div className="pm-workspy-field">
          <label className="preg-label">작업 시작 *</label>
          <input className="preg-input" type="datetime-local" value={form.workStart} onChange={(e) => set('workStart', e.target.value)} />
        </div>
        <div className="pm-workspy-field">
          <label className="preg-label">작업 종료 *</label>
          <input className="preg-input" type="datetime-local" value={form.workEnd} onChange={(e) => set('workEnd', e.target.value)} />
        </div>
      </div>
      <div className="pm-workspy-checks">
        <label className="pm-workspy-check-label">
          <input type="checkbox" checked={form.isImportant} onChange={(e) => set('isImportant', e.target.checked)} />
          <span>중요 프로젝트</span>
        </label>
        <label className="pm-workspy-check-label">
          <input type="checkbox" checked={form.openApply} onChange={(e) => set('openApply', e.target.checked)} />
          <span>누구나 지원 가능</span>
        </label>
      </div>
      <div className="pm-workspy-field">
        <label className="preg-label">메모</label>
        <textarea className="pm-desc-textarea" value={form.note} onChange={(e) => set('note', e.target.value)} rows={2} placeholder="전달 사항을 입력하세요" />
      </div>
    </>
  );
}

function initRegForm(batchLabel) {
  const now = new Date();
  const fmtLocal = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return {
    name:         batchLabel,
    desc:         batchLabel,
    workers:      '1',
    unitPrice:    '내부 기준 적용',
    recruitStart: fmtLocal(new Date(now.getTime())),
    recruitEnd:   fmtLocal(new Date(now.getTime() + 3600000)),
    workStart:    fmtLocal(new Date(now.getTime() + 7200000)),
    workEnd:      fmtLocal(new Date(now.getTime() + 10800000)),
    isImportant:  false,
    openApply:    true,
    note:         '',
  };
}

function VodBundleRegModal({ batchLabel, files, bundleGroup, onConfirm, onClose }) {
  const [form, setForm] = useState(() => initRegForm(batchLabel));
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const totalSec = files.reduce((acc, f) => acc + durationToSec(f.workTime || '0:00:00'), 0);
  const totalTime = secToDuration(totalSec);
  const totalMin = Math.ceil(totalSec / 60);
  const [displayMin, setDisplayMin] = useState(String(totalMin || ''));

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal pm-modal--workspy" onClick={(e) => e.stopPropagation()}>
        <div className="pm-modal-hd">
          <span className="pm-modal-title">웍스파이 등록</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="pm-workspy-body">
          {/* 등록 방식 메타 */}
          <div className="vod-reg-modal-meta">
            <span className="vod-reg-modal-meta-item">
              <span className="vod-reg-modal-meta-label">등록 방식</span>
              <span className="vod-reg-modal-meta-val vod-reg-modal-meta-val--bundle">묶음 등록 (묶음 {bundleGroup})</span>
            </span>
            <span className="vod-reg-modal-meta-item">
              <span className="vod-reg-modal-meta-label">생성될 모집 건</span>
              <span className="vod-reg-modal-meta-val">1건</span>
            </span>
          </div>

          {/* 대상 파일 */}
          <div className="pm-workspy-field">
            <label className="preg-label">포함 파일 ({files.length}개)</label>
            <div className="vod-wspy-file-list">
              {files.map((f) => (
                <div key={f.fileNo} className="vod-wspy-file-item">
                  <span className="vod-wspy-file-icon">▶</span>
                  <span className="vod-wspy-file-name">{f.fileName}</span>
                  <span className="vod-wspy-file-time">{f.workTime || '-'}</span>
                </div>
              ))}
            </div>
            <div className="vod-reg-time-summary">
              <span>합산 작업시간: <strong>{totalTime}</strong></span>
              <span style={{ marginLeft: '16px' }}>
                웍스파이 표시 분량:
                <input
                  className="vod-reg-min-input"
                  type="number"
                  min="1"
                  value={displayMin}
                  onChange={(e) => setDisplayMin(e.target.value)}
                />
                분
              </span>
            </div>
          </div>

          <VodRegModalForm form={form} set={set} />
        </div>
        <div className="pm-modal-ft">
          <button className="proto-log-btn" onClick={onClose}>취소</button>
          <button className="proto-log-btn proto-log-btn--save" onClick={() => onConfirm(form, displayMin)}>등록</button>
        </div>
      </div>
    </div>
  );
}

function VodSingleRegModal({ batchLabel, files, onConfirm, onClose }) {
  const [form, setForm] = useState(() => initRegForm(batchLabel));
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const [fileMinutes, setFileMinutes] = useState(() =>
    Object.fromEntries(files.map((f) => [f.fileNo, String(Math.ceil(durationToSec(f.workTime || '0:00:00') / 60) || '')]))
  );

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal pm-modal--workspy" onClick={(e) => e.stopPropagation()}>
        <div className="pm-modal-hd">
          <span className="pm-modal-title">웍스파이 등록</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="pm-workspy-body">
          {/* 등록 방식 메타 */}
          <div className="vod-reg-modal-meta">
            <span className="vod-reg-modal-meta-item">
              <span className="vod-reg-modal-meta-label">등록 방식</span>
              <span className="vod-reg-modal-meta-val vod-reg-modal-meta-val--single">개별 등록</span>
            </span>
            <span className="vod-reg-modal-meta-item">
              <span className="vod-reg-modal-meta-label">생성될 모집 건</span>
              <span className="vod-reg-modal-meta-val">{files.length}건</span>
            </span>
          </div>

          {/* 파일 목록 (개별 분량 입력) */}
          <div className="pm-workspy-field">
            <label className="preg-label">등록 파일 ({files.length}개)</label>
            <div className="vod-wspy-file-list vod-wspy-file-list--single">
              {files.map((f) => (
                <div key={f.fileNo} className="vod-wspy-file-item vod-wspy-file-item--single">
                  <span className="vod-wspy-file-icon">▶</span>
                  <span className="vod-wspy-file-name">{f.fileName}</span>
                  <span className="vod-wspy-file-time">{f.workTime || '-'}</span>
                  <span className="vod-wspy-file-min-wrap">
                    <input
                      className="vod-reg-min-input"
                      type="number"
                      min="1"
                      value={fileMinutes[f.fileNo] || ''}
                      onChange={(e) => setFileMinutes((prev) => ({ ...prev, [f.fileNo]: e.target.value }))}
                    />
                    <span>분</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <VodRegModalForm form={form} set={set} />
        </div>
        <div className="pm-modal-ft">
          <button className="proto-log-btn" onClick={onClose}>취소</button>
          <button className="proto-log-btn proto-log-btn--save" onClick={() => onConfirm(form, fileMinutes)}>등록</button>
        </div>
      </div>
    </div>
  );
}

function VodBulkAssignModal({ files, type, onConfirm, onClose }) {
  const [picked, setPicked] = useState('');
  const options = type === 'worker' ? VOD_DUMMY_WORKERS : VOD_DUMMY_REVIEWERS;
  const label = type === 'worker' ? '작업자' : '검수자';

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal pm-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="pm-modal-hd">
          <span className="pm-modal-title">{label} 일괄 배정</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <label className="preg-label" style={{ display: 'block', marginBottom: '6px' }}>선택된 파일 ({files.length}개)</label>
          <div className="vod-wspy-file-list" style={{ marginBottom: '16px' }}>
            {files.map((f) => (
              <div key={f.fileNo} className="vod-wspy-file-item">
                <span className="vod-wspy-file-icon">▶</span>
                <span className="vod-wspy-file-name">{f.fileName}</span>
              </div>
            ))}
          </div>
          <label className="preg-label" style={{ display: 'block', marginBottom: '8px' }}>배정할 {label} *</label>
          <div className="vod-bulk-assign-options">
            {options.map((name) => (
              <button
                key={name}
                className={`vod-bulk-assign-option${picked === name ? ' vod-bulk-assign-option--sel' : ''}`}
                onClick={() => setPicked(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="pm-modal-ft">
          <button className="proto-log-btn" onClick={onClose}>취소</button>
          <button
            className="proto-log-btn proto-log-btn--save"
            disabled={!picked}
            style={{ opacity: picked ? 1 : 0.45 }}
            onClick={() => picked && onConfirm(picked)}
          >
            배정
          </button>
        </div>
      </div>
    </div>
  );
}

function VodProjectManageView({ s }) {
  const [subjects, setSubjects]         = useState(VOD_SUBJECT_SEED);
  const [newSubjModal, setNewSubjModal] = useState(false);
  const [newSubjName, setNewSubjName]   = useState('');
  const [newBatchModal, setNewBatchModal] = useState(null); // subjId
  const [newBatchLabel, setNewBatchLabel] = useState('');
  const [batchSelections, setBatchSelections] = useState({});      // { ['subjId:batchId']: fileNo[] }
  const [fileAssignModal, setFileAssignModal] = useState(null);    // { subjId, batchId, fileNo, type }
  const [bundleModal, setBundleModal]         = useState(null);    // { subjId, batchId, files, bundleGroup }
  const [singleRegModal, setSingleRegModal]   = useState(null);    // { subjId, batchId, files }
  const [bulkAssignModal, setBulkAssignModal] = useState(null);    // { subjId, batchId, files: [...], type }

  const setSubj = (fn) => setSubjects((prev) => prev.map(fn));
  const setBatch = (subjId, batchId, fn) =>
    setSubj((subj) =>
      subj.id !== subjId ? subj : { ...subj, batches: subj.batches.map((b) => b.id === batchId ? fn(b) : b) }
    );

  const toggleSubjExpand = (subjId) =>
    setSubj((s2) => s2.id === subjId ? { ...s2, expanded: !s2.expanded } : s2);

  const toggleFilesExpand = (subjId, batchId) =>
    setBatch(subjId, batchId, (b) => ({ ...b, filesExpanded: !b.filesExpanded }));

  const addSubject = () => {
    if (!newSubjName.trim()) return;
    setSubjects((prev) => [...prev, { id: `vsubj-${Date.now()}`, name: newSubjName.trim(), expanded: true, batches: [] }]);
    setNewSubjName('');
    setNewSubjModal(false);
  };

  const addBatch = () => {
    if (!newBatchLabel.trim() || !newBatchModal) return;
    const batch = {
      id: `vbatch-${Date.now()}`,
      label: newBatchLabel.trim(),
      workspyRegistered: false,
      status: '배정대기',
      worker: '',
      reviewer: '',
      filesExpanded: false,
      projFiles: [],
    };
    setSubj((s2) => s2.id === newBatchModal ? { ...s2, batches: [...s2.batches, batch] } : s2);
    setNewBatchLabel('');
    setNewBatchModal(null);
  };

  const bKey = (subjId, batchId) => `${subjId}:${batchId}`;
  const getSelected = (subjId, batchId) => batchSelections[bKey(subjId, batchId)] || [];

  const toggleFileCheck = (subjId, batchId, fileNo) => {
    const k = bKey(subjId, batchId);
    const cur = batchSelections[k] || [];
    const next = cur.includes(fileNo) ? cur.filter((n) => n !== fileNo) : [...cur, fileNo];
    setBatchSelections((prev) => ({ ...prev, [k]: next }));
  };

  const toggleAllCheck = (subjId, batchId, fileNos) => {
    const k = bKey(subjId, batchId);
    const cur = batchSelections[k] || [];
    const allChecked = fileNos.length > 0 && fileNos.every((n) => cur.includes(n));
    setBatchSelections((prev) => ({ ...prev, [k]: allChecked ? [] : [...fileNos] }));
  };

  const nextBundleLabel = (projFiles) => {
    const letters = projFiles.map((f) => f.bundleGroup).filter((g) => g && /^[A-Z]$/.test(g));
    if (letters.length === 0) return 'A';
    const max = letters.reduce((a, b) => (a > b ? a : b));
    return String.fromCharCode(max.charCodeAt(0) + 1);
  };

  const getSelFiles = (subjId, batchId) => {
    const sel = getSelected(subjId, batchId);
    if (sel.length === 0) return null;
    const batch = subjects.find((s2) => s2.id === subjId)?.batches.find((b) => b.id === batchId);
    return batch ? batch.projFiles.filter((f) => sel.includes(f.fileNo)) : null;
  };

  const openBundleReg = (subjId, batchId) => {
    const files = getSelFiles(subjId, batchId);
    if (!files) return;
    const batch = subjects.find((s2) => s2.id === subjId)?.batches.find((b) => b.id === batchId);
    setBundleModal({ subjId, batchId, files, bundleGroup: nextBundleLabel(batch?.projFiles || []) });
  };

  const openSingleReg = (subjId, batchId) => {
    const files = getSelFiles(subjId, batchId);
    if (!files) return;
    setSingleRegModal({ subjId, batchId, files });
  };

  const confirmBundleReg = (subjId, batchId, files, bundleGroup) => {
    const fileNos = files.map((f) => f.fileNo);
    setBatch(subjId, batchId, (b) => ({
      ...b,
      workspyRegistered: true,
      projFiles: b.projFiles.map((f) =>
        fileNos.includes(f.fileNo)
          ? { ...f, workspyStatus: '등록완료', regMethod: '묶음 등록', bundleGroup }
          : f
      ),
    }));
    setBundleModal(null);
  };

  const confirmSingleReg = (subjId, batchId, files) => {
    const fileNos = files.map((f) => f.fileNo);
    setBatch(subjId, batchId, (b) => ({
      ...b,
      workspyRegistered: true,
      projFiles: b.projFiles.map((f) =>
        fileNos.includes(f.fileNo)
          ? { ...f, workspyStatus: '등록완료', regMethod: '개별 등록', bundleGroup: '' }
          : f
      ),
    }));
    setSingleRegModal(null);
  };

  const setFileAssign = (subjId, batchId, fileNo, type, name) => {
    setBatch(subjId, batchId, (b) => ({
      ...b,
      projFiles: b.projFiles.map((f) => f.fileNo === fileNo ? { ...f, [type]: name } : f),
    }));
    setFileAssignModal(null);
  };

  const addFileToBatch = (subjId, batchId) => {
    const subj = subjects.find((s2) => s2.id === subjId);
    const batch = subj?.batches.find((b) => b.id === batchId);
    if (!batch) return;
    const nextNo = (batch.projFiles.length > 0 ? Math.max(...batch.projFiles.map((f) => f.fileNo)) : 0) + 1;
    const newFile = {
      fileNo: nextNo,
      fileName: `신규파일_${nextNo}.mp4`,
      split: '-', range: '', workTime: '-',
      status: '대기', progress: 0, worker: '', reviewer: '',
    };
    setBatch(subjId, batchId, (b) => ({ ...b, projFiles: [...b.projFiles, newFile] }));
  };

  const deleteFileFromBatch = (subjId, batchId, fileNo) =>
    setBatch(subjId, batchId, (b) => ({ ...b, projFiles: b.projFiles.filter((f) => f.fileNo !== fileNo) }));

  const confirmBulkAssign = (subjId, batchId, fileNos, type, name) => {
    setBatch(subjId, batchId, (b) => ({
      ...b,
      projFiles: b.projFiles.map((f) => fileNos.includes(f.fileNo) ? { ...f, [type]: name } : f),
    }));
    setBulkAssignModal(null);
  };

  const fileAssignBatch = fileAssignModal
    ? subjects.find((s2) => s2.id === fileAssignModal.subjId)?.batches.find((b) => b.id === fileAssignModal.batchId)
    : null;

  return (
    <div className="proto-tab-panel">
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p className="proto-section-title" style={{ margin: 0 }}>프로젝트 현황</p>
        <button className="proto-file-add-btn" onClick={() => setNewSubjModal(true)}>+ 새 프로젝트</button>
      </div>

      {/* 새 과목 모달 */}
      {newSubjModal && (
        <div className="pm-overlay" onClick={() => { setNewSubjModal(false); setNewSubjName(''); }}>
          <div className="pm-modal pm-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-hd">
              <span className="pm-modal-title">새 프로젝트 등록</span>
              <button className="preg-x-btn" onClick={() => { setNewSubjModal(false); setNewSubjName(''); }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <label className="preg-label" style={{ display: 'block', marginBottom: '6px' }}>프로젝트명 *</label>
              <input
                className="preg-input"
                value={newSubjName}
                onChange={(e) => setNewSubjName(e.target.value)}
                placeholder="예: 지구과학개론 VOD"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && addSubject()}
              />
            </div>
            <div className="pm-modal-ft">
              <button className="proto-log-btn" onClick={() => { setNewSubjModal(false); setNewSubjName(''); }}>취소</button>
              <button className="proto-log-btn proto-log-btn--save" onClick={addSubject}>등록</button>
            </div>
          </div>
        </div>
      )}

      {/* 새 주차/차수 모달 */}
      {newBatchModal && (
        <div className="pm-overlay" onClick={() => { setNewBatchModal(null); setNewBatchLabel(''); }}>
          <div className="pm-modal pm-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-hd">
              <span className="pm-modal-title">주차 / 차수 추가</span>
              <button className="preg-x-btn" onClick={() => { setNewBatchModal(null); setNewBatchLabel(''); }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <label className="preg-label" style={{ display: 'block', marginBottom: '6px' }}>주차/차수 명칭 *</label>
              <input
                className="preg-input"
                value={newBatchLabel}
                onChange={(e) => setNewBatchLabel(e.target.value)}
                placeholder="예: 2주차 / 2차 입고"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && addBatch()}
              />
            </div>
            <div className="pm-modal-ft">
              <button className="proto-log-btn" onClick={() => { setNewBatchModal(null); setNewBatchLabel(''); }}>취소</button>
              <button className="proto-log-btn proto-log-btn--save" onClick={addBatch}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 과목 목록 */}
      {subjects.length === 0 && (
        <div className="proto-empty-state">
          <span style={{ fontSize: '30px' }}>📂</span>
          <p style={{ margin: '6px 0 2px', fontWeight: 500 }}>과목을 등록하여 주세요.</p>
        </div>
      )}

      <div className="vod-pm-subject-list">
        {subjects.map((subj) => (
          <div key={subj.id} className="vod-pm-subject-card">
            {/* 과목 헤더 */}
            <div className="vod-pm-subject-header">
              <button className="vod-pm-subject-toggle" onClick={() => toggleSubjExpand(subj.id)}>
                <span className="pm-expand-icon">{subj.expanded ? '▼' : '▶'}</span>
                <span className="vod-pm-subject-name">{subj.name}</span>
              </button>
              <span className="vod-pm-subject-meta">
                {subj.batches.length > 0 && (
                  <span className="vod-pm-subj-batch-count">{subj.batches.length}차수</span>
                )}
              </span>
              <button
                className="vod-pm-add-batch-btn"
                onClick={() => { setNewBatchModal(subj.id); setNewBatchLabel(''); }}
              >
                + 차수/주차 추가
              </button>
            </div>

            {/* 차수 목록 */}
            {subj.expanded && (
              <div className="vod-pm-batch-list">
                {subj.batches.length === 0 && (
                  <div className="vod-pm-batch-empty">
                    차수/주차가 없습니다. "+ 차수/주차 추가" 버튼으로 입고 묶음을 추가하세요.
                  </div>
                )}

                {subj.batches.map((batch) => (
                  <div key={batch.id} className="vod-pm-batch-item">
                    {/* 차수 요약 행 */}
                    <div className="vod-pm-batch-row">
                      <button
                        className="vod-pm-batch-toggle"
                        onClick={() => toggleFilesExpand(subj.id, batch.id)}
                        title="파일 목록 펼치기/접기"
                      >
                        {batch.filesExpanded ? '▼' : '▶'}
                      </button>

                      <div className="vod-pm-batch-info">
                        <span className="vod-pm-batch-label">{batch.label}</span>
                        <span className="vod-pm-batch-filecount">파일 {batch.projFiles.length}개</span>
                        {batch.workspyRegistered
                          ? <span className="vod-pm-wspy-chip vod-pm-wspy-chip--done">웍스파이 등록 완료</span>
                          : <span className="vod-pm-wspy-chip vod-pm-wspy-chip--none">웍스파이 미등록</span>
                        }
                        {batchStatusBadge(batch.status)}
                      </div>

                      <div className="vod-pm-batch-actions">
                        <button
                          className="pm-btn"
                          onClick={() => toggleFilesExpand(subj.id, batch.id)}
                        >
                          {batch.filesExpanded ? '파일 접기' : '파일 보기'}
                        </button>
                      </div>
                    </div>

                    {/* 파일 테이블 (펼쳐졌을 때) */}
                    {batch.filesExpanded && (() => {
                      const selFiles = getSelected(subj.id, batch.id);
                      const allFileNos = batch.projFiles.map((f) => f.fileNo);
                      const allChecked = allFileNos.length > 0 && allFileNos.every((n) => selFiles.includes(n));
                      return (
                        <div className="vod-pm-file-table-wrap">
                          <div className="vod-pm-file-table-header">
                            <span className="vod-pm-file-table-count">파일 {batch.projFiles.length}개</span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <button className="vod-pm-file-add-btn" onClick={() => addFileToBatch(subj.id, batch.id)}>+ 파일 추가</button>
                              <button
                                className={`vod-pm-sel-wspy-btn${selFiles.length > 0 ? '' : ' vod-pm-sel-wspy-btn--disabled'}`}
                                disabled={selFiles.length === 0}
                                onClick={() => openBundleReg(subj.id, batch.id)}
                              >
                                선택 파일 묶음 등록{selFiles.length > 0 ? ` (${selFiles.length})` : ''}
                              </button>
                              <button
                                className={`vod-pm-sel-wspy-btn${selFiles.length > 0 ? '' : ' vod-pm-sel-wspy-btn--disabled'}`}
                                disabled={selFiles.length === 0}
                                onClick={() => openSingleReg(subj.id, batch.id)}
                              >
                                선택 파일 개별 등록{selFiles.length > 0 ? ` (${selFiles.length})` : ''}
                              </button>
                              <button
                                className={`vod-pm-bulk-assign-btn${selFiles.length > 0 ? '' : ' vod-pm-sel-wspy-btn--disabled'}`}
                                disabled={selFiles.length === 0}
                                onClick={() => selFiles.length > 0 && setBulkAssignModal({ subjId: subj.id, batchId: batch.id, files: batch.projFiles.filter((f) => selFiles.includes(f.fileNo)), type: 'worker' })}
                              >
                                선택 파일 작업자 일괄 배정
                              </button>
                              <button
                                className={`vod-pm-bulk-assign-btn${selFiles.length > 0 ? '' : ' vod-pm-sel-wspy-btn--disabled'}`}
                                disabled={selFiles.length === 0}
                                onClick={() => selFiles.length > 0 && setBulkAssignModal({ subjId: subj.id, batchId: batch.id, files: batch.projFiles.filter((f) => selFiles.includes(f.fileNo)), type: 'reviewer' })}
                              >
                                선택 파일 검수자 일괄 배정
                              </button>
                            </div>
                          </div>
                          <div className="proto-table-wrap proto-table-wrap--scroll">
                            <table className="proto-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '32px' }}>
                                    <input
                                      type="checkbox"
                                      className="vod-pm-file-check"
                                      checked={allChecked}
                                      onChange={() => toggleAllCheck(subj.id, batch.id, allFileNos)}
                                    />
                                  </th>
                                  <th>파일명</th>
                                  <th className="text-center">분할</th>
                                  <th className="text-center">구간</th>
                                  <th className="text-center">작업시간</th>
                                  <th className="text-center">웍스파이 상태</th>
                                  <th className="text-center">등록 방식</th>
                                  <th className="text-center">작업 상태</th>
                                  <th>진행 현황</th>
                                  <th className="text-center">작업자</th>
                                  <th className="text-center">검수자</th>
                                  <th className="text-center">관리</th>
                                </tr>
                              </thead>
                              <tbody>
                                {batch.projFiles.length === 0 ? (
                                  <tr>
                                    <td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
                                      파일이 없습니다.
                                    </td>
                                  </tr>
                                ) : batch.projFiles.map((f) => {
                                  const wSt = f.workspyStatus || '미등록';
                                  const isDone = wSt === '등록완료';
                                  return (
                                    <tr key={f.fileNo} className={selFiles.includes(f.fileNo) ? 'vod-pm-row-checked' : ''}>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          className="vod-pm-file-check"
                                          checked={selFiles.includes(f.fileNo)}
                                          onChange={() => toggleFileCheck(subj.id, batch.id, f.fileNo)}
                                        />
                                      </td>
                                      <td className="vod-pm-file-name-cell" title={f.fileName}>{f.fileName}</td>
                                      <td className="text-center" style={{ fontSize: '12px' }}>{f.split || '-'}</td>
                                      <td className="text-center" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{f.range || '-'}</td>
                                      <td className="text-center" style={{ fontSize: '12px' }}>{f.workTime || '-'}</td>
                                      <td className="text-center">
                                        <span className={`vod-pm-wspy-status vod-pm-wspy-status--${wSt === '등록완료' ? 'done' : wSt === '등록대기' ? 'wait' : wSt === '등록실패' ? 'fail' : 'none'}`}>
                                          {wSt}
                                        </span>
                                      </td>
                                      <td className="text-center">
                                        <span className={`vod-pm-reg-method vod-pm-reg-method--${f.regMethod === '묶음 등록' ? 'bundle' : f.regMethod === '개별 등록' ? 'single' : 'none'}`}>
                                          {f.regMethod || '미등록'}
                                        </span>
                                        {f.bundleGroup && (
                                          <span className="vod-pm-bundle-group-label">묶음 {f.bundleGroup}</span>
                                        )}
                                      </td>
                                      <td className="text-center">
                                        <span className={
                                          f.status === '완료' || f.status === '검수완료' ? 'pm-status-done' :
                                          f.status === '작업중' || f.status === '검수중'  ? 'pm-status-working' : 'pm-status-wait'
                                        }>
                                          {f.status}
                                        </span>
                                      </td>
                                      <td>
                                        <div className="proto-progress-wrap">
                                          <div className="proto-progress-bar">
                                            <div className={`proto-progress-fill${f.progress === 100 ? ' complete' : ''}`} style={{ width: `${f.progress}%` }} />
                                          </div>
                                          <span className="proto-progress-text">{f.progress}%</span>
                                        </div>
                                      </td>
                                      <td className="text-center">
                                        {f.worker
                                          ? <span className="vod-pm-assign-tag vod-pm-assign-tag--worker">{f.worker}</span>
                                          : <button className="vod-pm-assign-btn" onClick={() => setFileAssignModal({ subjId: subj.id, batchId: batch.id, fileNo: f.fileNo, type: 'worker' })}>작업자 배정</button>
                                        }
                                      </td>
                                      <td className="text-center">
                                        {f.reviewer
                                          ? <span className="vod-pm-assign-tag vod-pm-assign-tag--reviewer">{f.reviewer}</span>
                                          : <button className="vod-pm-assign-btn" onClick={() => setFileAssignModal({ subjId: subj.id, batchId: batch.id, fileNo: f.fileNo, type: 'reviewer' })}>검수자 배정</button>
                                        }
                                      </td>
                                      <td className="text-center">
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                          <button
                                            className={`pm-row-btn pm-row-btn--work${!f.worker ? ' pm-row-btn--disabled' : ''}`}
                                            disabled={!f.worker}
                                            title={!f.worker ? '작업자를 먼저 배정하세요' : '작업 시작'}
                                            onClick={() => f.worker && window.open(toAppUrl(`/worktool?mode=vod&role=START&popup=true&fileNo=${f.fileNo}`), `worktool_work_${f.fileNo}`, 'popup,width=1400,height=900')}
                                          >작업시작</button>
                                          <button
                                            className={`pm-row-btn pm-row-btn--review${!f.reviewer ? ' pm-row-btn--disabled' : ''}`}
                                            disabled={!f.reviewer}
                                            title={!f.reviewer ? '검수자를 먼저 배정하세요' : '검수 시작'}
                                            onClick={() => f.reviewer && window.open(toAppUrl(`/worktool?mode=vod&role=START_REVIEW&popup=true&fileNo=${f.fileNo}`), `worktool_review_${f.fileNo}`, 'popup,width=1400,height=900')}
                                          >검수시작</button>
                                          <button className="pm-row-btn pm-row-btn--del" onClick={() => deleteFileFromBatch(subj.id, batch.id, f.fileNo)}>삭제</button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 파일별 작업자/검수자 배정 모달 */}
      {fileAssignModal && fileAssignBatch && (() => {
        const targetFile = fileAssignBatch.projFiles.find((f) => f.fileNo === fileAssignModal.fileNo);
        return (
          <AssignPickModal
            title={fileAssignModal.type === 'worker' ? '작업자 배정' : '검수자 배정'}
            current={targetFile?.[fileAssignModal.type] || ''}
            onConfirm={(name) => setFileAssign(fileAssignModal.subjId, fileAssignModal.batchId, fileAssignModal.fileNo, fileAssignModal.type, name)}
            onClose={() => setFileAssignModal(null)}
          />
        );
      })()}

      {/* 묶음 등록 모달 */}
      {bundleModal && (() => {
        const batch = subjects.find((s2) => s2.id === bundleModal.subjId)?.batches.find((b) => b.id === bundleModal.batchId);
        return (
          <VodBundleRegModal
            batchLabel={batch?.label || ''}
            files={bundleModal.files}
            bundleGroup={bundleModal.bundleGroup}
            onConfirm={(form, displayMin) => confirmBundleReg(bundleModal.subjId, bundleModal.batchId, bundleModal.files, bundleModal.bundleGroup)}
            onClose={() => setBundleModal(null)}
          />
        );
      })()}

      {/* 개별 등록 모달 */}
      {singleRegModal && (() => {
        const batch = subjects.find((s2) => s2.id === singleRegModal.subjId)?.batches.find((b) => b.id === singleRegModal.batchId);
        return (
          <VodSingleRegModal
            batchLabel={batch?.label || ''}
            files={singleRegModal.files}
            onConfirm={(form, fileMinutes) => confirmSingleReg(singleRegModal.subjId, singleRegModal.batchId, singleRegModal.files)}
            onClose={() => setSingleRegModal(null)}
          />
        );
      })()}

      {/* 선택 파일 일괄 배정 모달 */}
      {bulkAssignModal && (
        <VodBulkAssignModal
          files={bulkAssignModal.files}
          type={bulkAssignModal.type}
          onConfirm={(name) => confirmBulkAssign(bulkAssignModal.subjId, bulkAssignModal.batchId, bulkAssignModal.files.map((f) => f.fileNo), bulkAssignModal.type, name)}
          onClose={() => setBulkAssignModal(null)}
        />
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function ProjectManageTab({ s }) {
  const isVodProj = s.bssTypeName !== '회의록';
  const initProjects = () => {
    // 탭 전환 후 재마운트 시 store 최신값으로 복원 (stale prop 스냅샷 방지)
    const store = isVodProj ? getVodSamples() : getMeetingSamples();
    const cur = store.find((v) => v.id === s.id);
    const subjs = cur?.subjects || s.subjects || [];
    if (subjs.length > 0) return subjs;
    if (s.bssTypeName === '회의록') {
      return [{
        id: 'proj-seed-001',
        name: '회의록 전사 프로젝트',
        status: '작업완료',
        workTime: '1:12:00',
        worker: '',
        reviewer: '',
        workspyRegistered: false,
        projFiles: SEED_PROJ_FILES,
        messages: { admin: '', worker: '', reviewer: '' },
        expanded: true,
      }];
    }
    return [];
  };

  const [projects, setProjects] = useState(initProjects);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjForm, setNewProjForm] = useState({ workers: '1', unitPrice: '내부 기준 적용', recruitStart: '', recruitEnd: '', workStart: '', workEnd: '' });
  const [fileModalFor, setFileModalFor] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [fileAssignModal, setFileAssignModal] = useState(null);
  const [expandedMsgs, setExpandedMsgs] = useState({});
  const [workspyModal, setWorkspyModal] = useState(null);

  const syncStore = (updated) => {
    setProjects(updated);
    updateSampleSubjects(s.id, updated);
  };

  const toggleExpand = (projId) => syncStore(projects.map(p => p.id === projId ? { ...p, expanded: !p.expanded } : p));
  const deleteProject = (projId) => syncStore(projects.filter(p => p.id !== projId));
  const toggleWorkspy = (projId) => syncStore(projects.map(p => p.id === projId ? { ...p, workspyRegistered: !p.workspyRegistered } : p));

  const registerWorkspy = (projId, form) => {
    syncStore(projects.map(p => p.id === projId ? { ...p, workspyRegistered: true, workspyData: form } : p));
    setWorkspyModal(null);
  };

  const setFileAssign = (projId, fileNo, type, name) => {
    syncStore(projects.map(p =>
      p.id === projId
        ? { ...p, projFiles: (p.projFiles || []).map(f => f.fileNo === fileNo ? { ...f, [type]: name } : f) }
        : p
    ));
    setFileAssignModal(null);
  };

  const removeFileWorker = (projId, fileNo, type) =>
    syncStore(projects.map(p =>
      p.id === projId
        ? { ...p, projFiles: (p.projFiles || []).map(f => f.fileNo === fileNo ? { ...f, [type]: '' } : f) }
        : p
    ));


  const addProjectFiles = (projId, fileNos) => {
    const newFiles = s.files
      .filter(f => fileNos.has(f.fileNo))
      .map(f => ({ fileNo: f.fileNo, fileName: f.fileName, split: '-', range: '', workTime: '-', status: '작업중', progress: 0, lastWork: '-', worker: '', reviewer: '' }));
    syncStore(projects.map(p =>
      p.id === projId ? { ...p, projFiles: [...(p.projFiles || []), ...newFiles] } : p
    ));
    setFileModalFor(null);
  };

  const setAssign = (projId, type, name) => {
    syncStore(projects.map(p => p.id === projId ? { ...p, [type]: name } : p));
    setAssignModal(null);
  };

  const createProject = () => {
    if (!newProjName.trim()) return;
    syncStore([...projects, {
      id: `proj-${Date.now()}`,
      name: newProjName.trim(),
      status: '작업중',
      workTime: '0:00:00',
      worker: '',
      reviewer: '',
      workspyRegistered: false,
      projFiles: [],
      messages: { admin: '', worker: '', reviewer: '' },
      expanded: true,
    }]);
    setNewProjName('');
    setShowAddForm(false);
  };

  const toggleMsg = (projId, key) => {
    const k = `${projId}-${key}`;
    setExpandedMsgs(prev => ({ ...prev, [k]: !prev[k] }));
  };

  const fileSelectUsedNos = fileModalFor
    ? new Set(projects.filter(p => p.id !== fileModalFor).flatMap(p => (p.projFiles || []).map(f => f.fileNo)))
    : new Set();

  const cancelAddForm = () => { setShowAddForm(false); setNewProjName(''); setNewProjForm({ workers: '1', unitPrice: '내부 기준 적용', recruitStart: '', recruitEnd: '', workStart: '', workEnd: '' }); };
  const setNpf = (k, v) => setNewProjForm(prev => ({ ...prev, [k]: v }));

  // VOD는 과목 → 주차/차수 계층 뷰로 분기
  if (isVodProj) return <VodProjectManageView s={s} />;

  return (
    <div className="proto-tab-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p className="proto-section-title" style={{ margin: 0 }}>프로젝트 현황</p>
        <button className="proto-file-add-btn" onClick={() => setShowAddForm(true)}>+ 새 프로젝트</button>
      </div>

      {showAddForm && (
        <div className="pm-overlay" onClick={cancelAddForm}>
          <div className="pm-modal pm-modal--workspy" onClick={e => e.stopPropagation()}>
            <div className="pm-modal-hd">
              <span className="pm-modal-title">새 프로젝트</span>
              <button className="preg-x-btn" onClick={cancelAddForm}>✕</button>
            </div>
            <div className="pm-workspy-body">
              <div className="pm-workspy-field">
                <label className="preg-label">프로젝트명 *</label>
                <input className="preg-input" value={newProjName} onChange={e => setNewProjName(e.target.value)} placeholder="회의록 전사 프로젝트" autoFocus onKeyDown={e => e.key === 'Enter' && createProject()} />
              </div>
              <div className="pm-workspy-row">
                <div className="pm-workspy-field">
                  <label className="preg-label">작업자 수 *</label>
                  <input className="preg-input" type="number" min="1" value={newProjForm.workers} onChange={e => setNpf('workers', e.target.value)} />
                </div>
                <div className="pm-workspy-field">
                  <label className="preg-label">단가 *</label>
                  <input className="preg-input" value={newProjForm.unitPrice} onChange={e => setNpf('unitPrice', e.target.value)} />
                </div>
              </div>
              <div className="pm-workspy-row">
                <div className="pm-workspy-field">
                  <label className="preg-label">모집 시작</label>
                  <input className="preg-input" type="datetime-local" value={newProjForm.recruitStart} onChange={e => setNpf('recruitStart', e.target.value)} />
                </div>
                <div className="pm-workspy-field">
                  <label className="preg-label">모집 종료</label>
                  <input className="preg-input" type="datetime-local" value={newProjForm.recruitEnd} onChange={e => setNpf('recruitEnd', e.target.value)} />
                </div>
              </div>
              <div className="pm-workspy-row">
                <div className="pm-workspy-field">
                  <label className="preg-label">작업 시작</label>
                  <input className="preg-input" type="datetime-local" value={newProjForm.workStart} onChange={e => setNpf('workStart', e.target.value)} />
                </div>
                <div className="pm-workspy-field">
                  <label className="preg-label">작업 종료</label>
                  <input className="preg-input" type="datetime-local" value={newProjForm.workEnd} onChange={e => setNpf('workEnd', e.target.value)} />
                </div>
              </div>
            </div>
            <div className="pm-modal-ft">
              <button className="proto-log-btn" onClick={cancelAddForm}>취소</button>
              <button className="proto-log-btn proto-log-btn--save" onClick={createProject}>과목 등록</button>
            </div>
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <div className="proto-empty-state">
          <span style={{ fontSize: '30px' }}>📂</span>
          <p style={{ margin: '6px 0 2px', fontWeight: 500 }}>프로젝트를 등록하여 주세요.</p>
        </div>
      )}

      <div className="pm-project-list">
        {projects.map(proj => (
          <div key={proj.id} className="pm-project-card">
            <div className="pm-project-header" onClick={() => toggleExpand(proj.id)}>
              <span className="pm-expand-icon">{proj.expanded ? '▼' : '▶'}</span>
              <span className="pm-project-name">{proj.name}</span>
              <span className={`proto-status-badge ${proj.status === '작업완료' ? 'proto-status-done' : 'proto-status-working'}`}>
                {proj.status}
              </span>
              <span className="pm-total-time-chip">총 {calcProjWorkTime(proj.projFiles)}</span>
              {proj.workspyRegistered && proj.workspyData && (() => {
                const d = proj.workspyData;
                const fmtD = (iso) => iso ? iso.split('T')[0].replace(/-/g, '.') : '-';
                return (
                  <>
                    <span className="pm-wspy-chip">작업자 {d.workers}명</span>
                    <span className="pm-wspy-chip">단가 {d.unitPrice}원</span>
                    <span className="pm-wspy-chip pm-wspy-chip--period">모집 {fmtD(d.recruitStart)} ~ {fmtD(d.recruitEnd)}</span>
                    <span className="pm-wspy-chip pm-wspy-chip--period">작업 {fmtD(d.workStart)} ~ {fmtD(d.workEnd)}</span>
                  </>
                );
              })()}
              {!proj.workspyRegistered && (
                <span className="pm-assign-area">
                  <span className="pm-assign-label">작업자</span>
                  <button className="pm-chip pm-chip--worker" onClick={e => { e.stopPropagation(); setAssignModal({ projId: proj.id, type: 'worker' }); }}>
                    {proj.worker || '작업자 배정'}
                  </button>
                  <span className="pm-assign-label">검수자</span>
                  <button className="pm-chip pm-chip--reviewer" onClick={e => { e.stopPropagation(); setAssignModal({ projId: proj.id, type: 'reviewer' }); }}>
                    {proj.reviewer || '검수자 배정'}
                  </button>
                </span>
              )}
            </div>

            {proj.expanded && (
              <div className="pm-project-body">
                <div className="pm-action-bar">
                  <button className="pm-btn">수정</button>
                  <button className="pm-btn" onClick={() => setFileModalFor(proj.id)}>+ 파일 추가</button>
                  <button
                    className={`pm-btn${proj.workspyRegistered ? ' pm-btn--active' : ''}`}
                    onClick={() => proj.workspyRegistered ? toggleWorkspy(proj.id) : setWorkspyModal(proj.id)}
                  >
                    {proj.workspyRegistered ? '웍스파이 등록됨' : '웍스파이 등록'}
                  </button>
                  {proj.workspyRegistered && (
                    <>
                      <button className="pm-btn">모집인원 조회</button>
                      <button className="pm-btn">웍스파이 마감</button>
                    </>
                  )}
                  <button className="pm-btn pm-btn--danger" onClick={() => deleteProject(proj.id)}>프로젝트 삭제</button>
                </div>

                <div className="proto-table-wrap proto-table-wrap--scroll">
                  <table className="proto-table">
                    <thead>
                      <tr>
                        <th>파일명</th>
                        <th className="text-center">분할</th>
                        <th className="text-center">구간</th>
                        <th className="text-center">작업시간</th>
                        <th className="text-center">상태</th>
                        {proj.workspyRegistered ? (
                          <>
                            <th style={{ minWidth: '200px' }}>작업자</th>
                            <th style={{ minWidth: '160px' }}>검수자</th>
                          </>
                        ) : (
                          <>
                            <th style={{ minWidth: '160px' }}>진행 현황</th>
                            <th className="text-center">마지막 작업<br/>(제출일)</th>
                          </>
                        )}
                        <th className="text-center">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(proj.projFiles || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                            "+ 파일 추가"를 눌러 파일을 추가하세요.
                          </td>
                        </tr>
                      ) : (proj.projFiles || []).map(f => (
                        <tr key={f.fileNo}>
                          <td style={{ fontSize: '13px' }}>{f.fileName}</td>
                          <td className="text-center">{f.split}</td>
                          <td className="text-center" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{f.range || '-'}</td>
                          <td className="text-center" style={{ fontSize: '12px' }}>
                            {f.workTime}
                            {proj.workspyRegistered && <span className="pm-edit-icon" title="수정">✏</span>}
                          </td>
                          <td className="text-center">
                            <span className={f.status === '검수완료' ? 'pm-status-done' : f.status === '작업완료' ? 'pm-status-done' : f.status === '작업중' ? 'pm-status-working' : 'pm-status-wait'}>
                              {f.status}
                            </span>
                          </td>
                          {proj.workspyRegistered ? (
                            <>
                              <td>
                                {f.worker ? (
                                  <span className="pm-file-worker-chip">
                                    {f.worker}
                                    <button className="pm-file-worker-remove" onClick={() => removeFileWorker(proj.id, f.fileNo, 'worker')}>✕</button>
                                  </span>
                                ) : (
                                  <button className="pm-chip pm-chip--worker" onClick={() => setFileAssignModal({ projId: proj.id, fileNo: f.fileNo, type: 'worker' })}>
                                    작업자 배정
                                  </button>
                                )}
                              </td>
                              <td>
                                {f.reviewer ? (
                                  <span className="pm-file-worker-chip pm-file-worker-chip--reviewer">
                                    {f.reviewer}
                                    <button className="pm-file-worker-remove" onClick={() => removeFileWorker(proj.id, f.fileNo, 'reviewer')}>✕</button>
                                  </span>
                                ) : (
                                  <button className="pm-chip pm-chip--reviewer" onClick={() => setFileAssignModal({ projId: proj.id, fileNo: f.fileNo, type: 'reviewer' })}>
                                    검수자 배정
                                  </button>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td>
                                <div className="proto-progress-wrap">
                                  <div className="proto-progress-bar">
                                    <div className={`proto-progress-fill${f.progress === 100 ? ' complete' : ''}`} style={{ width: `${f.progress}%` }} />
                                  </div>
                                  <span className="proto-progress-text">{f.progress}%</span>
                                </div>
                              </td>
                              <td className="text-center" style={{ fontSize: '12px' }}>{f.lastWork}</td>
                            </>
                          )}
                          <td className="text-center">
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button className="pm-row-btn pm-row-btn--work" onClick={() => window.open(toAppUrl(`/worktool?mode=vod&role=START&popup=true&fileNo=${f.fileNo}`), `worktool_work_${f.fileNo}`, 'popup,width=1400,height=900')}>작업시작</button>
                              <button className="pm-row-btn pm-row-btn--review" onClick={() => window.open(toAppUrl(`/worktool?mode=vod&role=START_REVIEW&popup=true&fileNo=${f.fileNo}`), `worktool_review_${f.fileNo}`, 'popup,width=1400,height=900')}>검수시작</button>
                              <button className="pm-row-btn pm-row-btn--del">삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pm-msg-section">
                  {[
                    { key: 'admin', label: '관리자 메시지' },
                    { key: 'worker', label: '작업자 메시지' },
                    { key: 'reviewer', label: '검수 메시지' },
                  ].map(({ key, label }) => {
                    const mk = `${proj.id}-${key}`;
                    const open = expandedMsgs[mk];
                    const msg = proj.messages?.[key] || '';
                    return (
                      <div key={key} className="pm-msg-item">
                        <button className="pm-msg-toggle" onClick={() => toggleMsg(proj.id, key)}>
                          <span className="pm-msg-arrow">{open ? '▼' : '▶'}</span>
                          <span>{label}</span>
                          {!msg && <span className="pm-msg-empty-hint">내용 없음</span>}
                        </button>
                        {open && (
                          <div className="pm-msg-content">
                            {msg || <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>등록된 메시지가 없습니다.</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {fileModalFor && (
        <FileSelectModal
          files={s.files}
          usedFileNos={fileSelectUsedNos}
          onConfirm={(selected) => addProjectFiles(fileModalFor, selected)}
          onClose={() => setFileModalFor(null)}
        />
      )}

      {assignModal && (
        <AssignPickModal
          title={assignModal.type === 'worker' ? '작업자 배정' : '검수자 배정'}
          current={projects.find(p => p.id === assignModal.projId)?.[assignModal.type] || ''}
          onConfirm={(name) => setAssign(assignModal.projId, assignModal.type, name)}
          onClose={() => setAssignModal(null)}
        />
      )}

      {fileAssignModal && (
        <AssignPickModal
          title={fileAssignModal.type === 'worker' ? '작업자 배정' : '검수자 배정'}
          current={projects.find(p => p.id === fileAssignModal.projId)?.projFiles?.find(f => f.fileNo === fileAssignModal.fileNo)?.[fileAssignModal.type] || ''}
          onConfirm={(name) => setFileAssign(fileAssignModal.projId, fileAssignModal.fileNo, fileAssignModal.type, name)}
          onClose={() => setFileAssignModal(null)}
        />
      )}


      {workspyModal && (
        <WorkspyRegisterModal
          proj={projects.find(p => p.id === workspyModal) || { name: '' }}
          onConfirm={(form) => registerWorkspy(workspyModal, form)}
          onClose={() => setWorkspyModal(null)}
        />
      )}
    </div>
  );
}

// ─── 탭 4: 매뉴얼·용어집 세팅 ───

// 작업 유형별 매뉴얼 기본 세팅 시드 (UI 데모용 정적 더미)
const MANUAL_WORK_TYPES = [
  { key: 'VOD', code: 'V', label: 'VOD' },
  { key: 'MEDIA', code: 'M', label: '미디어' },
  { key: 'SDH', code: 'S', label: 'SDH' },
  { key: 'EDU', code: 'E', label: '교육지원청' },
  { key: 'COUNCIL', code: 'A', label: '의회' },
];

// 적용된 매뉴얼 시드 (1개만 가능, UI 데모용 정적 더미)
const MANUAL_APPLIED_SEED = { id: 'm-1', name: 'VOD 기본 매뉴얼 v2', typeKey: 'VOD', lineCount: '기본 1줄 (2줄 허용)', charLimit: '20', sentenceFirst: true, syncOverflow: true, fillers: false, cpsAuto: true, speaker: true, nonverbal: true, updatedAt: '2026.04.06 14:30' };

// 새 매뉴얼 기본값
const EMPTY_MANUAL = {
  name: '', typeKey: 'VOD', lineCount: '기본 1줄 (2줄 허용)', charLimit: '20',
  sentenceFirst: true, syncOverflow: true, fillers: false, cpsAuto: true, speaker: true, nonverbal: false,
};

// 용어집 — 적용된 용어집 시드 (단일, null이면 미적용)
const GLOSSARY_APPLIED_SEED = {
  id: 'g-1',
  name: 'VOD 프로젝트 용어집 v1',
  projectName: '한양사이버대학교',
  appliedAt: '2026.04.06 14:30',
  termCount: 156,
  approvedCount: 110,
  pendingCount: 42,
  rejectedCount: 4,
  categories: ['과목명', '교수명', '전문용어', '온라인 강의'],
};

// 용어집 — 승인 대기 용어 목록 시드
const GLOSSARY_TERM_SEED = [
  { id: 'gt-1', original: '교육학 개론', changed: '교육학개론',      category: '과목명',   freq: 145, conf: 99, status: 'pending' },
  { id: 'gt-2', original: '김철수교수',  changed: '김철수 교수',     category: '교수명',   freq: 112, conf: 98, status: 'pending' },
  { id: 'gt-3', original: '온라인강의',  changed: '온라인 강의',     category: '전문용어', freq: 89,  conf: 95, status: 'pending' },
  { id: 'gt-4', original: '한양 사이버 대학교', changed: '한양사이버대학교', category: '고유명사', freq: 76, conf: 96, status: 'pending' },
  { id: 'gt-5', original: '메타 버스',  changed: '메타버스',        category: '전문용어', freq: 42,  conf: 89, status: 'pending' },
  { id: 'gt-6', original: '플립 러닝',  changed: '플립러닝',        category: '전문용어', freq: 38,  conf: 87, status: 'pending' },
];

// 토글 카드 (제목 + 설명, 켜짐/꺼짐)
function ManualToggleCard({ label, desc, on, onToggle }) {
  return (
    <button type="button" className={`mset-toggle-card${on ? ' mset-toggle-card--on' : ''}`} onClick={onToggle}>
      <span className="mset-toggle-dot" />
      <span className="mset-toggle-text">
        <span className="mset-toggle-label">{label}</span>
        <span className="mset-toggle-desc">{desc}</span>
      </span>
    </button>
  );
}

// 현재 시각을 'YYYY.MM.DD HH:MM' 형식으로 반환 (매뉴얼 최종 수정 표기용)
function manualStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ManualGlossaryTab({ s }) {
  const [manual, setManual] = useState(MANUAL_APPLIED_SEED); // 단일 매뉴얼 (null이면 미적용)
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const openModal = () => { setDraft(manual ? { ...manual } : { ...EMPTY_MANUAL }); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setDraft(null); };

  const removeManual = () => setManual(null);

  const saveModal = () => {
    if (!draft.name.trim()) return;
    const stamp = manualStamp();
    setManual({ ...draft, id: manual?.id || `m-${Date.now()}`, updatedAt: stamp });
    closeModal();
  };

  // 용어집 상태
  const [glossary, setGlossary] = useState(GLOSSARY_APPLIED_SEED); // null이면 미적용
  const [glsModalOpen, setGlsModalOpen] = useState(false);
  const [terms, setTerms] = useState(GLOSSARY_TERM_SEED);

  const openGlsModal = () => setGlsModalOpen(true);
  const closeGlsModal = () => setGlsModalOpen(false);
  const removeGlossary = () => { setGlossary(null); setTerms(GLOSSARY_TERM_SEED); };

  const approveTerm = (id) => setTerms((prev) => prev.map((t) => t.id === id ? { ...t, status: 'approved' } : t));
  const rejectTerm  = (id) => setTerms((prev) => prev.map((t) => t.id === id ? { ...t, status: 'rejected' } : t));
  const approveAll  = () => setTerms((prev) => prev.map((t) => t.status === 'pending' ? { ...t, status: 'approved' } : t));
  const rejectSelected = () => setTerms((prev) => prev.map((t) => t.status === 'pending' ? { ...t, status: 'rejected' } : t));

  const saveGlossary = () => {
    const approved = terms.filter((t) => t.status === 'approved').length;
    const rejected = terms.filter((t) => t.status === 'rejected').length;
    const pending  = terms.filter((t) => t.status === 'pending').length;
    const stamp = manualStamp();
    setGlossary((prev) => ({
      ...(prev || { id: `g-${Date.now()}`, name: 'VOD 프로젝트 용어집', projectName: s.client || '프로젝트', termCount: terms.length, categories: [...new Set(terms.map((t) => t.category))] }),
      approvedCount: approved,
      rejectedCount: rejected,
      pendingCount: pending,
      appliedAt: stamp,
    }));
    closeGlsModal();
  };

  const setD = (k, v) => setDraft((prev) => ({ ...prev, [k]: v }));
  const toggleD = (k) => setD(k, !draft[k]);

  const typeLabel = (key) => MANUAL_WORK_TYPES.find((t) => t.key === key)?.label || key;

  // 매뉴얼 카드 요약 칩
  const chips = (m) => [
    m.lineCount.replace(' (2줄 허용)', '').replace('기본 ', ''),
    `${m.charLimit}자`,
    m.sentenceFirst ? '문장 단위' : '싱크 우선',
    m.speaker ? '화자 구분' : '화자 미구분',
  ];

  return (
    <div className="proto-tab-panel">
      {/* ─── 매뉴얼 섹션 ─── */}
      <div className="mset-section-header">
        <p className="proto-section-title" style={{ margin: 0 }}>매뉴얼 — 적용된 매뉴얼 <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>(최대 1개)</span></p>
        <button className="proto-log-btn proto-log-btn--save mset-add-btn" onClick={openModal}>{manual ? '수정' : '+ 추가'}</button>
      </div>
      <div className="mset-list-wrap">
        {!manual ? (
          <div className="proto-log-empty">적용된 매뉴얼이 없습니다. "추가"를 눌러 매뉴얼을 설정하세요.</div>
        ) : (
          <div className="mset-list-row">
            <span className="proto-manual-card-type manual">{typeLabel(manual.typeKey)}</span>
            <span className="mset-list-label">{manual.name}</span>
            <div className="mset-list-chips">
              {chips(manual).map((ch, i) => (
                <span key={i} className="mset-summary-chip">{ch}</span>
              ))}
            </div>
            <span className="mset-list-updated">최종 수정: {manual.updatedAt}</span>
            <button className="proto-log-btn proto-log-btn--save mset-list-edit-btn" onClick={openModal}>수정</button>
            <button className="proto-log-btn mset-list-del-btn" onClick={removeManual}>삭제</button>
          </div>
        )}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
        {manual ? '매뉴얼 1개 적용됨' : '적용된 매뉴얼 없음'}
      </p>

      {/* ─── 용어집 섹션 ─── */}
      <div className="mset-section-header" style={{ marginTop: '24px' }}>
        <p className="proto-section-title" style={{ margin: 0 }}>용어집 — 적용된 용어집 <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>(최대 1개)</span></p>
        <button className="proto-log-btn proto-log-btn--save mset-add-btn" onClick={openGlsModal}>{glossary ? '관리/수정' : '+ 추가'}</button>
      </div>
      <div className="mset-list-wrap">
        {!glossary ? (
          <div className="proto-log-empty">적용된 용어집이 없습니다. "추가"를 눌러 용어집을 설정하세요.</div>
        ) : (
          <div className="mset-list-row">
            <span className="proto-manual-card-type glossary">용어집</span>
            <span className="mset-list-label">{glossary.name}</span>
            <div className="mset-list-chips">
              <span className="mset-summary-chip">승인 {glossary.approvedCount}개</span>
              <span className="mset-summary-chip">대기 {glossary.pendingCount}개</span>
              <span className="mset-summary-chip">거부 {glossary.rejectedCount}개</span>
            </div>
            <span className="mset-list-updated">최종 수정: {glossary.appliedAt}</span>
            <button className="proto-log-btn proto-log-btn--save mset-list-edit-btn" onClick={openGlsModal}>관리</button>
            <button className="proto-log-btn mset-list-del-btn" onClick={removeGlossary}>삭제</button>
          </div>
        )}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
        {glossary ? `용어집 1개 적용됨 · 총 ${glossary.termCount}개 용어 (승인 ${glossary.approvedCount}개)` : '적용된 용어집 없음'}
      </p>

      {/* ─── 용어집 관리 모달 ─── */}
      {glsModalOpen && (
        <div className="pm-overlay" onClick={closeGlsModal}>
          <div className="pm-modal gls-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-hd">
              <span className="pm-modal-title">용어집 AI 학습 결과 승인</span>
              <div className="gls-modal-hd-right">
                <span className="gls-project-chip">
                  <span className="gls-project-type">VOD</span>
                  {s.client || '한양사이버대학교'}
                </span>
                <button className="preg-x-btn" onClick={closeGlsModal}>✕</button>
              </div>
            </div>

            <div className="gls-modal-body">
              {/* 좌측: 통계 패널 */}
              <div className="gls-stats-panel">
                <p className="proto-section-title" style={{ margin: '0 0 8px' }}>프로젝트 학습 통계</p>
                <div className="gls-stat-card">
                  <span className="gls-stat-label">총 추출 용어 수</span>
                  <span className="gls-stat-value">{glossary?.termCount ?? terms.length}개</span>
                </div>
                <div className="gls-stat-card gls-stat-card--pending">
                  <span className="gls-stat-label">승인 대기</span>
                  <span className="gls-stat-value gls-stat-pending">{terms.filter((t) => t.status === 'pending').length}개</span>
                </div>
                <div className="gls-stat-row">
                  <div className="gls-stat-card gls-stat-card--half gls-stat-card--approved">
                    <span className="gls-stat-label">승인됨</span>
                    <span className="gls-stat-value gls-stat-approved">{terms.filter((t) => t.status === 'approved').length}</span>
                  </div>
                  <div className="gls-stat-card gls-stat-card--half gls-stat-card--rejected">
                    <span className="gls-stat-label">거부됨</span>
                    <span className="gls-stat-value gls-stat-rejected">{terms.filter((t) => t.status === 'rejected').length}</span>
                  </div>
                </div>
                <div className="gls-stat-card">
                  <span className="gls-stat-label">특화 용어 카테고리</span>
                  <div className="gls-category-chips">
                    {[...new Set(terms.map((t) => t.category))].map((c) => (
                      <span key={c} className="mset-summary-chip">{c}</span>
                    ))}
                  </div>
                </div>
                <div className="gls-stat-card gls-criteria-card">
                  <span className="gls-stat-label">AI 학습 추출 기준</span>
                  <div className="gls-criteria-rows">
                    <div className="gls-criteria-row"><span>최소 등장 빈도</span><span className="gls-criteria-val">10회 이상</span></div>
                    <div className="gls-criteria-row"><span>최소 신뢰도</span><span className="gls-criteria-val">85% 이상</span></div>
                    <div className="gls-criteria-row"><span>일치율</span><span className="gls-criteria-val">70% 이상</span></div>
                  </div>
                </div>
              </div>

              {/* 우측: 용어 목록 테이블 */}
              <div className="gls-table-panel">
                <div className="gls-table-header">
                  <p className="gls-table-title">
                    승인 대기 용어 목록
                    <span className="gls-table-subtitle">({s.client || 'VOD-한양사이버대학교'})</span>
                  </p>
                  <div className="gls-table-filters">
                    <button className="proto-log-btn gls-filter-btn">카테고리 필터</button>
                    <button className="proto-log-btn gls-filter-btn">빈도순</button>
                  </div>
                </div>
                <div className="gls-table-wrap">
                  <table className="gls-table">
                    <thead>
                      <tr>
                        <th>패턴 (기존 → 변경)</th>
                        <th>빈도</th>
                        <th>신뢰도</th>
                        <th>승인/거부</th>
                      </tr>
                    </thead>
                    <tbody>
                      {terms.map((t) => (
                        <tr key={t.id} className={t.status !== 'pending' ? `gls-row--${t.status}` : ''}>
                          <td>
                            <span className="gls-term-original">{t.original}</span>
                            <span className="gls-term-arrow"> → </span>
                            <span className="gls-term-changed">{t.changed}</span>
                            <span className="gls-term-category">{t.category}</span>
                          </td>
                          <td className="gls-td-center">{t.freq}회</td>
                          <td className="gls-td-center">
                            <span className={`gls-conf ${t.conf >= 95 ? 'gls-conf--high' : t.conf >= 90 ? 'gls-conf--mid' : 'gls-conf--low'}`}>{t.conf}%</span>
                          </td>
                          <td className="gls-td-center gls-td-actions">
                            {t.status === 'pending' ? (
                              <>
                                <button className="gls-approve-btn" onClick={() => approveTerm(t.id)}>✓</button>
                                <button className="gls-reject-btn" onClick={() => rejectTerm(t.id)}>✕</button>
                              </>
                            ) : t.status === 'approved' ? (
                              <span className="gls-status-badge gls-status--approved">승인됨</span>
                            ) : (
                              <span className="gls-status-badge gls-status--rejected">거부됨</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="pm-modal-ft gls-modal-ft">
              <button className="proto-log-btn gls-approve-all-btn" onClick={approveAll}>전체 일괄 승인</button>
              <button className="proto-log-btn gls-reject-sel-btn" onClick={rejectSelected}>선택 항목 거부</button>
              <div style={{ flex: 1 }} />
              <button className="proto-log-btn" onClick={closeGlsModal}>취소</button>
              <button className="proto-log-btn proto-log-btn--save" onClick={saveGlossary}>변경사항 저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 매뉴얼 추가/수정 모달 ─── */}
      {modalOpen && draft && (
        <div className="pm-overlay" onClick={closeModal}>
          <div className="pm-modal mset-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-hd">
              <span className="pm-modal-title">⚙ {manual ? '매뉴얼 수정' : '매뉴얼 추가'}</span>
              <button className="preg-x-btn" onClick={closeModal}>✕</button>
            </div>

            <div className="mset-modal-body">
              <div className="mset-grid">
                <div className="pm-workspy-field">
                  <label className="preg-label">매뉴얼 이름 *</label>
                  <input className="preg-input" value={draft.name} onChange={(e) => setD('name', e.target.value)} placeholder="예) VOD 기본 매뉴얼 v2" autoFocus />
                </div>
                <div className="pm-workspy-field">
                  <label className="preg-label">작업 유형</label>
                  <select className="preg-input" value={draft.typeKey} onChange={(e) => setD('typeKey', e.target.value)}>
                    {MANUAL_WORK_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mset-grid">
                <div className="pm-workspy-field">
                  <label className="preg-label">줄 수 설정</label>
                  <select className="preg-input" value={draft.lineCount} onChange={(e) => setD('lineCount', e.target.value)}>
                    <option>기본 1줄</option>
                    <option>기본 1줄 (2줄 허용)</option>
                    <option>기본 2줄</option>
                  </select>
                  <span className="mset-field-hint">* 기본적으로 1줄로 생성하되, 필요시 2줄까지 허용합니다.</span>
                </div>
                <div className="pm-workspy-field">
                  <label className="preg-label">줄당 글자 수 제한</label>
                  <div className="mset-suffix-input">
                    <input className="preg-input" type="number" min="1" value={draft.charLimit} onChange={(e) => setD('charLimit', e.target.value)} />
                    <span className="mset-suffix">자</span>
                  </div>
                  <span className="mset-field-hint">* 공백 포함 글자 수 기준입니다.</span>
                </div>
              </div>

              <div className="mset-grid">
                <ManualToggleCard label="분절 옵션 1 — 문장 단위 분절 우선" desc="문장 부호(. ? !) 기준으로 자막을 나눕니다." on={draft.sentenceFirst} onToggle={() => toggleD('sentenceFirst')} />
                <ManualToggleCard label="분절 옵션 2 — 싱크 너비 초과 시 문맥 분절" desc="시간이 부족할 경우 문맥에 맞게 다음 싱크로 넘깁니다." on={draft.syncOverflow} onToggle={() => toggleD('syncOverflow')} />
                <ManualToggleCard label="발화 내용 반영 — 추임새·감탄사" desc="'음', '아', '그' 등의 불필요한 추임새를 포함합니다." on={draft.fillers} onToggle={() => toggleD('fillers')} />
                <ManualToggleCard label="속도 제어 — CPS 자동 계산" desc="초당 글자 수가 기준을 넘지 않도록 자동 조절합니다." on={draft.cpsAuto} onToggle={() => toggleD('cpsAuto')} />
                <ManualToggleCard label="화자 설정 — 화자 구분 설정" desc="발화자별로 화자명을 구분해 표기합니다." on={draft.speaker} onToggle={() => toggleD('speaker')} />
                <ManualToggleCard label="비언어적 요소 — 효과음·배경음 표기" desc="(박수), (웃음) 등 비언어적 요소를 표기합니다." on={draft.nonverbal} onToggle={() => toggleD('nonverbal')} />
              </div>

              <div className="mset-info-banner">
                <span className="mset-info-icon">ⓘ</span>
                <div className="mset-info-text">
                  <span className="mset-info-title">저장 안내</span>
                  <span className="mset-info-line">✓ 저장하면 <strong>적용된 매뉴얼</strong>로 설정되어 작업 시 기본 세팅으로 사용됩니다.</span>
                  <span className="mset-info-line">✓ 적용되는 매뉴얼은 1개만 가능하며, 저장 시 기존 매뉴얼이 교체됩니다.</span>
                </div>
              </div>
            </div>

            <div className="pm-modal-ft">
              <button className="proto-log-btn" onClick={closeModal}>취소</button>
              <button className="proto-log-btn proto-log-btn--save" onClick={saveModal} disabled={!draft.name.trim()}>저장하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 탭 5: AI QC 결과 요약 ───
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
      <div className="proto-table-wrap proto-table-wrap--scroll">
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
    <ManualGlossaryTab s={s} />,
    <AiQcTab s={s} />,
    <DeliveryTab s={s} />,
    <SettlementTab s={s} />,
    <HistoryMemoTab s={s} />,
  ];

  return (
    <div className={`notion-page proto-detail-page${tab === 2 ? ' proto-detail-page--wide' : ''}`}>
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
