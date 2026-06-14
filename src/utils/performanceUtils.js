/**
 * 성능 최적화 유틸리티 함수들
 */

/**
 * 함수 호출을 지정된 시간 간격으로 제한 (trailing edge 실행)
 * @param {Function} func - 쓰로틀링할 함수
 * @param {number} wait - 대기 시간 (ms)
 * @returns {Function} 쓰로틀된 함수
 */
export function throttle(func, wait) {
  let lastTime = 0;
  let timeoutId = null;
  let lastArgs = null;

  const throttled = function (...args) {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    lastArgs = args;

    if (remaining <= 0) {
      // 충분한 시간이 지났으면 즉시 실행
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastTime = now;
      func.apply(this, args);
    } else if (!timeoutId) {
      // 대기 중이 아니면 타이머 설정 (trailing edge)
      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        timeoutId = null;
        func.apply(this, lastArgs);
      }, remaining);
    }
  };

  throttled.cancel = function () {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

/**
 * RAF 기반 쓰로틀 - 프레임 단위로 제한
 * @param {Function} func - 쓰로틀링할 함수
 * @returns {Function} 쓰로틀된 함수
 */
export function throttleRAF(func) {
  let rafId = null;
  let lastArgs = null;

  const throttled = function (...args) {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        func.apply(this, lastArgs);
      });
    }
  };

  throttled.cancel = function () {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

export default {
  throttle,
  throttleRAF,
};
