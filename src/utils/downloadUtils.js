/**
 * 파일 다운로드 트리거 유틸.
 *
 * cross-origin presigned URL(MinIO/S3 등)을 다건 다운로드할 때
 * window.open / <a>.click 방식은 새 탭이 열리거나 현재 탭이
 * URL 로 이동(Content-Disposition 미설정 시)하는 부작용이 있다.
 *
 * 숨겨진 iframe 에 src 를 지정하면 브라우저는 해당 URL 에 요청을 보내고
 * 응답에 Content-Disposition: attachment 가 있으면 다운로드로 처리한다.
 * 새 탭이 열리지 않고 현재 탭도 이동하지 않아 사용자 포커스가 유지된다.
 *
 * 주의: 서버 presigned URL 에 Content-Disposition 이 없으면 인라인으로
 * 렌더링되어 다운로드되지 않을 수 있으므로, 서버(MinIO) 측 response-
 * content-disposition 파라미터 포함 여부를 반드시 확인할 것.
 */

const IFRAME_CLEANUP_MS = 60_000;

/**
 * 숨겨진 iframe 을 이용해 URL 다운로드를 트리거한다.
 * 새 탭을 열지 않고, 현재 탭 포커스를 유지한다.
 *
 * @param {string} url - 다운로드 대상 URL (presigned 등)
 */
export function triggerDownloadViaIframe(url) {
  if (!url) return;
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = url;
  document.body.appendChild(iframe);
  // 다운로드가 시작되면 iframe 은 더 이상 필요 없으므로 일정 시간 후 제거.
  // 너무 짧게 잡으면 네트워크가 느릴 때 요청이 중단될 수 있으니 여유를 둔다.
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, IFRAME_CLEANUP_MS);
}

/**
 * 여러 URL 을 순차적으로 다운로드 트리거한다.
 * 각 호출 사이에 약간의 딜레이를 두어 브라우저가 동시 다운로드 스트림을
 * 안정적으로 처리하도록 한다.
 *
 * @param {string[]} urls - 다운로드 URL 목록
 * @param {number} [delayMs=250] - 각 호출 사이의 간격(ms)
 * @returns {Promise<void>}
 */
export async function triggerBatchDownloadViaIframe(urls, delayMs = 250) {
  for (const url of urls) {
    triggerDownloadViaIframe(url);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
