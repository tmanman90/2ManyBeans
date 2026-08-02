import assert from 'node:assert/strict';
import { generateV60IcedFallback, generateV60IcedRecipe, validateV60IcedCandidate } from '../src/lib/v60IcedAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
const small = generateV60IcedRecipe({}, { dose: 16 });
assert.equal(small.technique, 'pulse-67-33-flash');
assert.equal(validateV60IcedCandidate(small).valid, true);
assert.equal(small.steps[0].timeSeconds, 0);
assert.equal(small.hotWaterGrams + small.initialBrewIceGrams, small.finalBeverageWaterTargetGrams);
const denseSmall = generateV60IcedRecipe({ grindAdjustmentMicrons: -20 }, { dose: 16 });
assert.ok(denseSmall.grindSize.microns < small.grindSize.microns);
assert.ok(denseSmall.sourceLineage.changedFields.includes('grind'));
const large = generateV60IcedRecipe({}, { dose: 30, grinder: 'other' });
assert.equal(large.technique, 'classic-60-40-flash');
assert.equal(large.grindSize.setting, null);
const kurasu = generateV60IcedRecipe({ finesRisk: 'high' }, { dose: 16 });
assert.equal(kurasu.technique, 'kurasu-staged-flash');
const kurasu15 = generateV60IcedRecipe({ finesRisk: 'high' }, { dose: 15 });
const kurasu20 = generateV60IcedRecipe({ finesRisk: 'high' }, { dose: 20 });
assert.ok(kurasu15.guideTargetSeconds < kurasu20.guideTargetSeconds);
for (const recipe of [kurasu15, kurasu20]) {
  assert.ok(recipe.guideRangeSeconds[0] <= recipe.guideTargetSeconds);
  assert.ok(recipe.guideTargetSeconds <= recipe.guideRangeSeconds[1]);
}
const fallback = generateV60IcedFallback({ dose: 20 }, 'invalid-evidence');
assert.equal(fallback.fallback, true);
assert.equal(generateV60Recipe({}, { dose: 16 }).mode, 'hot');
assert.notEqual(small.technique, generateV60Recipe({}, { dose: 16 }).technique);
assert.equal(validateV60IcedCandidate({ ...small, initialBrewIceGrams: small.initialBrewIceGrams + 1 }).valid, false);
console.log('iced V60 adapter passed (families, custom grinder, fallback, hot rejection)');
