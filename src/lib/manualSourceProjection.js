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

export const MANUAL_SOURCE_PROJECTION_VERSION = 'ruphus-manual-source-projection-v1';
export const MANUAL_SOURCE_ADAPTATION_VERSION = 1;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;
const clone = (value) => structuredClone(value);
const unique = (values) => [...new Set(values.filter(Boolean))];

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

  execution.stages.forEach((stage, index) => {
    for (const key of ['waterToGrams', 'waterToMilliliters']) {
      if (stage[key] == null) continue;
      const original = stage[key];
      const value = scaleQuantity(original, factor);
      addChange(changes, `stages.${index}.${key}`, original, value, 'Scale the source stage quantity; do not convert its unit.');
      stage[key] = value;
    }
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
    disclosure: 'App-calculated quantities are exposed in typed fields; source-native prose remains verbatim and source timing is not carried over.',
  };
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
    water: recordWater(execution),
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
    if (JSON.stringify(stage.water) !== JSON.stringify(expectedWater)) errors.push(`stage-${index}-unit-or-water-mismatch`);
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
