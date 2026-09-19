import assert from 'node:assert/strict';
import test from 'node:test';

import { firestoreReaders } from '../api/ruphus-agent.js';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { readCoffeeEvidence } from '../api/_lib/ruphusEvidence.js';
import { absentRecipeSourceHash, recipeSourceHash } from '../src/lib/ruphus/recipeSourceState.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateKalitaIcedRecipe } from '../src/lib/kalitaIcedAdapter.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';

const uid = 'capability-baseline-owner';

function fakeFirestore({ bean, revisions = new Map() }) {
  const docs = new Map([
    [`users/${uid}/beans/coffee-1`, bean],
    ...[...revisions].map(([id, value]) => [`users/${uid}/recipeRevisions/${id}`, value]),
  ]);
  const ref = (path) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
  });
  return { collection: (name) => ref(name) };
}

function absentIcedHarness() {
  const context = {
    userText: 'Make me an iced V60 recipe for this coffee.',
    sessionId: 'capability-iced-first',
    conversation: [],
    rotationSnapshot: {
      refs: { coffee: 'coffee-1' },
      coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }],
      setup: { grinder: 'fellow-ode-gen2' },
    },
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { id: 'coffee-1', ownerId: uid, name: 'Jar one' });
  const tools = createRuphusTools({
    uid,
    context,
    readers: { readRecipe: async () => ({ code: 'recipe_missing' }) },
    proposalStore: (input) => repository.createProposal(input),
    proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });
  return { context, tools };
}

test('composite reads preserve a broken active revision as unavailable', async () => {
  const bean = {
    id: 'coffee-1',
    ownerId: uid,
    name: 'Jar one',
    activeRevisionIds: { v60_hot: 'missing-v60-revision' },
    handBrewRecipes: { v60: { device: 'v60', mode: 'hot', coffeeGrams: 15 } },
  };
  const readers = firestoreReaders(fakeFirestore({ bean }));
  const exact = await readers.readRecipe({ uid, coffeeId: 'coffee-1', slotKey: 'v60_hot' });
  assert.equal(exact.code, 'active_revision_not_found');

  const composite = await readers.readRecipe({ uid, coffeeId: 'coffee-1' });
  // Desired contract: a broken active revision is not silently omitted or
  // treated as a missing recipe. Current code returns [] here.
  assert.ok(Array.isArray(composite), 'composite reads retain their array compatibility');
  assert.ok(
    composite.unavailableSlots?.some((item) => item.slotKey === 'v60_hot' && item.state === 'unavailable'),
    `composite read hid the broken active revision: ${JSON.stringify(composite)}`,
  );
});

test('unavailable composite recipe markers stay out of records and block target readiness', async () => {
  const envelope = {
    records: [{ slotKey: 'kalita_hot', device: 'kalita', mode: 'hot' }],
    unavailableSlots: [{ slotKey: 'v60_hot', state: 'unavailable', code: 'active_revision_not_found' }],
  };
  const evidence = await readCoffeeEvidence({
    uid,
    coffeeId: 'coffee-1',
    readers: { readRecipe: async () => envelope },
  });
  assert.equal(evidence.recipe.status, 'unavailable');
  assert.deepEqual(evidence.recipe.records, envelope.records);
  assert.deepEqual(evidence.recipe.unavailableSlots, [{ slotKey: 'v60_hot', state: 'unavailable' }]);
  assert.deepEqual(evidence.unavailable, ['recipe']);

  const context = {
    userText: 'What is my hot V60 recipe?',
    sessionId: 'capability-unavailable-target',
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['v60_hot', 'kalita_hot'] }] },
    proposalState: { target: null, previewReady: false },
  };
  const tools = createRuphusTools({
    uid,
    context,
    // The composite and exact reader contracts differ: the former returns
    // the bounded marker envelope, while an exact slot read returns its
    // typed unavailable result. Keeping that distinction in the fixture
    // prevents the fallback from mistaking the envelope itself for a recipe.
    readers: { readRecipe: async ({ slotKey } = {}) => slotKey ? { code: 'active_revision_not_found', slotKey } : envelope },
  });
  const result = await tools.call('read_coffee_evidence', { coffeeRef: 'coffee', windowDays: 14, slot: 'v60_hot' });
  assert.equal(result.selectedRecipe, null);
  assert.equal(result.recipe.status, 'unavailable');
  assert.deepEqual(context.proposalState.target, null);
});

