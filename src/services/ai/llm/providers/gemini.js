import { BaseLLM } from '../baseLLM';

/**
 * Gemini (Google) LLM 제공자
 */
export class GeminiProvider extends BaseLLM {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = options.model || 'gemini-2.0-flash';
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
        const progress = Math.min(100, Math.round(((i + batch.length) / subtitles.length) * 100));
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
    const textsToTranslate = subtitles.map((s, idx) => `[${idx}] ${s.text}`).join('\n');

    const prompt = `당신은 전문 자막 번역가입니다. 
다음 규칙을 따라 번역해주세요:
1. 각 줄의 [번호]를 유지하면서 번역합니다.
2. 자막의 맥락과 뉘앙스를 살려 자연스럽게 번역합니다.
3. 원본의 줄바꿈 구조를 유지합니다.
4. 번역 결과만 출력하고 다른 설명은 하지 않습니다.

다음 자막들을 ${targetLangName}로 번역해주세요:

${textsToTranslate}`;

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || '번역 요청 실패');
    }

    const data = await response.json();
    const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return this._parseTranslatedText(subtitles, translatedText);
  }

  /**
   * 번역 결과 파싱
   */
  _parseTranslatedText(originalSubtitles, translatedText) {
    const lines = translatedText.split('\n').filter(line => line.trim());
    const results = [];

    for (const original of originalSubtitles) {
      const idx = originalSubtitles.indexOf(original);
      const matchingLine = lines.find(line => line.startsWith(`[${idx}]`));
      
      if (matchingLine) {
        const translatedContent = matchingLine.replace(/^\[\d+\]\s*/, '').trim();
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
   * @param {number} [options.temperature=0.3] - temperature (0.0 ~ 2.0)
   * @param {number} [options.maxTokens=-1] - 최대 토큰 수 (-1이면 무제한)
   * @param {number} [options.topP=1.0] - top_p (0.0 ~ 1.0)
   * @param {number} [options.frequencyPenalty] - 미사용 (Gemini 미지원)
   * @param {number} [options.presencePenalty] - 미사용 (Gemini 미지원)
   * @param {'low'|'medium'|'high'} [options.reasoningEffort] - Gemini 3 계열 thinkingLevel
   * @returns {Promise<{text: string, raw?: any, usage?: any}>} - 번역 결과
   */
  async translateSRT(srtData, systemPrompt, options = {}) {
    const {
      temperature = 0.3,
      maxTokens = -1,
      topP = 1.0,
      topK,
      reasoningEffort,
      // frequencyPenalty, presencePenalty는 Gemini에서 미지원 - 무시
    } = options;

    const generationConfig = {
      temperature,
      topP,
    };

    // topK가 설정된 경우 추가
    if (topK !== undefined && topK !== null) {
      generationConfig.topK = topK;
    }

    // maxTokens가 양수인 경우에만 추가
    if (maxTokens > 0) {
      generationConfig.maxOutputTokens = maxTokens;
    }

    // Gemini 3 계열은 thinkingConfig.thinkingLevel 지원
    if (reasoningEffort && this.model.toLowerCase().startsWith('gemini-3')) {
      generationConfig.thinkingConfig = {
        thinkingLevel: String(reasoningEffort).toLowerCase(),
      };
    }

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: `<original_text>\n${srtData}\n</original_text>` }],
          },
        ],
        generationConfig,
      }),
    };

    // AbortSignal이 전달되면 fetch에 연결
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      fetchOptions
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'SRT 번역 요청 실패');
    }

    const data = await response.json();
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      raw: data,
      usage: data.usageMetadata || null,
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
    const prompt = `${systemPrompt || defaultPrompt}\n\n${text}`;

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || '번역 요청 실패');
    }

    const data = await response.json();
    return {
      text: (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim(),
      raw: data,
      usage: data.usageMetadata || null,
    };
  }

  /**
   * 연결 테스트
   */
  async testConnection() {
    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );

      if (response.ok) {
        return { success: true, message: 'Gemini API 연결 성공' };
      } else {
        const error = await response.json();
        return { success: false, message: error.error?.message || 'API 키가 유효하지 않습니다.' };
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
      id: 'gemini',
      name: 'Gemini (Google)',
      description: 'Google의 Gemini 모델을 사용한 번역',
      models: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '빠르고 효율적' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '높은 품질' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '경제적' },
      ],
      requiredFields: [
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'AIza...' },
      ],
    };
  }
}
