import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { useAIStore } from '../../../stores/aiStore';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import { toast } from '../../../stores/toastStore';
import languages from '../../../constants/language.json';
import testApiKeys from '../../../constants/apiKeys.json';
import SplitPointEditor from './SplitPointEditor';
import './SttConfigModal.css';

/**
 * ElevenLabs STT 언어 코드 매핑 (language.json code → STT API code)
 * ElevenLabs Scribe는 90+ 언어 지원
 */
const ELEVENLABS_CODE_MAP = {
  ko: 'ko-KR',
  en: 'en',
  ja: 'ja',
  zh: 'zh-cn',
  hi: 'hi',       // 힌디어
  bn: 'bn',       // 벵골어
  pa: 'pa',       // 펀자브어
  te: 'te',       // 텔루구어
  kn: 'kn',       // 칸나다어
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
 * ElevenLabs 언어 옵션 (language.json 기반 + 특수 옵션)
 */
const getElevenlabsLanguageOptions = (isEn) => [
  ...languages
    .filter((lang) => ELEVENLABS_CODE_MAP[lang.code])
    .map((lang) => ({
      code: ELEVENLABS_CODE_MAP[lang.code],
      name: isEn ? (lang.enName || lang.name) : lang.name,
    })),
  { code: 'enko', name: isEn ? 'Korean/English Bilingual' : '한/영 동시인식' },
  { code: 'zh-tw', name: isEn ? 'Chinese (Traditional)' : '중국어(번체)' },
];

/**
 * CLOVA STT 지원 언어 옵션
 */
const getClovaLanguageOptions = (isEn) => [
  { code: 'ko-KR', name: isEn ? 'Korean' : '한국어' },
  { code: 'en-US', name: isEn ? 'English' : '영어' },
  { code: 'ja', name: isEn ? 'Japanese' : '일본어' },
  { code: 'zh-cn', name: isEn ? 'Chinese (Simplified)' : '중국어(간체)' },
  { code: 'zh-tw', name: isEn ? 'Chinese (Traditional)' : '중국어(번체)' },
  { code: 'enko', name: isEn ? 'Korean/English Bilingual' : '한/영 동시인식' },
];

/**
 * 모델별 언어 옵션 반환
 */
const getLanguageOptionsForModel = (modelId, isEn) => {
  const options = modelId === 'clova' ? getClovaLanguageOptions(isEn) : getElevenlabsLanguageOptions(isEn);
  return [...options].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * 모델별 기본 언어 반환
 */
const getDefaultLanguageForModel = (modelId) => {
  return 'ko-KR'; // 모든 모델 공통 기본값: 한국어
};

/**
 * 모델 옵션
 */
const MODEL_OPTIONS = [
  { id: 'clova', name: 'STT 엔진 1' },
  { id: 'elevenlabs', name: 'STT 엔진 2' },
];

/**
 * STT 설정 모달 Props
 * @typedef {Object} SttConfigModalProps
 * @property {boolean} isOpen - 모달 열림 상태
 * @property {() => void} onClose - 모달 닫기 콜백
 * @property {(options: Object) => void} onStart - STT 실행 콜백 (설정 옵션 전달)
 * @property {string} [fileId] - MinIO 파일 ID (mode=legacy일 때 사용)
 * @property {string} [mediaUrl] - 로컬 파일 ObjectURL (로컬 파일인 경우)
 * @property {string} [mode] - 처리 모드 ('legacy' | null)
 */

/**
 * STT 설정 모달 컴포넌트
 * Toolbar에서 음성인식 버튼 클릭 시 표시되는 설정 모달입니다.
 * @param {SttConfigModalProps} props
 */
export default function SttConfigModal({ isOpen, onClose, onStart, fileId, mediaUrl, mode, mediaDuration = 0, allowedStartSec = null, allowedEndSec = null }) {
  const { t } = useTranslation('worktool');
  const maxSegmentLength = useAIStore((state) => state.stt?.segmentOptions?.maxSegmentLength ?? 80);
  const setSTTSegmentOption = useAIStore((state) => state.setSTTSegmentOption);
  
  // STT 설정 상태
  const [model, setModel] = useState('clova');
  const [language, setLanguage] = useState('ko-KR');
  
  // 세그먼트 분리 설정 상태
  const [splitTimeGap, setSplitTimeGap] = useState('2.0');

  // 파일 분할 옵션
  const [enableSplit, setEnableSplit] = useState(false);
  const [splitPoints, setSplitPoints] = useState([]);
  const [overlapSec, setOverlapSec] = useState(5);

  // 분할 구간 계산
  const splitSegments = useMemo(() => {
    if (!enableSplit || splitPoints.length === 0 || mediaDuration <= 0) return [];
    const sorted = [...splitPoints].sort((a, b) => a - b);
    const boundaries = [0, ...sorted, mediaDuration];
    const segments = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      segments.push({ startSec: boundaries[i], endSec: boundaries[i + 1] });
    }
    return segments;
  }, [enableSplit, splitPoints, mediaDuration]);

  // 모델 변경 시 언어 목록 갱신 및 기본 언어 설정
  const handleModelChange = (newModel) => {
    setModel(newModel);
    const langOptions = getLanguageOptionsForModel(newModel, i18next.language !== 'ko');
    // 현재 선택된 언어가 새 모델에서 지원되는지 확인
    const isCurrentLangSupported = langOptions.some(opt => opt.code === language);
    if (!isCurrentLangSupported) {
      setLanguage(getDefaultLanguageForModel(newModel));
    }
  };

  // STT 실행 핸들러
  const handleStart = () => {
    // Test/Training mode: 쿼리스트링이 mode=test 또는 mode=training 이면 apiKeys.json 에서 키 로드.
    // 연수 모드도 사용자가 별도 API Key 를 입력하지 않아도 STT 가 동작하도록 같은 자동 주입을 적용한다.
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (modeParam === 'test' || modeParam === 'training') {
      const sttKeys = testApiKeys.stt?.[model];
      if (sttKeys) {
        // provider를 먼저 맞춘 후 credential 저장
        useAIStore.getState().setSTTProvider(model);
        Object.entries(sttKeys).forEach(([key, value]) => {
          useAIStore.getState().setSTTCredential(key, value);
        });
      } else {
        console.warn(`[${modeParam}] STT 테스트 키를 찾을 수 없음 - provider: ${model}`);
      }
    }

    // 서버/로컬 모드 확인
    const isServerMode = useSubtitleStore.getState().isServerMode;
    
    // 로컬 모드에서만 API Key 검증
    if (!isServerMode) {
      const { stt } = useAIStore.getState();
      
      const providerCredentials = stt.credentials?.[model] || {};
      
      if (model === 'elevenlabs') {
        if (!providerCredentials.apiKey) {
          toast.error(t('sttConfig.elevenLabsKeyMissing'));
          return;
        }
      } else {
        // clova
        if (!providerCredentials.secretKey) {
          toast.error(t('sttConfig.clovaKeyMissing'));
          return;
        }
      }
    }
    
    const options = {
      language,
      model,
      maxSegmentLength,
      splitTimeGap: splitTimeGap ? Number(splitTimeGap) : undefined,
      mode: mode || undefined,
      fileId: mode === 'legacy' ? fileId : undefined,
      mediaUrl: mode !== 'legacy' ? mediaUrl : undefined,
      // 분할 옵션
      enableSplit: enableSplit && splitSegments.length > 1,
      splitSegments: enableSplit && splitSegments.length > 1 ? splitSegments : undefined,
      overlapSec: enableSplit ? Number(overlapSec) || 5 : undefined,
      // 구간 제한 (분할 파일)
      allowedStartSec,
      allowedEndSec,
    };

    onStart(options);
  };

  // ESC 키로 닫기
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="stt-config-modal-overlay" 
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stt-config-title"
    >
      <div className="stt-config-modal" style={enableSplit ? { maxWidth: 640 } : undefined}>
        {/* 헤더 */}
        <div className="stt-config-header">
          <h2 id="stt-config-title">🎤 {t('sttConfig.title')}</h2>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="stt-config-body">
          {/* STT 설정 섹션 */}
          <section className="stt-config-section">
            <h3>{t('sttConfig.sttSettings')}</h3>

            <div className="form-group">
              <label className="form-label">{t('sttConfig.sttModel')}</label>
              <select
                className="form-select"
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('sttConfig.recognitionLanguage')}</label>
              <select
                className="form-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {getLanguageOptionsForModel(model, i18next.language !== 'ko').map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* 파일 분할 섹션 */}
          <section className="stt-config-section">
            <div className="stt-config-section-header">
              <h3>{t('sttConfig.fileSplitSettings')}</h3>
              <button
                type="button"
                role="switch"
                aria-checked={enableSplit}
                className={`stt-config-toggle ${enableSplit ? 'stt-config-toggle--active' : ''}`}
                onClick={() => setEnableSplit(!enableSplit)}
              >
                <span className="stt-config-toggle__thumb" />
              </button>
            </div>
            <span className="form-hint">{t('sttConfig.fileSplitDesc')}</span>

            {enableSplit && mediaUrl && (
              <div className="form-group">
                <SplitPointEditor
                  audioUrl={mediaUrl}
                  duration={mediaDuration}
                  splitPoints={splitPoints}
                  onSplitPointsChange={setSplitPoints}
                  model={model}
                  fileId={fileId}
                />
              </div>
            )}

            {enableSplit && (
              <div className="form-group">
                <label className="form-label">
                  {t('sttConfig.overlapSec')}
                  <span className="form-hint">{t('sttConfig.overlapSecDesc')}</span>
                </label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  max={10}
                  step={1}
                  value={overlapSec}
                  onChange={(e) => setOverlapSec(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
                />
              </div>
            )}

            {enableSplit && !mediaUrl && (
              <div className="form-group">
                <span className="form-hint" style={{ color: '#f7768e' }}>
                  {t('sttConfig.noMediaForSplit')}
                </span>
              </div>
            )}
          </section>

          {/* 세그먼트 분리 설정 섹션 */}
          <section className="stt-config-section">
            <h3>{t('sttConfig.segmentSettings')}</h3>
            
            <div className="form-group">
              <label className="form-label">
                {t('sttConfig.maxCharacters')}
                <span className="form-hint">{t('sttConfig.syncWithSettings')}</span>
              </label>
              <input
                type="number"
                className="form-input"
                value={maxSegmentLength}
                min={0}
                max={200}
                step={1}
                onChange={(e) => {
                  const val = e.target.value;
                  setSTTSegmentOption('maxSegmentLength', val === '' ? '' : parseInt(val));
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val)) setSTTSegmentOption('maxSegmentLength', 80);
                }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('sttConfig.splitInterval')}
                <span className="form-hint">{t('sttConfig.splitIntervalDesc')}</span>
              </label>
              <input
                type="number"
                className="form-input"
                min="0.5"
                max="5.0"
                step="0.1"
                value={splitTimeGap}
                onChange={(e) => setSplitTimeGap(e.target.value)}
              />
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="stt-config-footer">
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-start" onClick={handleStart}>
            🚀 {t('sttConfig.runStt')}
          </button>
        </div>
      </div>
    </div>
  );
}
