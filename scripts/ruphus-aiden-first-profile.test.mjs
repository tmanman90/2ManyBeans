import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { createMemoryCommandStore } from '../api/_lib/ruphusCommandService.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { toAidenProfile, validateAidenProfile } from '../src/lib/aidenProfileValidation.js';
import { AIDEN_PROFILE_FIELDS, repairAidenProfile } from '../src/lib/aidenCore.js';
import { aidenProfileRows } from '../src/lib/ruphus/aidenProfilePreview.js';
import { RUPHUS_OPENAI_MODEL } from '../api/_lib/ruphusProviders/openai.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';

const uid = 'aiden-first-owner';
const coffeeId = 'coffee-1';
const coffee = { refKey: 'c1', id: coffeeId, name: 'Jar one', roaster: 'Roaster', origin: 'Colombia', process: 'Washed', jarSlot: 1, recipes: [] };
const candidate = {
  profileType: 0, title: 'Model draft', ratio: 16,
  bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 95,
  ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 20, ssPulseTemperatures: [96, 95],
  batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [95, 94],
  grindRecommendation: { singleServe: 5, batch: 6.2 },
};

function context() {
  return {
    userText: 'Make Jar one an Aiden recipe.', sessionId: 'aiden-first-session',
    rotationSnapshot: { refs: { c1: coffeeId }, coffees: [coffee], setup: { grinder: 'fellow-ode-gen2' } },
    ledger: { entries: [], namedCoffees: [] },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
    __ruphusResolvedTargets: new Map(),
  };
}

function toolsFor(repository, current = context()) {
  return createRuphusTools({ uid, context: current,
    readers: { readRecipe: async () => ({ code: 'recipe_missing' }) },
    proposalStore: (input) => repository.createProposal(input),
    proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });
}

test('verified absent Aiden exposes safe full-profile generation and produces a native card', async () => {
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid });
  const tools = toolsFor(repository);
  const proposalDefinition = tools.definitions.find((definition) => definition.name === 'propose_recipe_change');
  assert.equal(proposalDefinition.strict, true);
  assert.ok(proposalDefinition.parameters.required.includes('aidenProfile'));
  assert.deepEqual(proposalDefinition.parameters.properties.aidenProfile.anyOf[0].required, [...AIDEN_PROFILE_FIELDS]);
  assert.equal(proposalDefinition.parameters.properties.aidenProfile.anyOf[0].additionalProperties, false);
  const read = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  assert.equal(read.sourceState, 'absent');
  assert.equal(read.creation.available, true);
  assert.deepEqual(read.creation.generation.requiredFields, [...AIDEN_PROFILE_FIELDS]);
  assert.equal(typeof read.creation.generation.instructions, 'string');
  assert.deepEqual(read.creation.generation.beanContext, { name: 'Jar one', roaster: 'Roaster', origin: 'Colombia', process: 'Washed', jarSlot: 1 });

  const result = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null,
    aidenProfile: candidate, experiment: null, explanation: null,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifact.sourceState, 'absent');
  assert.equal(result.artifact.before, null);
  assert.equal(result.artifact.after.method, 'aiden');
  assert.equal(result.artifact.after.device, 'aiden');
  assert.equal(result.artifact.after.title, '#1 Colombia Jar one - Roaster');
  assert.equal(validateAidenProfile(toAidenProfile(result.artifact.after)).valid, true);
  assert.deepEqual(result.artifact.after.grindRecommendation, { singleServe: 4.6, batch: 6.6 });
  assert.equal(result.artifact.after.generationProvenance.model, RUPHUS_OPENAI_MODEL);
  assert.notEqual(result.artifact.after.generationProvenance.model, 'current-chat-model');
  const browserCoreResult = repairAidenProfile(coffee, candidate);
  assert.deepEqual(toAidenProfile(result.artifact.after), toAidenProfile(browserCoreResult), 'server first-profile repair remains the browser generation contract');
});

