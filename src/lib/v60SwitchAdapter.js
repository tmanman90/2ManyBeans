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
  V60_SWITCH_VALVE_MODULATION_BOUNDS,
  normalizeSwitchDose, normalizeSwitchRoast, resolveSwitchWater,
} from '../data/v60SwitchConfiguration.js';
import { V60_SWITCH_SOURCE_REGISTRY_VERSION, sourceById } from '../data/v60SwitchSourceRegistry.js';

export const V60_SWITCH_ENGINE_VERSION = 'v60-switch-engine-v1';
// Bumped from 'v60-switch-rules-v1-phase1' by the 2026-08-16 single-temperature
// revision (docs/research/2026-08-15-v60-switch-methodology-brief.md
// "Revision 2026-08-16") — invalidates every cached dual-temp candidate
// (which carried a non-null waterTemp2) so it regenerates under the new
// single-temp + bean-driven-valve-timing rules on next read (R8).
export const V60_SWITCH_RULES_VERSION = 'v60-switch-rules-v2-single-temp';
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

// Reasoning copy — rewritten for the 2026-08-16 single-temperature revision.
// One kettle temperature throughout; valve-close timing and steep duration
// are the extraction dial (Chronicler's sweet-version close-time shift,
// Quan's steep-time dial), not a mid-brew temperature drop.
function reasonForPreset(preset, isAnaerobic, valveTimingReasonCodes = []) {
  const timingNote = valveTimingReasonCodes.includes('SWITCH_STEEP_SHORTENED_CLARITY')
    ? ' This bean\'s clarity leans forward, so the valve stays open a touch longer and the closed steep runs shorter for a brighter, more percolation-driven cup.'
    : valveTimingReasonCodes.includes('SWITCH_EARLY_CLOSE_SWEETNESS')
      ? ' This bean leans toward body and sweetness, so the valve closes a little earlier for a fuller, rounder immersion phase.'
      : '';
  if (preset.roast === 'light') {
    return `Single kettle temperature throughout — no second temperature to manage. The valve-close timestamp and steep length are the extraction dial here, not a temperature drop.${timingNote}`;
  }
  if (preset.roast === 'medium') {
    return isAnaerobic
      ? `One steady kettle temperature runs the whole brew, with the anaerobic overrides layered on top to keep the closed-valve window from over-extracting.${timingNote}`
      : `One steady kettle temperature runs the whole brew. The valve-close timing does the work Kasuya's temperature drop used to do — it's the real dial for strength and clarity here.${timingNote}`;
  }
  return isAnaerobic
    ? `Dark roast plus anaerobic process both push toward a coarser, more immersion-forward brew at a single lower kettle temperature.${timingNote}`
    : `Dark roasts get a single lower-temperature kettle and an immersion-forward steep, kept short enough that there's no cool second phase needed to protect it from over-extracting.${timingNote}`;
}

