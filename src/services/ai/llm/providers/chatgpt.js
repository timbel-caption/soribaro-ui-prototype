import { BaseLLM } from '../baseLLM';

/**
 * ChatGPT (OpenAI) LLM 제공자
 */
export class ChatGPTProvider extends BaseLLM {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.baseUrl = 'https://api.openai.com/v1';
    this.model = options.model || 'gpt-4o-mini';
  }

  /**
   * 자막 번역
   */
  async translateSubtitles(subtitles, targetLanguage, options = {}) {
    const { onProgress } = options;
    const batchSize = options.batchSize || 20; // 한 번에 처리할 자막 수
    const results = [];

    // 자막을 배치로 나누어 처리
    for (let i = 0; i < subtitles.length; i += batchSize) {
      const batch = subtitles.slice(i, i + batchSize);
      const translatedBatch = await this._translateBatch(batch, targetLanguage);
      results.push(...translatedBatch);

      // 진행률 콜백
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

    // 번역할 텍스트 목록 생성
    const textsToTranslate = subtitles.map((s, idx) => `[${idx}] ${s.text}`).join('\n');

    const systemPrompt = `당신은 전문 자막 번역가입니다. 
다음 규칙을 따라 번역해주세요:
1. 각 줄의 [번호]를 유지하면서 번역합니다.
2. 자막의 맥락과 뉘앙스를 살려 자연스럽게 번역합니다.
3. 원본의 줄바꿈 구조를 유지합니다.
4. 번역 결과만 출력하고 다른 설명은 하지 않습니다.`;

    const userPrompt = `다음 자막들을 ${targetLangName}로 번역해주세요:

${textsToTranslate}`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // 번역은 일관성이 중요하므로 낮은 temperature
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || '번역 요청 실패');
    }

    const data = await response.json();
    const translatedText = data.choices[0].message.content;

    // 번역 결과 파싱
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
      // [번호] 형식으로 매칭
      const matchingLine = lines.find(line => line.startsWith(`[${idx}]`));
      
      if (matchingLine) {
        const translatedContent = matchingLine.replace(/^\[\d+\]\s*/, '').trim();
        results.push({
          ...original,
          text: translatedContent,
          originalText: original.text, // 원본 보존
        });
      } else {
        // 매칭 실패 시 원본 유지
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
   * @param {number} [options.frequencyPenalty=0] - frequency_penalty (-2.0 ~ 2.0)
   * @param {number} [options.presencePenalty=0] - presence_penalty (-2.0 ~ 2.0)
   * @returns {Promise<{text: string, raw?: any, usage?: any}>} - 번역 결과
   */
  async translateSRT(srtData, systemPrompt, options = {}) {
    const {
      temperature = 0.3,
      maxTokens = -1,
      topP = 1.0,
      frequencyPenalty = 0,
      presencePenalty = 0,
    } = options;

    const lowerModel = this.model.toLowerCase();
    // GPT-5 계열(gpt-5, gpt-5.1, gpt-5-mini, gpt-5-nano)은 리즈닝 모델로
    // temperature, top_p, frequency_penalty, presence_penalty 미지원
    const isGPT5 = lowerModel.startsWith('gpt-5');

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `<original_text>\n${srtData}\n</original_text>` },
      ],
      n: 1,
    };

    // GPT-5 계열이 아닌 경우에만 샘플링 파라미터 추가
    if (!isGPT5) {
      body.temperature = temperature;
      body.top_p = topP;
      body.frequency_penalty = frequencyPenalty;
      body.presence_penalty = presencePenalty;
    }

    // maxTokens가 양수인 경우에만 추가
    // GPT-5 계열, GPT-4.1은 max_completion_tokens 사용 (max_tokens 미지원)
    if (maxTokens > 0) {
      const useCompletionTokens = isGPT5 || lowerModel.startsWith('gpt-4.1');
      if (useCompletionTokens) {
        body.max_completion_tokens = maxTokens;
      } else {
        body.max_tokens = maxTokens;
      }
    }

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    };

    // AbortSignal이 전달되면 fetch에 연결
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, fetchOptions);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'SRT 번역 요청 실패');
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
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
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt || defaultPrompt,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || '번역 요청 실패');
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content.trim(),
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
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        return { success: true, message: 'OpenAI API 연결 성공' };
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
      id: 'openai',
      name: 'ChatGPT (OpenAI)',
      description: 'OpenAI의 GPT 모델을 사용한 번역',
      models: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '빠르고 경제적' },
        { id: 'gpt-4o', name: 'GPT-4o', description: '높은 품질' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '고급 번역' },
      ],
      requiredFields: [
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' },
      ],
    };
  }
}
