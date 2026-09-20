// Pure projection primitives for source-backed Ruphus proposals.
//
// This module deliberately has no registry, recipe-engine, persistence, UI or
// provider imports. A caller supplies one audited source record and receives a
// self-contained snapshot. Source-native mass/volume units and valve states
// remain typed all the way through the projection; no mL-to-g conversion is
// attempted.

import {
  MANUAL_SOURCE_RECORD_VERSION,
  freezeManualSources,
  validateManualSourceRecord,
} from './manualRecipeContract.js';
import { manualGuidanceReadiness } from './manualGuidance.js';
import {
  GRINDER_LABELS,
  GRINDER_MICRON_SCALES,
  descriptorForMicrons,
  grinderSettingToMicrons,
  odeStepToGrinderSetting,
  quantizeGrinderSetting,
} from './brewMethods.js';

export const MANUAL_SOURCE_PROJECTION_VERSION = 'ruphus-manual-source-projection-v1';
export const MANUAL_SOURCE_ADAPTATION_VERSION = 1;
export const MANUAL_SOURCE_GRIND_ENVELOPE_VERSION = 'ruphus-source-grind-envelope-v1';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;
const clone = (value) => structuredClone(value);
const unique = (values) => [...new Set(values.filter(Boolean))];

/**
 * Resolve a source micron note into a useful physical setting for the
 * selected grinder. The source measurement is intentionally retained as an
 * approximate secondary detail: its measurement protocol and equivalence to
 * another grinder are not author-verified. A grinder without one of the
 * app's calibrated scales receives qualitative/source guidance only.
 */
export function manualSourceGrindGuidance(grind, preferences = {}) {
  const sourceMicrons = finite(grind?.microns) ? grind.microns : null;
  const sourceDescription = grind?.description || (sourceMicrons == null ? null : descriptorForMicrons(sourceMicrons));
  const grinderKey = preferences?.grinder || null;
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || null;
  const scale = grinderKey ? GRINDER_MICRON_SCALES[grinderKey] : null;

  if (sourceMicrons == null) {
    return {
      status: sourceDescription ? 'qualitative' : 'unknown',
      sourceMicrons: null,
      sourceDescription,
      grinderKey,
      grinderName,
      setting: null,
      settingMicrons: null,
      approximate: false,
      displayMode: preferences?.grindSizeDisplay === 'microns' ? 'microns' : 'qualitative',
    };
  }

  if (!scale) {
    return {
      status: 'source-microns-only',
      sourceMicrons,
      sourceDescription,
      grinderKey,
      grinderName,
      setting: null,
      settingMicrons: null,
      approximate: false,
      displayMode: 'microns',
    };
  }

  // Use the existing Ode calibration as the common coordinate bridge, then
  // quantize through the existing grinder adapter so Ode labels stay physical
  // whole/.2/.6 steps and click grinders keep their native notation.
  const odeScale = GRINDER_MICRON_SCALES['fellow-ode-gen2'];
  const odeCoordinate = 1 + ((sourceMicrons - odeScale.base) / odeScale.perStep);
  const odeStep = quantizeGrinderSetting(odeCoordinate, 'fellow-ode-gen2');
  const translated = odeStepToGrinderSetting(odeStep, grinderKey);
  return {
    status: 'approximate',
    sourceMicrons,
    sourceDescription,
    grinderKey,
    grinderName: grinderName || translated.label || null,
    setting: translated.setting == null ? null : String(translated.setting),
    settingMicrons: translated.microns ?? grinderSettingToMicrons(translated.setting, grinderKey) ?? sourceMicrons,
    approximate: true,
    displayMode: preferences?.grindSizeDisplay === 'microns' ? 'microns' : 'setting',
  };
}

/**
 * Quantize an already-resolved physical micron target for the selected
 * grinder. Baseline selection and bean adjustment stay with the recipe
 * adapters; this helper only owns the existing source/grinder conversion.
 */
export function manualSourceGrindSize(targetMicrons, preferences = {}) {
  if (!finite(targetMicrons)) return null;
  const guidance = manualSourceGrindGuidance({
    microns: targetMicrons,
    description: descriptorForMicrons(targetMicrons),
  }, preferences);
  const resolvedMicrons = guidance.settingMicrons ?? targetMicrons;
  return {
    setting: guidance.setting,
    microns: resolvedMicrons,
    description: descriptorForMicrons(resolvedMicrons),
    grinderSpecific: guidance.setting != null,
    sourceExact: false,
  };
}

/**
 * Build the mutable recipe-envelope grind while leaving the immutable source
 * projection untouched. The caller supplies a technique-appropriate baseline
 * and an adjustment from the existing method adapter.
 */
