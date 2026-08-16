// Frozen configuration for the Hario V60 Switch 03 (360ml) hybrid engine.
// Every numeric value here is sourced from docs/data/v60-switch-source-registry.md
// via docs/research/2026-08-15-v60-switch-methodology-brief.md — see the
// `sourceIds` on each preset for the registry rows that justify it. Plain
// literal (Object.freeze), mirroring src/data/kalitaConfiguration.js, so gate
// [3]-style static extraction stays viable.

export const V60_SWITCH_SIZE = '03';
export const V60_SWITCH_CONFIGURATION_KEY = 'v60:03:standard-paper:switch:hot';

// Dose bounds: [Chronicler-primary] floor (15g), [World-Atlas-theory +
// Hario-booklet-manufacturer] ceiling (30g) — same floor/ceiling logic as
// classic V60 [derived/interpolated]. Brief §1.
export const V60_SWITCH_DOSE_BOUNDS = Object.freeze({ minDose: 15, maxDose: 30, defaultDose: 20 });

// Hard capacity cap under the 360ml glass, bloom-foam headroom included.
// [Hario-primary + derived/interpolated]. Brief §1.
export const V60_SWITCH_WATER_CAP_GRAMS = 340;

// Classic-V60 baseline micron target this engine offsets from (R6) — matches
// v60Adapter.js's own unmapped-technique default so "classic V60 target" is
// the same number in both engines.
export const V60_SWITCH_CLASSIC_BASELINE_MICRONS = 660;

// Roast preset table — brief §4. Times are seconds from pour start.
// valveOpenAtSeconds is always 0 (template starts with the valve open).
export const V60_SWITCH_ROAST_PRESETS = Object.freeze({
  light: Object.freeze({
    roast: 'light',
    ratio: 16.5, // [Hoffmann-hybrid-secondary, Chronicler-primary upper band]
    phase1WaterPct: 0.50, // [Chronicler-primary]
    tempPhase1C: 95, // [Hoffmann-hybrid-secondary]
    tempPhase2C: null, // no drop — [derived/interpolated] "light roasts may run both phases hot"
    valveCloseTimeSeconds: 45, // [Chronicler-primary]
    steepDurationSeconds: 75, // close 0:45 -> open 2:00 [Chronicler-primary]
    grindOffsetMicrons: 0, // [derived] 75s sits at the ~60-90s threshold; guardrail is the binding constraint
    drawdownBudgetSeconds: 60, // 2:00 -> 2:45-3:15 [Chronicler-primary]
    totalBandSeconds: [165, 195],
    sourceIds: ['chronicler-primary', 'hoffmann-hybrid-secondary'],
    reasonCode: 'SWITCH_LIGHT_NO_TEMP_DROP',
  }),
  medium: Object.freeze({
    roast: 'medium',
    ratio: 15, // [Kasuya-hybrid-resolved 1:14, widened to R5 band — derived/interpolated]
    phase1WaterPct: 0.43, // [Kasuya-hybrid-resolved: 120g/280g]
    tempPhase1C: 92, // [Kasuya-hybrid-resolved: midpoint of 90C/93C — derived/interpolated averaging]
    tempPhase2C: 70, // [Kasuya-hybrid-resolved]
    valveCloseTimeSeconds: 60, // [derived/interpolated] — lengthens the steep phase per R3's shape
    steepDurationSeconds: 70, // close 1:00 -> open 2:10 [derived/interpolated blend]
    grindOffsetMicrons: 90, // [derived] R6: ~1 step past the ~60-90s closed-time threshold
    drawdownBudgetSeconds: 55, // open 2:10 + 50-65s [derived/interpolated]
    totalBandSeconds: [180, 195],
    sourceIds: ['kasuya-hybrid-resolved', 'chronicler-primary'],
    reasonCode: 'SWITCH_TEMP_SPLIT_MEDIUM',
  }),
  dark: Object.freeze({
    roast: 'dark',
    ratio: 13.5, // [R5 band 1:13-1:14 midpoint — derived/interpolated]
    phase1WaterPct: 0.40, // [derived/interpolated] smaller percolation phase, more immersion-forward
    tempPhase1C: 89, // [Kaldis-primary dark band shaded toward Blind-Coffee-Roaster-theory 88-91 — derived]
    tempPhase2C: 72, // [derived/interpolated] extends Kasuya's drop pattern
    valveCloseTimeSeconds: 50, // [derived/interpolated]
    steepDurationSeconds: 110, // close 0:50 -> open 2:40 [derived/interpolated] immersion-forward long steep
    grindOffsetMicrons: 135, // [derived] R6 (110s closed time) + World-Atlas-theory darker-roast fast-extraction note
    drawdownBudgetSeconds: 65, // open 2:40 + 50-80s [derived/interpolated]
    totalBandSeconds: [210, 240],
    sourceIds: ['kaldis-primary', 'blind-coffee-roaster-theory'],
    reasonCode: 'SWITCH_TEMP_SPLIT_DARK',
  }),
});

