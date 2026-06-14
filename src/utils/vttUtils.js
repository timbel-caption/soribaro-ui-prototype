/**
 * WebVTT 유틸리티
 * 표준 WebVTT 자막 포맷 지원
 */

/**
 * 초를 VTT 타임코드로 변환 (HH:MM:SS.mmm)
 * @param {number} totalSeconds - 초
 * @returns {string} VTT 타임코드
 */
function secondsToVttTimeCode(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

/**
 * VTT 타임코드를 초로 변환
 * @param {string} timeCode - VTT 타임코드 (HH:MM:SS.mmm 또는 MM:SS.mmm)
 * @returns {number} 초
 */
function vttTimeCodeToSeconds(timeCode) {
  const parts = timeCode.split(":");
  if (parts.length < 2) return 0;

  let hours = 0;
  let minutes = 0;
  let secPart;

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
    secPart = parts[2];
  } else {
    minutes = parseInt(parts[0], 10) || 0;
    secPart = parts[1];
  }

  const secParts = secPart.split(".");
  const seconds = parseInt(secParts[0], 10) || 0;
  const milliseconds =
    parseInt((secParts[1] || "0").padEnd(3, "0").substring(0, 3), 10) || 0;

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

const POSITION_TO_VTT_CUE = {
  topLeft:      "line:0 position:20% align:start",
  topCenter:    "line:0 align:center",
  topRight:     "line:0 position:80% align:end",
  middleLeft:   "line:50% position:20% align:start",
  center:       "line:50% align:center",
  middleRight:  "line:50% position:80% align:end",
  bottomLeft:   "align:start",
  bottomCenter: "",
  bottomRight:  "align:end",
};

/**
 * 자막을 VTT 형식으로 내보내기
 * @param {Array} subtitles - 자막 배열
 * @returns {string} VTT 문자열
 */
export function exportToVTT(subtitles) {
  const vttItems = subtitles.map((subtitle) => {
    const startTime = secondsToVttTimeCode(subtitle.startTime);
    const endTime = secondsToVttTimeCode(subtitle.endTime);
    const text = subtitle.text || "";
    const cue = POSITION_TO_VTT_CUE[subtitle.position] || "";
    const cueSuffix = cue ? ` ${cue}` : "";

    return `${startTime} --> ${endTime}${cueSuffix}\n${text}`;
  });

  return "WEBVTT\n\n" + vttItems.join("\n\n") + "\n";
}

/**
 * VTT 파일 파싱
 * @param {string} vttString - VTT 문자열
 * @returns {Array|null} 자막 배열 또는 null
 */
export function parseVTT(vttString) {
  const subtitles = [];

  try {
    const normalizedString = vttString
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // WEBVTT 헤더 제거
    const headerRemoved = normalizedString.replace(/^WEBVTT[^\n]*\n/, "");

    const blocks = headerRemoved.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 1 || !lines[0]) continue;

      // 타임코드 라인 찾기 (cue identifier 가 있을 수도, 없을 수도 있음)
      // WebVTT 사양상 cue identifier 는 임의 문자열이므로 '-->' 포함 여부로 판단
      let timeLineIndex = 0;
      if (!lines[0].includes("-->")) {
        timeLineIndex = 1;
      }
      if (timeLineIndex >= lines.length) continue;

      const timeCodeLine = lines[timeLineIndex].trim();
      const timeCodeMatch = timeCodeLine.match(
        /(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})/,
      );
      if (!timeCodeMatch) continue;

      const startTime = vttTimeCodeToSeconds(timeCodeMatch[1]);
      const endTime = vttTimeCodeToSeconds(timeCodeMatch[2]);

      const text = lines.slice(timeLineIndex + 1).join("\n").trim();

      subtitles.push({
        id: `vtt_${subtitles.length}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: text,
        startTime: startTime,
        endTime: endTime,
        position: "bottomCenter",
      });
    }

    return subtitles.length > 0 ? subtitles : null;
  } catch (error) {
    console.error("VTT 파싱 실패:", error);
    return null;
  }
}
