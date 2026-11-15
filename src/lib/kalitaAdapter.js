import { descriptorForMicrons, grinderSettingToMicrons, quantizeGrinderSetting, GRINDER_MICRON_SCALES } from './brewMethods.js';
import { kalitaDoseBounds, normalizeKalitaDose, normalizeKalitaSize } from '../data/kalitaConfiguration.js';

export const KALITA_ENGINE_VERSION = 'kalita-engine-v2';
export const KALITA_RULES_VERSION = 'kalita-rules-v5-pour-geometry';
export const KALITA_PHASE_CONTRACT_VERSION = 1;

const GRINDER_RANGES = {
  'fellow-ode-gen2': [4, 8], 'fellow-opus': [3, 8.5], 'baratza-encore-esp': [10, 32],
  'comandante-c40': [18, 38], '1zpresso-jx-pro': [90, 180], 'baratza-virtuoso-plus': [10, 32],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function normalizeKalitaConfiguration(config = {}) {
  const requestedDose = Number(config.dose);
  const rawSize = String(config.size || config.kalitaSize || '').replace('wave-', '');
  const size = normalizeKalitaSize(rawSize, requestedDose);
  const dose = normalizeKalitaDose(size, config.dose);
  const doseProfile = dose > 30 ? 'large-185' : size === '155' ? (dose > 18 ? '155-extended' : '155-small') : dose <= 22 ? '185-standard' : '185-large';
  return { size, dose, doseProfile, defaultedSize: rawSize !== '155' && rawSize !== '185', defaultedDose: config.dose == null || !Number.isFinite(requestedDose) };
}

function buildGrind(grinder, targetMicrons) {
  const scale = GRINDER_MICRON_SCALES[grinder] || GRINDER_MICRON_SCALES['fellow-ode-gen2'];
  const range = GRINDER_RANGES[grinder] || GRINDER_RANGES['fellow-ode-gen2'];
  const setting = quantizeGrinderSetting(clamp((targetMicrons - scale.base) / scale.perStep + 1, range[0], range[1]), GRINDER_MICRON_SCALES[grinder] ? grinder : 'fellow-ode-gen2');
  const microns = grinderSettingToMicrons(setting, GRINDER_MICRON_SCALES[grinder] ? grinder : 'fellow-ode-gen2');
  return { setting: String(setting), microns, description: descriptorForMicrons(microns) };
}

// Keep the bean-driven part of Kalita grind selection separate from the
// method baseline. Source-backed techniques can reuse this exact adjustment
// around their own published/compatible baseline instead of being reset to
// the generic 700/735µm Kalita starting point.
export function kalitaGrindAdjustmentMicrons(intent = {}) {
  return (intent.finesRisk === 'high' ? 55 : 0)
    + (intent.solubilityRisk === 'high' ? 30 : 0)
    + (Number(intent.grindAdjustmentMicrons) || 0);
}

export function kalitaGrindBaselineMicrons(size) {
  return 700 + (String(size) === '185' ? 35 : 0);
}

function techniqueFor(intent) {
  if (['low-agitation-center', 'bloom-led-pulse', 'center-to-spiral-pulse', 'low-agitation-no-swirl'].includes(intent.techniquePreference)) {
    return {
      key: intent.techniquePreference,
      code: `TECHNIQUE_${intent.techniquePreference.toUpperCase().replaceAll('-', '_')}`,
      finalSwirl: intent.techniquePreference === 'center-to-spiral-pulse',
    };
  }
  if (intent.finesRisk === 'high') return { key: 'low-agitation-center', code: 'HIGH_FINES_LOW_AGITATION', finalSwirl: false };
  if (intent.solubilityRisk === 'high') return { key: 'bloom-led-pulse', code: 'HIGH_SOLUBILITY_PULSE_CONTROL', finalSwirl: false };
  if (intent.energyTendency === 'higher') return { key: 'center-to-spiral-pulse', code: 'HIGH_ENERGY_EXTRACTION', finalSwirl: true };
  return { key: 'low-agitation-no-swirl', code: 'CONSERVATIVE_UNKNOWN_TECHNIQUE', finalSwirl: false };
}

// Pour geometry for the Wave. "Spiral" is a pour path; "swirl" is spinning
// the brewer. They are different levers and the copy keeps them apart.
// Published Wave recipes (src/data/manualSources/kalita.js and the Kalita
// iced registry) pour the bloom across the whole bed so every ground is wet,
// then pour the main water in circles or spirals over the flat bed while
// staying off the paper walls (Vibrant, Onyx, Onyx EU, Drop, Ozone, Coava).
// The low-agitation variants keep that path smaller and slower instead of
// banning it; Kurasu's iced recipe is the one published Wave source that says
// to avoid spirals and the iced adapter keeps that source's own words.
function techniqueInstructionFor(key) {
  if (key === 'center-to-spiral-pulse') {
    return 'Start in the center, then use a controlled spiral outward. Keep the stream on the coffee bed, not the paper walls.';
  }
  if (key === 'bloom-led-pulse') {
    return 'Let the bloom do the work, then use short, restrained pulses in small circles around the center. Keep the stream low and on the coffee bed.';
  }
  if (key === 'low-agitation-center') {
    return 'Wet the whole bed for the bloom, then pour gently in a tight circle around the center with a low stream. Keep the circle small and away from the paper. No swirl.';
  }
  return 'Wet the whole bed for the bloom, then pour in slow, small circles from the center outward, staying about 1 cm off the paper walls. Keep the stream low. No finishing swirl.';
}

function bloomAction(key, bloom) {
  const wet = `Bloom with ${bloom}g in the first 10-15 seconds, pouring in a spiral from the center out to the edge of the bed so every ground is wet; keep the stream off the paper`;
  if (key === 'low-agitation-center') return `${wet}. Do not swirl; let it rest.`;
  if (key === 'low-agitation-no-swirl') return `${wet}. No swirl needed; let it rest.`;
  return `${wet}, then give one gentle swirl to settle the bed and let it rest.`;
}

// Pour schedules per dose profile, timed from the first drop of bloom water
// (every published Wave recipe in src/data/manualSources/kalita.js counts the
// bloom pour inside the bloom window). Each pour is [start second, share of
// total water]. Totals follow the published Wave ranges: 155 at 15-16g
// finishes 2:30-3:00 (Ozone, Drop, Foundation), 185 at 20-22g 2:45-3:45
// (Onyx, Madcap), 185 at 25-30g 3:00-4:00 (Drop, Onyx, Ozone, George Howell).
// Doses above 22g split the water into four pours like Drop's 30g Wave 185
// recipe so no single pour overfills the brewer.
const KALITA_SCHEDULES = {
  '155-small': { pours: [[40, 0.45], [75, 1]], totalSeconds: 165 },
  '155-extended': { pours: [[40, 0.4], [65, 0.7], [90, 1]], totalSeconds: 195 },
  '185-standard': { pours: [[40, 0.45], [90, 1]], totalSeconds: 195 },
  '185-large': { pours: [[45, 0.4], [70, 0.6], [95, 0.8], [120, 1]], totalSeconds: 225 },
  'large-185': { pours: [[45, 0.4], [70, 0.6], [95, 0.8], [120, 1]], totalSeconds: 240 },
};

function firstPourAction(key, target) {
  if (key === 'center-to-spiral-pulse') return `Start in the center, then pour in a controlled spiral outward to ${target}g total; keep the stream on the coffee bed, not the paper walls.`;
  if (key === 'bloom-led-pulse') return `Pour a restrained pulse in small circles around the center to ${target}g total; keep the stream low and away from the paper walls.`;
  if (key === 'low-agitation-center') return `Pour gently in a tight circle around the center to ${target}g total; keep the stream low and the circle small, away from the paper.`;
  return `Pour in slow, small circles from the center outward to ${target}g total; keep the stream low and about 1 cm off the paper walls.`;
}

function middlePourAction(key, target) {
  if (key === 'center-to-spiral-pulse') return `Pour again with the same controlled spiral to ${target}g total; keep the stream on the coffee bed.`;
  if (key === 'bloom-led-pulse') return `Pour another restrained pulse in the same small circles to ${target}g total.`;
  if (key === 'low-agitation-center') return `Pour again in the same tight center circle to ${target}g total; keep the stream low.`;
  return `Pour again in the same slow, small circles to ${target}g total; stay off the paper walls.`;
}

function finalPourAction(technique, target) {
  if (technique.key === 'center-to-spiral-pulse') return `Finish at ${target}g total with a gentle center-to-outward spiral; ${technique.finalSwirl ? 'swirl once only if the bed is uneven.' : 'do not swirl.'}`;
  if (technique.key === 'bloom-led-pulse') return `Finish with a last restrained pulse in small center circles to ${target}g total; do not stir or swirl.`;
  if (technique.key === 'low-agitation-center') return `Finish at ${target}g total with the same tight center circle; do not stir or swirl, and let it draw down.`;
  return `Finish at ${target}g total with the same slow, small circles; no swirl needed, let it draw down.`;
}

export function validateKalitaCandidate(recipe) {
  const errors = [];
  const size = String(recipe?.kalitaSize || '');
  if (!recipe || recipe.device !== 'kalita' || recipe.mode !== 'hot' || recipe.isIced === true) errors.push('wrong-mode-or-device');
  if (!['155', '185'].includes(size) || recipe?.configurationKey !== `kalita:${size}:wave-paper:hot`) errors.push('invalid-configuration');
  const bounds = kalitaDoseBounds(size);
  if (!Number.isFinite(recipe?.coffeeGrams) || recipe.coffeeGrams < bounds.minDose || recipe.coffeeGrams > bounds.maxDose) errors.push('invalid-dose');
  if (!Number.isFinite(recipe?.coffeeGrams) || !Number.isFinite(recipe?.waterGrams)) errors.push('non-finite-dose-or-water');
  if (!Number.isFinite(recipe?.waterTemp?.celsius) || recipe.waterTemp.celsius < 93 || recipe.waterTemp.celsius > 100) errors.push('invalid-temperature');
  if (!recipe?.grindSize?.setting || !Number.isFinite(recipe?.grindSize?.microns)) errors.push('invalid-grind');
  let lastWater = -1;
  let lastTime = -1;
  for (const step of recipe?.steps || []) {
    if (!Number.isFinite(step.timeSeconds) || step.timeSeconds <= lastTime) errors.push('invalid-timer-sequence');
    if (!Number.isFinite(step.waterTotal) || step.waterTotal < lastWater) errors.push('invalid-water-sequence');
    lastTime = step.timeSeconds;
    lastWater = step.waterTotal;
  }
  if (recipe?.steps?.length && recipe.steps.at(-1).waterTotal !== recipe.waterGrams) errors.push('final-water-mismatch');
  if (!Array.isArray(recipe?.steps) || !recipe.steps.length || !Number.isFinite(recipe.totalBrewTimeSeconds) || recipe.totalBrewTimeSeconds <= lastTime) errors.push('invalid-total-duration');
  return { valid: errors.length === 0, errors };
}

export function generateKalitaRecipe(intent = {}, configuration = {}) {
  const config = normalizeKalitaConfiguration(configuration);
  const ratio = Number.isFinite(intent.targetRatio)
    ? clamp(intent.targetRatio, 15.5, 19)
    : intent.desiredStrength === 'stronger' ? 15.5 : config.doseProfile === 'large-185' ? 16.5 : 16;
  const waterGrams = Math.round(config.dose * ratio);
  const technique = techniqueFor(intent);
  const techniqueInstruction = techniqueInstructionFor(technique.key);
  const temperature = clamp(Number.isFinite(intent.targetTemperatureC)
    ? intent.targetTemperatureC
    : intent.energyTendency === 'lower' ? 93 : intent.energyTendency === 'higher' ? 97 : 96, 93, 100);
  const targetMicrons = kalitaGrindBaselineMicrons(config.size) + kalitaGrindAdjustmentMicrons(intent);
  const bloom = Math.round(config.dose * 3);
  const schedule = KALITA_SCHEDULES[config.doseProfile];
  const totalBrewTimeSeconds = schedule.totalSeconds + clamp(intent.contactTimeAdjustmentSeconds || 0, -15, 30);
  const reasonCodes = [
    ...(intent.reasonCodes || []), technique.code,
    config.doseProfile === '155-extended' ? 'WAVE_155_EXTENDED_DOSE_PROFILE' : config.size === '155' ? 'WAVE_155_SMALL_BED_PROFILE' : 'WAVE_185_DEEPER_BED_PROFILE',
    config.doseProfile === 'large-185' && 'LARGE_DOSE_EXTENDED_DRAWDOWN',
    config.defaultedSize && 'DEFAULTED_KALITA_SIZE', config.defaultedDose && 'DEFAULTED_KALITA_DOSE',
  ].filter(Boolean);
  const prepSteps = [
    { action: 'Rinse and preheat the Wave 155/185 filter and server; discard rinse water.', phase: 'prep' },
    { action: `Add ${config.dose}g coffee and level the bed.`, phase: 'prep' },
  ];
  const pourTargets = schedule.pours.map(([seconds, share]) => [seconds, Math.round(waterGrams * share)]);
  const steps = [
    { time: '0:00', timeSeconds: 0, action: bloomAction(technique.key, bloom), waterTotal: bloom, phase: 'brew' },
    ...pourTargets.map(([seconds, target], index) => ({
      time: timeLabel(seconds),
      timeSeconds: seconds,
      action: index === 0 ? firstPourAction(technique.key, target) : index === pourTargets.length - 1 ? finalPourAction(technique, target) : middlePourAction(technique.key, target),
      waterTotal: target,
    })),
  ];
  const recipe = {
    method: 'pour-over', device: 'kalita', mode: 'hot', kalitaSize: config.size, configurationKey: `kalita:${config.size}:wave-paper:hot`, doseProfile: config.doseProfile,
    engineVersion: KALITA_ENGINE_VERSION, rulesVersion: KALITA_RULES_VERSION, candidate: true,
    doseTimingPolicy: 'generated-dose-v1',
    coffeeGrams: config.dose, waterGrams, ratio: `1:${ratio}`, waterTemp: { celsius: temperature, fahrenheit: Math.round(temperature * 9 / 5 + 32) },
    grindSize: buildGrind(configuration.grinder || 'fellow-ode-gen2', targetMicrons), technique: technique.key,
    drawdownTarget: `${timeLabel(totalBrewTimeSeconds - 25)}-${timeLabel(totalBrewTimeSeconds + 20)}`,
    prepSteps, steps, postBrewSteps: [], phaseContractVersion: KALITA_PHASE_CONTRACT_VERSION,
    techniqueInstruction, totalBrewTime: timeLabel(totalBrewTimeSeconds), totalBrewTimeSeconds, guideTargetSeconds: totalBrewTimeSeconds, timerReady: true,
    reasonCodes, confidence: intent.confidence || 'low', evidenceHash: intent.evidenceHash || null,
    reasoning: `For this bean, the Wave ${config.size} recipe uses a ${technique.key.replaceAll('-', ' ')} profile based on the coffee's extraction characteristics. Adjust one lever at a time from drawdown and taste.`,
    tips: `Aim for ${timeLabel(totalBrewTimeSeconds - 25)} to ${timeLabel(totalBrewTimeSeconds + 20)}. If it stalls, go coarser before reducing agitation; if it races and tastes thin, make one bounded finer or hotter adjustment.`,
    title: `Kalita Wave ${config.size} recipe`,
  };
  const validation = validateKalitaCandidate(recipe);
  if (!validation.valid) throw new Error(`Kalita candidate contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}
