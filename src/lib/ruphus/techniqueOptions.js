import {
  V60_RULES,
  V60_SOURCE_REGISTRY_VERSION,
  V60_SOURCES,
  V60_TECHNIQUES,
  sourceById,
} from '../../data/v60SourceRegistry.js';
import {
  generateV60RecipeForTechnique,
  v60GrindAdjustmentMicrons,
  v60TechniqueGrindBaselineMicrons,
} from '../v60Adapter.js';
import { kalitaGrindAdjustmentMicrons, kalitaGrindBaselineMicrons } from '../kalitaAdapter.js';
import { descriptorForMicrons } from '../brewMethods.js';
import { KALITA_SOURCES } from '../../data/manualSources/kalita.js';
import { SWITCH_SOURCES } from '../../data/manualSources/switch.js';
import { V60_SOURCES as MANUAL_V60_SOURCES } from '../../data/manualSources/v60.js';
import { KALITA_CONFIGURATION } from '../../data/kalitaConfiguration.js';
import { V60_SWITCH_DOSE_BOUNDS } from '../../data/v60SwitchConfiguration.js';
import {
  V60_SWITCH_SOURCE_REGISTRY_VERSION,
  V60_SWITCH_SOURCES,
} from '../../data/v60SwitchSourceRegistry.js';
import {
  MANUAL_SOURCE_PROJECTION_VERSION,
  ManualSourceProjectionError,
  buildManualSourceGrindEnvelope,
  projectManualSource,
  validateManualSourceProjection,
} from '../manualSourceProjection.js';

export const RUPHUS_V60_TECHNIQUE_OPTIONS_VERSION = 'ruphus-v60-technique-options-v1';
export const RUPHUS_MANUAL_SOURCE_OPTIONS_VERSION = 'ruphus-manual-source-options-v1';
export const MANUAL_SOURCE_DOSE_POLICY_VERSION = 'ruphus-manual-source-checkpoint-v2';

const MANUAL_SOURCE_RECORDS = Object.freeze([
  ...KALITA_SOURCES,
  ...SWITCH_SOURCES,
  ...MANUAL_V60_SOURCES,
]);
const MANUAL_SOURCE_BY_ID = new Map(MANUAL_SOURCE_RECORDS.map((record) => [record.id, record]));
const MANUAL_SOURCE_FAMILY_BY_ID = Object.freeze({
  'kurasu-wave-155-2023': 'kalita-155-wetting-center-v1',
  'fuglen-wave-155': 'kalita-155-wetting-center-v1',
  'foundation-wave-155': 'kalita-155-single-main-v1',
  'art-of-brew-wave-155-pulse-2024': 'kalita-155-six-pulse-v1',
  'vibrant-wave-155': 'kalita-155-drainage-triggered-v1',
  'onyx-monarch-wave-185': 'kalita-185-six-pulse-v1',
  'ozone-wave-185-2026': 'kalita-185-six-pulse-v1',
});
const MANUAL_V60_GRIND_TECHNIQUE_BY_ID = Object.freeze({
  'hoffmann-v60-30-hario': 'hoffmann-large-batch',
  'kasuya-v60-20-hario': 'kasuya-coarse-pulses',
  'rao-v60-20-hario-2022': 'rao-two-stage',
});

const DOSE_BOUNDS = Object.freeze([...V60_RULES['v60-dose-scaling-v1'].bounds.dose]);
const ADAPTATION_RULE_ID = 'v60-adaptation-bounded-v1';
const SCALING_RULE_ID = 'v60-dose-scaling-v1';
const TECHNIQUE_NAMES = Object.freeze({
  'hoffmann-one-cup-v1': 'James Hoffmann One-Cup V60',
  'hoffmann-large-batch-v1': 'James Hoffmann Large-Batch V60',
  'kasuya-46-v1': 'Tetsu Kasuya 4:6',
  'heart-continuous-v1': 'Heart Continuous Pour',
});

// These are deliberately descriptive app-facing differences, assembled only
// from fields in the audited source registry. They are not a second recipe
// corpus and cannot make an otherwise ineligible source executable.
const DIFFERENCES = Object.freeze({
  'hoffmann-one-cup-v1': [
    'Source recipe: four controlled pulse pours after a 50g bloom.',
    'Medium-fine grind with a gentle bloom and final swirl.',
  ],
  'hoffmann-large-batch-v1': [
    'Source recipe: dedicated large-batch cadence with a 60g bloom, then staged pours to 300g and 500g.',
    'Stir and swirl after the final pour; filter contact is not prohibited by the source.',
  ],
  'kasuya-46-v1': [
    'Source recipe: five centered pulses using the 4:6 method.',
    'Coarse grind and no final swirl.',
  ],
  'heart-continuous-v1': [
    'Source recipe: one slow, continuous center pour after a 40–50g bloom.',
    'Vigorous bloom stir and final stir, with a 93–96C source range.',
  ],
});

const FAMILY_BY_SOURCE_ID = Object.freeze(Object.fromEntries(
  Object.entries(V60_TECHNIQUES).flatMap(([key, technique]) => technique.sourceIds.map((sourceId) => [
    sourceId,
    { familyKey: key, familyId: technique.id, label: technique.label },
  ])),
));

