/**
 * LLM 기본 인터페이스
 * 모든 LLM 제공자가 구현해야 할 메서드를 정의합니다.
 */
export class BaseLLM {
  constructor(apiKey, options = {}) {
    if (new.target === BaseLLM) {
      throw new Error('BaseLLM은 직접 인스턴스화할 수 없습니다.');
    }
    this.apiKey = apiKey;
    this.options = options;
  }

  /**
   * 자막 번역 (레거시 - JSON 기반)
   * @param {Array} subtitles - 번역할 자막 배열 [{id, text, startTime, endTime}, ...]
   * @param {string} targetLanguage - 목표 언어 코드 (예: 'en', 'ja', 'ko')
   * @param {Object} options - 추가 옵션
   * @returns {Promise<Array>} - 번역된 자막 배열
   */
  async translateSubtitles(subtitles, targetLanguage, options = {}) {
    throw new Error('translateSubtitles 메서드를 구현해야 합니다.');
  }

  /**
   * SRT 기반 자막 번역
   * @param {string} srtData - 커스텀 SRT 포맷 문자열
   * @param {string} systemPrompt - 시스템 프롬프트
   * @param {Object} options - 추가 옵션
   * @param {number} [options.temperature=0.3] - 온도 (0.0~2.0)
   * @param {number} [options.maxTokens] - 최대 토큰 수
   * @param {AbortSignal} [options.signal] - 취소 시그널 (AbortController.signal)
   * @returns {Promise<{text: string, raw?: any, usage?: any}>} - 번역 결과
   */
  async translateSRT(srtData, systemPrompt, options = {}) {
    throw new Error('translateSRT 메서드를 구현해야 합니다.');
  }

  /**
   * 단일 텍스트 번역
   * @param {string} text - 번역할 텍스트
   * @param {string} targetLanguage - 목표 언어
   * @returns {Promise<{text: string, raw?: any, usage?: any}>} - 번역 결과
   */
  async translate(text, targetLanguage) {
    throw new Error('translate 메서드를 구현해야 합니다.');
  }

  /**
   * 연결 테스트
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    throw new Error('testConnection 메서드를 구현해야 합니다.');
  }

  /**
   * 제공자 정보 반환
   * @returns {{id: string, name: string, description: string, models: Array}}
   */
  static getProviderInfo() {
    return {
      id: 'base',
      name: 'Base LLM',
      description: '기본 LLM 인터페이스',
      models: [],
    };
  }

  /**
   * 지원 언어 목록
   * @returns {Array<{code: string, name: string}>}
   */
  static getSupportedLanguages() {
    return [
      { code: 'ko', name: '한국어' },
      { code: 'en', name: '영어' },
      { code: 'ja', name: '일본어' },
      { code: 'zh', name: '중국어' },
      { code: 'es', name: '스페인어' },
      { code: 'fr', name: '프랑스어' },
      { code: 'de', name: '독일어' },
    ];
  }
}
