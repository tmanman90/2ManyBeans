import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { ambiguityClarification, proposalEligibleForTarget, runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { runtimeTriggers } from '../src/lib/ruphus/conversationContract.js';
import { RUPHUS_SYSTEM_PROMPT } from '../api/_lib/ruphusPrompt.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';

const base = { launchContext: { surface: 'direct' }, rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel', jarSlot: 1 }], refs: { c1: 'coffee-1' } }, ledger: { entries: [], namedCoffees: [] }, evidenceHash: 'e1', conversation: [{ role: 'assistant', content: 'The recent brew ran long, so I would go finer than Ode 4.2.' }] };
test('prompt uses held brew details and deterministic focus before asking', () => {
  assert.match(RUPHUS_SYSTEM_PROMPT, /Never ask for dose, water, grind, temperature, or brew time when a tool result already supplies it/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /“The other” means the matching coffee other than the current one/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /without adding unsolicited tuning advice/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /never leave it at vague “more extraction/);
});
test('tools expose only resolver, composite evidence, recipe, and proposal', async () => {
  const calls = [];
  const tools = createRuphusTools({ uid: 'u1', context: base, readers: { listCoffees: async () => [{ id: 'coffee-1', name: 'El Vergel', jarSlot: 1 }, { id: 'coffee-2', name: 'Rwanda', jarSlot: null }], readCoffee: async ({ coffeeId }) => ({ id: coffeeId, name: coffeeId === 'coffee-2' ? 'Rwanda' : 'El Vergel' }), readRecipe: async ({ slotKey }) => ({ method: 'v60', device: 'v60', mode: 'hot', dose: 15, water: 250, waterTemp: { celsius: 94 }, grindSize: { setting: 4.2 }, slotKey }), readBrews: async () => [], readTastings: async () => [] } });
  assert.deepEqual(tools.names, ['resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'propose_recipe_change']);
  const proposalSchema = tools.definitions.find((definition) => definition.name === 'propose_recipe_change').parameters;
  assert.deepEqual(proposalSchema.properties.change.properties.control.enum, ['dose', 'water', 'grind', 'temperature', 'ratio']);
  assert.equal(Object.hasOwn(proposalSchema.properties, 'afterRecipe'), false);
  assert.deepEqual(tools.definitions.find((definition) => definition.name === 'read_recipe').parameters.properties.slot.enum, ['aiden', 'v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced']);
  const assertStrictSchema = (schema) => {
    if (schema?.type === 'array') {
      assert.ok(schema.items, 'every provider array schema must declare items');
      assertStrictSchema(schema.items);
    }
    if (schema?.type === 'object') {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties));
      Object.values(schema.properties).forEach(assertStrictSchema);
    }
    if (Array.isArray(schema?.anyOf)) schema.anyOf.forEach(assertStrictSchema);
  };
  assertStrictSchema(proposalSchema);
  assert.equal((await tools.call('resolve_coffee', { reference: 'jar 1' })).coffeeRef, 'c1');
  const offRotation = await tools.call('resolve_coffee', { reference: 'Rwanda' });
  assert.equal((await tools.call('read_coffee_evidence', { coffeeRef: offRotation.coffeeRef, windowDays: 14 })).coffee.status, 'available');
  const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 }); calls.push(evidence); assert.equal(evidence.coffee.status, 'available');
  await assert.rejects(() => tools.call('read_coffee_evidence', { coffeeRef: 'c1', uid: 'evil', windowDays: 14 }), /server-bound/);
});
test('this coffee resolves the current named coffee, then the verified launch coffee', async () => {
  const readers = { listCoffees: async () => [{ id: 'coffee-1', name: 'El Vergel' }, { id: 'coffee-2', name: 'Colombia La Esperanza' }] };
  const launchContext = { ...base, launchCoffeeId: 'c2', __ruphusRefs: { c1: 'coffee-1', c2: 'coffee-2' }, ledger: { entries: [], namedCoffees: [] } };
  assert.equal((await createRuphusTools({ uid: 'u1', context: launchContext, readers }).call('resolve_coffee', { reference: 'this coffee' })).coffeeRef, 'c2');
  const namedContext = { ...launchContext, ledger: { entries: [], namedCoffees: ['El Vergel'] } };
  assert.equal((await createRuphusTools({ uid: 'u1', context: namedContext, readers }).call('resolve_coffee', { reference: 'current coffee' })).coffeeRef, 'c1');
});
test('ambiguous coffee resolution asks once instead of guessing through another tool round', async () => {
  let providerCalls = 0; const frames = [];
  const candidates = [{ name: 'Colombia La Esperanza', process: 'natural' }, { name: 'El Vergel', process: 'washed' }];
  const result = await runRuphusTurn({ turnId: 'ambiguous', context: base, userText: 'the Colombian one', provider: { async runTurn() { providerCalls += 1; return { toolCalls: [{ callId: 'resolve-1', name: 'resolve_coffee', args: { reference: 'the Colombian one' } }], usage: { input_tokens: 10, output_tokens: 2 } }; } }, tools: { names: ['resolve_coffee'], definitions: [], call: async () => ({ ok: false, reason: 'ambiguous', candidates }) }, emit: (frame) => frames.push(frame) });
  assert.equal(providerCalls, 1); assert.equal(result.ok, true); assert.equal(result.text, 'Which do you mean: Colombia La Esperanza, the natural one, or El Vergel, the washed one?');
  assert.equal(frames.at(-1).type, 'turn_completed'); assert.equal(result.toolCalls, 1);
  assert.equal(ambiguityClarification([{ name: 'coffeeId-secret' }, { name: 'Safe' }]), 'Which coffee do you mean?');
});
test('a successful recipe proposal ends with one truthful review handoff', async () => {
  let providerCalls = 0; const frames = [];
  const current = { ...base, proposalState: { target: { coffeeRef: 'c1', slot: 'v60_hot' }, diagnosisReady: true, userAgreed: true, proposalIssued: false } };
  const result = await runRuphusTurn({ turnId: 'proposal-complete', context: current, userText: 'Yes, make that change.', provider: { async runTurn() { providerCalls += 1; return { toolCalls: [{ callId: 'proposal-1', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', afterRecipe: {} } }], usage: { input_tokens: 10, output_tokens: 2 } }; } }, tools: { names: ['propose_recipe_change'], definitions: [], call: async () => ({ ok: true, proposal: { id: 'p1' }, artifact: { type: 'recipe_proposal', id: 'p1' } }) }, emit: (frame) => frames.push(frame) });
  assert.equal(providerCalls, 1); assert.equal(result.ok, true); assert.equal(result.text, 'I’ve prepared one recipe change for you to review.');
  assert.equal(frames.filter((frame) => frame.type === 'artifact_ready').length, 1); assert.equal(frames.at(-1).type, 'turn_completed');
});
test('proposal candidates treat null schema fields as unchanged recipe values', async () => {
  const before = generateV60Recipe({}, { dose: 15 }); const saved = [];
  const current = { ...base, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false }, sessionId: 's1' };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async () => before }, proposalStore: async (input) => { saved.push(input); return { id: 'p1', ...input }; } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', afterRecipe: { method: null, device: null, mode: null, dose: null, water: null, grindSize: { setting: 4, microns: null, description: null, grinderSpecific: null, sourceExact: null } } });
  assert.equal(result.ok, true); assert.equal(saved.length, 1); assert.equal(saved[0].after.dose, before.dose); assert.equal(saved[0].after.grindSize.setting, 4);
  assert.deepEqual(result.artifact.changedPaths, ['grindSize.setting']);
});
test('proposal candidates allow mirrored fields for one user-facing control but reject two controls', async () => {
  const before = generateV60Recipe({}, { dose: 15 });
  const current = { ...base, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false }, sessionId: 's1' };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async () => before }, proposalStore: async (input) => ({ id: 'p1', ...input }) });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  const mirroredGrind = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', afterRecipe: { grind: 'Ode 4.0', grindSize: { setting: 4 } } });
  assert.equal(mirroredGrind.ok, true);
  const secondContext = { ...base, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false }, sessionId: 's2' };
  const secondTools = createRuphusTools({ uid: 'u1', context: secondContext, readers: { readRecipe: async () => before } });
  await secondTools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  const multipleControls = await secondTools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', afterRecipe: { dose: 16, grindSize: { setting: 4 } } });
  assert.equal(multipleControls.code, 'one_change_required');
});
test('proposal tool maps one explicit control into a complete executable recipe', async () => {
  const before = generateV60Recipe({}, { dose: 15 }); const saved = [];
  const current = { ...base, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false }, sessionId: 's3' };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async () => before }, proposalStore: async (input) => { saved.push(input); return { id: 'p1', ...input }; } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', change: { control: 'grind', value: 'Ode 4.0' } });
  assert.equal(result.ok, true);
  assert.equal(saved[0].after.grindSize.setting, '4.0');
  assert.deepEqual(result.artifact.changedPaths, ['grindSize.setting']);
});
test('the same recipe advice is idempotent within one session but distinct across chats', async () => {
  const before = generateV60Recipe({}, { dose: 15 });
  const propose = async (sessionId) => {
    const current = { ...base, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false }, sessionId };
    const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async () => before } });
    await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
    return tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', change: { control: 'grind', value: '4.0' } });
  };
  const first = await propose('chat-1');
  const replay = await propose('chat-1');
  const anotherChat = await propose('chat-2');
  assert.equal(first.artifact.id, replay.artifact.id);
  assert.notEqual(first.artifact.id, anotherChat.artifact.id);
});
test('orchestrator buffers text, rejects premature proposal, and regenerates one runtime trigger', async () => {
  const frames = []; let runs = 0;
  const provider = { async runTurn() { runs += 1; return runs === 1 ? { text: 'Proposal: {"dose":16}' } : { text: 'Try one step finer than Ode 4.2.' }; } };
  const tools = createRuphusTools({ uid: 'u1', context: base });
  const result = await runRuphusTurn({ turnId: 't1', context: base, userText: 'Go ahead and make that change.', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true); assert.equal(frames.filter((frame) => frame.type === 'text_delta').length, 1); assert.equal(frames.find((frame) => frame.type === 'text_delta').text, 'Try one step finer than Ode 4.2.'); assert.equal(result.trace.regenerations.length, 1);
});
test('a premature proposal becomes normal advice without dispatch or interruption', async () => {
  const frames = []; let runs = 0; let dispatched = 0;
  const provider = { async runTurn(input) {
    runs += 1;
    if (runs === 1) return { toolCalls: [{ callId: 'too-soon', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', change: { control: 'grind', value: 4 } } }] };
    assert.equal(input.toolResult.results[0].result.code, 'proposal_timing');
    return { text: 'For this V60, try one small grind step finer first.' };
  } };
  const current = { ...base, proposalState: { target: { coffeeRef: 'c1', slot: 'v60_hot' }, diagnosisReady: true, userAgreed: false, proposalIssued: false } };
  const result = await runRuphusTurn({ turnId: 'premature-proposal', context: current, userText: 'the V60', provider, tools: { names: ['propose_recipe_change'], definitions: [], call: async () => { dispatched += 1; } }, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true);
  assert.equal(result.text, 'For this V60, try one small grind step finer first.');
  assert.equal(dispatched, 0);
  assert.equal(frames.some((frame) => frame.type === 'artifact_ready'), false);
  assert.equal(frames.at(-1).type, 'turn_completed');
});
test('method correction permanently drops the launch hint before evidence resolution', async () => {
  const current = { ...base, launchCoffeeId: 'c1', launchContext: { surface: 'recipe_aiden', launchItem: { kind: 'recipe', ref: 'recipe-1', method: 'aiden' } }, userText: 'Actually, I used v60', __ruphusLaunchContext: { launchItem: { kind: 'recipe', ref: 'recipe-1', method: 'aiden' } }, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map() };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readCoffee: async () => ({ name: 'El Vergel' }), readRecipe: async () => [{ slotKey: 'v60_hot', dose: 15 }], readBrews: async () => [], readTastings: async () => [] } });
  const result = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 });
  assert.equal(result.method.slot, 'v60_hot'); assert.equal(current.__ruphusLaunchHintConsumed, true);
});

test('direct recipe read carries the verified matching launch revision', async () => {
  const seen = [];
  const current = { ...base, launchCoffeeId: 'c1', __ruphusLaunchHintConsumed: false, __ruphusLaunchContext: { launchItem: { kind: 'recipe', ref: 'rev-1', method: 'v60_hot' } }, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false } };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async (input) => { seen.push(input); return { method: 'v60', device: 'v60', mode: 'hot', dose: 15, water: 250 }; } } });
  const result = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(result.recipe.dose, 15);
  assert.deepEqual(seen[0].launchItem, { kind: 'recipe', ref: 'rev-1', method: 'v60_hot' });
  assert.deepEqual(current.proposalState.target, { coffeeRef: 'c1', slot: 'v60_hot' });
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
