import {
  V60_RULES,
  V60_SOURCE_REGISTRY_VERSION,
  V60_SOURCES,
  V60_TECHNIQUES,
  sourceById,
} from '../../data/v60SourceRegistry.js';
import { generateV60RecipeForTechnique } from '../v60Adapter.js';

export const RUPHUS_V60_TECHNIQUE_OPTIONS_VERSION = 'ruphus-v60-technique-options-v1';

const DOSE_BOUNDS = Object.freeze([...V60_RULES['v60-dose-scaling-v1'].bounds.dose]);
const ADAPTATION_RULE_ID = 'v60-adaptation-bounded-v1';
const SCALING_RULE_ID = 'v60-dose-scaling-v1';

// These are deliberately descriptive app-facing differences, assembled only
// from fields in the audited source registry. They are not a second recipe
// corpus and cannot make an otherwise ineligible source executable.
const DIFFERENCES = Object.freeze({
  'hoffmann-one-cup-v1': [
    'Four controlled pulse pours after a 50g bloom.',
    'Medium-fine grind with a gentle bloom and final swirl.',
  ],
  'hoffmann-large-batch-v1': [
    'Dedicated large-batch cadence: 60g bloom, then staged pours to 300g and 500g.',
    'Stir and swirl after the final pour; filter contact is not prohibited by the source.',
  ],
  'kasuya-46-v1': [
    'Five centered pulses using the 4:6 method.',
    'Coarse grind and no final swirl.',
  ],
  'heart-continuous-v1': [
    'One slow, continuous center pour after a 40–50g bloom.',
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
    name: family.label,
    label: family.label,
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
    .map(({ source: _source, ...option }) => ({ ...option }));
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