test('composite reads preserve an invalid mapped source without hiding valid slots', async () => {
  const bean = {
    id: 'coffee-1',
    ownerId: uid,
    name: 'Jar one',
    handBrewRecipes: {
      v60: { device: 'kalita', mode: 'hot', coffeeGrams: 15 },
      kalita: generateKalitaRecipe({}, { dose: 15, size: '155' }),
    },
  };
  const readers = firestoreReaders(fakeFirestore({ bean }));
  const exact = await readers.readRecipe({ uid, coffeeId: 'coffee-1', slotKey: 'v60_hot' });
  assert.equal(exact.code, 'legacy_recipe_ambiguous');

  const composite = await readers.readRecipe({ uid, coffeeId: 'coffee-1' });
  assert.deepEqual(composite.map((item) => item.slotKey), ['kalita_hot']);
  assert.deepEqual(composite.invalidSlots, [{ slotKey: 'v60_hot', state: 'invalid', code: 'legacy_recipe_ambiguous' }]);

  const evidence = await readCoffeeEvidence({ uid, coffeeId: 'coffee-1', readers: { readRecipe: async () => composite } });
  assert.equal(evidence.recipe.status, 'invalid');
  assert.deepEqual(evidence.recipe.records.map((item) => item.slotKey), ['kalita_hot']);
  assert.deepEqual(evidence.recipe.invalidSlots, [{ slotKey: 'v60_hot', state: 'invalid' }]);
  assert.deepEqual(evidence.unavailable, []);
});

test('malformed canonical snapshot stays present at the reader but is invalid and untargetable in tools', async () => {
  const bean = { id: 'coffee-1', ownerId: uid, name: 'Jar one', activeRevisionIds: { v60_hot: 'bad-canonical' } };
  const readers = firestoreReaders(fakeFirestore({
    bean,
    revisions: new Map([['bad-canonical', { coffeeId: 'coffee-1', slotKey: 'v60_hot', snapshot: {}, snapshotHash: 'bad-hash' }]]),
  }));
  const exact = await readers.readRecipe({ uid, coffeeId: 'coffee-1', slotKey: 'v60_hot' });
  assert.equal(exact.code, undefined, 'malformed source is not absence or a missing-ref reader error');
  assert.equal(exact.validationStatus, 'invalid');
  assert.equal(exact.selectedPath, 'recipeRevisions/bad-canonical');
  const composite = await readers.readRecipe({ uid, coffeeId: 'coffee-1' });
  assert.deepEqual(composite, []);
  assert.deepEqual(composite.invalidSlots, [{ slotKey: 'v60_hot', state: 'invalid', code: 'recipe_invalid' }]);

  const context = {
    userText: 'What is my hot V60 recipe?',
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['v60_hot'] }] },
    proposalState: { target: null, previewReady: false },
  };
  const tools = createRuphusTools({
    uid,
    context,
    readers: {
      ...readers,
      readCoffee: async () => ({ id: 'coffee-1', name: 'Jar one' }),
      readBrews: async () => [{ id: 'brew-1', coffeeId: 'coffee-1', slotKey: 'v60_hot', dose: 15 }],
    },
  });
  const exactTool = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.equal(exactTool.status, 'invalid');
  assert.equal(exactTool.sourceState, 'present');
  assert.equal(exactTool.recipe, null);
  const result = await tools.call('read_coffee_evidence', { coffeeRef: 'coffee', windowDays: 14, slot: 'v60_hot' });
  assert.equal(result.recipe.status, 'invalid');
  assert.deepEqual(result.recipe.invalidSlots, [{ slot: 'hot V60', status: 'invalid' }]);
  assert.equal(result.selectedRecipe, null);
  assert.equal(result.brews.status, 'available');
  assert.deepEqual(context.proposalState.target, null);
});

