import assert from 'node:assert/strict';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
import { scaleRecipeForDose } from '../src/lib/recipeScaling.js';

function makeRecipe(overrides = {}) {
  return {
    coffeeGrams: 20,
    waterGrams: 320,
    ratio: '1:16',
    timerReady: true,
    totalBrewTime: '2:00',
    totalBrewTimeSeconds: 120,
    steps: [
      {
        time: '0:00',
        timeSeconds: 0,
        action: 'Add 20g coffee and level the bed.',
      },
      {
        time: '0:30',
        timeSeconds: 30,
        action: 'Bloom with 40 g water.',
        waterTotal: 40,
      },
      {
        time: '1:15',
        timeSeconds: 75,
        action: 'Pour to 160 g total, adding 120 grams.',
        waterTotal: 160,
      },
    ],
    ...overrides,
  };
}

// Reported regression: structured and human-readable bloom quantities must
// change together when the dose changes from 20 g to 18 g.
{
  const scaled = scaleRecipeForDose(makeRecipe(), 18);

  assert.equal(scaled.steps[1].action, 'Bloom with 36 g water.');
  assert.equal(scaled.steps[1].waterTotal, 36);
  assert.equal(scaled.steps[2].action, 'Pour to 144 g total, adding 108 grams.');
  assert.equal(scaled.steps[2].waterTotal, 144);
  assert.equal(scaled.steps[0].action, 'Add 18g coffee and level the bed.');
}

// Integer and decimal quantities use nearest-whole-gram rounding while the
// original spacing, unit spelling, and unit casing are preserved.
{
  const recipe = makeRecipe({
    steps: [
      {
        action: 'Use 20g, 20 g, 20gram, 20grams, 20G, 20 GrAmS, 40.5 g, and 40 grams.',
      },
    ],
  });

  const scaled = scaleRecipeForDose(recipe, 18);

  assert.equal(
    scaled.steps[0].action,
    'Use 18g, 18 g, 18gram, 18grams, 18G, 18 GrAmS, 36 g, and 36 grams.'
  );
}

// Only whole gram-unit tokens are dose-derived. Other numbers and embedded
// lookalikes remain byte-for-byte unchanged.
{
  const action = 'At 1:15, stir 2x at 95°C with a 5 cm motion; leave 50mg, -20g, and move 5 gently.';
  const scaled = scaleRecipeForDose(makeRecipe({ steps: [{ action }] }), 18);

  assert.equal(scaled.steps[0].action, action);
}

// Both explicit gram quantities in a compact hyphenated range scale.
{
  const scaled = scaleRecipeForDose(
    makeRecipe({ steps: [{ action: 'Pour 40g-50g water.' }] }),
    18
  );

  assert.equal(scaled.steps[0].action, 'Pour 36g-45g water.');
}

// Scaling is a pure render-time derivation and remains safe for sparse steps.
{
  const recipe = makeRecipe({
    steps: [
      null,
      { time: '0:00', timeSeconds: 0, action: 'Add 20 grams coffee.' },
      { time: '0:30', timeSeconds: 30 },
      { time: '1:00', timeSeconds: 60, action: 20, waterTotal: 100 },
    ],
  });
  const snapshot = structuredClone(recipe);
  const scaled = scaleRecipeForDose(recipe, 18);

  assert.deepEqual(recipe, snapshot);
  assert.notStrictEqual(scaled, recipe);
  assert.notStrictEqual(scaled.steps, recipe.steps);
  assert.equal(scaled.steps[0], null);
  assert.equal(scaled.steps[1].action, 'Add 18 grams coffee.');
  assert.equal('waterTotal' in scaled.steps[1], false);
  assert.equal('action' in scaled.steps[2], false);
  assert.equal(scaled.steps[3].action, 20);
  assert.equal(scaled.steps[3].waterTotal, 90);
  assert.equal(scaled.steps[3].time, recipe.steps[3].time);
  assert.equal(scaled.steps[3].timeSeconds, recipe.steps[3].timeSeconds);
  assert.equal(scaled.timerReady, recipe.timerReady);
  assert.equal(scaled.totalBrewTime, recipe.totalBrewTime);
  assert.equal(scaled.totalBrewTimeSeconds, recipe.totalBrewTimeSeconds);
}

// Existing fallback paths preserve object identity and leave action copy alone.
{
  const recipe = makeRecipe();
  const invalidDoses = [null, undefined, 0, Number.NaN, Number.POSITIVE_INFINITY, '18'];

  for (const invalidDose of invalidDoses) {
    assert.strictEqual(scaleRecipeForDose(recipe, invalidDose), recipe);
  }

  assert.strictEqual(scaleRecipeForDose(recipe, recipe.coffeeGrams), recipe);

  const invalidRatioRecipe = makeRecipe({ ratio: 'not a ratio' });
  assert.strictEqual(scaleRecipeForDose(invalidRatioRecipe, 18), invalidRatioRecipe);
  assert.equal(invalidRatioRecipe.steps[1].action, 'Bloom with 40 g water.');
}

// BrewTimer consumes the same derived step objects, retaining aligned copy,
// structured totals, and unchanged timing data.
{
  const recipe = makeRecipe();
  const scaled = scaleRecipeForDose(recipe, 18);
  const timerSteps = buildTimerSteps(scaled);

  assert.deepEqual(
    timerSteps.map(({ startSeconds, durationSeconds }) => ({ startSeconds, durationSeconds })),
    [
      { startSeconds: 0, durationSeconds: 30 },
      { startSeconds: 30, durationSeconds: 45 },
      { startSeconds: 75, durationSeconds: 45 },
    ]
  );
  assert.strictEqual(timerSteps[1].step, scaled.steps[1]);
  assert.equal(timerSteps[1].step.action, 'Bloom with 36 g water.');
  assert.equal(timerSteps[1].step.waterTotal, 36);
  assert.equal(timerSteps[1].step.time, recipe.steps[1].time);
  assert.equal(timerSteps[1].step.timeSeconds, recipe.steps[1].timeSeconds);
}

console.log('recipe scaling regression passed');
