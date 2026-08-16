import assert from 'node:assert/strict';
import {
  generateV60SwitchRecipe, generateV60SwitchFallback, validateV60SwitchCandidate, modulateSwitchValveTiming,
} from '../src/lib/v60SwitchAdapter.js';
import { V60_SWITCH_ROAST_PRESETS } from '../src/data/v60SwitchConfiguration.js';
import { buildExtractionIntent } from '../src/lib/extractionIntent.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';

// --- Byte-equivalent repeated generation --------------------------------
const configA = { dose: 20, grinder: 'fellow-ode-gen2', roast: 'medium', process: 'washed' };
const a1 = generateV60SwitchRecipe({}, configA);
const a2 = generateV60SwitchRecipe({}, { ...configA });
assert.deepEqual(a1, a2, 'repeated generation must be byte-equivalent');

// --- Distinct light/medium/dark preset outputs --------------------------
const light = generateV60SwitchRecipe({}, { dose: 20, roast: 'light' });
const medium = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' });
const dark = generateV60SwitchRecipe({}, { dose: 20, roast: 'dark' });
assert.notEqual(light.ratio, medium.ratio);
assert.notEqual(medium.ratio, dark.ratio);
assert.notEqual(light.totalBrewTimeSeconds, medium.totalBrewTimeSeconds);
assert.notEqual(medium.totalBrewTimeSeconds, dark.totalBrewTimeSeconds);

// Single kettle temperature only (Revision 2026-08-16) — no waterTemp2 field
// on any roast preset, and each preset's single temp is distinct.
assert.equal(light.waterTemp2, undefined, 'light roast must not carry a waterTemp2 field');
assert.equal(medium.waterTemp2, undefined, 'medium roast must not carry a waterTemp2 field');
assert.equal(dark.waterTemp2, undefined, 'dark roast must not carry a waterTemp2 field');
assert.equal(light.waterTemp.celsius, 94);
assert.equal(medium.waterTemp.celsius, 92);
assert.equal(dark.waterTemp.celsius, 88);
assert.ok(medium.reasonCodes.includes('SWITCH_SINGLE_TEMP_MEDIUM'));
assert.ok(dark.reasonCodes.includes('SWITCH_SINGLE_TEMP_DARK'));
assert.ok(light.reasonCodes.includes('SWITCH_SINGLE_TEMP_LIGHT'));
assert.ok(light.reasonCodes.includes('SWITCH_HYBRID_DEFAULT'));

// --- Anaerobic override: temp cap 88-91C, coarsens grind, reason code ---
const lightBaseline = generateV60SwitchRecipe({}, { dose: 20, roast: 'light' });
const lightAnaerobic = generateV60SwitchRecipe({}, { dose: 20, roast: 'light', process: 'anaerobic' });
assert.ok(lightAnaerobic.waterTemp.celsius >= 88 && lightAnaerobic.waterTemp.celsius <= 91, `anaerobic temp out of band: ${lightAnaerobic.waterTemp.celsius}`);
assert.ok(lightAnaerobic.grindSize.microns > lightBaseline.grindSize.microns, 'anaerobic must coarsen grind vs the same roast baseline');
assert.ok(lightAnaerobic.reasonCodes.includes('SWITCH_ANAEROBIC_OVERRIDE'));
assert.ok(Number(lightAnaerobic.ratio.split(':')[1]) >= 16.5, 'anaerobic ratio must lengthen to >=1:16.5');

// --- Valve steps: strictly ascending, phase-labeled ---------------------
for (const recipe of [light, medium, dark]) {
  let lastTime = -1;
  let lastWater = -1;
  for (const step of recipe.steps) {
    assert.ok(step.timeSeconds > lastTime, 'steps must be strictly ascending in time');
    assert.ok(step.waterTotal >= lastWater, 'water totals must be monotonic');
    assert.ok(['percolation', 'immersion', 'drawdown'].includes(step.phase), `unexpected phase ${step.phase}`);
    lastTime = step.timeSeconds;
    lastWater = step.waterTotal;
  }
  assert.ok(recipe.steps.some((s) => /close the valve/i.test(s.action)), 'must have a first-class Close valve step');
  assert.ok(recipe.steps.some((s) => /open the valve/i.test(s.action)), 'must have a first-class Open valve step');
  assert.equal(recipe.steps.at(-1).waterTotal, recipe.waterGrams);
  assert.ok(recipe.totalBrewTimeSeconds > recipe.steps.at(-1).timeSeconds);
}

// --- Guardrail: forced closed bloom >60s is clamped + coded -------------
const clampedBloom = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium', closedBloomSeconds: 200 });
assert.ok(clampedBloom.reasonCodes.includes('SWITCH_CLOSED_BLOOM_CAPPED'));
const bloomStep = clampedBloom.steps[0];
assert.ok(/close the valve/i.test(bloomStep.action));
const percolationStep = clampedBloom.steps[1];
assert.ok(percolationStep.timeSeconds <= 60, `closed bloom not capped at 60s: ${percolationStep.timeSeconds}`);
assert.equal(validateV60SwitchCandidate(clampedBloom).valid, true);