export function buildManualSourceGrindEnvelope({
  baselineMicrons,
  adjustmentMicrons = 0,
  baselineKind,
  baselineLabel = null,
  grinder = null,
  intent = {},
} = {}) {
  if (!finite(baselineMicrons)) return null;
  const adjustment = finite(Number(adjustmentMicrons)) ? Number(adjustmentMicrons) : 0;
  const targetMicrons = Math.max(300, Math.min(1200, baselineMicrons + adjustment));
  return {
    grindSize: manualSourceGrindSize(targetMicrons, { grinder }),
    grindAdaptation: {
      version: MANUAL_SOURCE_GRIND_ENVELOPE_VERSION,
      baselineKind: baselineKind || 'source-microns',
      baselineMicrons,
      ...(baselineLabel ? { baselineLabel } : {}),
      adjustmentMicrons: adjustment,
      targetMicrons,
      grinder: grinder || null,
      evidenceHash: intent?.evidenceHash || null,
      reasonCodes: Array.isArray(intent?.reasonCodes) ? [...intent.reasonCodes] : [],
      approximate: true,
      disclosure: 'App starting point: the named technique baseline plus the existing bean adjustment, converted approximately for the selected grinder.',
    },
  };
}

// Firestore may return map keys in a different order. Projection arrays keep
// their order, but their object members are semantic maps, not ordered data.
function sameSourceValue(first, second) {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first) && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => sameSourceValue(value, second[index]));
  }
  if (first && typeof first === 'object' && second && typeof second === 'object') {
    const firstKeys = Object.keys(first);
    const secondKeys = Object.keys(second);
    return firstKeys.length === secondKeys.length
      && firstKeys.every((key) => Object.hasOwn(second, key) && sameSourceValue(first[key], second[key]));
  }
  return false;
}

function quantityBounds(value) {
  if (finite(value)) return [value, value];
  if (value && finite(value.min) && finite(value.max) && value.min >= 0 && value.max >= value.min) {
    return [value.min, value.max];
  }
  return null;
}

function scaleQuantity(value, factor) {
  if (finite(value)) return Math.round(value * factor * 100) / 100;
  if (value && finite(value.min) && finite(value.max)) {
    return {
      min: Math.round(value.min * factor * 100) / 100,
      max: Math.round(value.max * factor * 100) / 100,
    };
  }
  return value;
}

function formatQuantity(value) {
  return finite(value) ? String(Math.round(value * 100) / 100) : null;
}

function quantityEndpoints(value) {
  if (finite(value)) return [{ source: value, target: null }];
  if (value && finite(value.min) && finite(value.max)) {
    return [
      { source: value.min, target: null },
      { source: value.max, target: null },
    ];
  }
  return [];
}

function subtractQuantity(value, previous) {
  if (finite(value) && finite(previous)) return value - previous;
  if (value && finite(value.min) && finite(value.max) && finite(previous)) {
    return { min: value.min - previous, max: value.max - previous };
  }
  if (value && finite(value.min) && finite(value.max)
    && previous && finite(previous.min) && finite(previous.max)) {
    return { min: value.min - previous.min, max: value.max - previous.max };
  }
  return null;
}

function quantityEntries(source, target) {
  const targetValues = quantityEndpoints(target).map(({ source: value }) => value);
  return quantityEndpoints(source).map(({ source: value }, index) => ({
    source: value,
    target: targetValues[index] ?? targetValues[0] ?? null,
  })).filter(({ target }) => finite(target));
}

