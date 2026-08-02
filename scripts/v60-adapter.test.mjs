import assert from 'node:assert/strict';
import { generateV60Fallback, generateV60Recipe, validateV60Candidate } from '../src/lib/v60Adapter.js';
import { buildExtractionIntent } from '../src/lib/extractionIntent.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';

const cases = [
  [{}, { dose: 15, grinder: 'fellow-ode-gen2' }, 'hoffmann-small-pulses'],
  [{}, { dose: 30, grinder: 'comandante-c40' }, 'hoffmann-large-batch'],
  [{ finesRisk: 'high' }, { dose: 20, grinder: 'other' }, 'gentle-main-pour'],
  [{ energyTendency: 'higher', finesRisk: 'low' }, { dose: 20 }, 'rao-two-stage'],
  [{ family: 'clean-natural-fruit', techniquePreference: 'bloom-led-pulse' }, { dose: 18 }, 'kasuya-coarse-pulses'],
];
for (const [intent, config, technique] of cases) {
  const recipe = generateV60Recipe(intent, config);
  assert.equal(recipe.technique, technique);
  assert.equal(validateV60Candidate(recipe).valid, true);
  assert.ok(buildTimerSteps(recipe).length > 0);
  assert.equal(recipe.steps.at(-1).waterTotal, recipe.waterGrams);
  assert.equal(recipe.steps[0].timeSeconds, 0);
}
assert.throws(() => generateV60Recipe({}, { dose: 11 }));
const fallback = generateV60Fallback({ dose: 15, grinder: 'other' }, 'malformed-evidence');
assert.equal(fallback.fallback, true);
assert.equal(fallback.grindSize.setting, null);
assert.equal(fallback.fallbackReason, 'malformed-evidence');
const intent = buildExtractionIntent({ process: 'washed', roastLevel: 'light' });
assert.equal(generateV60Recipe(intent, { dose: 15 }).device, 'v60');

const floralLowTemperature = buildExtractionIntent(
  { process: 'washed', roastLevel: 'light', brewingRec: 'Use a center-to-spiral pour at 95C.' },
  { cupStructureFamily: 'washed-floral-clarity', densityEstimate: 'high' },
);
assert.equal(generateV60Recipe(floralLowTemperature, { dose: 15 }).technique, 'hoffmann-small-pulses');

const heart15 = generateV60Recipe({ finesRisk: 'high' }, { dose: 15 });
const heart20 = generateV60Recipe({ finesRisk: 'high' }, { dose: 20 });
assert.ok(heart15.guideTargetSeconds < heart20.guideTargetSeconds);
assert.equal(heart15.ratio, '1:16.36');
for (const recipe of [heart15, heart20]) {
  assert.ok(recipe.guideRangeSeconds[0] <= recipe.guideTargetSeconds);
  assert.ok(recipe.guideTargetSeconds <= recipe.guideRangeSeconds[1]);
}
console.log(`v60 adapter passed (${cases.length} branches + fallback)`);