test('malformed mapped legacy snapshot stays present at the reader but is invalid and untargetable in tools', async () => {
  const bean = { id: 'coffee-1', ownerId: uid, name: 'Jar one', handBrewRecipes: { v60: {} } };
  const readers = firestoreReaders(fakeFirestore({ bean }));
  const exact = await readers.readRecipe({ uid, coffeeId: 'coffee-1', slotKey: 'v60_hot' });
  assert.equal(exact.code, undefined, 'malformed mapped source is not collapsed into absence');
  assert.equal(exact.validationStatus, 'invalid');
  assert.equal(exact.selectedPath, 'handBrewRecipes.v60');
  const composite = await readers.readRecipe({ uid, coffeeId: 'coffee-1' });
  assert.deepEqual(composite, []);
  assert.deepEqual(composite.invalidSlots, [{ slotKey: 'v60_hot', state: 'invalid', code: 'recipe_invalid' }]);

  const context = {
    userText: 'What is my hot V60 recipe?',
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['v60_hot'] }] },
    proposalState: { target: null, previewReady: false },
  };
  const tools = createRuphusTools({
    uid,
    context,
    readers: { ...readers, readCoffee: async () => ({ id: 'coffee-1', name: 'Jar one' }) },
  });
  const exactTool = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.equal(exactTool.status, 'invalid');
  assert.equal(exactTool.sourceState, 'present');
  assert.equal(exactTool.recipe, null);
  const result = await tools.call('read_coffee_evidence', { coffeeRef: 'coffee', windowDays: 14, slot: 'v60_hot' });
  assert.equal(result.recipe.status, 'invalid');
  assert.deepEqual(result.recipe.invalidSlots, [{ slot: 'hot V60', status: 'invalid' }]);
  assert.equal(result.selectedRecipe, null);
  assert.deepEqual(context.proposalState.target, null);
});

test('mixed unavailable and invalid exact launch failures never become an empty recipe', async () => {
  const context = {
    launchCoffeeId: 'coffee',
    __ruphusLaunchContext: { launchItem: { kind: 'recipe', ref: 'missing-revision', method: 'v60_hot' } },
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['v60_hot'] }] },
    proposalState: { target: null },
  };
  const tools = createRuphusTools({
    uid,
    context,
    readers: { readRecipe: async ({ launchItem }) => ({ code: launchItem ? 'active_revision_not_found' : 'legacy_recipe_ambiguous' }) },
  });
  const result = await tools.call('read_coffee_evidence', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.equal(result.recipe.status, 'unavailable');
  assert.deepEqual(result.recipe.unavailableSlots, [{ slot: 'hot V60', status: 'unavailable' }]);
  assert.equal(Object.hasOwn(result.recipe, 'invalidSlots'), false);

  const mixed = await readCoffeeEvidence({
    uid,
    coffeeId: 'coffee-1',
    launchItem: { kind: 'recipe', ref: 'missing-revision', method: 'v60_hot' },
    readers: { readRecipe: async () => [{ code: 'active_revision_not_found' }, { code: 'legacy_recipe_ambiguous', slotKey: 'kalita_hot' }] },
  });
  assert.equal(mixed.recipe.status, 'unavailable');
  assert.deepEqual(mixed.recipe.unavailableSlots, [{ slotKey: 'v60_hot', state: 'unavailable', code: 'active_revision_not_found' }]);
  assert.deepEqual(mixed.recipe.invalidSlots, [{ slotKey: 'kalita_hot', state: 'invalid', code: 'legacy_recipe_ambiguous' }]);
});

