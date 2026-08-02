import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';

export const KALITA_ENGINE_VERSION = 'kalita-engine-v2';
export const KALITA_RULES_VERSION = 'kalita-rules-v3-phase1';
export const KALITA_PHASE_CONTRACT_VERSION = 1;

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
  const doseProfile = dose > 30 ? 'large-185' : size === '155' ? (dose > 18 ? '155-extended' : '155-small') : dose <= 22 ? '185-standard' : '185-large';
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

function techniqueInstructionFor(key) {
  if (key === 'center-to-spiral-pulse') {
    return 'Start in the center, then use a controlled spiral outward. Keep the stream on the coffee bed, not the paper walls.';
  }
  if (key === 'bloom-led-pulse') {
    return 'Let the bloom do the work, then use two restrained center pulses. Keep the stream on the coffee bed; do not use a wide spiral.';
  }
  if (key === 'low-agitation-no-swirl') {
    return 'Use slow, centered pours with a low stream. Do not spiral or swirl.';
  }
  return 'Pour slowly and directly into the center with a low stream. Do not spiral or swirl.';
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
  const ratio = Number.isFinite(intent.targetRatio)
    ? clamp(intent.targetRatio, 15.5, 19)
    : intent.desiredStrength === 'stronger' ? 15.5 : config.doseProfile === 'large-185' ? 16.5 : 16;
  const waterGrams = Math.round(config.dose * ratio);
  const technique = techniqueFor(intent);
  const techniqueInstruction = techniqueInstructionFor(technique.key);
  const temperature = clamp(Number.isFinite(intent.targetTemperatureC)
    ? intent.targetTemperatureC
    : intent.energyTendency === 'lower' ? 93 : intent.energyTendency === 'higher' ? 97 : 96, 93, 100);
  const targetMicrons = 700 + (config.size === '185' ? 35 : 0) + (intent.finesRisk === 'high' ? 55 : 0) + (intent.solubilityRisk === 'high' ? 30 : 0) + (intent.grindAdjustmentMicrons || 0);
  const bloom = Math.round(config.dose * 3);
  const first = Math.round(waterGrams * 0.45);
  const finalStepAt = config.doseProfile === '155-small' ? 105 : config.doseProfile === '155-extended' || config.doseProfile === '185-standard' ? 120 : 150;
  const firstPourAt = 30;
  const finalPourAt = finalStepAt - 30;
  const drawdownSeconds = config.doseProfile === '155-small' ? 165 : config.doseProfile === '155-extended' ? 195 : config.doseProfile === '185-standard' ? 210 : 270;
  const totalBrewTimeSeconds = finalStepAt + drawdownSeconds - 30 + clamp(intent.contactTimeAdjustmentSeconds || 0, -15, 30);
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
  const steps = [
    { time: '0:00', timeSeconds: 0, action: `Bloom with ${bloom}g water; ${technique.key.includes('low-agitation') ? 'keep the stream centered and do not swirl.' : 'give one gentle settling swirl, then let the bloom rest.'}`, waterTotal: bloom, phase: 'brew' },
    { time: timeLabel(firstPourAt), timeSeconds: firstPourAt, action: technique.key === 'center-to-spiral-pulse'
      ? `Start in the center, then pour in a controlled spiral outward to ${first}g total; keep the stream on the coffee bed, not the paper walls.`
      : technique.key === 'bloom-led-pulse'
        ? `Pour from the center in a restrained pulse to ${first}g total; keep the stream on the coffee bed and away from the paper walls.`
        : `Pour slowly and directly into the center to ${first}g total; keep the stream low and do not spiral.`, waterTotal: first },
    { time: timeLabel(finalPourAt), timeSeconds: finalPourAt, action: technique.key === 'center-to-spiral-pulse'
      ? `Finish at ${waterGrams}g total with a gentle center-to-outward spiral; ${technique.finalSwirl ? 'swirl once only if the bed is uneven.' : 'do not swirl.'}`
      : technique.key === 'bloom-led-pulse'
        ? `Finish with a second restrained center pulse to ${waterGrams}g total; do not use a wide spiral or stir.`
        : `Finish at ${waterGrams}g total with another low, centered pour; do not spiral or swirl.`, waterTotal: waterGrams },
  ];
  const recipe = {
    method: 'pour-over', device: 'kalita', kalitaSize: config.size, doseProfile: config.doseProfile,
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
