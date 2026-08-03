import assert from 'node:assert/strict';
import {
  generateKalitaIcedFallback,
  generateKalitaIcedRecipe,
  selectKalitaIcedTechnique,
  validateKalitaIcedCandidate,
} from '../src/lib/kalitaIcedAdapter.js';

const exactKurasu = generateKalitaIcedRecipe({}, { size: '155', dose: 16, grinder: 'fellow-ode-gen2' });
assert.equal(exactKurasu.sourceLineage.status, 'original');
assert.equal(exactKurasu.hotWaterGrams, 150);
assert.equal(exactKurasu.recipeIceGrams, 140);
assert.equal(exactKurasu.initialBrewIceGrams, null);
assert.equal(exactKurasu.postBrewIceGrams, 140);
assert.equal(exactKurasu.finalBeverageWaterTargetGrams, null);
assert.equal(exactKurasu.finalBeverageRatio, null);
assert.deepEqual(exactKurasu.steps.map((step) => [step.timeSeconds, step.waterTotal]), [[0, 50], [30, 100], [60, 150]]);
assert.deepEqual(exactKurasu.guideRangeSeconds, [97, 100]);
assert.equal(exactKurasu.waterTemp.celsius, 90);
assert.equal(exactKurasu.grindSize.setting, '8.2');
assert.equal(exactKurasu.grindSize.description, 'Medium-Coarse');

const scaled155 = generateKalitaIcedRecipe({}, { size: '155', dose: 20, grinder: 'fellow-ode-gen2' });
assert.equal(scaled155.technique, 'kurasu-center-circles-ice-after');
assert.equal(scaled155.hotWaterGrams, 188);
assert.equal(scaled155.recipeIceGrams, 175);
assert.equal(scaled155.icedModeLabel, 'Iced Pour Over');

const clarity155 = generateKalitaIcedRecipe(
  { cupDirection: { clarity: 'high', body: 'balanced', sweetness: 'high' } },
  { size: '155', dose: 20, grinder: 'fellow-ode-gen2' },
);
assert.equal(clarity155.technique, 'kurasu-center-circles-ice-after');
assert.equal(clarity155.chillingMethod, 'chill-after');
assert.equal(clarity155.recommendedChillingMethod, 'chill-after');
assert.equal(clarity155.chillingMethodOverrideApplied, false);
assert.equal(clarity155.personalizationApplied, false);

const clarityChillAfter = generateKalitaIcedRecipe(
  { cupDirection: { clarity: 'high', body: 'balanced', sweetness: 'high' } },
  { size: '155', dose: 16, grinder: 'fellow-ode-gen2', chillingMethod: 'chill-after' },
);
assert.equal(clarityChillAfter.technique, 'kurasu-center-circles-ice-after');
assert.equal(clarityChillAfter.chillingMethod, 'chill-after');
assert.equal(clarityChillAfter.recommendedChillingMethod, 'chill-after');
assert.equal(clarityChillAfter.chillingMethodOverrideApplied, false);

const direct155 = generateKalitaIcedRecipe(
  { cupDirection: { clarity: 'high', body: 'balanced', sweetness: 'high' } },
  { size: '155', dose: 20, grinder: 'fellow-ode-gen2', chillingMethod: 'brew-over-ice' },
);
assert.equal(direct155.technique, 'wave-155-center-circles-direct');
assert.equal(direct155.chillingMethod, 'brew-over-ice');
assert.equal(direct155.recommendedChillingMethod, 'chill-after');
assert.equal(direct155.chillingMethodOverrideApplied, true);
assert.equal(direct155.hotWaterGrams, 180);
assert.equal(direct155.recipeIceGrams, 80);
assert.equal(direct155.initialBrewIceGrams, 80);
assert.equal(direct155.postBrewIceGrams, null);
assert.equal(direct155.finalBeverageWaterTargetGrams, 260);
assert.equal(direct155.finalBeverageRatio, '1:13');
assert.deepEqual(direct155.steps.map((step) => [step.timeSeconds, step.waterTotal]), [[0, 30], [30, 100], [60, 180]]);
assert.deepEqual(direct155.guideRangeSeconds, [120, 180]);
assert.match(direct155.postBrewSteps[0].action, /figure-eight/i);
assert.equal(direct155.waterTemp.celsius, 94);

