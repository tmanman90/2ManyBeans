import assert from 'node:assert/strict';
import { buildTimerSteps, normalizeRecipePhases } from '../src/lib/brewTimerSteps.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { transformPourOver } from '../src/lib/flashBrewTransform.js';

for (const recipe of [generateV60Recipe({}, { dose: 15 }), generateV60IcedRecipe({}, { dose: 16 })]) {
  const timers = buildTimerSteps(recipe);
  assert.ok(timers);
  assert.equal(recipe.steps[0].timeSeconds, 0);
  assert.equal(recipe.steps.at(-1).waterTotal, recipe.mode === 'iced' ? recipe.hotWaterGrams : recipe.waterGrams);
  assert.ok(recipe.guideTargetSeconds > recipe.steps.at(-1).timeSeconds);
}
assert.throws(() => transformPourOver(generateV60Recipe({}, { dose: 15 }), 15), /independent iced V60 adapter/);
const legacy = { phaseContractVersion: 1, timerReady: true, device: 'v60', coffeeGrams: 20, ratio: '1:16', totalBrewTimeSeconds: 180, steps: [
  { timeSeconds: 0, time: '0:00', action: 'Rinse filter', waterTotal: 0 },
  { timeSeconds: 30, time: '0:30', action: 'Bloom with 40g water', waterTotal: 40 },
  { timeSeconds: 90, time: '1:30', action: 'Pour to 320g water', waterTotal: 320 },
] };
const icedLegacy = transformPourOver(legacy, 20);
assert.equal(icedLegacy.prepSteps.some((step) => /ice/i.test(step.action)), true);
assert.equal(icedLegacy.steps[0].timeSeconds, 0);
assert.equal(icedLegacy.totalBrewTimeSeconds, 180);
assert.equal(icedLegacy.postBrewSteps[0].untimed, true);
assert.ok(normalizeRecipePhases(legacy));
console.log('v60 runtime contract passed (hot/iced timer, legacy isolation, hot rejection)');