test('an ordinary Aiden adjustment request recovers a missing profile into one review card', async () => {
  const current = context();
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid });
  const tools = toolsFor(repository, current);
  const responses = [
    { toolCalls: [{ callId: 'read-aiden', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'aiden' } }] },
    { toolCalls: [{ callId: 'draft-aiden', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, aidenProfile: null } }] },
    { toolCalls: [{ callId: 'complete-aiden', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, aidenProfile: candidate } }] },
  ];
  let providerCalls = 0;
  const frames = [];
  const result = await runRuphusTurn({ turnId: 'aiden-natural-recovery', context: current,
    userText: 'My Aiden cup was thin and dull. What should I change?', tools, emit: frame => frames.push(frame),
    provider: { runTurn: async input => { providerCalls += 1; if (providerCalls === 3) assert.equal(input.regeneration, true); return responses.shift(); } } });
  assert.equal(result.ok, true, result.code);
  assert.equal(providerCalls, 3);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
  assert.match(frames.filter(frame => frame.type === 'text_delta').map(frame => frame.text).join(''), /new Aiden profile/i);
  assert.equal(repository.listProposals(uid).length, 1, 'a preview exists but no recipe save occurred');
});

test('incomplete or malformed Aiden candidates fail before deterministic repair', async () => {
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid });
  const tools = toolsFor(repository);
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  const partial = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: { ...candidate, batchPulseTemperatures: undefined }, experiment: null, explanation: null });
  assert.equal(partial.ok, false);
  assert.equal(partial.code, 'invalid_aiden_candidate');
  const malformed = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: { ...candidate, ssPulseTemperatures: [96] }, experiment: null, explanation: null });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'invalid_aiden_candidate');
  const metadata = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: { ...candidate, debugLog: 'provider-secret', id: 'model-candidate-id', grindRecommendation: { ...candidate.grindRecommendation, sourceId: 'raw-source-id' } }, experiment: null, explanation: null });
  assert.equal(metadata.ok, false);
  assert.equal(metadata.code, 'invalid_aiden_candidate');
});

test('Aiden Save then Undo restores true absence and leaves separate grind state untouched', async () => {
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid, aidenGrind: { singleServe: 5.6, batch: 7.2 } });
  const current = context();
  const tools = toolsFor(repository, current);
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: candidate, experiment: null, explanation: null });
  const store = createMemoryCommandStore({ uid });
  store.seedBean(coffeeId, { ...coffee, aidenGrind: { singleServe: 5.6, batch: 7.2 } });
  store.seedProposal(result.proposal);
  const saved = store.execute({ actionId: 'save-first-aiden', mode: 'apply_proposal', coffeeId, slotKey: 'aiden', proposalId: result.proposal.id });
  assert.equal(saved.bean.aidenRecipe.ratio, 16);
  assert.deepEqual(saved.bean.aidenGrind, { singleServe: 5.6, batch: 7.2 });
  const undone = store.execute({ actionId: 'undo-first-aiden', mode: 'undo_revision', coffeeId, slotKey: 'aiden', expectedRevisionId: saved.revision.id });
  assert.equal(undone.bean.aidenRecipe, undefined);
  assert.deepEqual(undone.bean.aidenGrind, { singleServe: 5.6, batch: 7.2 });
});

test('invalid or unavailable Aiden reads never authorize first-profile creation', async () => {
  for (const code of ['recipe_invalid', 'active_revision_not_found']) {
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { ...coffee, ownerId: uid });
    const current = context();
    const tools = createRuphusTools({ uid, context: current,
      readers: { readRecipe: async () => ({ code, slotKey: 'aiden' }) },
      proposalStore: (input) => repository.createProposal(input),
      proposalActions: ['apply_proposal'],
    });
    const read = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
    assert.equal(read.status, code === 'recipe_invalid' ? 'invalid' : 'unavailable');
    assert.equal(read.sourceState, code === 'recipe_invalid' ? 'present' : 'unavailable');
    assert.equal(read.creation, undefined);
    const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: candidate, experiment: null, explanation: null });
    assert.equal(result.ok, false);
    assert.equal(result.artifact, undefined);
  }
});