function sourceIsExecutable(source) {
  return Boolean(source)
    && source.supportedV60_02 !== false
    && source.status === 'original'
    && source.executableCadence === true
    && Number.isFinite(source.doseGrams)
    && Number.isFinite(source.ratio)
    && Number.isFinite(source.temperatureC)
    && Number.isFinite(source.guideSeconds)
    && Boolean(source.grind)
    && Boolean(source.geometry)
    && Boolean(source.agitation);
}

function optionForSource(source) {
  const family = FAMILY_BY_SOURCE_ID[source.id];
  if (!family) return null;
  const sourceBounds = V60_RULES[SCALING_RULE_ID]?.bounds?.dose || DOSE_BOUNDS;
  return Object.freeze({
    id: family.familyId,
    familyId: family.familyId,
    familyKey: family.familyKey,
    sourceId: source.id,
    sourceIds: [source.id],
    name: TECHNIQUE_NAMES[source.id] || family.label,
    label: TECHNIQUE_NAMES[source.id] || family.label,
    differences: [...(DIFFERENCES[source.id] || [])],
    bounds: Object.freeze({
      dose: [...sourceBounds],
      doseGrams: [...sourceBounds],
      ratio: [...(V60_RULES[ADAPTATION_RULE_ID]?.bounds?.ratio || [15, 18.5])],
    }),
    sourceDoseGrams: source.doseGrams,
    sourceRatio: source.ratio,
    sourceTemperatureC: source.temperatureC,
    attribution: Object.freeze({
      author: source.author,
      canonicalUrl: source.canonicalUrl,
      publication: source.publication,
      evidenceType: source.evidenceType,
      status: source.status,
    }),
    adaptation: `Source recipe is ${source.doseGrams}g; app adaptation supports ${sourceBounds[0]}–${sourceBounds[1]}g through ${SCALING_RULE_ID}.`,
    executable: true,
    timerReady: true,
    sourceRegistryVersion: V60_SOURCE_REGISTRY_VERSION,
    source,
  });
}

const EXECUTABLE_OPTIONS = Object.freeze(V60_SOURCES
  .filter(sourceIsExecutable)
  .map(optionForSource)
  .filter(Boolean));

const OPTIONS_BY_ID = new Map(EXECUTABLE_OPTIONS.flatMap((option) => [
  [option.id, option],
  [option.familyId, option],
  [option.sourceId, option],
]));

function currentIdentity(current = {}) {
  if (typeof current === 'string') return current;
  return current.currentFamilyId || current.currentTechniqueId || current.currentSourceId
    || current.familyId || current.techniqueId || current.sourceId || current.technique
    || current.sourceLineage?.sourceIds?.[0] || null;
}

/**
 * Return only registry-backed, timer-ready alternatives by default. The
 * current family is excluded only when it is identifiable; an unknown current
 * technique is disclosed by leaving the full eligible set intact.
 */
export function listV60TechniqueOptions(current = {}) {
  const identity = currentIdentity(current);
  const currentOption = identity ? OPTIONS_BY_ID.get(identity) : null;
  const unknownCurrent = !currentOption;
  const excludedIds = new Set([
    ...(Array.isArray(current?.excludeIds) ? current.excludeIds : []),
    ...(Array.isArray(current?.excludedIds) ? current.excludedIds : []),
    ...(Array.isArray(current?.excludeFamilyIds) ? current.excludeFamilyIds : []),
    ...(Array.isArray(current?.excludeTechniqueIds) ? current.excludeTechniqueIds : []),
    ...(Array.isArray(current?.excludeSourceIds) ? current.excludeSourceIds : []),
  ]);
  const excludedFamilyId = currentOption?.familyId || null;
  return EXECUTABLE_OPTIONS
    .filter((option) => (!excludedFamilyId || option.familyId !== excludedFamilyId)
      && !excludedIds.has(option.id)
      && !excludedIds.has(option.familyId)
      && !excludedIds.has(option.sourceId))
    .map(({ source: _source, ...option }) => ({
      ...option,
      ...(unknownCurrent ? { comparisonStatus: 'unknown-current-technique' } : {}),
    }));
}

export function getV60TechniqueOption(id) {
  if (!id || typeof id !== 'string') return null;
  const option = OPTIONS_BY_ID.get(id);
  if (!option) return null;
  const { source: _source, ...publicOption } = option;
  return { ...publicOption };
}

export function listV60TechniqueReferences() {
  return V60_SOURCES
    .filter((source) => !sourceIsExecutable(source))
    .map((source) => {
      const family = FAMILY_BY_SOURCE_ID[source.id] || {};
      return {
        id: family.familyId || source.id,
        familyId: family.familyId || null,
        familyKey: family.familyKey || null,
        sourceId: source.id,
        sourceIds: [source.id],
        name: family.label || source.publication,
        differences: [],
        bounds: null,
        sourceDoseGrams: source.doseGrams,
        attribution: {
          author: source.author,
          canonicalUrl: source.canonicalUrl,
          publication: source.publication,
          evidenceType: source.evidenceType,
          status: source.status,
        },
        executable: false,
        timerReady: false,
        referenceOnly: true,
        reason: source.supportedV60_02 === false
          ? 'Source is not complete for V60 02 execution.'
          : 'Source does not provide an executable cadence and complete parameters.',
      };
    });
}

