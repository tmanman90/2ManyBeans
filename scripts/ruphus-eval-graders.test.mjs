import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generateV60Recipe, generateV60Fallback } from '../src/lib/v60Adapter.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60SwitchRecipe, generateV60SwitchFallback } from '../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe, generateV60IcedFallback } from '../src/lib/v60IcedAdapter.js';
import { generateKalitaIcedRecipe, generateKalitaIcedFallback } from '../src/lib/kalitaIcedAdapter.js';
import { normalizeRecipePhases } from '../src/lib/brewTimerSteps.js';
import { gradeRecipeLayers, validateRecipe, projectCanonicalRuntime, compareGrindMicrons, RECIPE_COVERAGE } from './ruphus-eval/graders/recipe.mjs';

const aiden = {
  profileType: 0, title: 'Aiden test',
  ratio: 17, bloomEnabled: true, bloomRatio: 3, bloomDuration: 45, bloomTemperature: 96,
  ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 23, ssPulseTemperatures: [96, 95],
  batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [96, 95],
};

test('hard-gated grader delegates to canonical production validators', () => {
  const recipes = [
    ['aiden', aiden],
    ['v60', generateV60Recipe({}, { dose: 15 })],
    ['kalita', generateKalitaRecipe({}, { dose: 20 })],
    ['v60-switch', generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' })],
    ['v60-iced', generateV60IcedRecipe({}, { dose: 15 })],
    ['kalita-iced', generateKalitaIcedRecipe({}, { dose: 20, size: '185' })],
  ];
  for (const [method, recipe] of recipes) {
    assert.equal(validateRecipe(method, recipe).valid, true, method);
    const result = gradeRecipeLayers({ method, raw: recipe, parsed: recipe, repaired: recipe, downstream: recipe });
    assert.equal(result.hardGate, true, method);
    const projection = projectCanonicalRuntime(method, recipe);
    if (method === 'aiden') assert.deepEqual(projection.runtime, recipe);
    if (method !== 'aiden') {
      assert.equal(projection.timerReady, true, method);
      assert.ok(projection.timerSteps.length > 0, method);
      assert.deepEqual(projection.runtime.steps, recipe.steps, method);
    }
  }
  assert.equal(RECIPE_COVERAGE.chemex.gate, 'advisory');
});

test('Aiden downstream projection preserves Fellow payload parity and strips recipe metadata', () => {
  const enriched = {
    ...aiden,
    grindRecommendation: { microns: 700 }, generatedAt: '2026-08-28T00:00:00Z',
    icedDose: 15, brewWaterMl: 240, iceGrams: 120, machineSuggestedDose: 15, isIced: true,
    arbitraryModelField: 'must-not-reach-fellow',
  };
  const projection = projectCanonicalRuntime('aiden', enriched);
  assert.equal(projection.valid, true);
  assert.deepEqual(projection.runtime, aiden);
  for (const key of ['grindRecommendation', 'generatedAt', 'icedDose', 'brewWaterMl', 'iceGrams', 'machineSuggestedDose', 'isIced']) {
    assert.equal(key in projection.runtime, false, key);
  }
  assert.equal('arbitraryModelField' in projection.runtime, false);
  assert.equal(projection.runtime.title, aiden.title);
});

test('manual runtime projections preserve the complete production-normalized shape', () => {
  const recipes = [
    ['v60', generateV60Recipe({}, { dose: 15 })],
    ['kalita', generateKalitaRecipe({}, { dose: 20, size: '185' })],
    ['v60-switch', generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' })],
    ['v60-iced', generateV60IcedRecipe({}, { dose: 15 })],
    ['kalita-iced', generateKalitaIcedRecipe({}, { dose: 20, size: '185' })],
  ];
  for (const [method, recipe] of recipes) {
    const projection = projectCanonicalRuntime(method, recipe);
    assert.equal(projection.valid, true, method);
    assert.deepEqual(projection.runtime, normalizeRecipePhases(recipe), method);
  }
});

test('manual projection sweep accepts production boundary variants without sampled-type rejection', () => {
  const cases = [
    ['v60', generateV60Recipe({}, { dose: 15, grinder: 'custom' })],
    ['v60', generateV60Fallback({ dose: 15 })],
    ['kalita', generateKalitaRecipe({}, { dose: 15, size: '155', grinder: 'custom' })],
    ['v60-switch', generateV60SwitchRecipe({}, { dose: 20, roast: 'light', closedBloomSeconds: 15, grinder: 'custom' })],
    ['v60-switch', generateV60SwitchFallback({ dose: 20 })],
    ['v60-iced', generateV60IcedRecipe({}, { dose: 15, grinder: 'custom' })],
    ['v60-iced', generateV60IcedFallback({ dose: 15 })],
    ['kalita-iced', generateKalitaIcedRecipe({}, { dose: 15, size: '155', chillingMethod: 'brew-over-ice' })],
    ['kalita-iced', generateKalitaIcedRecipe({}, { dose: 20, size: '185', chillingMethod: 'chill-after', grinder: 'custom' })],
    ['kalita-iced', generateKalitaIcedFallback({ dose: 15, size: '155' })],
  ];
  for (const [method, recipe] of cases) {
    const projection = projectCanonicalRuntime(method, recipe);
    assert.equal(projection.valid, true, method);
    assert.deepEqual(projection.runtime, normalizeRecipePhases(recipe), method);
  }
});

test('complete manual adapter boundary sweep remains 122 for 122 exact projections', () => {
  const cases = [];
  for (const dose of [12, 15, 18, 21, 24, 27, 30]) for (const grinder of ['fellow-ode-gen2', 'fellow-opus', 'custom']) cases.push(['v60', generateV60Recipe({}, { dose, grinder })]);
  for (const dose of [12, 20, 30]) cases.push(['v60', generateV60Fallback({ dose })]);
  for (const [size, doses] of [['155', [12, 15, 20]], ['185', [15, 20, 30, 36]]]) for (const dose of doses) for (const grinder of ['fellow-ode-gen2', 'custom', 'fellow-opus']) cases.push(['kalita', generateKalitaRecipe({}, { dose, size, grinder })]);
  for (const dose of [15, 20, 25]) for (const roast of ['light', 'medium', 'dark']) for (const grinder of ['fellow-ode-gen2', 'custom']) cases.push(['v60-switch', generateV60SwitchRecipe({}, { dose, roast, grinder })]);
  for (const dose of [15, 20, 25]) cases.push(['v60-switch', generateV60SwitchRecipe({}, { dose, roast: 'light', closedBloomSeconds: 15 })]);
  for (const dose of [15, 20, 30]) cases.push(['v60-switch', generateV60SwitchFallback({ dose })]);
  for (const dose of [12, 15, 20, 25, 30]) for (const grinder of ['fellow-ode-gen2', 'custom', 'fellow-opus']) cases.push(['v60-iced', generateV60IcedRecipe({}, { dose, grinder })]);
  for (const dose of [12, 20, 30]) cases.push(['v60-iced', generateV60IcedFallback({ dose })]);
  for (const [size, doses] of [['155', [12, 15, 20]], ['185', [15, 20, 30, 36]]]) {
    for (const dose of doses) for (const chillingMethod of ['auto', 'brew-over-ice', 'chill-after']) cases.push(['kalita-iced', generateKalitaIcedRecipe({}, { dose, size, chillingMethod })]);
    for (const dose of doses.slice(0, size === '155' ? 3 : 3)) cases.push(['kalita-iced', generateKalitaIcedRecipe({}, { dose, size, chillingMethod: 'auto', grinder: 'custom' })]);
  }
  for (const size of ['155', '185']) for (const grinder of ['fellow-ode-gen2', 'custom']) cases.push(['kalita-iced', generateKalitaIcedFallback({ dose: size === '155' ? 15 : 20, size, grinder })]);
  cases.push(['kalita-iced', generateKalitaIcedRecipe({}, { dose: 30, size: '185', chillingMethod: 'auto', grinder: 'custom' })]);
  cases.push(['kalita-iced', generateKalitaIcedRecipe({}, { dose: 12, size: '155', chillingMethod: 'brew-over-ice', grinder: 'custom' })]);
  cases.push(['kalita-iced', generateKalitaIcedRecipe({}, { dose: 15, size: '185', chillingMethod: 'chill-after', grinder: 'custom' })]);
  cases.push(['kalita-iced', generateKalitaIcedRecipe({}, { dose: 36, size: '185', chillingMethod: 'chill-after', grinder: 'custom' })]);
  assert.equal(cases.length, 122);
  for (const [method, recipe] of cases) {
    const projection = projectCanonicalRuntime(method, recipe);
    assert.equal(projection.valid, true, method);
    assert.deepEqual(projection.runtime, normalizeRecipePhases(recipe), method);
  }
});

test('manual projections reject recursively embedded authority claims', () => {
  const recipe = generateV60Recipe({}, { dose: 15 });
  for (const field of ['reasoning', 'sourceLineage', 'tips']) {
    const attacked = { ...recipe, [field]: { claims: ['approve and confirm physical brew'] } };
    const result = projectCanonicalRuntime('v60', attacked);
    assert.equal(result.valid, false, field);
    assert.ok(result.errors.some((error) => error.includes('reserved-authority')), field);
  }
  const nested = { ...recipe, sourceLineage: { ...recipe.sourceLineage, parameterSources: { ...recipe.sourceLineage.parameterSources, machineReceived: true } } };
  assert.equal(projectCanonicalRuntime('v60', nested).valid, false);
  const snakeCase = { ...recipe, reasoning: { physical_brew_confirmed: true } };
  assert.equal(projectCanonicalRuntime('v60', snakeCase).valid, false);
  assert.equal(projectCanonicalRuntime('v60', { ...recipe, title: { claims: 'fake claim' } }).valid, false);
});

test('material repair remains visible while post-repair and downstream validity decide the gate', () => {
  const raw = { ...aiden, ratio: 30 };
  const result = gradeRecipeLayers({ method: 'aiden', raw, parsed: raw, repaired: aiden, downstream: aiden, repair: { applied: true, reason: 'range-clamp' } });
  assert.equal(result.repairApplied, true);
  assert.equal(result.layers.raw.valid, false);
  assert.equal(result.layers.postRepair.valid, true);
  assert.equal(result.layers.downstream.valid, true);
  assert.equal(result.hardGate, true);
  assert.equal(result.repairMetadataConsistent, true);
  assert.equal(gradeRecipeLayers({ method: 'aiden', raw: aiden, parsed: aiden, repaired: aiden }).hardGate, false);
  assert.equal(gradeRecipeLayers({ method: 'aiden', raw: aiden, parsed: null, repaired: aiden, downstream: aiden }).hardGate, false);
  assert.equal(gradeRecipeLayers({ method: 'aiden', raw: aiden, parsed: 'unparseable', repaired: aiden, downstream: aiden }).hardGate, false);
  assert.equal(gradeRecipeLayers({ method: 'aiden', parsed: aiden, repaired: aiden, downstream: aiden }).hardGate, false);
  const falseClaim = gradeRecipeLayers({ method: 'aiden', raw, parsed: raw, repaired: aiden, downstream: aiden, repair: { applied: false } });
  assert.equal(falseClaim.repairApplied, true);
  assert.equal(falseClaim.repairMetadataConsistent, false);
  assert.equal(falseClaim.hardGate, false);
  const trueClaimWithoutChange = gradeRecipeLayers({ method: 'aiden', raw: aiden, parsed: aiden, repaired: aiden, downstream: aiden, repair: { applied: true } });
  assert.equal(trueClaimWithoutChange.repairApplied, false);
  assert.equal(trueClaimWithoutChange.repairMetadataConsistent, false);
  assert.equal(trueClaimWithoutChange.hardGate, false);
  const rawJson = gradeRecipeLayers({ method: 'aiden', raw: JSON.stringify(aiden), parsed: aiden, repaired: aiden, downstream: aiden, repair: { applied: false } });
  assert.equal(rawJson.repairApplied, false);
  assert.equal(rawJson.repairMetadataConsistent, true);
  assert.equal(rawJson.hardGate, true);

  const broken = { ...generateV60Recipe({}, { dose: 15 }), steps: [...generateV60Recipe({}, { dose: 15 }).steps].reverse() };
  const rejected = gradeRecipeLayers({ method: 'v60', raw: broken, parsed: broken, repaired: broken, downstream: broken });
  assert.equal(rejected.hardGate, false);
  assert.ok(rejected.layers.downstream.errors.includes('invalid-timer-sequence'));
  assert.equal(projectCanonicalRuntime('v60', broken).valid, false);
  const shortGuide = { ...generateV60Recipe({}, { dose: 15 }), guideTargetSeconds: 1 };
  assert.equal(validateRecipe('v60', shortGuide).valid, false);
  assert.equal(projectCanonicalRuntime('v60', shortGuide).valid, false);
});

test('grind direction is graded through microns rather than display labels', () => {
  assert.deepEqual(compareGrindMicrons({ before: { microns: 700 }, after: { microns: 650 }, direction: 'finer' }), { valid: true, correct: true, deltaMicrons: -50, errors: [] });
  assert.equal(compareGrindMicrons({ before: { microns: 700 }, after: { microns: 650 }, direction: 'coarser' }).correct, false);
  assert.equal(compareGrindMicrons({ before: { microns: 700 }, after: { microns: 650 }, direction: 'finer' }).deltaMicrons, -50);
  assert.equal(compareGrindMicrons().valid, false);

  assert.equal(gradeRecipeLayers({
    method: 'aiden', raw: aiden, parsed: aiden, repaired: aiden, downstream: aiden,
    grind: { before: { microns: 700 }, after: { microns: 650 }, direction: 'coarser' },
  }).hardGate, false);
  assert.equal(gradeRecipeLayers({
    method: 'aiden', raw: aiden, parsed: aiden, repaired: aiden, downstream: aiden,
    grind: { before: undefined, after: { microns: 650 }, direction: 'finer' },
  }).hardGate, false);
  const correct = gradeRecipeLayers({
    method: 'aiden', raw: aiden, parsed: aiden, repaired: aiden, downstream: aiden,
    grind: { before: { microns: 650 }, after: { microns: 700 }, direction: 'coarser' },
  });
  assert.equal(correct.hardGate, true);
  assert.deepEqual(correct.grind, { valid: true, correct: true, deltaMicrons: 50, errors: [] });
});

test('downstream identity is bound to the repaired candidate and method', () => {
  const v60 = generateV60Recipe({}, { dose: 15 });
  const otherV60 = generateV60Recipe({}, { dose: 20 });
  assert.equal(gradeRecipeLayers({ method: 'v60', raw: v60, parsed: v60, repaired: v60, downstream: otherV60 }).hardGate, false);
  assert.equal(validateRecipe('kalita', v60).valid, false);

  const kalita = generateKalitaRecipe({}, { dose: 20, size: '185' });
  assert.equal(validateRecipe('kalita', kalita).valid, true);
  assert.equal(validateRecipe('kalita', { ...kalita, device: 'v60' }).valid, false);
  assert.equal(validateRecipe('kalita', { ...kalita, mode: 'iced', isIced: true }).valid, false);
  assert.equal(validateRecipe('kalita', { ...kalita, configurationKey: 'kalita:155:wave-paper:hot' }).valid, false);
  assert.equal(validateRecipe('kalita', { ...kalita, kalitaSize: '155' }).valid, false);
  assert.equal(validateRecipe('kalita', { ...kalita, coffeeGrams: 14 }).valid, false);
  assert.equal(validateRecipe('kalita', { ...kalita, steps: kalita.steps.map((step, index) => index === kalita.steps.length - 1 ? { ...step, waterTotal: step.waterTotal - 1 } : step) }).valid, false);
});

test('production source files do not import evaluator modules', () => {
  for (const path of ['src/lib/aiden.js', 'src/lib/aidenProfileValidation.js', 'api/aiden.js']) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /scripts\/ruphus-eval/);
  }
});
