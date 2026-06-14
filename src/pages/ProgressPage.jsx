import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSttJobStore, STEPS } from '../stores/sttJobStore';
import { executeSttJob, cancelSttJob } from '../services/sttJobService';
import { getSubtitlesByProjectFileId } from '../api/v9/subtitles/index';
import { confirm } from '../stores/modalStore';
import { ProcessModal } from '../components/common/ProcessModal';
import ConfirmModal from '../components/worktool/common/ConfirmModal';
import languages from '../constants/language.json';
import './ProgressPage.css';

/**
 * STT 작업 단계 목록
 */
const STT_STEP_LIST = [
  STEPS.DOWNLOADING,
  STEPS.CONVERTING,
  STEPS.STT_PROCESSING,
  STEPS.SAVING,
  STEPS.COMPLETED,
];

/**
 * STT 언어 코드 매핑 (language.json code → STT API code)
 * ElevenLabs Scribe는 90+ 언어 지원
 */
const STT_CODE_MAP = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja',
  zh: 'zh-cn',
  hi: 'hi',       // 힌디어
  bn: 'bn',       // 벵골어
  pa: 'pa',       // 펀자브어
  te: 'te',       // 텔루구어
  ar: 'ar',       // 아랍어
  ru: 'ru',       // 러시아어
  de: 'de',       // 독일어
  it: 'it',       // 이탈리아어
  pt: 'pt',       // 포르투갈어
  es: 'es',       // 스페인어
  fr: 'fr',       // 프랑스어
  vi: 'vi',       // 베트남어
  th: 'th',       // 태국어
  id: 'id',       // 인도네시아어
};

/**
 * 언어 옵션 (language.json 기반 + STT 전용 옵션)
 */
const LANGUAGE_OPTIONS = [
  // language.json에서 STT 지원 언어 매핑
  ...languages
    .filter((lang) => STT_CODE_MAP[lang.code])
    .map((lang) => ({
      code: STT_CODE_MAP[lang.code],
      name: `${lang.flag} ${lang.name}`,
    })),
  // STT 전용 특수 옵션
  { code: 'enko', name: '🇰🇷🇺🇸 한/영 동시인식' },
  { code: 'zh-tw', name: '🇹🇼 중국어(번체)' },
];

/**
 * 모델 옵션
 */
const MODEL_OPTIONS = [
  { id: '', name: '자동 (언어 기반 선택)' },
  { id: 'clova', name: 'CLOVA Speech (한국어 추천)' },
  { id: 'elevenlabs', name: 'ElevenLabs Scribe (외국어 추천)' },
];

/**
 * 버킷 타입 옵션
 */
const BUCKET_OPTIONS = [
  { id: 'order', name: 'Order (주문 파일)' },
  { id: 'complete', name: 'Complete (완료 파일)' },
];

/**
 * FFmpeg.wasm 지원 확인
 */
function checkFFmpegSupport() {
  return typeof SharedArrayBuffer !== 'undefined' && typeof WebAssembly !== 'undefined';
}

