// Compact, per-bean hand-brew timing memory. This module deliberately has no
// Firestore or React dependency so both the writer and recipe UI share one
// deterministic comparison contract.

import { MANUAL_SOURCE_CLOCK_EVENTS, MANUAL_SOURCE_RECORD_VERSION } from './manualRecipeContract.js';
import { MANUAL_SOURCE_PROJECTION_VERSION, manualSourceConfigurationKey } from './manualSourceProjection.js';

export const TIMING_MEMORY_LIMIT = 24;
export const LEARNING_COMPLETION_KINDS = new Set(['natural', 'manualEarly', 'userFinished']);
const COMPLETION_KINDS = new Set([...LEARNING_COMPLETION_KINDS, 'skipped']);

const finiteNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const finitePositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const stringOrNull = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (object(value)) {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function normalizeLineage(lineage) {
  if (!object(lineage)) return null;
  const profile = stringOrNull(lineage.profile);
  if (!profile) return null;
  const normalized = {
    profile,
    engineVersion: stringOrNull(lineage.engineVersion),
    rulesVersion: stringOrNull(lineage.rulesVersion),
    sourceContextHash: stringOrNull(lineage.sourceContextHash),
    sourceRegistryVersion: stringOrNull(lineage.sourceRegistryVersion),
    configurationKey: stringOrNull(lineage.configurationKey),
    technique: stringOrNull(lineage.technique),
    phaseContractVersion: Number.isInteger(lineage.phaseContractVersion) ? lineage.phaseContractVersion : null,
  };
  if (normalized.phaseContractVersion === 2) {
    normalized.sourceId = stringOrNull(lineage.sourceId);
    normalized.sourceRevision = lineage.sourceRevision;
    normalized.clockOrigin = stringOrNull(lineage.clockOrigin);
    normalized.adaptationId = stringOrNull(lineage.adaptationId);
  }
  return normalized;
}

function normalizeLegacySourceTiming(snapshot, lineage) {
  const sourceId = stringOrNull(snapshot.sourceId);
  const sourceRevision = snapshot.sourceRevision;
  const clockOrigin = stringOrNull(snapshot.clockOrigin);
  const adaptationId = stringOrNull(snapshot.adaptationId);
  const events = snapshot.sourceEvents;
  if (snapshot.timingRecordVersion !== 2 || lineage.phaseContractVersion !== 2
    || snapshot.targetMs !== null || snapshot.completionKind !== 'userFinished'
    || !sourceId || !Number.isInteger(sourceRevision) || sourceRevision < 1
    || (clockOrigin !== null && !Object.hasOwn(MANUAL_SOURCE_CLOCK_EVENTS, clockOrigin))
    || !stringOrNull(snapshot.configurationKey) || snapshot.configurationKey !== lineage.configurationKey
    || !lineage.sourceRegistryVersion || sourceId !== lineage.sourceId
    || sourceRevision !== lineage.sourceRevision || clockOrigin !== lineage.clockOrigin
    || !adaptationId || adaptationId !== lineage.adaptationId
    || !events || typeof events !== 'object' || Array.isArray(events)) return null;

  const firstWater = events['first-water'];
  const finish = events['extraction:complete'];
  const anchor = clockOrigin === null ? firstWater : events[MANUAL_SOURCE_CLOCK_EVENTS[clockOrigin]];
  if (![firstWater, finish, anchor].every((value) => Number.isSafeInteger(value) && value >= 0)
    || finish < firstWater || anchor < firstWater || anchor > finish
    || finish - firstWater !== snapshot.actualElapsedMs) return null;
  for (const [name, atMs] of Object.entries(events)) {
    if (!name.trim() || !Number.isSafeInteger(atMs) || atMs < firstWater || atMs > finish) return null;
    if (name.endsWith(':complete')) {
      const started = events[`${name.slice(0, -':complete'.length)}:start`];
      if (started != null && started > atMs) return null;
    }
  }
  const range = snapshot.sourceFinishRangeSeconds;
  if (range != null && (!object(range) || !finiteNonNegative(range.minSeconds)
    || !finiteNonNegative(range.maxSeconds) || range.maxSeconds < range.minSeconds)) return null;
  const corrections = normalizeSourceCorrections(snapshot.sourceCorrections, firstWater, finish);
  if (corrections == null) return null;
  return {
    timingRecordVersion: 2,
    sourceId,
    sourceRevision,
    clockOrigin,
    adaptationId,
    sourceEvents: clone(events),
    ...(corrections.length ? { sourceCorrections: corrections } : {}),
    sourceFinishRangeSeconds: range == null ? null : { minSeconds: range.minSeconds, maxSeconds: range.maxSeconds },
    targetMs: null,
  };
}

function validSourceEventName(name) {
  return name === 'first-water' || name === 'extraction:complete'
    || /^[A-Za-z0-9][A-Za-z0-9_-]*:(?:start|complete|observed)$/.test(name);
}

function normalizeSourceConfiguration(value, device, mode) {
  if (!object(value)) return null;
  const configDevice = stringOrNull(value.device || value.brewer);
  const configMode = value.mode === 'iced' ? 'iced' : value.mode === 'hot' ? 'hot' : null;
  if (!configDevice || !configMode || configMode !== mode) return null;
  const normalizedDevice = configDevice === 'switch' ? 'v60' : configDevice;
  if (!['v60', 'kalita'].includes(normalizedDevice) || normalizedDevice !== device) return null;
  if (normalizedDevice === 'kalita' && value.size != null && !['155', '185'].includes(String(value.size))) return null;
  if (normalizedDevice === 'v60' && value.variant != null && !['classic', 'switch'].includes(String(value.variant))) return null;
  return clone(value);
}

function normalizeSourceCorrections(corrections, firstWater, finish) {
  if (corrections == null) return [];
  if (!Array.isArray(corrections)) return null;
  const normalized = [];
  for (const correction of corrections) {
    if (!object(correction) || !stringOrNull(correction.stageId)
      || !Number.isSafeInteger(correction.withdrawnAtMs) || !Number.isSafeInteger(correction.correctedAtMs)
      || correction.withdrawnAtMs < firstWater || correction.correctedAtMs < correction.withdrawnAtMs
      || correction.correctedAtMs > finish) return null;
    normalized.push({
      stageId: correction.stageId,
      withdrawnAtMs: correction.withdrawnAtMs,
      correctedAtMs: correction.correctedAtMs,
    });
  }
  return normalized;
}

/**
 * Source projections have no authored fixed finish for some guides. Their
 * completion event therefore carries `targetMs: null`; this is a versioned
 * source record, not permission for legacy timing events to omit a target.
 */
function normalizeCurrentSourceTiming(snapshot, lineage, device, mode) {
  if (snapshot.timingRecordVersion !== 2 || lineage.phaseContractVersion !== null
    || snapshot.completionKind !== 'userFinished' || !Object.hasOwn(snapshot, 'targetMs')
    || (snapshot.targetMs !== null && !finitePositive(snapshot.targetMs))) return null;

  const sourceId = stringOrNull(snapshot.sourceId);
  const sourceRevision = snapshot.sourceRevision;
  const configurationKey = stringOrNull(snapshot.configurationKey);
  const clockOrigin = stringOrNull(snapshot.clockOrigin);
  const sourceConfiguration = normalizeSourceConfiguration(snapshot.sourceConfiguration, device, mode);
  if (!sourceId || !Number.isInteger(sourceRevision) || sourceRevision < 1
    || !configurationKey || !sourceConfiguration
    || (clockOrigin !== null && !Object.hasOwn(MANUAL_SOURCE_CLOCK_EVENTS, clockOrigin))
    || manualSourceConfigurationKey(sourceConfiguration) !== configurationKey
    || lineage.profile !== `source:${sourceId}@${sourceRevision}`
    || lineage.engineVersion !== MANUAL_SOURCE_PROJECTION_VERSION
    || lineage.rulesVersion !== String(MANUAL_SOURCE_RECORD_VERSION)
    || lineage.configurationKey !== configurationKey) return null;

  const events = snapshot.sourceEvents;
  if (!object(events) || !Object.hasOwn(events, 'first-water')
    || !Object.hasOwn(events, 'extraction:complete')) return null;
  const firstWater = events['first-water'];
  const finish = events['extraction:complete'];
  const eventNames = Object.keys(events);
  if (eventNames[0] !== 'first-water' || eventNames.at(-1) !== 'extraction:complete'
    || ![firstWater, finish].every((value) => Number.isSafeInteger(value) && value >= 0)
    || finish < firstWater || finish - firstWater !== snapshot.actualElapsedMs) return null;

  let latest = firstWater;
  let previousAt = -1;
  for (const [name, atMs] of Object.entries(events)) {
    if (!validSourceEventName(name) || !Number.isSafeInteger(atMs) || atMs < firstWater || atMs > finish || atMs < previousAt) return null;
    previousAt = atMs;
    latest = Math.max(latest, atMs);
    if (name.endsWith(':complete') && name !== 'extraction:complete') {
      const startName = `${name.slice(0, -':complete'.length)}:start`;
      const started = events[startName];
      if (started == null || started > atMs || eventNames.indexOf(startName) > eventNames.indexOf(name)) return null;
    }
    if (name.endsWith(':observed')) {
      const startName = `${name.slice(0, -':observed'.length)}:start`;
      if (!Object.hasOwn(events, startName) || eventNames.indexOf(name) > eventNames.indexOf(startName)) return null;
    }
  }
  if (latest !== finish) return null;

  const corrections = normalizeSourceCorrections(snapshot.sourceCorrections, firstWater, finish);
  if (corrections == null) return null;
  const range = snapshot.sourceFinishRangeSeconds;
  if (range != null && (!object(range) || !finiteNonNegative(range.minSeconds)
    || !finiteNonNegative(range.maxSeconds) || range.maxSeconds < range.minSeconds)) return null;
  return {
    timingRecordVersion: 2,
    sourceId,
    sourceRevision,
    clockOrigin,
    sourceConfiguration,
    sourceEvents: clone(events),
    sourceCorrections: corrections,
    sourceFinishRangeSeconds: range == null ? null : { minSeconds: range.minSeconds, maxSeconds: range.maxSeconds },
    targetMs: snapshot.targetMs === null ? null : Math.round(snapshot.targetMs),
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
  const v60Variant = snapshot?.v60Variant == null ? null : String(snapshot.v60Variant);
  const configurationKey = stringOrNull(snapshot?.configurationKey);
  const attemptId = stringOrNull(snapshot?.attemptId);
  const revisionId = stringOrNull(snapshot?.revisionId);
  const isLegacySourceTiming = lineage?.phaseContractVersion === 2;
  const isCurrentSourceTiming = snapshot?.timingRecordVersion === 2 && !isLegacySourceTiming;
  const sourceTiming = lineage && (isLegacySourceTiming
    ? normalizeLegacySourceTiming(snapshot, lineage)
    : isCurrentSourceTiming ? normalizeCurrentSourceTiming(snapshot, lineage, device, mode) : null);
  const sourceConfig = sourceTiming?.sourceConfiguration;
  const sourceVariant = sourceConfig?.variant === 'switch' ? 'switch' : 'classic';
  const eventKalitaSize = isCurrentSourceTiming && device === 'kalita' && sourceConfig?.size != null
    ? String(sourceConfig.size) : kalitaSize;
  const eventV60Variant = isCurrentSourceTiming && device === 'v60' ? sourceVariant : v60Variant;

  if (!sessionId || !beanId || !device || !mode || !COMPLETION_KINDS.has(completionKind)
    || !finitePositive(doseGrams) || !finiteNonNegative(actualElapsedMs)
    || (isCurrentSourceTiming ? !sourceTiming : isLegacySourceTiming ? !sourceTiming : !finitePositive(targetMs)) || !lineage
    || (configurationKey && configurationKey.length > 120)
    || (eventKalitaSize != null && !['155', '185'].includes(eventKalitaSize))
    || (eventV60Variant != null && !['classic', 'switch'].includes(eventV60Variant))) {
    return null;
  }

  const createdAt = finiteNonNegative(snapshot?.createdAt) ? snapshot.createdAt : Date.now();
  return {
    sessionId,
    beanId,
    device,
    kalitaSize: device === 'kalita' ? eventKalitaSize : null,
    v60Variant: device === 'v60' ? (eventV60Variant || 'classic') : null,
    mode,
    attemptId,
    revisionId,
    configurationKey,
    doseGrams,
    actualElapsedMs: Math.round(actualElapsedMs),
    targetMs: sourceTiming ? sourceTiming.targetMs : Math.round(targetMs),
    completionKind,
    createdAt: Math.round(createdAt),
    lineage,
    ...(sourceTiming || {}),
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
  // A source session's physical event ledger is immutable after completion;
  // retries must not replace its source identity or confirmed timestamps.
  const existing = normalized.find((item) => item.sessionId === event.sessionId);
  if (existing && (existing.timingRecordVersion === 2 || event.timingRecordVersion === 2)) {
    return normalized.slice(0, boundedLimit);
  }
  return [event, ...normalized.filter((existing) => existing.sessionId !== event.sessionId)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, boundedLimit);
}

export function timingContextFromRecipe({ beanId, recipe, mode = 'hot' } = {}) {
  const sourceProjection = object(recipe?.sourceProjection) ? recipe.sourceProjection : null;
  if (sourceProjection) {
    const sourceConfiguration = object(sourceProjection.sourceConfiguration)
      ? clone(sourceProjection.sourceConfiguration) : null;
    const sourceId = stringOrNull(sourceProjection.sourceId);
    const sourceRevision = sourceProjection.sourceRevision;
    const sourceDevice = sourceConfiguration?.device === 'switch' ? 'v60' : sourceConfiguration?.device;
    const sourceMode = sourceProjection.mode === 'iced' ? 'iced' : sourceProjection.mode === 'hot' ? 'hot' : mode === 'iced' ? 'iced' : 'hot';
    const sourceVariant = sourceConfiguration?.variant === 'switch' || sourceConfiguration?.device === 'switch' ? 'switch' : 'classic';
    const sourceFinish = object(sourceProjection.finish)
      && finiteNonNegative(sourceProjection.finish.minSeconds)
      && finiteNonNegative(sourceProjection.finish.maxSeconds)
      && sourceProjection.finish.maxSeconds >= sourceProjection.finish.minSeconds
      ? clone(sourceProjection.finish) : null;
    const sourceTargetMs = sourceFinish && finitePositive(sourceFinish.maxSeconds * 1000)
      ? sourceFinish.maxSeconds * 1000 : null;
    const sourceLineage = sourceId && Number.isInteger(sourceRevision) && sourceRevision > 0
      ? {
        profile: `source:${sourceId}@${sourceRevision}`,
        engineVersion: stringOrNull(sourceProjection.projectionVersion),
        rulesVersion: sourceProjection.sourceRecordVersion == null ? null : String(sourceProjection.sourceRecordVersion),
        sourceContextHash: stringOrNull(sourceProjection.sourceFingerprint),
        sourceRegistryVersion: null,
        configurationKey: stringOrNull(sourceProjection.configurationKey),
        technique: null,
        phaseContractVersion: null,
      } : null;
    return {
      beanId: stringOrNull(beanId),
      device: stringOrNull(sourceDevice) || stringOrNull(recipe?.device) || 'v60',
      kalitaSize: sourceDevice === 'kalita' && sourceConfiguration?.size != null ? String(sourceConfiguration.size) : null,
      v60Variant: sourceDevice === 'v60' ? sourceVariant : null,
      mode: sourceMode,
      configurationKey: stringOrNull(sourceProjection.configurationKey),
      clockOrigin: stringOrNull(sourceProjection.clock?.origin),
      doseGrams: finitePositive(sourceProjection.coffeeGrams) ? sourceProjection.coffeeGrams : null,
      targetMs: sourceTargetMs,
      timingRecordVersion: 2,
      sourceId,
      sourceRevision,
      sourceConfiguration,
      sourceFinishRangeSeconds: sourceFinish,
      lineage: sourceLineage,
    };
  }

  // Keep timing history written by the retired source adapter readable. It is
  // distinct from the current sourceProjection envelope and never weakens the
  // legacy positive-target requirement below.
  const legacySourceContext = recipe?.phaseContractVersion === 2 ? {
    timingRecordVersion: 2,
    sourceId: stringOrNull(recipe?.sourceId),
    sourceRevision: recipe?.sourceRevision,
    clockOrigin: stringOrNull(recipe?.manualExecution?.clock?.origin),
    adaptationId: stringOrNull(recipe?.adaptation?.id),
    sourceFinishRangeSeconds: recipe?.manualExecution?.finish || null,
  } : null;
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
    v60Variant: recipe?.device === 'v60' ? (recipe?.variant === 'switch' ? 'switch' : 'classic') : null,
    mode: mode === 'iced' ? 'iced' : 'hot',
    configurationKey: stringOrNull(recipe?.configurationKey || recipe?.sourceLineage?.configurationKey),
    doseGrams: finitePositive(doseGrams) ? doseGrams : null,
    targetMs: legacySourceContext ? null : finitePositive(targetMs) ? targetMs : null,
    ...(legacySourceContext || {}),
    lineage: profile ? {
      profile,
      engineVersion: stringOrNull(recipe?.engineVersion),
      rulesVersion: stringOrNull(recipe?.rulesVersion),
      sourceContextHash: stringOrNull(recipe?.sourceContextHash),
      sourceRegistryVersion: stringOrNull(recipe?.sourceRegistryVersion || recipe?.sourceLineage?.sourceRegistryVersion),
      configurationKey: stringOrNull(recipe?.configurationKey || recipe?.sourceLineage?.configurationKey),
      technique: stringOrNull(recipe?.technique || recipe?.sourceLineage?.technique),
      phaseContractVersion: Number.isInteger(recipe?.phaseContractVersion) ? recipe.phaseContractVersion : null,
      ...(legacySourceContext ? {
        sourceId: legacySourceContext.sourceId,
        sourceRevision: legacySourceContext.sourceRevision,
        clockOrigin: legacySourceContext.clockOrigin,
        adaptationId: legacySourceContext.adaptationId,
      } : {}),
    } : null,
  };
}

function sameBaseConfiguration(event, context) {
  return event.beanId === context.beanId
    && event.device === context.device
    && event.kalitaSize === context.kalitaSize
    && event.v60Variant === context.v60Variant
    && event.mode === context.mode
    && event.lineage.profile === context.lineage?.profile
    && event.lineage.engineVersion === context.lineage?.engineVersion
    && event.lineage.rulesVersion === context.lineage?.rulesVersion
    && event.lineage.sourceContextHash === context.lineage?.sourceContextHash
    && event.configurationKey === context.lineage?.configurationKey
    && event.lineage.sourceRegistryVersion === context.lineage?.sourceRegistryVersion
    && event.lineage.technique === context.lineage?.technique
    && event.lineage.phaseContractVersion === context.lineage?.phaseContractVersion
    && (event.timingRecordVersion !== 2 || (context.timingRecordVersion === 2
      && event.sourceId === context.sourceId
      && event.sourceRevision === context.sourceRevision
      && (event.lineage.phaseContractVersion === 2
        ? event.clockOrigin === context.clockOrigin
          && event.adaptationId === context.adaptationId
          && event.lineage.sourceId === context.lineage?.sourceId
          && event.lineage.sourceRevision === context.lineage?.sourceRevision
          && event.lineage.clockOrigin === context.lineage?.clockOrigin
          && event.lineage.adaptationId === context.lineage?.adaptationId
        : event.clockOrigin === context.clockOrigin
          && stableStringify(event.sourceConfiguration) === stableStringify(context.sourceConfiguration))));
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
  // Cross-dose timing remains stored for auditability, but v1 never shows it
  // as a comparable "last brew" or uses it to train a different dose.
  if (!exact.length) return null;
  const mostRecent = exact[0];
  const values = exact.map((event) => event.actualElapsedMs).sort((a, b) => a - b);
  const range = values.length >= 3 ? {
    minMs: values[0],
    maxMs: values[values.length - 1],
    medianMs: values[Math.floor(values.length / 2)],
    sampleCount: values.length,
  } : null;
  return {
    event: mostRecent,
    isExactDose: true,
    range,
  };
}

export function formatTimingMs(ms) {
  if (!finiteNonNegative(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
