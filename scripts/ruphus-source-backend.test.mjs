import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateManualSourceTechniqueOption, listManualSourceTechniqueOptions } from '../src/lib/ruphus/techniqueOptions.js';
import { validateManualSourceRecipeSnapshot, validateRecipeSnapshot } from '../src/lib/ruphus/contracts.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { resolveRequestedRecipe, validateExecutableRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';

const sourceRecipe = () => generateManualSourceTechniqueOption(
  'hario-switch-03-matt-winton-hybrid-24-2022',
  {},
  { dose: 24 },
).recipe;

test('source runtime keeps exact Switch identity, native units, valves, and summary', async () => {
  const recipe = sourceRecipe();
  const context = {
    rotationSnapshot: {
      coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['v60_hot'] }],
      refs: { c1: 'coffee-1' },
    },
    __ruphusRefs: { c1: 'coffee-1' },
    userText: 'Show me a different Switch 03 technique for Jar #1.',
    sessionId: 'source-runtime',
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  const tools = createRuphusTools({
    uid: 'owner-1',
    context,
    readers: { readRecipe: async () => recipe },
  });

  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(options.ok, true);
  assert.equal(options.sourceOptions, true);
  assert.equal(options.current.currentSourceId, 'hario-switch-03-matt-winton-hybrid-24-2022');
  assert.deepEqual(options.options.map((option) => option.sourceId), ['hario-switch-03-instruction-manual-36-2023']);
  assert.equal(options.options[0].sourceConfiguration.size, '03');
  assert.equal(options.options[0].executable, true);

  const read = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.match(read.summary, /360mL water/);
  assert.doesNotMatch(read.summary, /360g water/);

  const proposal = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: 'v60_hot',
    change: null,
    experiment: { kind: 'manual_source_technique', sourceId: options.options[0].sourceId },
  });
  assert.equal(proposal.ok, true, proposal.code);
  const after = proposal.artifact.after;
  assert.equal(after.sourceProjection.sourceId, 'hario-switch-03-instruction-manual-36-2023');
  assert.equal(after.sourceProjection.equipment.size, '03');
  assert.equal(after.coffeeGrams, 24);
  assert.equal(after.waterMilliliters, 293.33);
  assert.equal(Object.hasOwn(after, 'waterGrams'), false);
  assert.equal(Object.hasOwn(after, 'ratio'), false);
  assert.deepEqual(after.stages.map((stage) => stage.valve), ['closed', 'closed', 'open', 'open']);
  assert.equal(validateManualSourceRecipeSnapshot(after).valid, true);
});

test('legacy resolver dispatches versioned source envelopes without old adapter validation', () => {
  const recipe = sourceRecipe();
  const result = resolveRequestedRecipe({
    handBrewRecipes: { v60: recipe },
  }, { slotKey: 'v60_hot', method: 'v60', mode: 'hot', v60Variant: 'switch' });
  assert.equal(result.ok, true, result.code);
  assert.equal(result.validation.valid, true);
  assert.equal(result.recipe.sourceProjection.projectionVersion, 'ruphus-manual-source-projection-v1');
  assert.equal(result.recipe.waterMilliliters, 360);
});

test('unsupported source projection versions fail closed before legacy heuristics', () => {
  const recipe = sourceRecipe();
  const malformed = structuredClone(recipe);
  malformed.sourceProjection.projectionVersion = 'future-source-version';
  assert.equal(validateRecipeSnapshot(malformed).valid, false);
  assert.equal(validateExecutableRecipe(malformed, 'v60_hot').valid, false);
  assert.throws(() => createRecipePreview({ recipe: malformed, dose: 24 }), (error) => error.code === 'invalid-source-projection-version');
});

test('source option selection promotes a sub-20 Kalita base to the explicit 20g app guide', () => {
  const options = listManualSourceTechniqueOptions({
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 14,
    currentSourceId: 'kurasu-wave-155-2023',
  }, { includeReferenceOnly: true });
  assert.ok(options.length >= 1);
  assert.equal(options.filter((option) => option.sourceId === 'fuglen-wave-155').length, 0);
  const executable = options.filter((option) => option.executable === true);
  assert.ok(executable.length >= 1);
  assert.ok(executable.every((option) => option.targetDoseGrams === 20));
  const source = generateManualSourceTechniqueOption(executable[0].sourceId, {}, { ...executable[0].sourceConfiguration, dose: executable[0].targetDoseGrams }).recipe;
  assert.equal(source.coffeeGrams, 20);
  assert.equal(source.sourceProjection.adaptation.timingPolicy, 'ruphus-manual-source-checkpoint-v1');
  assert.equal(validateManualSourceRecipeSnapshot(source).valid, true);
});

test('ordinary source dose proposals dispatch through the native source preview', async () => {
  const recipe = sourceRecipe();
  const context = {
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['v60_hot'] }], refs: { c1: 'coffee-1' } },
    __ruphusRefs: { c1: 'coffee-1' },
    userText: 'Change the dose to 20g.',
    sessionId: 'source-dose-runtime',
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: { readRecipe: async () => recipe } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  const proposal = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: 'v60_hot',
    change: { control: 'dose', value: 20 },
    experiment: null,
  });
  assert.equal(proposal.ok, true, proposal.code);
  assert.equal(proposal.artifact.after.coffeeGrams, 20);
  assert.equal(proposal.artifact.after.waterMilliliters, 300);
  assert.equal(Object.hasOwn(proposal.artifact.after, 'waterGrams'), false);
  assert.equal(proposal.artifact.after.sourceProjection.adaptation.timingPolicy, 'ruphus-manual-source-checkpoint-v1');
});

console.log('Ruphus source backend contract passed');