// Source stage labels are executable copy in the preview/timer, not merely
// decorative names. Replace only the exact water quantity owned by this stage;
// this deliberately leaves temperatures, times, rates and unrelated numbers
// alone. Incremental labels are supported only when their same-unit cumulative
// typed water checkpoints establish the delta unambiguously.
function scaledStageLabel(label, originalStage, originalValue, nextValue, previousOriginalValue = null, previousNextValue = null) {
  if (typeof label !== 'string') return label;
  const unitPattern = originalStage?.waterToGrams != null
    ? '(?:grams?|g)'
    : originalStage?.waterToMilliliters != null
      ? '(?:mL|millilit(?:er|re)s?)'
      : null;
  if (!unitPattern) return label;
  const cumulativeEntries = quantityEntries(originalValue, nextValue);
  const originalDelta = previousOriginalValue == null ? null : subtractQuantity(originalValue, previousOriginalValue);
  const nextDelta = previousNextValue == null ? null : subtractQuantity(nextValue, previousNextValue);
  const deltaEntries = quantityEntries(originalDelta, nextDelta);
  if (!cumulativeEntries.length && !deltaEntries.length) return label;

  const candidates = [...deltaEntries.map((entry) => ({ ...entry, kind: 'delta' })), ...cumulativeEntries.map((entry) => ({ ...entry, kind: 'cumulative' }))];
  const pickCandidate = (value, before, preferDelta = false) => {
    const matching = candidates.filter((entry) => Math.abs(entry.source - value) < 0.000001);
    if (!matching.length) return null;
    const cumulativeContext = /\b(?:to|total|reaching|remaining(?: water)? to)\s*$/.test(before);
    const deltaContext = /(?:\badd|\bwith|\bpour|\bbloom|\bfirst|\bpulse)\s*$/.test(before)
      && !cumulativeContext;
    return cumulativeContext
      ? (matching.find((entry) => entry.kind === 'cumulative') || matching[0])
      : (deltaContext || preferDelta)
        ? (matching.find((entry) => entry.kind === 'delta') || matching[0])
        : (matching.find((entry) => entry.kind === 'cumulative') || matching[0]);
  };
  const rangeMatcher = new RegExp(`(?<![\\w.])([0-9]+(?:\\.[0-9]+)?)(\\s*)([–-])(\\s*)([0-9]+(?:\\.[0-9]+)?)(\\s*)(${unitPattern})\\b`, 'gi');
  const rangeReplacements = [];
  let nextLabel = label.replace(rangeMatcher, (match, firstRaw, firstSpacing, dash, secondSpacing, secondRaw, unitSpacing, unit, offset, wholeLabel) => {
    if (/^\s*(?:\/|per\s+(?:second|minute))/i.test(wholeLabel.slice(offset + match.length))) return match;
    const before = wholeLabel.slice(Math.max(0, offset - 32), offset).toLowerCase();
    const first = pickCandidate(Number(firstRaw), before);
    const second = pickCandidate(Number(secondRaw), before);
    if (!first || !second) return match;
    const replacement = `${formatQuantity(first.target)}${firstSpacing}${dash}${secondSpacing}${formatQuantity(second.target)}${unitSpacing}${unit}`;
    const placeholder = `\uE000${rangeReplacements.length}\uE001`;
    rangeReplacements.push(replacement);
    return placeholder;
  });
  const matcher = new RegExp(`(?<![\\w.])([0-9]+(?:\\.[0-9]+)?)(\\s*)(${unitPattern})\\b`, 'gi');
  nextLabel = nextLabel.replace(matcher, (match, rawValue, spacing, unit, offset, wholeLabel) => {
    const value = Number(rawValue);
    const before = wholeLabel.slice(Math.max(0, offset - 32), offset).toLowerCase();
    const after = wholeLabel.slice(offset + match.length, offset + match.length + 16).toLowerCase();
    if (/^\s*(?:\/|per\s+(?:second|minute))/i.test(after)) return match;
    const selected = pickCandidate(value, before, /^(?:\s*(?:total|cumulative)\b)/.test(after));
    if (!selected) return match;
    const formatted = formatQuantity(selected.target);
    return formatted == null ? match : `${formatted}${spacing}${unit}`;
  });
  return nextLabel.replace(/\uE000(\d+)\uE001/g, (match, index) => rangeReplacements[Number(index)] || match);
}

function sourceBrewer(configuration = {}) {
  return configuration.device === 'v60' && configuration.variant === 'switch'
    ? 'switch'
    : configuration.device || configuration.brewer || null;
}

export function sourceBrewerForConfiguration(configuration = {}) {
  return sourceBrewer(configuration);
}

export function manualSourceConfigurationKey(configuration = {}) {
  const brewer = sourceBrewer(configuration) || 'unknown';
  return [
    brewer,
    configuration.size ?? 'source-size',
    configuration.model ?? 'source-model',
    configuration.filter ?? 'source-filter',
    configuration.mode ?? 'hot',
  ].map((part) => String(part).replace(/[^\w:-]/g, '-')).join(':');
}

function expectedEquipment(configuration = {}) {
  return {
    brewer: sourceBrewer(configuration),
    size: configuration.size == null ? null : String(configuration.size),
    model: configuration.model ?? null,
    filter: configuration.filter ?? null,
    material: configuration.material ?? null,
    mode: configuration.mode || 'hot',
  };
}

/**
 * Check exact source-to-product identity without treating an unknown source
 * field as permission to transfer it to a known device. Omitted configuration
 * fields stay omitted; once a caller names a size/model/filter/material, the
 * source must identify that field or the result is incompatible.
 */
export function manualSourceCompatibility(record, configuration = {}) {
  const expected = expectedEquipment(configuration);
  const structural = validateManualSourceRecord(record);
  const reasons = [...structural.errors];
  const equipment = record?.equipment || {};

  if (expected.brewer && equipment.brewer !== expected.brewer) reasons.push('brewer-mismatch');
  if (expected.mode && record?.mode !== expected.mode) reasons.push('mode-mismatch');

  if (expected.size != null) {
    if (equipment.size === 'any') {
      if (!equipment.supportedSizes?.includes(expected.size)) reasons.push('unsupported-size');
    } else if (equipment.size == null) {
      reasons.push('unverified-size-transfer');
    } else if (String(equipment.size) !== expected.size) {
      reasons.push('different-size');
    }
  }

  if (expected.model != null) {
    if (equipment.model == null) reasons.push('unverified-model-transfer');
    else if (equipment.model !== expected.model) reasons.push('different-model');
  }

  if (expected.filter != null) {
    const allowed = equipment.supportedFiltersBySize?.[expected.size];
    if (allowed) {
      if (!allowed.includes(expected.filter)) reasons.push('unsupported-filter-for-size');
    } else if (equipment.filter == null) {
      reasons.push('unverified-filter-transfer');
    } else if (equipment.filter !== expected.filter) {
      reasons.push('different-filter');
    }
  }

  if (expected.material != null) {
    if (equipment.material == null) reasons.push('unverified-material-transfer');
    else if (equipment.material !== expected.material) reasons.push('different-material');
  }

  return {
    compatible: reasons.length === 0,
    reasons: unique(reasons),
    expected,
    actual: {
      brewer: equipment.brewer ?? null,
      size: equipment.size ?? null,
      model: equipment.model ?? null,
      filter: equipment.filter ?? null,
      material: equipment.material ?? null,
      mode: record?.mode ?? null,
    },
  };
}

