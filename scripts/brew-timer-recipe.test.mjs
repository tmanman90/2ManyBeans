import assert from 'node:assert/strict';
import test from 'node:test';
import { timerRecipeForMode } from '../src/lib/brewTimerRecipe.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';

test('started attempts keep the exact server snapshot for timer steps', () => {
  const attemptSnapshot = {
    method: 'v60', device: 'v60', mode: 'hot', coffeeGrams: 21, userCoffeeGrams: 20, waterGrams: 315,
    phaseContractVersion: 1, timerReady: true,
    steps: [
      { timeSeconds: 0, waterTotal: 53, action: 'Pour 53g', name: 'Bloom' },
      { timeSeconds: 60, waterTotal: 126, action: 'Pour 73g', name: 'First pour' },
      { timeSeconds: 120, waterTotal: 189, action: 'Pour 63g', name: 'Second pour' },
      { timeSeconds: 180, waterTotal: 252, action: 'Pour 63g', name: 'Third pour' },
      { timeSeconds: 240, waterTotal: 315, action: 'Pour 63g', name: 'Finish' },
    ],
    totalBrewTimeSeconds: 270,
  };
  const timerRecipe = timerRecipeForMode({ recipe: attemptSnapshot, attemptId: 'attempt-21g', effectiveDose: 20 });
  assert.strictEqual(timerRecipe, attemptSnapshot);
  assert.equal(buildTimerSteps(timerRecipe)[0].step.waterTotal, 53);
  assert.equal(timerRecipe.steps.at(-1).waterTotal, 315);
  assert.equal(timerRecipe.coffeeGrams, 21);
});
