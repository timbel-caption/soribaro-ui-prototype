/**
 * 파형 데이터 캐시 유틸리티 (IndexedDB 기반)
 * 한 번 생성된 파형 데이터를 저장하여 재사용합니다.
 */

const DB_NAME = 'SoriBaro_Cache';
const DB_VERSION = 3;
const WAVEFORM_STORE = 'waveforms';
const SCENE_STORE = 'sceneChanges';
const HISTORY_STORE = 'editHistory';
const MAX_HISTORY_COUNT = 20;
// 편집 이력 prune 빈도. 매번 count + cursor scan 을 돌리면 메인 스레드 IDB I/O 가 누적되어
// 영상 재생 중 jitter 의 원인이 되므로 N 회 add 마다 한 번만 prune 한다.
const HISTORY_PRUNE_INTERVAL = 5;
let historyWritesSincePrune = 0;

/**
 * IndexedDB 열기
 */
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('IndexedDB를 열 수 없습니다.'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 파형 데이터 저장소
      if (!db.objectStoreNames.contains(WAVEFORM_STORE)) {
        const store = db.createObjectStore(WAVEFORM_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      
      // 장면 전환 감지 결과 저장소
      if (!db.objectStoreNames.contains(SCENE_STORE)) {
        const store = db.createObjectStore(SCENE_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      
      // 편집 이력 저장소
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

/**
 * 캐시된 파형 ArrayBuffer 데이터의 유효성 검증
 * WaveformData 바이너리 포맷: [version(4)] [flags(4)] [sample_rate(4)] [samples_per_pixel(4)] [length(4)] [data...]
 * @param {ArrayBuffer} buffer - 검증할 ArrayBuffer
 * @returns {boolean} - 유효 여부
 */
export const validateWaveformArrayBuffer = (buffer) => {
  try {
    if (!buffer || !(buffer instanceof ArrayBuffer)) return false;
    // 최소 헤더 크기: version(4) + flags(4) + sample_rate(4) + samples_per_pixel(4) + length(4) = 20 bytes
    // 최소 데이터 포함: 24 bytes 이상
    if (buffer.byteLength < 24) {
      console.warn(`파형 캐시 검증 실패: 데이터 크기 부족 (${buffer.byteLength} bytes)`);
      return false;
    }

    const view = new DataView(buffer);

    // version: 1 또는 2만 유효
    const version = view.getInt32(0, true);
    if (version !== 1 && version !== 2) {
      console.warn(`파형 캐시 검증 실패: 잘못된 버전 (${version})`);
      return false;
    }

    // sample_rate: 1 ~ 192000 범위
    const sampleRate = view.getInt32(8, true);
    if (sampleRate <= 0 || sampleRate > 192000) {
      console.warn(`파형 캐시 검증 실패: 잘못된 sample_rate (${sampleRate})`);
      return false;
    }

    // samples_per_pixel: 1 ~ 100000 범위
    const samplesPerPixel = view.getInt32(12, true);
    if (samplesPerPixel <= 0 || samplesPerPixel > 100000) {
      console.warn(`파형 캐시 검증 실패: 잘못된 samples_per_pixel (${samplesPerPixel})`);
      return false;
    }

    // length: 파형 데이터 포인트 개수 (0이면 빈 파형)
    const length = view.getUint32(16, true);
    if (length === 0) {
      console.warn('파형 캐시 검증 실패: 데이터 포인트 없음 (length=0)');
      return false;
    }

    return true;
  } catch (err) {
    console.warn('파형 캐시 검증 중 오류:', err);
    return false;
  }
};

/**
 * 파일에 대한 고유 캐시 키 생성
 * @param {string} fileName - 파일 이름
 * @param {number} fileSize - 파일 크기 (bytes)
 * @param {boolean} isServerFile - 서버 파일 여부
 * @returns {string} - 캐시 키
 */
export const generateCacheKey = (fileName, fileSize, isServerFile = false) => {
  if (!fileName) return null;
  
  // 서버 파일은 파일명만으로 캐시 키 생성 (파일 크기 정보 없음)
  if (isServerFile) {
    return `server_${fileName}`;
  }
  
  // 로컬 파일은 파일명 + 파일크기로 고유 키 생성
  if (!fileSize) return null;
  return `${fileName}_${fileSize}`;
};

/**
 * 캐시된 파형 데이터 조회
 * @param {string} cacheKey - 캐시 키
 * @returns {Promise<ArrayBuffer|null>} - 파형 데이터 또는 null
 */
export const getCachedWaveform = async (cacheKey) => {
  if (!cacheKey) return null;

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([WAVEFORM_STORE], 'readonly');
      const store = transaction.objectStore(WAVEFORM_STORE);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.waveformData) {
          // 캐시된 데이터의 유효성 검증
          if (!validateWaveformArrayBuffer(result.waveformData)) {
            console.warn(`파형 캐시 무효화 (손상 감지): ${cacheKey}`);
            // 손상된 캐시 데이터 자동 삭제
            try {
              const deleteTransaction = db.transaction([WAVEFORM_STORE], 'readwrite');
              const deleteStore = deleteTransaction.objectStore(WAVEFORM_STORE);
              deleteStore.delete(cacheKey);
            } catch (deleteErr) {
              // 삭제 실패해도 null 반환으로 처리
            }
            resolve(null);
            return;
          }
          console.log(`파형 캐시 히트: ${cacheKey}`);
          resolve(result.waveformData);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('캐시 조회 오류:', request.error);
        resolve(null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('캐시 조회 실패:', error);
    return null;
  }
};

/**
 * 파형 데이터를 캐시에 저장
 * @param {string} cacheKey - 캐시 키
 * @param {ArrayBuffer} waveformData - 파형 데이터
 * @param {Object} metadata - 추가 메타데이터 (파일명 등)
 * @returns {Promise<boolean>} - 저장 성공 여부
 */
export const cacheWaveform = async (cacheKey, waveformData, metadata = {}) => {
  if (!cacheKey || !waveformData) return false;

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([WAVEFORM_STORE], 'readwrite');
      const store = transaction.objectStore(WAVEFORM_STORE);

      const record = {
        id: cacheKey,
        waveformData: waveformData,
        fileName: metadata.fileName || '',
        fileSize: metadata.fileSize || 0,
        createdAt: new Date().toISOString(),
      };

      const request = store.put(record);

      request.onsuccess = () => {
        console.log(`파형 캐시 저장 완료: ${cacheKey}`);
        resolve(true);
      };

      request.onerror = () => {
        console.error('캐시 저장 오류:', request.error);
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('캐시 저장 실패:', error);
    return false;
  }
};

/**
 * 특정 캐시 항목 삭제
 * @param {string} cacheKey - 캐시 키
 * @returns {Promise<boolean>} - 삭제 성공 여부
 */
export const deleteCachedWaveform = async (cacheKey) => {
  if (!cacheKey) return false;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([WAVEFORM_STORE], 'readwrite');
      const store = transaction.objectStore(WAVEFORM_STORE);
      const request = store.delete(cacheKey);

      request.onsuccess = () => {
        console.log(`캐시 삭제 완료: ${cacheKey}`);
        resolve(true);
      };

      request.onerror = () => {
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('캐시 삭제 실패:', error);
    return false;
  }
};

/**
 * 모든 캐시 삭제
 * @returns {Promise<boolean>} - 삭제 성공 여부
 */
export const clearAllWaveformCache = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([WAVEFORM_STORE], 'readwrite');
      const store = transaction.objectStore(WAVEFORM_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('모든 파형 캐시 삭제 완료');
        resolve(true);
      };

      request.onerror = () => {
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('캐시 전체 삭제 실패:', error);
    return false;
  }
};

/**
 * 캐시 정보 조회 (전체 목록 및 용량)
 * @returns {Promise<{items: Array, totalSize: number}>}
 */
export const getCacheInfo = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([WAVEFORM_STORE], 'readonly');
      const store = transaction.objectStore(WAVEFORM_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        let totalSize = 0;

        const info = items.map((item) => {
          const dataSize = item.waveformData?.byteLength || 0;
          totalSize += dataSize;
          return {
            id: item.id,
            fileName: item.fileName,
            fileSize: item.fileSize,
            dataSize: dataSize,
            createdAt: item.createdAt,
          };
        });

        resolve({
          items: info,
          totalSize: totalSize,
          count: items.length,
        });
      };

      request.onerror = () => {
        resolve({ items: [], totalSize: 0, count: 0 });
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('캐시 정보 조회 실패:', error);
    return { items: [], totalSize: 0, count: 0 };
  }
};

/**
 * 용량을 사람이 읽기 쉬운 형태로 변환
 * @param {number} bytes - 바이트 수
 * @returns {string} - 포맷된 문자열
 */
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// ============================================
// 분할 파형 peaks 캐시 함수들 (SplitPointEditor용)
// ============================================

/**
 * audioUrl에서 안정적인 캐시 키 생성
 * 서버 presigned URL: pathname 부분만 추출 (쿼리 파라미터 제외)
 * ObjectURL: URL 자체 사용 (세션 한정)
 * @param {string} audioUrl
 * @returns {string|null}
 */
export const generateSplitPeaksCacheKey = (audioUrl) => {
  if (!audioUrl) return null;
  try {
    if (audioUrl.startsWith('blob:')) return `splitpeaks_${audioUrl}`;
    const url = new URL(audioUrl);
    return `splitpeaks_${url.pathname}`;
  } catch {
    return `splitpeaks_${audioUrl.substring(0, 200)}`;
  }
};

/**
 * 캐시된 분할 파형 peaks 조회
 * @param {string} cacheKey
 * @returns {Promise<Array<{min: number, max: number}>|null>}
 */
export const getCachedSplitPeaks = async (cacheKey) => {
  if (!cacheKey) return null;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([WAVEFORM_STORE], 'readonly');
      const store = transaction.objectStore(WAVEFORM_STORE);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result;
        if (result?.peaks?.length > 0) {
          console.log(`분할 파형 캐시 히트: ${cacheKey} (${result.peaks.length} peaks)`);
          resolve(result.peaks);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
};

/**
 * 분할 파형 peaks를 캐시에 저장
 * @param {string} cacheKey
 * @param {Array<{min: number, max: number}>} peaks
 * @returns {Promise<boolean>}
 */
export const cacheSplitPeaks = async (cacheKey, peaks) => {
  if (!cacheKey || !peaks?.length) return false;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([WAVEFORM_STORE], 'readwrite');
      const store = transaction.objectStore(WAVEFORM_STORE);
      const request = store.put({
        id: cacheKey,
        peaks,
        createdAt: new Date().toISOString(),
      });
      request.onsuccess = () => {
        console.log(`분할 파형 캐시 저장: ${cacheKey} (${peaks.length} peaks)`);
        resolve(true);
      };
      request.onerror = () => resolve(false);
      transaction.oncomplete = () => db.close();
    });
  } catch {
    return false;
  }
};

// ============================================
// 장면 전환 감지 결과 캐시 함수들
// ============================================

/**
 * 캐시된 장면 전환 감지 결과 조회
 * @param {string} cacheKey - 캐시 키
 * @returns {Promise<{sceneChanges: number[], threshold: number}|null>}
 */
export const getCachedSceneChanges = async (cacheKey) => {
  if (!cacheKey) return null;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([SCENE_STORE], 'readonly');
      const store = transaction.objectStore(SCENE_STORE);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.sceneChanges) {
          console.log(`장면 전환 감지 캐시 히트: ${cacheKey}`);
          resolve({
            sceneChanges: result.sceneChanges,
            threshold: result.threshold,
          });
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('장면 전환 감지 캐시 조회 실패:', error);
    return null;
  }
};