const SWITCH_REFERENCE_SOURCE_IDS = Object.freeze(['kasuya-hybrid-resolved']);

/**
 * Project the one resolved dual-temperature Switch source as read-only
 * guidance. It is intentionally separate from executable options: the
 * current Switch workflow is single-temperature and cannot execute this
 * source faithfully without inventing an adaptation.
 */
export function listV60SwitchTechniqueReferences() {
  return SWITCH_REFERENCE_SOURCE_IDS.flatMap((sourceId) => {
    const source = V60_SWITCH_SOURCES.find((candidate) => candidate.id === sourceId);
    if (!source) return [];
    const temperaturePhases = Object.fromEntries([
      ['phase1C', source.temperaturePhase1C],
      ['phase2C', source.temperaturePhase2C],
    ].filter(([, value]) => Number.isFinite(value)));
    const valveTiming = Object.fromEntries([
      ['closeTimeSeconds', source.valveCloseTimeSeconds],
      ['openTimeSeconds', source.valveOpenTimeSeconds],
    ].filter(([, value]) => Number.isFinite(value)));
    const phaseSummary = Object.values(temperaturePhases).map((value) => `${value}°C`).join(' then ');
    return [{
      id: source.id,
      sourceId: source.id,
      name: source.author,
      label: source.publication,
      familyId: null,
      familyKey: null,
      brewer: source.brewer,
      sourceDoseGrams: source.doseGrams,
      sourceRatio: source.ratio,
      temperaturePhases,
      structure: source.structure,
      valveTiming,
      notes: source.notes,
      attribution: {
        author: source.author,
        canonicalUrl: source.canonicalUrl,
        publication: source.publication,
        evidenceType: source.evidenceType,
        evidenceTier: source.evidenceTier,
        status: source.status,
      },
      sourceRegistryVersion: V60_SWITCH_SOURCE_REGISTRY_VERSION,
      referenceKind: 'dual-temperature',
      executable: false,
      timerReady: false,
      referenceOnly: true,
      reason: `Reference-only: this source specifies ${phaseSummary || 'multiple temperature'} phases; the supported Switch workflow is single-temperature, so it must not be executed as the original or silently approximated.`,
    }];
  });
}

function optionOrThrow(id) {
  const option = OPTIONS_BY_ID.get(id);
  if (option) return option;
  const source = typeof id === 'string' ? sourceById(id) : null;
  if (source && !sourceIsExecutable(source)) {
    throw new Error(`V60 technique source ${id} is reference-only and cannot produce a timer-ready recipe`);
  }
  throw new Error(`Unknown or unsupported V60 technique: ${String(id)}`);
}

/**
 * Generate a source-selected preview and return its option metadata alongside
 * the canonical validated recipe. This path accepts no model-created source
 * record and never falls through to automatic preference selection.
 */
export function generateV60TechniqueOption(idOrRequest, intent = {}, configuration = {}, evidence = null) {
  let id = idOrRequest;
  if (idOrRequest && typeof idOrRequest === 'object') {
    id = idOrRequest.familyId || idOrRequest.techniqueId || idOrRequest.sourceId || idOrRequest.id;
    intent = idOrRequest.intent || {};
    configuration = idOrRequest.configuration || {};
    evidence = idOrRequest.evidence || null;
  }
  const option = optionOrThrow(id);
  const recipe = generateV60RecipeForTechnique(option.familyId, intent, configuration, evidence);
  const { source: _source, ...publicOption } = option;
  return { ...publicOption, recipe };
}

export const listV60TechniqueAlternatives = listV60TechniqueOptions;
export const getV60Technique = getV60TechniqueOption;
export const generateV60TechniquePreview = generateV60TechniqueOption;

const finitePositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function sourceDoseNumber(recordOrProjection) {
  const value = recordOrProjection?.coffeeGrams ?? recordOrProjection?.adaptation?.sourceDose;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function manualSourceConfiguration(record, configuration = {}) {
  const equipment = record?.equipment || {};
  const brewer = equipment.brewer;
  const device = configuration.device ?? configuration.brewer ?? (brewer === 'switch' ? 'v60' : brewer);
  const variant = configuration.variant ?? configuration.v60Variant
    ?? (brewer === 'switch' ? 'switch' : brewer === 'v60' ? 'classic' : null);
  const result = {
    device,
    variant,
    mode: configuration.mode ?? record?.mode,
    size: configuration.size ?? configuration.v60Size ?? configuration.kalitaSize
      ?? (equipment.size === 'any' ? 'any' : equipment.size),
    model: configuration.model ?? equipment.model ?? null,
    filter: configuration.filter ?? equipment.filter ?? null,
    material: configuration.material ?? equipment.material ?? null,
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value != null));
}

function sourceRecord(id, revision = null) {
  if (!id || typeof id !== 'string') return null;
  const record = MANUAL_SOURCE_BY_ID.get(id) || null;
  if (!record || (revision != null && Number(record.revision) !== Number(revision))) return null;
  return record;
}