test('existing Aiden profiles ignore arbitrary full candidates and keep bounded updates', async () => {
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid, aidenRecipe: { ...candidate, method: 'aiden', device: 'aiden', mode: 'hot' } });
  const current = context();
  const tools = createRuphusTools({ uid, context: current,
    readers: { readRecipe: async () => ({ ...candidate, method: 'aiden', device: 'aiden', mode: 'hot', slotKey: 'aiden' }) },
    proposalStore: (input) => repository.createProposal(input),
    proposalActions: ['apply_proposal'],
  });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  const result = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: { control: 'ratio', value: 15.5 }, servingDoseGrams: null,
    aidenProfile: { ...candidate, id: 'arbitrary-candidate', title: 'Untrusted replacement' }, experiment: null, explanation: null,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifact.after.ratio, 15.5);
  assert.equal(result.artifact.after.id, undefined);
  assert.notEqual(result.artifact.after.title, 'Untrusted replacement');
});

test('Aiden profile rows remain truthful when a malformed read reaches a renderer', () => {
  assert.deepEqual(aidenProfileRows({}), [
    ['Ratio', 'Not set'], ['Bloom', 'Disabled'], ['Single serve', 'Disabled'], ['Batch', 'Disabled'],
    ['Single-serve grind (Ode Gen 2)', 'Not set'], ['Batch grind (Ode Gen 2)', 'Not set'],
  ]);
  const repaired = repairAidenProfile(coffee, candidate);
  assert.doesNotMatch(JSON.stringify(aidenProfileRows(repaired)), /undefined/);
  assert.match(JSON.stringify(aidenProfileRows(repaired)), /Ode Gen 2/);
});

test('real context snapshot carries allowlisted bean descriptors into absent Aiden generation', async () => {
  const fixtures = [
    { id: 'dark-colombia', name: 'Dark Colombia', roaster: 'Roaster', origin: 'Colombia', process: 'Washed', roastLevel: 'dark', variety: 'Caturra', notes: 'cocoa', altitude: '1600 masl', jarSlot: 1, status: 'ACTIVE', recipes: [] },
    { id: 'generic-colombia', name: 'Generic Colombia', roaster: 'Roaster', origin: 'Colombia', process: 'Washed', roastLevel: 'medium', variety: 'Caturra', notes: 'chocolate', altitude: '1600 masl', jarSlot: 1, status: 'ACTIVE', recipes: [] },
    { id: 'pink-colombia', name: 'Pink Colombia', roaster: 'Roaster', origin: 'Colombia', process: 'Washed', roastLevel: 'light', variety: 'Pink Bourbon', notes: 'floral jasmine', altitude: '1900 masl', jarSlot: 1, status: 'ACTIVE', recipes: [] },
  ];
  const generated = {};
  const hashes = {};
  for (const fixture of fixtures) {
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { ...fixture, ownerId: uid });
    const context = await buildRuphusContext({
      uid,
      contextRef: { surface: 'direct', coffeeRef: fixture.id },
      userText: 'Make an Aiden profile for this coffee.',
      evidenceByteCap: 10000,
      readers: { listCoffees: async () => [fixture], readSetup: async () => ({ grinder: 'fellow-ode-gen2' }), readRecipe: async () => ({ code: 'recipe_missing' }) },
    });
    const coffeeRef = context.launchCoffeeId;
    const snapshotCoffee = context.__ruphusServerSnapshot.coffees.find((item) => item.refKey === coffeeRef);
    assert.deepEqual({ variety: snapshotCoffee.variety, roastLevel: snapshotCoffee.roastLevel, notes: snapshotCoffee.notes, altitude: snapshotCoffee.altitude }, { variety: fixture.variety, roastLevel: fixture.roastLevel, notes: fixture.notes, altitude: fixture.altitude });
    const tools = createRuphusTools({ uid, context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal'] });
    const read = await tools.call('read_recipe', { coffeeRef, slot: 'aiden' });
    assert.deepEqual(read.creation.generation.beanContext, { name: fixture.name, roaster: fixture.roaster, origin: fixture.origin, process: fixture.process, variety: fixture.variety, roastLevel: fixture.roastLevel, notes: fixture.notes, bagNotes: fixture.notes, altitude: fixture.altitude, jarSlot: fixture.jarSlot }, 'only allowlisted owner-scoped bean descriptors enter generation context');
    const result = await tools.call('propose_recipe_change', { coffeeRef, slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: candidate, experiment: null, explanation: null });
    assert.equal(result.ok, true, JSON.stringify(result));
    generated[fixture.id] = result.artifact.after.grindRecommendation;
    hashes[fixture.id] = result.artifact.after.sourceContextHash;
  }
  assert.notDeepEqual(generated['dark-colombia'], generated['generic-colombia']);
  assert.notDeepEqual(generated['pink-colombia'], generated['generic-colombia']);
  assert.deepEqual(generated['dark-colombia'], { singleServe: 7, batch: 7.6 });
  assert.deepEqual(generated['pink-colombia'], { singleServe: 3.2, batch: 5.6 });
  assert.notEqual(hashes['dark-colombia'], hashes['generic-colombia']);
  assert.notEqual(hashes['pink-colombia'], hashes['generic-colombia']);
});

test('evidence-first Aiden request exposes absent creation and binds the proposal target', async () => {
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid });
  const current = context();
  const tools = createRuphusTools({
    uid,
    context: current,
    readers: {
      readCoffee: async () => ({ ...coffee }),
      readRecipe: async () => ({ code: 'recipe_missing' }),
    },
    proposalStore: (input) => repository.createProposal(input),
    proposalActions: ['apply_proposal'],
  });
  const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1' });
  assert.equal(evidence.method.slot, 'aiden');
  assert.equal(evidence.sourceState, 'absent');
  assert.equal(evidence.creation.available, true);
  assert.deepEqual(evidence.creation.generation.beanContext, { name: 'Jar one', roaster: 'Roaster', origin: 'Colombia', process: 'Washed', jarSlot: 1 });
  assert.deepEqual(current.proposalState.target, { coffeeRef: 'c1', slot: 'aiden' });
  const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: candidate, experiment: null, explanation: null });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifact.sourceState, 'absent');
});

