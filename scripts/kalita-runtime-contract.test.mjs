import assert from 'node:assert/strict';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { scaleRecipeForDose } from '../src/lib/recipeScaling.js';
import { transformToFlashBrew } from '../src/lib/flashBrewTransform.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
import { generateKalitaIcedRecipe } from '../src/lib/kalitaIcedAdapter.js';

for (const dose of [15, 20, 30]) {
  const size = dose === 15 ? '155' : '185';
  const hot = generateKalitaRecipe({ confidence: 'high', finesRisk: dose === 15 ? 'high' : 'unknown', reasonCodes: [] }, { size, dose, grinder: 'fellow-ode-gen2' });
  const timers = buildTimerSteps(hot);
  assert.ok(timers.length === hot.steps.length);
  assert.ok(hot.totalBrewTimeSeconds > timers.at(-1).startSeconds);
  assert.equal(hot.steps.at(-1).waterTotal, hot.waterGrams);
  const scaled = scaleRecipeForDose(hot, dose + 1);
  assert.deepEqual(scaled.doseTiming, { policy: 'generated-dose-v1', generatedDose: dose, displayedDose: dose + 1 });
  assert.equal(scaled.steps.at(-1).waterTotal, scaled.waterGrams);
  assert.throws(() => transformToFlashBrew(hot, 'kalita', dose), /independent iced Kalita adapter/);
  const iced = generateKalitaIcedRecipe({}, { size, dose, grinder: 'fellow-ode-gen2' });
  assert.equal(iced.kalitaSize, size);
  assert.notEqual(iced.engineVersion, hot.engineVersion);
  assert.notEqual(iced.configurationKey, hot.configurationKey);
  assert.ok(iced.timerReady);
  assert.ok(iced.steps.every((step, index) => Number.isFinite(step.timeSeconds) && (index === 0 || step.timeSeconds > iced.steps[index - 1].timeSeconds)));
  assert.ok(iced.totalBrewTimeSeconds > iced.steps.at(-1).timeSeconds);
}

const legacy = { coffeeGrams: 20, waterGrams: 320, ratio: '1:16', steps: [], timerReady: false };
assert.equal(scaleRecipeForDose(legacy, 18).doseTiming, undefined);
assert.equal(transformToFlashBrew(legacy, 'kalita', 18).isIced, true);
console.log('kalita runtime contract passed');
