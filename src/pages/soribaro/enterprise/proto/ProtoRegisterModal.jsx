import { useState, useRef, useEffect } from 'react';
import { COMPANY_DATA } from './enterpriseProtoData';

function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ProtoRegisterModal({ isVod, onClose, onSubmit }) {
  const workTypes = isVod ? ['VOD', '미디어', 'SDH'] : ['회의록'];
  const today = new Date().toISOString().split('T')[0];
  const defaultDueDate = addBusinessDays(today, 2);

  const [form, setForm] = useState({
    bssTypeName: workTypes[0],
    entNm: '',
    managerNm: '',
    contractType: '',
    servTitle: '',
    orgNm: '',
    regDate: today,
    dueDate: defaultDueDate,
    deliveryFormats: '',
    specialNote: '',
    internalMemo: '',
  });

  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef();
  const companyInputRef = useRef();

  const companySuggestions = companySearch.trim()
    ? COMPANY_DATA.filter((c) => c.entNm.includes(companySearch.trim()))
    : COMPANY_DATA;

  const selectedCompany = COMPANY_DATA.find((c) => c.entNm === form.entNm) ?? null;
  const managerOptions = selectedCompany?.managers ?? [];
  const selectedManager = managerOptions.find((m) => m.name === form.managerNm) ?? null;
  const contractOptions = selectedManager?.contractTypes ?? [];

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const selectCompany = (entNm) => {
    setCompanySearch(entNm);
    setForm((prev) => ({ ...prev, entNm, managerNm: '', contractType: '' }));
    setShowCompanyDropdown(false);
  };

  const handleManagerChange = (e) => {
    setForm((prev) => ({ ...prev, managerNm: e.target.value, contractType: '' }));
  };

  const addFiles = (fileList) => {
    const next = Array.from(fileList).map((f, i) => ({
      id: `file-${Date.now()}-${i}`,
      name: f.name,
      size: formatSize(f.size),
    }));
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const isFormValid = form.entNm.trim() && form.servTitle.trim() && form.dueDate;

  useEffect(() => {
    const handleClick = (e) => {
      if (companyInputRef.current && !companyInputRef.current.contains(e.target)) {
        setShowCompanyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (submitted) {
    return (
      <div className="preg-overlay" onClick={onClose}>
        <div className="preg-modal preg-modal--narrow" onClick={(e) => e.stopPropagation()}>
          <div className="preg-success">
            <div className="preg-success-icon">✓</div>
            <div className="preg-success-title">등록 완료</div>
            <p className="preg-success-desc">프로젝트가 목록 최하단에 추가되었습니다.</p>
            <button className="preg-submit-btn" style={{ marginTop: 4 }} onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preg-overlay" onClick={onClose}>
      <div className="preg-modal" onClick={(e) => e.stopPropagation()}>

        <div className="preg-header">
          <span className="preg-header-title">새 프로젝트 등록</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="preg-body">

          <div className="preg-section">
            <div className="preg-section-header">
              <span>📋</span>
              <span>기본 정보</span>
            </div>
            <div className="preg-form-grid">

              <div className="preg-field">
                <label className="preg-label">작업 유형</label>
                <select className="preg-select" value={form.bssTypeName} onChange={set('bssTypeName')}>
                  {workTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="preg-field" ref={companyInputRef} style={{ position: 'relative' }}>
                <label className="preg-label">업체명 <span className="preg-required">*</span></label>
                <input
                  className="preg-input"
                  value={companySearch}
                  onChange={(e) => {
                    setCompanySearch(e.target.value);
                    setForm((prev) => ({ ...prev, entNm: '', managerNm: '', contractType: '' }));
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => setShowCompanyDropdown(true)}
                  placeholder="업체명 검색"
                />
                {showCompanyDropdown && companySuggestions.length > 0 && (
                  <div className="preg-company-dropdown">
                    {companySuggestions.map((c) => (
                      <div
                        key={c.entNm}
                        className="preg-company-option"
                        onMouseDown={() => selectCompany(c.entNm)}
                      >
                        {c.entNm}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="preg-field">
                <label className="preg-label">담당관리자</label>
                <select
                  className="preg-select"
                  value={form.managerNm}
                  onChange={handleManagerChange}
                  disabled={!selectedCompany}
                >
                  <option value="">-- 선택 --</option>
                  {managerOptions.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </div>

              <div className="preg-field">
                <label className="preg-label">계약구분</label>
                <select
                  className="preg-select"
                  value={form.contractType}
                  onChange={set('contractType')}
                  disabled={!selectedManager}
                >
                  <option value="">-- 선택 --</option>
                  {contractOptions.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                </select>
              </div>

              <div className="preg-field preg-field--full">
                <label className="preg-label">프로젝트명 <span className="preg-required">*</span></label>
                <input className="preg-input" value={form.servTitle} onChange={set('servTitle')} placeholder="프로젝트명을 입력하세요" />
              </div>

              <div className="preg-field">
                <label className="preg-label">기관 / 학교명</label>
                <input className="preg-input" value={form.orgNm} onChange={set('orgNm')} placeholder="기관 또는 학교명" />
              </div>

              <div className="preg-field">
                <label className="preg-label">의뢰일</label>
                <input className="preg-input" type="date" value={form.regDate} onChange={set('regDate')} />
              </div>

              <div className="preg-field">
                <label className="preg-label">납품예정일 <span className="preg-required">*</span></label>
                <input className="preg-input" type="date" value={form.dueDate} onChange={set('dueDate')} />
              </div>

              <div className="preg-field">
                <label className="preg-label">납품 형식</label>
                <input className="preg-input" value={form.deliveryFormats} onChange={set('deliveryFormats')} placeholder={isVod ? 'SRT, SMI, VTT 등' : 'HWP, PDF, DOCX 등'} />
              </div>

              <div className="preg-field preg-field--full">
                <label className="preg-label">특이사항</label>
                <textarea className="preg-textarea" rows={3} value={form.specialNote} onChange={set('specialNote')} placeholder="납품 조건, 특별 요구사항 등" />
              </div>

              <div className="preg-field preg-field--full">
                <label className="preg-label">내부 메모</label>
                <textarea className="preg-textarea" rows={2} value={form.internalMemo} onChange={set('internalMemo')} placeholder="내부 전달 사항" />
              </div>

            </div>
          </div>

          <div className="preg-section">
            <div className="preg-section-header">
              <span>{isVod ? '🎬' : '🎙️'}</span>
              <span>{isVod ? '영상 파일 등록' : '음성 파일 등록'}</span>
            </div>

            <div
              className={`preg-drop-zone${dragOver ? ' preg-drop-zone--active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" multiple accept={isVod ? 'video/*' : 'audio/*'} style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <div className="preg-drop-icon">{isVod ? '🎬' : '🎙️'}</div>
              <div className="preg-drop-text">파일을 드래그하거나 클릭하여 추가</div>
              <div className="preg-drop-hint">{isVod ? 'MP4, MOV, AVI, MKV 등' : 'WAV, MP3, M4A 등'}</div>
            </div>

            {files.length > 0 && (
              <div className="preg-file-list">
                {files.map((f, i) => (
                  <div key={f.id} className="preg-file-item">
                    <span className="preg-file-num">{i + 1}</span>
                    <span className="preg-file-icon">{isVod ? '🎬' : '🎙️'}</span>
                    <span className="preg-file-name">{f.name}</span>
                    <span className="preg-file-size">{f.size}</span>
                    <button className="preg-file-remove" onClick={() => removeFile(f.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        <div className="preg-footer">
          <span className="preg-required-note"><span className="preg-required">*</span> 필수 입력</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="preg-cancel-btn" onClick={onClose}>취소</button>
            <button
              className={`preg-submit-btn${!isFormValid ? ' preg-submit-btn--disabled' : ''}`}
              disabled={!isFormValid}
              onClick={() => { if (!isFormValid) return; onSubmit?.(form, files); setSubmitted(true); }}
            >
              등록
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
