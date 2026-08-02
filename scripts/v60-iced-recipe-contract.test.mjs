import assert from 'node:assert/strict';
import { generateV60IcedRecipe, validateV60IcedCandidate } from '../src/lib/v60IcedAdapter.js';
for (const dose of [12, 15, 20, 21, 30]) {
  const recipe = generateV60IcedRecipe({}, { dose });
  assert.equal(validateV60IcedCandidate(recipe).valid, true);
  assert.equal(recipe.prepSteps.some((step) => /ice/i.test(step.action)), true);
  assert.equal(recipe.icePlacement, 'server');
  assert.equal(recipe.postBrewSteps[0].untimed, true);
  assert.ok(recipe.guideTargetSeconds > recipe.steps.at(-1).timeSeconds);
  assert.ok(recipe.guideRangeSeconds[0] <= recipe.guideTargetSeconds);
  assert.ok(recipe.guideTargetSeconds <= recipe.guideRangeSeconds[1]);
}
const invalidRange = generateV60IcedRecipe({}, { dose: 15 });
invalidRange.guideRangeSeconds = [Number.NaN, invalidRange.guideTargetSeconds + 30];
assert.equal(validateV60IcedCandidate(invalidRange).valid, false);
assert.equal(validateV60IcedCandidate({}).valid, false);
console.log('iced V60 recipe contract passed (5 doses + negative control)');
