/**
 * SMI (SAMI - Synchronized Accessible Media Interchange) 유틸리티
 */

const SMI_LANG_MAP = {
  ko: { prefix: 'KRCC', name: '한국어', lang: 'ko-KR' },
  en: { prefix: 'ENCC', name: 'English', lang: 'en-US' },
  ja: { prefix: 'JPCC', name: '日本語', lang: 'ja-JP' },
  zh: { prefix: 'ZHCC', name: '中文', lang: 'zh-CN' },
  hi: { prefix: 'HICC', name: 'हिन्दी', lang: 'hi-IN' },
};

function getSmiLang(langCode) {
  return SMI_LANG_MAP[langCode] || SMI_LANG_MAP.ko;
}

function secondsToMs(seconds) {
  return Math.round(seconds * 1000);
}

const POSITION_TO_AN = {
  bottomLeft: 1, bottomCenter: 2, bottomRight: 3,
  middleLeft: 4, center: 5,       middleRight: 6,
  topLeft: 7,    topCenter: 8,    topRight: 9,
};

const AN_TO_POSITION = {
  1: 'bottomLeft', 2: 'bottomCenter', 3: 'bottomRight',
  4: 'middleLeft', 5: 'center',       6: 'middleRight',
  7: 'topLeft',    8: 'topCenter',    9: 'topRight',
};

/**
 * 자막을 SMI 형식으로 내보내기
 * @param {Array} subtitles - 자막 배열
 * @param {string} title - 파일 제목
 * @param {string} langCode - ISO 639-1 언어 코드 (ko, en, ja, zh, hi)
 * @param {Object} [options]
 * @param {boolean} [options.includeTags=true] - 머리말/꼬리말 태그 포함 여부
 * @returns {string} SMI 문자열
 */
export function exportToSMI(subtitles, title = 'SoriBaro Subtitles', langCode = 'ko', { includeTags = true, includeNbsp = true } = {}) {
  const { prefix, name, lang } = getSmiLang(langCode);

  const syncItems = [];

  subtitles.forEach((subtitle) => {
    const startMs = secondsToMs(subtitle.startTime);
    const endMs = secondsToMs(subtitle.endTime);
    const an = POSITION_TO_AN[subtitle.position] ?? 2;
    const posTag = an !== 2 ? `{\\an${an}}` : '';
    const text = posTag + (subtitle.text || '').replace(/\r\n|\r|\n/g, '<br>');

    syncItems.push(`<SYNC Start=${startMs}><P Class=${prefix}>\n${text}`);
    if (includeNbsp) {
      syncItems.push(`<SYNC Start=${endMs}><P Class=${prefix}>&nbsp;`);
    }
  });

  if (!includeTags) {
    return syncItems.join('\n');
  }

  const header = `<SAMI>
<HEAD>
<TITLE>Time Tools (C) CCNSOFT 2005</TITLE>
<STYLE TYPE="text/css">
<!--
P { margin-left:8pt; margin-right:8pt; margin-bottom:2pt;
    margin-top:2pt; font-size:12pt; text-align:left;
    font-family:굴림, Arial; font-weight:normal; color:white;
    background-color:#405A8D; }
.${prefix} { Name:${name}; lang:${lang}; SAMIType:CC; }
#STDPrn { Name:Standard Print; }
#LargePrn { Name:Large Print; font-size:20pt; }
#SmallPrn { Name:Small Print; font-size:10pt; }
-->
</STYLE>
</HEAD>
<BODY>`;

  const footer = `</BODY></SAMI>`;

  return `${header}\n\n${syncItems.join('\n')}\n${footer}`;
}

/**
 * SMI 파일 파싱
 * @param {string} smiString - SMI 문자열
 * @returns {Array|null} 자막 배열 또는 null
 */
export function parseSMI(smiString) {
  const subtitles = [];
  
  try {
    // SYNC 태그 정규식 (P 태그의 Class 속성과 ALIGN 속성도 캡처)
    const syncRegex = /<SYNC\s+Start=(\d+)[^>]*>\s*<P\s+([^>]*)>([\s\S]*?)(?=<SYNC|<\/BODY>|$)/gi;

    let match;
    let tempSubtitle = null;

    while ((match = syncRegex.exec(smiString)) !== null) {
      const startMs = parseInt(match[1], 10);
      const pAttrs = match[2] || '';
      const pClassMatch = pAttrs.match(/Class\s*=\s*["']?(\w+)["']?/i);
      const pAlignMatch = pAttrs.match(/ALIGN\s*=\s*["']?(\w+)["']?/i);
      const pClass = pClassMatch ? pClassMatch[1] : '';
      const pAlign = pAlignMatch ? pAlignMatch[1].toLowerCase() : '';
      let text = match[3].trim();
      
      // &nbsp;만 있는 경우: export된 SMI의 종료 마커 (이전 자막 닫기만, 별도 항목 생성 X)
      // 텍스트가 완전히 비어있는 경우: 원본 SMI의 의도된 공백 싱크 (빈 자막 항목으로 유지)
      const isEndMarker = text === '&nbsp;' || /^(?:&nbsp;|\s)+$/i.test(text);
      const isEmptyGap = !isEndMarker && (text === '' || /^\s*$/.test(text));

      // 이전 자막이 있으면 끝 시간을 현재 시작 시간으로 설정 후 저장
      if (tempSubtitle) {
        tempSubtitle.endTime = startMs / 1000;
        subtitles.push(tempSubtitle);
        tempSubtitle = null;
      }

      if (isEndMarker) {
        // 종료 마커 — 이전 자막은 이미 위에서 닫혔으므로 그대로 skip
        continue;
      } else if (isEmptyGap) {
        // 공백 싱크 — 빈 자막 항목으로 유지 (타임코드 보존)
        tempSubtitle = {
          id: `smi_${subtitles.length}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          text: '',
          startTime: startMs / 1000,
          endTime: startMs / 1000 + 3,
          position: 'bottomCenter',
        };
      } else {
        // HTML 태그 정리
        text = text
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&amp;/gi, '&')
          .trim();

        let position = 'bottomCenter';
        // {\anN} 위치 태그 우선, 없으면 ALIGN 속성, 없으면 Class 접미사(_L/_R) 호환 파싱
        const anMatch = text.match(/^\{\\an(\d)\}/);
        if (anMatch) {
          const anNum = parseInt(anMatch[1], 10);
          if (AN_TO_POSITION[anNum]) position = AN_TO_POSITION[anNum];
          text = text.slice(anMatch[0].length);
        } else if (pAlign === 'left') position = 'bottomLeft';
        else if (pAlign === 'right') position = 'bottomRight';
        else if (pClass) {
          const cls = pClass.toUpperCase();
          if (cls.endsWith('_L')) position = 'bottomLeft';
          else if (cls.endsWith('_R')) position = 'bottomRight';
        }

        tempSubtitle = {
          id: `smi_${subtitles.length}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          text: text,
          startTime: startMs / 1000,
          endTime: startMs / 1000 + 3,
          position,
        };
      }
    }
    
    // 마지막 자막 처리
    if (tempSubtitle) {
      subtitles.push(tempSubtitle);
    }
    
    return subtitles.length > 0 ? subtitles : null;
  } catch (error) {
    console.error('SMI 파싱 실패:', error);
    return null;
  }
}
