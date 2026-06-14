/**
 * 초를 HH:MM:SS.mmm 형식으로 변환
 */
export const secondsToTimeCode = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return "00:00:00.000";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

/**
 * HH:MM:SS.mmm 형식을 초로 변환
 * 유효하지 않은 입력이면 NaN 반환
 */
export const timeCodeToSeconds = (timeCode) => {
  if (!timeCode || typeof timeCode !== "string") return NaN;

  const regex = /^(\d{1,2}):(\d{2}):(\d{2})\.?(\d{0,3})?$/;
  const match = timeCode.match(regex);

  if (!match) return NaN;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const ms = match[4] ? parseInt(match[4].padEnd(3, "0"), 10) : 0;

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
};

/**
 * 초를 프레임 번호로 변환
 */
export const secondsToFrame = (seconds, frameRate = 30) => {
  return Math.floor(seconds * frameRate);
};

/**
 * 프레임 번호를 초로 변환
 */
export const frameToSeconds = (frame, frameRate = 30) => {
  return frame / frameRate;
};

/**
 * 프레임을 타임코드로 변환
 */
export const frameToTimeCode = (frame, frameRate = 30) => {
  return secondsToTimeCode(frameToSeconds(frame, frameRate));
};

/**
 * 두 시간 사이의 차이를 포맷팅
 */
export const formatDuration = (startTime, endTime) => {
  const duration = endTime - startTime;
  if (duration < 0) return "0.000s";
  return `${duration.toFixed(3)}s`;
};

/**
 * 파일 크기를 읽기 쉬운 형식으로 변환
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
