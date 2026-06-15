import { ClipboardList, ChevronLeft, ChevronDown, Download, Info } from 'lucide-react';
import './ProjectTaskTypePage.css';

/**
 * [프로토타입 · 개발중] 프로젝트 작업 유형 및 용어집 설정 화면
 *
 * 첨부 시안을 화면으로 옮긴 정적 목업입니다. 백엔드/저장 동작은 없으며,
 * 아래 INFO/FILES 배열의 더미 데이터로 화면을 채웁니다.
 */

// 공통 정보 (상단 카드)
const INFO = [
  { label: '의뢰코드', value: '20260403003726' },
  { label: '제목', value: '[VOD] EBS 중학프리미엄' },
  { label: '의뢰자', value: '정기태' },
  { label: '작업상태', value: '작업중', badge: true },
  { label: '영상여부', value: '영상' },
  { label: '등록일시', value: '2026-04-03 15:50' },
  { label: '프로젝트', value: '[VOD] EBS 중학프리미엄' },
];

// 파일 목록 (작업 유형 pill 색상은 tone 으로 구분)
const FILES = [
  { no: 24692, name: '40강화학변화와에너지출입(1)_EBS고등예비과정통합과학(2022…', taskType: 'VOD-한양사이버', tone: 'blue', time: '00:39:11', size: '598.0 MB', status: '검수중', statusTone: 'review' },
  { no: 24693, name: '42강4단원대단원마무리문제(1)_EBS고등예비과정통합과학(202…', taskType: 'VOD-EBS중학', tone: 'blue', time: '00:30:46', size: '591.9 MB', status: '작업중', statusTone: 'working' },
  { no: 24694, name: '33강UNIT09to부정사(1)_EBS중학뉴런영어1-MainBook(2022…', taskType: '미디어-드라마', tone: 'green', time: '00:29:18', size: '447.1 MB', status: '작업중', statusTone: 'working' },
  { no: 24695, name: '41강UNIT11전치사와접속사(1)_EBS중학뉴런영어1-MainBook…', taskType: 'SDH-영화', tone: 'orange', time: '00:28:40', size: '437.4 MB', status: '작업중', statusTone: 'working' },
  { no: 24696, name: '2026-제3회', taskType: '교육지원청-서울시남부교육지원청', tone: 'gold', time: '00:19:24', size: '295.6 MB', status: '작업중', statusTone: 'working' },
  { no: 24697, name: '제316회 양구군의회 임시회 제1차 본회의', taskType: '의회-양구군의회', tone: 'purple', time: '00:19:43', size: '300.1 MB', status: '작업중', statusTone: 'working' },
];

export default function ProjectTaskTypePage() {
  return (
    <div className="ptt-page">
      <header className="ptt-header">
        <div className="ptt-title">
          <span className="ptt-title-icon">
            <ClipboardList size={20} strokeWidth={2} />
          </span>
          <h1>프로젝트 작업 유형 및 용어집 설정 화면</h1>
        </div>
        <button type="button" className="ptt-back-btn">
          <ChevronLeft size={16} strokeWidth={2} />
          작업 목록
        </button>
      </header>

      {/* 공통 정보 */}
      <section className="ptt-section">
        <h2 className="ptt-section-title">공통 정보</h2>
        <div className="ptt-info-card">
          {INFO.map((field) => (
            <div key={field.label} className="ptt-info-field">
              <span className="ptt-info-label">{field.label}</span>
              {field.badge ? (
                <span className="ptt-badge">{field.value}</span>
              ) : (
                <span className="ptt-info-value">{field.value}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 세부사항 / 메모 */}
      <div className="ptt-memo-row">
        <div className="ptt-memo-card">
          <h3 className="ptt-memo-title">의뢰자 세부요청사항</h3>
          <div className="ptt-memo-box ptt-memo-box--readonly">
            세부요청사항이 없습니다.
          </div>
        </div>

        <div className="ptt-memo-card">
          <h3 className="ptt-memo-title">작업자 공유 세부사항</h3>
          <div className="ptt-memo-box">
            <textarea
              className="ptt-memo-textarea"
              placeholder="작업자/검수자에게 공유할 세부사항을 작성하세요."
            />
            <button type="button" className="ptt-save-btn">저장</button>
          </div>
        </div>

        <div className="ptt-memo-card">
          <h3 className="ptt-memo-title">관리자 내부 메모</h3>
          <div className="ptt-memo-box">
            <textarea
              className="ptt-memo-textarea"
              placeholder="관리자 전용 내부 메모를 작성하세요. (작업자 비노출)"
            />
            <button type="button" className="ptt-save-btn">저장</button>
          </div>
        </div>
      </div>

      {/* 파일 목록 */}
      <section className="ptt-section">
        <div className="ptt-files-toolbar">
          <h2 className="ptt-section-title ptt-files-title">파일 목록</h2>
          <button type="button" className="ptt-link-btn">의뢰파일 추가</button>
          <button type="button" className="ptt-link-btn ptt-link-btn--muted">원본파일 다운로드</button>
          <input type="text" className="ptt-toolbar-input" />
          <button type="button" className="ptt-ghost-btn">난이도 일괄 적용 (0)</button>
        </div>

        <div className="ptt-table-wrap">
          <table className="ptt-table">
            <thead>
              <tr>
                <th className="ptt-col-check"><input type="checkbox" aria-label="전체 선택" /></th>
                <th>No</th>
                <th className="ptt-col-name">파일명</th>
                <th>파일 분할</th>
                <th>분할 여부</th>
                <th>난이도</th>
                <th>작업 유형 (선택)</th>
                <th>작업시간</th>
                <th>파일크기</th>
                <th>상태</th>
                <th>산출물 다운로드</th>
              </tr>
            </thead>
            <tbody>
              {FILES.map((file) => (
                <tr key={file.no}>
                  <td className="ptt-col-check"><input type="checkbox" aria-label={`${file.no} 선택`} /></td>
                  <td className="ptt-num">{file.no}</td>
                  <td className="ptt-col-name" title={file.name}>{file.name}</td>
                  <td><span className="ptt-split-link">배정완료</span></td>
                  <td>전체</td>
                  <td className="ptt-difficulty" />
                  <td>
                    <div className={`ptt-pill ptt-pill--${file.tone}`}>
                      <span className="ptt-pill-label">{file.taskType}</span>
                      <ChevronDown size={14} strokeWidth={2} />
                    </div>
                  </td>
                  <td className="ptt-num">{file.time}</td>
                  <td className="ptt-num">{file.size}</td>
                  <td>
                    <span className={`ptt-status ptt-status--${file.statusTone}`}>{file.status}</span>
                  </td>
                  <td>
                    <button type="button" className="ptt-dl-btn" aria-label="산출물 다운로드">
                      <Download size={15} strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="ptt-footnote">
          <Info size={14} strokeWidth={2} />
          작업 유형을 파일별로 개별 선택하여 배정할 수 있습니다.
        </p>
      </section>
    </div>
  );
}