function manualSourceFamilyId(record) {
  return record?.familyId || MANUAL_SOURCE_FAMILY_BY_ID[record?.id] || record?.id || null;
}

function qualitativeGrindBand(value) {
  const text = String(value || '').toLowerCase();
  if (/medium[ -]?coarse/.test(text)) return 'Medium-Coarse';
  if (/medium[ -]?fine/.test(text)) return 'Medium-Fine';
  if (/\bcoarse\b/.test(text)) return 'Coarse';
  if (/\bfine\b/.test(text)) return 'Fine';
  if (/\bmedium\b/.test(text)) return 'Medium';
  return null;
}

function compatibleMethodEstimate(record) {
  const sourceBand = qualitativeGrindBand(record?.grind?.description);
  if (!sourceBand) return null;
  let baselineMicrons = null;
  if (record.equipment?.brewer === 'kalita') baselineMicrons = kalitaGrindBaselineMicrons(record.equipment?.size);
  else if (record.equipment?.brewer === 'v60') baselineMicrons = v60TechniqueGrindBaselineMicrons(null);
  if (!Number.isFinite(baselineMicrons) || descriptorForMicrons(baselineMicrons) !== sourceBand) return null;
  return { baselineMicrons, baselineKind: 'compatible-method-estimate', baselineLabel: `${record.equipment.brewer} ${record.equipment.size || ''}`.trim() };
}

function manualSourceGrindBaseline(record) {
  if (Number.isFinite(record?.grind?.microns)) {
    return { baselineMicrons: record.grind.microns, baselineKind: 'source-microns', baselineLabel: record.title };
  }
  const techniqueId = MANUAL_V60_GRIND_TECHNIQUE_BY_ID[record?.id];
  if (techniqueId) {
    return {
      baselineMicrons: v60TechniqueGrindBaselineMicrons(techniqueId),
      baselineKind: 'compatible-technique-baseline',
      baselineLabel: techniqueId,
    };
  }
  return compatibleMethodEstimate(record);
}

function manualSourceGrindAdjustment(record, intent) {
  if (record?.equipment?.brewer === 'kalita') return kalitaGrindAdjustmentMicrons(intent);
  return v60GrindAdjustmentMicrons(intent);
}

function personalizedManualSourceGrind(record, intent, configuration) {
  const baseline = manualSourceGrindBaseline(record);
  if (!baseline) return null;
  return buildManualSourceGrindEnvelope({
    ...baseline,
    adjustmentMicrons: manualSourceGrindAdjustment(record, intent),
    grinder: configuration?.grinder || null,
    intent,
  });
}

export function adaptedDoseBounds(record) {
  const sourceDose = sourceDoseNumber(record);
  if (!Number.isFinite(sourceDose)) return null;
  const equipment = record?.equipment || {};
  if (equipment.brewer === 'kalita') {
    const bounds = KALITA_CONFIGURATION[String(equipment.size)];
    return bounds ? [bounds.minDose, bounds.maxDose] : null;
  }
  if (equipment.brewer === 'switch' && String(equipment.size) === '03') {
    // Downscaling every source quantity cannot increase any retained phase
    // load or coffee bed. The source's original load, not finished capacity
    // or total throughput, is the conservative upper bound for this policy.
    return [V60_SWITCH_DOSE_BOUNDS.minDose, Math.min(sourceDose, V60_SWITCH_DOSE_BOUNDS.maxDose)];
  }
  return null;
}

function sourceProjectionError(code, message, details = {}) {
  return new ManualSourceProjectionError(code, message, details);
}

/**
 * Validate the small, explicit app adaptation policy used after the pure
 * source projection marks a changed dose unready. The source's checkpoint or
 * event anchors are kept unchanged; this promotion only asserts that the app
 * can present those anchors as an app guide at the selected dose. It never
 * rewrites source prose or claims the source author validated the adaptation.
 */
export function validateManualSourceDoseAdaptation(projection) {
  const errors = [];
  const sourceDose = typeof projection?.adaptation?.sourceDose === 'number' && Number.isFinite(projection.adaptation.sourceDose)
    ? projection.adaptation.sourceDose : null;
  const targetDose = sourceDoseNumber({ coffeeGrams: projection?.coffeeGrams });
  if (projection?.projectionVersion !== MANUAL_SOURCE_PROJECTION_VERSION) errors.push('invalid-projection-version');
  if (!projection?.readiness?.sourceValid || !projection?.readiness?.admitted || !projection?.readiness?.guided) errors.push('source-not-timer-ready');
  if (!finitePositiveNumber(sourceDose) || !finitePositiveNumber(targetDose)) errors.push('invalid-dose');
  const bounds = adaptedDoseBounds(projection?.sourceSnapshot);
  if (!bounds || targetDose < bounds[0] || targetDose > bounds[1]) errors.push('unsupported-dose-adaptation');
  if (projection?.adaptation?.status !== 'scaled') errors.push('dose-is-not-scaled');
  const stages = projection?.sourceExecution?.stages;
  if (!Array.isArray(stages) || !stages.length) errors.push('missing-source-stages');
  stages?.forEach((stage, index) => {
    if (stage?.trigger?.type === 'condition' && index !== stages.length - 1) errors.push(`intermediate-condition-${index}`);
    if (!['elapsed', 'after', 'manual', 'condition'].includes(stage?.trigger?.type)) errors.push(`invalid-stage-trigger-${index}`);
  });
  return { valid: errors.length === 0, errors: [...new Set(errors)], bounds };
}

