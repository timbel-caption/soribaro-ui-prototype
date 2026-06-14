/**
 * Web Worker 기반 장면 전환 감지
 * 메인 스레드를 블로킹하지 않고 멀티코어 CPU를 활용합니다.
 */

import SceneWorker from '../workers/sceneDetector.worker.js?worker';

/**
 * Worker를 사용한 장면 전환 감지 (취소 가능)
 * @param {HTMLVideoElement} video - 비디오 엘리먼트
 * @param {Object} options - 옵션
 * @returns {{ promise: Promise<number[]>, abort: Function }}
 */
export const detectSceneChangesWithWorker = (video, options = {}) => {
  const {
    threshold = 30,
    sampleInterval = 0.25,
    onProgress = () => {},
    analyzeWidth = 160,
    analyzeHeight = 90,
  } = options;

  let worker = null;
  let isAborted = false;

  const abort = () => {
    isAborted = true;
    if (worker) {
      worker.postMessage({ type: 'terminate' });
      worker.terminate();
      worker = null;
    }
  };

  const promise = new Promise(async (resolve, reject) => {
    try {
      // Worker 생성
      worker = new SceneWorker();
      
      const duration = video.duration;
      const sceneChanges = [];
      let currentTime = 0;
      let prevImageDataArray = null;

      // 원래 상태 저장
      const originalTime = video.currentTime;
      const wasPlaying = !video.paused;
      if (wasPlaying) video.pause();

      // Worker 초기화
      worker.postMessage({
        type: 'init',
        data: { width: analyzeWidth, height: analyzeHeight }
      });

      // 임시 Canvas (ImageBitmap 생성용)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = analyzeWidth;
      tempCanvas.height = analyzeHeight;
      const tempCtx = tempCanvas.getContext('2d');

      // Worker 메시지 핸들러
      worker.onmessage = async (e) => {
        if (isAborted) return;

        const { type, data } = e.data;

        if (type === 'ready') {
          // Worker 준비 완료, 첫 프레임 처리 시작
          processNextFrame();
        } else if (type === 'frameResult') {
          if (data.isSceneChange) {
            sceneChanges.push(data.currentTime);
          }
          prevImageDataArray = data.imageDataArray;

          currentTime += sampleInterval;
          const progress = Math.min(100, (currentTime / duration) * 100);
          onProgress(progress);

          if (currentTime >= duration) {
            // 완료
            video.currentTime = originalTime;
            if (wasPlaying) video.play();
            worker.terminate();
            worker = null;
            resolve(sceneChanges);
          } else {
            processNextFrame();
          }
        } else if (type === 'error') {
          reject(new Error(data.error));
        }
      };

      const processNextFrame = async () => {
        if (isAborted) return;

        // 비디오 seek
        video.currentTime = currentTime;
      };

      const handleSeeked = async () => {
        if (isAborted) return;

        try {
          // 현재 프레임을 ImageBitmap으로 변환
          tempCtx.drawImage(video, 0, 0, analyzeWidth, analyzeHeight);
          const imageBitmap = await createImageBitmap(tempCanvas);

          // Worker에 전송 (Transferable Object로 효율적 전송)
          worker.postMessage({
            type: 'analyzeFrame',
            data: {
              imageBitmap,
              currentTime,
              threshold,
              prevImageDataArray
            }
          }, [imageBitmap]); // Transferable
        } catch (err) {
          console.error('프레임 처리 오류:', err);
          currentTime += sampleInterval;
          processNextFrame();
        }
      };

      video.addEventListener('seeked', handleSeeked);

      // 취소 시 정리
      const cleanup = () => {
        video.removeEventListener('seeked', handleSeeked);
        video.currentTime = originalTime;
        if (wasPlaying) video.play();
      };

      // abort 시 정리
      const originalAbort = abort;
      // abort 함수를 정리 작업 포함하도록 재정의하지 않음 (클로저로 처리)

    } catch (error) {
      reject(error);
    }
  });

  return { promise, abort };
};

/**
 * Web Worker 지원 여부 확인
 */
export const isWorkerSupported = () => {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
};