/**
 * 장면 전환 감지 결과를 캐시에 저장
 * @param {string} cacheKey - 캐시 키
 * @param {number[]} sceneChanges - 장면 전환 시간 배열
 * @param {number} threshold - 사용된 감도 값
 * @param {Object} metadata - 추가 메타데이터
 * @returns {Promise<boolean>}
 */
export const cacheSceneChanges = async (cacheKey, sceneChanges, threshold, metadata = {}) => {
  if (!cacheKey || !sceneChanges) return false;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([SCENE_STORE], 'readwrite');
      const store = transaction.objectStore(SCENE_STORE);

      const record = {
        id: cacheKey,
        sceneChanges: sceneChanges,
        threshold: threshold,
        fileName: metadata.fileName || '',
        fileSize: metadata.fileSize || 0,
        createdAt: new Date().toISOString(),
      };

      const request = store.put(record);

      request.onsuccess = () => {
        console.log(`장면 전환 감지 캐시 저장 완료: ${cacheKey} (${sceneChanges.length}개)`);
        resolve(true);
      };

      request.onerror = () => {
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('장면 전환 감지 캐시 저장 실패:', error);
    return false;
  }
};

/**
 * 특정 장면 전환 감지 캐시 삭제
 * @param {string} cacheKey - 캐시 키
 * @returns {Promise<boolean>}
 */
