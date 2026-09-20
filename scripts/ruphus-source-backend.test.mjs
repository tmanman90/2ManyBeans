import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateManualSourceTechniqueOption, listManualSourceTechniqueOptions } from '../src/lib/ruphus/techniqueOptions.js';
import { canonicalHash, validateManualSourceRecipeSnapshot, validateRecipeSnapshot } from '../src/lib/ruphus/contracts.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { resolveRequestedRecipe, validateExecutableRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { isOdeStep } from '../src/lib/brewMethods.js';

const sourceRecipe = () => generateManualSourceTechniqueOption(
  'hario-switch-03-matt-winton-hybrid-24-2022',
  {},
  { dose: 24 },
).recipe;

test('explicit classic V60 binding overrides a previous Switch technique during discovery', async () => {
  const recipe = sourceRecipe();
  const context = {
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['v60_hot'] }], refs: { c1: 'coffee-1' } },
    userText: 'Give me a different hot V60 technique for jar 1 at 20 grams.', sessionId: 'classic-after-switch',
    methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot V60', source: 'M1' },
    __ruphusPriorProposals: [{ coffeeId: 'coffee-1', slotKey: 'v60_hot', after: recipe, techniqueExperiment: { kind: 'manual_source_technique' } }],
    proposalState: { target: null, proposalIssued: false },
  };
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: { readRecipe: async () => recipe } });
  const result = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' });
  assert.equal(result.ok, true);
  assert.ok(result.options.length);
  assert.ok(result.options.every(option => !String(option.sourceId || option.id).includes('switch')));
  assert.equal(result.preparingNewConfiguration, true);
});

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

test('source option selection preserves the requested Kalita serving instead of promoting it', () => {
  const options = listManualSourceTechniqueOptions({
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 14,
    currentSourceId: 'kurasu-wave-155-2023',
  }, { includeReferenceOnly: true });
  assert.ok(options.length >= 1);
  assert.equal(options.filter((option) => option.sourceId === 'fuglen-wave-155').length, 0);
  const executable = options.filter((option) => option.executable === true);
  assert.ok(executable.length >= 1);
  assert.ok(executable.every((option) => option.targetDoseGrams === 14));
  const source = generateManualSourceTechniqueOption(executable[0].sourceId, {}, { ...executable[0].sourceConfiguration, dose: executable[0].targetDoseGrams }).recipe;
  assert.equal(source.coffeeGrams, 14);
  assert.equal(source.sourceProjection.adaptation.timingPolicy, 'ruphus-manual-source-checkpoint-v2');
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
  assert.equal(proposal.artifact.after.sourceProjection.adaptation.timingPolicy, 'ruphus-manual-source-checkpoint-v2');
});

test('source dose guides preserve pour duration, size boundaries and conservative Switch loads', () => {
  const id = 'art-of-brew-wave-155-pulse-2024';
  const original = generateManualSourceTechniqueOption(id).recipe;
  const scaled = createRecipePreview({ recipe: original, dose: 20 });
  assert.equal(scaled.coffeeGrams, 20);
  assert.equal(scaled.waterGrams, 320);
  assert.deepEqual(scaled.sourceProjection.sourceExecution.stages.map(stage => stage.durationSeconds ?? null), original.sourceProjection.sourceExecution.stages.map(stage => stage.durationSeconds ?? null));
  assert.throws(() => createRecipePreview({ recipe: original, dose: 20.1 }), /unsupported-dose|supports an app dose/);
  assert.throws(() => createRecipePreview({ recipe: original, dose: 11.9 }), /unsupported-dose|supports an app dose/);
  const immersion = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023').recipe;
  assert.equal(immersion.coffeeGrams, 36);
  assert.equal(immersion.waterMilliliters, 440);
  assert.equal(createRecipePreview({ recipe: immersion, dose: 20 }).waterMilliliters, 244.44);
  assert.throws(() => createRecipePreview({ recipe: immersion, dose: 36.1 }), /unsupported-dose|supports an app dose/);
  const unsupported = listManualSourceTechniqueOptions({ device: 'kalita', size: '155', mode: 'hot', dose: 21 }, { includeReferenceOnly: true });
  assert.ok(unsupported.length > 0);
  assert.ok(unsupported.every(option => !option.executable && option.referenceOnly));
});

