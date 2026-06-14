/**
 * 비디오 장면 전환 감지 유틸리티
 * Canvas API를 사용하여 프레임 간 차이를 분석합니다.
 */

/**
 * 두 이미지 데이터 간의 차이를 계산
 */
const calculateFrameDifference = (imageData1, imageData2) => {
  const data1 = imageData1.data;
  const data2 = imageData2.data;
  let diff = 0;
  const pixelCount = data1.length / 4;

  // 샘플링하여 성능 향상 (모든 픽셀 대신 일부만 비교)
  const sampleRate = 4; // 4픽셀마다 1개 샘플링
  let sampledPixels = 0;

  for (let i = 0; i < data1.length; i += 4 * sampleRate) {
    // RGB 값의 차이 계산 (알파 채널 제외)
    const rDiff = Math.abs(data1[i] - data2[i]);
    const gDiff = Math.abs(data1[i + 1] - data2[i + 1]);
    const bDiff = Math.abs(data1[i + 2] - data2[i + 2]);
    
    diff += (rDiff + gDiff + bDiff) / 3;
    sampledPixels++;
  }

  // 정규화된 차이값 반환 (0-255 범위)
  return diff / sampledPixels;
};

/**
 * 비디오에서 장면 전환 감지
 * @param {HTMLVideoElement} video - 비디오 엘리먼트
 * @param {Object} options - 옵션
 * @param {number} options.threshold - 장면 전환 임계값 (기본: 30)
 * @param {number} options.sampleInterval - 샘플링 간격(초) (기본: 0.5)
 * @param {Function} options.onProgress - 진행률 콜백
 * @returns {Promise<number[]>} - 장면 전환 시간 배열
 */
export const detectSceneChanges = async (video, options = {}) => {
  const {
    threshold = 30,
    sampleInterval = 0.5,
    onProgress = () => {},
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // 성능을 위해 작은 해상도 사용
      const analyzeWidth = 160;
      const analyzeHeight = 90;
      canvas.width = analyzeWidth;
      canvas.height = analyzeHeight;

      const duration = video.duration;
      const sceneChanges = [];
      let prevImageData = null;
      let currentTime = 0;
      
      // 원래 상태 저장
      const originalTime = video.currentTime;
      const wasPlaying = !video.paused;
      if (wasPlaying) video.pause();

      const processFrame = () => {
        if (currentTime >= duration) {
          // 완료 - 원래 상태 복원
          video.currentTime = originalTime;
          if (wasPlaying) video.play();
          onProgress(100);
          resolve(sceneChanges);
          return;
        }

        video.currentTime = currentTime;
      };

      const handleSeeked = () => {
        // 현재 프레임을 캔버스에 그리기
        ctx.drawImage(video, 0, 0, analyzeWidth, analyzeHeight);
        const currentImageData = ctx.getImageData(0, 0, analyzeWidth, analyzeHeight);

        if (prevImageData) {
          const diff = calculateFrameDifference(prevImageData, currentImageData);
          
          if (diff > threshold) {
            sceneChanges.push(currentTime);
          }
        }

        prevImageData = currentImageData;
        currentTime += sampleInterval;
        
        // 진행률 업데이트
        const progress = Math.min(100, (currentTime / duration) * 100);
        onProgress(progress);

        // 다음 프레임 처리
        processFrame();
      };

      video.addEventListener('seeked', handleSeeked);
      
      // 시작
      processFrame();

      // 타임아웃 설정 (최대 5분)
      setTimeout(() => {
        video.removeEventListener('seeked', handleSeeked);
        reject(new Error('장면 전환 감지 시간 초과'));
      }, 300000);

    } catch (error) {
      reject(error);
    }
  });
};

/**
 * 장면 전환 감지 취소를 위한 AbortController 지원 버전
 */
export const detectSceneChangesWithAbort = (video, options = {}) => {
  const abortController = new AbortController();
  
  const promise = new Promise((resolve, reject) => {
    const {
      threshold = 30,
      sampleInterval = 0.5,
      onProgress = () => {},
    } = options;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const analyzeWidth = 160;
    const analyzeHeight = 90;
    canvas.width = analyzeWidth;
    canvas.height = analyzeHeight;

    const duration = video.duration;
    const sceneChanges = [];
    let prevImageData = null;
    let currentTime = 0;
    
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();

    let isAborted = false;

    abortController.signal.addEventListener('abort', () => {
      isAborted = true;
      video.currentTime = originalTime;
      if (wasPlaying) video.play();
      reject(new Error('장면 전환 감지가 취소되었습니다.'));
    });

    const handleSeeked = () => {
      if (isAborted) return;

      ctx.drawImage(video, 0, 0, analyzeWidth, analyzeHeight);
      const currentImageData = ctx.getImageData(0, 0, analyzeWidth, analyzeHeight);

      if (prevImageData) {
        const diff = calculateFrameDifference(prevImageData, currentImageData);
        if (diff > threshold) {
          sceneChanges.push(currentTime);
        }
      }

      prevImageData = currentImageData;
      currentTime += sampleInterval;
      
      const progress = Math.min(100, (currentTime / duration) * 100);
      onProgress(progress);

      if (currentTime >= duration) {
        video.removeEventListener('seeked', handleSeeked);
        video.currentTime = originalTime;
        if (wasPlaying) video.play();
        onProgress(100);
        resolve(sceneChanges);
      } else {
        video.currentTime = currentTime;
      }
    };

    video.addEventListener('seeked', handleSeeked);
    video.currentTime = currentTime;
  });

  return { promise, abort: () => abortController.abort() };
};

