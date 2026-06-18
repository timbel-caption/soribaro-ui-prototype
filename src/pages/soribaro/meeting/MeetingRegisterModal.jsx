import { useState, useRef, useEffect } from 'react';
import { COMPANY_DATA } from '../enterprise/proto/enterpriseProtoData';

function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

const today = new Date().toISOString().split('T')[0];

export default function MeetingRegisterModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    entNm: '',
    managerNm: '',
    contractType: '',
    regDate: today,
    dueDate: addBusinessDays(today, 2),
    specialNote: '',
    internalMemo: '',
  });
  const [files, setFiles] = useState([]);
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyDrop, setShowCompanyDrop] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dropRef = useRef(null);

  const filteredCompanies = COMPANY_DATA.filter((c) =>
    c.entNm.includes(companySearch)
  );

  const selectedCompany = COMPANY_DATA.find((c) => c.entNm === form.entNm);
  const availableManagers = selectedCompany ? selectedCompany.managers : [];
  const selectedManager = availableManagers.find((m) => m.name === form.managerNm);
  const availableContracts = selectedManager ? selectedManager.contractTypes : [];

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setShowCompanyDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectCompany = (entNm) => {
    setForm((f) => ({ ...f, entNm, managerNm: '', contractType: '' }));
    setCompanySearch(entNm);
    setShowCompanyDrop(false);
  };

  const handleManagerChange = (managerNm) => {
    setForm((f) => ({ ...f, managerNm, contractType: '' }));
  };

  const handleSubmit = () => {
    if (!form.entNm) return;
    onSubmit(form, files);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="preg-overlay">
        <div className="preg-modal">
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>등록이 완료되었습니다</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>{form.entNm} 프로젝트가 목록에 추가되었습니다.</p>
            <button className="btn-primary" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preg-overlay">
      <div className="preg-modal">
        <div className="preg-modal-header">
          <span className="preg-modal-title">새 프로젝트 등록</span>
          <button className="preg-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="preg-modal-body">
          {/* 업체명 */}
          <div className="preg-field">
            <label className="preg-label">업체명 <span className="preg-required">*</span></label>
            <div className="preg-company-wrap" ref={dropRef}>
              <input
                className="preg-input"
                value={companySearch}
                onChange={(e) => { setCompanySearch(e.target.value); setShowCompanyDrop(true); setForm((f) => ({ ...f, entNm: '', managerNm: '', contractType: '' })); }}
                onFocus={() => setShowCompanyDrop(true)}
                placeholder="업체명 검색"
              />
              {showCompanyDrop && filteredCompanies.length > 0 && (
                <div className="preg-company-dropdown">
                  {filteredCompanies.map((c) => (
                    <div key={c.entNm} className="preg-company-option" onMouseDown={() => selectCompany(c.entNm)}>
                      {c.entNm}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 담당 관리자 */}
          <div className="preg-field">
            <label className="preg-label">담당 관리자</label>
            <select
              className="preg-input"
              value={form.managerNm}
              onChange={(e) => handleManagerChange(e.target.value)}
              disabled={availableManagers.length === 0}
            >
              <option value="">선택</option>
              {availableManagers.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* 계약구분 */}
          <div className="preg-field">
            <label className="preg-label">계약구분</label>
            <select
              className="preg-input"
              value={form.contractType}
              onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))}
              disabled={availableContracts.length === 0}
            >
              <option value="">선택</option>
              {availableContracts.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>

          {/* 의뢰일 / 납품예정일 */}
          <div className="preg-row">
            <div className="preg-field">
              <label className="preg-label">의뢰일</label>
              <input
                className="preg-input"
                type="date"
                value={form.regDate}
                onChange={(e) => setForm((f) => ({ ...f, regDate: e.target.value, dueDate: addBusinessDays(e.target.value, 2) }))}
              />
            </div>
            <div className="preg-field">
              <label className="preg-label">납품예정일</label>
              <input
                className="preg-input"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>

          {/* 특이사항 */}
          <div className="preg-field">
            <label className="preg-label">특이사항</label>
            <textarea
              className="preg-textarea"
              value={form.specialNote}
              onChange={(e) => setForm((f) => ({ ...f, specialNote: e.target.value }))}
              placeholder="특이사항을 입력하세요"
              rows={2}
            />
          </div>

          {/* 파일 첨부 */}
          <div className="preg-field">
            <label className="preg-label">파일 첨부</label>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files))}
              className="preg-file-input"
            />
            {files.length > 0 && (
              <ul className="preg-file-list">
                {files.map((f, i) => <li key={i}>{f.name}</li>)}
              </ul>
            )}
          </div>
        </div>

        <div className="preg-modal-footer">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!form.entNm}>등록</button>
        </div>
      </div>
    </div>
  );
}
