import assert from 'node:assert/strict';
import { canUseCachedHotRecipe, resolveIcedRetryConfiguration } from '../src/lib/handBrewCachePolicy.js';

assert.equal(canUseCachedHotRecipe({
  forceRegenerate: false,
  cachedRecipe: { device: 'kalita' },
  cachedGrinder: 'fellow-ode-gen2',
  activeGrinder: 'fellow-ode-gen2',
}), true, 'a valid hot cache is independent of the iced cache state');
assert.equal(canUseCachedHotRecipe({
  forceRegenerate: true,
  cachedRecipe: { device: 'kalita' },
  cachedGrinder: 'fellow-ode-gen2',
  activeGrinder: 'fellow-ode-gen2',
}), false);

assert.deepEqual(resolveIcedRetryConfiguration({
  recipe: { device: 'kalita', kalitaSize: '155', coffeeGrams: 16, grinder: 'comandante-c40' },
  bean: {},
  preferences: { brewMethod: 'v60', kalitaSize: '185', grinder: 'fellow-ode-gen2' },
}), { device: 'kalita', size: '155', dose: 16, grinder: 'comandante-c40' });

console.log('hand brew cache policy passed');