const bodyBrewOverIce = generateKalitaIcedRecipe(
  { cupDirection: { clarity: 'balanced', body: 'supported', sweetness: 'high' } },
  { size: '155', dose: 15, grinder: 'fellow-ode-gen2', chillingMethod: 'brew-over-ice' },
);
assert.equal(bodyBrewOverIce.technique, 'wave-155-center-circles-direct');
assert.equal(bodyBrewOverIce.recommendedChillingMethod, 'chill-after');
assert.equal(bodyBrewOverIce.chillingMethodOverrideApplied, true);
assert.match(bodyBrewOverIce.postBrewSteps[0].action, /figure-eight/i);

const bodyAuto155 = generateKalitaIcedRecipe(
  { cupDirection: { clarity: 'balanced', body: 'supported', sweetness: 'high' } },
  { size: '155', dose: 15, grinder: 'fellow-ode-gen2' },
);
assert.equal(bodyAuto155.technique, 'kurasu-center-circles-ice-after');
assert.equal(bodyAuto155.personalizationApplied, false);

const body185ChillAfter = generateKalitaIcedRecipe(
  { cupDirection: { clarity: 'balanced', body: 'supported', sweetness: 'high' } },
  { size: '185', dose: 20, grinder: 'fellow-ode-gen2', chillingMethod: 'chill-after' },
);
assert.equal(body185ChillAfter.technique, 'kurasu-center-circles-ice-after');
assert.equal(body185ChillAfter.chillingMethod, 'chill-after');

const standard185 = generateKalitaIcedRecipe({}, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });
assert.equal(standard185.technique, 'wave-185-controlled-circles-direct');
assert.equal(standard185.initialBrewIceGrams, 160);
assert.equal(standard185.postBrewIceGrams, null);
assert.equal(standard185.finalBeverageWaterTargetGrams, null);
assert.equal(standard185.finalBeverageRatio, null);
assert.equal(standard185.requiresCompleteMelt, false);
assert.match(standard185.postBrewSteps[0].action, /complete melt is not assumed/i);
assert.equal(standard185.icedModeLabel, 'Iced Flash Brew');

const large185 = generateKalitaIcedRecipe({}, { size: '185', dose: 33, grinder: 'comandante-c40' });
assert.equal(large185.technique, 'wave-185-large-spiral-direct');
assert.deepEqual(large185.steps.map((step) => step.timeSeconds), [0, 40, 55, 70]);
assert.equal(large185.grindSize.description, 'Medium-Fine');

const guarded = generateKalitaIcedRecipe({ finesRisk: 'high', reasonCodes: ['EXPLICIT_FLOW_RISK_GUARD'] }, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });
assert.equal(guarded.personalizationApplied, true);
assert.match(guarded.steps[1].action, /tight controlled circles near the center/i);
assert.ok(guarded.grindSize.microns > standard185.grindSize.microns);

const flavorOnlyA = generateKalitaIcedRecipe({ family: 'washed-floral-clarity', reasonCodes: ['FLORAL'] }, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });
const flavorOnlyB = generateKalitaIcedRecipe({ family: 'body-natural', softPriors: { process: 'fruit-processed' }, reasonCodes: ['NATURAL'] }, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });
assert.deepEqual(
  { technique: flavorOnlyA.technique, grind: flavorOnlyA.grindSize, temperature: flavorOnlyA.waterTemp, water: flavorOnlyA.hotWaterGrams, ice: flavorOnlyA.recipeIceGrams },
  { technique: flavorOnlyB.technique, grind: flavorOnlyB.grindSize, temperature: flavorOnlyB.waterTemp, water: flavorOnlyB.hotWaterGrams, ice: flavorOnlyB.recipeIceGrams },
);

assert.equal(selectKalitaIcedTechnique({}, { size: '185', dose: 31 }).id, 'wave-185-large-spiral-direct');
assert.equal(validateKalitaIcedCandidate({ ...standard185, sourceLineage: { ...standard185.sourceLineage, parameterSources: { ...standard185.sourceLineage.parameterSources, grind: 'reddit' } } }).valid, false);
assert.throws(() => generateKalitaIcedRecipe({}, { size: '155', dose: 21 }), /between 12g and 20g/);
assert.throws(() => generateKalitaIcedRecipe({}, { size: '185', dose: 14 }), /between 15g and 36g/);
assert.equal(generateKalitaIcedFallback({ size: '185', dose: 20 }).fallback, true);
assert.equal(generateKalitaIcedFallback({ size: '155', dose: 20, chillingMethod: 'brew-over-ice' }).chillingMethod, 'brew-over-ice');

console.log('kalita iced adapter passed');