test('evidence-first existing Aiden stays bounded and invalid or unavailable reads stay unbound', async () => {
  const existingRepository = createMemoryRuphusRepository();
  existingRepository.seedBean(uid, { ...coffee, ownerId: uid, aidenRecipe: { ...candidate, method: 'aiden', device: 'aiden', mode: 'hot' } });
  const existingContext = context();
  const existingTools = createRuphusTools({
    uid,
    context: existingContext,
    readers: { readCoffee: async () => ({ ...coffee }), readRecipe: async () => ({ ...candidate, method: 'aiden', device: 'aiden', mode: 'hot', slotKey: 'aiden' }) },
    proposalStore: (input) => existingRepository.createProposal(input),
    proposalActions: ['apply_proposal'],
  });
  const existingEvidence = await existingTools.call('read_coffee_evidence', { coffeeRef: 'c1' });
  assert.equal(existingEvidence.selectedRecipe.method, 'aiden');
  assert.equal(existingEvidence.sourceState, undefined);
  const bounded = await existingTools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: { control: 'ratio', value: 15.5 }, servingDoseGrams: null, aidenProfile: { ...candidate, title: 'untrusted replacement' }, experiment: null, explanation: null });
  assert.equal(bounded.ok, true, JSON.stringify(bounded));
  assert.equal(bounded.artifact.after.ratio, 15.5);
  assert.notEqual(bounded.artifact.after.title, 'untrusted replacement');

  for (const code of ['recipe_invalid', 'active_revision_not_found']) {
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { ...coffee, ownerId: uid });
    const current = context();
    const tools = createRuphusTools({ uid, context: current, readers: { readCoffee: async () => ({ ...coffee }), readRecipe: async () => ({ code, slotKey: 'aiden' }) }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal'] });
    const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1' });
    assert.equal(evidence.creation, undefined);
    assert.equal(evidence.sourceState, undefined);
    assert.equal(current.proposalState.target, null);
    assert.equal(current.__ruphusResolvedTargets.size, 0);
    const blocked = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: candidate, experiment: null, explanation: null });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'proposal_target_required');
  }
});

