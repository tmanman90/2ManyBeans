import assert from 'node:assert/strict';
import { generateV60Recipe, generateV60RecipeForTechnique, validateV60Candidate } from '../src/lib/v60Adapter.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
import { getV60TechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';

// Observed Koffee Mameya V60 (2026-11-27): 12g/180g, three equal pours
// at 0:00/0:35/1:10 (spirals), no agitation, dripper lifted off before drawdown ends.
const exact = generateV60RecipeForTechnique('mameya-three-pour', {}, { dose: 12, grinder: 'fellow-ode-gen2' });
assert.equal(validateV60Candidate(exact).valid, true, validateV60Candidate(exact).errors.join(', '));
assert.deepEqual(exact.steps.map((step) => step.timeSeconds), [0, 35, 70, 85]);
assert.deepEqual(exact.steps.map((step) => step.waterTotal), [60, 120, 180, 180]);
assert.equal(exact.ratio, '1:15');
assert.equal(exact.guideTargetSeconds, 90, 'the brew ends at the 1:30 pull, not at drawdown');
assert.deepEqual(exact.guideRangeSeconds, [85, 95]);
assert.match(exact.steps.at(-1).action, /lift the dripper off the server by 1:30/i);
// Pour path from the video (frame tracking of the kettle neck): pour 1 holds
// the center 2-3 s then small circles about once a second, pour 2 is small
// circles the whole way, pour 3 circles for the first half then holds still
// in the center.
assert.match(exact.steps[0].action, /about 6g per second/);
assert.match(exact.steps[0].action, /center for the first 2 to 3 seconds.*small circles, about one per second and 2 to 3 cm wide/i);
assert.match(exact.steps[1].action, /small circles the whole way.*about one per second/i);
assert.match(exact.steps[2].action, /small circles for the first half \(one spiral out and back\).*hold the spout still in the center/i);
assert.ok(exact.steps.every((step) => !/\b(?:gently swirl|give .* swirl|stir once)\b/i.test(step.action)), 'no agitation steps');
assert.doesNotMatch(exact.tips, /occasional drips/i, 'early-pull tips must not say to wait for drawdown');
assert.equal(exact.grindSize.microns, 836);
assert.equal(exact.grindSize.setting, '7.2');
assert.ok(buildTimerSteps(exact).length === 4);

// The kettle temperature was not visible: 92C is an app value, never credited to the source.
assert.equal(exact.waterTemp.celsius, 92);
assert.equal(exact.sourceLineage.status, 'adapted');
assert.ok(exact.sourceLineage.changedFields.includes('temperature'));
assert.equal(exact.sourceLineage.parameterSources.temperature, 'v60-adaptation-bounded-v1');
assert.equal(exact.sourceLineage.parameterSources.cadence, 'mameya-three-pour-observed-v1');
assert.match(exact.sourceLineage.adaptation, /^Observed method: Koffee Mameya/);

// Larger doses keep the slow pour and the rest between pours, and still pull early.
for (const dose of [15, 20, 30]) {
  const recipe = generateV60RecipeForTechnique('mameya-three-pour', {}, { dose });
  assert.equal(validateV60Candidate(recipe).valid, true, `${dose}g: ${validateV60Candidate(recipe).errors.join(', ')}`);
  assert.equal(recipe.sourceLineage.status, 'adapted');
  assert.ok(recipe.sourceLineage.changedFields.includes('cadence'));
  const [first, second, third, pull] = recipe.steps;
  assert.equal(third.waterTotal, recipe.waterGrams);
  assert.ok(second.timeSeconds >= 35 && third.timeSeconds === second.timeSeconds * 2);
  const pourSeconds = Math.round(first.waterTotal / 6);
  assert.ok(second.timeSeconds - pourSeconds >= 20, `${dose}g keeps a real rest between pours`);
  assert.equal(pull.waterTotal, recipe.waterGrams);
  assert.equal(recipe.guideTargetSeconds, pull.timeSeconds + 5);
  assert.ok(recipe.guideTargetSeconds < 180, `${dose}g is still a short brew`);
  assert.ok(buildTimerSteps(recipe).length === 4);
}

// Explicit choice only: the automatic selector never lands on it.
const intents = [{}, { finesRisk: 'high' }, { finesRisk: 'low', energyTendency: 'higher' }, { energyTendency: 'lower' },
  { techniquePreference: 'bloom-led-pulse' }, { techniquePreference: 'low-agitation-center' }, { desiredStrength: 'stronger' }];
for (const intent of intents) {
  for (const dose of [12, 15, 20, 30]) assert.notEqual(generateV60Recipe(intent, { dose }).technique, 'mameya-three-pour');
}

// Other families keep their drawdown-based finish.
const hoffmann = generateV60RecipeForTechnique('hoffmann-small-pulses', {}, { dose: 15 });
assert.equal(hoffmann.guideTargetSeconds, 180);
assert.match(hoffmann.tips, /occasional drips/);

const option = getV60TechniqueOption('mameya-three-pour');
assert.equal(option.name, 'Koffee Mameya Three-Pour');
assert.equal(option.attribution.evidenceType, 'observed');
assert.ok(option.differences.some((line) => /not a published recipe/.test(line)));

console.log('v60 Mameya technique passed');
