/**
 * 앱 base 경로(예: GitHub Pages 의 `/soribaro-ui-prototype/`)를 고려한 절대 경로 URL 생성.
 *
 * `window.open` 으로 새 창/팝업을 열 때 사용한다. React Router 의 basename 은
 * 라우터 내부 navigate/Link 에만 적용되므로, window.open 에 `/worktool...` 같은
 * 루트 기준 경로를 그대로 넘기면 하위 경로 배포(GitHub Pages)에서 도메인 루트로
 * 떨어져 404 가 난다. 이 헬퍼로 base 를 직접 붙여준다. (개발 환경에선 base 가 "/" 라 무영향)
 */
export const toAppUrl = (path) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const rel = String(path).startsWith("/") ? path : `/${path}`;
  return `${base}${rel}`;
};

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
