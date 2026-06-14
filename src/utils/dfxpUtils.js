/**
 * DFXP (Distribution Format Exchange Profile) 유틸리티
 * Netflix Timed Text 형식 지원
 */

// 타임코드를 초로 변환 (HH:MM:SS.mmm 또는 HH:MM:SS:FF)
function timeCodeToSeconds(timeCode) {
  const parts = timeCode.split(":");
  if (parts.length < 3) return 0;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  // 마지막 부분이 SS.mmm 형태인지 확인
  let seconds = 0;
  let milliseconds = 0;

  if (parts[2].includes(".")) {
    const secParts = parts[2].split(".");
    seconds = parseInt(secParts[0], 10) || 0;
    milliseconds =
      parseInt(secParts[1].padEnd(3, "0").substring(0, 3), 10) || 0;
  } else {
    seconds = parseInt(parts[2], 10) || 0;
    // 프레임 (선택적)
    if (parts.length > 3) {
      const frames = parseInt(parts[3], 10) || 0;
      milliseconds = Math.round((frames / 30) * 1000); // 30fps 가정
    }
  }

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

// 초를 타임코드로 변환
function secondsToTimeCode(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

// region 이름을 position으로 매핑
function regionToPosition(region) {
  const mapping = {
    topLeft: "topLeft",
    topCenter: "topCenter",
    topRight: "topRight",
    middleLeft: "middleLeft",
    center: "center",
    middleRight: "middleRight",
    bottomLeft: "bottomLeft",
    bottomCenter: "bottomCenter",
    bottomRight: "bottomRight",
  };
  return mapping[region] || "bottomCenter";
}

// position을 region 이름으로 매핑
function positionToRegion(position) {
  return position || "bottomCenter";
}

/**
 * DFXP 파일 파싱
 * @param {string} xmlString - DFXP XML 문자열
 * @returns {Array} 자막 배열
 */
export function parseDFXP(xmlString) {
  const subtitles = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");

    // 파싱 에러 확인
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      console.error("DFXP 파싱 에러:", parseError.textContent);
      return null;
    }

    // 모든 <p> 요소 가져오기 (네임스페이스 대응을 위해 getElementsByTagName 사용)
    const paragraphs = doc.getElementsByTagName("p");

    for (let index = 0; index < paragraphs.length; index++) {
      const p = paragraphs[index];

      // begin/end 속성 가져오기
      let begin = p.getAttribute("begin");
      let end = p.getAttribute("end");

      // 속성이 없으면 attributes 컬렉션에서 직접 찾기 (네임스페이스 대응)
      if (!begin || !end) {
        for (let i = 0; i < p.attributes.length; i++) {
          const attr = p.attributes[i];
          if (attr.name === "begin" || attr.localName === "begin") {
            begin = attr.value;
          }
          if (attr.name === "end" || attr.localName === "end") {
            end = attr.value;
          }
        }
      }

      const region = p.getAttribute("region") || "bottomCenter";

      // begin 또는 end가 없으면 건너뛰기
      if (!begin || !end) continue;

      // 텍스트 추출 (<br/> 태그를 줄바꿈으로 변환)
      let text = "";
      const childNodes = p.childNodes;
      for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.nodeName.toLowerCase() === "br") {
          text += "\n";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          text += node.textContent;
        }
      }

      const startTime = timeCodeToSeconds(begin);
      const endTime = timeCodeToSeconds(end);

      subtitles.push({
        id: `dfxp_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: text.trim(),
        startTime: startTime,
        endTime: endTime,
        position: regionToPosition(region),
      });
    }
    return subtitles;
  } catch (error) {
    console.error("DFXP 파싱 실패:", error);
    return null;
  }
}

/**
 * 자막을 DFXP 형식으로 내보내기
 * @param {Array} subtitles - 자막 배열
 * @param {string} title - 파일 제목
 * @param {string} langCode - ISO 639-1 언어 코드 (ko, en, ja, zh, hi)
 * @returns {string} DFXP XML 문자열
 */
export function exportToDFXP(subtitles, title = "SoriBaro Subtitles", langCode = "ko") {
  // 사용된 region 수집
  const usedRegions = new Set(
    subtitles.map((s) => s.position || "bottomCenter"),
  );

  // region 정의 생성
  const regionDefs = [];

  const regionConfigs = {
    topLeft: { origin: "10% 10%", align: "before", textAlign: "start" },
    topCenter: { origin: "10% 10%", align: "before", textAlign: "center" },
    topRight: { origin: "10% 10%", align: "before", textAlign: "end" },
    middleLeft: { origin: "10% 30%", align: "center", textAlign: "start" },
    center: { origin: "10% 30%", align: "center", textAlign: "center" },
    middleRight: { origin: "10% 30%", align: "center", textAlign: "end" },
    bottomLeft: { origin: "10% 50%", align: "after", textAlign: "start" },
    bottomCenter: { origin: "10% 50%", align: "after", textAlign: "center" },
    bottomRight: { origin: "10% 50%", align: "after", textAlign: "end" },
  };

  usedRegions.forEach((region) => {
    const config = regionConfigs[region] || regionConfigs.bottomCenter;
    regionDefs.push(
      `      <region tts:extent="80% 40%" tts:origin="${config.origin}" tts:displayAlign="${config.align}" tts:textAlign="${config.textAlign}" xml:id="${region}" />`,
    );
  });

  // 자막 <p> 요소 생성
  const paragraphs = subtitles.map((subtitle, index) => {
    const begin = secondsToTimeCode(subtitle.startTime);
    const end = secondsToTimeCode(subtitle.endTime);
    const region = positionToRegion(subtitle.position);

    // 줄바꿈을 <br/> 태그로 변환하고 XML 이스케이프
    const text = escapeXml(subtitle.text).replace(/\n/g, "<br/>");

    return `      <p xml:id="p${index + 1}" begin="${begin}" end="${end}" region="${region}">${text}</p>`;
  });

  // DFXP XML 생성
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xml:lang="${langCode}">
  <head>
    <metadata>
      <ttm:title>${escapeXml(title)}</ttm:title>
    </metadata>
    <styling>
      <style tts:fontStyle="normal" tts:fontWeight="normal" xml:id="s1" tts:color="white" tts:fontFamily="Arial" tts:fontSize="100%"></style>
    </styling>
    <layout>
${regionDefs.join("\n")}
    </layout>
  </head>
  <body>
    <div style="s1" xml:id="d1">
${paragraphs.join("\n")}
    </div>
  </body>
</tt>`;

  return xml;
}

// XML 특수문자 이스케이프
function escapeXml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