test('an unsaved Aiden draft continues through an absent exact read without replacing its profile base', async () => {
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid });
  const first = context();
  const firstTools = toolsFor(repository, first);
  await firstTools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  const draft = await firstTools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null,
    servingDoseGrams: null, aidenProfile: candidate, experiment: null, explanation: null,
  });
  assert.equal(draft.ok, true, JSON.stringify(draft));
  assert.equal(draft.artifact.before, null);

  const next = { ...context(), userText: 'Make this Aiden profile stronger please', __ruphusPriorProposals: [draft.artifact] };
  const nextTools = toolsFor(repository, next);
  const read = await nextTools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  assert.equal(read.sourceState, 'absent');
  assert.equal(read.draft.sourceState, 'absent');
  assert.equal(read.draft.recipe.ratio, candidate.ratio);
  const continuation = await nextTools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: { control: 'ratio', value: 15.5 },
    servingDoseGrams: null, aidenProfile: { ...candidate, title: 'untrusted replacement' }, experiment: null, explanation: null,
  });
  assert.equal(continuation.ok, true, JSON.stringify(continuation));
  assert.equal(continuation.artifact.before, null);
  assert.equal(continuation.artifact.after.ratio, 15.5);
  assert.notEqual(continuation.artifact.after.title, 'untrusted replacement');
  const noChange = await nextTools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null,
    servingDoseGrams: null, aidenProfile: { ...candidate, title: 'another untrusted replacement' }, experiment: null, explanation: null,
  });
  assert.equal(noChange.ok, false);
  assert.equal(noChange.code, 'draft_change_required');
});

