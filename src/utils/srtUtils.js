/**
 * SRT (SubRip) 유틸리티
 * 표준 SRT 자막 포맷 지원
 */

/**
 * 초를 SRT 타임코드로 변환 (HH:MM:SS,mmm)
 * @param {number} totalSeconds - 초
 * @returns {string} SRT 타임코드
 */
function secondsToSrtTimeCode(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

/**
 * SRT 타임코드를 초로 변환
 * @param {string} timeCode - SRT 타임코드 (HH:MM:SS,mmm)
 * @returns {number} 초
 */
function srtTimeCodeToSeconds(timeCode) {
  const parts = timeCode.split(":");
  if (parts.length < 3) return 0;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  // 초와 밀리초 분리 (쉼표 또는 점으로 구분)
  const secParts = parts[2].split(/[,\.]/);
  const seconds = parseInt(secParts[0], 10) || 0;
  const milliseconds =
    parseInt((secParts[1] || "0").padEnd(3, "0").substring(0, 3), 10) || 0;

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
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
 * 자막을 SRT 형식으로 내보내기
 * @param {Array} subtitles - 자막 배열
 * @returns {string} SRT 문자열
 */
export function exportToSRT(subtitles, { skipEmpty = false } = {}) {
  const filtered = skipEmpty
    ? subtitles.filter((s) => (s.text || "").trim() !== "")
    : subtitles;

  const srtItems = filtered.map((subtitle, index) => {
    const startTime = secondsToSrtTimeCode(subtitle.startTime);
    const endTime = secondsToSrtTimeCode(subtitle.endTime);
    const text = subtitle.text || "";
    const an = POSITION_TO_AN[subtitle.position] ?? 2;
    const posTag = an !== 2 ? `{\\an${an}}` : "";

    return `${index + 1}\n${startTime} --> ${endTime}\n${posTag}${text}`;
  });

  return srtItems.join("\n\n") + "\n";
}

/**
 * SRT 파일 파싱
 * @param {string} srtString - SRT 문자열
 * @returns {Array|null} 자막 배열 또는 null
 */
export function parseSRT(srtString) {
  const subtitles = [];

  try {
    // 줄바꿈 정규화
    const normalizedString = srtString
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // 자막 블록 분리 (빈 줄로 구분)
    const blocks = normalizedString.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 2) continue;

      // 첫 번째 줄: 순번 (숫자만)
      const indexLine = lines[0].trim();
      if (!/^\d+$/.test(indexLine)) continue;

      // 두 번째 줄: 타임코드
      const timeCodeLine = lines[1].trim();
      const timeCodeMatch = timeCodeLine.match(
        /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/,
      );
      if (!timeCodeMatch) continue;

      const startTime = srtTimeCodeToSeconds(timeCodeMatch[1]);
      const endTime = srtTimeCodeToSeconds(timeCodeMatch[2]);

      // 나머지 줄: 텍스트 ({\anN} 위치 태그 파싱)
      let text = lines.slice(2).join("\n").trim();

      let position = "bottomCenter";
      const anMatch = text.match(/^\{\\an(\d)\}/);
      if (anMatch) {
        const anNum = parseInt(anMatch[1], 10);
        if (AN_TO_POSITION[anNum]) {
          position = AN_TO_POSITION[anNum];
        }
        text = text.slice(anMatch[0].length);
      }

      subtitles.push({
        id: `srt_${subtitles.length}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: text,
        startTime: startTime,
        endTime: endTime,
        position,
      });
    }

    return subtitles.length > 0 ? subtitles : null;
  } catch (error) {
    console.error("SRT 파싱 실패:", error);
    return null;
  }
}
