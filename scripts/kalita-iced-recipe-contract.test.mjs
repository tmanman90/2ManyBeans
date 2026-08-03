import assert from 'node:assert/strict';
import { generateKalitaIcedRecipe, validateKalitaIcedCandidate } from '../src/lib/kalitaIcedAdapter.js';

for (const [size, doses] of [['155', [12, 15, 16, 20]], ['185', [15, 20, 30, 31, 33, 36]]]) {
  for (const dose of doses) {
    const recipe = generateKalitaIcedRecipe({}, { size, dose, grinder: 'fellow-opus' });
    assert.deepEqual(validateKalitaIcedCandidate(recipe), { valid: true, errors: [] });
    assert.equal(recipe.steps[0].timeSeconds, 0);
    assert.equal(recipe.steps.at(-1).waterTotal, recipe.hotWaterGrams);
    assert.ok(recipe.guideTargetSeconds > recipe.steps.at(-1).timeSeconds);
    assert.match(recipe.reasoning, /Source-backed starting point/);
    assert.doesNotMatch(`${recipe.title} ${recipe.reasoning}`, /bean-specific|tailored to this bean/i);
  }
}

const kurasu = generateKalitaIcedRecipe({}, { size: '155', dose: 16 });
assert.equal(kurasu.finalBeverageWaterTargetGrams, null);
assert.match(kurasu.postBrewSteps[0].action, /Complete melt is not assumed|does not require every gram/i);

const espressoParts = generateKalitaIcedRecipe({}, { size: '185', dose: 20 });
assert.equal(espressoParts.finalBeverageWaterTargetGrams, null);
assert.equal(espressoParts.finalBeverageRatio, null);
assert.equal(espressoParts.requiresCompleteMelt, false);
assert.match(espressoParts.techniqueInstruction, /gently swirl to chill/i);
assert.doesNotMatch(espressoParts.techniqueInstruction, /melt it/i);

console.log('kalita iced recipe contract passed');
