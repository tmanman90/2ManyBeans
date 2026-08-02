import assert from 'node:assert/strict';
import { generateV60Recipe, validateV60Candidate } from '../src/lib/v60Adapter.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
for (const dose of [12, 15, 18, 20, 24, 25, 30]) {
  const recipe = generateV60Recipe({ reasonCodes: [] }, { dose, grinder: dose === 20 ? 'other' : 'fellow-ode-gen2' });
  assert.equal(validateV60Candidate(recipe).valid, true);
  assert.ok(recipe.guideTargetSeconds > recipe.steps.at(-1).timeSeconds);
  assert.ok(recipe.steps.every((step, i) => i === 0 || step.timeSeconds > recipe.steps[i - 1].timeSeconds));
  assert.ok(buildTimerSteps(recipe));
}
assert.equal(validateV60Candidate({}).valid, false);
console.log('v60 recipe contract passed (7 doses + negative control)');