export function manualSourceReadiness(record) {
  const structural = validateManualSourceRecord(record);
  const guidance = manualGuidanceReadiness(record);
  const admitted = record?.admission?.status === 'ready';
  const blockers = unique([
    ...structural.errors,
    ...(admitted ? [] : ['source-not-admitted']),
    ...(finite(record?.coffeeGrams) ? [] : ['source-dose-range-unresolved']),
    ...guidance.blockers,
  ]);
  return {
    sourceValid: structural.valid,
    admitted,
    guided: guidance.ready,
    timerReady: structural.valid && admitted && guidance.ready && finite(record?.coffeeGrams),
    blockers,
    structuralErrors: structural.errors,
    admissionBlockers: record?.admission?.blockers ? [...record.admission.blockers] : [],
    timingBlockers: guidance.blockers,
  };
}

export function listManualSourceRecords(records, configuration = {}, options = {}) {
  if (!Array.isArray(records)) return [];
  const includeReferenceOnly = options.includeReferenceOnly === true;
  return records.filter((record) => {
    const compatibility = manualSourceCompatibility(record, configuration);
    if (!compatibility.compatible) return false;
    if (includeReferenceOnly) return true;
    return manualSourceReadiness(record).timerReady;
  });
}

function recordWater(record) {
  const water = record?.water || {};
  if (water.brewGrams != null) return { value: clone(water.brewGrams), unit: 'g' };
  if (water.brewMilliliters != null) return { value: clone(water.brewMilliliters), unit: 'mL' };
  return null;
}

/**
 * Derive the consumer-facing source checkpoints without changing the trusted
 * projection or its source hash. Older persisted projections simply derive
 * the same view on demand, so this remains backwards compatible.
 */
export function manualSourceDisplay(projection) {
  const execution = projection?.sourceExecution || projection;
  const changes = projection?.adaptation?.changes || [];
  const waterChanged = changes.some((change) => /^water\.|^stages\.\d+\.waterTo/.test(change.path));
  const water = recordWater(execution);
  const displayWater = waterChanged && water
    ? { ...water, value: roundedConsumerQuantity(water.value) }
    : water;
  return {
    water: displayWater,
    stages: consumerDisplayStages(execution, waterChanged),
  };
}

function stageWater(stage) {
  if (stage?.waterToGrams != null) return { value: clone(stage.waterToGrams), unit: 'g' };
  if (stage?.waterToMilliliters != null) return { value: clone(stage.waterToMilliliters), unit: 'mL' };
  return null;
}

function typedStages(execution) {
  return (execution.stages || []).map((stage) => ({
    id: stage.id,
    kind: stage.kind,
    label: stage.label,
    trigger: clone(stage.trigger),
    durationSeconds: stage.durationSeconds == null ? null : clone(stage.durationSeconds),
    water: stageWater(stage),
    geometry: stage.geometry ?? null,
    agitation: stage.agitation ?? null,
    valve: stage.valve ?? null,
  }));
}

const roundedConsumerQuantity = (value) => {
  if (finite(value)) return Math.round(value);
  if (value && finite(value.min) && finite(value.max)) {
    return { min: Math.round(value.min), max: Math.round(value.max) };
  }
  return value;
};

// Source projections retain their precise adapted values for lineage and
// replay. Consumer guidance uses one rounded cumulative checkpoint sequence,
// with the last checkpoint forced to the rounded displayed total so the card
// and timer can never disagree about the target. Each checkpoint is derived
// from the original source value and adaptation factor; no rounded checkpoint
// is reused as the next input.
function consumerDisplayStages(execution, shouldRound) {
  const stages = typedStages(execution);
  if (!shouldRound) return stages;
  const total = recordWater(execution);
  const lastByUnit = new Map();
  stages.forEach((stage, index) => {
    if (stage.water?.unit) lastByUnit.set(stage.water.unit, index);
  });
  const previousRawByUnit = new Map();
  const previousDisplayByUnit = new Map();
  return stages.map((stage, index) => {
    if (!stage.water?.unit) return stage;
    const unit = stage.water.unit;
    const raw = stage.water.value;
    const previousRaw = previousRawByUnit.get(unit) ?? null;
    const previousDisplay = previousDisplayByUnit.get(unit) ?? null;
    const rounded = index === lastByUnit.get(unit) && total?.unit === unit
      ? roundedConsumerQuantity(total.value)
      : roundedConsumerQuantity(raw);
    const nextLabel = scaledStageLabel(stage.label, {
      waterToGrams: unit === 'g' ? raw : null,
      waterToMilliliters: unit === 'mL' ? raw : null,
    }, raw, rounded, previousRaw, previousDisplay);
    previousRawByUnit.set(unit, raw);
    previousDisplayByUnit.set(unit, rounded);
    return {
      ...stage,
      label: nextLabel,
      water: { ...stage.water, value: rounded },
    };
  });
}

