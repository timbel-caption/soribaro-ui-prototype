import { useState, useRef } from 'react';
import { getVodSamples, getMeetingSamples, updateSampleFiles, updateSampleSubjects, updateSampleNoteEntries, updateSampleMemoEntries, updateSampleSpecialNote } from './protoStore';
import { useUserStore } from '../../../../stores/userStore';
import { useParams, useNavigate } from 'react-router-dom';
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
function EditableLogCard({ variant, icon, iconClass, title, entries, author, onChange }) {
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
        <button className="proto-log-add-btn" onClick={() => { setAdding(true); setDraft(''); }} title="추가">+</button>
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
        />
        <EditableLogCard
          variant="memo"
          icon="≡"
          iconClass="proto-basic-extra-icon--memo"
          title="내부 메모"
          entries={memoEntries}
          author={authorName}
          onChange={syncMemos}
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

      <div className="proto-table-wrap">
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

const SEED_PROJ_FILES = [
  { fileNo: 'seed-1', fileName: '20260512135718_2026-12 피해교원 진술_심의장.wav', split: '분할', range: '00:07:55 ~ 00:44:05', workTime: '00:36:05', status: '검수완료', progress: 100, lastWork: '2026-06-07 17:00' },
  { fileNo: 'seed-2', fileName: '20260512144220_2026-12 관련학생 진술_심의장.wav', split: '-',    range: '',                     workTime: '00:17:57', status: '검수완료', progress: 55,  lastWork: '2026-06-11 16:00' },
  { fileNo: 'seed-3', fileName: '20260512151913_2026-12 심의_심의장.wav',           split: '-',    range: '',                     workTime: '00:17:58', status: '검수완료', progress: 100, lastWork: '2026-06-07 17:00' },
];

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
        workspyRegistered: true,
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
  const [fileModalFor, setFileModalFor] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [expandedMsgs, setExpandedMsgs] = useState({});

  const syncStore = (updated) => {
    setProjects(updated);
    updateSampleSubjects(s.id, updated);
  };

  const toggleExpand = (projId) => syncStore(projects.map(p => p.id === projId ? { ...p, expanded: !p.expanded } : p));
  const deleteProject = (projId) => syncStore(projects.filter(p => p.id !== projId));
  const toggleWorkspy = (projId) => syncStore(projects.map(p => p.id === projId ? { ...p, workspyRegistered: !p.workspyRegistered } : p));

  const addProjectFiles = (projId, fileNos) => {
    const newFiles = s.files
      .filter(f => fileNos.has(f.fileNo))
      .map(f => ({ fileNo: f.fileNo, fileName: f.fileName, split: '-', range: '', workTime: '-', status: '작업중', progress: 0, lastWork: '-' }));
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

  return (
    <div className="proto-tab-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p className="proto-section-title" style={{ margin: 0 }}>프로젝트 현황</p>
        {showAddForm ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              className="preg-input"
              style={{ width: '220px', marginBottom: 0 }}
              value={newProjName}
              onChange={e => setNewProjName(e.target.value)}
              placeholder="프로젝트명을 입력하세요"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && createProject()}
            />
            <button className="proto-log-btn proto-log-btn--save" onClick={createProject}>등록</button>
            <button className="proto-log-btn" onClick={() => { setShowAddForm(false); setNewProjName(''); }}>취소</button>
          </div>
        ) : (
          <button className="proto-file-add-btn" onClick={() => setShowAddForm(true)}>+ 새 프로젝트</button>
        )}
      </div>

      {projects.length === 0 && !showAddForm && (
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
              <span className="pm-work-time">작업 시간 {proj.workTime}</span>
              <span className="pm-assign-area">
                <span className="pm-assign-label">작업자</span>
                <button
                  className="pm-chip pm-chip--worker"
                  onClick={e => { e.stopPropagation(); setAssignModal({ projId: proj.id, type: 'worker' }); }}
                >
                  {proj.worker || '작업자 배정'}
                </button>
                <span className="pm-assign-label">검수자</span>
                <button
                  className="pm-chip pm-chip--reviewer"
                  onClick={e => { e.stopPropagation(); setAssignModal({ projId: proj.id, type: 'reviewer' }); }}
                >
                  {proj.reviewer || '검수자 배정'}
                </button>
              </span>
            </div>

            {proj.expanded && (
              <div className="pm-project-body">
                <div className="pm-action-bar">
                  <button className="pm-btn">수정</button>
                  <button className="pm-btn" onClick={() => setFileModalFor(proj.id)}>+ 파일 추가</button>
                  <button
                    className={`pm-btn${proj.workspyRegistered ? ' pm-btn--active' : ''}`}
                    onClick={() => toggleWorkspy(proj.id)}
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

                <div className="proto-table-wrap">
                  <table className="proto-table">
                    <thead>
                      <tr>
                        <th>파일명</th>
                        <th className="text-center">분할</th>
                        <th className="text-center">구간</th>
                        <th className="text-center">작업시간</th>
                        <th className="text-center">상태</th>
                        <th style={{ minWidth: '160px' }}>진행 현황</th>
                        <th className="text-center">마지막 작업<br/>(제출일)</th>
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
                          <td className="text-center" style={{ fontSize: '12px' }}>{f.workTime}</td>
                          <td className="text-center">
                            <span className={f.status === '검수완료' ? 'pm-status-done' : f.status === '작업중' ? 'pm-status-working' : 'pm-status-wait'}>
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
                          <td className="text-center" style={{ fontSize: '12px' }}>{f.lastWork}</td>
                          <td className="text-center">
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button className="pm-row-btn pm-row-btn--work">작업시작</button>
                              <button className="pm-row-btn pm-row-btn--review">검수시작</button>
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
    <ManualGlossaryTab s={s} />,
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
