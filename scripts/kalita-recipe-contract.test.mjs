import assert from 'node:assert/strict';

export function validateKalitaRecipe(recipe) {
  const failures = [];
  const finite = (value, label) => {
    if (!Number.isFinite(value)) failures.push(`${label} must be finite`);
  };
  if (!recipe || typeof recipe !== 'object') return { valid: false, failures: ['recipe must be an object'] };
  finite(recipe.coffeeGrams, 'coffeeGrams');
  finite(recipe.waterGrams, 'waterGrams');
  finite(recipe.waterTemp?.celsius, 'waterTemp.celsius');
  finite(recipe.grindSize?.microns, 'grindSize.microns');
  if (!recipe.grindSize?.setting) failures.push('grindSize.setting is required');
  const ratio = Number(String(recipe.ratio || '').match(/1\s*:\s*(\d+(?:\.\d+)?)/)?.[1]);
  if (!Number.isFinite(ratio) || ratio <= 0) failures.push('ratio must be valid');
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) failures.push('steps are required');
  let previousWater = -1;
  let previousTime = -1;
  for (const [index, step] of (recipe.steps || []).entries()) {
    if (!Number.isFinite(step?.timeSeconds) || step.timeSeconds <= previousTime) failures.push(`step ${index} time must strictly ascend`);
    if (Number.isFinite(step?.waterTotal) && step.waterTotal < previousWater) failures.push(`step ${index} water must be monotonic`);
    previousTime = step?.timeSeconds;
    if (Number.isFinite(step?.waterTotal)) previousWater = step.waterTotal;
  }
  if (!Number.isFinite(recipe.totalBrewTimeSeconds) || recipe.totalBrewTimeSeconds <= previousTime) failures.push('total duration must follow final step');
  return { valid: failures.length === 0, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const valid = {
    coffeeGrams: 20, waterGrams: 320, ratio: '1:16',
    waterTemp: { celsius: 96 }, grindSize: { setting: '6', microns: 700 },
    steps: [{ timeSeconds: 0, waterTotal: 0 }, { timeSeconds: 30, waterTotal: 60 }, { timeSeconds: 90, waterTotal: 320 }],
    totalBrewTimeSeconds: 210,
  };
  assert.equal(validateKalitaRecipe(valid).valid, true);
  assert.equal(validateKalitaRecipe({ ...valid, steps: [{ timeSeconds: 20, waterTotal: 100 }, { timeSeconds: 10, waterTotal: 50 }] }).valid, false);
  console.log('kalita recipe contract passed');
}