test('verified absent iced V60 can produce an ordinary first-recipe proposal', async () => {
  const { tools } = absentIcedHarness();
  const readResult = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_iced' });
  assert.deepEqual(readResult.creation.allowedControls, ['dose', 'ratio', 'temperature']);
  assert.deepEqual(readResult.creation.configurations, [{ variant: 'classic', size: '02' }]);
  const result = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee',
    slot: 'v60_iced',
    intent: 'recipe_preview',
    change: { control: 'ratio', value: 16 },
    servingDoseGrams: 15,
    experiment: null,
    explanation: null,
  });
  // Desired contract: the shipped iced generator is usable for an absent
  // slot. Current proposal creation requires a pre-existing target.
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('named manual source permits a validated ratio derivative', async () => {
  const source = generateManualSourceTechniqueOption(
    'hario-switch-03-matt-winton-hybrid-24-2022',
    {},
    { dose: 24 },
  ).recipe;
  const context = {
    userText: 'Make this stronger.',
    sessionId: 'capability-source-ratio',
    conversation: [],
    rotationSnapshot: {
      refs: { coffee: 'coffee-1' },
      coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['v60_hot'] }],
      setup: { grinder: 'fellow-ode-gen2' },
    },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { id: 'coffee-1', ownerId: uid, name: 'Jar one', handBrewRecipes: { v60: source } });
  const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => source }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal', 'brew_once', 'keep_current'] });
  const readResult = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.deepEqual(readResult.sourceControls.allowedControls, ['ratio', 'temperature', 'servingDoseGrams']);
  assert.deepEqual(readResult.sourceControls.servingDoseGrams, [15, 24]);
  const result = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee',
    slot: 'v60_hot',
    intent: 'recipe_preview',
    change: { control: 'ratio', value: 14 },
    servingDoseGrams: null,
    experiment: null,
    explanation: null,
  });
  // Desired contract: a supported, clearly labeled derivative is reviewable.
  // Current source projections allow dose only and reject ratio adaptation.
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('every ordinary manual family can generate a first recipe from a verified absent slot', async () => {
  const cases = [
    ['v60_hot', 'Make me a hot V60 recipe.', { control: 'ratio', value: 16 }, 15, 'v60'],
    ['v60_hot', 'Make me a hot Switch 03 recipe.', { control: 'ratio', value: 16 }, 20, 'v60'],
    ['v60_iced', 'Make me an iced V60 recipe.', { control: 'ratio', value: 16 }, 15, 'v60'],
    ['kalita_hot', 'Make me a hot Kalita 155 recipe.', { control: 'ratio', value: 16 }, 15, 'kalita'],
    ['kalita_hot', 'Make me a hot Kalita 185 recipe.', { control: 'ratio', value: 16 }, 20, 'kalita'],
    ['kalita_hot', 'Make me a hot Kalita 155 recipe at a stronger ratio.', { control: 'ratio', value: 14 }, 15, 'kalita'],
    ['kalita_iced', 'Make me an iced Kalita 185 recipe.', null, 20, 'kalita'],
  ];
  for (const [slot, userText, change, dose, expectedDevice] of cases) {
    const context = {
      userText,
      sessionId: `first-${slot}-${expectedDevice}`,
      conversation: [],
      rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: { grinder: 'fellow-ode-gen2' } },
      proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
    };
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { id: 'coffee-1', ownerId: uid, name: 'Jar one' });
    const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal', 'brew_once', 'keep_current'] });
    const readResult = await tools.call('read_recipe', { coffeeRef: 'coffee', slot });
    if (slot === 'kalita_iced') assert.deepEqual(readResult.creation.allowedControls, ['dose']);
    const result = await tools.call('propose_recipe_change', { coffeeRef: 'coffee', slot, intent: 'recipe_preview', change, servingDoseGrams: dose, experiment: null, explanation: null });
    assert.equal(result.ok, true, `${slot}: ${JSON.stringify(result)}`);
    assert.equal(result.artifact.sourceState, 'absent');
    assert.equal(result.artifact.before, null);
    assert.equal(result.artifact.after.device, expectedDevice);
    assert.equal(result.artifact.after.timerReady, true);
    if (slot === 'v60_hot' && /switch/i.test(userText)) assert.equal(result.artifact.after.variant, 'switch');
    if (slot === 'kalita_hot') assert.equal(result.artifact.after.kalitaSize, /185/.test(userText) ? '185' : '155');
    if (slot === 'kalita_iced') assert.equal(result.artifact.after.kalitaSize, '185');
  }
});

test('typed equipment binding survives a short dose follow-up without switching variant or size', async () => {
  const cases = [
    { slot: 'v60_hot', displayName: 'hot Switch 03', expectedVariant: 'switch' },
    { slot: 'kalita_hot', displayName: 'hot Kalita 185', expectedSize: '185' },
  ];
  for (const item of cases) {
    const context = {
      userText: '20 grams please.',
      methodBinding: { status: 'locked', slot: item.slot, displayName: item.displayName, source: 'equipment-answer' },
      sessionId: `bound-${item.slot}`,
      conversation: [{ role: 'assistant', content: `Which ${item.displayName} recipe should I prepare?` }],
      rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
      proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
    };
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { id: 'coffee-1', ownerId: uid, name: 'Jar one' });
    const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal', 'brew_once', 'keep_current'] });
    await tools.call('read_recipe', { coffeeRef: 'coffee', slot: item.slot });
    const result = await tools.call('propose_recipe_change', { coffeeRef: 'coffee', slot: item.slot, intent: 'recipe_preview', change: null, servingDoseGrams: 20, experiment: null, explanation: null });
    assert.equal(result.ok, true, `${item.slot}: ${JSON.stringify(result)}`);
    if (item.expectedVariant) assert.equal(result.artifact.after.variant, item.expectedVariant);
    if (item.expectedSize) assert.equal(result.artifact.after.kalitaSize, item.expectedSize);
  }
});

