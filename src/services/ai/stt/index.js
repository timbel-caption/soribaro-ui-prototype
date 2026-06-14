/**
 * STT 모듈 팩토리
 * STT 제공자를 관리하고 인스턴스를 생성합니다.
 */
import { ClovaSTTProvider } from './providers/clova';
import { ElevenLabsSTTProvider } from './providers/elevenlabs';

// 등록된 STT 제공자 목록
const STT_PROVIDERS = {
  clova: ClovaSTTProvider,
  elevenlabs: ElevenLabsSTTProvider,
  // 추후 추가 예정:
  // whisper: WhisperProvider,
  // google: GoogleSTTProvider,
};

/**
 * STT 제공자 인스턴스 생성
 * @param {string} providerId - 제공자 ID (예: 'clova')
 * @param {Object} config - 설정 (apiKey, secretKey 등)
 * @returns {BaseSTT} STT 제공자 인스턴스
 */
export function createSTTProvider(providerId, config = {}) {
  const Provider = STT_PROVIDERS[providerId];
  
  if (!Provider) {
    throw new Error(`알 수 없는 STT 제공자: ${providerId}`);
  }
  
  return new Provider(config);
}

/**
 * 사용 가능한 STT 제공자 목록 반환
 * @returns {Array} 제공자 정보 배열
 */
export function getAvailableSTTProviders() {
  return Object.entries(STT_PROVIDERS).map(([id, Provider]) => ({
    id,
    ...Provider.getProviderInfo(),
  }));
}

/**
 * 특정 제공자 정보 반환
 * @param {string} providerId - 제공자 ID
 * @returns {Object|null} 제공자 정보
 */
export function getSTTProviderInfo(providerId) {
  const Provider = STT_PROVIDERS[providerId];
  return Provider ? { id: providerId, ...Provider.getProviderInfo() } : null;
}

/**
 * 특정 제공자의 지원 언어 목록 반환
 * @param {string} providerId - 제공자 ID
 * @returns {Array} 지원 언어 목록
 */
export function getSTTSupportedLanguages(providerId) {
  const Provider = STT_PROVIDERS[providerId];
  return Provider ? Provider.getSupportedLanguages() : [];
}

/**
 * 특정 제공자의 지원 파일 형식 반환
 * @param {string} providerId - 제공자 ID
 * @returns {Array} 지원 파일 형식 목록
 */
export function getSTTSupportedFormats(providerId) {
  const Provider = STT_PROVIDERS[providerId];
  return Provider ? Provider.getSupportedFormats() : [];
}

/**
 * STT 제공자 등록 (확장용)
 * @param {string} id - 제공자 ID
 * @param {Class} ProviderClass - BaseSTT를 상속받은 클래스
 */
export function registerSTTProvider(id, ProviderClass) {
  STT_PROVIDERS[id] = ProviderClass;
}

export { ClovaSTTProvider, ElevenLabsSTTProvider };
