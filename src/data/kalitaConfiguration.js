export const KALITA_CONFIGURATION = Object.freeze({
  '155': Object.freeze({ size: '155', minDose: 12, maxDose: 20, defaultDose: 15 }),
  '185': Object.freeze({ size: '185', minDose: 15, maxDose: 36, defaultDose: 20 }),
});

export function kalitaDoseBounds(size) {
  return KALITA_CONFIGURATION[String(size)] || KALITA_CONFIGURATION['185'];
}

export function normalizeKalitaSize(value, requestedDose) {
  const raw = String(value || '').replace('wave-', '');
  if (raw === '155' || raw === '185') return raw;
  return Number(requestedDose) > KALITA_CONFIGURATION['155'].maxDose ? '185' : '155';
}

export function normalizeKalitaDose(size, value) {
  const bounds = kalitaDoseBounds(size);
  if (value == null || value === '') return bounds.defaultDose;
  const dose = Number(value);
  if (!Number.isFinite(dose) || dose < bounds.minDose || dose > bounds.maxDose) {
    throw new RangeError(`Wave ${bounds.size} dose must be between ${bounds.minDose}g and ${bounds.maxDose}g`);
  }
  return dose;
}