test('source grind keeps its technique baseline, applies the existing bean delta, then quantizes', () => {
  const intent = {
    grindAdjustmentMicrons: -20,
    finesRisk: 'unknown',
    solubilityRisk: 'unknown',
    evidenceHash: 'trusted-evidence-high-density',
    reasonCodes: ['HIGH_DENSITY_TEST'],
  };
  const configuration = {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 25,
    grinder: 'fellow-ode-gen2',
  };
  const originalProjectionHash = canonicalHash(generateManualSourceTechniqueOption('onyx-monarch-wave-185', {}, configuration).recipe.sourceProjection);
  const option = generateManualSourceTechniqueOption('onyx-monarch-wave-185', intent, configuration);
  const recipe = option.recipe;

  assert.equal(recipe.sourceProjection.grind.microns, 600);
  assert.equal(canonicalHash(recipe.sourceProjection), originalProjectionHash);
  assert.equal(recipe.sourceLineage.grindAdaptation.baselineMicrons, 600);
  assert.equal(recipe.sourceLineage.grindAdaptation.adjustmentMicrons, -20);
  assert.equal(recipe.sourceLineage.grindAdaptation.targetMicrons, 580);
  assert.equal(recipe.sourceLineage.grindAdaptation.evidenceHash, 'trusted-evidence-high-density');
  assert.ok(isOdeStep(recipe.grindSize.setting));
  assert.notEqual(recipe.sourceLineage.grindAdaptation.baselineMicrons, 735);

  const unknown = generateManualSourceTechniqueOption('onyx-monarch-wave-185', intent, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 25,
    grinder: 'unknown-grinder',
  }).recipe;
  assert.equal(unknown.grindSize.setting, null);
  assert.equal(unknown.grindSize.grinderSpecific, false);
  assert.doesNotMatch(unknown.grindSize.description, /Ode/i);
});

test('qualitative source grind does not invent calibration when the existing method estimate conflicts', () => {
  const configuration = {
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 13,
    grinder: 'fellow-ode-gen2',
  };
  const originalProjectionHash = canonicalHash(generateManualSourceTechniqueOption('kurasu-wave-155-2023', {}, configuration).recipe.sourceProjection);
  const recipe = generateManualSourceTechniqueOption('kurasu-wave-155-2023', {
    grindAdjustmentMicrons: -20,
    evidenceHash: 'trusted-evidence',
  }, configuration).recipe;

  assert.equal(canonicalHash(recipe.sourceProjection), originalProjectionHash);
  assert.equal(recipe.sourceProjection.grind.description, 'Coarse');
  assert.equal(recipe.grindSize, undefined);
  assert.equal(recipe.sourceLineage.grindAdaptation, undefined);
});

test('server source preparation builds trusted extraction intent instead of using an empty intent', async () => {
  const current = generateManualSourceTechniqueOption('onyx-eu-la-soledad-sidra-wave-185', {}, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 25,
  }).recipe;
  const bean = {
    id: 'coffee-1', name: 'Dense washed coffee', process: 'washed', roastLevel: 'light', roastDate: '2026-09-10',
    beanResearch: { densityEstimate: 'high', cupStructureFamily: 'washed-floral-clarity' },
  };
  const context = {
    userText: 'Show me another hot Kalita 185 technique.', sessionId: 'trusted-source-intent', conversation: [],
    __ruphusSourceFormatCapability: true,
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: bean.name, process: bean.process, roastLevel: bean.roastLevel, recipes: ['kalita_hot'] }], setup: { grinder: 'fellow-ode-gen2' } },
    proposalState: { target: null, proposalIssued: false },
    methodBinding: { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita 185', source: 'equipment-answer' },
  };
  const tools = createRuphusTools({
    uid: 'owner', context,
    readers: { readCoffee: async () => bean, readRecipe: async () => current },
  });
  const options = await tools.call('read_technique_options', { coffeeRef: 'coffee', slot: 'kalita_hot', intent: 'recipe_preview' });
  const selected = options.options.find((option) => option.sourceId === 'onyx-monarch-wave-185');
  assert.ok(selected);
  const result = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'kalita_hot', intent: 'recipe_preview', change: null, servingDoseGrams: 25,
    aidenProfile: null, experiment: { kind: 'manual_source_technique', sourceId: selected.sourceId }, explanation: null,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifact.after.sourceLineage.grindAdaptation.adjustmentMicrons, -20);
  assert.ok(result.artifact.after.sourceLineage.grindAdaptation.evidenceHash);
  assert.ok(isOdeStep(result.artifact.after.grindSize.setting));
  assert.deepEqual(result.artifact.after.sourceProjection.sourceSnapshot.grind, { description: null, microns: 600, native: null });
});

console.log('Ruphus source backend contract passed');
