import { BaseSTT } from '../baseSTT';
import { 
  resegmentSubtitles, 
  extractWordsFromClovaSegments,
  DEFAULT_SEGMENT_OPTIONS,
} from '../utils/resegmentSubtitles';

/**
 * CLOVA Speech 장문 인식 API 제공자
 * https://api.ncloud-docs.com/docs/ai-application-service-clovaspeech-longsentence-local
 */
export class ClovaSTTProvider extends BaseSTT {
  constructor(config = {}) {
    super(config);
    // CLOVA Speech 장문 인식 API는 Invoke URL + Secret Key 사용
    this.invokeUrl = config.invokeUrl;
    this.secretKey = config.secretKey;
  }

  /**
   * 음성 파일을 자막으로 변환 (장문 인식 API)
   */
  async transcribe(audioFile, options = {}) {
    const { 
      language: inputLanguage = 'ko-KR', 
      onProgress,
      enableDiarization = true,  // 화자 인식
      format = 'JSON',  // JSON, SRT, SMI
      // 세그먼트 분리 옵션
      maxSegmentLength = DEFAULT_SEGMENT_OPTIONS.maxSegmentLength,
      splitTimeGap = DEFAULT_SEGMENT_OPTIONS.splitTimeGap,
    } = options;

    // 언어 코드 정규화 (이전 형식 호환)
    const language = this._normalizeLanguageCode(inputLanguage);

    // 파일 형식 확인
    const fileExtension = this._getFileExtension(audioFile);
    if (!ClovaSTTProvider.getSupportedFormats().includes(fileExtension)) {
      throw new Error(`지원하지 않는 파일 형식입니다: ${fileExtension}`);
    }

    if (onProgress) onProgress(10);

    // multipart/form-data 생성
    const formData = new FormData();
    formData.append('media', audioFile);
    
    // 파라미터 설정
    const params = {
      language,
      completion: 'sync',  // 동기 방식으로 결과 즉시 반환
      wordAlignment: true,  // 단어별 타임스탬프
      fullText: true,  // 전체 텍스트 포함
      noiseFiltering: true,  // 노이즈 필터링
      diarization: {
        enable: enableDiarization
      }
    };
    formData.append('params', JSON.stringify(params));

    if (onProgress) onProgress(30);

    // CLOVA Speech 장문 인식 API 호출
    // Invoke URL 형식: https://clovaspeech-gw.ncloud.com/external/v1/{계정ID}/{키}
    // 개발 환경에서는 Vite 프록시를 통해 CORS 우회
    const endpoint = this._getEndpoint();
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-CLOVASPEECH-API-KEY': this.secretKey,
      },
      body: formData,
    });

    if (onProgress) onProgress(80);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`엔진1 API 오류: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 결과 확인
    if (data.result !== 'COMPLETED') {
      throw new Error(`엔진1 인식 실패: ${data.message || data.result}`);
    }
    
    if (onProgress) onProgress(100);

    // CLOVA 응답을 자막 형식으로 변환
    return this._parseResponse(data, { maxSegmentLength, splitTimeGap });
  }

  /**
   * 언어 코드 정규화 (이전 단문 API 형식 → 장문 API 형식)
   */
  _normalizeLanguageCode(code) {
    // 이전 단문 인식 API 코드를 장문 인식 API 코드로 변환
    const legacyMapping = {
      'Kor': 'ko-KR',
      'Eng': 'en-US',
      'Jpn': 'ja',
      'Chn': 'zh-cn',
    };

    // 이미 올바른 형식이면 그대로 반환
    const validCodes = ['ko-KR', 'en-US', 'ja', 'enko', 'zh-cn', 'zh-tw'];
    if (validCodes.includes(code)) {
      return code;
    }

    // 레거시 코드 변환
    if (legacyMapping[code]) {
      return legacyMapping[code];
    }

    // 기본값
    return 'ko-KR';
  }

  /**
   * API 엔드포인트 생성
   * 개발/프로덕션 모두 프록시 경로 사용 (CORS 우회)
   */
  _getEndpoint() {
    // Invoke URL에서 경로 추출
    // 예: https://clovaspeech-gw.ncloud.com/external/v1/3962/xxx -> /external/v1/3962/xxx
    const url = new URL(this.invokeUrl);
    const path = url.pathname;
    
    // 개발: Vite 프록시, 프로덕션: nginx 프록시
    return `/api/clova-speech${path}/recognizer/upload`;
  }

  /**
   * CLOVA 장문 인식 응답 파싱
   * segments의 words 배열을 기반으로 세그먼트 재분리
   */
  _parseResponse(data, segmentOptions = {}) {
    const segments = data.segments || [];
    
    // words 배열이 있는지 확인
    const hasWords = segments.some(seg => seg.words && seg.words.length > 0);
    
    if (hasWords) {
      // words 기반 재분리
      const allWords = extractWordsFromClovaSegments(segments);
      const resegmented = resegmentSubtitles(allWords, segmentOptions);
      
      // 결과에 speaker 정보 추가
      return resegmented.map(segment => ({
        ...segment,
        speaker: segment.speakerId ? {
          label: segment.speakerId,
          name: `화자 ${segment.speakerId}`
        } : null,
      }));
    }
    
    // words가 없으면 기존 segments 사용 (fallback)
    return segments.map((segment, index) => ({
      id: `stt-${Date.now()}-${index}`,
      text: segment.textEdited || segment.text || '',
      startTime: segment.start / 1000,  // ms → 초 변환
      endTime: segment.end / 1000,
      confidence: segment.confidence || 0,
      speaker: segment.speaker ? {
        label: segment.speaker.label,
        name: segment.speaker.name || `화자 ${segment.speaker.label}`
      } : null,
      words: segment.words ? segment.words.map(([start, end, text]) => ({
        start: start / 1000,
        end: end / 1000,
        text
      })) : null
    }));
  }

  /**
   * 파일 확장자 추출
   */
  _getFileExtension(file) {
    if (file.name) {
      return file.name.split('.').pop().toLowerCase();
    }
    // Blob인 경우 type에서 추출
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
      if (!this.invokeUrl || !this.secretKey) {
        return { success: false, message: 'Invoke URL과 Secret Key가 필요합니다.' };
      }

      // Invoke URL 형식 검증
      if (!this.invokeUrl.includes('clovaspeech-gw.ncloud.com')) {
        return { success: false, message: 'Invoke URL 형식이 올바르지 않습니다.' };
      }

      // 실제 테스트를 위해서는 작은 오디오 샘플이 필요
      // 여기서는 설정값 존재 여부만 확인
      return { 
        success: true, 
        message: 'CLOVA Speech 설정이 완료되었습니다. 실제 변환 시 연결을 확인합니다.' 
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
      id: 'clova',
      name: 'CLOVA Speech (Naver)',
      description: '네이버 클라우드 플랫폼의 장문 음성 인식 서비스 (타임스탬프, 화자 인식 지원)',
      requiredFields: [
        { 
          key: 'invokeUrl', 
          label: 'Invoke URL', 
          type: 'text', 
          placeholder: 'https://clovaspeech-gw.ncloud.com/external/v1/...' 
        },
        { 
          key: 'secretKey', 
          label: 'Secret Key', 
          type: 'password', 
          placeholder: 'CLOVA Speech Secret Key' 
        },
      ],
      languages: ClovaSTTProvider.getSupportedLanguages(),
    };
  }

  /**
   * 지원 언어 목록 (장문 인식 API)
   */
  static getSupportedLanguages() {
    return [
      { code: 'ko-KR', name: '한국어' },
      { code: 'en-US', name: '영어' },
      { code: 'enko', name: '한/영 동시인식' },
      { code: 'ja', name: '일본어' },
      { code: 'zh-cn', name: '중국어(간체)' },
      { code: 'zh-tw', name: '중국어(번체)' },
    ];
  }

  /**
   * 지원 오디오/비디오 형식 (장문 인식 API)
   */
  static getSupportedFormats() {
    // 오디오: MP3, AAC, AC3, OGG, FLAC, WAV, M4A
    // 비디오: AVI, MP4, MOV, WMV, FLV, MKV
    return ['mp3', 'aac', 'ac3', 'ogg', 'flac', 'wav', 'm4a', 'avi', 'mp4', 'mov', 'wmv', 'flv', 'mkv'];
  }
}
