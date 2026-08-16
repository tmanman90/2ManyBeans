// Deterministic Hario V60 Switch 03 (hybrid) recipe adapter. Sibling to
// v60Adapter.js — device stays 'v60', variant is 'switch'. Owns valve-schedule
// physics (percolation -> close+steep -> open+drain), dual temperature, and
// steep-aware grind. Mirrors kalitaAdapter.js's shape (reason codes,
// configurationKey convention, recipe object contract, fail-closed
// validation) per the plan's Key Technical Decisions.
import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';
import {
  V60_SWITCH_SIZE, V60_SWITCH_CONFIGURATION_KEY, V60_SWITCH_DOSE_BOUNDS, V60_SWITCH_WATER_CAP_GRAMS,
  V60_SWITCH_CLASSIC_BASELINE_MICRONS, V60_SWITCH_ROAST_PRESETS, V60_SWITCH_PROCESS_OVERRIDE, V60_SWITCH_GUARDRAILS,
  normalizeSwitchDose, normalizeSwitchRoast, resolveSwitchWater,
} from '../data/v60SwitchConfiguration.js';
import { V60_SWITCH_SOURCE_REGISTRY_VERSION, sourceById } from '../data/v60SwitchSourceRegistry.js';

export const V60_SWITCH_ENGINE_VERSION = 'v60-switch-engine-v1';
export const V60_SWITCH_RULES_VERSION = 'v60-switch-rules-v1-phase1';
export const V60_SWITCH_PHASE_CONTRACT_VERSION = 1;