export const deleteCachedSceneChanges = async (cacheKey) => {
  if (!cacheKey) return false;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([SCENE_STORE], 'readwrite');
      const store = transaction.objectStore(SCENE_STORE);
      const request = store.delete(cacheKey);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    return false;
  }
};

/**
 * 모든 장면 전환 감지 캐시 삭제
 * @returns {Promise<boolean>}
 */
export const clearAllSceneCache = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([SCENE_STORE], 'readwrite');
      const store = transaction.objectStore(SCENE_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('모든 장면 전환 감지 캐시 삭제 완료');
        resolve(true);
      };

      request.onerror = () => {
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    return false;
  }
};

// ============================================
// 편집 이력 관리 함수들
// ============================================

// role 의 base 부분만 비교 (검수자 _REVIEW 접미사 제거).
// 저장 시 base role 로 통일하지만, 과거 _REVIEW 접미사가 붙어 저장된 레코드
// 와의 호환을 위해 비교 시점에도 한 번 더 normalize.
const normalizeBaseRole = (r) => {
  if (typeof r !== 'string') return r;
  return r.replace(/_REVIEW$/, '');
};

/**
 * 편집 이력 저장 (최대 20개 유지)
 * @param {Array} subtitles - 현재 자막 배열
 * @param {string} action - 수행된 작업 설명
 * @param {Object} details - 추가 상세 정보
 * @param {string|null} fileId - 파일 ID (필터링용)
 * @param {string|null} role - 권한 (필터링용)
 * @returns {Promise<boolean>}
 */