// No closed-bloom override -> no reason code, default structure (2 or 3 steps, no bloom sub-step)
const noBloom = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' });
assert.ok(!noBloom.reasonCodes.includes('SWITCH_CLOSED_BLOOM_CAPPED'));
assert.equal(noBloom.steps.length, 3, 'default template has 3 timed steps: percolation, close+steep, open+drain');

// --- Bean-driven valve-timing modulation (Revision 2026-08-16) ------------
// modulateSwitchValveTiming() directly: bounds respected, reason codes emitted.
const mediumPreset = V60_SWITCH_ROAST_PRESETS.medium;

const lowConfidence = modulateSwitchValveTiming(mediumPreset, { confidence: 'low' });
assert.equal(lowConfidence.valveCloseTimeSeconds, mediumPreset.valveCloseTimeSeconds, 'low confidence must not modulate close time');
assert.equal(lowConfidence.steepDurationSeconds, mediumPreset.steepDurationSeconds, 'low confidence must not modulate steep duration');
assert.deepEqual(lowConfidence.reasonCodes, ['SWITCH_VALVE_TIMING_BASELINE_LOW_CONFIDENCE']);

const noConfidence = modulateSwitchValveTiming(mediumPreset, {});
assert.deepEqual(noConfidence.reasonCodes, ['SWITCH_VALVE_TIMING_BASELINE_LOW_CONFIDENCE'], 'missing confidence must default to the conservative baseline, not modulate');

const clarityIntent = { confidence: 'high', cupDirection: { clarity: 'high', body: 'balanced', sweetness: 'high' } };
const clarityMod = modulateSwitchValveTiming(mediumPreset, clarityIntent);
assert.ok(clarityMod.valveCloseTimeSeconds > mediumPreset.valveCloseTimeSeconds, 'clarity-leaning bean must close the valve later');
assert.ok(clarityMod.steepDurationSeconds < mediumPreset.steepDurationSeconds, 'clarity-leaning bean must steep for less time');
assert.ok(clarityMod.reasonCodes.includes('SWITCH_LATE_CLOSE_CLARITY'));
assert.ok(clarityMod.reasonCodes.includes('SWITCH_STEEP_SHORTENED_CLARITY'));
assert.ok(clarityMod.valveCloseTimeSeconds - mediumPreset.valveCloseTimeSeconds <= 15, 'close-time delay must stay within the ~10-15s bound');
assert.ok(mediumPreset.steepDurationSeconds - clarityMod.steepDurationSeconds <= 30, 'steep shortening must stay within the ~20-30s bound');

const sweetnessIntent = { confidence: 'high', cupDirection: { clarity: 'balanced', body: 'supported', sweetness: 'high' }, finesRisk: 'high' };
const sweetnessMod = modulateSwitchValveTiming(mediumPreset, sweetnessIntent);
assert.ok(sweetnessMod.valveCloseTimeSeconds < mediumPreset.valveCloseTimeSeconds, 'body/sweetness-leaning bean must close the valve earlier');
assert.ok(sweetnessMod.steepDurationSeconds > mediumPreset.steepDurationSeconds, 'high fines risk must extend the steep');
assert.ok(sweetnessMod.reasonCodes.includes('SWITCH_EARLY_CLOSE_SWEETNESS'));
assert.ok(sweetnessMod.reasonCodes.includes('SWITCH_STEEP_EXTENDED_BODY'));
assert.ok(mediumPreset.valveCloseTimeSeconds - sweetnessMod.valveCloseTimeSeconds <= 15, 'earlier-close delta must stay within the ~10-15s bound');
assert.ok(sweetnessMod.steepDurationSeconds - mediumPreset.steepDurationSeconds <= 30, 'steep extension must stay within the ~20-30s bound');

// Sweetness-leaning without high fines risk: earlier close, no steep extension.
const sweetnessNoRisk = modulateSwitchValveTiming(mediumPreset, { confidence: 'medium', cupDirection: { clarity: 'balanced', body: 'supported', sweetness: 'high' } });
assert.ok(sweetnessNoRisk.reasonCodes.includes('SWITCH_EARLY_CLOSE_SWEETNESS'));
assert.ok(!sweetnessNoRisk.reasonCodes.includes('SWITCH_STEEP_EXTENDED_BODY'), 'steep must not extend without high fines/solubility risk');
assert.equal(sweetnessNoRisk.steepDurationSeconds, mediumPreset.steepDurationSeconds);

// Neutral intent (neither leaning) -> baseline with an explicit neutral code.
const neutralMod = modulateSwitchValveTiming(mediumPreset, { confidence: 'high', cupDirection: { clarity: 'balanced', body: 'balanced', sweetness: 'balanced' } });
assert.equal(neutralMod.valveCloseTimeSeconds, mediumPreset.valveCloseTimeSeconds);
assert.equal(neutralMod.steepDurationSeconds, mediumPreset.steepDurationSeconds);
assert.deepEqual(neutralMod.reasonCodes, ['SWITCH_VALVE_TIMING_BASELINE_NEUTRAL_INTENT']);

