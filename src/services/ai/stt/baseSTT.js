/**
 * STT 기본 인터페이스
 * 모든 STT 제공자가 구현해야 할 메서드를 정의합니다.
 */
export class BaseSTT {
  constructor(config = {}) {
    if (new.target === BaseSTT) {
      throw new Error('BaseSTT는 직접 인스턴스화할 수 없습니다.');
    }
    this.config = config;
  }

  /**
   * 음성 파일을 자막으로 변환
   * @param {File|Blob} audioFile - 오디오 파일
   * @param {Object} options - 추가 옵션 (language, etc.)
   * @returns {Promise<Array>} - 자막 배열 [{id, text, startTime, endTime}, ...]
   */
  async transcribe(audioFile, options = {}) {
    throw new Error('transcribe 메서드를 구현해야 합니다.');
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
   * @returns {{id: string, name: string, description: string, requiredFields: Array}}
   */
  static getProviderInfo() {
    return {
      id: 'base',
      name: 'Base STT',
      description: '기본 STT 인터페이스',
      requiredFields: [], // 필요한 설정 필드 (apiKey, secretKey 등)
    };
  }

  /**
   * 지원 언어 목록
   * @returns {Array<{code: string, name: string}>}
   */
  static getSupportedLanguages() {
    return [
      { code: 'ko-KR', name: '한국어' },
      { code: 'en-US', name: '영어 (미국)' },
      { code: 'ja-JP', name: '일본어' },
      { code: 'zh-CN', name: '중국어 (간체)' },
    ];
  }

  /**
   * 지원 오디오 형식
   * @returns {Array<string>}
   */
  static getSupportedFormats() {
    return ['mp3', 'wav', 'm4a', 'flac'];
  }
}
