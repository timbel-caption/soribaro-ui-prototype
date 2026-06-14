import { encodeToEuckr } from 'euckr';

/**
 * EUC-KR 테이블에 없는 문자는 '?' (0x3F)로 치환하여 바이트 배열 생성
 * @param {string} content
 * @returns {{ bytes: Uint8Array, unmappable: string[] }}
 */
function encodeToEuckrLossy(content) {
  const bytes = [];
  const unmappable = [];
  for (const ch of content) {
    try {
      const chBytes = encodeToEuckr(ch);
      for (const b of chBytes) bytes.push(b);
    } catch {
      bytes.push(0x3F); // '?'
      unmappable.push(ch);
    }
  }
  return { bytes: new Uint8Array(bytes), unmappable };
}

/**
 * 문자열의 모든 LF(\n)을 CRLF(\r\n)로 정규화. 이미 CRLF 인 경우는 중복 변환되지 않는다.
 * Windows 텍스트 파일 관례를 따르기 위해 ANSI 추출 시 사용.
 */
function toCrlf(content) {
  return content.replace(/\r?\n/g, '\r\n');
}

/**
 * 문자열을 지정된 인코딩으로 변환하여 Blob을 생성한다.
 * ANSI(EUC-KR) 인코딩일 때는 Windows 관례에 맞춰 줄바꿈을 CRLF로 정규화한다.
 *
 * @param {string} content - 변환할 문자열
 * @param {string} mimeType - MIME 타입
 * @param {'utf-8' | 'utf-8-bom' | 'ansi'} encoding - 인코딩
 * @param {(info: { unmappable: string[], uniqueChars: string[], count: number }) => void} [onLoss]
 *   ANSI 인코딩 시 변환 불가 문자를 '?'로 치환했을 때 호출되는 콜백
 * @returns {Blob}
 */
export function createEncodedBlob(content, mimeType, encoding = 'utf-8', onLoss) {
  if (encoding === 'ansi') {
    const normalized = toCrlf(content);
    const { bytes, unmappable } = encodeToEuckrLossy(normalized);
    if (unmappable.length > 0) {
      const uniqueChars = [...new Set(unmappable)];
      console.warn(`[encodingUtils] ANSI 변환 불가 문자 ${unmappable.length}개를 '?'로 치환: ${uniqueChars.join('')}`);
      onLoss?.({ unmappable, uniqueChars, count: unmappable.length });
    }
    return new Blob([bytes], { type: `${mimeType};charset=euc-kr` });
  }
  const encoder = new TextEncoder();
  const encoded = encoder.encode(content);
  if (encoding === 'utf-8-bom') {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    return new Blob([bom, encoded], { type: `${mimeType};charset=utf-8` });
  }
  return new Blob([encoded], { type: `${mimeType};charset=utf-8` });
}