// End-to-end through the adapter: two beans, same roast, different intent ->
// different valve schedules with reason codes on the generated recipe.
const denseWashedBean = { id: 'dense-washed', process: 'washed', roastLevel: 'medium', sourceInsights: { brewGuidance: 'bright, clean, high clarity cup with crisp acidity' } };
const softNaturalBean = { id: 'soft-natural', process: 'natural', roastLevel: 'medium', sourceInsights: { brewGuidance: 'juicy, syrupy body, low fines risk, very sweet, may stall the bed if pushed too fine' } };
const denseWashedIntent = buildExtractionIntent(denseWashedBean);
const softNaturalIntent = buildExtractionIntent(softNaturalBean);
const denseWashedRecipe = generateV60SwitchRecipe(denseWashedIntent, { dose: 20, roast: 'medium' });
const softNaturalRecipe = generateV60SwitchRecipe(softNaturalIntent, { dose: 20, roast: 'medium' });
const findValveCloseAt = (recipe) => recipe.steps.find((s) => /close the valve/i.test(s.action)).timeSeconds;
assert.notEqual(findValveCloseAt(denseWashedRecipe), findValveCloseAt(softNaturalRecipe), 'same-roast beans with different cup direction must produce different valve-close timestamps');

// --- Dose bounds RangeError ----------------------------------------------
assert.throws(() => generateV60SwitchRecipe({}, { dose: 14 }), RangeError);
assert.throws(() => generateV60SwitchRecipe({}, { dose: 31 }), RangeError);
assert.doesNotThrow(() => generateV60SwitchRecipe({}, { dose: 15 }));
assert.doesNotThrow(() => generateV60SwitchRecipe({}, { dose: 30 }));

// --- Water cap 340g respected: 30g x 1:16.5 (light) would be 495g --------
const capped = generateV60SwitchRecipe({}, { dose: 30, roast: 'light' });
assert.ok(capped.waterGrams <= 340, `water exceeded the 340g cap: ${capped.waterGrams}`);
assert.equal(capped.waterGrams, 340);
assert.ok(capped.reasonCodes.includes('SWITCH_WATER_CAP_APPLIED'));
const uncappedRatio = 16.5;
assert.ok(Number(capped.ratio.split(':')[1]) < uncappedRatio, 'effective ratio must be tighter than the requested ratio once capped');

// --- Non-finite / malformed input rejected --------------------------------
assert.throws(() => generateV60SwitchRecipe({}, { dose: NaN }));
assert.equal(validateV60SwitchCandidate(null).valid, false);
assert.equal(validateV60SwitchCandidate({ ...medium, waterTemp: { celsius: Infinity } }).valid, false);
assert.equal(validateV60SwitchCandidate({ ...medium, totalBrewTimeSeconds: medium.steps.at(-1).timeSeconds }).valid, false);
assert.equal(validateV60SwitchCandidate({ ...medium, steps: [{ timeSeconds: 10, waterTotal: 5, phase: 'percolation', action: 'x' }, { timeSeconds: 5, waterTotal: 20, phase: 'immersion', action: 'Close the valve' }] }).valid, false);

// --- All supported grinders produce in-range settings ---------------------
const grinders = ['fellow-ode-gen2', 'fellow-opus', 'baratza-encore-esp', 'comandante-c40', '1zpresso-jx-pro', 'baratza-virtuoso-plus'];
for (const grinder of grinders) {
  for (const roast of ['light', 'medium', 'dark']) {
    const recipe = generateV60SwitchRecipe({}, { dose: 20, grinder, roast });
    assert.ok(recipe.grindSize.setting != null, `${grinder}/${roast} produced no grind setting`);
    assert.ok(Number.isFinite(recipe.grindSize.microns), `${grinder}/${roast} produced non-finite microns`);
    assert.equal(validateV60SwitchCandidate(recipe).valid, true);
    assert.ok(buildTimerSteps(recipe).length > 0, `${grinder}/${roast} did not build valid timer steps`);
  }
}

// --- Fallback ---------------------------------------------------------------
const fallback = generateV60SwitchFallback({ dose: 20, grinder: 'fellow-ode-gen2' }, 'malformed-evidence');
assert.equal(fallback.fallback, true);
assert.equal(fallback.fallbackReason, 'malformed-evidence');
assert.equal(fallback.roastPreset, 'medium');
assert.equal(validateV60SwitchCandidate(fallback).valid, true);

// --- Real extraction intent wiring ------------------------------------------
const intent = buildExtractionIntent({ process: 'washed', roastLevel: 'medium' });
const wired = generateV60SwitchRecipe(intent, { dose: 20, roast: 'medium' });
assert.equal(wired.device, 'v60');
assert.equal(wired.variant, 'switch');

// --- Defaulted roast + dose reason codes ------------------------------------
const defaulted = generateV60SwitchRecipe({}, {});
assert.ok(defaulted.reasonCodes.includes('DEFAULTED_V60_VARIANT'));
assert.ok(defaulted.reasonCodes.includes('DEFAULTED_V60_SWITCH_DOSE'));
assert.equal(defaulted.roastPreset, 'medium');
assert.equal(defaulted.coffeeGrams, 20);

console.log('v60 switch adapter passed');
