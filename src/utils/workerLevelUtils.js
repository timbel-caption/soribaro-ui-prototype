export function normalizeWorkerLevelIds(value) {
  if (Array.isArray(value)) {
    return value.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  }
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    return value
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id));
  }
  if (value == null || value === '') return [];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? [numeric] : [];
}

export function formatWorkerLevelNames(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'string') return value || '';
  return '';
}
