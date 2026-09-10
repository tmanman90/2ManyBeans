// Original-source facts live outside generation rules. Validation establishes
// structural coherence, never authenticity, cup quality, or tested transfers.
export const MANUAL_SOURCE_RECORD_VERSION = 1;

const BREWERS = new Set(['kalita', 'v60', 'switch', 'chemex', 'aeropress', 'french-press']);
const STAGE_KINDS = new Set(['pour', 'agitate', 'valve', 'press', 'dilute', 'finish']);
const CLOCK_ORIGINS = new Set(['first-water', 'after-bloom-pour', 'after-main-pour']);
export const MANUAL_SOURCE_CLOCK_EVENTS = Object.freeze({
  'first-water': 'first-water',
  'after-bloom-pour': 'bloom:complete',
  'after-main-pour': 'main-pour:complete',
});
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const bounds = (value) => finite(value) ? [value, value] : [value?.min, value?.max];
const validQuantity = (value, minimum = 0) => {
  const [min, max] = bounds(value);
  return finite(min) && finite(max) && min >= minimum && max >= min;
};
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function freezeManualSources(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeManualSources);
    Object.freeze(value);
  }
  return value;
}

export function validateManualSourceRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { valid: false, errors: ['invalid-record'] };
  for (const key of ['id', 'title', 'author']) if (!hasText(record[key])) errors.push(`missing-${key}`);
  if (!Number.isInteger(record.revision) || record.revision < 1) errors.push('invalid-revision');
  try {
    const url = new URL(record.source?.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) errors.push('invalid-source-url');
  } catch { errors.push('invalid-source-url'); }
  if (!validDate(record.source?.accessedAt)) errors.push('invalid-access-date');
  if (record.source?.publishedAt != null && !validDate(record.source.publishedAt)) errors.push('invalid-publication-date');
  if (!['primary-text', 'primary-video-description', 'primary-video'].includes(record.source?.verification)) errors.push('invalid-verification-kind');
  if (!hasText(record.source?.locator)) errors.push('missing-source-locator');
  if (!BREWERS.has(record.equipment?.brewer)) errors.push('unsupported-brewer');
  if (!['hot', 'iced'].includes(record.mode)) errors.push('invalid-mode');
  if (!validQuantity(record.coffeeGrams, Number.MIN_VALUE)) errors.push('invalid-coffee');
  if (record.equipment?.size === 'any' && (!Array.isArray(record.equipment.supportedSizes) || !record.equipment.supportedSizes.length)) errors.push('missing-author-supported-sizes');
  if (record.equipment?.supportedFiltersBySize != null) {
    for (const [size, filters] of Object.entries(record.equipment.supportedFiltersBySize)) {
      if (!record.equipment.supportedSizes?.includes(size) || !Array.isArray(filters) || !filters.length || !filters.every(hasText)) errors.push('invalid-author-supported-filters');
    }
  }

  const water = record.water || {};
  const hasMass = validQuantity(water.brewGrams, Number.MIN_VALUE);
  const hasVolume = validQuantity(water.brewMilliliters, Number.MIN_VALUE);
  if (hasMass === hasVolume) errors.push('ambiguous-or-missing-brew-water-unit');
  for (const key of ['bypassGrams', 'iceGrams', 'servingIceGrams', 'yieldGrams']) {
    if (water[key] != null && !validQuantity(water[key])) errors.push(`invalid-${key}`);
  }
  if (record.mode === 'hot' && bounds(water.iceGrams)[1] > 0) errors.push('hot-recipe-with-brew-ice');
  if (record.mode === 'iced' && !(bounds(water.iceGrams)[1] > 0)) errors.push('missing-brew-ice');
  if (bounds(water.iceGrams)[1] > 0 && !['server', 'after-brew'].includes(water.icePlacement)) errors.push('missing-ice-placement');
  const temp = record.temperature;
  if (temp != null) {
    if (!['C', 'F'].includes(temp.unit)) errors.push('invalid-temperature-unit');
    if (temp.value != null && !validQuantity(temp.value)) errors.push('invalid-temperature');
    if (temp.value == null && !hasText(temp.description)) errors.push('missing-qualitative-temperature');
  }
  if (!record.grind || !Object.hasOwn(record.grind, 'description') || !Object.hasOwn(record.grind, 'microns') || !Object.hasOwn(record.grind, 'native')) errors.push('missing-grind-provenance');
  if (record.grind?.microns != null && !validQuantity(record.grind.microns, Number.MIN_VALUE)) errors.push('invalid-source-microns');
  if (!Array.isArray(record.unknowns)) errors.push('missing-unknowns');
  if (!Array.isArray(record.applicability?.roasts) || !Array.isArray(record.applicability?.beans) || !hasText(record.applicability?.notes)) errors.push('missing-applicability');
  if (record.clock?.origin !== null && !CLOCK_ORIGINS.has(record.clock?.origin)) errors.push('invalid-clock-origin');
  if (!['ready', 'research-only'].includes(record.admission?.status) || !Array.isArray(record.admission?.blockers)) errors.push('invalid-admission');
  if (record.admission?.status === 'research-only' && !record.admission.blockers?.length) errors.push('missing-admission-blocker');
  if (record.admission?.status === 'ready' && record.admission.blockers?.length) errors.push('ready-with-blockers');

  const ids = new Set();
  const stages = Array.isArray(record.stages) ? record.stages : [];
  if (!stages.length) errors.push('missing-stages');
  const clockEvent = MANUAL_SOURCE_CLOCK_EVENTS[record.clock?.origin];
  if (clockEvent?.endsWith(':complete')) {
    const anchorId = clockEvent.slice(0, -9);
    const anchorIndex = stages.findIndex((stage) => stage?.id === anchorId);
    if (anchorIndex < 0) errors.push('missing-source-clock-anchor');
    else if (stages.some((stage, index) => index <= anchorIndex && stage?.trigger?.type === 'elapsed')) errors.push('circular-source-clock-anchor');
  }
  let lastWater = [0, 0];
  let lastAbsolute = -1;
  for (const stage of stages) {
    const prefix = stage?.id || 'stage';
    if (!hasText(stage?.id) || ids.has(stage.id)) errors.push(`${prefix}:invalid-stage-id`);
    if (!STAGE_KINDS.has(stage?.kind) || !hasText(stage?.label)) errors.push(`${prefix}:invalid-stage`);
    if (stage?.kind === 'finish' && stage !== stages.at(-1)) errors.push(`${prefix}:finish-before-final-stage`);
    if (stage?.temperature != null && (!['C', 'F'].includes(stage.temperature.unit) || !validQuantity(stage.temperature.value))) errors.push(`${prefix}:invalid-stage-temperature`);
    const trigger = stage?.trigger;
    if (trigger?.type === 'elapsed') {
      if (!finite(trigger.seconds) || trigger.seconds < 0 || trigger.seconds < lastAbsolute) errors.push(`${prefix}:invalid-checkpoint`);
      lastAbsolute = trigger.seconds;
      if (record.clock?.origin == null && record.admission?.status === 'ready') errors.push(`${prefix}:unknown-clock`);
    } else if (trigger?.type === 'after') {
      const prior = typeof trigger.event === 'string' && trigger.event.endsWith(':complete') ? trigger.event.slice(0, -9) : null;
      if (!ids.has(prior) || !finite(trigger.seconds) || trigger.seconds < 0) errors.push(`${prefix}:invalid-event-anchor`);
    } else if (trigger?.type === 'condition') {
      if (!hasText(trigger.condition) || (trigger.afterStage != null && !ids.has(trigger.afterStage))) errors.push(`${prefix}:invalid-condition`);
    } else if (trigger?.type !== 'manual') errors.push(`${prefix}:invalid-trigger`);
    if (stage?.durationSeconds != null && !validQuantity(stage.durationSeconds)) errors.push(`${prefix}:invalid-pour-duration`);
    for (const field of ['geometry', 'agitation', 'valve']) {
      if (!Object.hasOwn(stage || {}, field)) errors.push(`${prefix}:missing-${field}`);
    }
    if (stage?.valve != null && !['open', 'closed'].includes(stage.valve)) errors.push(`${prefix}:invalid-valve-state`);
    if (stage?.valve != null && record.equipment?.brewer !== 'switch') errors.push(`${prefix}:valve-on-non-switch`);
    const waterValue = hasMass ? stage?.waterToGrams : stage?.waterToMilliliters;
    const otherWater = hasMass ? stage?.waterToMilliliters : stage?.waterToGrams;
    if (otherWater != null && (!water.mixedStageUnits || waterValue != null || !validQuantity(otherWater))) errors.push(`${prefix}:mixed-water-units`);
    if (waterValue != null) {
      const next = bounds(waterValue);
      if (!validQuantity(waterValue) || next[0] < lastWater[0] || next[1] < lastWater[1]) errors.push(`${prefix}:invalid-water-sequence`);
      lastWater = next;
    }
    if (stage?.kind === 'pour' && waterValue == null && !(water.mixedStageUnits && validQuantity(otherWater))) errors.push(`${prefix}:missing-pour-water`);
    ids.add(stage?.id);
  }
  const target = bounds(hasMass ? water.brewGrams : water.brewMilliliters);
  if (lastWater[0] !== target[0] || lastWater[1] !== target[1]) errors.push('final-brew-water-mismatch');
  if (record.finish != null && (!finite(record.finish.minSeconds) || !finite(record.finish.maxSeconds)
    || record.finish.minSeconds < 0 || record.finish.maxSeconds < record.finish.minSeconds)) errors.push('invalid-finish-range');
  return { valid: errors.length === 0, errors };
}

