import { useState, useRef } from 'react';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ProtoRegisterModal({ isVod, onClose, onSubmit }) {
  const workTypes = isVod ? ['VOD', '미디어', 'SDH'] : ['회의록'];

  const [form, setForm] = useState({
    bssTypeName: workTypes[0],
    entNm: '',
    servTitle: '',
    orgNm: '',
    managerNm: '',
    regDate: '',
    dueDate: '',
    deliveryFormats: '',
    specialNote: '',
    internalMemo: '',
  });
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef();

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const addFiles = (fileList) => {
    const next = Array.from(fileList).map((f, i) => ({
      id: `file-${Date.now()}-${i}`,
      name: f.name,
      size: formatSize(f.size),
    }));
    setFiles(prev => [...prev, ...next]);
  };

  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const isFormValid = form.entNm.trim() && form.servTitle.trim() && form.dueDate;

  if (submitted) {
    return (
      <div className="preg-overlay" onClick={onClose}>
        <div className="preg-modal preg-modal--narrow" onClick={e => e.stopPropagation()}>
          <div className="preg-success">
            <div className="preg-success-icon">✓</div>
            <div className="preg-success-title">등록 요청 완료</div>
            <p className="preg-success-desc">
              프로젝트 등록이 요청되었습니다.<br />
              실제 데이터 연동 시 목록에 반영됩니다.
            </p>
            <button className="preg-submit-btn" style={{ marginTop: 4 }} onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preg-overlay" onClick={onClose}>
      <div className="preg-modal" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="preg-header">
          <span className="preg-header-title">새 프로젝트 등록</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>

        {/* 바디 */}
        <div className="preg-body">

          {/* 기본 정보 */}
          <div className="preg-section">
            <div className="preg-section-header">
              <span>📋</span>
              <span>기본 정보</span>
            </div>
            <div className="preg-form-grid">

              <div className="preg-field">
                <label className="preg-label">작업 유형</label>
                <select className="preg-select" value={form.bssTypeName} onChange={set('bssTypeName')}>
                  {workTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="preg-field">
                <label className="preg-label">
                  입체명 (업체명) <span className="preg-required">*</span>
                </label>
                <input
                  className="preg-input"
                  value={form.entNm}
                  onChange={set('entNm')}
                  placeholder="업체명을 입력하세요"
                />
              </div>

              <div className="preg-field preg-field--full">
                <label className="preg-label">
                  프로젝트명 <span className="preg-required">*</span>
                </label>
                <input
                  className="preg-input"
                  value={form.servTitle}
                  onChange={set('servTitle')}
                  placeholder="프로젝트명을 입력하세요"
                />
              </div>

              <div className="preg-field">
                <label className="preg-label">기관 / 학교명</label>
                <input
                  className="preg-input"
                  value={form.orgNm}
                  onChange={set('orgNm')}
                  placeholder="기관 또는 학교명"
                />
              </div>

              <div className="preg-field">
                <label className="preg-label">담당 관리자</label>
                <input
                  className="preg-input"
                  value={form.managerNm}
                  onChange={set('managerNm')}
                  placeholder="담당자 이름"
                />
              </div>

              <div className="preg-field">
                <label className="preg-label">의뢰일</label>
                <input
                  className="preg-input"
                  type="date"
                  value={form.regDate}
                  onChange={set('regDate')}
                />
              </div>

              <div className="preg-field">
                <label className="preg-label">
                  납품예정일 <span className="preg-required">*</span>
                </label>
                <input
                  className="preg-input"
                  type="date"
                  value={form.dueDate}
                  onChange={set('dueDate')}
                />
              </div>

              <div className="preg-field preg-field--full">
                <label className="preg-label">납품 형식</label>
                <input
                  className="preg-input"
                  value={form.deliveryFormats}
                  onChange={set('deliveryFormats')}
                  placeholder={isVod ? 'SRT, SMI, VTT 등 (쉼표로 구분)' : 'HWP, PDF, DOCX 등'}
                />
              </div>

              <div className="preg-field preg-field--full">
                <label className="preg-label">특이사항</label>
                <textarea
                  className="preg-textarea"
                  rows={3}
                  value={form.specialNote}
                  onChange={set('specialNote')}
                  placeholder="납품 조건, 특별 요구사항 등"
                />
              </div>

              <div className="preg-field preg-field--full">
                <label className="preg-label">내부 메모</label>
                <textarea
                  className="preg-textarea"
                  rows={2}
                  value={form.internalMemo}
                  onChange={set('internalMemo')}
                  placeholder="내부 전달 사항"
                />
              </div>

            </div>
          </div>

        </div>

        {/* 푸터 */}
        <div className="preg-footer">
          <span className="preg-required-note">
            <span className="preg-required">*</span> 필수 입력
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="preg-cancel-btn" onClick={onClose}>취소</button>
            <button
              className={`preg-submit-btn${!isFormValid ? ' preg-submit-btn--disabled' : ''}`}
              disabled={!isFormValid}
              onClick={() => { if (!isFormValid) return; onSubmit?.(form, files); setSubmitted(true); }}
            >
              등록 요청
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
