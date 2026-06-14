/**
 * 장면 전환 감지 Web Worker
 * 메인 스레드를 블로킹하지 않고 백그라운드에서 프레임 분석 수행
 */

/**
 * 두 이미지 데이터 간의 차이를 계산
 */
const calculateFrameDifference = (data1, data2) => {
  let diff = 0;
  const sampleRate = 4; // 4픽셀마다 1개 샘플링
  let sampledPixels = 0;

  for (let i = 0; i < data1.length; i += 4 * sampleRate) {
    const rDiff = Math.abs(data1[i] - data2[i]);
    const gDiff = Math.abs(data1[i + 1] - data2[i + 1]);
    const bDiff = Math.abs(data1[i + 2] - data2[i + 2]);
    
    diff += (rDiff + gDiff + bDiff) / 3;
    sampledPixels++;
  }

  return diff / sampledPixels;
};

// OffscreenCanvas를 사용하여 GPU 가속 활용
let offscreenCanvas = null;
let ctx = null;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init': {
      // OffscreenCanvas 초기화 (GPU 가속)
      offscreenCanvas = new OffscreenCanvas(data.width || 160, data.height || 90);
      ctx = offscreenCanvas.getContext('2d', { 
        willReadFrequently: true,
        alpha: false // 알파 채널 불필요 시 성능 향상
      });
      self.postMessage({ type: 'ready' });
      break;
    }

    case 'analyzeFrame': {
      const { imageBitmap, currentTime, threshold, prevImageDataArray } = data;
      
      if (!ctx) {
        self.postMessage({ type: 'error', error: 'Canvas not initialized' });
        return;
      }

      // 프레임을 OffscreenCanvas에 그리기
      ctx.drawImage(imageBitmap, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const imageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const currentDataArray = new Uint8ClampedArray(imageData.data);

      let isSceneChange = false;
      let diff = 0;

      if (prevImageDataArray) {
        diff = calculateFrameDifference(prevImageDataArray, currentDataArray);
        isSceneChange = diff > threshold;
      }

      // ImageBitmap 해제 (메모리 정리)
      imageBitmap.close();

      self.postMessage({
        type: 'frameResult',
        data: {
          currentTime,
          isSceneChange,
          diff,
          imageDataArray: currentDataArray // 다음 비교를 위해 반환
        }
      });
      break;
    }

    case 'terminate': {
      offscreenCanvas = null;
      ctx = null;
      self.close();
      break;
    }
  }
};

