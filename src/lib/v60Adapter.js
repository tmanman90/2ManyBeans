import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';
import { V60_SOURCE_REGISTRY_VERSION, V60_SOURCES, V60_TECHNIQUES, sourceById } from '../data/v60SourceRegistry.js';

export const V60_ENGINE_VERSION = 'v60-hot-engine-v1';
export const V60_RULES_VERSION = 'v60-hot-rules-v1';
export const V60_CONFIGURATION_KEY = 'v60:02:standard-paper';
export const V60_PHASE_CONTRACT_VERSION = 1;
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

function techniqueShape(technique, dose, water) {
  const bloom = round(dose * 3);
  if (technique.id === 'hoffmann-large-batch') return [
    [0, bloom, `Bloom with ${bloom}g from the center; wet the whole bed without touching the paper.`],
    [45, round(water * 0.55), `Pour a low spiral to ${round(water * 0.55)}g total; keep the stream on the coffee bed.`],
    [120, water, `Finish with a controlled outward spiral to ${water}g; keep water off the paper walls. Do not swirl.`],
  ];
  if (technique.id === 'kasuya-coarse-pulses') return [
    [0, bloom, `Bloom with ${bloom}g in the center; no swirl.`],
    [35, round(water * 0.4), `Pulse from center in a small spiral to ${round(water * 0.4)}g; keep off paper.`],
    [75, round(water * 0.65), `Second controlled pulse to ${round(water * 0.65)}g; low stream, no stir.`],
    [115, water, `Final centered pulse to ${water}g; let it drain without a final swirl.`],
  ];
  if (technique.id === 'rao-two-stage') return [
    [0, bloom, `Bloom aggressively to ${bloom}g from center; one settling spin only if the bed is even.`],
    [45, round(water * 0.55), `Pour a steady center-to-spiral stream to ${round(water * 0.55)}g; keep off paper.`],
    [100, water, `Complete the second controlled spiral to ${water}g; stop agitation and let it drain.`],
  ];
  if (technique.id === 'gentle-main-pour') return [
    [0, bloom, `Bloom gently with ${bloom}g in the center; do not swirl.`],
    [45, water, `Use one low, continuous center-to-small-spiral pour to ${water}g; keep water off the paper.`],
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
  const shape = techniqueShape(technique, config.dose, waterGrams);
  const finalAt = shape.at(-1)[0];
  const guide = clamp(round((source.guideSeconds || 210) + (config.dose >= 25 ? 45 : 0) + (technique.id === 'gentle-main-pour' ? -10 : 0)), 150, 360);
  const prepSteps = [
    { action: 'Rinse and preheat the V60 02 filter and server; discard rinse water.', phase: 'prep' },
    { action: `Add ${config.dose}g coffee, settle, and level the bed.`, phase: 'prep' },
  ];
  const steps = shape.map(([timeSeconds, waterTotal, action]) => ({ timeSeconds, time: timeLabel(timeSeconds), waterTotal, action, phase: 'brew' }));
  const sourceIds = technique.sourceRecipe ? [technique.sourceRecipe.id] : technique.sourceIds;
  const lineage = {
    method: 'v60', mode: 'hot', configurationKey: V60_CONFIGURATION_KEY, technique: technique.id,
    sourceIds, sourceRegistryVersion: V60_SOURCE_REGISTRY_VERSION, adaptation: technique.sourceRecipe ? 'Structured source bounded to V60 02 and requested dose.' : `App profile based on ${source.author}.`,
    parameterSources: { ratio: sourceIds[0], dose: sourceIds[0], temperature: sourceIds[0], grind: sourceIds[0], geometry: sourceIds[0], agitation: sourceIds[0], guide: sourceIds[0] },
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