const GRINDER_RANGES = {
  'fellow-ode-gen2': [4, 8], 'fellow-opus': [3, 8.5], 'baratza-encore-esp': [10, 32],
  'comandante-c40': [18, 38], '1zpresso-jx-pro': [90, 180], 'baratza-virtuoso-plus': [10, 32],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const round = (value) => Math.round(value);
const displayRatio = (value) => Math.round(value * 100) / 100;

export function normalizeV60SwitchConfiguration(config = {}) {
  const requestedDose = config.dose;
  const dose = normalizeSwitchDose(requestedDose);
  const requestedRoast = config.roast;
  const roast = normalizeSwitchRoast(requestedRoast);
  return {
    dose,
    grinder: config.grinder || 'fellow-ode-gen2',
    roast,
    process: String(config.process || '').toLowerCase(),
    closedBloomSeconds: Number(config.closedBloomSeconds) || 0,
    forcedSteepDurationSeconds: config.forcedSteepDurationSeconds != null && Number.isFinite(Number(config.forcedSteepDurationSeconds)) ? Number(config.forcedSteepDurationSeconds) : null,
    configurationKey: V60_SWITCH_CONFIGURATION_KEY,
    defaultedDose: requestedDose == null || requestedDose === '' || !Number.isFinite(Number(requestedDose)),
    defaultedRoast: !V60_SWITCH_ROAST_PRESETS[String(requestedRoast || '').toLowerCase()],
  };
}

function buildGrind(grinder, targetMicrons) {
  const scale = GRINDER_MICRON_SCALES[grinder] || GRINDER_MICRON_SCALES['fellow-ode-gen2'];
  const range = GRINDER_RANGES[grinder] || GRINDER_RANGES['fellow-ode-gen2'];
  const setting = Math.round(clamp((targetMicrons - scale.base) / scale.perStep + 1, range[0], range[1]) * 10) / 10;
  const microns = grinderSettingToMicrons(setting, GRINDER_MICRON_SCALES[grinder] ? grinder : 'fellow-ode-gen2');
  return { setting: String(setting), microns, description: descriptorForMicrons(microns) };
}

function isAnaerobicProcess(config, intent) {
  const raw = `${config.process || ''} ${intent?.softPriors?.process || ''}`.toLowerCase();
  return /anaerobic|co-ferment/.test(raw);
}

function reasonForPreset(preset, isAnaerobic) {
  if (preset.roast === 'light') {
    return 'Light roasts stay hot through both phases (no temperature drop) since the shorter, gentler closed steep does not need the extra restraint a temperature split provides.';
  }
  if (preset.roast === 'medium') {
    return isAnaerobic
      ? 'This coffee uses the Kasuya-style temperature drop for the closed-valve steep, with the anaerobic overrides layered on top to keep the longer immersion window from over-extracting.'
      : 'This coffee uses the Kasuya-style temperature drop for the closed-valve steep: hot percolation, then a cooler pour keeps the immersion phase from over-extracting.';
  }
  return isAnaerobic
    ? 'Dark roast plus anaerobic process both push toward a cooler, coarser, more immersion-forward brew, so the overrides compound on the dark preset.'
    : 'Dark roasts get an immersion-forward long steep at a cooler temperature so the closed-valve phase builds sweetness without pulling out ashy, over-extracted notes.';
}

export function validateV60SwitchCandidate(recipe) {
  const errors = [];
  if (!recipe || recipe.device !== 'v60' || recipe.variant !== 'switch' || recipe.mode !== 'hot' || recipe.isIced) errors.push('wrong-mode-or-device');
  if (recipe?.configurationKey !== V60_SWITCH_CONFIGURATION_KEY || recipe?.v60Size !== V60_SWITCH_SIZE) errors.push('invalid-configuration');
  if (!Number.isFinite(recipe?.coffeeGrams) || recipe.coffeeGrams < V60_SWITCH_DOSE_BOUNDS.minDose || recipe.coffeeGrams > V60_SWITCH_DOSE_BOUNDS.maxDose) errors.push('invalid-dose');
  if (!Number.isFinite(recipe?.waterGrams) || recipe.waterGrams <= 0 || recipe.waterGrams > V60_SWITCH_WATER_CAP_GRAMS) errors.push('invalid-water');
  if (!Number.isFinite(recipe?.waterTemp?.celsius) || recipe.waterTemp.celsius < 80 || recipe.waterTemp.celsius > 100) errors.push('invalid-temperature-phase1');
  if (recipe?.waterTemp2 != null && (!Number.isFinite(recipe.waterTemp2.celsius) || recipe.waterTemp2.celsius < 60 || recipe.waterTemp2.celsius > 100)) errors.push('invalid-temperature-phase2');
  if (!recipe?.grindSize?.setting || !Number.isFinite(recipe?.grindSize?.microns)) errors.push('invalid-grind');
  const allowedPhases = new Set(['percolation', 'immersion', 'drawdown']);
  let lastWater = -1;
  let lastTime = -1;
  for (const step of recipe?.steps || []) {
    if (!Number.isFinite(step.timeSeconds) || step.timeSeconds <= lastTime) errors.push('invalid-timer-sequence');
    if (!Number.isFinite(step.waterTotal) || step.waterTotal < lastWater) errors.push('invalid-water-sequence');
    if (!allowedPhases.has(step.phase)) errors.push('invalid-phase-label');
    lastTime = step.timeSeconds;
    lastWater = step.waterTotal;
  }
  if (!Array.isArray(recipe?.steps) || !recipe.steps.length || !Number.isFinite(recipe.totalBrewTimeSeconds) || recipe.totalBrewTimeSeconds <= lastTime) errors.push('invalid-total-duration');
  if (recipe?.steps?.length && recipe.steps.at(-1).waterTotal !== recipe.waterGrams) errors.push('final-water-mismatch');
  const hasClose = (recipe?.steps || []).some((step) => /close the valve/i.test(step.action || ''));
  const hasOpen = (recipe?.steps || []).some((step) => /open the valve/i.test(step.action || ''));
  if (!hasClose || !hasOpen) errors.push('missing-valve-action-step');
  return { valid: errors.length === 0, errors };
}

export function generateV60SwitchRecipe(intent = {}, configuration = {}) {
  const config = normalizeV60SwitchConfiguration(configuration);
  const preset = V60_SWITCH_ROAST_PRESETS[config.roast];
  const isAnaerobic = isAnaerobicProcess(config, intent);

  // Ratio + water: anaerobic process override lengthens ratio regardless of
  // roast (brief §5), then the 340g Switch 03 capacity cap resolves any
  // remaining conflict by clamping water and recomputing the effective
  // ratio (see resolveSwitchWater doc comment for why this approach was
  // chosen over capping dose).
  const presetRatio = isAnaerobic
    ? clamp(Math.max(preset.ratio, V60_SWITCH_PROCESS_OVERRIDE.anaerobicRatioMin), V60_SWITCH_PROCESS_OVERRIDE.anaerobicRatioMin, V60_SWITCH_PROCESS_OVERRIDE.anaerobicRatioMax)
    : preset.ratio;
  const { waterGrams, effectiveRatio, capped: waterCapped } = resolveSwitchWater(config.dose, presetRatio);

  // Temperature: anaerobic caps both phases into the 88-91C band regardless
  // of roast preset (brief §5); light's no-drop stays no-drop unless the cap
  // itself forces a change.
  const tempPhase1 = isAnaerobic
    ? clamp(preset.tempPhase1C, V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMinC, V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMaxC)
    : preset.tempPhase1C;
  const tempPhase2 = preset.tempPhase2C == null
    ? null
    : isAnaerobic
      ? clamp(preset.tempPhase2C, V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMinC, V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMaxC)
      : preset.tempPhase2C;

  // Guardrail: closed-valve dwell at >=90C without a temperature drop must
  // not exceed the hot-steep bound (brief §6 astringency guardrail).
  let steepDuration = config.forcedSteepDurationSeconds ?? preset.steepDurationSeconds;
  let hotSteepCapped = false;
  if (tempPhase2 == null && tempPhase1 >= V60_SWITCH_GUARDRAILS.hotSteepThresholdC && steepDuration > V60_SWITCH_GUARDRAILS.hotSteepMaxSecondsAtFullTemp) {
    steepDuration = V60_SWITCH_GUARDRAILS.hotSteepMaxSecondsAtFullTemp;
    hotSteepCapped = true;
  }

  // Guardrail: closed-bloom cap (brief §6). Not part of the shipped
  // two-pour template by default (closedBloomSeconds defaults to 0); this
  // is forward-compatibility for the deferred closed-bloom structural
  // variants (Kaldi's / Kasuya v2) recorded in the registry, and a testable
  // hard rule per R2's test scenarios.
  const requestedClosedBloom = config.closedBloomSeconds;
  const closedBloomCapped = requestedClosedBloom > V60_SWITCH_GUARDRAILS.closedBloomMaxSeconds;
  const closedBloomSeconds = clamp(requestedClosedBloom, 0, V60_SWITCH_GUARDRAILS.closedBloomMaxSeconds);

  // Grind: classic V60 micron target + closed-time-driven roast offset +
  // process override + intent nuance, via the single existing micron model
  // only (R6) — no new formula.
  const targetMicrons = clamp(
    V60_SWITCH_CLASSIC_BASELINE_MICRONS
    + preset.grindOffsetMicrons
    + (isAnaerobic ? V60_SWITCH_PROCESS_OVERRIDE.anaerobicGrindCoarsenMicrons : 0)
    + clamp(Number(intent?.grindAdjustmentMicrons) || 0, -45, 45),
    380, 1100,
  );
  const grindSize = buildGrind(config.grinder, targetMicrons);

  // Timeline.
  const phase1WaterGrams = round(waterGrams * preset.phase1WaterPct);
  const bloomGrams = round(config.dose * 2);
  const timeOffset = closedBloomSeconds > 0 ? closedBloomSeconds : 0;
  const valveCloseAt = timeOffset + preset.valveCloseTimeSeconds;
  const valveOpenAt = valveCloseAt + steepDuration;
  const totalBrewTimeSeconds = valveOpenAt + preset.drawdownBudgetSeconds;

  const steps = [];
  if (closedBloomSeconds > 0) {
    steps.push({ time: '0:00', timeSeconds: 0, action: `Close the valve and bloom with ${bloomGrams}g water.`, waterTotal: bloomGrams, phase: 'immersion' });
    steps.push({
      time: timeLabel(timeOffset), timeSeconds: timeOffset,
      action: `Open the valve. Pour to ${phase1WaterGrams}g in a steady center pour.`, waterTotal: phase1WaterGrams, phase: 'percolation',
    });
  } else {
    steps.push({ time: '0:00', timeSeconds: 0, action: `Pour to ${phase1WaterGrams}g with the valve open.`, waterTotal: phase1WaterGrams, phase: 'percolation' });
  }
  steps.push({
    time: timeLabel(valveCloseAt), timeSeconds: valveCloseAt,
    action: tempPhase2 != null
      ? `Close the valve. Pour to ${waterGrams}g using the cooler kettle at ${tempPhase2}°C.`
      : `Close the valve. Pour to ${waterGrams}g.`,
    waterTotal: waterGrams, phase: 'immersion',
  });
  steps.push({
    time: timeLabel(valveOpenAt), timeSeconds: valveOpenAt,
    action: 'Open the valve and let it fully drain.', waterTotal: waterGrams, phase: 'drawdown',
  });

  const prepSteps = [
    { action: 'Rinse and preheat the V60 03 Switch filter and server; discard rinse water. Confirm the valve lever is OPEN before you start.', phase: 'prep' },
    { action: `Add ${config.dose}g coffee and level the bed.`, phase: 'prep' },
    tempPhase2 != null && { action: `Heat a second kettle (or let part of your first kettle cool) to ${tempPhase2}°C before you start — you'll use it for the closed-valve pour.`, phase: 'prep' },
  ].filter(Boolean);

  const reasonCodes = [
    ...(intent.reasonCodes || []),
    'SWITCH_HYBRID_DEFAULT',
    preset.reasonCode,
    preset.grindOffsetMicrons > 0 && 'SWITCH_IMMERSION_COARSENED',
    isAnaerobic && 'SWITCH_ANAEROBIC_OVERRIDE',
    waterCapped && 'SWITCH_WATER_CAP_APPLIED',
    closedBloomCapped && 'SWITCH_CLOSED_BLOOM_CAPPED',
    hotSteepCapped && 'SWITCH_HOT_STEEP_CAPPED',
    config.defaultedDose && 'DEFAULTED_V60_SWITCH_DOSE',
    config.defaultedRoast && 'DEFAULTED_V60_VARIANT',
  ].filter(Boolean);

  const sourceIds = [...preset.sourceIds, ...(isAnaerobic ? V60_SWITCH_PROCESS_OVERRIDE.sourceIds : [])];

  const recipe = {
    method: 'pour-over', device: 'v60', variant: 'switch', mode: 'hot', isIced: false,
    v60Size: V60_SWITCH_SIZE, configurationKey: V60_SWITCH_CONFIGURATION_KEY, roastPreset: preset.roast,
    process: isAnaerobic ? 'anaerobic' : (config.process || 'unspecified'),
    engineVersion: V60_SWITCH_ENGINE_VERSION, rulesVersion: V60_SWITCH_RULES_VERSION, candidate: true,
    doseTimingPolicy: 'generated-dose-v60-switch-v1',
    coffeeGrams: config.dose, waterGrams, ratio: `1:${displayRatio(effectiveRatio)}`,
    waterTemp: { celsius: tempPhase1, fahrenheit: Math.round(tempPhase1 * 9 / 5 + 32) },
    waterTemp2: tempPhase2 != null ? { celsius: tempPhase2, fahrenheit: Math.round(tempPhase2 * 9 / 5 + 32) } : null,
    grindSize,
    prepSteps, steps, postBrewSteps: [], phaseContractVersion: V60_SWITCH_PHASE_CONTRACT_VERSION,
    totalBrewTime: timeLabel(totalBrewTimeSeconds), totalBrewTimeSeconds, guideTargetSeconds: totalBrewTimeSeconds, timerReady: true,
    reasonCodes, confidence: intent.confidence || 'low', evidenceHash: intent.evidenceHash || null,
    sourceRegistryVersion: V60_SWITCH_SOURCE_REGISTRY_VERSION, sourceIds,
    reasoning: reasonForPreset(preset, isAnaerobic),
    tips: 'The closed-valve steep is the strength dial here, not the pour. If it tastes thin, extend the steep in small (10-15s) steps before touching grind; if it tastes harsh, go one step coarser before shortening the steep.',
    title: 'V60 Switch 03 recipe',
  };
  const validation = validateV60SwitchCandidate(recipe);
  if (!validation.valid) throw new Error(`V60 Switch candidate contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}

export function generateV60SwitchFallback(configuration = {}, reason = 'candidate-failed') {
  const recipe = generateV60SwitchRecipe({}, { ...configuration, roast: 'medium', process: '', closedBloomSeconds: 0, forcedSteepDurationSeconds: null });
  recipe.candidate = true;
  recipe.fallback = true;
  recipe.fallbackReason = reason;
  recipe.reasonCodes = [...recipe.reasonCodes, 'SWITCH_CONSERVATIVE_BASELINE'];
  const validation = validateV60SwitchCandidate(recipe);
  if (!validation.valid) throw new Error(`V60 Switch fallback contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}

export function sourceForSwitchPreset(preset) {
  return preset.sourceIds.map((id) => sourceById(id)).filter(Boolean);
}
