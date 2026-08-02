import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';
import { V60_SOURCE_REGISTRY_VERSION, V60_SOURCES, V60_TECHNIQUES, sourceById } from '../data/v60SourceRegistry.js';

export const V60_ENGINE_VERSION = 'v60-hot-engine-v1';
export const V60_RULES_VERSION = 'v60-hot-rules-v1';
export const V60_CONFIGURATION_KEY = 'v60:02:standard-paper';
export const V60_PHASE_CONTRACT_VERSION = 1;
export const V60_ADAPTATION_RULE_ID = 'v60-adaptation-bounded-v1';
export const V60_SCALING_RULE_ID = 'v60-dose-scaling-v1';
const MIN_DOSE = 12;
const MAX_DOSE = 30;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const round = (value) => Math.round(value);

export function normalizeV60Configuration(config = {}) {
  const requestedDose = Number(config.dose);
  const dose = Number.isFinite(requestedDose) ? requestedDose : 15;
  if (dose < MIN_DOSE || dose > MAX_DOSE) throw new Error(`V60 02 dose must be between ${MIN_DOSE}g and ${MAX_DOSE}g`);
  return {
    dose,
    grinder: config.grinder || 'fellow-ode-gen2',
    configurationKey: V60_CONFIGURATION_KEY,
    doseProfile: dose <= 18 ? 'small-12-18' : dose <= 24 ? 'medium-19-24' : 'large-25-30',
  };
}

function intentValue(intent, key, fallback = null) {
  return intent && intent[key] != null ? intent[key] : fallback;
}

function sourceRecipeFor(evidence) {
  const recipes = evidence?.sourceInsights?.brewRecipes;
  if (!Array.isArray(recipes)) return null;
  return recipes.find((recipe) => recipe.mode === 'hot'
    && String(recipe.device).toLowerCase() === 'v60'
    && (!recipe.configuration || recipe.configuration === V60_CONFIGURATION_KEY)) || null;
}

export function selectV60Technique(intent = {}, configuration = {}, evidence = null) {
  const config = normalizeV60Configuration(configuration);
  const exact = sourceRecipeFor(evidence);
  if (exact) return { ...V60_TECHNIQUES.smallPulse, id: 'direct-roaster-v60', sourceIds: [exact.id], sourceRecipe: exact, reasonCode: 'EXACT_STRUCTURED_SOURCE' };
  const finesRisk = intentValue(intent, 'finesRisk', 'unknown');
  const energy = intentValue(intent, 'energyTendency', 'conservative');
  const cupDirection = intentValue(intent, 'cupDirection', {});
  const family = String(intentValue(intent, 'family', '')).toLowerCase();
  if (finesRisk === 'high') return { ...V60_TECHNIQUES.gentle, reasonCode: 'HIGH_FINES_LOW_AGITATION' };
  if (config.dose >= 25) return { ...V60_TECHNIQUES.largeBatch, reasonCode: 'LARGE_DOSE_DEDICATED_PROFILE' };
  if (intentValue(intent, 'techniquePreference') === 'bloom-led-pulse' || family.includes('natural')) return { ...V60_TECHNIQUES.coarse46, reasonCode: 'COARSE_PULSE_SOLUBILITY_PROFILE' };
  if (energy === 'higher' && finesRisk !== 'high') return { ...V60_TECHNIQUES.twoStage, reasonCode: 'HIGH_ENERGY_LOW_FINES_PROFILE' };
  if (cupDirection?.body === 'supported' || intentValue(intent, 'desiredStrength') === 'stronger') return { ...V60_TECHNIQUES.controlled, reasonCode: 'FULLER_CONTROLLED_PULSE_PROFILE' };
  if (energy === 'lower' || intentValue(intent, 'techniquePreference') === 'low-agitation-center') return { ...V60_TECHNIQUES.gentle, reasonCode: 'LOW_ENERGY_GENTLE_PROFILE' };
  return { ...V60_TECHNIQUES.smallPulse, reasonCode: 'BALANCED_SMALL_DOSE_PROFILE' };
}

