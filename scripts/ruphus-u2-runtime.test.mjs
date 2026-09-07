import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { ambiguityClarification, methodBindingTriggers, proposalEligibleForTarget, proposalHandoff, runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { runtimeTriggers } from '../src/lib/ruphus/conversationContract.js';
import { buildDynamicEvidenceBlock, RUPHUS_SYSTEM_PROMPT } from '../api/_lib/ruphusPrompt.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';

const base = { launchContext: { surface: 'direct' }, rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel', jarSlot: 1 }], refs: { c1: 'coffee-1' } }, ledger: { entries: [], namedCoffees: [] }, evidenceHash: 'e1', conversation: [{ role: 'assistant', content: 'The recent brew ran long, so I would go finer than Ode 4.2.' }] };
test('prompt uses held brew details and deterministic focus before asking', () => {
  assert.match(RUPHUS_SYSTEM_PROMPT, /Never ask for dose, water, grind, temperature, or brew time when a tool result already supplies it/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /method result contains an ask list, reply only with one natural question/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /never exceed 90 words in an ordinary reply/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /asks you to tell them about it, answer with one useful recipe or history detail/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /without adding unsolicited tuning advice or a generic invitation/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /“The other” means the matching coffee other than the current one/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /without adding unsolicited tuning advice/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /never leave it at vague “more extraction/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /Keep brew attempts and tasting notes separate unless the evidence explicitly links them/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /a photo or visual symptom alone does not identify the bean/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /Never select a coffee from rotation order, default method, or old focus/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /unknown coffee remains unmatched after the user supplies a roaster, origin/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /Before choosing among coffees, read the recent evidence for every plausible candidate/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /stay with the most recently named coffee/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /only reaffirms the already focused coffee, acknowledge it in one short phrase/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /Give specific recipe advice before agreement/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /thin but sweet or clean points to strength/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /launchItem method in LAUNCH_CLUE is verified app context/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /older coffee-level tasting that is not linked to the current brew does not diagnose today's cup/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /never send two consecutive question-only replies/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /do not add that there is no separate tasting unless the checked evidence explicitly establishes that absence/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /locked binding says Colombia La Esperanza for “the other Colombia,” answer about Colombia La Esperanza/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /ready to review—not applied/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /do not ask for agreement, advertise a proposal, or say you will prepare one/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /Use fresh, fresher, and freshest only for literal roast age/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /Never call a coffee or brewer a “slot”/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /When TRUSTED_METHOD_BINDING says locked/);
});
test('locked turn binding is the final explicit developer target', () => {
  const block = buildDynamicEvidenceBlock({
    rotationSnapshot: { coffees: [{ refKey: 'c2', name: 'Colombia La Esperanza' }] },
    ledger: { namedCoffees: ['El Vergel', 'Colombia La Esperanza'] },
    launchContext: { surface: 'direct' },
    turnBinding: { status: 'locked', coffeeRef: 'c2', coffeeName: 'Colombia La Esperanza' },
  });
  assert.match(block, /<AUTHORITATIVE_TURN_TARGET>/);
  assert.match(block, /current message resolves to Colombia La Esperanza/);
  assert.match(block, /Do not answer from the prior coffee focus/);
  assert.ok(block.lastIndexOf('<AUTHORITATIVE_TURN_TARGET>') > block.lastIndexOf('<TRUSTED_TURN_BINDING>'));
});
test('locked method binding is injected after general setup and rejects another brewer', () => {
  const block = buildDynamicEvidenceBlock({
    rotationSnapshot: { setup: { defaultMethod: 'Aiden' } },
    methodBinding: { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita', source: 'M1' },
  });
  assert.match(block, /<AUTHORITATIVE_METHOD_TARGET>/);
  assert.match(block, /user used hot Kalita/);
  assert.ok(block.lastIndexOf('<AUTHORITATIVE_METHOD_TARGET>') > block.lastIndexOf('<TRUSTED_METHOD_BINDING>'));
  assert.deepEqual(methodBindingTriggers({ reply: 'Use the Aiden recipe instead.', binding: { status: 'locked', slot: 'kalita_hot' } }).map((item) => item.code), ['RT6_METHOD_CONTRADICTION']);
  assert.deepEqual(methodBindingTriggers({ reply: 'For the Kalita, was it thin but clean or sour?', binding: { status: 'locked', slot: 'kalita_hot' } }), []);
});
test('tools expose reads, trial review, and proposal but no mutation', async () => {
  const calls = [];
  const tools = createRuphusTools({ uid: 'u1', context: base, readers: { listCoffees: async () => [{ id: 'coffee-1', name: 'El Vergel', jarSlot: 1 }, { id: 'coffee-2', name: 'Rwanda', jarSlot: null }], readCoffee: async ({ coffeeId }) => ({ id: coffeeId, name: coffeeId === 'coffee-2' ? 'Rwanda' : 'El Vergel' }), readRecipe: async ({ slotKey }) => ({ method: 'v60', device: 'v60', mode: 'hot', dose: 15, water: 250, waterTemp: { celsius: 94 }, grindSize: { setting: 4.2 }, slotKey }), readBrews: async () => [], readTastings: async () => [] } });
  assert.deepEqual(tools.names, ['resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'review_trial_recipe', 'propose_recipe_change']);
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
test('persisted proposals expose only server-enabled registered actions', async () => {
  for (const enabled of [false, true]) {
    const context = { ...base, __ruphusRefs: { c1: 'coffee-1' }, proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false } };
    const tools = createRuphusTools({
      uid: 'u1', context,
      proposalActions: enabled ? ['apply_proposal', 'brew_once', 'keep_current', 'delete_account'] : [],
      readers: { readRecipe: async () => generateV60Recipe({}, { dose: 15 }) },
      proposalStore: async (input) => ({ id: input.proposalId, status: 'proposed', sourceRevisionId: 'revision-1' }),
    });
    await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
    const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', change: { control: 'temperature', value: 93 } });
    assert.equal(result.ok, true);
    assert.deepEqual(result.artifact.actions, enabled ? ['apply_proposal', 'brew_once', 'keep_current'] : []);
  }
});
test('proposal request guidance reaches the provider only after diagnosis and assent', () => {
  assert.doesNotMatch(buildDynamicEvidenceBlock({ proposalState: { diagnosisReady: true, userAgreed: false } }), /RECIPE_REVIEW_REQUEST/);
  assert.doesNotMatch(buildDynamicEvidenceBlock({ proposalState: { diagnosisReady: false, userAgreed: true } }), /RECIPE_REVIEW_REQUEST/);
  const block = buildDynamicEvidenceBlock({ proposalState: { diagnosisReady: true, userAgreed: true } });
  assert.match(block, /Read the exact recipe, then prepare that change/);
  assert.match(block, /Do not ask for another yes/);
  assert.match(block, /card tap, not this request, authorizes saving/);
});
test('this coffee resolves the current named coffee, then the verified launch coffee', async () => {
  const readers = { listCoffees: async () => [{ id: 'coffee-1', name: 'El Vergel' }, { id: 'coffee-2', name: 'Colombia La Esperanza' }] };
  const launchContext = { ...base, launchCoffeeId: 'c2', __ruphusRefs: { c1: 'coffee-1', c2: 'coffee-2' }, ledger: { entries: [], namedCoffees: [] } };
  assert.equal((await createRuphusTools({ uid: 'u1', context: launchContext, readers }).call('resolve_coffee', { reference: 'this coffee' })).coffeeRef, 'c2');
  const namedContext = { ...launchContext, ledger: { entries: [], namedCoffees: ['El Vergel'] } };
  assert.equal((await createRuphusTools({ uid: 'u1', context: namedContext, readers }).call('resolve_coffee', { reference: 'current coffee' })).coffeeRef, 'c1');
});
test('successful focus resolution is replayed so the next pronoun follows the latest coffee', async () => {
  const context = { ...base, __ruphusRefs: { c1: 'coffee-1', c2: 'coffee-2' }, ledger: { entries: [], namedCoffees: [] } };
  const readers = { listCoffees: async () => [
    { id: 'coffee-1', name: 'El Vergel', origin: 'Colombia', process: 'washed' },
    { id: 'coffee-2', name: 'Colombia La Esperanza', origin: 'Colombia', process: 'natural' },
  ] };
  const tools = createRuphusTools({ uid: 'u1', context, readers });
  assert.equal((await tools.call('resolve_coffee', { reference: 'El Vergel' })).coffeeRef, 'c1');
  assert.equal((await tools.call('resolve_coffee', { reference: 'the other Colombia' })).coffeeRef, 'c2');
  assert.equal((await tools.call('resolve_coffee', { reference: 'that one' })).coffeeRef, 'c2');
  assert.deepEqual(context.ledger.namedCoffees, ['El Vergel', 'Colombia La Esperanza']);
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
  const result = await runRuphusTurn({ turnId: 'proposal-complete', context: current, userText: 'Yes, make that change.', provider: { async runTurn() { providerCalls += 1; return { toolCalls: [{ callId: 'proposal-1', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', afterRecipe: {} } }], usage: { input_tokens: 10, output_tokens: 2 } }; } }, tools: { names: ['propose_recipe_change'], definitions: [], call: async () => ({ ok: true, proposal: { id: 'p1' }, artifact: { type: 'recipe_proposal', id: 'p1', changedPaths: ['grind'], before: { coffeeGrams: 15, waterGrams: 250, grind: '4.2', temperature: 94 }, after: { coffeeGrams: 15, waterGrams: 250, grind: '4.0', temperature: 94 } } }) }, emit: (frame) => frames.push(frame) });
  assert.equal(providerCalls, 1); assert.equal(result.ok, true); assert.equal(result.text, 'Prepared: change the grind from 4.2 to 4.0. Dose, water, and temperature stay the same. Review it before applying.');
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
test('dose proposal regenerates every executable alias and timed instruction from the new dose', async () => {
  const source = generateV60Recipe({}, { dose: 15 });
  const before = { ...source, dose: 15, userCoffeeGrams: 15, water: source.waterGrams, prepSteps: source.prepSteps.map((step) => ({ ...step })) };
  const saved = [];
  const current = { ...base, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false }, sessionId: 'dose-canonical' };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async () => before }, proposalStore: async (input) => { saved.push(input); return { id: 'p-dose', ...input }; } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', change: { control: 'dose', value: 16 } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.artifact.changedPaths, ['dose']);
  assert.equal(saved[0].after.coffeeGrams, 16);
  assert.equal(saved[0].after.userCoffeeGrams, 16);
  assert.equal(saved[0].after.dose, 16);
  assert.equal(saved[0].after.waterGrams, before.waterGrams);
  assert.equal(saved[0].after.water, saved[0].after.waterGrams);
  assert.notEqual(saved[0].after.ratio, before.ratio);
  assert.equal(saved[0].after.steps.at(-1).waterTotal, saved[0].after.waterGrams);
  assert.match(saved[0].after.prepSteps[1].action, /Add 16g coffee/);
  assert.doesNotMatch(JSON.stringify(saved[0].after), /15g/);
  assert.equal(saved[0].after.steps.some((step) => /15g/.test(step.action)), false);
});
test('Kalita water proposal keeps the ratio, aliases, and final pour consistent', async () => {
  const source = generateKalitaRecipe({ targetRatio: 215 / 13 }, { dose: 13, size: '155' });
  const before = { ...source, water: source.waterGrams, dose: 13 };
  const current = { ...base, __ruphusRefs: { c1: 'coffee-1' }, proposalState: { target: null, diagnosisReady: true, userAgreed: true } };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async () => before } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'water', value: 205 } });
  assert.equal(result.ok, true);
  const after = result.artifact.after;
  assert.equal(after.waterGrams, 205);
  assert.equal(after.water, 205);
  assert.equal(after.ratio, '1:15.8');
  assert.equal(after.coffeeGrams, 13);
  assert.deepEqual(after.waterTemp, before.waterTemp);
  assert.deepEqual(after.grindSize, before.grindSize);
  assert.deepEqual(after.steps.slice(0, -1), before.steps.slice(0, -1));
  assert.equal(after.steps.at(-1).waterTotal, 205);
  assert.match(after.steps.at(-1).action, /205g total/);
  assert.doesNotMatch(after.steps.at(-1).action, /215g/);
  assert.equal(before.waterGrams, 215);
});
test('conditional sensory diagnosis cannot mint proposal authority', async () => {
  const before = generateV60Recipe({}, { dose: 15 });
  const current = { ...base, __ruphusRefs: { c1: 'coffee-1' }, __ruphusResolvedTargets: new Map(), proposalState: {
    target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false,
    diagnosis: { conditional: true, pendingClarification: { kind: 'sensory', question: 'Was the cup sour or bitter?' } },
  } };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers: { readRecipe: async () => before } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  await assert.rejects(() => tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', change: { control: 'dose', value: 16 } }), (error) => error.code === 'proposal_timing');
  assert.equal(current.proposalState.proposalIssued, false);
});
test('proposal handoff names the exact change and makes review authority explicit', () => {
  assert.equal(proposalHandoff({ changedPaths: ['dose'], before: { coffeeGrams: 15, waterGrams: 250, grind: '4.2', temperature: 94 }, after: { coffeeGrams: 16, waterGrams: 250, grind: '4.2', temperature: 94 } }), 'Prepared: change the dose from 15g to 16g. Water, grind, and temperature stay the same. Review it before applying.');
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
test('orchestrator regenerates a reply that contradicts the user-locked brewer', async () => {
  let runs = 0;
  const context = { ...base, methodBinding: { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita', source: 'M1' }, trace: { focusChanges: [], reads: [], regenerations: [] } };
  const provider = { async runTurn(input) {
    runs += 1;
    if (runs === 1) return { text: 'Use the Aiden recipe instead.' };
    assert.match(input.correctiveInstruction, /explicitly used hot Kalita/);
    return { text: 'For that Kalita cup, was it thin but clean, or sour and sharp?' };
  } };
  const result = await runRuphusTurn({ turnId: 'locked-method', context, userText: 'I used the Kalita 155 and it tasted watery.', provider, tools: createRuphusTools({ uid: 'u1', context }) });
  assert.equal(result.text, 'For that Kalita cup, was it thin but clean, or sour and sharp?');
  assert.equal(runs, 2);
  assert.deepEqual(result.trace.regenerations[0].triggers, ['RT6_METHOD_CONTRADICTION']);
});
test('a premature proposal becomes normal advice without dispatch or interruption', async () => {
  const frames = []; let runs = 0; let dispatched = 0;
  const provider = { async runTurn(input) {
    runs += 1;
    if (runs === 1) return { toolCalls: [{ callId: 'too-soon', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', change: { control: 'grind', value: 4 } } }] };
    assert.equal(input.toolResult.results[0].result.code, 'proposal_timing');
    assert.equal(input.regeneration, true);
    assert.deepEqual(input.tools, []);
    assert.match(input.correctiveInstruction, /not authorized yet/i);
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

test('same-coffee evidence carries the verified method focus until correction or switch', async () => {
  const current = {
    ...base,
    launchCoffeeId: 'c1',
    launchContext: { surface: 'recipe_kalita', launchItem: { kind: 'recipe', ref: 'recipe-kalita', method: 'kalita_hot' } },
    __ruphusLaunchHintConsumed: false,
    __ruphusLaunchContext: { launchItem: { kind: 'recipe', ref: 'recipe-kalita', method: 'kalita_hot' } },
    __ruphusRefs: { c1: 'coffee-1', c2: 'coffee-2' },
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel', jarSlot: 1 }, { refKey: 'c2', name: 'Colombia La Esperanza', jarSlot: 2 }], refs: { c1: 'coffee-1', c2: 'coffee-2' } },
    __ruphusEvidenceByteCap: 4096,
    __ruphusResolvedTargets: new Map(),
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, proposalIssued: false },
  };
  const readers = {
    readCoffee: async ({ coffeeId }) => ({ id: coffeeId, name: coffeeId === 'coffee-2' ? 'Colombia La Esperanza' : 'El Vergel' }),
    readRecipe: async ({ coffeeId, slotKey, windowDays }) => {
      const slot = slotKey || (coffeeId === 'coffee-2' ? 'v60_hot' : 'v60_hot');
      const recipe = slot === 'kalita_hot' ? generateKalitaRecipe({}, { dose: 15 }) : generateV60Recipe({}, { dose: 15 });
      if (windowDays === undefined) return { ...recipe, slotKey: slot };
      return [{ ...generateV60Recipe({}, { dose: 15 }), slotKey: 'v60_hot' }, { ...generateKalitaRecipe({}, { dose: 15 }), slotKey: 'kalita_hot' }];
    },
    readBrews: async () => [{ slotKey: 'v60_hot', updatedAt: '2026-08-30T00:00:00Z' }],
    readTastings: async () => [],
  };
  const tools = createRuphusTools({ uid: 'u1', context: current, readers });
  current.userText = 'Tell me about this coffee.';
  const first = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 });
  assert.equal(first.method.slot, 'kalita_hot'); assert.equal(first.method.tier, 'M1b');
  assert.deepEqual(current.ledger.entries.at(-1).methodFocus, { displayName: 'hot Kalita' });
  current.userText = 'What should I change?';
  const continued = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 });
  assert.equal(continued.method.slot, 'kalita_hot'); assert.equal(continued.method.tier, 'M2');
  current.proposalState.target = { coffeeRef: 'c1', slot: 'kalita_hot' };
  const proposal = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'grind', value: 4 } });
  assert.equal(proposal.ok, true);
  current.userText = 'Actually, I used the V60 this morning.';
  const corrected = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 });
  assert.equal(corrected.method.slot, 'v60_hot');
  assert.equal(current.ledger.entries.some((entry) => entry.kind === 'method_focus' && entry.methodFocus?.displayName === 'hot Kalita'), false);
  current.userText = 'Now the other coffee.';
  const switched = await tools.call('read_coffee_evidence', { coffeeRef: 'c2', windowDays: 14 });
  assert.notEqual(switched.method.slot, 'kalita_hot');
  assert.equal(current.ledger.entries.some((entry) => entry.kind === 'method_focus' && entry.namedCoffees?.includes('El Vergel')), false);
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

test('internal drafting notes trigger RT2 and replace a severe second failure', async () => {
  assert.ok(runtimeTriggers({ reply: 'Snapshot says the current recipe is unknown. Need no generic question. final.' }).some((item) => item.code === 'CF5_DRAFT_LEAK'));
  const context = { ...base, trace: { focusChanges: [], reads: [], regenerations: [] }, proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false } };
  const provider = { runTurn: async ({ regeneration }) => ({ text: regeneration ? 'No tool until agreement. final.' : 'Snapshot says Ode 4.2. Need no generic question. final.', toolCalls: [], usage: { input_tokens: 10, output_tokens: 10 } }) };
  const result = await runRuphusTurn({ turnId: 'draft-leak', context, userText: 'What should I change?', provider, tools: { definitions: [], call: async () => ({}) }, send: () => {} });
  assert.equal(result.text, 'I lost my train of thought there. Ask me that again and I’ll keep it short.');
  assert.deepEqual(result.trace.regenerations[0].secondFailure, ['CF5_DRAFT_LEAK']);
});

test('unavailable evidence cannot be turned into an absence claim', async () => {
  const frames = []; let runs = 0;
  const provider = { async runTurn(input) {
    runs += 1;
    if (runs === 1) return { toolCalls: [{ callId: 'read-1', name: 'read_coffee_evidence', args: { coffeeRef: 'c1', windowDays: 14 } }] };
    if (runs === 2) return { text: "I don't have a tasting note from that cup." };
    assert.equal(input.regeneration, true);
    assert.match(input.correctiveInstruction, /source was unavailable/i);
    return { text: "I couldn't check the tasting notes just now. The brew log still gives us enough to start with one small grind step finer." };
  } };
  const tools = { names: ['read_coffee_evidence'], definitions: [], call: async () => ({ coffeeRef: 'c1', tastings: { status: 'unavailable', summary: "I couldn't check tastings right now." }, unavailable: ['tastings'] }) };
  const result = await runRuphusTurn({ turnId: 'unavailable-truth', context: base, userText: 'What went wrong?', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true);
  assert.match(result.text, /couldn't check the tasting notes/i);
  assert.deepEqual(result.trace.regenerations[0].triggers, ['EVIDENCE_SCOPE']);
  assert.equal(frames.at(-1).type, 'turn_completed');
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

test('a redundant read beyond the tool-round budget recovers to prose without dispatch', async () => {
  const frames = []; let runs = 0; const dispatched = [];
  const provider = { async runTurn(input) {
    runs += 1;
    if (runs <= 3) return { toolCalls: [{ callId: `read-${runs}`, name: runs === 1 ? 'resolve_coffee' : runs === 2 ? 'read_coffee_evidence' : 'read_recipe', args: runs === 1 ? { reference: 'El Vergel' } : runs === 2 ? { coffeeRef: 'c1', windowDays: 14 } : { coffeeRef: 'c1', slot: 'v60_hot' } }] };
    assert.equal(input.regeneration, true);
    assert.deepEqual(input.tools, []);
    assert.equal(input.toolResult.results[0].result.code, 'read_budget_complete');
    return { text: 'Try one small grind step finer and keep everything else the same.' };
  } };
  const tools = { names: ['resolve_coffee', 'read_coffee_evidence', 'read_recipe'], definitions: [], call: async (name) => { dispatched.push(name); return { ok: true, coffeeRef: 'c1' }; } };
  const result = await runRuphusTurn({ turnId: 'read-round-recovery', context: base, userText: 'What should I change?', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true);
  assert.equal(result.text, 'Try one small grind step finer and keep everything else the same.');
  assert.deepEqual(dispatched, ['resolve_coffee', 'read_coffee_evidence']);
  assert.equal(frames.some((frame) => frame.type === 'turn_interrupted'), false);
});