test('an active Switch review advertises serving-dose editing and stays out of generic discovery', async () => {
  const sourceOption = generateManualSourceTechniqueOption('hario-switch-03-matt-winton-hybrid-24-2022', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 24,
  });
  const source = sourceOption.recipe;
  const context = {
    userText: 'Only 20 grams please.',
    sessionId: 'active-switch-review-capability',
    conversation: [],
    methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot Switch 03', source: 'M2' },
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  Object.defineProperty(context, '__ruphusPriorProposals', { value: [{
    id: 'switch-review', type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_hot',
    before: null, after: source, sourceState: 'absent', sourceHash: absentRecipeSourceHash('v60_hot'),
    techniqueExperiment: { kind: 'manual_source_technique', techniqueId: sourceOption.id, sourceId: sourceOption.sourceId },
  }], enumerable: false });
  const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) } });
  const read = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.equal(read.creation, undefined, 'an editable review must not be accompanied by generic first-recipe advice');
  assert.deepEqual(read.currentReview.sourceControls.allowedControls, ['ratio', 'temperature', 'servingDoseGrams']);
  assert.deepEqual(read.currentReview.sourceControls.servingDoseGrams, [15, 24]);
  const options = await tools.call('read_technique_options', { coffeeRef: 'coffee', slot: 'v60_hot', intent: 'recipe_preview' });
  assert.equal(options.ok, true, JSON.stringify(options));
  assert.equal(options.current.sourceProjection.sourceId, source.sourceProjection.sourceId);
  assert.equal(options.current.configuration.variant, 'switch');
  assert.equal(options.current.configuration.size, '03');
});

test('an active iced legacy review advertises grind and serving controls', async () => {
  const recipe = generateKalitaIcedRecipe({}, { size: '185', dose: 20 });
  const context = {
    userText: 'One click finer please.', sessionId: 'active-iced-review-capability', conversation: [],
    methodBinding: { status: 'locked', slot: 'kalita_iced', displayName: 'iced Kalita 185', source: 'M2' },
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  Object.defineProperty(context, '__ruphusPriorProposals', { value: [{
    id: 'iced-review', type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'kalita_iced',
    before: null, after: recipe, sourceState: 'absent', sourceHash: absentRecipeSourceHash('kalita_iced'),
  }], enumerable: false });
  const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) } });
  const read = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'kalita_iced' });
  assert.equal(read.creation, undefined);
  assert.ok(read.currentReview.sourceControls.allowedControls.includes('servingDoseGrams'));
  assert.ok(read.currentReview.sourceControls.allowedControls.includes('grind'));
});

test('generic M2 iced Kalita binding keeps the trusted 185 review through evidence and exact grind edit', async () => {
  const recipe = generateKalitaIcedRecipe({}, { size: '185', dose: 20 });
  const context = {
    userText: 'One click finer please.', sessionId: 'generic-iced-kalita-review', conversation: [],
    methodBinding: { status: 'locked', slot: 'kalita_iced', displayName: 'iced Kalita', source: 'M2' },
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  Object.defineProperty(context, '__ruphusPriorProposals', { value: [{
    id: 'iced-kalita-185-review', type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'kalita_iced',
    before: null, after: recipe, sourceState: 'absent', sourceHash: absentRecipeSourceHash('kalita_iced'),
  }], enumerable: false });
  const readers = {
    readCoffee: async () => ({ id: 'coffee-1', name: 'Jar one' }),
    readRecipe: async () => ({ code: 'recipe_missing' }),
    readBrews: async () => [],
    readTastings: async () => [],
  };
  const tools = createRuphusTools({ uid, context, readers });
  const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'coffee', slot: 'kalita_iced' });
  assert.equal(evidence.currentReview.size, '185');
  assert.ok(evidence.currentReview.sourceControls.allowedControls.includes('grind'));
  assert.equal(evidence.creation, undefined);
  const exact = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'kalita_iced' });
  assert.equal(exact.currentReview.size, '185');
  assert.ok(exact.currentReview.sourceControls.allowedControls.includes('grind'));
  const proposal = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'kalita_iced', intent: 'recipe_preview',
    change: { control: 'grind', value: '5.4' }, servingDoseGrams: null,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  assert.equal(proposal.artifact.after.kalitaSize, '185');
  assert.equal(proposal.artifact.after.grindSize.setting, '5.4');
});

