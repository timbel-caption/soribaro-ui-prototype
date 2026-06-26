import { useState, useRef, useEffect } from 'react';
import { COMPANY_DATA, getCompanyStaff, getEnterpriseCustomersByEntNm } from '../enterprise/proto/enterpriseProtoData';
import { getRequestTypes } from '../manage/manageProtoStore';

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

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const todayStr = new Date().toISOString().split('T')[0];

const meetingContractTypes = getRequestTypes().find((rt) => rt.name === '회의록')?.contractTypes ?? [];

export default function MeetingRegisterModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    entNm: '',
    managerNm: '',
    contractType: '',
    round: '',
    regDate: todayStr,
    dueDate: addBusinessDays(todayStr, 2),
    specialNote: '',
    internalMemo: '',
  });
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyDrop, setShowCompanyDrop] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);

  const filteredCompanies = COMPANY_DATA.filter((c) =>
    c.entNm.includes(companySearch)
  );

  const availableManagers = form.entNm ? getEnterpriseCustomersByEntNm(form.entNm) : [];

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
    setSelectedStaff(null);
  };

  const handleManagerChange = (managerNm) => {
    setForm((f) => ({ ...f, managerNm, contractType: '' }));
  };

  const addFiles = (incoming) => {
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
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
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>등록이 완료되었습니다</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>{form.entNm} 프로젝트가 목록 최하단에 추가되었습니다.</p>
            <button className="btn-primary" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preg-overlay">
      <div className="preg-modal" style={{ maxWidth: '760px' }}>
        {/* 헤더 */}
        <div className="preg-header">
          <span className="preg-header-title">새 의뢰 등록</span>
          <button className="preg-x-btn" onClick={onClose}>✕</button>
        </div>

        {/* 바디 */}
        <div className="preg-body">
          {/* 기본 정보 섹션 */}
          <div className="preg-section">
            <div className="preg-section-header">📋 기본 정보</div>

            {/* 업체명 / 담당관리자 / 계약구분 */}
            <div className="preg-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '14px' }}>
              {/* 업체명 */}
              <div className="preg-field" style={{ position: 'relative' }} ref={dropRef}>
                <label className="preg-label">업체명 <span className="preg-required">*</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="preg-input"
                    value={companySearch}
                    onChange={(e) => {
                      setCompanySearch(e.target.value);
                      setShowCompanyDrop(true);
                      setForm((f) => ({ ...f, entNm: '', managerNm: '', contractType: '' }));
                    }}
                    onFocus={() => setShowCompanyDrop(true)}
                    placeholder="업체명을 입력하세요"
                    style={{ paddingRight: '32px' }}
                  />
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
                  {showCompanyDrop && filteredCompanies.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                      borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', marginTop: '2px',
                      maxHeight: '180px', overflowY: 'auto',
                    }}>
                      {filteredCompanies.map((c) => (
                        <div
                          key={c.entNm}
                          onMouseDown={() => selectCompany(c.entNm)}
                          style={{
                            padding: '9px 12px', fontSize: '13px', cursor: 'pointer',
                            color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = ''}
                        >
                          {c.entNm}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 담당관리자 */}
              <div className="preg-field">
                <label className="preg-label">담당관리자 <span className="preg-required">*</span></label>
                <select
                  className="preg-select"
                  value={form.managerNm}
                  onChange={(e) => handleManagerChange(e.target.value)}
                  disabled={!form.entNm}
                  title={!form.entNm ? '업체명을 먼저 선택하세요' : undefined}
                >
                  <option value="">
                    {!form.entNm ? '업체명을 먼저 선택하세요' : availableManagers.length === 0 ? '등록된 담당관리자 없음' : '담당관리자를 선택하세요'}
                  </option>
                  {availableManagers.map((m) => (
                    <option key={m.membNo} value={m.membNm}>{m.membNm}</option>
                  ))}
                </select>
                {!form.entNm && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    업체명 선택 후 담당관리자를 선택할 수 있습니다
                  </span>
                )}
              </div>

              {/* 계약구분 */}
              <div className="preg-field">
                <label className="preg-label">계약구분 <span className="preg-required">*</span></label>
                <select
                  className="preg-select"
                  value={form.contractType}
                  onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))}
                  disabled={!form.managerNm}
                >
                  <option value="">▼</option>
                  {meetingContractTypes.map((ct) => (
                    <option key={ct} value={ct}>{ct}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 실무자 관리 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="proto-log-btn proto-log-btn--save"
                style={{ fontSize: '12px', padding: '5px 14px', opacity: form.entNm ? 1 : 0.5 }}
                disabled={!form.entNm}
                onClick={() => form.entNm && setShowStaffModal(true)}
              >실무자 관리</button>
              {selectedStaff ? (
                <>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedStaff.name}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedStaff.email}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedStaff.tel}</span>
                </>
              ) : (
                form.entNm && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>실무자를 선택하세요</span>
              )}
            </div>

            {/* 회차 / 의뢰일 / 납품예정일 */}
            <div className="preg-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '14px' }}>
              <div className="preg-field">
                <label className="preg-label">회차 <span className="preg-required">*</span></label>
                <input
                  className="preg-input"
                  value={form.round}
                  onChange={(e) => setForm((f) => ({ ...f, round: e.target.value }))}
                  placeholder="제OO회"
                />
              </div>
              <div className="preg-field">
                <label className="preg-label">의뢰일 <span className="preg-required">*</span></label>
                <input
                  className="preg-input"
                  type="date"
                  value={form.regDate}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    regDate: e.target.value,
                    dueDate: addBusinessDays(e.target.value, 2),
                  }))}
                />
              </div>
              <div className="preg-field">
                <label className="preg-label">납품예정일 <span className="preg-required">*</span></label>
                <input
                  className="preg-input"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>

            {/* 특이사항 / 내부 메모 */}
            <div className="preg-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="preg-field">
                <label className="preg-label">특이사항</label>
                <textarea
                  className="preg-textarea"
                  value={form.specialNote}
                  onChange={(e) => setForm((f) => ({ ...f, specialNote: e.target.value }))}
                  placeholder="납품 조건, 검수 여부 등"
                  rows={3}
                />
              </div>
              <div className="preg-field">
                <label className="preg-label">의뢰인 요청사항</label>
                <textarea
                  className="preg-textarea"
                  value={form.internalMemo}
                  onChange={(e) => setForm((f) => ({ ...f, internalMemo: e.target.value }))}
                  placeholder="내부 전달 사항"
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* 음성 파일 등록 섹션 */}
          <div className="preg-section">
            <div className="preg-section-header">🎙 음성 파일 등록</div>
            <div
              className={`preg-drop-zone${dragOver ? ' preg-drop-zone--active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="preg-drop-icon">🎙</div>
              <p className="preg-drop-text">파일을 드래그하거나 클릭하여 추가</p>
              <p className="preg-drop-hint">WAV, MP3, MA4 등</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".wav,.mp3,.mp4,.m4a,.aac,.flac"
                style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
            {files.length > 0 && (
              <div className="preg-file-list">
                {files.map((f, i) => (
                  <div key={i} className="preg-file-item">
                    <span className="preg-file-num">{i + 1}</span>
                    <span className="preg-file-icon">🎵</span>
                    <span className="preg-file-name">{f.name}</span>
                    <span className="preg-file-size">{formatSize(f.size)}</span>
                    <button className="preg-file-remove" onClick={() => removeFile(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 실무자 선택 팝업 */}
        {showStaffModal && (() => {
          const staff = getCompanyStaff(form.entNm);
          return (
            <div className="pm-overlay" onClick={() => setShowStaffModal(false)}>
              <div className="pm-modal pm-modal--workspy" style={{ maxWidth: '560px', width: '90%' }} onClick={e => e.stopPropagation()}>
                <div className="pm-modal-hd">
                  <span className="pm-modal-title">실무자 선택</span>
                  <button className="preg-x-btn" onClick={() => setShowStaffModal(false)}>✕</button>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  {staff.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                      등록된 실무자가 없습니다.<br />
                      <span style={{ fontSize: '12px' }}>서비스 관리 &gt; 엔터프라이즈 관리 &gt; 업체 상세에서 등록할 수 있습니다.</span>
                    </p>
                  ) : (
                    <div className="proto-table-wrap">
                      <table className="proto-table">
                        <thead>
                          <tr>
                            <th>실무자</th>
                            <th>이메일</th>
                            <th>전화번호(직통)</th>
                            <th style={{ width: '56px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {staff.map(m => (
                            <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedStaff(m); setShowStaffModal(false); }}>
                              <td style={{ fontWeight: 600 }}>{m.name}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{m.email}</td>
                              <td style={{ fontWeight: 600, fontSize: '13px' }}>{m.tel}</td>
                              <td className="text-center">
                                <button
                                  className="proto-log-btn proto-log-btn--save"
                                  style={{ fontSize: '11px', padding: '3px 10px' }}
                                  onClick={e => { e.stopPropagation(); setSelectedStaff(m); setShowStaffModal(false); }}
                                >선택</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="pm-modal-ft">
                  <button className="proto-log-btn" onClick={() => setShowStaffModal(false)}>닫기</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 푸터 */}
        <div className="preg-footer">
          <span className="preg-required-note"><span className="preg-required">*</span> 필수 항목</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="preg-cancel-btn" onClick={onClose}>취소</button>
            <button className="preg-submit-btn" onClick={handleSubmit} disabled={!form.entNm}>등록하기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