export const saveEditHistory = async (subtitles, action, details = {}, fileId = null, role = null) => {
  if (!subtitles) return false;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([HISTORY_STORE], 'readwrite');
      const store = transaction.objectStore(HISTORY_STORE);

      // 새 이력 추가.
      // subtitleStore 의 mutation 들은 자막 배열을 immutable 하게 다루므로
      // record 내부에 `subtitles` reference 를 그대로 넣어도 안전하다. IDB 가 add 시
      // structured clone 으로 자체 복제하므로 별도 JSON.parse(JSON.stringify(...)) 불필요.
      // (자막 1000개 ~200KB 직렬화/역직렬화를 매 500ms 마다 한 번 하던 비용 제거)
      const record = {
        subtitles,
        action: action,
        details: details,
        timestamp: new Date().toISOString(),
        subtitleCount: subtitles.length,
        // 조회 시 string 비교를 안정화하기 위해 string 으로 정규화.
        fileId: fileId != null ? String(fileId) : null,
        // 검수자/작업자가 같은 base 권한이면 같은 이력으로 보도록 base 만 저장.
        role: normalizeBaseRole(role),
      };

      const addRequest = store.add(record);

      addRequest.onsuccess = () => {
        historyWritesSincePrune++;
        // 매 add 마다 count + cursor scan 을 돌리지 않고 N 회에 한 번만 정리한다.
        // MAX_HISTORY_COUNT 를 일시적으로 N-1 만큼 초과할 수 있지만 UX 영향 없음.
        if (historyWritesSincePrune >= HISTORY_PRUNE_INTERVAL) {
          historyWritesSincePrune = 0;
          const countRequest = store.count();
          countRequest.onsuccess = () => {
            const count = countRequest.result;
            if (count > MAX_HISTORY_COUNT) {
              const deleteCount = count - MAX_HISTORY_COUNT;
              const cursorRequest = store.openCursor();
              let deleted = 0;
              cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && deleted < deleteCount) {
                  cursor.delete();
                  deleted++;
                  cursor.continue();
                }
              };
            }
          };
        }
        resolve(true);
      };

      addRequest.onerror = () => {
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('편집 이력 저장 실패:', error);
    return false;
  }
};

