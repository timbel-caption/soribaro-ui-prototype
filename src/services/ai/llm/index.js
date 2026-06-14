/**
 * LLM 모듈 팩토리
 * LLM 제공자를 관리하고 인스턴스를 생성합니다.
 */
import { ChatGPTProvider } from './providers/chatgpt';
import { GeminiProvider } from './providers/gemini';
import { ClaudeProvider } from './providers/claude';

// 등록된 LLM 제공자 목록
const LLM_PROVIDERS = {
  openai: ChatGPTProvider,
  gemini: GeminiProvider,
  claude: ClaudeProvider,
};

/**
 * LLM 제공자 인스턴스 생성
 * @param {string} providerId - 제공자 ID (예: 'openai')
 * @param {string} apiKey - API 키
 * @param {Object} options - 추가 옵션 (model 등)
 * @returns {BaseLLM} LLM 제공자 인스턴스
 */
export function createLLMProvider(providerId, apiKey, options = {}) {
  const Provider = LLM_PROVIDERS[providerId];
  
  if (!Provider) {
    throw new Error(`알 수 없는 LLM 제공자: ${providerId}`);
  }
  
  return new Provider(apiKey, options);
}

/**
 * 사용 가능한 LLM 제공자 목록 반환
 * @returns {Array} 제공자 정보 배열
 */
export function getAvailableLLMProviders() {
  return Object.entries(LLM_PROVIDERS).map(([id, Provider]) => ({
    id,
    ...Provider.getProviderInfo(),
  }));
}

/**
 * 특정 제공자 정보 반환
 * @param {string} providerId - 제공자 ID
 * @returns {Object|null} 제공자 정보
 */
export function getLLMProviderInfo(providerId) {
  const Provider = LLM_PROVIDERS[providerId];
  return Provider ? { id: providerId, ...Provider.getProviderInfo() } : null;
}

/**
 * LLM 제공자 등록 (확장용)
 * @param {string} id - 제공자 ID
 * @param {Class} ProviderClass - BaseLLM을 상속받은 클래스
 */
export function registerLLMProvider(id, ProviderClass) {
  LLM_PROVIDERS[id] = ProviderClass;
}

export { ChatGPTProvider, GeminiProvider, ClaudeProvider };
