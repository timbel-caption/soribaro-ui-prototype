export const WORK_CATEGORIES = ["vod", "meeting", "record", "translation"];

export const isValidWorkCategory = (value) => WORK_CATEGORIES.includes(value);

export const resolveWorkCategoryFromPathname = (pathname) => {
  if (!pathname) return null;

  if (pathname.includes("/soribaro/translation/")) return "translation";
  if (pathname.includes("/soribaro/recording/")) return "record";
  if (pathname.includes("/soribaro/enterprise/vod/")) return "vod";
  if (pathname.includes("/soribaro/enterprise/meeting/")) return "meeting";

  return null;
};

export const buildWorktoolPath = ({
  projectFileId,
  fileNo,
  servCd,
  role,
  isSplit,
  startSec,
  endSec,
  playTm,
  readonly = false,
  popup = true,
  workCategory,
}) => {
  const params = new URLSearchParams();
  params.set("role", role);
  params.set("isSplit", String(!!isSplit));

  if (isSplit) {
    if (startSec != null) params.set("start_sec", String(startSec));
    if (endSec != null) params.set("end_sec", String(endSec));
  }

  if (playTm) params.set("play_tm", String(playTm));
  if (readonly) params.set("readonly", "true");
  if (popup) params.set("popup", "true");
  if (isValidWorkCategory(workCategory)) {
    params.set("workCategory", workCategory);
  }

  return `/worktool/${projectFileId}/${fileNo}/${servCd}?${params.toString()}`;
};
