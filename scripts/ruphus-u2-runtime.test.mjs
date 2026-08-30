import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { proposalEligibleForTarget, runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { runtimeTriggers } from '../src/lib/ruphus/conversationContract.js';

const base = { launchContext: { surface: 'direct' }, rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel', jarSlot: 1 }], refs: { c1: 'coffee-1' } }, ledger: { entries: [], namedCoffees: [] }, evidenceHash: 'e1', conversation: [{ role: 'assistant', content: 'The recent brew ran long, so I would go finer than Ode 4.2.' }] };
test('tools expose only resolver, composite evidence, recipe, and proposal', async () => {
  const calls = [];
  const tools = createRuphusTools({ uid: 'u1', context: base, readers: { listCoffees: async () => [{ id: 'coffee-1', name: 'El Vergel', jarSlot: 1 }, { id: 'coffee-2', name: 'Rwanda', jarSlot: null }], readCoffee: async ({ coffeeId }) => ({ id: coffeeId, name: coffeeId === 'coffee-2' ? 'Rwanda' : 'El Vergel' }), readRecipe: async ({ slotKey }) => ({ method: 'v60', device: 'v60', mode: 'hot', dose: 15, water: 250, waterTemp: { celsius: 94 }, grindSize: { setting: 4.2 }, slotKey }), readBrews: async () => [], readTastings: async () => [] } });
  assert.deepEqual(tools.names, ['resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'propose_recipe_change']);
  assert.equal((await tools.call('resolve_coffee', { reference: 'jar 1' })).coffeeRef, 'c1');
  const offRotation = await tools.call('resolve_coffee', { reference: 'Rwanda' });
  assert.equal((await tools.call('read_coffee_evidence', { coffeeRef: offRotation.coffeeRef, windowDays: 14 })).coffee.status, 'available');
  const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 }); calls.push(evidence); assert.equal(evidence.coffee.status, 'available');
  await assert.rejects(() => tools.call('read_coffee_evidence', { coffeeRef: 'c1', uid: 'evil', windowDays: 14 }), /server-bound/);
});
test('orchestrator buffers text, rejects premature proposal, and regenerates one runtime trigger', async () => {
  const frames = []; let runs = 0;
  const provider = { async runTurn() { runs += 1; return runs === 1 ? { text: 'Proposal: {"dose":16}' } : { text: 'Try one step finer than Ode 4.2.' }; } };
  const tools = createRuphusTools({ uid: 'u1', context: base });
  const result = await runRuphusTurn({ turnId: 't1', context: base, userText: 'Go ahead and make that change.', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true); assert.equal(frames.filter((frame) => frame.type === 'text_delta').length, 1); assert.equal(frames.find((frame) => frame.type === 'text_delta').text, 'Try one step finer than Ode 4.2.'); assert.equal(result.trace.regenerations.length, 1);
});
test('method correction permanently drops the launch hint before evidence resolution', async () => {
  const current = { ...base, launchCoffeeId: 'c1', launchContext: { surface: 'recipe_aiden', launchItem: { kind: 'recipe', ref: 'recipe-1', method: 'aiden' } }, userText: 'Actually, I used v60', __ruphusLaunchContext: { launchItem: { kind: 'recipe', ref: 'recipe-1', method: 'aiden' } }, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map() };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readCoffee: async () => ({ name: 'El Vergel' }), readRecipe: async () => [{ slotKey: 'v60_hot', dose: 15 }], readBrews: async () => [], readTastings: async () => [] } });
  const result = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 });
  assert.equal(result.method.slot, 'v60_hot'); assert.equal(current.__ruphusLaunchHintConsumed, true);
});