// Bean-driven valve-timing modulation — the differentiation fix (Revision
// 2026-08-16). Pure function over the existing extractionIntent output; no
// new evidence format, no new intent fields. Two independent, deterministic,
// bounded axes (valve-close delta, steep-duration delta) driven by
// cupDirection.clarity/body/sweetness, finesRisk/solubilityRisk, and
// confidence. Low-confidence intent gets no modulation — a baseline preset
// with an explicit reason code, not a missed signal.
export function modulateSwitchValveTiming(preset, intent = {}) {
  const bounds = V60_SWITCH_VALVE_MODULATION_BOUNDS;
  const baselineClose = preset.valveCloseTimeSeconds;
  const baselineSteep = preset.steepDurationSeconds;

  const confidence = intent?.confidence;
  if (!confidence || confidence === 'low') {
    return {
      valveCloseTimeSeconds: baselineClose,
      steepDurationSeconds: baselineSteep,
      reasonCodes: ['SWITCH_VALVE_TIMING_BASELINE_LOW_CONFIDENCE'],
    };
  }

  const cupDirection = intent?.cupDirection || {};
  const highRisk = intent?.finesRisk === 'high' || intent?.solubilityRisk === 'high';
  // Clarity-leaning / high-acidity-desired: later close (more percolation),
  // shorter steep (Quan's dial — [quan-secondary]).
  const clarityLeaning = cupDirection.clarity === 'high';
  // Body/sweetness-leaning, or high fines/solubility risk without a clarity
  // lean: earlier close (Chronicler's sweet-variant logic —
  // [chronicler-primary]), and a longer steep specifically when fines/
  // solubility risk is high.
  const bodySweetnessLeaning = !clarityLeaning
    && (cupDirection.body === 'supported' || cupDirection.sweetness === 'high' || highRisk);

  let closeDelta = 0;
  let steepDelta = 0;
  const reasonCodes = [];

  if (clarityLeaning) {
    closeDelta += bounds.clarityCloseDelaySeconds;
    steepDelta -= bounds.claritySteepShortenSeconds;
    reasonCodes.push('SWITCH_LATE_CLOSE_CLARITY', 'SWITCH_STEEP_SHORTENED_CLARITY');
  } else if (bodySweetnessLeaning) {
    closeDelta -= bounds.sweetnessCloseEarlySeconds;
    reasonCodes.push('SWITCH_EARLY_CLOSE_SWEETNESS');
    if (highRisk) {
      steepDelta += bounds.bodySteepExtendSeconds;
      reasonCodes.push('SWITCH_STEEP_EXTENDED_BODY');
    }
  }

  if (!reasonCodes.length) reasonCodes.push('SWITCH_VALVE_TIMING_BASELINE_NEUTRAL_INTENT');

  return {
    valveCloseTimeSeconds: Math.max(15, baselineClose + closeDelta),
    steepDurationSeconds: Math.max(30, baselineSteep + steepDelta),
    reasonCodes,
  };
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

  // Temperature: single kettle temperature throughout (Revision 2026-08-16 —
  // temp_phase2 removed entirely; the Kasuya-style temperature drop is
  // unrealistic without a second kettle at home). Anaerobic still caps the
  // one temperature into the 88-91C band regardless of roast preset (brief
  // §5, unaffected by the revision).
  const temp = isAnaerobic
    ? clamp(preset.tempC, V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMinC, V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMaxC)
    : preset.tempC;

  // Bean-driven valve-timing modulation (Revision 2026-08-16 — the
  // differentiation fix): close time + steep duration move from the
  // extraction-intent signals, bounded and reason-coded. Low-confidence
  // intent falls through to the preset baseline unchanged.
  const modulation = modulateSwitchValveTiming(preset, intent);
  const valveCloseTimeSeconds = modulation.valveCloseTimeSeconds;

  // Guardrail: closed-valve dwell at >= the hot-steep threshold is capped
  // hard (brief §6 astringency guardrail, adjusted for the single-temp world
  // — there is no temperature-drop escape valve anymore, so this binds
  // directly on the modulated steep duration).
  let steepDuration = config.forcedSteepDurationSeconds ?? modulation.steepDurationSeconds;
  let hotSteepCapped = false;
  if (temp >= V60_SWITCH_GUARDRAILS.hotSteepThresholdC && steepDuration > V60_SWITCH_GUARDRAILS.hotSteepMaxSecondsAtFullTemp) {
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
  const valveCloseAt = timeOffset + valveCloseTimeSeconds;
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
    action: `Close the valve. Pour to ${waterGrams}g.`,
    waterTotal: waterGrams, phase: 'immersion',
  });
  steps.push({
    time: timeLabel(valveOpenAt), timeSeconds: valveOpenAt,
    action: 'Open the valve and let it fully drain.', waterTotal: waterGrams, phase: 'drawdown',
  });

  // Single kettle only (Revision 2026-08-16) — no second-kettle prep step.
  const prepSteps = [
    { action: `Rinse and preheat the V60 03 Switch filter and server; discard rinse water. Confirm the valve lever is OPEN before you start. Heat water to ${temp}°C — one kettle temperature runs the whole brew.`, phase: 'prep' },
    { action: `Add ${config.dose}g coffee and level the bed.`, phase: 'prep' },
  ];

  const reasonCodes = [
    ...(intent.reasonCodes || []),
    'SWITCH_HYBRID_DEFAULT',
    preset.reasonCode,
    ...modulation.reasonCodes,
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
    // Single kettle temperature only (Revision 2026-08-16) — no waterTemp2.
    // Cached dual-temp candidates carrying waterTemp2 are invalidated by the
    // rulesVersion bump; HandBrewModal's display tile stays tolerant of a
    // stray waterTemp2 on any legacy object that slips through a stale cache.
    waterTemp: { celsius: temp, fahrenheit: Math.round(temp * 9 / 5 + 32) },
    grindSize,
    prepSteps, steps, postBrewSteps: [], phaseContractVersion: V60_SWITCH_PHASE_CONTRACT_VERSION,
    totalBrewTime: timeLabel(totalBrewTimeSeconds), totalBrewTimeSeconds, guideTargetSeconds: totalBrewTimeSeconds, timerReady: true,
    reasonCodes, confidence: intent.confidence || 'low', evidenceHash: intent.evidenceHash || null,
    sourceRegistryVersion: V60_SWITCH_SOURCE_REGISTRY_VERSION, sourceIds,
    reasoning: reasonForPreset(preset, isAnaerobic, modulation.reasonCodes),
    tips: 'The valve-close timestamp and closed-valve steep length are the strength/clarity dial here, not the pour or the temperature. If it tastes thin, extend the steep in small (10-15s) steps before touching grind; if it tastes harsh or muddled, close the valve a little earlier before shortening the steep.',
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