test('evidence discovery resolves the exact requested slot beyond summary bounds', async () => {
  const fiveRecipes = [
    { slotKey: 'v60_hot', method: 'v60', mode: 'hot', ratio: 16 },
    { slotKey: 'v60_iced', method: 'v60', mode: 'iced', ratio: 15 },
    { slotKey: 'kalita_hot', method: 'kalita', mode: 'hot', ratio: 16 },
    { slotKey: 'kalita_iced', method: 'kalita', mode: 'iced', ratio: 15 },
    { slotKey: 'aiden', method: 'aiden', device: 'aiden', mode: 'hot', ...candidate },
  ];
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { ...coffee, ownerId: uid });
  const current = context();
  const exactReads = [];
  const tools = createRuphusTools({ uid, context: current, readers: {
    readCoffee: async () => ({ ...coffee }),
    readRecipe: async ({ slotKey }) => { exactReads.push(slotKey || null); return slotKey ? fiveRecipes.find((item) => item.slotKey === slotKey) : fiveRecipes; },
  }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal'] });
  const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1' });
  assert.equal(evidence.selectedRecipe.method, 'aiden');
  assert.equal(evidence.sourceState, undefined);
  assert.equal(exactReads.includes('aiden'), true, 'the fifth-slot request must use the exact reader');
  assert.equal(current.__ruphusResolvedTargets.get('c1:aiden')?.before.method, 'aiden');
});

test('an unrelated unavailable composite slot does not hide an exact valid or absent request', async () => {
  const run = async (exact) => {
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { ...coffee, ownerId: uid });
    const current = context();
    const tools = createRuphusTools({ uid, context: current, readers: {
      readCoffee: async () => ({ ...coffee }),
      readRecipe: async ({ slotKey }) => slotKey ? exact : { records: [{ slotKey: 'v60_hot', method: 'v60', mode: 'hot', ratio: 16 }], unavailableSlots: [{ slotKey: 'v60_iced' }] },
    }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal'] });
    return { current, evidence: await tools.call('read_coffee_evidence', { coffeeRef: 'c1' }) };
  };
  const valid = await run({ slotKey: 'aiden', method: 'aiden', device: 'aiden', mode: 'hot', ...candidate });
  assert.equal(valid.evidence.selectedRecipe.method, 'aiden');
  assert.equal(valid.evidence.creation, undefined);
  assert.equal(valid.current.__ruphusResolvedTargets.get('c1:aiden')?.before.method, 'aiden');
  const absent = await run({ code: 'recipe_missing', slotKey: 'aiden' });
  assert.equal(absent.evidence.sourceState, 'absent');
  assert.equal(absent.evidence.creation.available, true);
  assert.deepEqual(absent.current.proposalState.target, { coffeeRef: 'c1', slot: 'aiden' });
});

test('runRuphusTurn completes from either first-read choice without a model read hop', async () => {
  const run = async (firstRead) => {
    const repository = createMemoryRuphusRepository();
    repository.seedBean(uid, { ...coffee, ownerId: uid });
    const current = {
      ...context(),
      proposalState: { target: null, diagnosisReady: false, userAgreed: false, previewReady: false, proposalIssued: false },
      evidenceHash: 'fresh-aiden-context',
      trace: { reads: [], focusChanges: [], regenerations: [] },
    };
    const tools = createRuphusTools({ uid, context: current, readers: {
      readCoffee: async () => ({ ...coffee }),
      readRecipe: async ({ slotKey }) => slotKey ? { code: 'recipe_missing' } : { code: 'recipe_missing' },
    }, proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal'] });
    const frames = [];
    let dispatches = 0;
    const provider = { runTurn: async (input) => {
      dispatches += 1;
      if (dispatches === 1) return { toolCalls: [{ callId: 'first-read', name: firstRead, args: { coffeeRef: 'c1', ...(firstRead === 'read_recipe' ? { slot: 'aiden' } : {}) } }] };
      assert.equal(dispatches, 2, 'the exact evidence/read path must not require another provider read hop');
      const readResult = input.toolResult.results[0].result;
      assert.equal(readResult.sourceState, 'absent');
      assert.equal(readResult.creation.available, true);
      assert.deepEqual(readResult.creation.generation.beanContext, { name: 'Jar one', roaster: 'Roaster', origin: 'Colombia', process: 'Washed', jarSlot: 1 });
      return { toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: null, servingDoseGrams: null, aidenProfile: candidate, experiment: null, explanation: null } }] };
    } };
    const turn = await runRuphusTurn({ turnId: `first-read-${firstRead}`, context: current, userText: current.userText, provider, tools, emit: (frame) => frames.push(frame) });
    assert.equal(turn.ok, true, JSON.stringify(turn));
    assert.equal(dispatches, 2);
    assert.equal(frames.filter((frame) => frame.type === 'artifact_ready').length, 1);
    return turn.artifacts[0];
  };
  const evidenceArtifact = await run('read_coffee_evidence');
  const exactArtifact = await run('read_recipe');
  assert.deepEqual(evidenceArtifact.after, exactArtifact.after);
  assert.equal(evidenceArtifact.sourceState, 'absent');
});

test('evidence and exact recipe reads expose the same source-control availability', async () => {
  const source = {
    slotKey: 'v60_hot', method: 'v60', device: 'v60', mode: 'hot', coffeeGrams: 15, waterGrams: 240,
    sourceProjection: { coffeeGrams: 15, water: { value: 240, unit: 'g' }, temperature: { value: 94, unit: 'C' }, grind: { microns: 700 } },
  };
  const current = { ...context(), userText: 'Make Jar one V60 stronger.' };
  const tools = createRuphusTools({ uid, context: current, readers: { readCoffee: async () => ({ ...coffee }), readRecipe: async ({ slotKey }) => slotKey ? source : [source] } });
  const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1' });
  assert.deepEqual(evidence.sourceControls, { allowedControls: ['ratio', 'temperature', 'grind'] });
  const exact = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.deepEqual(exact.sourceControls, evidence.sourceControls);
});

console.log('Ruphus Aiden first-profile contract passed');