export function applyManualSourceDosePolicy(projection) {
  const checked = validateManualSourceDoseAdaptation(projection);
  if (!checked.valid) {
    throw sourceProjectionError(
      checked.errors.includes('unsupported-dose-adaptation') ? 'unsupported-dose-adaptation' : 'source-dose-adaptation-invalid',
      checked.errors.includes('unsupported-dose-adaptation')
        ? `This source supports an app dose guide only from ${checked.bounds?.[0]}g through ${checked.bounds?.[1]}g; choose a supported dose instead of changing the source schedule.`
        : `The changed source dose cannot be presented as a timer-ready app guide: ${checked.errors.join(', ')}.`,
      checked,
    );
  }
  const blockers = (projection.readiness.blockers || []).filter((blocker) => blocker !== 'dose-adaptation-timing-unvalidated');
  const adaptation = {
    ...projection.adaptation,
    timing: 'app-source-checkpoints',
    timingPolicy: MANUAL_SOURCE_DOSE_POLICY_VERSION,
    changes: (projection.adaptation.changes || []).filter(change => !/\.durationSeconds$/.test(change.path || change.field || '')),
    notes: [
      ...(projection.adaptation.notes || []),
      `The app keeps the source checkpoint/event anchors unchanged at ${projection.coffeeGrams}g; this is an app guide, not an author-timed validation.`,
    ],
    disclosure: 'Water amounts and step wording are adjusted for this coffee dose while preserving the source units and checkpoint/event anchors. The original recipe wording remains available for comparison; this is an app adaptation, not an author-validated timing claim.',
  };
  const next = {
    ...projection,
    sourceExecution: {
      ...projection.sourceExecution,
      stages: projection.sourceExecution.stages.map((stage, index) => ({
        ...stage, durationSeconds: projection.sourceSnapshot.stages[index].durationSeconds ?? null,
      })),
    },
    stages: projection.stages.map((stage, index) => ({
      ...stage, durationSeconds: projection.sourceSnapshot.stages[index].durationSeconds ?? null,
    })),
    readiness: {
      ...projection.readiness,
      timerReady: true,
      blockers,
    },
    timerReady: true,
    adaptation,
  };
  const validated = validateManualSourceProjection(next);
  if (!validated.valid) throw sourceProjectionError('invalid-source-dose-adaptation', `The source dose guide failed projection validation: ${validated.errors.join(', ')}.`, validated);
  return next;
}

export function getManualSourceRecord(sourceId, sourceRevision = null) {
  return sourceRecord(sourceId, sourceRevision);
}

/** Reconstruct a trusted source projection from the bundled record identity. */
export function projectManualSourceForApp(sourceIdOrRequest, configuration = {}) {
  const id = isObject(sourceIdOrRequest)
    ? sourceIdOrRequest.sourceId || sourceIdOrRequest.id
    : sourceIdOrRequest;
  const revision = isObject(sourceIdOrRequest)
    ? sourceIdOrRequest.sourceRevision ?? sourceIdOrRequest.revision
    : configuration.sourceRevision ?? configuration.revision ?? null;
  const record = sourceRecord(id, revision);
  if (!record) {
    const sourceExists = sourceRecord(id);
    throw sourceProjectionError(sourceExists ? 'source-revision-mismatch' : 'unknown-source', sourceExists ? `Source ${id} does not match the requested revision.` : `Unknown manual source: ${String(id)}.`, { sourceId: id, sourceRevision: revision });
  }
  const requestedConfiguration = {
    ...(isObject(sourceIdOrRequest) ? sourceIdOrRequest.configuration || {} : {}),
    ...configuration,
  };
  const resolvedConfiguration = manualSourceConfiguration(record, requestedConfiguration);
  const requestedDose = requestedConfiguration.dose ?? requestedConfiguration.coffeeGrams;
  const projectConfiguration = {
    ...resolvedConfiguration,
    ...(requestedDose != null ? { dose: Number(requestedDose) } : {}),
    ...(requestedConfiguration.sourceDoseSelection != null ? { sourceDoseSelection: Number(requestedConfiguration.sourceDoseSelection) } : {}),
    ...(requestedConfiguration.sourceControls && typeof requestedConfiguration.sourceControls === 'object'
      ? { sourceControls: structuredClone(requestedConfiguration.sourceControls) } : {}),
    // This helper is the named app policy boundary. Direct pure projections
    // still require callers to opt into adaptation explicitly.
    ...(requestedDose != null ? { allowDoseAdaptation: requestedConfiguration.allowDoseAdaptation !== false } : {}),
  };
  const projection = projectManualSource(record, projectConfiguration);
  return projection.adaptation.status === 'scaled' ? applyManualSourceDosePolicy(projection) : projection;
}

