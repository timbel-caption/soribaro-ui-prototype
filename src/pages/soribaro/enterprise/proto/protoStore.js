import { VOD_SAMPLES } from './vodSampleData';
import { MEETING_SAMPLES } from './meetingSampleData';

let _vodSamples = [...VOD_SAMPLES];
let _meetingSamples = [...MEETING_SAMPLES];

export const getVodSamples = () => _vodSamples;
export const getMeetingSamples = () => _meetingSamples;
export const addVodSample = (s) => { _vodSamples = [s, ..._vodSamples]; };
export const addMeetingSample = (s) => { _meetingSamples = [s, ..._meetingSamples]; };

export const updateSampleFiles = (id, newFiles) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, files: newFiles } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, files: newFiles } : s); }
};

export const updateSampleSubjects = (id, newSubjects) => {
  const vi = _vodSamples.findIndex((s) => s.id === id);
  if (vi !== -1) { _vodSamples = _vodSamples.map((s, i) => i === vi ? { ...s, subjects: newSubjects } : s); return; }
  const mi = _meetingSamples.findIndex((s) => s.id === id);
  if (mi !== -1) { _meetingSamples = _meetingSamples.map((s, i) => i === mi ? { ...s, subjects: newSubjects } : s); }
};