export default function ProgressPage() {
  const { id: fileNo } = useParams(); // /progress/:id 형태로 fileNo 전달
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // STT 모드 파라미터
  const language = searchParams.get('lang') || 'ko-KR';
  const bucketType = searchParams.get('bucket') || 'order'; // 기본값: order
  const model = searchParams.get('model'); // clova, elevenlabs (생략 시 aiStore 설정 사용)
  const maxSegmentLength = searchParams.get('maxSegmentLength') 
    ? Number(searchParams.get('maxSegmentLength')) 
    : undefined;
  const splitTimeGap = searchParams.get('splitTimeGap') 
    ? Number(searchParams.get('splitTimeGap')) 
    : undefined;

  // STT 모드 여부 (fileNo가 있으면 STT 모드)
  const isSttMode = !!fileNo;

  // ==================== 입력 폼 상태 (fileNo 없을 때) ====================
  const [formFileNo, setFormFileNo] = useState('');
  const [formLang, setFormLang] = useState('ko-KR');
  const [formModel, setFormModel] = useState('');
  const [formBucket, setFormBucket] = useState('order');
  const [formMaxSegmentLength, setFormMaxSegmentLength] = useState('50');
  const [formSplitTimeGap, setFormSplitTimeGap] = useState('2.0');

  // ==================== 모달 상태 ====================
  const [isModalOpen, setIsModalOpen] = useState(false);

  // STT 작업 상태
  const { 
    currentStep, 
    detailProgress, 
    error, 
    fileName,
    reset,
    getTotalProgress,
    isProcessing,
  } = useSttJobStore();

  // 브라우저 지원 확인
  const isSupported = checkFFmpegSupport();

  // 탭 종료 방지 (STT 모드에서만)
  useEffect(() => {
    if (!isSttMode) return;

    const handleBeforeUnload = (e) => {
      if (isProcessing()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSttMode, isProcessing]);

  // STT 작업 실행 (URL 직접 접근)
  useEffect(() => {
    if (!isSttMode) return;
    if (!isSupported) return;

    const checkAndExecute = async () => {
      // 기존 자막 존재 확인
      try {
        const result = await getSubtitlesByProjectFileId(fileNo);
        if (result?.status === 'SUCCESS' && result?.data?.length > 0) {
          const confirmed = await confirm(
            '이미 자막 데이터가 있습니다. 그래도 작업을 진행하시겠습니까?\n아니오 선택 시 기존 자막 데이터를 사용합니다.',
            {
              title: 'STT 실행 확인',
              confirmText: '예',
              cancelText: '아니오',
            }
          );

          if (!confirmed) {
            // "아니오" 선택 시 worktool 페이지로 이동하여 기존 자막 표시
            navigate(`/worktool/${fileNo}`);
            return;
          }
        }
      } catch (error) {
        // 자막 조회 실패 시 (자막 없음으로 간주) 계속 진행
        console.log('자막 조회 실패 또는 없음:', error);
      }

      // STT 작업 실행
      reset();
      
      // fileNo가 있으면 서버모드 (서버에서 파일 로드)
      const isServerMode = !!fileNo;
      
      executeSttJob(Number(fileNo), { 
        language, 
        bucketType, 
        model,
        maxSegmentLength,
        splitTimeGap,
        isServerMode,
      })
        .then((result) => {
          console.log('STT 작업 완료:', result);
          // 완료 후 작업툴 페이지로 이동
          setTimeout(() => navigate(`/worktool/${fileNo}`), 1500);
        })
        .catch((err) => {
          console.error('STT 작업 실패:', err);
        });
    };

    checkAndExecute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileNo, language, bucketType, model, maxSegmentLength, splitTimeGap, isSttMode, isSupported]);

  // 취소 핸들러
  const handleCancel = useCallback(() => {
    if (window.confirm('작업을 취소하시겠습니까?')) {
      cancelSttJob();
      navigate(-1);
    }
  }, [navigate]);

  // 재시도 핸들러
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  // STT 작업 시작 핸들러 (입력 폼에서) - 자막 확인 후 모달 열기
  const handleStartSTT = useCallback(async () => {
    if (!formFileNo.trim()) {
      alert('파일 번호를 입력해주세요.');
      return;
    }

    // 기존 자막 존재 확인
    try {
      const result = await getSubtitlesByProjectFileId(formFileNo.trim());
      if (result?.status === 'SUCCESS' && result?.data?.length > 0) {
        const confirmed = await confirm(
          '이미 자막 데이터가 있습니다. 그래도 작업을 진행하시겠습니까?\n아니오 선택 시 기존 자막 데이터를 사용합니다.',
          {
            title: 'STT 실행 확인',
            confirmText: '예',
            cancelText: '아니오',
          }
        );

        if (!confirmed) {
          // "아니오" 선택 시 worktool 페이지로 이동하여 기존 자막 표시
          navigate(`/worktool/${formFileNo.trim()}`);
          return;
        }
      }
    } catch (error) {
      // 자막 조회 실패 시 (자막 없음으로 간주) 계속 진행
      console.log('자막 조회 실패 또는 없음:', error);
    }

    setIsModalOpen(true);
  }, [formFileNo, navigate]);

  // 모달 닫기 핸들러
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // ==================== STT 모드 UI ====================
  if (isSttMode) {
    // 브라우저 미지원
    if (!isSupported) {
      return (
        <div className="progress-page">
          <div className="progress-page-header">
            <h1 className="progress-page-title">
              <span className="progress-page-icon">⚠️</span>
              브라우저 미지원
            </h1>
            <p className="progress-page-subtitle">
              이 브라우저는 FFmpeg.wasm을 지원하지 않습니다.
            </p>
          </div>
          <div className="progress-cards">
            <section className="progress-card">
              <p className="progress-error-text">
                Chrome, Edge 또는 Firefox 최신 버전을 사용해주세요.
                <br />
                <small style={{ color: 'var(--text-muted)' }}>
                  (SharedArrayBuffer 또는 WebAssembly가 지원되지 않습니다)
                </small>
              </p>
              <button
                type="button"
                className="progress-step-btn"
                onClick={() => navigate(-1)}
              >
                돌아가기
              </button>
            </section>
          </div>
        </div>
      );
    }

    const totalProgress = getTotalProgress();

    return (
      <div className="progress-page">
        <div className="progress-page-header">
          <h1 className="progress-page-title">
            <span className="progress-page-icon">
              {currentStep.id === STEPS.COMPLETED.id ? '✅' : 
               currentStep.id === STEPS.FAILED.id ? '❌' : '🔄'}
            </span>
            {currentStep.id === STEPS.COMPLETED.id ? 'STT 처리 완료' :
             currentStep.id === STEPS.FAILED.id ? 'STT 처리 실패' : 'STT 처리 중'}
          </h1>
          <p className="progress-page-subtitle">
            {fileName && `파일: ${fileName}`}
            {!fileName && currentStep.id > 0 && '파일을 처리하고 있습니다...'}
            {currentStep.id === 0 && '작업을 준비하고 있습니다...'}
          </p>
        </div>

        <div className="progress-cards">
          {/* 단계별 진행 */}
          <section className="progress-card">
            <h2 className="progress-card-title">처리 단계</h2>
            <div className="progress-steps">
              {STT_STEP_LIST.map((step, index) => {
                const isActive = currentStep.id === step.id;
                const isDone = currentStep.id > step.id || 
                  (currentStep.id === STEPS.COMPLETED.id && step.id === STEPS.COMPLETED.id);
                const isFailed = currentStep.id === STEPS.FAILED.id;
                const isLast = index === STT_STEP_LIST.length - 1;

                return (
                  <div key={step.id} className="progress-step-item">
                    <div className="progress-step-content">
                      <div
                        className={`progress-step-dot ${isDone ? 'done' : ''} ${isActive ? 'current' : ''} ${isFailed && isActive ? 'failed' : ''}`}
                      >
                        {isDone ? '✓' : isFailed && index === 0 ? '!' : index + 1}
                      </div>
                      <span className={`progress-step-label ${isActive ? 'current' : ''}`}>
                        {step.label}
                      </span>
                    </div>
                    {!isLast && (
                      <div
                        className={`progress-step-connector ${isDone ? 'done' : ''}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 진행률 */}
          <section className="progress-card">
            <h2 className="progress-card-title">전체 진행률</h2>
            <div className="progress-linear-wrap">
              <div
                className={`progress-linear-bar ${currentStep.id === STEPS.FAILED.id ? 'failed' : ''}`}
                style={{
                  width: `${totalProgress}%`,
                }}
              />
            </div>
            <div className="progress-linear-meta">
              <span className="progress-percent">{Math.round(totalProgress)}%</span>
              {currentStep.id > 0 && currentStep.id < STEPS.COMPLETED.id && (
                <span className="progress-detail">
                  {currentStep.label}: {Math.round(detailProgress)}%
                </span>
              )}
            </div>
          </section>

          {/* 에러 표시 */}
          {error && (
            <section className="progress-card progress-card-error">
              <h2 className="progress-card-title">오류 발생</h2>
              <p className="progress-error-text">{error}</p>
              <div className="progress-step-controls">
                <button
                  type="button"
                  className="progress-step-btn"
                  onClick={() => navigate(-1)}
                >
                  돌아가기
                </button>
                <button
                  type="button"
                  className="progress-step-btn primary"
                  onClick={handleRetry}
                >
                  다시 시도
                </button>
              </div>
            </section>
          )}

          {/* 완료 메시지 */}
          {currentStep.id === STEPS.COMPLETED.id && (
            <section className="progress-card progress-card-success">
              <h2 className="progress-card-title">처리 완료</h2>
              <p className="progress-success-text">
                STT 처리가 완료되었습니다. 잠시 후 작업 페이지로 이동합니다.
              </p>
            </section>
          )}

          {/* 취소 버튼 (진행 중일 때만) */}
          {isProcessing() && !error && (
            <section className="progress-card">
              <button
                type="button"
                className="progress-cancel-btn"
                onClick={handleCancel}
              >
                작업 취소
              </button>
            </section>
          )}
        </div>

        {/* 확인 모달 */}
        <ConfirmModal />
      </div>
    );
  }

  // ==================== 입력 폼 UI (fileNo 없을 때) ====================
  return (
    <div className="progress-page">
      <div className="progress-page-header">
        <h1 className="progress-page-title">
          <span className="progress-page-icon">🎤</span>
          STT 음성인식
        </h1>
        <p className="progress-page-subtitle">
          파일 번호와 옵션을 입력하여 음성인식을 실행합니다.
        </p>
      </div>

      <div className="progress-cards">
        {/* 입력 폼 */}
        <section className="progress-card">
          <h2 className="progress-card-title">STT 설정</h2>
          
          <div className="form-group">
            <label className="form-label">
              파일 번호 <span className="required">*</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="파일 번호를 입력하세요 (예: 12345)"
              value={formFileNo}
              onChange={(e) => setFormFileNo(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">인식 언어</label>
            <select
              className="form-select"
              value={formLang}
              onChange={(e) => setFormLang(e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">STT 모델</label>
            <select
              className="form-select"
              value={formModel}
              onChange={(e) => setFormModel(e.target.value)}
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">버킷 타입</label>
            <select
              className="form-select"
              value={formBucket}
              onChange={(e) => setFormBucket(e.target.value)}
            >
              {BUCKET_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* 세그먼트 설정 */}
        <section className="progress-card">
          <h2 className="progress-card-title">세그먼트 분리 설정</h2>
          
          <div className="form-group">
            <label className="form-label">
              최대 문자 수
              <span className="form-hint">자막 한 줄의 최대 글자 수 (띄어쓰기 포함)</span>
            </label>
            <input
              type="number"
              className="form-input"
              min="20"
              max="100"
              value={formMaxSegmentLength}
              onChange={(e) => setFormMaxSegmentLength(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              분리 시간 간격 (초)
              <span className="form-hint">이 시간 이상 간격이 있으면 새 자막으로 분리</span>
            </label>
            <input
              type="number"
              className="form-input"
              min="0.5"
              max="5.0"
              step="0.1"
              value={formSplitTimeGap}
              onChange={(e) => setFormSplitTimeGap(e.target.value)}
            />
          </div>
        </section>

        {/* 실행 버튼 */}
        <section className="progress-card">
          <button
            type="button"
            className="progress-step-btn primary full-width"
            onClick={handleStartSTT}
            disabled={!formFileNo.trim()}
          >
            🚀 STT 실행
          </button>
        </section>

        {/* 브라우저 지원 경고 */}
        {!isSupported && (
          <section className="progress-card progress-card-error">
            <h2 className="progress-card-title">⚠️ 브라우저 미지원</h2>
            <p className="progress-error-text">
              이 브라우저는 FFmpeg.wasm을 지원하지 않습니다.
              <br />
              Chrome, Edge 또는 Firefox 최신 버전을 사용해주세요.
            </p>
          </section>
        )}
      </div>

      {/* STT 처리 모달 */}
      <ProcessModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        type="stt"
        fileId={formFileNo.trim()}
        sttOptions={{
          language: formLang,
          bucketType: formBucket,
          model: formModel || undefined,
          maxSegmentLength: formMaxSegmentLength ? Number(formMaxSegmentLength) : undefined,
          splitTimeGap: formSplitTimeGap ? Number(formSplitTimeGap) : undefined,
        }}
      />

      {/* 확인 모달 */}
      <ConfirmModal />
    </div>
  );
}