function waterFields(projection) {
  if (!projection?.water || !['g', 'mL'].includes(projection.water.unit)) return {};
  return projection.water.unit === 'mL'
    ? { waterMilliliters: projection.water.value }
    : { waterGrams: projection.water.value };
}

export function recipeFromManualSourceProjection(projection, { techniqueId = null, techniqueLabel = null } = {}) {
  const checked = validateManualSourceProjection(projection);
  if (!checked.valid) throw sourceProjectionError('invalid-source-projection', `Cannot create a recipe from this source projection: ${checked.errors.join(', ')}.`, checked);
  const equipment = projection.equipment || {};
  const brewer = equipment.brewer;
  const method = brewer === 'kalita' ? 'kalita' : 'v60';
  const device = brewer === 'kalita' ? 'kalita' : 'v60';
  const size = equipment.size && equipment.size !== 'any' ? String(equipment.size) : null;
  const familyId = manualSourceFamilyId(projection.sourceSnapshot);
  const sourceDose = sourceDoseNumber(projection);
  const finish = projection.finish && Number.isFinite(projection.finish.minSeconds) && Number.isFinite(projection.finish.maxSeconds)
    ? projection.finish : null;
  const sourceLineage = {
    sourceIds: [projection.sourceId],
    sourceId: projection.sourceId,
    sourceRevision: projection.sourceRevision,
    sourceRegistryVersion: RUPHUS_MANUAL_SOURCE_OPTIONS_VERSION,
    familyId,
    technique: familyId,
    status: projection.adaptation?.status || 'original',
    adaptation: projection.adaptation?.disclosure || null,
    changedFields: (projection.adaptation?.changes || []).map((change) => change.path),
    title: projection.sourceLineage?.title || null,
    author: projection.sourceLineage?.author || null,
    canonicalUrls: projection.sourceLineage?.url ? [projection.sourceLineage.url] : [],
  };
  const water = waterFields(projection);
  const ratio = projection.water?.unit === 'g' && finitePositiveNumber(sourceDose) && finitePositiveNumber(projection.water.value)
    ? `1:${Math.round((projection.water.value / sourceDose) * 100) / 100}` : null;
  const recipe = {
    method,
    device,
    variant: brewer === 'switch' ? 'switch' : brewer === 'v60' ? 'classic' : 'wave',
    mode: projection.mode,
    isIced: projection.mode === 'iced',
    ...(method === 'v60' && size ? { v60Size: size } : {}),
    ...(method === 'kalita' && size ? { kalitaSize: size } : {}),
    configurationKey: projection.configurationKey,
    sourceId: projection.sourceId,
    sourceRevision: projection.sourceRevision,
    coffeeGrams: projection.coffeeGrams,
    ...water,
    ...(ratio ? { ratio } : {}),
    ...(projection.temperature ? { temperature: projection.temperature } : {}),
    ...(projection.grind ? { grind: projection.grind } : {}),
    ...(finish ? { guideRangeSeconds: [finish.minSeconds, finish.maxSeconds], ...(finish.minSeconds === finish.maxSeconds ? { guideTargetSeconds: finish.minSeconds, totalBrewTimeSeconds: finish.minSeconds } : {}) } : {}),
    prepSteps: (projection.preparation || []).map((action) => ({ action, phase: 'prep' })),
    postBrewSteps: (projection.aftercare || []).map((action) => ({ action, phase: 'aftercare' })),
    stages: projection.stages,
    finish: projection.finish,
    aftercare: projection.aftercare,
    applicability: projection.applicability,
    sourceProjection: projection,
    sourceNativeWaterUnit: projection.water?.unit || null,
    sourceFormatVersion: projection.projectionVersion,
    sourceLineage,
    technique: techniqueId || familyId || projection.sourceId,
    techniqueLabel: techniqueLabel || projection.sourceLineage?.title || projection.sourceId,
    timerReady: projection.timerReady,
    candidate: true,
    title: projection.sourceLineage?.title || 'Source-backed manual brew recipe',
  };
  return recipe;
}

function stageText(stage = {}) {
  return [stage.id, stage.label, stage.geometry, stage.agitation]
    .filter(value => value != null)
    .join(' ')
    .toLowerCase();
}

/**
 * Summarize only the source schedule's structural distinction for the chat
 * handoff. This is intentionally derived from the trusted stage projection;
 * it does not add a second corpus, infer sensory outcomes, or make a source
 * executable. The first returned sentence is carried ahead of the existing
 * dose/clock provenance differences.
 */
