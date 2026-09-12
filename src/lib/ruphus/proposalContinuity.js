import { canonicalHash } from './contracts.js';

// The review projection is provider context, not an action payload. Keep the
// existing session bounds (four recent reviews and twelve schedule stages),
// and whitelist every value that crosses that boundary.
const REVIEW_LIMIT = 4;
const STAGE_LIMIT = 12;
const TEXT_LIMIT = 500;
const NATIVE_WATER_UNITS = new Set(['g', 'mL']);
const TEMPERATURE_UNITS = new Set(['C', 'F']);
const REVIEW_STATUSES = new Set(['proposed', 'applying', 'applied', 'kept', 'attempt_created', 'stale', 'superseded', 'archived', 'unavailable']);

const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

function safeText(value, max = TEXT_LIMIT) {
  if (typeof value !== 'string') return null;
  // Marker-like text cannot close or impersonate a provider context block.
  // This only removes control/marker text; source-authored quantities and
  // prose are never regex-rewritten.
  const withoutControls = value.split('').map(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  return withoutControls
    .replace(/(?:---|```|<script|javascript:)/gi, '')
    .slice(0, max)
    .trim() || null;
}

function safeReference(value) {
  return safeText(value, 180);
}

function safeNumberOrRange(value) {
  if (isFiniteNumber(value)) return value;
  if (!isObject(value) || !isFiniteNumber(value.min) || !isFiniteNumber(value.max) || value.min > value.max) return null;
  return { min: value.min, max: value.max };
}

function typedQuantity(value, unit) {
  if (!NATIVE_WATER_UNITS.has(unit)) return null;
  const normalized = safeNumberOrRange(value);
  return normalized == null ? null : { value: normalized, unit };
}

function typedTemperature(value, unit, description = null) {
  if (!TEMPERATURE_UNITS.has(unit)) return null;
  const normalized = safeNumberOrRange(value);
  if (normalized == null && !safeText(description)) return null;
  return {
    ...(normalized == null ? {} : { value: normalized }),
    unit,
    ...(safeText(description) ? { description: safeText(description) } : {}),
  };
}

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeNativeGrind(value) {
  if (typeof value === 'string') return safeText(value);
  if (!isObject(value)) return null;
  const result = {};
  for (const key of ['grinder', 'setting', 'generation']) {
    const text = safeText(value[key], 180);
    if (text) result[key] = text;
  }
  return Object.keys(result).length ? result : null;
}

function safeTextList(value, max = 180) {
  if (!Array.isArray(value)) return null;
  const result = value.map(item => safeText(item, max)).filter(Boolean);
  return result.length ? result : null;
}

function sourceWaterFromObject(value, fallbackUnit = null) {
  if (!isObject(value)) return null;
  const explicit = typedQuantity(value.value, value.unit || fallbackUnit);
  if (explicit) return explicit;
  const grams = typedQuantity(value.brewGrams, 'g');
  if (grams) return grams;
  return typedQuantity(value.brewMilliliters, 'mL');
}

function recipeWater(recipe, projection) {
  if (projection && Object.hasOwn(projection, 'water')) {
    // A canonical projection owns the value even when it explicitly records
    // an unknown quantity; do not fall through to an adapted legacy field.
    return sourceWaterFromObject(projection.water);
  }
  // Some persisted source proposals retain the source-native unit marker but
  // only have the older top-level waterGrams alias after serialization. The
  // marker is an authenticated source field, so preserve that unit instead of
  // presenting the alias as a mass to the provider.
  const nativeUnit = NATIVE_WATER_UNITS.has(recipe?.sourceNativeWaterUnit)
    ? recipe.sourceNativeWaterUnit
    : null;
  const executionWater = sourceWaterFromObject(recipe?.sourceExecution?.water, nativeUnit);
  if (executionWater) return executionWater;
  const directWater = sourceWaterFromObject(recipe?.water, nativeUnit);
  if (directWater) return directWater;
  if (nativeUnit === 'mL') {
    if (recipe?.waterMilliliters != null) return typedQuantity(recipe.waterMilliliters, 'mL');
    if (recipe?.waterGrams != null) return typedQuantity(recipe.waterGrams, 'mL');
  }
  if (nativeUnit === 'g') {
    if (recipe?.waterGrams != null) return typedQuantity(recipe.waterGrams, 'g');
    if (recipe?.waterMilliliters != null) return typedQuantity(recipe.waterMilliliters, 'mL');
  }
  if (recipe?.waterMilliliters != null) return typedQuantity(recipe.waterMilliliters, 'mL');
  if (recipe?.waterGrams != null) return typedQuantity(recipe.waterGrams, 'g');
  if (recipe?.water != null) return typedQuantity(recipe.water, recipe.waterUnit === 'mL' ? 'mL' : nativeUnit || 'g');
  return null;
}

function recipeTemperature(recipe, projection) {
  // An explicit null is meaningful for sources such as HARIO's Switch manual:
  // numeric temperature was not authored. Preserve that unknown rather than
  // importing a generated recipe temperature from a different contract.
  const candidate = projection && Object.hasOwn(projection, 'temperature')
    ? projection.temperature
    : recipe?.sourceExecution?.temperature ?? recipe?.temperature;
  if (projection && Object.hasOwn(projection, 'temperature') && candidate == null) return null;
  if (isObject(candidate)) {
    const typed = typedTemperature(candidate.value, candidate.unit, candidate.description);
    if (typed) return typed;
  }
  const waterTemp = recipe?.waterTemp;
  if (isObject(waterTemp) && isFiniteNumber(waterTemp.celsius)) return typedTemperature(waterTemp.celsius, 'C');
  if (recipe?.temperatureC != null) return typedTemperature(recipe.temperatureC, 'C');
  if (typeof recipe?.temperature === 'number') return typedTemperature(recipe.temperature, 'C');
  return null;
}

function sourceStages(recipe, projection) {
  if (Array.isArray(projection?.stages)) return projection.stages;
  if (Array.isArray(recipe?.sourceExecution?.stages)) return recipe.sourceExecution.stages;
  return Array.isArray(recipe?.steps) ? recipe.steps : [];
}

function stageWater(stage, fallbackUnit = 'g') {
  if (isObject(stage?.water)) {
    const explicit = typedQuantity(stage.water.value, stage.water.unit);
    if (explicit) return explicit;
  }
  const grams = typedQuantity(stage?.waterToGrams, 'g');
  if (grams) return grams;
  const milliliters = typedQuantity(stage?.waterToMilliliters, 'mL');
  if (milliliters) return milliliters;
  if (stage?.waterTotal != null) return typedQuantity(stage.waterTotal, stage.waterUnit || fallbackUnit);
  return null;
}

function safeTrigger(trigger) {
  if (!isObject(trigger) || typeof trigger.type !== 'string') return null;
  const type = safeText(trigger.type, 40);
  if (!type) return null;
  if (type === 'elapsed') {
    return isFiniteNumber(trigger.seconds) ? { type, seconds: trigger.seconds } : { type };
  }
  if (type === 'after') {
    return {
      type,
      ...(safeText(trigger.event, 120) ? { event: safeText(trigger.event, 120) } : {}),
      ...(isFiniteNumber(trigger.seconds) ? { seconds: trigger.seconds } : {}),
    };
  }
  if (type === 'condition') {
    return {
      type,
      ...(safeText(trigger.condition) ? { condition: safeText(trigger.condition) } : {}),
      ...(safeText(trigger.afterStage, 120) ? { afterStage: safeText(trigger.afterStage, 120) } : {}),
    };
  }
  return { type };
}

function stageSummary(stage, fallbackUnit) {
  if (!isObject(stage)) return null;
  const water = stageWater(stage, fallbackUnit);
  const trigger = safeTrigger(stage.trigger);
  const time = safeText(stage.time, 80);
  const action = safeText(stage.action ?? stage.label);
  const label = safeText(stage.label);
  const timeSeconds = isFiniteNumber(stage.timeSeconds)
    ? stage.timeSeconds
    : trigger?.type === 'elapsed' && isFiniteNumber(trigger.seconds) ? trigger.seconds : null;
  const durationSeconds = safeNumberOrRange(stage.durationSeconds);
  const summary = {
    ...(safeReference(stage.id) ? { id: safeReference(stage.id) } : {}),
    ...(safeText(stage.kind, 40) ? { kind: safeText(stage.kind, 40) } : {}),
    ...(label ? { label } : {}),
    ...(time ? { time } : {}),
    ...(timeSeconds == null ? {} : { timeSeconds }),
    ...(durationSeconds == null ? {} : { durationSeconds }),
    ...(trigger ? { trigger } : {}),
    ...(action ? { action } : {}),
    ...(water ? { water } : {}),
    ...(water?.unit === 'g' ? { waterTotal: water.value } : {}),
    ...(safeText(stage.geometry) ? { geometry: safeText(stage.geometry) } : {}),
    ...(safeText(stage.agitation) ? { agitation: safeText(stage.agitation) } : {}),
    ...(stage.valve === 'open' || stage.valve === 'closed' ? { valve: stage.valve } : {}),
  };
  return Object.keys(summary).length ? summary : null;
}

function sourceLineage(recipe, projection) {
  const lineage = isObject(projection?.sourceLineage)
    ? projection.sourceLineage
    : isObject(recipe?.sourceLineage) ? recipe.sourceLineage : {};
  const sourceIds = Array.isArray(lineage.sourceIds)
    ? lineage.sourceIds.map(safeReference).filter(Boolean)
    : [];
  const result = Object.fromEntries([
    ['sourceId', safeReference(projection?.sourceId ?? recipe?.sourceId ?? lineage.sourceId)],
    ['sourceRevision', Number.isInteger(projection?.sourceRevision ?? recipe?.sourceRevision ?? lineage.sourceRevision) ? (projection?.sourceRevision ?? recipe?.sourceRevision ?? lineage.sourceRevision) : null],
    ['familyId', safeReference(lineage.familyId)],
    ['technique', safeReference(lineage.technique)],
    ['title', safeText(projection?.sourceSnapshot?.title ?? lineage.title)],
    ['author', safeText(projection?.sourceSnapshot?.author ?? lineage.author)],
    ['url', safeUrl(projection?.sourceSnapshot?.source?.url ?? lineage.url)],
    ['status', safeText(lineage.status, 40)],
    ['adaptation', safeText(lineage.adaptation)],
  ].filter(([, value]) => value != null).concat(sourceIds.length ? [['sourceIds', sourceIds]] : []));
  return Object.keys(result).length ? result : null;
}

function sourceMetadata(recipe, projection) {
  const lineage = sourceLineage(recipe, projection);
  const source = projection?.sourceSnapshot?.source;
  const rawEquipment = projection
    ? { ...(isObject(projection.sourceConfiguration) ? projection.sourceConfiguration : {}), ...(isObject(projection.equipment) ? projection.equipment : {}) }
    : null;
  const equipment = isObject(rawEquipment) ? Object.fromEntries([
    ['brewer', safeReference(rawEquipment.brewer ?? rawEquipment.device)],
    ['size', safeReference(rawEquipment.size)],
    ['model', safeReference(rawEquipment.model)],
    ['filter', safeReference(rawEquipment.filter)],
    ['material', safeReference(rawEquipment.material)],
    ['mode', safeReference(rawEquipment.mode)],
  ].filter(([, value]) => value != null)) : null;
  const clockOrigin = projection && Object.hasOwn(projection, 'clock')
    ? safeText(projection.clock?.origin, 80)
    : safeText(recipe?.clock?.origin, 80);
  const result = Object.fromEntries([
    ['sourceId', safeReference(projection?.sourceId ?? recipe?.sourceId ?? lineage?.sourceId)],
    ['sourceRevision', Number.isInteger(projection?.sourceRevision ?? recipe?.sourceRevision ?? lineage?.sourceRevision) ? (projection?.sourceRevision ?? recipe?.sourceRevision ?? lineage?.sourceRevision) : null],
    ['title', safeText(projection?.sourceSnapshot?.title ?? source?.title ?? lineage?.title)],
    ['author', safeText(projection?.sourceSnapshot?.author ?? source?.author ?? lineage?.author)],
    ['url', safeUrl(source?.url ?? lineage?.url)],
    ['projectionVersion', safeReference(projection?.projectionVersion)],
    ['sourceRecordVersion', Number.isInteger(projection?.sourceRecordVersion) ? projection.sourceRecordVersion : null],
    ['configurationKey', safeReference(projection?.configurationKey ?? recipe?.configurationKey)],
    ['clockOrigin', clockOrigin],
    ['equipment', equipment && Object.keys(equipment).length ? equipment : null],
  ].filter(([, value]) => value != null));
  return Object.keys(result).length ? result : null;
}

function sourceReadiness(projection) {
  if (!isObject(projection)) return null;
  const readiness = isObject(projection.readiness) ? projection.readiness : {};
  const result = Object.fromEntries([
    ['sourceValid', typeof readiness.sourceValid === 'boolean' ? readiness.sourceValid : null],
    ['admitted', typeof readiness.admitted === 'boolean' ? readiness.admitted : null],
    ['guided', typeof readiness.guided === 'boolean' ? readiness.guided : null],
    ['compatible', typeof readiness.compatible === 'boolean' ? readiness.compatible : null],
    ['timerReady', typeof readiness.timerReady === 'boolean' ? readiness.timerReady : typeof projection.timerReady === 'boolean' ? projection.timerReady : null],
    ['blockers', safeTextList(readiness.blockers)],
    ['timingBlockers', safeTextList(readiness.timingBlockers)],
    ['admissionBlockers', safeTextList(readiness.admissionBlockers)],
  ].filter(([, value]) => value != null));
  return Object.keys(result).length ? result : null;
}

function sourceAdaptation(projection) {
  if (!isObject(projection?.adaptation)) return null;
  const adaptation = projection.adaptation;
  const result = Object.fromEntries([
    ['version', Number.isInteger(adaptation.version) ? adaptation.version : null],
    ['status', safeText(adaptation.status, 40)],
    ['timing', safeText(adaptation.timing, 80)],
    ['sourceDose', safeNumberOrRange(adaptation.sourceDose)],
    ['sourceDoseSelection', safeNumberOrRange(adaptation.sourceDoseSelection)],
    ['requestedDose', safeNumberOrRange(adaptation.requestedDose)],
    ['factor', isFiniteNumber(adaptation.factor) ? adaptation.factor : null],
    ['notes', safeTextList(adaptation.notes)],
    ['disclosure', safeText(adaptation.disclosure)],
  ].filter(([, value]) => value != null));
  if (Array.isArray(adaptation.changes)) {
    const changes = adaptation.changes.map(change => {
      if (!isObject(change)) return null;
      const path = safeReference(change.path);
      const reason = safeText(change.reason);
      return path ? { path, ...(reason ? { reason } : {}) } : null;
    }).filter(Boolean);
    if (changes.length) result.changes = changes;
  }
  return Object.keys(result).length ? result : null;
}

function sourceFinish(recipe, projection) {
  const finish = projection && Object.hasOwn(projection, 'finish')
    ? projection.finish
    : recipe?.sourceExecution?.finish ?? recipe?.finish;
  if (!isObject(finish) || !isFiniteNumber(finish.minSeconds) || !isFiniteNumber(finish.maxSeconds) || finish.minSeconds > finish.maxSeconds) return null;
  return { minSeconds: finish.minSeconds, maxSeconds: finish.maxSeconds };
}

function sourceTiming(recipe, projection) {
  const finish = sourceFinish(recipe, projection);
  const guideRange = Array.isArray(recipe?.guideRangeSeconds) && recipe.guideRangeSeconds.length === 2
    && recipe.guideRangeSeconds.every(isFiniteNumber) ? [...recipe.guideRangeSeconds] : null;
  const clockOrigin = projection && Object.hasOwn(projection, 'clock')
    ? safeText(projection.clock?.origin, 80)
    : safeText(recipe?.clock?.origin, 80);
  const timingVersion = safeReference(recipe?.timingVersion ?? recipe?.sourceTimingVersion ?? projection?.timingVersion ?? recipe?.timingProfile);
  if (!finish && !guideRange && !clockOrigin && !timingVersion) return null;
  return {
    ...(clockOrigin ? { clockOrigin } : {}),
    ...(finish ? { finish } : {}),
    ...(guideRange ? { guideRangeSeconds: guideRange } : {}),
    ...(timingVersion ? { timingVersion } : {}),
  };
}

function grindSummary(recipe, projection) {
  const grind = projection?.grind ?? recipe?.grind;
  const setting = recipe?.grindSize?.setting ?? (typeof grind === 'string' || isFiniteNumber(grind) ? grind : null);
  const description = safeText(projection?.grind?.description ?? recipe?.grindSize?.description ?? (isObject(grind) ? grind.description : null));
  const native = safeNativeGrind(projection?.grind?.native ?? (isObject(grind) ? grind.native : null));
  const result = {
    ...(typeof setting === 'string' ? { setting: safeText(setting) } : isFiniteNumber(setting) ? { setting } : {}),
    ...(description ? { description } : {}),
    ...(native ? { native } : {}),
  };
  return Object.keys(result).length ? result : null;
}

function safeTechniqueExperiment(experiment) {
  if (!isObject(experiment)) return null;
  const result = Object.fromEntries([
    ['kind', safeText(experiment.kind, 80)],
    ['techniqueId', safeReference(experiment.techniqueId)],
    ['familyId', safeReference(experiment.familyId)],
    ['sourceId', safeReference(experiment.sourceId)],
    ['name', safeText(experiment.name)],
    ['sourceRegistryVersion', safeReference(experiment.sourceRegistryVersion)],
    ['adaptation', safeText(experiment.adaptation)],
  ].filter(([, value]) => value != null));
  if (Array.isArray(experiment.differences)) {
    const differences = experiment.differences.map(value => safeText(value)).filter(Boolean);
    if (differences.length) result.differences = differences;
  }
  return Object.keys(result).length ? result : null;
}

/**
 * Provider-safe recipe facts. Native water units stay typed (`g` or `mL`),
 * ranges stay ranges, and source stage prose is carried without quantity
 * substitution. This is deliberately not a timer or action contract.
 */
export function recipeSummary(recipe = {}) {
  const projection = isObject(recipe?.sourceProjection) ? recipe.sourceProjection : null;
  const water = recipeWater(recipe, projection);
  const temperature = recipeTemperature(recipe, projection);
  const stages = sourceStages(recipe, projection);
  const fallbackUnit = water?.unit || 'g';
  const steps = stages.map(stage => stageSummary(stage, fallbackUnit)).filter(Boolean).slice(0, STAGE_LIMIT);
  const dose = safeNumberOrRange(recipe?.coffeeGrams ?? recipe?.dose ?? recipe?.userCoffeeGrams ?? projection?.coffeeGrams);
  const ratio = isFiniteNumber(recipe?.ratio) || isObject(recipe?.ratio) ? safeNumberOrRange(recipe.ratio) : safeText(recipe?.ratio);
  const source = sourceMetadata(recipe, projection);
  const lineage = sourceLineage(recipe, projection);
  const timing = sourceTiming(recipe, projection);
  const readiness = sourceReadiness(projection);
  const adaptation = sourceAdaptation(projection);
  const waterAdditionsIncludingBloom = projection
    ? steps.filter(step => step.water && (!step.kind || step.kind === 'pour')).length
    : steps.filter(step => step.water).length;
  const grind = grindSummary(recipe, projection);
  const temperatureC = temperature?.unit === 'C' && isFiniteNumber(temperature.value) ? temperature.value : null;
  const summary = {
    technique: safeText(recipe?.techniqueLabel ?? recipe?.technique),
    dose,
    water,
    ratio,
    grind,
    ...(temperature ? { temperature } : {}),
    ...(temperatureC == null ? {} : { temperatureC }),
    ...(projection ? {} : { totalBrewTime: safeText(recipe?.totalBrewTime, 80) }),
    ...(projection ? {} : { totalBrewTimeSeconds: safeNumberOrRange(recipe?.totalBrewTimeSeconds ?? recipe?.guideTargetSeconds) }),
    ...(!projection && Array.isArray(recipe?.guideRangeSeconds) ? { guideRangeSeconds: recipe.guideRangeSeconds.filter(isFiniteNumber).slice(0, 2) } : {}),
    waterAdditionsIncludingBloom,
    scheduleNote: 'Source stage triggers and prose are preserved; a finish range or observation cue is not converted into an exact drawdown timestamp.',
    ...(source ? { source } : {}),
    ...(lineage ? { sourceLineage: lineage } : {}),
    ...(timing ? { timing } : {}),
    ...(readiness ? { readiness } : {}),
    ...(adaptation ? { adaptation } : {}),
    steps,
  };
  return summary;
}

export const summarizeRecipeForReview = recipeSummary;

// Only call with the authenticated server session, never request-body artifacts.
export function recentProposalReviews(session, refs = {}, binding = {}) {
  const boundaryIndex = Number.isInteger(session?.boundaryIndex) ? Math.max(0, session.boundaryIndex) : 0;
  const messages = Array.isArray(session?.messages) ? session.messages.slice(boundaryIndex) : [];
  const ownerRefs = Object.entries(refs || {}).filter(([, coffeeId]) => typeof coffeeId === 'string');
  let ordinal = 0;
  const reviews = messages
    .flatMap(message => Array.isArray(message?.artifacts) ? message.artifacts : [])
    .filter(item => item?.type === 'recipe_proposal' && item?.historyOnly !== true && isObject(item.before) && isObject(item.after))
    .map(item => {
      const coffeeRef = ownerRefs.find(([, coffeeId]) => coffeeId === item.coffeeId)?.[0];
      if (!coffeeRef || (binding.coffeeRef && binding.coffeeRef !== coffeeRef) || (binding.slot && binding.slot !== item.slotKey)) return null;
      ordinal += 1;
      const proposed = recipeSummary(item.after);
      const experiment = safeTechniqueExperiment(item.techniqueExperiment);
      const status = REVIEW_STATUSES.has(item.status) ? item.status : 'proposed';
      const proposalId = safeReference(item.id);
      const sourceId = safeReference(proposed.source?.sourceId ?? proposed.sourceLineage?.sourceId);
      const sourceRevisionValue = proposed.source?.sourceRevision ?? proposed.sourceLineage?.sourceRevision;
      const sourceRevision = Number.isInteger(sourceRevisionValue) ? sourceRevisionValue : safeReference(sourceRevisionValue);
      const timingVersion = safeReference(proposed.timing?.timingVersion);
      return {
        ordinal,
        ...(proposalId ? { proposalId, artifactId: proposalId } : {}),
        ...(safeReference(item.sessionId) ? { sessionId: safeReference(item.sessionId) } : {}),
        coffeeRef,
        slot: safeReference(item.slotKey),
        status,
        name: safeText(item.techniqueExperiment?.name) || proposed.technique,
        ...(experiment ? { techniqueExperiment: experiment } : {}),
        ...(safeReference(item.sourceRevisionId) ? { sourceRevisionId: safeReference(item.sourceRevisionId) } : {}),
        ...(sourceId ? { sourceId } : {}),
        ...(sourceRevision ? { sourceRevision } : {}),
        ...(timingVersion ? { timingVersion } : {}),
        ...(safeReference(item.sourceHash) ? { sourceHash: safeReference(item.sourceHash) } : {}),
        ...(safeReference(item.recipeHash) ? { recipeHash: safeReference(item.recipeHash) } : {}),
        before: recipeSummary(item.before),
        proposed,
        comparisonBasis: 'Saved recipe when this review was prepared; not proof of a save.',
      };
    })
    .filter(Boolean);
  return reviews.slice(-REVIEW_LIMIT);
}

export const isAlternativeRequest = text => /\b(?:different|another|alternative)\b/i.test(text)
  && !/\b(?:how|why|explain|compare|difference)\b/i.test(text);

export function sameRecipeReview(left, right) {
  return canonicalHash(recipeSummary(left)) === canonicalHash(recipeSummary(right));
}
