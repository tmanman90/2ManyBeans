import assert from 'node:assert/strict';
import { compareRecipes } from './kalita-recipe-compare.mjs';

const recipe = {
  coffeeGrams: 20, waterGrams: 320, ratio: '1:16', waterTemp: { celsius: 96 },
  grindSize: { setting: '6', microns: 700 }, technique: 'low-agitation-center',
  steps: [{ timeSeconds: 0, waterTotal: 0 }, { timeSeconds: 30, waterTotal: 60 }, { timeSeconds: 90, waterTotal: 320 }], totalBrewTimeSeconds: 210,
};
assert.equal(compareRecipes(recipe, { ...recipe, reasoning: 'Different words' }).deltas[0].type, 'explanation-only');
assert.equal(compareRecipes(recipe, { ...recipe, coffeeGrams: 15 }).deltas[0].type, 'physical');
assert.equal(compareRecipes(recipe, { ...recipe, totalBrewTimeSeconds: 90 }).outcome, 'unknown');
assert.deepEqual(compareRecipes(recipe, { ...recipe, waterTemp: { celsius: 99 } }, { legacyVariance: { temperature: [94, 97] } }).reviewFlags, ['candidate-temperature-outside-legacy-variance']);
console.log('kalita recipe comparator passed');
