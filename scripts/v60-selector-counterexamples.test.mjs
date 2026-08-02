import assert from 'node:assert/strict';
import { buildExtractionIntent } from '../src/lib/extractionIntent.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { validateV60Candidate } from '../src/lib/v60Adapter.js';
import { validateV60IcedCandidate } from '../src/lib/v60IcedAdapter.js';

assert.equal(generateV60Recipe({ finesRisk: 'high' }, { dose: 30 }).technique, 'hoffmann-large-batch');
const plainNatural = buildExtractionIntent({ process: 'natural', roastLevel: 'light' }, { cupStructureFamily: 'clean-natural-fruit' });
const guidedNatural = buildExtractionIntent({ process: 'natural', roastLevel: 'light', brewingRec: 'Use three restrained pulses.' }, { cupStructureFamily: 'clean-natural-fruit' });
assert.notEqual(plainNatural.techniquePreference, 'bloom-led-pulse');
assert.equal(guidedNatural.techniquePreference, 'bloom-led-pulse');
assert.equal(buildExtractionIntent({ process: 'washed', roastLevel: 'light' }, { cupStructureFamily: 'washed-floral-clarity' }).finesRisk, 'unknown');
const developedIced = generateV60IcedRecipe({ softPriors: { roast: 'developed' } }, { dose: 18 });
const finesIced = generateV60IcedRecipe({ finesRisk: 'high' }, { dose: 18 });
assert.equal(developedIced.technique, 'kurasu-staged-flash');
assert.equal(finesIced.technique, 'kurasu-staged-flash');
const invalidSource = generateV60Recipe({}, { dose: 15 });
invalidSource.sourceLineage.parameterSources.ratio = 'reddit';
assert.equal(validateV60Candidate(invalidSource).valid, false);
const partners = generateV60IcedRecipe({}, { dose: 20 });
assert.deepEqual(partners.steps.map((step) => [step.timeSeconds, step.waterTotal]), [[0, 60], [40, 120], [80, 200]]);
assert.match(partners.postBrewSteps[0].action, /carafe swirl/i);
const exactStructured = generateV60Recipe({}, { dose: 15 }, {
  sourceInsights: { brewRecipes: [{ id: 'hoffmann-one-cup-v1', mode: 'hot', device: 'v60', configuration: 'V60 02', status: 'original', author: 'James Hoffmann', canonicalUrl: 'https://www.youtube.com/watch?v=1oB1oDrDkHM', doseGrams: 15, ratio: 16.67, temperatureC: 100, grind: 'medium-fine', geometry: 'center cadence', cadence: '45s then finish', agitation: 'gentle swirl', guideSeconds: 210, steps: [{ timeSeconds: 0, waterTotal: 45, action: 'Bloom in the center.' }, { timeSeconds: 45, waterTotal: 250, action: 'Pour a controlled center spiral to finish.' }] }] },
});
assert.equal(exactStructured.technique, 'direct-roaster-v60');
assert.deepEqual(exactStructured.steps.map((step) => [step.timeSeconds, step.waterTotal]), [[0, 45], [45, 250]]);
const wrongDoseStructured = generateV60Recipe({}, { dose: 16 }, {
  sourceInsights: { brewRecipes: [{ id: 'hoffmann-one-cup-v1', mode: 'hot', device: 'v60', configuration: 'V60 02', status: 'original', author: 'James Hoffmann', canonicalUrl: 'https://www.youtube.com/watch?v=1oB1oDrDkHM', doseGrams: 15, ratio: 16.67, temperatureC: 100, geometry: 'center', cadence: '45s', agitation: 'swirl', guideSeconds: 210, steps: [{ timeSeconds: 0, waterTotal: 45, action: 'Bloom in the center.' }, { timeSeconds: 45, waterTotal: 250, action: 'Pour center to finish.' }] }] },
});
assert.notEqual(wrongDoseStructured.technique, 'direct-roaster-v60');
const partialStructured = generateV60Recipe({}, { dose: 15 }, {
  sourceInsights: { brewRecipes: [{ id: 'reddit-partial', mode: 'hot', device: 'v60', configuration: 'V60 02', status: 'original', author: 'Community', canonicalUrl: 'https://www.reddit.com/r/pourover', doseGrams: 15, ratio: 16, temperatureC: null, grind: '', geometry: 'vague', cadence: '', agitation: '', guideSeconds: null }] },
});
assert.notEqual(partialStructured.technique, 'direct-roaster-v60');
assert.equal(partialStructured.sourceLineage.status, 'adapted');
const exactIcedStructured = generateV60IcedRecipe({ sourceRecipes: [{ id: 'roaster-iced', mode: 'iced', device: 'v60', configuration: 'V60 02', status: 'original', author: 'Roaster', canonicalUrl: 'https://roaster.example/iced', doseGrams: 16, ratio: 14, temperatureC: 96, hotWaterGrams: 150, iceGrams: 74, finalWaterGrams: 224, guideSeconds: 130, steps: [{ timeSeconds: 0, waterTotal: 45, action: 'Bloom in a centered path.' }, { timeSeconds: 45, waterTotal: 150, action: 'Finish with a low center pulse.' }], geometry: 'center path', cadence: '45s', agitation: 'low' }] }, { dose: 16 });
assert.equal(exactIcedStructured.technique, 'direct-roaster-iced-v60');
assert.deepEqual(exactIcedStructured.steps.map((step) => [step.timeSeconds, step.waterTotal]), [[0, 45], [45, 150]]);
assert.equal(exactIcedStructured.sourceLineage.status, 'original');
exactIcedStructured.sourceLineage.parameterSources.ratio = 'reddit';
assert.equal(validateV60IcedCandidate(exactIcedStructured).valid, false);
console.log('V60 selector/source counterexamples passed');