test('generic M2 Switch binding keeps trusted 03 review while explicit classic V60 stays incompatible', async () => {
  const source = generateManualSourceTechniqueOption('hario-switch-03-matt-winton-hybrid-24-2022', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 24,
  }).recipe;
  const makeContext = (displayName, sourceType) => {
    const context = {
      userText: 'One click finer please.', sessionId: `generic-switch-${sourceType}`, conversation: [],
      methodBinding: { status: 'locked', slot: 'v60_hot', displayName, source: sourceType },
      rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
      proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
    };
    Object.defineProperty(context, '__ruphusPriorProposals', { value: [{
      id: `switch-${sourceType}`, type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_hot',
      before: null, after: source, sourceState: 'absent', sourceHash: absentRecipeSourceHash('v60_hot'),
    }], enumerable: false });
    return context;
  };
  const generic = createRuphusTools({ uid, context: makeContext('hot Switch', 'M2'), readers: { readRecipe: async () => ({ code: 'recipe_missing' }) } });
  const genericRead = await generic.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.equal(genericRead.currentReview.variant, 'switch');
  assert.equal(genericRead.currentReview.size, '03');
  const explicitClassic = createRuphusTools({ uid, context: makeContext('hot V60', 'equipment-answer'), readers: { readRecipe: async () => ({ code: 'recipe_missing' }) } });
  const classicRead = await explicitClassic.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.equal(classicRead.currentReview, undefined);
  assert.ok(classicRead.creation, 'an incompatible explicit classic binding must not borrow the Switch review');
});

test('reading a saved classic V60 preserves the active Switch draft through dose proposal', async () => {
  const saved = generateV60Recipe({}, { dose: 20 });
  const draft = generateManualSourceTechniqueOption('hario-switch-03-matt-winton-hybrid-24-2022', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 24,
  }).recipe;
  const context = {
    userText: 'Only 20 grams please', sessionId: 'switch-dose-followup', conversation: [],
    methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot Switch 03', source: 'M2' },
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['v60_hot'] }], setup: {} },
    proposalState: { target: null, previewReady: true, proposalIssued: false },
    __ruphusPriorProposals: [{ id: 'switch-draft', type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_hot', before: saved, after: draft, sourceState: 'present', sourceHash: recipeSourceHash(saved, 'v60_hot') }],
  };
  const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => saved } });
  const read = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.equal(read.currentReview.variant, 'switch');
  assert.equal(context.methodBinding.displayName, 'hot Switch 03');
  assert.equal(context.ledger.entries.findLast(entry => entry.kind === 'method_focus').methodFocus.displayName, 'hot Switch 03');
  const resized = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'v60_hot', intent: 'recipe_preview', change: null,
    servingDoseGrams: 20, aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(resized.ok, true, JSON.stringify(resized));
  assert.equal(resized.artifact.after.variant, 'switch');
  assert.equal(resized.artifact.after.coffeeGrams, 20);
  assert.equal(resized.artifact.after.sourceProjection.sourceId, draft.sourceProjection.sourceId);
});

test('legacy V60 review capabilities expose finite dose bounds and ratio control', async () => {
  const recipe = generateV60Recipe({}, { dose: 20 });
  const context = {
    userText: 'Make this stronger.', sessionId: 'active-v60-review-capability', conversation: [],
    methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot V60', source: 'M2' },
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  Object.defineProperty(context, '__ruphusPriorProposals', { value: [{
    id: 'v60-review', type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_hot',
    before: null, after: recipe, sourceState: 'absent', sourceHash: absentRecipeSourceHash('v60_hot'),
  }], enumerable: false });
  const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) } });
  const read = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  assert.ok(read.currentReview.sourceControls.allowedControls.includes('servingDoseGrams'));
  assert.ok(read.currentReview.sourceControls.allowedControls.includes('ratio'));
  assert.ok(read.currentReview.sourceControls.servingDoseGrams.every(Number.isFinite));
  assert.ok(read.currentReview.bounds.servingDoseGrams.every(Number.isFinite));
  assert.deepEqual(read.currentReview.bounds.temperatureC, [92, 100]);
  const resized = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'v60_hot', intent: 'recipe_preview', change: null,
    servingDoseGrams: 19, aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(resized.ok, true, JSON.stringify(resized));
  assert.equal(resized.artifact.after.coffeeGrams, 19);
});

