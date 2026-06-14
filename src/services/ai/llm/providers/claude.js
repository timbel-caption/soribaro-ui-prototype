import { BaseLLM } from "../baseLLM";

/**
 * Claude (Anthropic) LLM 제공자
 */
export class ClaudeProvider extends BaseLLM {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.baseUrl = "https://api.anthropic.com/v1";
    this.model = options.model || "claude-sonnet-4-20250514";
  }

  /**
   * 자막 번역
   */
  async translateSubtitles(subtitles, targetLanguage, options = {}) {
    const { onProgress } = options;
    const batchSize = options.batchSize || 20;
    const results = [];

    for (let i = 0; i < subtitles.length; i += batchSize) {
      const batch = subtitles.slice(i, i + batchSize);
      const translatedBatch = await this._translateBatch(batch, targetLanguage);
      results.push(...translatedBatch);

      if (onProgress) {
        const progress = Math.min(
          100,
          Math.round(((i + batch.length) / subtitles.length) * 100),
        );
        onProgress(progress);
      }
    }

    return results;
  }

  /**
   * 배치 번역 내부 메서드
   */
  async _translateBatch(subtitles, targetLanguage) {
    const { getLangEnglishName } = await import('../../../../constants/langEnglishNames');
    const targetLangName = getLangEnglishName(targetLanguage);
    const textsToTranslate = subtitles
      .map((s, idx) => `[${idx}] ${s.text}`)
      .join("\n");

    const systemPrompt = `당신은 전문 자막 번역가입니다. 
다음 규칙을 따라 번역해주세요:
1. 각 줄의 [번호]를 유지하면서 번역합니다.
2. 자막의 맥락과 뉘앙스를 살려 자연스럽게 번역합니다.
3. 원본의 줄바꿈 구조를 유지합니다.
4. 번역 결과만 출력하고 다른 설명은 하지 않습니다.`;

    const userPrompt = `다음 자막들을 ${targetLangName}로 번역해주세요:

${textsToTranslate}`;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "번역 요청 실패");
    }

    const data = await response.json();
    const translatedText = data.content?.[0]?.text || "";

    return this._parseTranslatedText(subtitles, translatedText);
  }

  /**
   * 번역 결과 파싱
   */
  _parseTranslatedText(originalSubtitles, translatedText) {
    const lines = translatedText.split("\n").filter((line) => line.trim());
    const results = [];

    for (const original of originalSubtitles) {
      const idx = originalSubtitles.indexOf(original);
      const matchingLine = lines.find((line) => line.startsWith(`[${idx}]`));

      if (matchingLine) {
        const translatedContent = matchingLine
          .replace(/^\[\d+\]\s*/, "")
          .trim();
        results.push({
          ...original,
          text: translatedContent,
          originalText: original.text,
        });
      } else {
        results.push({
          ...original,
          originalText: original.text,
        });
      }
    }

    return results;
  }

  /**
   * SRT 기반 자막 번역
   * @param {string} srtData - 커스텀 SRT 포맷 문자열
   * @param {string} systemPrompt - 시스템 프롬프트
   * @param {Object} options - 추가 옵션
   * @param {number} [options.temperature=0.3] - temperature (0.0 ~ 1.0)
   * @param {number} [options.maxTokens=-1] - 최대 토큰 수 (-1이면 기본값 8192)
   * @param {number} [options.topP=1.0] - top_p (0.0 ~ 1.0), temperature 설정 시 무시
   * @param {number} [options.frequencyPenalty] - 미사용 (Claude 미지원)
   * @param {number} [options.presencePenalty] - 미사용 (Claude 미지원)
   * @returns {Promise<{text: string, raw?: any, usage?: any}>} - 번역 결과
   */
  async translateSRT(srtData, systemPrompt, options = {}) {
    const {
      temperature = 0.3,
      maxTokens = -1,
      topP = 1.0,
      topK,
      // frequencyPenalty, presencePenalty는 Claude에서 미지원 - 무시
    } = options;

    // Claude는 temperature와 top_p를 동시에 사용할 수 없음
    // temperature가 설정되어 있으면 top_p를 제외
    const samplingParams = {};
    if (temperature !== undefined && temperature !== null) {
      samplingParams.temperature = temperature;
    } else if (topP !== undefined && topP !== null) {
      samplingParams.top_p = topP;
    }

    // top_k 설정 (Claude 지원)
    if (topK !== undefined && topK !== null) {
      samplingParams.top_k = topK;
    }

    const body = {
      model: this.model,
      max_tokens: maxTokens > 0 ? maxTokens : 16384,
      system: systemPrompt,
      messages: [
        { role: "user", content: `<original_text>\n${srtData}\n</original_text>` },
      ],
      ...samplingParams,
    };

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    };

    // AbortSignal이 전달되면 fetch에 연결
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const response = await fetch(`${this.baseUrl}/messages`, fetchOptions);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "SRT 번역 요청 실패");
    }

    const data = await response.json();
    return {
      text: data.content?.[0]?.text || "",
      raw: data,
      usage: data.usage || null,
    };
  }

  /**
   * 단일 텍스트 번역
   * @param {string} text - 번역할 텍스트
   * @param {string} targetLanguage - 목표 언어
   * @param {string} [systemPrompt] - 커스텀 시스템 프롬프트 (선택적)
   * @returns {Promise<{text: string, raw?: any, usage?: any}>} - 번역 결과
   */
  async translate(text, targetLanguage, systemPrompt) {
    const { getLangEnglishName } = await import('../../../../constants/langEnglishNames');
    const targetLangName = getLangEnglishName(targetLanguage);
    const defaultPrompt = `You are a professional subtitle translator. Translate the following text to ${targetLangName}. Return only the translated text without any additional explanation or formatting.`;
    
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt || defaultPrompt,
        messages: [{ role: "user", content: text }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "번역 요청 실패");
    }

    const data = await response.json();
    return {
      text: (data.content?.[0]?.text || "").trim(),
      raw: data,
      usage: data.usage || null,
    };
  }

  /**
   * 연결 테스트
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });

      if (response.ok) {
        return { success: true, message: "Claude API 연결 성공" };
      } else {
        const error = await response.json();
        return {
          success: false,
          message: error.error?.message || "API 키가 유효하지 않습니다.",
        };
      }
    } catch (error) {
      return { success: false, message: `연결 오류: ${error.message}` };
    }
  }

  /**
   * 제공자 정보
   */
  static getProviderInfo() {
    return {
      id: "claude",
      name: "Claude (Anthropic)",
      description: "Anthropic의 Claude 모델을 사용한 번역",
      models: [
        {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          description: "균형 잡힌 성능",
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          description: "빠르고 경제적",
        },
      ],
      requiredFields: [
        {
          key: "apiKey",
          label: "API Key",
          type: "password",
          placeholder: "sk-ant-...",
        },
      ],
    };
  }
}
