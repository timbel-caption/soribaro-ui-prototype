import { VOD_SAMPLES } from './vodSampleData';
import { MEETING_SAMPLES } from './meetingSampleData';
import { STENOGRAPHY_SAMPLES } from './stenographySampleData';

let _vodSamples = [...VOD_SAMPLES];
let _meetingSamples = [...MEETING_SAMPLES];
let _stenographySamples = [...STENOGRAPHY_SAMPLES];

export const getVodSamples = () => _vodSamples;
export const getMeetingSamples = () => _meetingSamples;
export const getStenographySamples = () => _stenographySamples;

export const addVodSample = (s) => { _vodSamples = [s, ..._vodSamples]; };
export const addMeetingSample = (s) => { _meetingSamples = [s, ..._meetingSamples]; };
export const appendMeetingSample = (s) => { _meetingSamples = [..._meetingSamples, s]; };
export const appendVodSample = (s) => { _vodSamples = [..._vodSamples, s]; };
export const appendStenographySample = (s) => { _stenographySamples = [..._stenographySamples, s]; };

export const updateSampleSpecialNote = (id, note) => {
  _meetingSamples = _meetingSamples.map((s) => s.id === id ? { ...s, specialNote: note } : s);
  _vodSamples = _vodSamples.map((s) => s.id === id ? { ...s, specialNote: note } : s);
  _stenographySamples = _stenographySamples.map((s) => s.id === id ? { ...s, specialNote: note } : s);
};

export const updateSampleSubfileStatus = (id, status) => {
  _meetingSamples = _meetingSamples.map((s) => s.id === id ? { ...s, subfileStatus: status } : s);
  _vodSamples = _vodSamples.map((s) => s.id === id ? { ...s, subfileStatus: status } : s);
  _stenographySamples = _stenographySamples.map((s) => s.id === id ? { ...s, subfileStatus: status } : s);
};

export const updateSampleFiles = (id, newFiles) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, files: newFiles } : s); return; }
  const si = _stenographySamples.findIndex((s) => s.id === id);
  if (si !== -1) { _stenographySamples = _stenographySamples.map((s, i) => i === si ? { ...s, files: newFiles } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, files: newFiles } : s); }
};

export const updateSampleSubjects = (id, newSubjects) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, subjects: newSubjects } : s); return; }
  const si = _stenographySamples.findIndex((s) => s.id === id);
  if (si !== -1) { _stenographySamples = _stenographySamples.map((s, i) => i === si ? { ...s, subjects: newSubjects } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, subjects: newSubjects } : s); }
};

const _updateSampleField = (id, patch) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, ...patch } : s); return; }
  const si = _stenographySamples.findIndex((s) => s.id === id);
  if (si !== -1) { _stenographySamples = _stenographySamples.map((s, i) => i === si ? { ...s, ...patch } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, ...patch } : s); }
};

export const updateSampleNoteEntries = (id, noteEntries) => _updateSampleField(id, { noteEntries });
export const updateSampleMemoEntries = (id, memoEntries) => _updateSampleField(id, { memoEntries });
export const updateSamplePlayTime = (id, totalPlayTm) => _updateSampleField(id, { totalPlayTm });
