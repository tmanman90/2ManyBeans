import assert from 'node:assert/strict';
import test from 'node:test';
import { runRuphusTurn, methodBindingTriggers } from '../api/_lib/ruphusOrchestrator.js';
import { buildDynamicEvidenceBlock } from '../api/_lib/ruphusPrompt.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { firestoreReaders } from '../api/ruphus-agent.js';

const profile = { title: 'Aiden', profileType: 0, ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 95, ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 20, ssPulseTemperatures: [96, 95], batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [95, 94] };

const inherited = () => ({ methodBinding: { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita', source: 'M2' }, trace: { reads: [], focusChanges: [], regenerations: [] } });
const usage = { input_tokens: 10, output_tokens: 10 };

test('one active revision cannot hide another brewer legacy recipe in composite evidence', async () => {
  const bean = { name: 'Colombia', aidenRecipe: profile, activeRevisionIds: { kalita_hot: 'r1' } };
  const revision = { coffeeId: 'bean-1', slotKey: 'kalita_hot', snapshot: { dose: 20, water: 320 }, snapshotHash: 'hash' };
  const db = { collection: () => ({ doc: () => ({ collection: child => ({ doc: () => ({ get: async () => ({ exists: true, data: () => child === 'beans' ? bean : revision }) }) }) }) }) };
  const recipes = await firestoreReaders(db).readRecipe({ uid: 'owner', coffeeId: 'bean-1' });
  assert.deepEqual(recipes.map(recipe => recipe.slotKey).sort(), ['aiden', 'kalita_hot']);
  assert.equal(recipes.find(recipe => recipe.slotKey === 'aiden').ratio, 16);
  revision.coffeeId = 'another-owner-coffee';
  assert.deepEqual((await firestoreReaders(db).readRecipe({ uid: 'owner', coffeeId: 'bean-1' })).map(recipe => recipe.slotKey), ['aiden']);
});

test('semantic evidence selection replaces remembered focus but cannot override explicit brewer authority', async () => {
  for (const source of ['M2', 'M1']) {
    const context = { ...inherited(), userText: 'The machine instead', rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Colombia', recipes: ['aiden', 'kalita_hot'] }], refs: { c1: 'bean-1' } }, ledger: { entries: [] }, proposalState: { target: { coffeeRef: 'c1', slot: 'kalita_hot' } }, __ruphusResolvedTargets: new Map() };
    context.methodBinding.source = source;
    const tools = createRuphusTools({ uid: 'owner', context, readers: { readCoffee: async () => ({ name: 'Colombia' }), readRecipe: async () => [{ ...profile, slotKey: 'aiden' }, { dose: 20, water: 320, slotKey: 'kalita_hot' }], readBrews: async () => [], readTastings: async () => [] } });
    const result = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', slot: 'aiden' });
    if (source === 'M2') {
      assert.equal(result.method.slot, 'aiden');
      assert.equal(result.selectedRecipe.ratio, 16);
      assert.equal(context.proposalState.target.slot, 'aiden');
    } else assert.equal(context.methodBinding.slot, 'kalita_hot');
  }
});

test('a missing requested recipe retires remembered brewer focus without creating a proposal target', async () => {
  const context = { ...inherited(), userText: 'What about the Aidan recipe?',
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Colombia' }], refs: { c1: 'bean-1' } },
    ledger: { entries: [] }, proposalState: { target: { coffeeRef: 'c1', slot: 'kalita_hot' }, previewReady: true } };
  const tools = createRuphusTools({ uid: 'owner', context, readers: { readRecipe: async () => ({ code: 'recipe_missing' }) } });
  const result = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  assert.equal(result.recipe, null);
  assert.equal(context.methodBinding.slot, 'aiden');
  assert.equal(context.proposalState.target, null);
  assert.equal(context.proposalState.previewReady, false);
  assert.equal(context.ledger.entries.at(-1).methodFocus.displayName, 'Aiden');
});

test('remembered brewer cannot censor a new brewer clarification or comparison', () => {
  for (const reply of ['For the Aiden, was it thin or also sour?', 'The V60 uses percolation; the Aiden manages its own pulses.']) {
    assert.deepEqual(methodBindingTriggers({ reply, binding: inherited().methodBinding }), []);
  }
  assert.equal(methodBindingTriggers({ reply: 'Use the Aiden instead.', binding: { ...inherited().methodBinding, source: 'M1' } })[0].code, 'RT6_METHOD_CONTRADICTION');
  assert.doesNotMatch(buildDynamicEvidenceBlock(inherited()), /Do not substitute, suggest, or ask about another brewer/);
  for (const [slot, reply] of [
    ['aiden', 'The Aiden change uses a stronger ratio. The Kalita change uses a finer grind.'],
    ['kalita_hot', 'The V60 and Kalita have different filter shapes.'],
    ['v60_hot', 'Unlike the Aiden, the V60 requires you to pour by hand.'],
  ]) assert.deepEqual(methodBindingTriggers({ reply, binding: { status: 'locked', slot, source: 'M1' } }), []);
});

test('a transient recipe read preserves the active brewer and proposal readiness', async () => {
  const context = { ...inherited(), rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Colombia' }], refs: { c1: 'bean-1' } }, ledger: { entries: [] }, proposalState: { target: { coffeeRef: 'c1', slot: 'kalita_hot' }, previewReady: true } };
  const before = structuredClone(context);
  const tools = createRuphusTools({ uid: 'owner', context, readers: { readRecipe: async () => ({ code: 'unavailable' }) } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  assert.deepEqual(context.methodBinding, before.methodBinding);
  assert.deepEqual(context.proposalState, before.proposalState);
});

test('invalid prose accompanying a validated card cannot create a competing recovery card', async () => {
  let runs = 0; const frames = [];
  const context = { ...inherited(), proposalState: { target: { coffeeRef: 'c1', slot: 'kalita_hot' }, previewReady: true } };
  context.__ruphusResolvedTargets = new Map([['c1:kalita_hot', { coffeeRef: 'c1', coffeeId: 'bean-1', sourceHash: 'verified-source' }]]);
  const artifact = { type: 'recipe_proposal', id: 'p1', slotKey: 'kalita_hot', before: { dose: 20, water: 320, grind: 5.6 }, after: { dose: 20, water: 320, grind: 5.2 }, changedPaths: ['grind'] };
  const result = await runRuphusTurn({ turnId: 'card-recovery', context, userText: 'Make it finer', emit: frame => frames.push(frame),
    provider: { runTurn: async () => { runs++; return { text: 'Snapshot says unknown. Need no generic question. final.', toolCalls: [{ callId: 'p', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'kalita_hot', intent: 'recipe_preview' } }], usage }; } },
    tools: { names: ['propose_recipe_change'], definitions: [], call: async () => ({ ok: true, artifact }) } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(runs, 1);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
  assert.doesNotMatch(result.text, /Snapshot|generic/);
  assert.match(result.text, /5.6.*5.2/);
});

test('a response correction executes an exact read before continuing with the corrected brewer', async () => {
  const context = inherited(); const inputs = []; const calls = []; const frames = [];
  const provider = { runTurn: async input => {
    inputs.push(input);
    if (inputs.length === 1) return { text: 'Snapshot says a different recipe. Need no generic question. final.', usage };
    if (inputs.length === 2) return { toolCalls: [{ callId: 'corrected-read', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'aiden' } }], usage };
    return { text: 'For the Aiden, was the cup thin but clean, or also sour?', usage };
  } };
  const tools = { names: ['read_recipe'], definitions: [{ name: 'read_recipe' }], call: async (name, args) => {
    calls.push({ name, args }); context.methodBinding = { status: 'locked', slot: 'aiden', displayName: 'Aiden', source: 'M2' };
    return { ok: true, slot: 'aiden', coffeeRef: 'c1', recipe: { ratio: 16 } };
  } };
  const result = await runRuphusTurn({ turnId: 'recovery-read', context, userText: 'How about the Aidan recipe? Not much flavor.', provider, tools, emit: frame => frames.push(frame) });
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
  assert.match(result.text, /For the Aiden/);
  assert.doesNotMatch(inputs[1].correctiveInstruction, /explicitly used hot Kalita/);
  assert.equal(frames.at(-1).type, 'turn_completed');
  assert.equal(result.usage.input_tokens, 30);
});

test('empty and repeatedly rejected responses are failures, never completed canned answers', async () => {
  for (const reply of ['', 'Snapshot says unknown. Need no generic question. final.']) {
    const frames = []; let calls = 0;
    const result = await runRuphusTurn({ turnId: 'failed-recovery', context: inherited(), userText: 'Help with my brew',
      provider: { runTurn: async () => { calls++; return { text: reply, usage }; } },
      tools: { definitions: [], names: [], call: async () => { throw Error('unexpected'); } }, emit: frame => frames.push(frame) });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'response_validation_failed');
    assert.equal(result.text, '');
    assert.equal(calls, 2, 'one bounded recovery, not an unbounded retry loop');
    assert.equal(frames.some(frame => frame.type === 'turn_completed'), false);
    assert.equal(frames.at(-1).type, 'turn_interrupted');
  }
});

test('recovery cannot execute an unknown mutation or bypass explicit method authority', async () => {
  let calls = 0; let runs = 0;
  const result = await runRuphusTurn({ turnId: 'forbidden-recovery', context: inherited(), userText: 'Help',
    provider: { runTurn: async () => ++runs === 1 ? { text: 'Snapshot says unknown. Need no generic question. final.', usage }
      : { toolCalls: [{ name: 'save_recipe', callId: 'bad', args: {} }], usage } },
    tools: { names: ['read_recipe', 'save_recipe'], definitions: [], call: async () => { calls++; } } });
  assert.equal(result.ok, false); assert.equal(result.code, 'forbidden_tool'); assert.equal(calls, 0);
});
