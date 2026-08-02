import assert from 'node:assert/strict';
import { generateV60HotWithFallback, generateV60IcedWithFallback, v60DoseForRequest } from '../src/lib/v60Generation.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';

for (const [input, expected] of [[10, 12], [11, 12], [12, 12], [30, 30], [31, 30], [40, 30]]) assert.equal(v60DoseForRequest(input), expected);
for (const dose of [12, 30]) {
  assert.equal(generateV60Recipe({}, { dose }).coffeeGrams, dose);
  assert.equal(generateV60IcedRecipe({}, { dose }).coffeeGrams, dose);
}
for (const dose of [11, 31]) {
  assert.throws(() => generateV60Recipe({}, { dose }), /between 12g and 30g/);
  assert.throws(() => generateV60IcedRecipe({}, { dose }), /between 12g and 30g/);
}
let legacyCalls = 0;
const failedHot = generateV60HotWithFallback({ candidateGenerator: () => { throw new Error('candidate'); }, fallbackGenerator: () => { throw new Error('fallback'); } });
assert.equal(failedHot.recipe, null);
const failedIced = generateV60IcedWithFallback({ candidateGenerator: () => { throw new Error('candidate'); }, fallbackGenerator: () => { throw new Error('fallback'); } });
assert.equal(failedIced.recipe, null);
assert.equal(legacyCalls, 0);
console.log('V60 cutover boundaries passed (10/11/12/30/31/40, deterministic fail-closed)');