function grindFor(grinder, technique, intent) {
  const targetMicrons = clamp(
    technique.id === 'hoffmann-large-batch' ? 760
      : technique.id === 'kasuya-coarse-pulses' ? 850
        : technique.id === 'rao-two-stage' ? 610
          : technique.id === 'gentle-main-pour' ? 720 : 660,
    380, 1050,
  ) + clamp(Number(intentValue(intent, 'grindAdjustmentMicrons', 0)) || 0, -45, 45);
  const scale = GRINDER_MICRON_SCALES[grinder];
  if (!scale) {
    return {
      setting: null, microns: round(targetMicrons), micronRange: [round(targetMicrons - 35), round(targetMicrons + 35)],
      description: descriptorForMicrons(targetMicrons), grinderSpecific: false,
    };
  }
  const raw = clamp((targetMicrons - scale.base) / scale.perStep + 1, 1, 40);
  const setting = Math.round(raw * 10) / 10;
  const microns = grinderSettingToMicrons(setting, grinder);
  return { setting: String(setting), microns, description: descriptorForMicrons(microns), grinderSpecific: true };
}

function techniqueShape(technique, dose, water, source, intent = {}) {
  const bloom = round(dose * 3);
  if (technique.id === 'hoffmann-large-batch') return [
    [0, source.bloomGrams || 60, `Bloom with ${source.bloomGrams || 60}g from the center; wet the whole bed.`],
    [45, round(water * 0.6), `Pour to ${round(water * 0.6)}g total with a controlled spiral; filter contact is acceptable in this source method.`],
    [75, water, `Finish with a center pour at ${water}g, then stir and give one gentle settling swirl.`],
  ];
  if (technique.id === 'kasuya-coarse-pulses') return [
    [0, bloom, `Bloom with ${bloom}g in the center; no swirl.`],
    [35, round(water * 0.4), `Pulse from center in a small spiral to ${round(water * 0.4)}g; keep off paper.`],
    [75, round(water * 0.65), `Second controlled pulse to ${round(water * 0.65)}g; low stream, no stir.`],
    [115, water, `Final centered pulse to ${water}g; let it drain without a final swirl.`],
  ];
  if (technique.id === 'rao-two-stage') return [
    [0, source.bloomGrams || bloom, `Bloom aggressively to ${source.bloomGrams || bloom}g from center with the source spin.`],
    [45, round(water * 0.55), `Pour a steady center-to-spiral stream to ${round(water * 0.55)}g, then use a gentle settling spin.`],
    [100, water, `Complete the second controlled spiral to ${water}g, then use a second gentle settling spin.`],
  ];
  if (technique.id === 'gentle-main-pour') return [
    [0, source.bloomRangeGrams ? source.bloomRangeGrams[0] : bloom, intent.finesRisk === 'high'
      ? `Bloom the center with ${source.bloomRangeGrams ? `${source.bloomRangeGrams[0]}–${source.bloomRangeGrams[1]}` : bloom}g; use the bounded high-fines rule and do not stir.`
      : `Stir the vigorous center bloom with ${source.bloomRangeGrams ? `${source.bloomRangeGrams[0]}–${source.bloomRangeGrams[1]}` : bloom}g, following the source bloom energy.`],
    [45, water, intent.finesRisk === 'high'
      ? `Use one slow center pour to ${water}g; finish without a final stir to limit fines migration.`
      : `Use one slow center pour to ${water}g; finish with the source's final stir.`],
  ];
  if (technique.id === 'kurasu-controlled-pulses') return [
    [0, bloom, `Bloom with ${bloom}g in a small center circle; let the bed settle.`],
    [45, round(water * 0.5), `Controlled low-radius pulse to ${round(water * 0.5)}g; avoid the paper walls.`],
    [100, water, `Finish with a second low-radius pulse to ${water}g; no universal swirl.`],
  ];
  return [
    [0, bloom, `Bloom with ${bloom}g from the center; wet the bed evenly and let it rest.`],
    [45, round(water * 0.5), `Pour a controlled spiral to ${round(water * 0.5)}g; keep the stream low and off paper.`],
    [105, water, `Finish with a gentle center-to-outward spiral to ${water}g; swirl only if the bed is visibly uneven.`],
  ];
}