test('present family capability matrix executes one valid bounded advertised control', async () => {
  const aiden = {
    method: 'aiden', device: 'aiden', mode: 'hot', profileType: 0, title: 'Jar one Aiden', ratio: 16,
    bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 95,
    ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 20, ssPulseTemperatures: [96, 95],
    batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [95, 94],
    grindRecommendation: { singleServe: 5, batch: 6.2 },
  };
  const sourceSwitch = generateManualSourceTechniqueOption('hario-switch-03-matt-winton-hybrid-24-2022', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 24,
  }).recipe;
  const cases = [
    ['v60_hot', generateV60Recipe({}, { dose: 20 })],
    ['v60_iced', generateV60IcedRecipe({}, { dose: 15 })],
    ['kalita_hot', generateKalitaRecipe({}, { size: '155', dose: 15 })],
    ['kalita_hot', generateKalitaRecipe({}, { size: '185', dose: 20 })],
    ['kalita_iced', generateKalitaIcedRecipe({}, { size: '185', dose: 20 })],
    ['v60_hot', sourceSwitch],
    ['aiden', aiden],
  ];
  const numericRatio = (value) => Number(String(value || '').match(/(?:1\s*[:/])?([0-9]+(?:\.[0-9]+)?)/)?.[1]);
  for (const [slot, recipe] of cases) {
    const makeContext = () => ({
      userText: 'Please adjust this saved recipe.', sessionId: `present-capability-${slot}-${recipe.variant || recipe.kalitaSize || recipe.method}`,
      conversation: [], rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [slot] }], setup: {} },
      proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
    });
    const discoveryTools = createRuphusTools({ uid, context: makeContext(), readers: { readRecipe: async () => recipe } });
    const read = await discoveryTools.call('read_recipe', { coffeeRef: 'coffee', slot });
    assert.ok(read.sourceControls?.allowedControls?.length, `${slot} did not advertise editable controls`);
    for (const control of read.sourceControls.allowedControls) {
      const bounds = read.sourceControls.servingDoseGrams;
      const currentDose = Number(recipe.coffeeGrams ?? recipe.dose);
      const servingDose = control === 'servingDoseGrams'
        ? (currentDose < bounds[1] ? Math.min(bounds[1], currentDose + 1) : bounds[0])
        : null;
      let change = null;
      if (control === 'ratio') {
        const currentRatio = numericRatio(recipe.ratio);
        change = { control: 'ratio', value: Number.isFinite(currentRatio) ? currentRatio + 0.5 : recipe.sourceProjection ? 14 : 16 };
      }
      if (control === 'temperature') {
        const currentTemperature = Number(recipe.waterTemp?.celsius ?? recipe.temperature?.value ?? recipe.temperature ?? recipe.ssPulseTemperatures?.[0] ?? recipe.batchPulseTemperatures?.[0] ?? recipe.bloomTemperature);
        change = { control: 'temperature', value: currentTemperature >= 99 ? currentTemperature - 1 : currentTemperature + 1 };
      }
      if (control === 'grind') change = { control: 'grind', value: String(recipe.grindSize?.setting || recipe.grind || '5') === '5.2' ? '4.6' : '5.2' };
      const tools = createRuphusTools({ uid, context: makeContext(), readers: { readRecipe: async () => recipe } });
      await tools.call('read_recipe', { coffeeRef: 'coffee', slot });
      const result = await tools.call('propose_recipe_change', {
        coffeeRef: 'coffee', slot, intent: 'recipe_preview', change, servingDoseGrams: servingDose,
        aidenProfile: null, experiment: null, explanation: null,
      });
      assert.equal(result.ok, true, `${slot}/${control}/${recipe.sourceProjection?.sourceId || recipe.technique || recipe.variant || recipe.kalitaSize}: ${JSON.stringify(result)}`);
      if (slot === 'v60_hot' && control === 'grind' && !recipe.sourceProjection && recipe.sourceLineage?.status === 'original') {
        assert.equal(result.artifact.after.sourceLineage.status, 'adapted');
        assert.equal(result.artifact.after.sourceLineage.parameterSources.grind, 'v60-adaptation-bounded-v1');
      }
    }
  }
});

