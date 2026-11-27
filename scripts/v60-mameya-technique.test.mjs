import assert from 'node:assert/strict';
import { generateV60Recipe, generateV60RecipeForTechnique, isMameyaV60Family, validateV60Candidate } from '../src/lib/v60Adapter.js';
import { buildExtractionIntent } from '../src/lib/extractionIntent.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
import { getV60TechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';

// Koffee Mameya V60 (2026-11-27): 12g/180g, three equal pours on the staff's
// 30 s clock (0:00/0:30/1:00), small circles, no agitation, dripper lifted off
// by 1:30 before drawdown ends.
const exact = generateV60RecipeForTechnique('mameya-three-pour', {}, { dose: 12, grinder: 'fellow-ode-gen2' });
assert.equal(validateV60Candidate(exact).valid, true, validateV60Candidate(exact).errors.join(', '));
assert.deepEqual(exact.steps.map((step) => step.timeSeconds), [0, 30, 60, 85]);
assert.deepEqual(exact.steps.map((step) => step.waterTotal), [60, 120, 180, 180]);
assert.equal(exact.ratio, '1:15');
assert.equal(exact.guideTargetSeconds, 90, 'the brew ends at the 1:30 pull, not at drawdown');
assert.deepEqual(exact.guideRangeSeconds, [85, 95]);
assert.match(exact.steps.at(-1).action, /lift the dripper off the server by 1:30/i);
// Pour path from the video (frame tracking of the kettle neck): pour 1 holds
// the center 2-3 s then small circles about once a second, pour 2 is small
// circles the whole way, pour 3 circles for the first half then holds still
// in the center.
assert.match(exact.steps[0].action, /about 6g per second/);
assert.match(exact.steps[0].action, /center for the first 2 to 3 seconds.*small circles, about one per second and about 3 cm across/i);
assert.match(exact.steps[1].action, /small circles the whole way.*about one per second/i);
assert.match(exact.steps[2].action, /small circles for the first half \(one spiral out and back\).*hold the spout still in the center/i);
assert.ok(exact.steps.every((step) => !/\b(?:gently swirl|give .* swirl|stir once)\b/i.test(step.action)), 'no agitation steps');
assert.doesNotMatch(exact.tips, /occasional drips/i, 'early-pull tips must not say to wait for drawdown');
assert.equal(exact.grindSize.microns, 836);
assert.equal(exact.grindSize.setting, '7.2');
assert.ok(buildTimerSteps(exact).length === 4);

// 90C is the house temperature and is part of the method: a bean's usual
// temperature does not override it.
assert.equal(exact.waterTemp.celsius, 90);
assert.equal(generateV60RecipeForTechnique('mameya-three-pour', { targetTemperatureC: 96 }, { dose: 12 }).waterTemp.celsius, 90);
assert.equal(exact.sourceLineage.status, 'original', 'the 12g recipe is the house recipe as given');
assert.ok(!exact.sourceLineage.changedFields.includes('temperature'));
assert.equal(exact.sourceLineage.parameterSources.temperature, 'mameya-three-pour-observed-v1');
assert.equal(exact.sourceLineage.parameterSources.cadence, 'mameya-three-pour-observed-v1');
assert.match(exact.sourceLineage.adaptation, /^Observed method: Koffee Mameya/);

// Staff numbers for 20g: 100g pours, done in 95 seconds.
const twenty = generateV60RecipeForTechnique('mameya-three-pour', {}, { dose: 20 });
assert.deepEqual(twenty.steps.map((step) => step.waterTotal), [100, 200, 300, 300]);
assert.deepEqual(twenty.steps.map((step) => step.timeSeconds), [0, 30, 60, 90]);
assert.equal(twenty.guideTargetSeconds, 95);
assert.match(twenty.steps.at(-1).action, /by 1:35/);

// Every dose keeps the 30 s clock, a slow pour with a real pause, and the early pull.
for (const dose of [15, 20, 30]) {
  const recipe = generateV60RecipeForTechnique('mameya-three-pour', {}, { dose });
  assert.equal(validateV60Candidate(recipe).valid, true, `${dose}g: ${validateV60Candidate(recipe).errors.join(', ')}`);
  assert.equal(recipe.sourceLineage.status, 'scaled');
  assert.equal(recipe.waterTemp.celsius, 90);
  assert.ok(recipe.sourceLineage.changedFields.includes('cadence'));
  const [first, second, third, pull] = recipe.steps;
  assert.equal(third.waterTotal, recipe.waterGrams);
  assert.equal(second.timeSeconds, 30);
  assert.equal(third.timeSeconds, 60);
  const pourSeconds = Number(first.action.match(/over about (\d+) seconds/)[1]);
  assert.ok(second.timeSeconds - pourSeconds >= 5, `${dose}g leaves a pause between pours`);
  assert.ok(recipe.guideTargetSeconds >= 90 && recipe.guideTargetSeconds <= 102, `${dose}g total stays near the staff's 90-95 s`);
  assert.equal(pull.waterTotal, recipe.waterGrams);
  assert.equal(recipe.guideTargetSeconds, pull.timeSeconds + 5);
  assert.ok(buildTimerSteps(recipe).length === 4);
}

// Abstract intents with no light washed bean behind them never land on it.
const intents = [{}, { finesRisk: 'high' }, { finesRisk: 'low', energyTendency: 'higher' }, { energyTendency: 'lower' },
  { techniquePreference: 'bloom-led-pulse' }, { techniquePreference: 'low-agitation-center' }, { desiredStrength: 'stronger' }];
for (const intent of intents) {
  for (const dose of [12, 15, 20, 30]) assert.notEqual(generateV60Recipe(intent, { dose }).technique, 'mameya-three-pour');
}

// The bean family (2026-11-27): light, washed and delicate like the Alo Zero
// Washed gets Mameya automatically. Tal: not every light roast, "the ones like that".
const technique = (bean, research = null, dose = 15) => generateV60Recipe(buildExtractionIntent(bean, research), { dose }).technique;
const alo = { name: 'Alo Zero Washed', origin: 'Ethiopia', process: 'Washed', roastLevel: 'light' };
for (const dose of [12, 15, 20, 24]) {
  const recipe = generateV60Recipe(buildExtractionIntent(alo, { cupStructureFamily: 'washed-ethiopia-clarity' }), { dose });
  assert.equal(recipe.technique, 'mameya-three-pour', `Alo-like bean at ${dose}g`);
  assert.equal(recipe.waterTemp.celsius, 90);
  assert.equal(recipe.waterGrams, Math.round(dose * 15));
  assert.match(recipe.reasoning, /delicate light washed coffee like this is what Koffee Mameya brews/);
}
const aloResearch = { cupStructureFamily: 'washed-ethiopia-clarity' };
assert.equal(technique({ ...alo, roastLevel: 'Ultra-Light' }, aloResearch), 'mameya-three-pour');
assert.equal(technique({ ...alo, origin: 'Colombia', variety: 'Gesha' }, { cupStructureFamily: 'washed-floral-clarity' }), 'mameya-three-pour');
assert.equal(isMameyaV60Family(buildExtractionIntent(alo, aloResearch)), true);

// Outside the family: naturals and other fruit-forward processes, anything with
// medium or dark in the roast, unknown roast, heavier cup families, big doses,
// and beans with explicit flow-risk guidance keep their usual recipes.
const tresDragones = { name: 'Tres Dragones', origin: 'Colombia', process: 'Natural', roastLevel: 'light' };
const outside = [
  [tresDragones, { cupStructureFamily: 'clean-natural-fruit' }],
  [{ ...alo, process: 'Natural' }, aloResearch],
  [{ ...alo, process: 'Honey' }, aloResearch],
  [{ ...alo, process: 'Washed Anaerobic' }, aloResearch],
  [alo, { ...aloResearch, processingNuance: 'co-fermented with fruit' }],
  [{ ...alo, roastLevel: 'medium' }, aloResearch],
  [{ ...alo, roastLevel: 'light-medium' }, aloResearch],
  [{ ...alo, roastLevel: 'medium-light' }, aloResearch],
  [{ ...alo, roastLevel: 'dark' }, aloResearch],
  [{ ...alo, roastLevel: '' }, aloResearch],
  // Not every light washed coffee: other cup families keep their recipes.
  [{ ...alo, origin: 'Kenya' }, { cupStructureFamily: 'washed-kenya-clarity' }],
  [{ ...alo, origin: 'Colombia' }, { cupStructureFamily: 'generic-washed' }],
  [alo, { cupStructureFamily: 'processed-clarity' }],
  [alo, { cupStructureFamily: 'medium-washed' }],
  [alo, null], // no bean research yet, so no cup family to go on
  [{ ...alo, brewingRec: 'This coffee can stall; watch for slow drawdown.' }, aloResearch],
];
for (const [bean, research] of outside) {
  assert.notEqual(technique(bean, research), 'mameya-three-pour', JSON.stringify({ bean, research }));
}
assert.equal(technique(alo, aloResearch, 25), 'hoffmann-large-batch', '25g+ keeps the large-batch profile');
// A roaster's own complete V60 recipe still wins over the family rule.
const roasterRecipe = { id: 'roaster-v60', mode: 'hot', device: 'v60', configuration: 'V60 02', status: 'original', canonicalUrl: 'https://roaster.example/v60', doseGrams: 15, ratio: 16, temperatureC: 94, grind: 'medium', geometry: 'center spiral', cadence: '45s', agitation: 'low', guideSeconds: 180, steps: [{ timeSeconds: 0, waterTotal: 45, action: 'Bloom with a small spiral.' }, { timeSeconds: 45, waterTotal: 240, action: 'Pour a center spiral.' }] };
assert.equal(generateV60Recipe(buildExtractionIntent(alo, aloResearch), { dose: 15 }, { sourceInsights: { brewRecipes: [roasterRecipe] } }).technique, 'direct-roaster-v60');

// Other families keep their drawdown-based finish.
const hoffmann = generateV60RecipeForTechnique('hoffmann-small-pulses', {}, { dose: 15 });
assert.equal(hoffmann.guideTargetSeconds, 180);
assert.match(hoffmann.tips, /occasional drips/);

const option = getV60TechniqueOption('mameya-three-pour');
assert.equal(option.name, 'Koffee Mameya Three-Pour');
assert.equal(option.attribution.evidenceType, 'observed');
assert.ok(option.differences.some((line) => /not a published recipe/.test(line)));

console.log('v60 Mameya technique passed');