function buildRecipe(intent, config, technique, { fallback = false } = {}) {
  const source = technique.sourceRecipe || sourceById(technique.sourceIds[0]) || V60_SOURCES[0];
  const ratio = clamp(Number(source.ratio) || Number(intentValue(intent, 'targetRatio', 16.5)) || 16.5, 15, 18.5);
  const waterGrams = round(config.dose * ratio);
  const temperature = clamp(Number(intentValue(intent, 'targetTemperatureC', source.temperatureC || 96)) || 96, 92, 100);
  const shape = techniqueShape(technique, config.dose, waterGrams, source, intent);
  const finalAt = shape.at(-1)[0];
  const guide = clamp(round((source.guideSeconds || 210) + (config.dose >= 25 ? 45 : 0) + (technique.id === 'gentle-main-pour' ? -10 : 0)), 150, 360);
  const prepSteps = [
    { action: 'Rinse and preheat the V60 02 filter and server; discard rinse water.', phase: 'prep' },
    { action: `Add ${config.dose}g coffee, settle, and level the bed.`, phase: 'prep' },
  ];
  const steps = shape.map(([timeSeconds, waterTotal, action]) => ({ timeSeconds, time: timeLabel(timeSeconds), waterTotal, action, phase: 'brew' }));
  const sourceIds = technique.sourceRecipe ? [technique.sourceRecipe.id] : technique.sourceIds;
  const sourceSupportsV60 = source.supportedV60_02 !== false;
  const parameterRule = sourceSupportsV60 ? sourceIds[0] : V60_ADAPTATION_RULE_ID;
  const exactSourceDose = sourceSupportsV60 && config.dose === source.doseGrams;
  const scaled = sourceSupportsV60 && !exactSourceDose;
  const scalingFields = scaled ? ['dose', 'water', 'bloom', 'cadence', 'guide'] : [];
  const lineage = {
    method: 'v60', mode: 'hot', configurationKey: V60_CONFIGURATION_KEY, technique: technique.id,
    sourceIds, sourceRegistryVersion: V60_SOURCE_REGISTRY_VERSION, status: !sourceSupportsV60 ? 'adapted' : exactSourceDose ? 'original' : 'scaled', adaptation: technique.sourceRecipe ? 'Structured source bounded to V60 02 and requested dose.' : sourceSupportsV60 ? `App profile based on ${source.author}.` : `Adapted profile based on incomplete ${source.author} evidence; V60 02 fields use ${V60_ADAPTATION_RULE_ID}.`,
    changedFields: [...scalingFields, !sourceSupportsV60 && 'brewer', !sourceSupportsV60 && 'dose', !sourceSupportsV60 && 'ratio', !sourceSupportsV60 && 'temperature', !sourceSupportsV60 && 'grind', technique.id === 'gentle-main-pour' && 'agitation'].filter(Boolean),
    parameterSources: { ratio: sourceSupportsV60 ? sourceIds[0] : parameterRule, dose: exactSourceDose ? sourceIds[0] : 'user-configuration', temperature: sourceSupportsV60 && source.temperatureC ? sourceIds[0] : parameterRule, grind: sourceSupportsV60 && source.grind ? sourceIds[0] : parameterRule, geometry: sourceIds[0], agitation: technique.id === 'gentle-main-pour' ? V60_ADAPTATION_RULE_ID : sourceIds[0], water: scaled ? V60_SCALING_RULE_ID : sourceIds[0], bloom: scaled ? V60_SCALING_RULE_ID : sourceIds[0], cadence: scaled ? V60_SCALING_RULE_ID : sourceIds[0], guide: scaled ? V60_SCALING_RULE_ID : (sourceSupportsV60 ? sourceIds[0] : parameterRule) },
  };
  return {
    method: 'pour-over', device: 'v60', mode: 'hot', isIced: false, configurationKey: V60_CONFIGURATION_KEY,
    v60Size: '02', doseProfile: config.doseProfile, coffeeGrams: config.dose, waterGrams, ratio: `1:${ratio}`,
    waterTemp: { celsius: temperature, fahrenheit: Math.round(temperature * 9 / 5 + 32) }, grindSize: grindFor(config.grinder, technique, intent),
    technique: technique.id, techniqueLabel: technique.label, techniqueInstruction: `${technique.label}: center start, low stream, keep water off the paper walls.`,
    prepSteps, steps, postBrewSteps: [], totalBrewTimeSeconds: guide, totalBrewTime: timeLabel(guide), guideTargetSeconds: guide,
    guideRangeSeconds: [Math.max(guide - 30, finalAt + 30), guide + 30], timerReady: true, phaseContractVersion: V60_PHASE_CONTRACT_VERSION,
    candidate: true, doseTimingPolicy: 'generated-dose-v60-v1', engineVersion: V60_ENGINE_VERSION, rulesVersion: V60_RULES_VERSION,
    sourceRegistryVersion: V60_SOURCE_REGISTRY_VERSION, sourceLineage: lineage, timingProfile: `v60:hot:${technique.id}`,
    reasonCodes: [...(intent.reasonCodes || []), technique.reasonCode, fallback && 'V60_CONSERVATIVE_BASELINE'].filter(Boolean),
    fallback: Boolean(fallback), generationStatus: fallback ? 'fallback' : 'candidate',
    reasoning: `This ${technique.label} profile fits the ${config.doseProfile.replaceAll('-', ' ')} bed and the available extraction evidence.`,
    tips: `Guide finish ${timeLabel(guide)} is a starting point. Finish when dripping ends; timing is an observation, not a taste verdict.`,
    title: 'V60 02 bean-specific recipe',
  };
}

