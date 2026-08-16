import assert from 'node:assert/strict';
import {
  generateV60SwitchRecipe, generateV60SwitchFallback, validateV60SwitchCandidate,
} from '../src/lib/v60SwitchAdapter.js';
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

// Temp split only where the preset dictates it; light has no drop.
assert.equal(light.waterTemp2, null, 'light roast must not carry a temp drop');
assert.equal(medium.waterTemp2.celsius, 70);
assert.ok(dark.waterTemp2.celsius < dark.waterTemp.celsius);
assert.ok(medium.reasonCodes.includes('SWITCH_TEMP_SPLIT_MEDIUM'));
assert.ok(dark.reasonCodes.includes('SWITCH_TEMP_SPLIT_DARK'));
assert.ok(light.reasonCodes.includes('SWITCH_LIGHT_NO_TEMP_DROP'));
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
