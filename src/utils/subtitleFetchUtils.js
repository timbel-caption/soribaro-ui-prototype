import { getProjectFileInfo } from '../api/v9/projectFiles/index';
import { getLatestSubtitleWork, getLatestSubtitleWorkByStatus } from '../api/v9/subtitleWorks/index';
import { mergeSubtitleSegments } from './subtitleExportUtils';
import { parseSubtitleJson } from './subtitleJsonFormat';
import { detectOverlaps } from './sttMergeUtils';

const TIME_MATCH_TOLERANCE = 0.1;

function isSameTimeWindow(a, b, tolerance = TIME_MATCH_TOLERANCE) {
  return (
    Math.abs(a.startTime - b.startTime) < tolerance &&
    Math.abs(a.endTime - b.endTime) < tolerance
  );
}

/**
 * 편집 역할(base)의 자막과 출발어(source) / 중간어(middle) 자막을
 * 시간 합집합 기준으로 병합. 어느 한 쪽에만 존재하는 시간대는 해당 필드만
 * 채워진 빈 싱크 row로 생성한다.
 *
 * 각 입력 자막은 { startTime, endTime, text, id?, speaker?, speakerName?, align? } 형태.
 * 서버 응답(start/end 타임코드)은 호출측에서 먼저 초 단위로 변환해 전달할 것.
 *
 * 반환: startTime 오름차순의
 *       { id, startTime, endTime, text, sourceText, middleText, speaker, speakerName, align } 배열.
 */
export function mergeTranslationSubtitles(
  baseSubs = [],
  sourceSubs = [],
  middleSubs = [],
  tolerance = TIME_MATCH_TOLERANCE,
) {
  const buckets = [];

  const getOrCreateBucket = (sub) => {
    const existing = buckets.find((b) => isSameTimeWindow(b, sub, tolerance));
    if (existing) return existing;
    const created = {
      startTime: sub.startTime,
      endTime: sub.endTime,
      baseRef: null,
      sourceRef: null,
      middleRef: null,
    };
    buckets.push(created);
    return created;
  };

  const assign = (list, refKey) => {
    list.forEach((sub) => {
      if (!Number.isFinite(sub?.startTime) || !Number.isFinite(sub?.endTime)) return;
      const bucket = getOrCreateBucket(sub);
      // 같은 시간대에 이미 해당 영역의 자막이 할당되어 있으면 덮어쓰지 않고 유지
      if (!bucket[refKey]) bucket[refKey] = sub;
    });
  };

  assign(baseSubs, 'baseRef');
  assign(sourceSubs, 'sourceRef');
  assign(middleSubs, 'middleRef');

  buckets.sort((a, b) => a.startTime - b.startTime);

  return buckets.map((b) => {
    // 구조 필드(id, 시간, 화자 등)는 base > middle > source 순으로 우선.
    const primary = b.baseRef || b.middleRef || b.sourceRef;
    return {
      id: primary.id,
      startTime: primary.startTime,
      endTime: primary.endTime,
      text: b.baseRef?.text || '',
      sourceText: b.sourceRef?.text || '',
      middleText: b.middleRef?.text || '',
      speaker: primary.speaker,
      speakerName: primary.speakerName,
      align: primary.align || primary.position || 'bottomCenter',
    };
  });
}

export async function fetchSubtitlesByType(servCd, fileNo, type) {
  try {
    const infoRes = await getProjectFileInfo(servCd, type, fileNo);
    if (infoRes?.status !== 'SUCCESS' || !infoRes?.data?.length) return [];

    const subtitleArrays = await Promise.all(
      infoRes.data.map(async (info) => {
        try {
          const workRes = await getLatestSubtitleWork(info.projectFileId);
          if (workRes?.status === 'SUCCESS' && workRes?.data?.subtitle) {
            return parseSubtitleJson(workRes.data.subtitle)?.subtitles ?? [];
          }
        } catch { /* 404 = no data */ }
        return [];
      }),
    );

    return subtitleArrays.flat();
  } catch {
    return [];
  }
}

/**
 * 검수완료(REVIEW_DONE) 자막만 분할 세그먼트 단위로 수집한다.
 * - 누락 세그먼트 정보를 함께 반환해서 호출측에서 사용자에게 알릴 수 있게 한다.
 * - 분할 세그먼트가 ≥2 면 mergeSubtitleSegments 로 절대 타임라인 기준 결합한 뒤
 *   `_chunkIndex` 를 활용한 `detectOverlaps` 로 분할 경계 자막 겹침을 검출해 반환한다.
 *   호출측은 overlaps.length > 0 이면 SttMergeConflictModal 로 사용자에게 해결을 위임.
 *
 * @returns {Promise<{
 *   subtitles: Array,
 *   missing: Array<{ fileNo, projectFileId, isSplit, startSec, endSec, index, total }>,
 *   overlaps: Array<{ indexA: number, indexB: number, overlapSec: number }>
 * }>}
 */
export async function fetchReviewDoneSubtitlesByType(servCd, fileNo, type) {
  const result = { subtitles: [], missing: [], overlaps: [] };
  try {
    const infoRes = await getProjectFileInfo(servCd, type, fileNo);
    if (infoRes?.status !== 'SUCCESS' || !infoRes?.data?.length) return result;

    const segments = infoRes.data;
    const total = segments.length;

    const segResults = await Promise.all(
      segments.map(async (info, idx) => {
        try {
          const workRes = await getLatestSubtitleWorkByStatus(info.projectFileId, 'REVIEW_DONE');
          if (workRes?.status === 'SUCCESS' && workRes?.data?.subtitle) {
            return { ok: true, subtitles: parseSubtitleJson(workRes.data.subtitle)?.subtitles ?? [] };
          }
        } catch { /* 404 = REVIEW_DONE 자막 없음 */ }
        return {
          ok: false,
          info: {
            fileNo,
            projectFileId: info.projectFileId,
            isSplit: info.isSplit,
            startSec: info.startSec,
            endSec: info.endSec,
            index: idx + 1,
            total,
          },
        };
      }),
    );

    // 세그먼트별 자막 수집 + 누락 추적
    const segmentSubs = [];
    segResults.forEach((r) => {
      if (r.ok) segmentSubs.push({ subtitles: r.subtitles });
      else result.missing.push(r.info);
    });

    if (segmentSubs.length === 0) {
      result.subtitles = [];
    } else if (segmentSubs.length === 1) {
      // 단일 세그먼트: 경계 겹침이 발생할 여지가 없음. _chunkIndex 0 만 부여.
      result.subtitles = segmentSubs[0].subtitles.map((s) => ({
        ...s,
        _chunkIndex: 0,
      }));
    } else {
      // 다중 세그먼트: 화자 dedup + 시간순 정렬 + _chunkIndex 부여 후 분할 경계 겹침 검출.
      result.subtitles = mergeSubtitleSegments(segmentSubs);
      result.overlaps = detectOverlaps(result.subtitles, 0.05);
    }
    return result;
  } catch {
    return result;
  }
}

export async function fetchAllSubtitles(servCd, fileNo, isTranslation = false) {
  const types = isTranslation ? ['START', 'MID', 'FINAL'] : ['START'];
  const results = await Promise.all(
    types.map((type) => fetchSubtitlesByType(servCd, fileNo, type)),
  );
  const data = { START: [], MID: [], FINAL: [] };
  types.forEach((type, idx) => { data[type] = results[idx]; });
  return data;
}
