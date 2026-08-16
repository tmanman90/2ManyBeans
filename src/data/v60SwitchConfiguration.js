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

// Roast preset table — brief §4, SUPERSEDED for the tempPhase2C dimension by
// brief "Revision 2026-08-16 — single-temperature mandate". Single kettle
// temperature only: the Kasuya-style 92C->70C drop is unrealistic without a
// second kettle at home. `tempPhase2C` has been removed entirely; the
// close/steep timing that used to differentiate roasts is now also the
// per-bean modulation lever (see V60_SWITCH_VALVE_MODULATION_BOUNDS below
// and modulateSwitchValveTiming in v60SwitchAdapter.js). Times are seconds
// from pour start. valveOpenAtSeconds is always 0 (template starts with the
// valve open).
export const V60_SWITCH_ROAST_PRESETS = Object.freeze({
  light: Object.freeze({
    roast: 'light',
    ratio: 16.5, // [Hoffmann-hybrid-secondary, Chronicler-primary upper band] — unchanged
    phase1WaterPct: 0.50, // [Chronicler-primary]
    tempC: 94, // [hario-partners-manufacturer 96-100 light/medium band, shaded to Hoffmann's 95 and conservative — derived]
    valveCloseTimeSeconds: 45, // [Chronicler-primary] — unchanged
    steepDurationSeconds: 75, // close 0:45 -> open 2:00 [Chronicler-primary] — unchanged
    grindOffsetMicrons: 0, // [derived] unchanged — R6's threshold is still the binding constraint at 75s
    drawdownBudgetSeconds: 60, // 2:00 -> 2:45-3:15 [Chronicler-primary]
    totalBandSeconds: [165, 195],
    sourceIds: ['hario-partners-manufacturer', 'hoffmann-hybrid-secondary', 'chronicler-primary'],
    reasonCode: 'SWITCH_SINGLE_TEMP_LIGHT',
  }),
  medium: Object.freeze({
    roast: 'medium',
    ratio: 15, // [Kasuya-hybrid-resolved 1:14, widened to R5 band — derived/interpolated] — unchanged
    phase1WaterPct: 0.43, // [Kasuya-hybrid-resolved: 120g/280g] — unchanged
    tempC: 92, // [chronicler-primary] — exact match now that there is no second temperature to average against
    valveCloseTimeSeconds: 40, // [derived] 5s earlier than the old dual-temp preset's 1:00, per the revision's shortened pre-steep percolation
    steepDurationSeconds: 75, // close 0:40 -> open 1:55, inside the 1:50-2:00 owner-specified window [derived/interpolated]
    grindOffsetMicrons: 180, // [derived] +1 step coarser than the old dual-temp preset's 90 [kasuya-super-hybrid-v2 coarser-grind precedent]
    drawdownBudgetSeconds: 55, // open 1:55 + 50-65s [derived/interpolated]
    totalBandSeconds: [160, 185],
    sourceIds: ['kasuya-hybrid-resolved', 'chronicler-primary', 'quan-secondary', 'kasuya-super-hybrid-v2'],
    reasonCode: 'SWITCH_SINGLE_TEMP_MEDIUM',
  }),
  dark: Object.freeze({
    roast: 'dark',
    ratio: 13.5, // [R5 band 1:13-1:14 midpoint — derived/interpolated] — unchanged
    phase1WaterPct: 0.40, // [derived/interpolated] smaller percolation phase, more immersion-forward — unchanged
    tempC: 88, // [hario-partners-manufacturer dark floor 90.5, extrapolated down with a typical 2-5C dark-roast offset — derived/interpolated]
    valveCloseTimeSeconds: 50, // [derived/interpolated] — unchanged
    steepDurationSeconds: 100, // close 0:50 -> open 2:30 [derived] shorter than the old dual-temp preset's 110s — no cool phase protects the steep, the astringency guardrail does that job instead
    grindOffsetMicrons: 150, // [derived] nudged up within the same +1-to-+2-step band to pair with the shorter, hotter, unprotected steep
    drawdownBudgetSeconds: 65, // open 2:30 + 50-80s [derived/interpolated]
    totalBandSeconds: [205, 230],
    sourceIds: ['hario-partners-manufacturer', 'kaldis-primary', 'blind-coffee-roaster-theory'],
    reasonCode: 'SWITCH_SINGLE_TEMP_DARK',
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

// Guardrails — brief §6, ASTRINGENCY GUARDRAIL ADJUSTED for the single-temp
// world by brief "Revision 2026-08-16 — single-temperature mandate". The old
// guardrail assumed a temperature drop was available as the release valve
// for a long hot steep; with tempPhase2C removed, the guardrail is restated
// directly in terms of the single temperature actually in effect.
export const V60_SWITCH_GUARDRAILS = Object.freeze({
  // "Closed bloom" is not part of the shipped two-pour template (it starts
  // percolation, valve open — no dormant closed-valve hold before the first
  // pour). The cap exists as a hard, testable rule for the optional
  // `closedBloomSeconds` configuration override, which is forward
  // compatibility for the deferred Kaldi's/Kasuya-v2 closed-bloom structural
  // variants recorded in the registry (not generated in this slice).
  closedBloomMaxSeconds: 60, // [home-barista-community + Barista-Hustle-theory — derived/interpolated]
  // Closed-valve dwell at >= this temperature is capped hard at
  // hotSteepMaxSecondsAtFullTemp seconds, no exceptions (no temp-drop escape
  // valve exists anymore). Longer steeps are only permitted below this
  // threshold — this is why the dark preset's temp (88C) sits below it and
  // the medium preset's (92C) sits above it. [derived — single-temp revision]
  hotSteepThresholdC: 92,
  hotSteepMaxSecondsAtFullTemp: 100, // [chronicler-primary + kasuya-hybrid-resolved-derived guardrail, narrowed from 120s to ~90-100s]
  drawdownMinSeconds: 45,
  drawdownMaxSecondsExtended: 120, // Kaldi's-style ceiling [Kaldis-primary]
});

// Bean-driven valve-timing modulation bounds — Revision 2026-08-16 (the
// differentiation fix). Applied in v60SwitchAdapter.js's
// modulateSwitchValveTiming() on top of the roast preset baseline above,
// from extractionIntent signals (cupDirection.clarity/body/sweetness,
// solubilityRisk, finesRisk, confidence). Each axis is bounded independently
// so two beans at the same roast preset can diverge meaningfully without
// ever producing a physically implausible schedule.
export const V60_SWITCH_VALVE_MODULATION_BOUNDS = Object.freeze({
  // Clarity-leaning intent: later close (more percolation) + shorter steep
  // (Quan's dial — [quan-secondary]).
  clarityCloseDelaySeconds: 12, // bounded ~10-15s later close
  claritySteepShortenSeconds: 25, // bounded ~20-30s shorter steep
  // Body/sweetness-leaning or high fines/solubility risk: earlier close
  // (Chronicler's sweet-variant logic — [chronicler-primary]) + longer steep
  // when fines/solubility risk is specifically high.
  sweetnessCloseEarlySeconds: 12, // bounded ~10-15s earlier close
  bodySteepExtendSeconds: 25, // bounded ~20-30s longer steep, still subject to the hot-steep guardrail above
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
