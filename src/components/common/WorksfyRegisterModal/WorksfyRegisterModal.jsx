/**
 * 웍스파이 프로젝트 등록 모달
 *
 * 기존 프로젝트 데이터를 웍스파이 API 요청 형식으로 자동 매핑하여 등록합니다.
 * 프로젝트 설명은 프로젝트 생성 시 입력된 내용을 그대로 사용합니다.
 *
 * @module WorksfyRegisterModal
 */
import { useEffect, useCallback } from 'react';
import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import './WorksfyRegisterModal.css';

// ============================================================================
// 유틸: 날짜 변환
// ============================================================================

/**
 * ISO 날짜 문자열 → yyyyMMddHHmm 형식으로 변환
 * @param {string|null} iso - ISO 날짜 문자열
 * @returns {string} yyyyMMddHHmm 형식 문자열
 */
const toYMDHM = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
};

/**
 * ISO 날짜 문자열 → yyyyMMdd 형식으로 변환
 * @param {string|null} iso - ISO 날짜 문자열
 * @returns {string} yyyyMMdd 형식 문자열
 */
const toYMD = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  } catch {
    return '';
  }
};

/**
 * ISO 날짜 → 표시용 포맷 (YYYY.MM.DD HH:mm)
 * @param {string|null} iso - ISO 날짜 문자열
 * @returns {string} 포맷된 날짜 문자열
 */
const formatDate = (iso) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

// ============================================================================
// 상수
// ============================================================================

/** 서비스 타입: 소리바로 */
const SVC_TP = '04';
/** 서비스명: 소리바로 */
const SVC_NM = '소리바로';

// ============================================================================
// 컴포넌트
// ============================================================================

/**
 * 웍스파이 프로젝트 등록 모달
 *
 * @param {Object} props
 * @param {boolean} props.open - 모달 표시 여부
 * @param {Object|null} props.project - 기존 프로젝트 데이터
 * @param {Function} props.onClose - 모달 닫기 콜백
 * @param {Function} props.onSubmit - 등록 콜백 (매핑된 WorksfyProjectCreateRequest 전달)
 * @param {boolean} props.submitting - 제출 중 상태
 */
/**
 * HTML 문자열에서 플레인 텍스트를 추출
 */
const htmlToPlainText = (html) => {
  if (!html || html === '<p></p>') return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

const WorksfyRegisterModal = ({ open, project, onClose, onSubmit, submitting }) => {
  const { t } = useTranslation('common');

  // ESC 키 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  /**
   * 기존 프로젝트 데이터를 WorksfyProjectCreateRequest로 매핑
   */
  const buildRequest = useCallback(() => {
    if (!project) return null;
    return {
      title: project.title || '',
      contents: htmlToPlainText(project.description),
      svcTp: SVC_TP,
      svcNm: SVC_NM,
      applStrtDt: toYMDHM(project.recruitStart),
      applEndDt: toYMDHM(project.recruitEnd),
      wrkStrtDt: toYMD(project.workStart),
      wrkEndDt: toYMD(project.workEnd),
      applQualCd: project.isAnyWorker ? 'anyone' : '01',
      applCnt: String(project.workerCnt ?? 1),
      unitPric: project.price ?? '0',
      fixYn: project.isImportant ? 'Y' : 'N',
      isApplicable: true,
    };
  }, [project]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const request = buildRequest();
    if (request) {
      onSubmit(request);
    }
  };

  if (!open || !project) return null;

  return (
    <div className="worksfy-register-overlay" onClick={onClose}>
      <div className="worksfy-register-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="worksfy-register-header">
          <h3>{t('worksfyRegister.title')}</h3>
          <button className="worksfy-modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 본문 */}
        <form className="worksfy-register-body" onSubmit={handleSubmit}>
          {/* 매핑 정보 요약 */}
          <div className="worksfy-info-summary">
            <div className="worksfy-info-summary-title">{t('worksfyRegister.registrationInfoCheck')}</div>
            <div className="worksfy-info-grid">
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.projectName')}</span>
                <span className="worksfy-info-value">{project.title}</span>
              </div>
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.service')}</span>
                <span className="worksfy-info-value">{t('worksfyRegister.soribaro')}</span>
              </div>
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.recruitmentCount')}</span>
                <span className="worksfy-info-value">{t('worksfyRegister.countUnit', { count: project.workerCnt ?? 1 })}</span>
              </div>
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.unitPrice')}</span>
                <span className="worksfy-info-value">{t('worksfyRegister.priceUnit', { price: project.price ?? '-' })}</span>
              </div>
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.recruitmentPeriod')}</span>
                <span className="worksfy-info-value">
                  {formatDate(project.recruitStart)} ~ {formatDate(project.recruitEnd)}
                </span>
              </div>
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.workPeriod')}</span>
                <span className="worksfy-info-value">
                  {formatDate(project.workStart)} ~ {formatDate(project.workEnd)}
                </span>
              </div>
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.eligibility')}</span>
                <span className="worksfy-info-value">{project.isAnyWorker ? t('worksfyRegister.anyone') : t('worksfyRegister.stenographer')}</span>
              </div>
              <div className="worksfy-info-item">
                <span className="worksfy-info-label">{t('worksfyRegister.pinStatus')}</span>
                <span className="worksfy-info-value">{project.isImportant ? t('worksfyRegister.pinned') : t('worksfyRegister.normal')}</span>
              </div>
              <div className="worksfy-info-item worksfy-info-item--wide">
                <span className="worksfy-info-label">{t('worksfyRegister.projectDescription')}</span>
                <span className="worksfy-info-value worksfy-info-description">{htmlToPlainText(project.description) || '-'}</span>
              </div>
            </div>
          </div>

          {/* 푸터 */}
          <div className="worksfy-register-footer">
            <Button variant="outlined" onClick={onClose} disabled={submitting}>
              {t('worksfyRegister.cancel')}
            </Button>
            <Button variant="contained" type="submit" disabled={submitting}>
              {submitting ? t('worksfyRegister.submitting') : t('worksfyRegister.registerWorksfy')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WorksfyRegisterModal;
