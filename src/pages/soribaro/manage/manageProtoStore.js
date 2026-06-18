let _requestTypes = [
  { id: 'rt-1', name: '회의록', contractTypes: ['단건계약', '연간계약', '수의계약', '긴급계약'] },
  { id: 'rt-2', name: 'VOD', contractTypes: ['단건계약', '수의계약', '볼륨계약'] },
  { id: 'rt-3', name: 'SDH', contractTypes: ['단건계약', '볼륨계약'] },
  { id: 'rt-4', name: '연수', contractTypes: ['연간계약', '수의계약'] },
];

export const getRequestTypes = () => _requestTypes;
export const addRequestType = (rt) => { _requestTypes = [..._requestTypes, rt]; };
export const deleteRequestType = (id) => { _requestTypes = _requestTypes.filter((r) => r.id !== id); };
