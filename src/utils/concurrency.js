/**
 * 동시성 제한 실행 유틸리티
 * @param {Array<Function>} tasks - 비동기 작업 배열 (각각 () => Promise 형태)
 * @param {number} limit - 동시 실행 개수
 * @param {AbortSignal} [signal] - 취소 시그널 (abort 시 새 task 실행 중단)
 */
export async function runWithConcurrency(tasks, limit, signal) {
  if (!tasks || tasks.length === 0) return;

  const effectiveLimit = Math.max(1, Math.min(limit, tasks.length));
  let cursor = 0;

  const workers = Array.from({ length: effectiveLimit }, async () => {
    while (cursor < tasks.length) {
      if (signal?.aborted) return;
      const currentIndex = cursor;
      cursor += 1;
      await tasks[currentIndex]();
    }
  });

  await Promise.all(workers);
}
