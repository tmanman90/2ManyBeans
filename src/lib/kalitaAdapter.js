import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';

export const KALITA_ENGINE_VERSION = 'kalita-engine-v1';
export const KALITA_RULES_VERSION = 'kalita-rules-v1';

const GRINDER_RANGES = {
  'fellow-ode-gen2': [4, 8], 'fellow-opus': [3, 8.5], 'baratza-encore-esp': [10, 32],
  'comandante-c40': [18, 38], '1zpresso-jx-pro': [90, 180], 'baratza-virtuoso-plus': [10, 32],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function normalizeKalitaConfiguration(config = {}) {
  const rawSize = String(config.size || config.kalitaSize || '').replace('wave-', '');
  const requestedDose = Number(config.dose);
  const size = rawSize === '155' || rawSize === '185' ? rawSize : requestedDose > 18 ? '185' : '155';
  const defaultDose = size === '155' ? 15 : 20;
  const dose = Number.isFinite(requestedDose) && requestedDose >= 12 && requestedDose <= 36 ? requestedDose : defaultDose;
  const doseProfile = dose > 30 ? 'large-185' : size === '155' ? '155-small' : dose <= 22 ? '185-standard' : '185-large';
  return { size, dose, doseProfile, defaultedSize: rawSize !== '155' && rawSize !== '185', defaultedDose: !Number.isFinite(requestedDose) };
}

function buildGrind(grinder, targetMicrons) {
  const scale = GRINDER_MICRON_SCALES[grinder] || GRINDER_MICRON_SCALES['fellow-ode-gen2'];
  const range = GRINDER_RANGES[grinder] || GRINDER_RANGES['fellow-ode-gen2'];
  const setting = Math.round(clamp((targetMicrons - scale.base) / scale.perStep + 1, range[0], range[1]) * 10) / 10;
  const microns = grinderSettingToMicrons(setting, GRINDER_MICRON_SCALES[grinder] ? grinder : 'fellow-ode-gen2');
  return { setting: String(setting), microns, description: descriptorForMicrons(microns) };
}

function techniqueFor(intent) {
  if (intent.finesRisk === 'high') return { key: 'low-agitation-center', code: 'HIGH_FINES_LOW_AGITATION', finalSwirl: false };
  if (intent.solubilityRisk === 'high') return { key: 'bloom-led-pulse', code: 'HIGH_SOLUBILITY_PULSE_CONTROL', finalSwirl: false };
  if (intent.energyTendency === 'higher') return { key: 'center-to-spiral-pulse', code: 'HIGH_ENERGY_EXTRACTION', finalSwirl: true };
  return { key: 'low-agitation-no-swirl', code: 'CONSERVATIVE_UNKNOWN_TECHNIQUE', finalSwirl: false };
}

export function validateKalitaCandidate(recipe) {
  const errors = [];
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
  if (!Array.isArray(recipe?.steps) || !recipe.steps.length || !Number.isFinite(recipe.totalBrewTimeSeconds) || recipe.totalBrewTimeSeconds <= lastTime) errors.push('invalid-total-duration');
  return { valid: errors.length === 0, errors };
}

export function generateKalitaRecipe(intent = {}, configuration = {}) {
  const config = normalizeKalitaConfiguration(configuration);
  const ratio = intent.desiredStrength === 'stronger' ? 15.5 : config.doseProfile === 'large-185' ? 16.5 : 16;
  const waterGrams = Math.round(config.dose * ratio);
  const technique = techniqueFor(intent);
  const temperature = clamp(intent.energyTendency === 'lower' ? 93 : intent.energyTendency === 'higher' ? 98 : 96, 93, 100);
  const targetMicrons = 700 + (config.size === '185' ? 35 : 0) + (intent.finesRisk === 'high' ? 55 : 0) + (intent.solubilityRisk === 'high' ? 30 : 0);
  const bloom = Math.round(config.dose * 3);
  const first = Math.round(waterGrams * 0.45);
  const second = Math.round(waterGrams * 0.75);
  const finalStepAt = config.doseProfile === '155-small' ? 105 : config.doseProfile === '185-standard' ? 120 : 150;
  const drawdownSeconds = config.doseProfile === '155-small' ? 165 : config.doseProfile === '185-standard' ? 210 : 270;
  const totalBrewTimeSeconds = finalStepAt + drawdownSeconds - 30;
  const reasonCodes = [
    ...(intent.reasonCodes || []), technique.code,
    config.size === '155' ? 'WAVE_155_SMALL_BED_PROFILE' : 'WAVE_185_DEEPER_BED_PROFILE',
    config.doseProfile === 'large-185' && 'LARGE_DOSE_EXTENDED_DRAWDOWN',
    config.defaultedSize && 'DEFAULTED_KALITA_SIZE', config.defaultedDose && 'DEFAULTED_KALITA_DOSE',
  ].filter(Boolean);
  const steps = [
    { time: '0:00', timeSeconds: 0, action: `Add ${config.dose}g coffee and level the bed.`, waterTotal: 0 },
    { time: '0:30', timeSeconds: 30, action: `Bloom with ${bloom}g water; ${technique.key.includes('low-agitation') ? 'do not swirl.' : 'give one gentle settling swirl.'}`, waterTotal: bloom },
    { time: '1:00', timeSeconds: 60, action: `Pour to ${first}g total with a ${technique.key === 'center-to-spiral-pulse' ? 'center-to-spiral' : 'low, centered'} stream.`, waterTotal: first },
    { time: timeLabel(finalStepAt), timeSeconds: finalStepAt, action: `Finish at ${waterGrams}g total${technique.finalSwirl ? '; one gentle finishing swirl only if the bed is uneven.' : '; keep the final pour low-agitation.'}`, waterTotal: waterGrams },
  ];
  const recipe = {
    method: 'pour-over', device: 'kalita', kalitaSize: config.size, doseProfile: config.doseProfile,
    engineVersion: KALITA_ENGINE_VERSION, rulesVersion: KALITA_RULES_VERSION, candidate: true,
    coffeeGrams: config.dose, waterGrams, ratio: `1:${ratio}`, waterTemp: { celsius: temperature, fahrenheit: Math.round(temperature * 9 / 5 + 32) },
    grindSize: buildGrind(configuration.grinder || 'fellow-ode-gen2', targetMicrons), technique: technique.key,
    drawdownTarget: `${timeLabel(totalBrewTimeSeconds - 25)}-${timeLabel(totalBrewTimeSeconds + 20)}`,
    steps, totalBrewTime: timeLabel(totalBrewTimeSeconds), totalBrewTimeSeconds, timerReady: true,
    reasonCodes, confidence: intent.confidence || 'low', evidenceHash: intent.evidenceHash || null,
    reasoning: `Wave ${config.size} uses a ${technique.key.replaceAll('-', ' ')} profile for this ${intent.confidence || 'low'}-confidence extraction intent. Adjust one lever at a time from drawdown and taste.`,
    tips: `Aim for ${timeLabel(totalBrewTimeSeconds - 25)} to ${timeLabel(totalBrewTimeSeconds + 20)}. If it stalls, go coarser before reducing agitation; if it races and tastes thin, make one bounded finer or hotter adjustment.`,
    title: `Kalita Wave ${config.size} recipe`,
  };
  const validation = validateKalitaCandidate(recipe);
  if (!validation.valid) throw new Error(`Kalita candidate contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}