test('a typed unsupported Switch size fails closed instead of borrowing the 03 schedule', async () => {
  const context = {
    userText: '20 grams please.',
    methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot Switch 02', source: 'equipment-answer' },
    sessionId: 'bound-switch-02', conversation: [],
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { id: 'coffee-1', ownerId: uid, name: 'Jar one' });
  const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal', 'brew_once', 'keep_current'] });
  await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'v60_hot' });
  const result = await tools.call('propose_recipe_change', { coffeeRef: 'coffee', slot: 'v60_hot', intent: 'recipe_preview', change: null, servingDoseGrams: 20, experiment: null, explanation: null });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unsupported_switch_size');
});

test('context ledger carries verified Switch and Kalita size through the next short follow-up', async () => {
  const cases = [
    { initialText: 'Make me a hot Switch 03 recipe.', slot: 'v60_hot', expectedVariant: 'switch' },
    { initialText: 'Make me a hot Kalita 185 recipe.', slot: 'kalita_hot', expectedSize: '185' },
  ];
  const readers = {
    listCoffees: async () => [{ id: 'coffee-1', name: 'Jar one', jarSlot: 1, status: 'ACTIVE', recipes: [] }],
    readSetup: async () => ({}),
    readRecipe: async () => ({ code: 'recipe_missing' }),
  };
  for (const item of cases) {
    const first = await buildRuphusContext({ uid, contextRef: { surface: 'direct', coffeeRef: 'coffee-1' }, userText: item.initialText, conversation: [], evidenceByteCap: 10000, readers });
    const firstTools = createRuphusTools({ uid, context: first, readers });
    const firstRead = await firstTools.call('read_recipe', { coffeeRef: first.launchCoffeeId, slot: item.slot });
    assert.equal(firstRead.displayName, item.expectedVariant ? 'hot Switch 03' : 'hot Kalita 185');
    assert.equal(first.ledger.entries.at(-1).methodFocus.displayName, item.expectedVariant ? 'hot Switch 03' : 'hot Kalita 185');

    const second = await buildRuphusContext({ uid, contextRef: { surface: 'direct', coffeeRef: 'coffee-1' }, userText: '20 grams please.', conversation: [{ role: 'user', content: item.initialText }], ledger: first.ledger, evidenceByteCap: 10000, readers });
    assert.equal(second.methodBinding.displayName, item.expectedVariant ? 'hot Switch 03' : 'hot Kalita 185');
    second.proposalState.diagnosisReady = true;
    second.proposalState.userAgreed = true;
    second.proposalState.previewReady = true;
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { id: 'coffee-1', ownerId: uid, name: 'Jar one' });
    const secondTools = createRuphusTools({ uid, context: second, readers, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal', 'brew_once', 'keep_current'] });
    const secondRead = await secondTools.call('read_recipe', { coffeeRef: second.launchCoffeeId, slot: item.slot });
    assert.equal(secondRead.displayName, item.expectedVariant ? 'hot Switch 03' : 'hot Kalita 185');
    const result = await secondTools.call('propose_recipe_change', { coffeeRef: second.launchCoffeeId, slot: item.slot, intent: 'recipe_preview', change: null, servingDoseGrams: 20, experiment: null, explanation: null });
    assert.equal(result.ok, true, `${item.slot}: ${JSON.stringify(result)}`);
    if (item.expectedVariant) assert.equal(result.artifact.after.variant, item.expectedVariant);
    if (item.expectedSize) assert.equal(result.artifact.after.kalitaSize, item.expectedSize);
  }
});

test('exact read display does not resurrect a different brewer from an old ledger', async () => {
  const context = {
    userText: 'Use the Kalita instead.',
    methodBinding: { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita', source: 'M1' },
    ledger: { entries: [{ kind: 'method_focus', namedCoffees: ['Jar one'], methodFocus: { displayName: 'hot Switch 03' } }] },
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: [] }], setup: {} },
    proposalState: { target: null, proposalIssued: false },
  };
  const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) } });
  const result = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'kalita_hot' });
  assert.equal(result.displayName, 'hot Kalita');
  assert.equal(context.ledger.entries.at(-1).methodFocus.displayName, 'hot Kalita');
});