// Process override layer — brief §5. Applies on top of the roast preset,
// regardless of roast level (R5).
export const V60_SWITCH_PROCESS_OVERRIDE = Object.freeze({
  anaerobicTempCapMinC: 88, // [Blind-Coffee-Roaster-theory]
  anaerobicTempCapMaxC: 91,
  anaerobicGrindCoarsenMicrons: 125, // midpoint of the banded +100-150µm [Blind-Coffee-Roaster-theory, banded]
  anaerobicRatioMin: 16.5, // [Blind-Coffee-Roaster-theory]
  anaerobicRatioMax: 17,
  sourceIds: ['blind-coffee-roaster-theory', 'coffee-compass-theory'],
});

// Guardrails — brief §6.
export const V60_SWITCH_GUARDRAILS = Object.freeze({
  // "Closed bloom" is not part of the shipped two-pour template (it starts
  // percolation, valve open — no dormant closed-valve hold before the first
  // pour). The cap exists as a hard, testable rule for the optional
  // `closedBloomSeconds` configuration override, which is forward
  // compatibility for the deferred Kaldi's/Kasuya-v2 closed-bloom structural
  // variants recorded in the registry (not generated in this slice).
  closedBloomMaxSeconds: 60, // [home-barista-community + Barista-Hustle-theory — derived/interpolated]
  // Closed-valve dwell at >= this temperature should not exceed
  // hotSteepMaxSecondsAtFullTemp without a temperature drop.
  hotSteepThresholdC: 90,
  hotSteepMaxSecondsAtFullTemp: 120, // [Kasuya-hybrid-resolved-derived guardrail]
  drawdownMinSeconds: 45,
  drawdownMaxSecondsExtended: 120, // Kaldi's-style ceiling [Kaldis-primary]
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeSwitchDose(value) {
  if (value == null || value === '') return V60_SWITCH_DOSE_BOUNDS.defaultDose;
  const dose = Number(value);
  if (!Number.isFinite(dose) || dose < V60_SWITCH_DOSE_BOUNDS.minDose || dose > V60_SWITCH_DOSE_BOUNDS.maxDose) {
    throw new RangeError(`V60 Switch 03 dose must be between ${V60_SWITCH_DOSE_BOUNDS.minDose}g and ${V60_SWITCH_DOSE_BOUNDS.maxDose}g`);
  }
  return dose;
}

export function normalizeSwitchRoast(value) {
  const raw = String(value || '').toLowerCase();
  if (V60_SWITCH_ROAST_PRESETS[raw]) return raw;
  return 'medium';
}

// 340g cap resolution (R5/R7): the requested dose is honored as configured;
// when dose x ratio would exceed the Switch 03 capacity cap, water is
// clamped to the cap and the ratio is recomputed against the clamped water
// so the recipe stays physically brewable (e.g. 30g x 1:16.5 = 495g -> water
// clamped to 340g -> effective ratio ~1:11.3), with a reason code recording
// the clamp. This is the approach the brief's §1 capacity note supports
// ("hard cap liquid at 340g") over silently under-dosing or over-pouring.
export function resolveSwitchWater(dose, ratio) {
  const requestedWater = Math.round(dose * ratio);
  if (requestedWater <= V60_SWITCH_WATER_CAP_GRAMS) {
    return { waterGrams: requestedWater, effectiveRatio: ratio, capped: false };
  }
  const waterGrams = V60_SWITCH_WATER_CAP_GRAMS;
  return { waterGrams, effectiveRatio: Math.round((waterGrams / dose) * 100) / 100, capped: true };
}

export function clampGuardrails(value, min, max) {
  return clamp(value, min, max);
}
