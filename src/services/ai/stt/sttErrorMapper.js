import i18next from 'i18next';

/**
 * STT 오류 메시지를 사용자 친화적 문구로 매핑한다.
 * - 개발환경에서는 원본 메시지를 그대로 반환해 디버깅을 돕는다.
 * - 운영환경에서는 엔진명/스택 등이 노출되지 않도록 i18n 메시지로 치환한다.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function mapSTTErrorMessage(error) {
  const rawMessage =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message ?? '')
      : String(error ?? '');

  if (import.meta.env.DEV) {
    return rawMessage || i18next.t('sttConfig.errors.serverError', { ns: 'worktool' });
  }

  const lower = rawMessage.toLowerCase();

  // 1) 지원하지 않는 파일 형식
  if (rawMessage.includes('지원하지 않는 파일 형식')) {
    return i18next.t('sttConfig.errors.unsupportedFormat', { ns: 'worktool' });
  }

  // 2) 인증 실패 (API Key 오류 / 401 등)
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('api key') ||
    rawMessage.includes('API Key') ||
    rawMessage.includes('인증')
  ) {
    return i18next.t('sttConfig.errors.authFailed', { ns: 'worktool' });
  }

  // 3) 파일 다운로드 실패
  if (rawMessage.includes('파일 다운로드 실패')) {
    return i18next.t('sttConfig.errors.fileDownloadFailed', { ns: 'worktool' });
  }

  // 4) 네트워크 오류
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error')
  ) {
    return i18next.t('sttConfig.errors.networkError', { ns: 'worktool' });
  }

  // 그 외: 공통 서버 오류 메시지
  return i18next.t('sttConfig.errors.serverError', { ns: 'worktool' });
}
