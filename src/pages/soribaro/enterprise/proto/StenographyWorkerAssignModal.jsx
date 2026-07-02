import { useState } from 'react';

const STG_WORKER_LIST = [
  { id: 1, name: '홍길동', grade: '1급', phone: '010-1234-5678', address: '서울시 마포구 염남동',    available: true },
  { id: 2, name: '김나리', grade: '2급', phone: '010-2345-6789', address: '서울시 마포구 공덕동',    available: true },
  { id: 3, name: '박지훈', grade: '1급', phone: '010-3456-7890', address: '서울시 서대문구 연희동',  available: true },
  { id: 4, name: '이소명', grade: '2급', phone: '010-4567-8901', address: '서울시 은평구 응암동',    available: false, unavailReason: '배정중' },
];

// 일정 충돌 판정에 적용할 완충 시간(앞뒤 각 1시간)
const SCHEDULE_BUFFER_MIN = 60;

// "HH:MM-HH:MM" 형식의 sessionTime을 분 단위 {start, end}로 변환
function parseSessionRange(sessionTime) {
  if (!sessionTime || sessionTime === '-') return null;
  const [startStr, endStr] = sessionTime.split('-').map((v) => v.trim());
  const toMinutes = (hm) => {
    const [h, m] = (hm || '').split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const start = toMinutes(startStr);
  const end = toMinutes(endStr);
  if (start == null || end == null) return null;
  return { start, end };
}

// 기존 일정의 시작시간-1시간 ~ 종료시간+1시간 완충 구간에 신규 일정이 조금이라도 겹치면 충돌
function hasScheduleConflict(newRange, existingRange) {
  const bufferedStart = existingRange.start - SCHEDULE_BUFFER_MIN;
  const bufferedEnd = existingRange.end + SCHEDULE_BUFFER_MIN;
  return newRange.start < bufferedEnd && newRange.end > bufferedStart;
}

export default function StenographyWorkerAssignModal({ open, onClose, onConfirm, currentSessionTime, assignedSchedules = [] }) {
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState(null);

  if (!open) return null;

  const newRange = parseSessionRange(currentSessionTime);

  // 같은 화면의 다른 배정 건들과 ±1시간 완충 구간이 겹치는 작업자는 "배정중"으로 배정 불가 처리
  const workerList = STG_WORKER_LIST.map((w) => {
    const conflict = !!newRange && assignedSchedules.some((a) => {
      if (a.worker !== w.name) return false;
      const existingRange = parseSessionRange(a.sessionTime);
      return existingRange && hasScheduleConflict(newRange, existingRange);
    });
    return conflict ? { ...w, available: false, unavailReason: '배정중' } : w;
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? workerList.filter(w =>
        w.name.includes(q) || w.grade.includes(q) || w.address.includes(q)
      )
    : workerList;

  const handleClose = () => {
    setSelected(null);
    setSearch('');
    onClose();
  };

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected.name);
    setSelected(null);
    setSearch('');
  };

  return (
    <div className="pm-overlay" onClick={handleClose}>
      <div
        className="pm-modal"
        onClick={e => e.stopPropagation()}
        style={{ width: '620px', maxWidth: '96vw' }}
      >
        <div className="pm-modal-hd">
          <span className="pm-modal-title">작업자 배정</span>
          <button className="preg-x-btn" onClick={handleClose}>✕</button>
        </div>

        <div style={{ padding: '14px 20px 8px' }}>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <input
              className="preg-input"
              placeholder="이름, 급수, 거주지 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingRight: '34px' }}
            />
            <span style={{
              position: 'absolute', right: '10px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)',
              fontSize: '15px', pointerEvents: 'none',
            }}>🔍</span>
          </div>

          <div className="proto-table-wrap">
            <table className="proto-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}></th>
                  <th>이름</th>
                  <th>급수</th>
                  <th>연락처</th>
                  <th>거주지</th>
                  <th>배정 가능 여부</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => (
                  <tr
                    key={w.id}
                    onClick={() => w.available && setSelected(w)}
                    style={{
                      cursor:     w.available ? 'pointer' : 'default',
                      background: selected?.id === w.id ? 'rgba(59,130,246,0.08)' : undefined,
                    }}
                  >
                    <td className="text-center">
                      <input
                        type="radio"
                        name="stg-worker-assign"
                        checked={selected?.id === w.id}
                        onChange={() => w.available && setSelected(w)}
                        disabled={!w.available}
                        style={{ accentColor: '#3b82f6' }}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{w.name}</td>
                    <td>{w.grade}</td>
                    <td>{w.phone}</td>
                    <td>{w.address}</td>
                    <td>
                      {w.available
                        ? <span style={{ color: '#3b82f6', fontWeight: 600 }}>가능</span>
                        : <span style={{ color: '#f97316', fontWeight: 600 }}>불가능 ({w.unavailReason})</span>
                      }
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>
                      검색 결과가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pm-modal-ft">
          <button className="proto-log-btn" onClick={handleClose}>취소</button>
          <button
            className="proto-log-btn proto-log-btn--save"
            onClick={handleConfirm}
            disabled={!selected}
            style={!selected ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >배정하기</button>
        </div>
      </div>
    </div>
  );
}