function addChange(changes, path, original, value, reason) {
  if (JSON.stringify(original) === JSON.stringify(value)) return;
  changes.push({ path, original: clone(original), value: clone(value), reason });
}

function applyDoseAdaptation(execution, sourceDose, dose, changes, options = {}) {
  const originalDose = options.originalDose ?? sourceDose;
  const rangeSelection = options.rangeSelection === true;
  if (sourceDose == null) {
    return {
      factor: null,
      timingReady: false,
      notes: ['Source coffee dose is a range; projection preserves the range until an explicit sourceDoseSelection is supplied.'],
      disclosure: 'Source coffee-dose range preserved; no exact-dose timing is asserted.',
    };
  }
  const factor = dose / sourceDose;
  if (factor === 1 && !rangeSelection) return { factor, timingReady: true, notes: [], disclosure: null };

  addChange(changes, 'coffeeGrams', originalDose, dose, rangeSelection
    ? 'Explicit sourceDoseSelection resolves the author-provided dose range.'
    : 'Explicit caller-selected dose adaptation.');
  execution.coffeeGrams = dose;

  for (const key of ['brewGrams', 'brewMilliliters', 'bypassGrams', 'iceGrams', 'servingIceGrams', 'yieldGrams']) {
    if (execution.water?.[key] == null) continue;
    const original = execution.water[key];
    const value = scaleQuantity(original, factor);
    addChange(changes, `water.${key}`, original, value, 'Scale the source quantity with the explicit dose adaptation; preserve native units.');
    execution.water[key] = value;
  }

  const previousByUnit = new Map();
  execution.stages.forEach((stage, index) => {
    const originalStage = clone(stage);
    const originalWater = stageWater(originalStage);
    const previous = originalWater ? previousByUnit.get(originalWater.unit) : null;
    for (const key of ['waterToGrams', 'waterToMilliliters']) {
      if (stage[key] == null) continue;
      const original = stage[key];
      const value = scaleQuantity(original, factor);
      addChange(changes, `stages.${index}.${key}`, original, value, 'Scale the source stage quantity; do not convert its unit.');
      stage[key] = value;
    }
    if (typeof stage.label === 'string' && originalWater) {
      const nextWater = stageWater(stage);
      const label = scaledStageLabel(stage.label, originalStage, originalWater.value, nextWater?.value,
        previous?.value ?? null, previous?.nextValue ?? null);
      if (label !== stage.label) {
        addChange(changes, `stages.${index}.label`, stage.label, label, 'Keep executable source-stage copy aligned with the explicitly scaled typed quantity; preserve original wording in sourceSnapshot.');
        stage.label = label;
      }
    }
    if (originalWater) previousByUnit.set(originalWater.unit, {
      value: originalWater.value,
      nextValue: stageWater(stage)?.value,
    });
    if (stage.durationSeconds != null) {
      addChange(changes, `stages.${index}.durationSeconds`, stage.durationSeconds, null, 'Source duration is not validated at the changed dose.');
      stage.durationSeconds = null;
    }
  });

  return {
    factor,
    timingReady: false,
    notes: [rangeSelection
      ? `Selected ${dose}g from the author's ${originalDose.min}–${originalDose.max}g source range; source timing still requires explicit validation.`
      : `Scaled from ${sourceDose}g to ${dose}g. Source timing requires explicit validation at this dose.`],
    disclosure: 'Water amounts and step wording are adjusted for this coffee dose while preserving the source units and event anchors. The original recipe wording remains available for comparison; this is an app adaptation, not an author-validated timing claim.',
  };
}

function sourceTemperatureCelsius(temperature) {
  if (!temperature || typeof temperature !== 'object') return null;
  const value = temperature.value;
  if (finite(value)) return String(temperature.unit || '').toUpperCase() === 'F' ? (value - 32) * 5 / 9 : value;
  return null;
}

