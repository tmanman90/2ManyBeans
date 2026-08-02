// Compact, per-bean hand-brew timing memory. This module deliberately has no
// Firestore or React dependency so both the writer and recipe UI share one
// deterministic comparison contract.

export const TIMING_MEMORY_LIMIT = 24;
export const LEARNING_COMPLETION_KINDS = new Set(['natural', 'manualEarly', 'userFinished']);
const COMPLETION_KINDS = new Set([...LEARNING_COMPLETION_KINDS, 'skipped']);

const finiteNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const finitePositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const stringOrNull = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

function normalizeLineage(lineage) {
  if (!lineage || typeof lineage !== 'object') return null;
  const profile = stringOrNull(lineage.profile);
  if (!profile) return null;
  return {
    profile,
    engineVersion: stringOrNull(lineage.engineVersion),
    rulesVersion: stringOrNull(lineage.rulesVersion),
    sourceContextHash: stringOrNull(lineage.sourceContextHash),
  };
}

// The persisted record only contains fields needed for provenance and matching.
// `createdAt` is a client timestamp; Firestore owns document-level updatedAt.
export function buildTimingEvent(snapshot) {
  const sessionId = stringOrNull(snapshot?.sessionId);
  const beanId = stringOrNull(snapshot?.beanId);
  const device = stringOrNull(snapshot?.device);
  const mode = snapshot?.mode === 'iced' ? 'iced' : snapshot?.mode === 'hot' ? 'hot' : null;
  const completionKind = stringOrNull(snapshot?.completionKind);
  const doseGrams = snapshot?.doseGrams;
  const actualElapsedMs = snapshot?.actualElapsedMs;
  const targetMs = snapshot?.targetMs;
  const lineage = normalizeLineage(snapshot?.lineage);
  const kalitaSize = snapshot?.kalitaSize == null ? null : String(snapshot.kalitaSize);

  if (!sessionId || !beanId || !device || !mode || !COMPLETION_KINDS.has(completionKind)
    || !finitePositive(doseGrams) || !finiteNonNegative(actualElapsedMs)
    || !finitePositive(targetMs) || !lineage
    || (kalitaSize != null && !['155', '185'].includes(kalitaSize))) {
    return null;
  }

  const createdAt = finiteNonNegative(snapshot?.createdAt) ? snapshot.createdAt : Date.now();
  return {
    sessionId,
    beanId,
    device,
    kalitaSize: device === 'kalita' ? kalitaSize : null,
    mode,
    doseGrams,
    actualElapsedMs: Math.round(actualElapsedMs),
    targetMs: Math.round(targetMs),
    completionKind,
    createdAt: Math.round(createdAt),
    lineage,
  };
}

export function normalizeTimingHistory(history) {
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  return history
    .map(buildTimingEvent)
    .filter((event) => event && !seen.has(event.sessionId) && seen.add(event.sessionId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function mergeTimingEvent(history, incoming, limit = TIMING_MEMORY_LIMIT) {
  const event = buildTimingEvent(incoming);
  const normalized = normalizeTimingHistory(history);
  const boundedLimit = Number.isInteger(limit) && limit > 0 ? limit : TIMING_MEMORY_LIMIT;
  if (!event) return normalized.slice(0, boundedLimit);
  return [event, ...normalized.filter((existing) => existing.sessionId !== event.sessionId)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, boundedLimit);
}

export function timingContextFromRecipe({ beanId, recipe, mode = 'hot' } = {}) {
  const profile = stringOrNull(recipe?.timingProfile)
    || stringOrNull(recipe?.candidate ? `${recipe.engineVersion || 'candidate'}:${recipe.rulesVersion || 'rules'}` : 'legacy');
  const doseGrams = recipe?.coffeeGrams;
  const targetMs = typeof recipe?.totalBrewTimeSeconds === 'number'
    ? recipe.totalBrewTimeSeconds * 1000
    : null;
  return {
    beanId: stringOrNull(beanId),
    device: stringOrNull(recipe?.device) || 'v60',
    kalitaSize: recipe?.device === 'kalita' && recipe?.kalitaSize != null ? String(recipe.kalitaSize) : null,
    mode: mode === 'iced' ? 'iced' : 'hot',
    doseGrams: finitePositive(doseGrams) ? doseGrams : null,
    targetMs: finitePositive(targetMs) ? targetMs : null,
    lineage: profile ? {
      profile,
      engineVersion: stringOrNull(recipe?.engineVersion),
      rulesVersion: stringOrNull(recipe?.rulesVersion),
      sourceContextHash: stringOrNull(recipe?.sourceContextHash),
    } : null,
  };
}

function sameBaseConfiguration(event, context) {
  return event.beanId === context.beanId
    && event.device === context.device
    && event.kalitaSize === context.kalitaSize
    && event.mode === context.mode
    && event.lineage.profile === context.lineage?.profile
    && event.lineage.engineVersion === context.lineage?.engineVersion
    && event.lineage.rulesVersion === context.lineage?.rulesVersion
    && event.lineage.sourceContextHash === context.lineage?.sourceContextHash;
}

export function selectTimingMemory(history, context) {
  if (!context?.beanId || !context?.doseGrams || !context?.lineage?.profile) return null;
  // A skip is retained in storage for auditability, but it is not evidence of
  // a finished brew and must neither train nor become the reassuring "last
  // brew" context shown in the recipe.
  const candidates = normalizeTimingHistory(history).filter((event) =>
    sameBaseConfiguration(event, context) && LEARNING_COMPLETION_KINDS.has(event.completionKind)
  );
  if (!candidates.length) return null;
  const exact = candidates.filter((event) => event.doseGrams === context.doseGrams);
  const mostRecent = exact[0] || candidates[0];
  const values = exact.map((event) => event.actualElapsedMs).sort((a, b) => a - b);
  const range = values.length >= 3 ? {
    minMs: values[0],
    maxMs: values[values.length - 1],
    medianMs: values[Math.floor(values.length / 2)],
    sampleCount: values.length,
  } : null;
  return {
    event: mostRecent,
    isExactDose: exact.length > 0,
    range,
  };
}

export function formatTimingMs(ms) {
  if (!finiteNonNegative(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