test('RT3 delivers regenerated length/markup text and carries corrective instruction plus all tool evidence', async () => {
  const frames = []; let runs = 0; const seen = [];
  const evidence = { name: 'read_coffee_evidence', args: { coffeeRef: 'c1', windowDays: 14 }, coffee: 'El Vergel', records: [{ id: 'brew-1', dose: 15 }] };
  const tools = { names: ['read_coffee_evidence'], definitions: [], call: async (name, args) => ({ ...evidence, name, args }) };
  const provider = { async runTurn(input) {
    seen.push(input); runs += 1;
    if (runs === 1) return { toolCalls: [{ callId: 'read-1', name: 'read_coffee_evidence', args: { coffeeRef: 'c1', windowDays: 14 } }] };
    if (runs === 2) return { text: 'Proposal: {"dose":16}' };
    assert.equal(input.regeneration, true);
    assert.match(input.correctiveInstruction, /fresh complete reply/i);
    assert.deepEqual(input.priorToolEvidence, [{ callId: 'read-1', name: 'read_coffee_evidence', result: evidence }]);
    assert.deepEqual(input.toolResult.results, input.priorToolEvidence);
    return { text: '```regenerated but explicitly delivered```' };
  } };
  const result = await runRuphusTurn({ turnId: 'rt3-mixed', context: base, userText: 'What should I change?', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true);
  assert.equal(result.text, '```regenerated but explicitly delivered```');
  assert.equal(frames.find((frame) => frame.type === 'text_delta').text, result.text);
  assert.deepEqual(result.trace.regenerations[0].secondFailure, ['RT2_MARKUP']);
  assert.equal(result.trace.regenerations[0].delivered, 'regenerated');
  assert.equal(seen.length, 3);
});

test('short credential-shaped secrets trigger RT2 and replace a severe second failure', async () => {
  assert.ok(runtimeTriggers({ reply: 'The key is sk-short.' }).some((item) => item.code === 'CF5_SECRET'));
  const frames = []; let runs = 0;
  const provider = { async runTurn() { runs += 1; return { text: runs === 1 ? 'sk-short' : 'pk-worse' }; } };
  const result = await runRuphusTurn({ turnId: 'secret-short', context: base, userText: 'Help', provider, tools: createRuphusTools({ uid: 'u1', context: base }), emit: (frame) => frames.push(frame) });
  assert.equal(result.text, 'I lost my train of thought there. Ask me that again and I’ll keep it short.');
  assert.equal(frames.filter((frame) => frame.type === 'text_delta').length, 1);
  assert.deepEqual(result.trace.regenerations[0].secondFailure, ['CF5_SECRET']);
  assert.equal(result.trace.regenerations[0].delivered, 'replacement');
});

test('proposal eligibility is exact-target scoped and one proposal per round is atomic', async () => {
  const unrelated = { ...base, proposalState: { target: { coffeeRef: 'c2', slot: 'v60_hot' }, diagnosisReady: true, userAgreed: true } };
  assert.equal(proposalEligibleForTarget(unrelated, { coffeeRef: 'c1', slot: 'v60_hot' }), false);
  assert.equal(proposalEligibleForTarget({ ...base, proposalState: { target: { coffeeRef: 'c1', slot: 'v60_hot' }, diagnosisReady: true, userAgreed: true } }, { coffeeRef: 'c1', slot: 'v60_hot' }), true);
  let dispatched = 0; const frames = [];
  const tools = { names: ['propose_recipe_change'], definitions: [], call: async () => { dispatched += 1; return { ok: true }; } };
  const provider = { async runTurn() { return { toolCalls: [
    { callId: 'proposal-1', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', afterRecipe: {} } },
    { callId: 'proposal-2', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', afterRecipe: {} } },
  ] }; } };
  const result = await runRuphusTurn({ turnId: 'proposal-atomic', context: { ...base, proposalState: { target: { coffeeRef: 'c1', slot: 'v60_hot' }, diagnosisReady: true, userAgreed: true } }, userText: 'Yes', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, false); assert.equal(result.code, 'proposal_timing'); assert.equal(dispatched, 0); assert.equal(frames.at(-1).type, 'turn_interrupted');
});

test('parallel tool calls start before either Promise settles and preserve completion order in frames', async () => {
  const frames = []; const started = []; const deferred = new Map(); let continuation;
  const tools = { names: ['read_coffee_evidence'], definitions: [], call: async (_name, args) => {
    started.push(args.coffeeRef);
    return new Promise((resolve) => deferred.set(args.coffeeRef, resolve));
  } };
  const provider = { async runTurn(input) {
    if (input.toolResult) { continuation = input.toolResult.results; return { text: 'evidence checked' }; }
    return { toolCalls: [
      { callId: 'read-a', name: 'read_coffee_evidence', args: { coffeeRef: 'a', windowDays: 14 } },
      { callId: 'read-b', name: 'read_coffee_evidence', args: { coffeeRef: 'b', windowDays: 14 } },
    ] };
  } };
  const run = runRuphusTurn({ turnId: 'parallel-round', context: base, userText: 'Compare these', provider, tools, emit: (frame) => frames.push(frame) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ['a', 'b']);
  deferred.get('b')({ coffeeRef: 'b' }); await new Promise((resolve) => setImmediate(resolve));
  deferred.get('a')({ coffeeRef: 'a' });
  const result = await run;
  assert.equal(result.ok, true); assert.equal(continuation.length, 2);
  const resultFrames = frames.filter((frame) => frame.type === 'tool_result');
  assert.deepEqual(resultFrames.map((frame) => frame.result.coffeeRef), ['b', 'a']);
});
