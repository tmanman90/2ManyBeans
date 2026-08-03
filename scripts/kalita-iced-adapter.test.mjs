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

console.log('kalita iced adapter passed');
