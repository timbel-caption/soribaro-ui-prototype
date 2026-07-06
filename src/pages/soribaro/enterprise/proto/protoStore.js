import { VOD_SAMPLES } from './vodSampleData';
import { MEETING_SAMPLES } from './meetingSampleData';
import { STENOGRAPHY_SAMPLES } from './stenographySampleData';
import { RECORDING_SAMPLES } from './recordingSampleData';

let _vodSamples = [...VOD_SAMPLES];
let _meetingSamples = [...MEETING_SAMPLES];
let _stenographySamples = [...STENOGRAPHY_SAMPLES];
// 녹취록 작업관리 전용 저장소. 회의록(_meetingSamples)과 별개 배열로 관리해 두 화면의 데이터가 서로 영향을 주지 않는다.
let _recordingSamples = [...RECORDING_SAMPLES];

export const getVodSamples = () => _vodSamples;
export const getMeetingSamples = () => _meetingSamples;
export const getStenographySamples = () => _stenographySamples;
export const getRecordingSamples = () => _recordingSamples;

export const addVodSample = (s) => { _vodSamples = [s, ..._vodSamples]; };
export const addMeetingSample = (s) => { _meetingSamples = [s, ..._meetingSamples]; };
export const appendMeetingSample = (s) => { _meetingSamples = [..._meetingSamples, s]; };
export const appendVodSample = (s) => { _vodSamples = [..._vodSamples, s]; };
export const appendStenographySample = (s) => { _stenographySamples = [..._stenographySamples, s]; };
export const appendRecordingSample = (s) => { _recordingSamples = [..._recordingSamples, s]; };

export const updateSampleSpecialNote = (id, note) => {
  _meetingSamples = _meetingSamples.map((s) => s.id === id ? { ...s, specialNote: note } : s);
  _vodSamples = _vodSamples.map((s) => s.id === id ? { ...s, specialNote: note } : s);
  _stenographySamples = _stenographySamples.map((s) => s.id === id ? { ...s, specialNote: note } : s);
  _recordingSamples = _recordingSamples.map((s) => s.id === id ? { ...s, specialNote: note } : s);
};

export const updateSampleSubfileStatus = (id, status) => {
  _meetingSamples = _meetingSamples.map((s) => s.id === id ? { ...s, subfileStatus: status } : s);
  _vodSamples = _vodSamples.map((s) => s.id === id ? { ...s, subfileStatus: status } : s);
  _stenographySamples = _stenographySamples.map((s) => s.id === id ? { ...s, subfileStatus: status } : s);
  _recordingSamples = _recordingSamples.map((s) => s.id === id ? { ...s, subfileStatus: status } : s);
};

export const updateSampleFiles = (id, newFiles) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, files: newFiles } : s); return; }
  const si = _stenographySamples.findIndex((s) => s.id === id);
  if (si !== -1) { _stenographySamples = _stenographySamples.map((s, i) => i === si ? { ...s, files: newFiles } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, files: newFiles } : s); return; }
  const ri = _recordingSamples.findIndex((s) => s.id === id);
  if (ri !== -1) { _recordingSamples = _recordingSamples.map((s, i) => i === ri ? { ...s, files: newFiles } : s); }
};

export const updateSampleSubjects = (id, newSubjects) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, subjects: newSubjects } : s); return; }
  const si = _stenographySamples.findIndex((s) => s.id === id);
  if (si !== -1) { _stenographySamples = _stenographySamples.map((s, i) => i === si ? { ...s, subjects: newSubjects } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, subjects: newSubjects } : s); return; }
  const ri = _recordingSamples.findIndex((s) => s.id === id);
  if (ri !== -1) { _recordingSamples = _recordingSamples.map((s, i) => i === ri ? { ...s, subjects: newSubjects } : s); }
};

const _updateSampleField = (id, patch) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, ...patch } : s); return; }
  const si = _stenographySamples.findIndex((s) => s.id === id);
  if (si !== -1) { _stenographySamples = _stenographySamples.map((s, i) => i === si ? { ...s, ...patch } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, ...patch } : s); return; }
  const ri = _recordingSamples.findIndex((s) => s.id === id);
  if (ri !== -1) { _recordingSamples = _recordingSamples.map((s, i) => i === ri ? { ...s, ...patch } : s); }
};

// 회의록 파일관리: 난도 선택(전체 파일 일괄 적용) — 선택해야 프로젝트 관리에서 파일 추가 가능
export const updateSampleFileDifficulty = (id, fileDifficulty) => _updateSampleField(id, { fileDifficulty });

// 녹취록 프로젝트 관리: 최종산출물 알림 발송 완료 시 '초안완성', 완본 알림 발송 완료 시 '완료'로 상태를 갱신
export const updateSampleOverallStatus = (id, overallStatus) => _updateSampleField(id, { overallStatus });

export const updateSampleNoteEntries = (id, noteEntries) => _updateSampleField(id, { noteEntries });
export const updateSampleMemoEntries = (id, memoEntries) => _updateSampleField(id, { memoEntries });
export const updateSamplePlayTime = (id, totalPlayTm) => _updateSampleField(id, { totalPlayTm });
// 현장속기 시작-종료/정회 시간 수정 및 정회시간 제외분으로 파생한 의뢰시간(totalPlayTm) 갱신.
// 정산/배정 등 관련 기능은 이 값들을 그대로 참조한다.
export const updateSampleSessionDetails = (id, patch) => _updateSampleField(id, patch);

// 현장속기 배정 관리 탭: 작업자 배정·취소 정보를 protoStore에 반영
export const updateStenographyWorkerAssign = (id, patch) => {
  _stenographySamples = _stenographySamples.map((s) => s.id === id ? { ...s, ...patch } : s);
};

// 업체정산 확인 처리: settlement 서브객체를 패치
export const updateSampleSettlement = (id, patch) => {
  const merge = (s) => s.id === id ? { ...s, settlement: { ...s.settlement, ...patch } } : s;
  _meetingSamples = _meetingSamples.map(merge);
  _stenographySamples = _stenographySamples.map(merge);
  _vodSamples = _vodSamples.map(merge);
  _recordingSamples = _recordingSamples.map(merge);
};
