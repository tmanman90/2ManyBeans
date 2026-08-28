import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { generateKalitaIcedRecipe } from '../src/lib/kalitaIcedAdapter.js';
import { gradeRecipeLayers, validateRecipe, projectCanonicalRuntime, compareGrindMicrons, RECIPE_COVERAGE } from './ruphus-eval/graders/recipe.mjs';

const aiden = {
  ratio: 17, bloomEnabled: true, bloomRatio: 3, bloomDuration: 45, bloomTemperature: 96,
  ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 23, ssPulseTemperatures: [96, 95],
  batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [96, 95],
};

test('hard-gated grader delegates to canonical production validators', () => {
  const recipes = [
    ['aiden', aiden],
    ['v60', generateV60Recipe({}, { dose: 15 })],
    ['kalita', generateKalitaRecipe({}, { dose: 20 })],
    ['v60-switch', generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' })],
    ['v60-iced', generateV60IcedRecipe({}, { dose: 15 })],
    ['kalita-iced', generateKalitaIcedRecipe({}, { dose: 20, size: '185' })],
  ];
  for (const [method, recipe] of recipes) {
    assert.equal(validateRecipe(method, recipe).valid, true, method);
    const result = gradeRecipeLayers({ method, raw: recipe, parsed: recipe, repaired: recipe, downstream: recipe });
    assert.equal(result.hardGate, true, method);
    const projection = projectCanonicalRuntime(method, recipe);
    if (method === 'aiden') assert.equal(projection.runtime, recipe);
    if (method !== 'aiden') {
      assert.equal(projection.timerReady, true, method);
      assert.ok(projection.timerSteps.length > 0, method);
      assert.deepEqual(projection.runtime.steps, recipe.steps, method);
    }
  }
  assert.equal(RECIPE_COVERAGE.chemex.gate, 'advisory');
});

test('material repair remains visible while post-repair and downstream validity decide the gate', () => {
  const raw = { ...aiden, ratio: 30 };
  const result = gradeRecipeLayers({ method: 'aiden', raw, parsed: raw, repaired: aiden, downstream: aiden, repair: { applied: true, reason: 'range-clamp' } });
  assert.equal(result.repairApplied, true);
  assert.equal(result.layers.raw.valid, false);
  assert.equal(result.layers.postRepair.valid, true);
  assert.equal(result.layers.downstream.valid, true);
  assert.equal(result.hardGate, true);
  assert.equal(gradeRecipeLayers({ method: 'aiden', raw: aiden, parsed: aiden, repaired: aiden }).hardGate, false);

  const broken = { ...generateV60Recipe({}, { dose: 15 }), steps: [...generateV60Recipe({}, { dose: 15 }).steps].reverse() };
  const rejected = gradeRecipeLayers({ method: 'v60', raw: broken, parsed: broken, repaired: broken, downstream: broken });
  assert.equal(rejected.hardGate, false);
  assert.ok(rejected.layers.downstream.errors.includes('invalid-timer-sequence'));
  assert.equal(projectCanonicalRuntime('v60', broken).valid, false);
  const shortGuide = { ...generateV60Recipe({}, { dose: 15 }), guideTargetSeconds: 1 };
  assert.equal(validateRecipe('v60', shortGuide).valid, false);
  assert.equal(projectCanonicalRuntime('v60', shortGuide).valid, false);
});

test('grind direction is graded through microns rather than display labels', () => {
  assert.deepEqual(compareGrindMicrons({ before: { microns: 700 }, after: { microns: 650 }, direction: 'finer' }), { valid: true, correct: true, deltaMicrons: -50, errors: [] });
  assert.equal(compareGrindMicrons({ before: { microns: 700 }, after: { microns: 650 }, direction: 'coarser' }).correct, false);
  assert.equal(compareGrindMicrons({ before: { microns: 700 }, after: { microns: 650 }, direction: 'finer' }).deltaMicrons, -50);
});

test('production source files do not import evaluator modules', () => {
  for (const path of ['src/lib/aiden.js', 'src/lib/aidenProfileValidation.js', 'api/aiden.js']) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /scripts\/ruphus-eval/);
  }
});
