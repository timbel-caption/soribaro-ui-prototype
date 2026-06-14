import { BaseSTT } from '../baseSTT';
import { 
  resegmentSubtitles, 
  normalizeElevenLabsWords,
  DEFAULT_SEGMENT_OPTIONS,
} from '../utils/resegmentSubtitles';

/**
 * SttConfigModal 언어 코드 → ElevenLabs ISO 639-3 코드 매핑
 * ElevenLabs API는 ISO 639-3 형식의 언어 코드를 사용합니다.
 */
const LANGUAGE_CODE_MAP = {
  'ko-KR': 'kor',
  'en-US': 'eng',
  'ja': 'jpn',
  'zh-cn': 'zho',
  'zh-tw': 'zho',
  'enko': null,  // 한/영 동시인식은 자동 감지로 처리
};

/**
 * ElevenLabs Scribe STT 제공자
 * 90개 이상의 언어를 지원하는 고품질 음성 인식 서비스
 */
export class ElevenLabsSTTProvider extends BaseSTT {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'scribe_v2';
    this.baseUrl = 'https://api.elevenlabs.io/v1/speech-to-text';
  }

  /**
   * 음성 파일을 자막으로 변환
   */
  async transcribe(audioFile, options = {}) {
    const { 
      language = null, // null이면 자동 감지
      onProgress,
      diarize = false,
      numSpeakers = null,
      timestampsGranularity = 'word',
      // 세그먼트 분리 옵션
      maxSegmentLength = DEFAULT_SEGMENT_OPTIONS.maxSegmentLength,
      splitTimeGap = DEFAULT_SEGMENT_OPTIONS.splitTimeGap,
    } = options;

    // 파일 형식 확인
    const fileExtension = this._getFileExtension(audioFile);
    if (!ElevenLabsSTTProvider.getSupportedFormats().includes(fileExtension)) {
      throw new Error(`지원하지 않는 파일 형식입니다: ${fileExtension}`);
    }

    if (onProgress) onProgress(10);

    // FormData 생성
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model_id', this.model);
    
    // 언어 코드 변환 (SttConfigModal 형식 → ElevenLabs ISO 639-3 형식)
    const elevenLabsLanguage = this._normalizeLanguageCode(language);
    if (elevenLabsLanguage) {
      formData.append('language_code', elevenLabsLanguage);
    }
    
    formData.append('diarize', diarize.toString());
    formData.append('timestamps_granularity', timestampsGranularity);
    
    if (diarize && numSpeakers) {
      formData.append('num_speakers', numSpeakers.toString());
    }

    if (onProgress) onProgress(30);

    // ElevenLabs API 호출
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
      },
      body: formData,
    });

    if (onProgress) onProgress(80);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`엔진2 API 오류: ${response.status} - ${errorData.detail?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (onProgress) onProgress(100);

    // ElevenLabs 응답을 자막 형식으로 변환
    return this._parseResponse(data, { maxSegmentLength, splitTimeGap });
  }

  /**
   * ElevenLabs 응답 파싱
   * words 배열에서 타임스탬프 정보를 추출하여 자막 생성
   */
  _parseResponse(data, segmentOptions = {}) {
    const { text, words = [], language_code } = data;

    // words가 없으면 전체 텍스트를 문장 단위로 분리
    if (!words || words.length === 0) {
      const sentences = this._splitIntoSentences(text);
      return sentences.map((sentence, index) => ({
        id: `stt-${Date.now()}-${index}`,
        text: sentence.trim(),
        startTime: 0,
        endTime: 0,
        needsTimestamp: true,
        language: language_code,
      }));
    }

    // 공통 유틸리티를 사용하여 세그먼트 재분리
    const normalizedWords = normalizeElevenLabsWords(words);
    const subtitles = resegmentSubtitles(normalizedWords, segmentOptions);

    // ElevenLabs speaker_id ("speaker_0", "speaker_1", ...) → 1-based label ("1", "2", ...)
    return subtitles.map(sub => {
      const rawId = sub.speakerId;
      const numMatch = rawId != null ? String(rawId).match(/\d+/) : null;
      const label = numMatch ? String(Number(numMatch[0]) + 1) : null;
      return {
        ...sub,
        language: language_code,
        speaker: label ? { label, name: `화자 ${label}` } : null,
      };
    });
  }

  /**
   * 텍스트를 문장 단위로 분리
   */
  _splitIntoSentences(text) {
    const sentences = text.split(/(?<=[.!?。！？])\s*/);
    return sentences.filter(s => s.trim().length > 0);
  }

  /**
   * 언어 코드 정규화 (SttConfigModal 형식 → ElevenLabs ISO 639-3 형식)
   * @param {string|null} code - 입력 언어 코드
   * @returns {string|null} - ElevenLabs 언어 코드 (null이면 자동 감지)
   */
  _normalizeLanguageCode(code) {
    if (!code) return null;
    
    // 매핑 테이블에 있으면 변환
    if (code in LANGUAGE_CODE_MAP) {
      return LANGUAGE_CODE_MAP[code];
    }
    
    // 이미 ElevenLabs 형식이면 그대로 반환
    return code;
  }

  /**
   * 파일 확장자 추출
   */
  _getFileExtension(file) {
    if (file.name) {
      return file.name.split('.').pop().toLowerCase();
    }
    if (file.type) {
      return file.type.split('/').pop().toLowerCase();
    }
    return '';
  }

  /**
   * 연결 테스트
   */
  async testConnection() {
    try {
      if (!this.apiKey) {
        return { success: false, message: 'API Key가 필요합니다.' };
      }

      // ElevenLabs 모델 목록 API로 인증 확인 (더 범용적인 엔드포인트)
      const response = await fetch('https://api.elevenlabs.io/v1/models', {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, message: 'API Key가 유효하지 않습니다.' };
        }
        return { success: false, message: `연결 오류: ${response.status}` };
      }

      const models = await response.json();
      return { 
        success: true, 
        message: `연결 성공! (${models.length || 0}개 모델 사용 가능)` 
      };
    } catch (error) {
      return { success: false, message: `연결 오류: ${error.message}` };
    }
  }

  /**
   * 제공자 정보
   */
  static getProviderInfo() {
    return {
      id: 'elevenlabs',
      name: 'ElevenLabs Scribe',
      description: 'ElevenLabs 다국어 음성 인식 (90+ 언어 지원)',
      requiredFields: [
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'xi-...' },
      ],
      models: [
        { id: 'scribe_v2', name: 'Scribe v2', description: '최신 모델 (권장)' },
        { id: 'scribe_v1', name: 'Scribe v1', description: '이전 버전' },
      ],
      languages: ElevenLabsSTTProvider.getSupportedLanguages(),
      options: {
        diarize: { type: 'boolean', default: false, label: '화자 분리' },
        timestampsGranularity: { 
          type: 'enum', 
          default: 'word', 
          options: ['none', 'word', 'character'],
          label: '타임스탬프 단위'
        },
      },
    };
  }

  /**
   * 지원 언어 목록 (주요 언어)
   */
  static getSupportedLanguages() {
    return [
      { code: 'en', name: '영어' },
      { code: 'ja', name: '일본어' },
      { code: 'zh', name: '중국어' },
      { code: 'es', name: '스페인어' },
      { code: 'fr', name: '프랑스어' },
      { code: 'de', name: '독일어' },
      { code: 'it', name: '이탈리아어' },
      { code: 'pt', name: '포르투갈어' },
      { code: 'ru', name: '러시아어' },
      { code: 'ar', name: '아랍어' },
      { code: 'hi', name: '힌디어' },
      { code: 'vi', name: '베트남어' },
      { code: 'th', name: '태국어' },
      { code: 'id', name: '인도네시아어' },
      { code: 'nl', name: '네덜란드어' },
      { code: 'pl', name: '폴란드어' },
      { code: 'tr', name: '터키어' },
      { code: 'sv', name: '스웨덴어' },
      { code: 'da', name: '덴마크어' },
      { code: 'fi', name: '핀란드어' },
      { code: 'no', name: '노르웨이어' },
      { code: 'auto', name: '자동 감지' },
    ];
  }

  /**
   * 지원 오디오/비디오 형식
   */
  static getSupportedFormats() {
    return ['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg', 'webm', 'mp4', 'mov', 'avi', 'mkv'];
  }
}
