import assert from 'node:assert/strict';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';

// Standalone recipe-shape validator, independent of the adapter's own
// validateV60SwitchCandidate, mirroring scripts/kalita-recipe-contract.test.mjs's
// pattern of a second, adapter-agnostic contract check.
export function validateV60SwitchRecipeShape(recipe) {
  const failures = [];
  const finite = (value, label) => {
    if (!Number.isFinite(value)) failures.push(`${label} must be finite`);
  };
  if (!recipe || typeof recipe !== 'object') return { valid: false, failures: ['recipe must be an object'] };
  if (recipe.device !== 'v60') failures.push('device must stay v60');
  if (recipe.variant !== 'switch') failures.push('variant must be switch');
  if (recipe.configurationKey !== 'v60:03:standard-paper:switch:hot') failures.push('configurationKey must be Switch 03-specific');
  finite(recipe.coffeeGrams, 'coffeeGrams');
  finite(recipe.waterGrams, 'waterGrams');
  if (recipe.waterGrams > 340) failures.push('waterGrams must respect the 340g Switch 03 cap');
  finite(recipe.waterTemp?.celsius, 'waterTemp.celsius');
  // Single kettle temperature only (Revision 2026-08-16) — waterTemp2 must
  // never be emitted by a freshly generated candidate. A stray waterTemp2 on
  // a stale/legacy object (tolerated by display code, never by a fresh
  // generation) is checked here only if it's non-nullish, using a loose
  // comparison so an absent field (undefined) is not mistaken for a
  // malformed present-but-empty one.
  if (recipe.waterTemp2 != null) finite(recipe.waterTemp2?.celsius, 'waterTemp2.celsius');
  finite(recipe.grindSize?.microns, 'grindSize.microns');
  if (!recipe.grindSize?.setting) failures.push('grindSize.setting is required');
  const ratio = Number(String(recipe.ratio || '').match(/1\s*:\s*(\d+(?:\.\d+)?)/)?.[1]);
  if (!Number.isFinite(ratio) || ratio <= 0) failures.push('ratio must be valid');
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) failures.push('steps are required');
  const allowedPhases = new Set(['percolation', 'immersion', 'drawdown']);
  let previousWater = -1;
  let previousTime = -1;
  for (const [index, step] of (recipe.steps || []).entries()) {
    if (!Number.isFinite(step?.timeSeconds) || step.timeSeconds <= previousTime) failures.push(`step ${index} time must strictly ascend`);
    if (Number.isFinite(step?.waterTotal) && step.waterTotal < previousWater) failures.push(`step ${index} water must be monotonic`);
    if (!allowedPhases.has(step?.phase)) failures.push(`step ${index} phase must be percolation/immersion/drawdown`);
    previousTime = step?.timeSeconds;
    if (Number.isFinite(step?.waterTotal)) previousWater = step.waterTotal;
  }
  if (!Number.isFinite(recipe.totalBrewTimeSeconds) || recipe.totalBrewTimeSeconds <= previousTime) failures.push('total duration must follow final step');
  if (!Array.isArray(recipe.reasonCodes) || !recipe.reasonCodes.includes('SWITCH_HYBRID_DEFAULT')) failures.push('SWITCH_HYBRID_DEFAULT reason code missing');
  return { valid: failures.length === 0, failures };
}

const light = generateV60SwitchRecipe({}, { dose: 20, roast: 'light' });
const medium = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' });
const dark = generateV60SwitchRecipe({}, { dose: 20, roast: 'dark' });

for (const recipe of [light, medium, dark]) {
  const result = validateV60SwitchRecipeShape(recipe);
  assert.equal(result.valid, true, `contract failed: ${result.failures.join(', ')}`);
  assert.equal(recipe.waterTemp2, undefined, 'a freshly generated candidate must never carry waterTemp2 (single-temp mandate)');
}

// Negative controls
assert.equal(validateV60SwitchRecipeShape({ ...medium, steps: [{ timeSeconds: 20, waterTotal: 100, phase: 'percolation' }, { timeSeconds: 10, waterTotal: 50, phase: 'immersion' }] }).valid, false);
assert.equal(validateV60SwitchRecipeShape({ ...medium, waterGrams: 400 }).valid, false);
assert.equal(validateV60SwitchRecipeShape({ ...medium, device: 'kalita' }).valid, false);
assert.equal(validateV60SwitchRecipeShape({ ...medium, variant: 'classic' }).valid, false);
assert.equal(validateV60SwitchRecipeShape({ ...medium, steps: [{ timeSeconds: 0, waterTotal: 100, phase: 'bloom' }] }).valid, false);
assert.equal(validateV60SwitchRecipeShape(null).valid, false);

console.log('v60 switch recipe contract passed');
