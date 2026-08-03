import assert from 'node:assert/strict';
import { generateKalitaIcedRecipe } from '../src/lib/kalitaIcedAdapter.js';

for (const recipe of [
  generateKalitaIcedRecipe({}, { size: '155', dose: 15 }),
  generateKalitaIcedRecipe({}, { size: '185', dose: 20 }),
  generateKalitaIcedRecipe({}, { size: '185', dose: 33 }),
]) {
  for (const step of recipe.steps) {
    assert.match(step.action, /center|circle|spiral/i);
    assert.match(step.action, /swirl|stir/i);
    assert.match(step.action, new RegExp(`${step.waterTotal}g`));
  }
  assert.match(recipe.tips, /timer stays in overtime until you press Finish Brew/i);
}

console.log('kalita iced technique copy passed');
