// SoriBaro 통합 자막 JSON 포맷 (worktool envelope).
//
// 프로젝트 내 모든 JSON 내보내기/가져오기는 이 모듈을 경유한다.
// 포맷 명세는 docs/interface/subtitle-json-format.md 참고.

export const SUBTITLE_JSON_VERSION = "1.4";

// UUID v4 생성기 (subtitleStore 와 동일 알고리즘)
const generateUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// 권한(역할)별 자막 항목의 텍스트 필드 매핑.
//   START: text(편집) → sourceText
//   MID:   text(편집) → middleText, sourceText 유지
//   FINAL: 모든 필드(sourceText, middleText, text) 유지
// null 또는 그 외 값이면 원본 그대로 반환.
export function mapSubtitlesByPermission(subtitles, permission) {
  if (!Array.isArray(subtitles)) return [];
  return subtitles.map((sub) => {
    const filtered = { ...sub };
    if (permission === "START") {
      filtered.sourceText = filtered.text || "";
      delete filtered.middleText;
      delete filtered.text;
    } else if (permission === "MID") {
      filtered.middleText = filtered.text || "";
      delete filtered.text;
    }
    if (filtered.speakerId === 0) {
      filtered.speakerId = null;
    }
    if (!filtered.id) {
      filtered.id = generateUUID();
    }
    return filtered;
  });
}

// 통합 envelope JSON 직렬화.
// 호출자는 자신이 가진 메타데이터만 전달하면 된다 (나머지는 기본값 사용).
export function serializeSubtitleJson({
  subtitles = [],
  permission = null,
  frameRate = 30,
  languages = null,
  speakers = [],
} = {}) {
  return JSON.stringify(
    {
      version: SUBTITLE_JSON_VERSION,
      permission,
      frameRate,
      languages,
      speakers,
      subtitles,
    },
    null,
    2,
  );
}

// 통합 envelope JSON 파싱.
// 레거시 배열 포맷([...])도 수용하며, 이 경우 subtitles 외 메타데이터는 기본값(null)으로 반환.
// 반환: { subtitles, permission, frameRate, languages, speakers, version, isLegacyArray }
// 파싱 실패 시 null 반환.
export function parseSubtitleJson(jsonString) {
  let raw;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    return null;
  }

  if (Array.isArray(raw)) {
    return {
      subtitles: raw,
      permission: null,
      frameRate: null,
      languages: null,
      speakers: null,
      version: null,
      isLegacyArray: true,
    };
  }

  if (raw && typeof raw === "object") {
    return {
      subtitles: Array.isArray(raw.subtitles) ? raw.subtitles : [],
      permission: raw.permission ?? null,
      frameRate: raw.frameRate ?? null,
      languages: raw.languages ?? null,
      speakers: Array.isArray(raw.speakers) ? raw.speakers : null,
      version: raw.version ?? null,
      isLegacyArray: false,
    };
  }

  return null;
}
