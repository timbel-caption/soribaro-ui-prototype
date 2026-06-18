let _requestTypes = [
  { id: 'rt-1', code: 'H', name: '회의록', contractTypes: ['단건계약', '연간계약', '수의계약', '긴급계약'] },
  { id: 'rt-2', code: 'ENT', name: '엔터프라이즈', contractTypes: ['단건계약', '수의계약', '볼륨계약'] },
  { id: 'rt-3', code: 'REC', name: '녹취록', contractTypes: ['연간계약', '수의계약'] },
  { id: 'rt-4', code: 'TRN', name: '번역', contractTypes: ['단건계약', '볼륨계약'] },
];

export const getRequestTypes = () => _requestTypes;
export const addRequestType = (rt) => { _requestTypes = [..._requestTypes, rt]; };
export const deleteRequestType = (id) => { _requestTypes = _requestTypes.filter((r) => r.id !== id); };
export const addContractType = (id, ct) => {
  _requestTypes = _requestTypes.map((r) =>
    r.id === id ? { ...r, contractTypes: [...r.contractTypes, ct] } : r
  );
};
export const removeContractType = (id, ct) => {
  _requestTypes = _requestTypes.map((r) =>
    r.id === id ? { ...r, contractTypes: r.contractTypes.filter((c) => c !== ct) } : r
  );
};