function sourceStructuralDifference(record, projection) {
  const stages = Array.isArray(projection?.sourceSnapshot?.stages)
    ? projection.sourceSnapshot.stages
    : Array.isArray(record?.stages) ? record.stages : [];
  const pours = stages.filter(stage => stage?.kind === 'pour');
  if (!pours.length) return null;

  if (record?.equipment?.brewer === 'switch') {
    const firstPour = pours[0];
    const hasClosedStage = stages.some(stage => stage?.valve === 'closed');
    const hasRelease = stages.some(stage => stage?.kind === 'valve' && stage?.valve === 'open');
    const hasClosedSteep = stages.some(stage => stage?.kind === 'agitate' && stage?.valve === 'closed');
    if (firstPour?.valve === 'open' && hasClosedStage && hasRelease) {
      return 'An open-valve bloom is followed by a closed immersion, then a release to drain.';
    }
    if (firstPour?.valve === 'closed' && hasClosedSteep && hasRelease) {
      return 'The full brew stays closed through the pour and steep, then releases to drain.';
    }
    if (firstPour?.valve === 'closed' && hasRelease) {
      return 'The brew starts closed, then releases to drain.';
    }
  }

  if (record?.equipment?.brewer === 'kalita') {
    const postBloom = pours.slice(1);
    const hasPulse = postBloom.some(stage => /\bpulse\b/.test(stageText(stage)));
    const finalStageText = stageText(postBloom.at(-1));
    const hasCenterFinish = postBloom.at(-1) && /center|centre/.test(finalStageText);
    const secondText = stageText(postBloom[0]);
    if (hasPulse) return 'After the bloom, it uses several staged pulse pours rather than one main pour.';
    if (pours.length === 2 && /\bmain\b|remaining/.test(secondText)) {
      return 'A short bloom is followed by one gradual main pour to the final water target.';
    }
    if (hasCenterFinish && pours.length >= 3) {
      const centerForm = /stream|stationary/.test(finalStageText) ? 'center-stream' : /circle/.test(finalStageText) ? 'center-circle' : 'center-focused';
      return `The bloom and second pour lead into a final ${centerForm} pour.`;
    }
    if (pours.length >= 3) {
      return `A bloom is followed by ${pours.length - 1} staged pours to reach the final water target.`;
    }
    if (pours.length === 2) return 'A bloom is followed by one further pour to reach the final water target.';
  }

  return null;
}

function sourceOption(record, projection) {
  const sourceDose = sourceDoseNumber(record);
  const bounds = adaptedDoseBounds(record);
  const water = projection.water;
  const exact = projection.adaptation?.status === 'original';
  const blockers = projection.readiness?.blockers || [];
  const targetDose = sourceDoseNumber(projection);
  const structuralDifference = sourceStructuralDifference(record, projection);
  const doseDescription = exact
    ? `${sourceDose}g source dose`
    : `${targetDose}g app guide from the ${sourceDose}g source dose`;
  return {
    id: record.id,
    familyId: manualSourceFamilyId(record),
    familyKey: manualSourceFamilyId(record),
    sourceId: record.id,
    sourceIds: [record.id],
    sourceRevision: record.revision,
    name: record.title,
    label: record.title,
    differences: [
      ...(structuralDifference ? [structuralDifference] : []),
      `${record.author} source schedule for ${record.equipment?.brewer === 'switch' ? `Switch ${record.equipment?.size || ''}`.trim() : `${record.equipment?.brewer || 'manual'} ${record.equipment?.size || ''}`.trim()}.`,
      ...(water?.value != null ? [`${doseDescription} · ${water.value}${water.unit} native water.`] : []),
      ...(projection.clock?.origin ? [`Clock starts at ${projection.clock.origin}; source valve/event actions remain explicit.`] : ['Source clock is retained as published; no timing is invented.']),
    ],
    bounds: bounds ? { dose: [...bounds], doseGrams: [...bounds] } : null,
    sourceDoseGrams: sourceDose,
    targetDoseGrams: targetDose,
    sourceWater: water,
    sourceConfiguration: projection.sourceConfiguration,
    attribution: {
      author: record.author,
      canonicalUrl: record.source?.url,
      publication: record.source?.publishedAt || null,
      evidenceType: record.source?.verification,
      status: record.admission?.status,
    },
    adaptation: exact
      ? 'Original source quantities and timing are unchanged.'
      : projection.adaptation?.disclosure || 'App adaptation is explicitly disclosed in the source projection.',
    executable: projection.timerReady === true,
    timerReady: projection.timerReady === true,
    referenceOnly: projection.timerReady !== true,
    ...(blockers.length ? { reason: blockers.join('; ') } : {}),
    sourceOptionsVersion: RUPHUS_MANUAL_SOURCE_OPTIONS_VERSION,
    sourceProjectionVersion: projection.projectionVersion,
  };
}

function parseManualOptionArguments(first = {}, second = {}, third = {}) {
  if (Array.isArray(first)) return { records: first, configuration: second || {}, options: third || {} };
  const request = isObject(first) ? first : {};
  return {
    records: Array.isArray(request.records) ? request.records : MANUAL_SOURCE_RECORDS,
    configuration: request.configuration || request,
    options: isObject(second) ? second : {},
  };
}