// An exact-source lookup, not a popularity score or an adaptation engine.
// Unknown models never grant permission to transfer a recipe to known hardware.
export function manualSourceEligibility(record, configuration = {}) {
  const validation = validateManualSourceRecord(record);
  const reasons = [...validation.errors];
  if (record?.admission?.status !== 'ready') reasons.push('research-only');
  if (record?.equipment?.brewer !== configuration.brewer) reasons.push('brewer-mismatch');
  if (record?.mode !== configuration.mode) reasons.push('mode-mismatch');
  for (const key of ['size', 'model', 'filter', 'material', 'orientation']) {
    const original = record?.equipment?.[key];
    const selected = configuration[key];
    if (key === 'filter' && record?.equipment?.supportedFiltersBySize) {
      if (!record.equipment.supportedFiltersBySize[configuration.size]?.includes(selected)) reasons.push('unsupported-filter-for-size');
    } else if (key === 'size' && original === 'any') {
      if (!record.equipment.supportedSizes?.includes(selected)) reasons.push('unsupported-size');
    } else if (original != null && original !== selected) reasons.push(`different-or-missing-${key}`);
    else if (original == null && selected != null) reasons.push(`unverified-${key}-transfer`);
  }
  const [minDose, maxDose] = bounds(record?.coffeeGrams);
  if (!finite(configuration.coffeeGrams) || configuration.coffeeGrams < minDose || configuration.coffeeGrams > maxDose) reasons.push('dose-adaptation-required');
  if (minDose !== maxDose) reasons.push('source-range-choice-required');
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}

// Factual preview uses the original unit and wording. Deliberately not the
// legacy timer recipe shape: callers cannot launch an old timer by accident.
export function manualSourcePreview(record) {
  const result = validateManualSourceRecord(record);
  if (!result.valid) throw new Error(`Invalid manual source: ${result.errors.join(', ')}`);
  return structuredClone({
    sourceId: record.id, sourceRevision: record.revision, title: record.title,
    author: record.author, sourceUrl: record.source.url, equipment: record.equipment,
    source: record.source, applicability: record.applicability,
    manufacturerContext: record.manufacturerContext || null,
    mode: record.mode, coffeeGrams: record.coffeeGrams, water: record.water,
    temperature: record.temperature, grind: record.grind, clock: record.clock,
    stages: record.stages, finish: record.finish, preparation: record.preparation || [],
    aftercare: record.aftercare || [], unknowns: record.unknowns, admission: record.admission,
    timerReady: false,
  });
}