export function validateV60Candidate(recipe) {
  const errors = [];
  if (!recipe || recipe.device !== 'v60' || recipe.mode !== 'hot' || recipe.isIced) errors.push('wrong-mode-or-device');
  if (recipe?.configurationKey !== V60_CONFIGURATION_KEY || recipe?.v60Size !== '02') errors.push('invalid-configuration');
  if (!Number.isFinite(recipe?.coffeeGrams) || recipe.coffeeGrams < MIN_DOSE || recipe.coffeeGrams > MAX_DOSE) errors.push('invalid-dose');
  if (!Number.isFinite(recipe?.waterGrams) || recipe.waterGrams <= 0 || !Number.isFinite(recipe?.waterTemp?.celsius)) errors.push('invalid-physical-values');
  if (!recipe?.sourceLineage?.sourceRegistryVersion || !recipe?.sourceLineage?.parameterSources) errors.push('missing-provenance');
  if (!Array.isArray(recipe?.prepSteps) || !recipe.prepSteps.length) errors.push('missing-prep');
  let lastWater = -1; let lastTime = -1;
  if (!Array.isArray(recipe?.steps) || !recipe.steps.length) errors.push('missing-steps');
  for (const step of recipe?.steps || []) {
    if (!Number.isFinite(step.timeSeconds) || step.timeSeconds <= lastTime) errors.push('invalid-timer-sequence');
    if (!Number.isFinite(step.waterTotal) || step.waterTotal < lastWater || !step.action || !/center|spiral|pulse/i.test(step.action)) errors.push('invalid-step-copy-or-water');
    lastTime = step.timeSeconds; lastWater = step.waterTotal;
  }
  if (lastWater !== recipe?.waterGrams) errors.push('final-water-mismatch');
  if (!Number.isFinite(recipe?.guideTargetSeconds) || recipe.guideTargetSeconds <= lastTime) errors.push('invalid-guide');
  if (!recipe?.technique || !Object.values(V60_TECHNIQUES).some((technique) => technique.id === recipe.technique) && recipe.technique !== 'direct-roaster-v60') errors.push('closed-technique-failure');
  return { valid: errors.length === 0, errors };
}

export function generateV60Recipe(intent = {}, configuration = {}, evidence = null) {
  const config = normalizeV60Configuration(configuration);
  const technique = selectV60Technique(intent, config, evidence);
  const recipe = buildRecipe(intent, config, technique);
  const validation = validateV60Candidate(recipe);
  if (!validation.valid) throw new Error(`V60 candidate contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}

export function generateV60Fallback(configuration = {}, reason = 'candidate-failed') {
  const config = normalizeV60Configuration(configuration);
  const recipe = buildRecipe({}, config, { ...V60_TECHNIQUES.smallPulse, reasonCode: 'V60_CONSERVATIVE_BASELINE' }, { fallback: true });
  recipe.fallbackReason = reason;
  const validation = validateV60Candidate(recipe);
  if (!validation.valid) throw new Error(`V60 fallback contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}