/** List source-record options for one exact brewer/configuration. */
export function listManualSourceTechniqueOptions(first = {}, second = {}, third = {}) {
  const { records, configuration, options } = parseManualOptionArguments(first, second, third);
  const includeReferenceOnly = options.includeReferenceOnly === true || options.includeReferences === true;
  const excluded = new Set([
    ...(Array.isArray(configuration.excludeIds) ? configuration.excludeIds : []),
    ...(Array.isArray(configuration.excludedIds) ? configuration.excludedIds : []),
    ...(Array.isArray(options.excludeIds) ? options.excludeIds : []),
  ]);
  const excludedFamilies = new Set([...excluded].map((id) => manualSourceFamilyId(sourceRecord(id)) || id));
  const current = configuration.currentSourceId || configuration.currentFamilyId || configuration.currentTechniqueId || options.currentSourceId || options.currentFamilyId;
  const currentRecord = sourceRecord(current);
  const currentFamily = manualSourceFamilyId(currentRecord) || current;
  const result = new Map();
  for (const record of records) {
    const resolved = sourceRecord(record?.id, record?.revision);
    if (!resolved) continue;
    const exactConfiguration = manualSourceConfiguration(resolved, configuration);
    const requestedDose = configuration.dose ?? configuration.coffeeGrams;
    const targetDose = requestedDose == null ? null : Number(requestedDose);
    let projection;
    let unavailableReason = null;
    try {
      projection = projectManualSourceForApp(resolved.id, {
        ...exactConfiguration,
        ...(targetDose != null ? { dose: targetDose } : {}),
        ...(configuration.sourceDoseSelection != null ? { sourceDoseSelection: configuration.sourceDoseSelection } : {}),
        ...(configuration.allowDoseAdaptation != null ? { allowDoseAdaptation: configuration.allowDoseAdaptation } : {}),
      });
    } catch (error) {
      if (!includeReferenceOnly) continue;
      unavailableReason = error.message;
      try {
        projection = projectManualSource(resolved, exactConfiguration);
      } catch {
        continue;
      }
    }
    const option = sourceOption(resolved, projection);
    if (unavailableReason) {
      option.executable = false;
      option.timerReady = false;
      option.referenceOnly = true;
      option.reason = unavailableReason;
      option.requestedDoseGrams = targetDose;
    }
    if ((!includeReferenceOnly && !option.executable)
      || excluded.has(option.id) || excluded.has(option.familyId) || excluded.has(option.sourceId) || excludedFamilies.has(option.familyId)
      || (current && [option.id, option.familyId, option.sourceId].includes(current))
      || (currentFamily && option.familyId === currentFamily)) continue;
    const existing = result.get(option.familyId);
    if (!existing || (existing.executable !== true && option.executable === true)) result.set(option.familyId, option);
  }
  return [...result.values()];
}

export function getManualSourceTechniqueOption(idOrRequest, configuration = {}) {
  const id = isObject(idOrRequest) ? idOrRequest.sourceId || idOrRequest.id : idOrRequest;
  const revision = isObject(idOrRequest) ? idOrRequest.sourceRevision ?? idOrRequest.revision : null;
  const record = sourceRecord(id, revision);
  if (!record) return null;
  try {
    const projection = projectManualSourceForApp(id, { ...(isObject(idOrRequest) ? idOrRequest.configuration || {} : {}), ...configuration });
    return sourceOption(record, projection);
  } catch {
    return null;
  }
}

/** Build a source-native recipe envelope from a trusted source ID/revision. */
export function generateManualSourceTechniqueOption(idOrRequest, intent = {}, configuration = {}, evidence = null) {
  let request = idOrRequest;
  if (typeof idOrRequest === 'string') request = { sourceId: idOrRequest };
  if (!isObject(request)) throw sourceProjectionError('invalid-source-request', 'A source ID is required.');
  const sourceId = request.sourceId || request.id;
  const mergedConfiguration = {
    ...(request.configuration || {}),
    ...(configuration || {}),
    ...(request.dose != null ? { dose: request.dose } : {}),
    ...(request.sourceDoseSelection != null ? { sourceDoseSelection: request.sourceDoseSelection } : {}),
  };
  const projection = projectManualSourceForApp(sourceId, {
    ...mergedConfiguration,
    ...(request.sourceRevision != null ? { sourceRevision: request.sourceRevision } : {}),
  });
  const record = sourceRecord(sourceId, request.sourceRevision ?? null);
  const option = sourceOption(record, projection);
  if (!option.executable) throw sourceProjectionError('source-not-timer-ready', `Source ${sourceId} is readable but not ready for a guided recipe.`, { option });
  const grindEnvelope = personalizedManualSourceGrind(record, intent, mergedConfiguration);
  const recipe = recipeFromManualSourceProjection(projection, { techniqueId: option.familyId, techniqueLabel: option.name });
  if (grindEnvelope) {
    recipe.grindSize = grindEnvelope.grindSize;
    recipe.sourceLineage = { ...recipe.sourceLineage, grindAdaptation: grindEnvelope.grindAdaptation };
  }
  return {
    ...option,
    recipe,
    ...(intent && Object.keys(intent).length ? { reviewedIntent: structuredClone(intent) } : {}),
    ...(evidence ? { evidence: structuredClone(evidence) } : {}),
  };
}

export const listManualTechniqueOptions = listManualSourceTechniqueOptions;
export const getManualTechniqueOption = getManualSourceTechniqueOption;
export const generateManualSourceOption = generateManualSourceTechniqueOption;
export const generateManualTechniquePreview = generateManualSourceTechniqueOption;
export const allManualSourceRecords = MANUAL_SOURCE_RECORDS;