/**
 * 편집 이력 조회 (최신순, fileId/permission 필터링 가능)
 * @param {string|null} fileId - 파일 ID로 필터링 (null이면 전체)
 * @param {string|null} role - 권한으로 필터링 (null이면 전체)
 * @returns {Promise<Array>}
 */
export const getEditHistory = async (fileId = null, role = null) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([HISTORY_STORE], 'readonly');
      const store = transaction.objectStore(HISTORY_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        let history = request.result || [];

        // fileId로 필터링 (저장된 fileId가 null이거나 일치하는 경우 포함).
        // 저장 시 fileNo/projectFileId 등이 섞일 수 있어 string 비교 전 normalize.
        if (fileId) {
          const fid = String(fileId);
          history = history.filter(h => !h.fileId || String(h.fileId) === fid);
        }

        // role 필터: 검수자(_REVIEW) 와 작업자가 같은 base role 이면 동일하게 본다.
        // (저장 시 base role 로 통일하지만 과거 데이터 호환 위해 양쪽 normalize)
        if (role) {
          const base = normalizeBaseRole(role);
          history = history.filter(h => !h.role || normalizeBaseRole(h.role) === base);
        }

        // 최신순으로 정렬
        history = history.sort((a, b) =>
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        resolve(history);
      };

      request.onerror = () => {
        resolve([]);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('편집 이력 조회 실패:', error);
    return [];
  }
};

/**
 * 특정 이력의 자막 데이터 가져오기
 * @param {number} historyId - 이력 ID
 * @returns {Promise<Array|null>}
 */
export const getHistorySubtitles = async (historyId) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([HISTORY_STORE], 'readonly');
      const store = transaction.objectStore(HISTORY_STORE);
      const request = store.get(historyId);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.subtitles) {
          resolve(result.subtitles);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('이력 자막 조회 실패:', error);
    return null;
  }
};

/**
 * 모든 편집 이력 삭제
 * @returns {Promise<boolean>}
 */
export const clearEditHistory = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([HISTORY_STORE], 'readwrite');
      const store = transaction.objectStore(HISTORY_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('편집 이력 삭제 완료');
        resolve(true);
      };

      request.onerror = () => {
        resolve(false);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    return false;
  }
};

/**
 * 편집 이력 개수 조회
 * @returns {Promise<number>}
 */
export const getEditHistoryCount = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([HISTORY_STORE], 'readonly');
      const store = transaction.objectStore(HISTORY_STORE);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result || 0);
      };

      request.onerror = () => {
        resolve(0);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    return 0;
  }
};