function sourceControlNumber(value) {
  if (finite(value)) return value;
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function sourceRatioNumber(value) {
  const ratio = String(value ?? '').match(/(?:1\s*[:/]\s*)?(\d+(?:\.\d+)?)/);
  return ratio ? Number(ratio[1]) : null;
}

// Apply only controls whose semantics are present in the source record. This
// deliberately keeps sourceSnapshot untouched and never derives a mass from
// a volume-native source. A volume-native ratio changes the authored mL
// checkpoints in mL (never by adding a grams alias), while mixed-unit stages
// retain their own native units.
function applySourceControls(execution, dose, changes, controls = {}, options = {}) {
  const accepted = {};
  const requestedRatio = sourceRatioNumber(controls.ratio);
  if (controls.ratio != null) {
    if (!positive(requestedRatio) || requestedRatio < 10 || requestedRatio > 25) {
      throw new ManualSourceProjectionError('invalid-source-ratio', 'Choose a source ratio between 1:10 and 1:25.');
    }
    accepted.ratio = requestedRatio;
    const nativeWater = recordWater(execution);
    if (!['g', 'mL'].includes(nativeWater?.unit) || !finite(dose) || dose <= 0) {
      throw new ManualSourceProjectionError('source-ratio-adaptation-unsupported', 'This source does not publish an exact native water total and dose that can be safely adapted to that ratio.');
    }
    const targetWater = Math.round(dose * requestedRatio * 100) / 100;
    const currentWater = Number(nativeWater.value);
    if (!finite(currentWater) || currentWater <= 0) {
      throw new ManualSourceProjectionError('source-ratio-adaptation-unsupported', 'This source does not publish an exact native water total that can be safely adapted to that ratio.');
    }
    const originalNativeWater = options.sourceWater?.unit === nativeWater.unit ? Number(options.sourceWater.value) : null;
    if (nativeWater.unit === 'mL' && finite(originalNativeWater) && targetWater > originalNativeWater) {
      throw new ManualSourceProjectionError('source-capacity-exceeded', 'That ratio would exceed the source’s original native water load; choose a lower ratio or dose.');
    }
    const factor = targetWater / currentWater;
    const waterKey = nativeWater.unit === 'g' ? 'brewGrams' : 'brewMilliliters';
    const stageKey = nativeWater.unit === 'g' ? 'waterToGrams' : 'waterToMilliliters';
    execution.water[waterKey] = targetWater;
    addChange(changes, `water.${waterKey}`, currentWater, targetWater, `Apply the explicit ratio control while preserving the source native ${nativeWater.unit} unit.`);
    const previousByUnit = new Map();
    execution.stages.forEach((stage, index) => {
      const originalStage = clone(stage);
      const originalWater = stageWater(originalStage);
      if (originalWater?.unit !== nativeWater.unit) return;
      const previous = previousByUnit.get(nativeWater.unit) || null;
      const nextValue = scaleQuantity(originalWater.value, factor);
      if (stage[stageKey] != null) {
        stage[stageKey] = nextValue;
        addChange(changes, `stages.${index}.${stageKey}`, originalWater.value, nextValue, `Apply the explicit ratio control without changing stage timing or units.`);
      }
      if (typeof stage.label === 'string') {
        const label = scaledStageLabel(stage.label, originalStage, originalWater.value, nextValue, previous?.value ?? null, previous?.nextValue ?? null);
        if (label !== stage.label) {
          addChange(changes, `stages.${index}.label`, stage.label, label, 'Keep the executable source-stage copy aligned with the ratio-adjusted typed quantity.');
          stage.label = label;
        }
      }
      previousByUnit.set(nativeWater.unit, { value: originalWater.value, nextValue });
    });
    addChange(changes, 'controls.ratio', null, requestedRatio, `Explicit requested ratio; source water remains native ${nativeWater?.unit || 'source'} units.`);
  }

  if (controls.temperatureC != null || controls.temperature != null) {
    if (execution.stages.some((stage) => stage?.temperature != null || stage?.temperatureC != null)) {
      throw new ManualSourceProjectionError('source-temperature-adaptation-unsupported', 'This source publishes per-stage temperatures that this control cannot safely adapt yet.');
    }
    const targetC = sourceControlNumber(controls.temperatureC ?? controls.temperature);
    const originalC = sourceTemperatureCelsius(execution.temperature);
    if (!positive(targetC) || targetC < 90 || targetC > 100 || originalC == null) {
      throw new ManualSourceProjectionError('source-temperature-adaptation-unsupported', 'This source does not publish a numeric temperature that can be safely adapted.');
    }
    const unit = String(execution.temperature.unit || 'C').toUpperCase();
    const originalValue = execution.temperature.value;
    const target = unit === 'F' ? Math.round((targetC * 9 / 5 + 32) * 10) / 10 : targetC;
    execution.temperature = { ...execution.temperature, value: target };
    accepted.temperatureC = targetC;
    addChange(changes, 'temperature.value', originalValue, target, 'Explicit temperature control expressed in the source native unit.');
  }

  if (controls.grind != null || controls.grindMicrons != null) {
    if (execution.stages.some((stage) => stage?.grind != null || stage?.grindMicrons != null)) {
      throw new ManualSourceProjectionError('source-grind-adaptation-unsupported', 'This source publishes per-stage grind settings that this control cannot safely adapt yet.');
    }
    const originalMicrons = finite(execution.grind?.microns) ? execution.grind.microns : null;
    const targetMicrons = sourceControlNumber(controls.grindMicrons ?? controls.grind);
    if (originalMicrons == null || !finite(targetMicrons) || targetMicrons < 300 || targetMicrons > 1200) {
      throw new ManualSourceProjectionError('source-grind-adaptation-unsupported', 'This source provides a qualitative grind only; it cannot be converted into a numeric grinder setting.');
    }
    execution.grind = { ...execution.grind, microns: targetMicrons };
    accepted.grindMicrons = targetMicrons;
    addChange(changes, 'grind.microns', originalMicrons, targetMicrons, 'Explicit physical grind control retains micron units; no grinder calibration is invented.');
  }

  return accepted;
}

function resolveDose(record, configuration) {
  const sourceDose = clone(record.coffeeGrams);
  const requestedInput = configuration.dose ?? configuration.coffeeGrams;
  if (requestedInput != null && !positive(requestedInput)) {
    throw new ManualSourceProjectionError('invalid-dose', 'Choose a positive finite coffee dose.');
  }

  if (finite(sourceDose)) {
    if (configuration.sourceDoseSelection != null
      && (!finite(configuration.sourceDoseSelection) || configuration.sourceDoseSelection !== sourceDose)) {
      throw new ManualSourceProjectionError('invalid-source-dose-selection', 'sourceDoseSelection must match the source exact dose.');
    }
    return {
      sourceDose,
      sourceDoseForAdaptation: sourceDose,
      requestedDose: requestedInput ?? sourceDose,
      sourceDoseSelection: null,
      rangeSelection: false,
    };
  }

  const bounds = quantityBounds(sourceDose);
  if (!bounds) {
    throw new ManualSourceProjectionError('invalid-source-dose', 'The source has no usable dose.');
  }

  const selection = configuration.sourceDoseSelection;
  if (selection == null) {
    if (requestedInput != null) {
      throw new ManualSourceProjectionError('source-dose-selection-required', 'A ranged source needs an explicit sourceDoseSelection before a dose can be adapted.', { sourceDose });
    }
    return {
      sourceDose,
      sourceDoseForAdaptation: null,
      requestedDose: sourceDose,
      sourceDoseSelection: null,
      rangeSelection: false,
    };
  }

  if (!positive(selection) || selection < bounds[0] || selection > bounds[1]) {
    throw new ManualSourceProjectionError('invalid-source-dose-selection', 'sourceDoseSelection must be a positive dose within the source range.', { sourceDose });
  }
  const requestedDose = requestedInput ?? selection;
  if (requestedInput != null && requestedInput !== selection && configuration.allowDoseAdaptation !== true) {
    throw new ManualSourceProjectionError('dose-adaptation-not-authorized', 'A dose outside the selected ranged-source basis needs allowDoseAdaptation: true.');
  }
  return {
    sourceDose,
    sourceDoseForAdaptation: selection,
    requestedDose,
    sourceDoseSelection: selection,
    rangeSelection: true,
  };
}

export class ManualSourceProjectionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ManualSourceProjectionError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Project one trusted source record into a canonical, immutable proposal input.
 * A changed dose is intentionally opt-in (`allowDoseAdaptation: true`) and
 * makes the result non-timer-ready until a caller supplies its own validated
 * timing/capacity adapter. This prevents the projection layer from silently
 * turning an author's schedule into an app claim.
 */
export function projectManualSource(record, configuration = {}) {
  const structural = validateManualSourceRecord(record);
  if (!structural.valid) {
    throw new ManualSourceProjectionError('invalid-source', `Invalid manual source: ${structural.errors.join(', ')}`, { errors: structural.errors });
  }

  const compatibility = manualSourceCompatibility(record, configuration);
  if (!compatibility.compatible) {
    throw new ManualSourceProjectionError('source-configuration-mismatch', 'The source does not match the requested brewer, size, model, filter or mode.', compatibility);
  }

  const dose = resolveDose(record, configuration);
  const { sourceDose, sourceDoseForAdaptation, requestedDose } = dose;
  const doseChanged = sourceDoseForAdaptation != null && requestedDose !== sourceDoseForAdaptation;
  if (doseChanged && configuration.allowDoseAdaptation !== true) {
    throw new ManualSourceProjectionError('dose-adaptation-not-authorized', 'A changed dose needs an explicit source adaptation policy before projection.');
  }

  const sourceSnapshot = clone(record);
  const execution = clone(record);
  const changes = clone(record.editorialChoices || []);
  const adaptation = applyDoseAdaptation(execution, sourceDoseForAdaptation, requestedDose, changes, {
    originalDose: sourceDose,
    rangeSelection: dose.rangeSelection,
  });
  const controls = applySourceControls(execution, requestedDose, changes, configuration.sourceControls, { sourceWater: recordWater(sourceSnapshot) });
  const projectedWater = recordWater(execution);
  const sourceReadiness = manualSourceReadiness(record);
  const readiness = {
    ...sourceReadiness,
    compatible: true,
    timerReady: sourceReadiness.timerReady && adaptation.timingReady,
    ...(adaptation.timingReady ? {} : { blockers: unique([...sourceReadiness.blockers, 'dose-adaptation-timing-unvalidated']) }),
  };
  const status = sourceDoseForAdaptation == null
    ? (changes.length ? 'adapted' : 'original')
    : requestedDose === sourceDoseForAdaptation
      ? (changes.length || dose.rangeSelection ? 'adapted' : 'original')
      : 'scaled';
  const adaptationRecord = {
    version: MANUAL_SOURCE_ADAPTATION_VERSION,
    status,
    sourceDose: clone(sourceDose),
    sourceDoseSelection: dose.sourceDoseSelection,
    requestedDose: clone(requestedDose),
    factor: adaptation.factor,
    changes,
    notes: adaptation.notes,
    disclosure: adaptation.disclosure,
    timing: adaptation.timingReady ? 'source' : 'requires-explicit-validation',
    ...(Object.keys(controls).length ? { controls } : {}),
  };
  const resolvedConfiguration = {
    device: configuration.device ?? record.equipment.brewer,
    variant: configuration.variant ?? (record.equipment.brewer === 'switch' ? 'switch' : null),
    size: configuration.size ?? record.equipment.size,
    model: configuration.model ?? record.equipment.model,
    filter: configuration.filter ?? record.equipment.filter,
    material: configuration.material ?? record.equipment.material,
    mode: configuration.mode ?? record.mode,
  };

  const projection = {
    projectionVersion: MANUAL_SOURCE_PROJECTION_VERSION,
    sourceRecordVersion: MANUAL_SOURCE_RECORD_VERSION,
    sourceId: record.id,
    sourceRevision: record.revision,
    sourceSnapshot: freezeManualSources(sourceSnapshot),
    sourceExecution: freezeManualSources(execution),
    sourceConfiguration: freezeManualSources(resolvedConfiguration),
    configurationKey: manualSourceConfigurationKey(resolvedConfiguration),
    equipment: freezeManualSources(clone(execution.equipment)),
    mode: execution.mode,
    coffeeGrams: clone(requestedDose),
    water: projectedWater,
    temperature: execution.temperature == null ? null : clone(execution.temperature),
    grind: clone(execution.grind),
    clock: clone(execution.clock),
    stages: freezeManualSources(typedStages(execution)),
    preparation: clone(execution.preparation || []),
    aftercare: clone(execution.aftercare || []),
    finish: execution.finish == null ? null : clone(execution.finish),
    applicability: clone(execution.applicability),
    readiness,
    timerReady: readiness.timerReady,
    adaptation: freezeManualSources(adaptationRecord),
    sourceLineage: freezeManualSources({
      sourceId: record.id,
      sourceRevision: record.revision,
      title: record.title,
      author: record.author,
      url: record.source.url,
    }),
  };

  const checked = validateManualSourceProjection(projection);
  if (!checked.valid) {
    throw new ManualSourceProjectionError('invalid-projection', `Invalid source projection: ${checked.errors.join(', ')}`, { errors: checked.errors });
  }
  return projection;
}

export function validateManualSourceProjection(projection) {
  const errors = [];
  if (!projection || typeof projection !== 'object') return { valid: false, errors: ['invalid-projection'] };
  if (projection.projectionVersion !== MANUAL_SOURCE_PROJECTION_VERSION) errors.push('invalid-projection-version');
  if (!projection.sourceSnapshot || !validateManualSourceRecord(projection.sourceSnapshot).valid) errors.push('invalid-source-snapshot');
  if (!projection.sourceExecution || !validateManualSourceRecord(projection.sourceExecution).valid) errors.push('invalid-source-execution');
  if (projection.sourceId !== projection.sourceSnapshot?.id || projection.sourceRevision !== projection.sourceSnapshot?.revision) errors.push('source-lineage-mismatch');
  if (!Array.isArray(projection.stages) || projection.stages.length !== projection.sourceExecution?.stages?.length) errors.push('stage-projection-mismatch');

  const sourceStages = projection.sourceExecution?.stages || [];
  for (const [index, stage] of (projection.stages || []).entries()) {
    const original = sourceStages[index];
    if (!original || stage.id !== original.id || stage.kind !== original.kind) errors.push(`stage-${index}-identity-mismatch`);
    const expectedWater = stageWater(original);
    if (!sameSourceValue(stage.water, expectedWater)) errors.push(`stage-${index}-unit-or-water-mismatch`);
    if (stage.valve !== (original.valve ?? null)) errors.push(`stage-${index}-valve-mismatch`);
  }

  const readiness = projection.readiness;
  if (!readiness || projection.timerReady !== readiness.timerReady) errors.push('readiness-mismatch');
  const unresolvedDoseRange = projection.readiness?.blockers?.includes('source-dose-range-unresolved');
  if (projection.adaptation?.status === 'original'
    && projection.adaptation?.timing !== 'source'
    && !unresolvedDoseRange) errors.push('original-timing-mismatch');
  return { valid: errors.length === 0, errors: unique(errors) };
}
