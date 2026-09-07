import assert from 'node:assert/strict';
import test from 'node:test';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { allowedAgentUids, deriveProposalReadiness, devReadFaultForRequest, enabledProposalActions, firestoreReaders, hasUnavailableEvidence, replayFocusLedger, resolveLedgerCoffeeRef, retryUnavailableEvidence, sessionConversationForProvider, sessionReplayInputs, staleReplayConversation } from '../api/ruphus-agent.js';

test('New chat excludes archived Aiden conversation from provider replay', () => {
  const session = { lastActivityAt: 1000, boundaryIndex: 2, messages: [
    { role: 'user', text: 'Use Aiden' }, { role: 'assistant', text: 'Aiden recipe advice' },
    { role: 'user', text: 'My Kalita tasted thin' },
  ] };
  assert.deepEqual(sessionConversationForProvider(session, { now: 1000 }), [{ role: 'user', content: 'My Kalita tasted thin' }]);
});

const recipe = () => generateV60Recipe({}, { dose: 15 });
const context = () => ({ version: 2, launchContext: { surface: 'direct' }, context: { surface: 'direct' }, rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel', jarSlot: 1 }], refs: { c1: 'bean-1' } }, ledger: { entries: [], namedCoffees: [] }, conversation: [], evidenceHash: 'evidence-1', trace: { reads: [], focusChanges: [], regenerations: [] } });

test('orchestrator emits buffered checked text and no read artifact', async () => {
  const current = context(); const frames = [];
  const result = await runRuphusTurn({ turnId: 'turn-1', context: current, userText: 'Bitter', provider: { runTurn: async () => ({ text: 'Try one step finer than Ode 4.2.' }) }, tools: createRuphusTools({ uid: 'user-1', context: current }), emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true); assert.deepEqual(frames.map((frame) => frame.type), ['turn_accepted', 'context_loading', 'text_delta', 'turn_completed']);
});

test('forbidden model action fails without command dispatch', async () => {
  let calls = 0; const current = context(); const frames = [];
  const result = await runRuphusTurn({ turnId: 'turn-2', context: current, userText: 'apply it', provider: { runTurn: async () => ({ toolCalls: [{ name: 'apply_proposal', args: {} }] }) }, tools: { definitions: [], names: [], call: async () => { calls += 1; } }, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, false); assert.equal(result.code, 'forbidden_tool'); assert.equal(calls, 0); assert.equal(frames.at(-1).type, 'turn_failed');
});

test('owner-scoped tools resolve a different jar through an opaque reference', async () => {
  const current = context();
  const tools = createRuphusTools({ uid: 'user-1', context: current, readers: { listCoffees: async ({ uid }) => { assert.equal(uid, 'user-1'); return [{ id: 'bean-1', name: 'El Vergel', jarSlot: 1, status: 'ACTIVE' }, { id: 'bean-3', name: 'Rwanda', jarSlot: 3, status: 'ACTIVE' }]; }, readCoffee: async ({ uid, coffeeId }) => { assert.equal(uid, 'user-1'); return { id: coffeeId, name: coffeeId === 'bean-1' ? 'El Vergel' : 'Rwanda' }; }, readRecipe: async () => recipe(), readBrews: async () => [], readTastings: async () => [] } });
  assert.equal((await tools.call('resolve_coffee', { reference: 'jar 1' })).coffeeRef, 'c1');
  assert.equal((await tools.call('read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 })).coffee.status, 'available');
  await assert.rejects(() => tools.call('read_coffee_evidence', { coffeeRef: 'c1', uid: 'evil', windowDays: 14 }), /owner identity/);
});

test('context builds a direct launch with owner-scoped compact snapshot', async () => {
  const owners = []; const built = await buildRuphusContext({ uid: 'user-1', contextRef: { surface: 'direct' }, userText: 'hello', evidenceByteCap: 10000, readers: { listCoffees: async ({ uid }) => { owners.push(uid); return [{ id: 'bean-1', name: 'El Vergel', jarSlot: 1, status: 'ACTIVE', recipes: ['v60_hot'] }]; }, readSetup: async () => ({ defaultMethod: 'v60_hot', grinder: 'Ode 4.2', units: 'metric' }) } });
  assert.deepEqual(owners, ['user-1']); assert.equal(built.launchContext.surface, 'direct'); assert.match(built.rotationSnapshot.text, /El Vergel/); assert.equal(built.recipe, undefined);
});

test('provider receives the bounded conversation and launch clue', async () => {
  const current = { ...context(), conversation: [{ role: 'user', content: 'Use jar 1' }, { role: 'assistant', content: 'El Vergel is in jar 1.' }] }; const seen = [];
  const result = await runRuphusTurn({ turnId: 'history', context: current, userText: 'What next?', provider: { async runTurn(input) { seen.push(input); return { text: 'Try one step finer than Ode 4.2.' }; } }, tools: createRuphusTools({ uid: 'u', context: current }), emit: () => {} });
  assert.equal(result.ok, true); assert.deepEqual(seen[0].conversation, current.conversation);
});

test('endpoint context binds the sole other coffee before provider dispatch', async () => {
  const built = await buildRuphusContext({
    uid: 'user-1',
    contextRef: { surface: 'direct' },
    userText: 'Now the other Colombia.',
    ledger: { entries: [{ kind: 'coffee_focus', status: 'available', namedCoffees: ['El Vergel'] }], namedCoffees: ['El Vergel'] },
    evidenceByteCap: 10000,
    readers: {
      listCoffees: async () => [
        { id: 'bean-1', name: 'El Vergel', origin: 'Colombia', process: 'washed', jarSlot: 1, status: 'ACTIVE' },
        { id: 'bean-2', name: 'Colombia La Esperanza', origin: 'Colombia', process: 'natural', jarSlot: 2, status: 'ACTIVE' },
      ],
      readSetup: async () => ({ defaultMethod: 'v60_hot', grinder: 'Ode 4.2', units: 'metric' }),
    },
  });
  assert.equal(built.turnBinding.status, 'locked');
  assert.equal(built.turnBinding.coffeeName, 'Colombia La Esperanza');
  assert.equal(built.__ruphusRefs[built.turnBinding.coffeeRef], 'bean-2');
  const priorRef = Object.entries(built.__ruphusRefs).find(([, id]) => id === 'bean-1')?.[0];
  assert.ok(priorRef);
  assert.deepEqual(built.trace.focusChanges, [{ from: priorRef, to: built.turnBinding.coffeeRef, source: 'turn_binding' }]);
  assert.doesNotMatch(JSON.stringify(built), /bean-2/);
  const rawTools = createRuphusTools({ uid: 'user-1', context: built, readers: { listCoffees: async () => [] } });
  const toolCalls = [];
  const tools = { ...rawTools, call: async (...args) => { toolCalls.push(args); return rawTools.call(...args); } };
  const seen = [];
  const result = await runRuphusTurn({ turnId: 'bound-turn', context: built, userText: 'Now the other Colombia.', provider: { async runTurn(input) { assert.equal(toolCalls.length, 0); assert.deepEqual(input.context.trace.focusChanges, [{ from: priorRef, to: built.turnBinding.coffeeRef, source: 'turn_binding' }]); assert.equal(input.context.turnBinding.coffeeName, 'Colombia La Esperanza'); seen.push(input); return { text: 'I’m with Colombia La Esperanza.' }; } }, tools, emit: () => {} });
  assert.equal(result.ok, true);
  assert.equal(seen[0].context.turnBinding.coffeeName, 'Colombia La Esperanza');
  const contradictory = await tools.call('resolve_coffee', { reference: 'El Vergel' });
  assert.equal(contradictory.coffeeRef, built.turnBinding.coffeeRef);
  assert.equal(contradictory.match, 'turn_binding');
});

test('endpoint carries AE02 descriptor clarification into the first provider request', async () => {
  const readers = {
    listCoffees: async () => [
      { id: 'bean-1', name: 'El Vergel', origin: 'Colombia', process: 'washed', jarSlot: 1, status: 'ACTIVE' },
      { id: 'bean-2', name: 'Colombia La Esperanza', origin: 'Colombia', process: 'natural', jarSlot: 2, status: 'ACTIVE' },
      { id: 'bean-3', name: 'Kenya Kiamabara', origin: 'Kenya', process: 'washed', jarSlot: 3, status: 'ACTIVE' },
    ],
    readSetup: async () => ({ defaultMethod: 'v60_hot', grinder: 'Ode 4.2', units: 'metric' }),
  };
  const first = await buildRuphusContext({ uid: 'user-1', contextRef: { surface: 'direct' }, userText: 'the Colombian one', evidenceByteCap: 10000, readers });
  assert.equal(first.turnBinding.status, 'ambiguous');
  const second = await buildRuphusContext({ uid: 'user-1', contextRef: { surface: 'direct' }, userText: 'the washed one', ledger: first.ledger, evidenceByteCap: 10000, readers });
  assert.deepEqual({ status: second.turnBinding.status, coffeeName: second.turnBinding.coffeeName }, { status: 'locked', coffeeName: 'El Vergel' });
  const rawTools = createRuphusTools({ uid: 'user-1', context: second, readers: { listCoffees: async () => [] } });
  let calls = 0;
  const tools = { ...rawTools, call: async (...args) => { calls += 1; return rawTools.call(...args); } };
  const result = await runRuphusTurn({ turnId: 'ae02-bound-turn', context: second, userText: 'the washed one', provider: { async runTurn(input) { assert.equal(calls, 0); assert.equal(input.context.turnBinding.coffeeName, 'El Vergel'); return { text: 'The washed coffee is El Vergel.' }; } }, tools, emit: () => {} });
  assert.equal(result.ok, true);
});

test('trial reference is bound before the provider and cannot resolve to a different coffee', async () => {
  const userText = 'Can you make that Kalita trial recipe permanent?';
  const context = await buildRuphusContext({ uid: 'owner', contextRef: { surface: 'direct' }, userText, evidenceByteCap: 4096,
    ledger: { namedCoffees: ['Colombia La Esperanza'], entries: [{ kind: 'coffee_focus', status: 'available', namedCoffees: ['Colombia La Esperanza'] }] }, readers: {
      listCoffees: async () => [
        { id: 'private-bean-first', name: 'El Vergel', status: 'ACTIVE' },
        { id: 'private-bean-current', name: 'Colombia La Esperanza', status: 'ACTIVE' },
      ], readSetup: async () => ({}),
    } });
  const tools = createRuphusTools({ uid: 'owner', context, readers: {} });
  const result = await runRuphusTurn({ turnId: 'trial-binding', context, userText, tools,
    provider: { runTurn: async ({ context: input }) => {
      assert.equal(input.turnBinding.coffeeName, 'Colombia La Esperanza');
      assert.doesNotMatch(JSON.stringify(input), /private-bean-current/);
      return { text: 'I can check that trial.' };
    } }, emit: () => {} });
  assert.equal(result.ok, true);
  const resolved = await tools.call('resolve_coffee', { reference: 'that Kalita trial recipe' });
  assert.equal(resolved.coffeeRef, context.turnBinding.coffeeRef);
  assert.equal(resolved.match, 'turn_binding');
});

test('server allowlist is exact and empty by default', () => {
  const previous = process.env.RUPHUS_AGENT_V3_UIDS; delete process.env.RUPHUS_AGENT_V3_UIDS; assert.equal(allowedAgentUids().size, 0); process.env.RUPHUS_AGENT_V3_UIDS = 'u-1, u-2'; assert.equal(allowedAgentUids().has('u-1'), true); assert.equal(allowedAgentUids().has('u-3'), false); if (previous == null) delete process.env.RUPHUS_AGENT_V3_UIDS; else process.env.RUPHUS_AGENT_V3_UIDS = previous;
});
test('reader fault injection is restricted to the isolated preview fixture identity', () => {
  const env = { VERCEL_ENV: 'preview', TMB_APP_VARIANT: 'dev', RUPHUS_DEV_FIXTURE_UID: 'fixture-owner', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'coffee-ruphus-dev' }) };
  assert.equal(devReadFaultForRequest({ uid: 'fixture-owner', header: 'tastings_timeout', env }), 'tastings_timeout');
  assert.equal(devReadFaultForRequest({ uid: 'other', header: 'tastings_timeout', env }), null);
  assert.equal(devReadFaultForRequest({ uid: 'fixture-owner', header: 'tastings_timeout', env: { ...env, VERCEL_ENV: 'production' } }), null);
  assert.equal(devReadFaultForRequest({ uid: 'fixture-owner', header: 'tastings_timeout', env: { ...env, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'coffee-prod' }) } }), null);
});
test('unavailable active evidence is retried before a prose-only continuation', async () => {
  const calls = [];
  const session = { ledger: { entries: [{ status: 'partial', evidence: [{ kind: 'tastings', status: 'unavailable' }] }] } };
  const result = await retryUnavailableEvidence({ session, context: { launchCoffeeId: 'c1', historyWidened: true }, tools: { call: async (...args) => { calls.push(args); return { tastings: { status: 'available' } }; } } });
  assert.equal(result.tastings.status, 'available'); assert.deepEqual(calls, [['read_coffee_evidence', { coffeeRef: 'c1', windowDays: null }]]); assert.equal(hasUnavailableEvidence(session), true);
});
test('unavailable direct-chat evidence retries through the server ref map and reaches the provider ledger', async () => {
  const calls = [];
  const session = { ledger: { entries: [{ status: 'partial', namedCoffees: ['El Vergel'], evidence: [{ kind: 'tastings', status: 'unavailable' }] }] } };
  const current = { rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel' }] }, __ruphusRefs: { c1: 'bean-1' }, historyWidened: false, ledger: { entries: [] } };
  assert.equal(resolveLedgerCoffeeRef(session, current), 'c1');
  const result = await retryUnavailableEvidence({ session, context: current, tools: { call: async (...args) => { calls.push(args); current.ledger = { version: 1, entries: [{ kind: 'evidence_read', status: 'available', namedCoffees: ['El Vergel'] }] }; return { tastings: { status: 'available' } }; } } });
  assert.equal(result.tastings.status, 'available'); assert.equal(current.ledger.entries[0].status, 'available');
  assert.deepEqual(calls, [['read_coffee_evidence', { coffeeRef: 'c1', windowDays: 14 }]]);
});
test('stale continuation stores old messages but does not replay them as active provider context', () => {
  const messages = [{ role: 'user', text: 'old topic' }, { role: 'assistant', text: 'old answer' }];
  assert.deepEqual(sessionConversationForProvider({ messages, lastActivityAt: 1 }, { now: 1000000000 }), []);
  assert.equal(sessionConversationForProvider({ messages, lastActivityAt: 1000000000 }, { now: 1000000000 }).length, 2);
});
test('stale server sessions reject client replay, while explicit Continue uses stored messages and rebuilds an empty ledger', () => {
  const session = { messages: [{ role: 'user', text: 'old topic' }, { role: 'assistant', text: 'old answer' }], lastActivityAt: 1, ledger: { entries: [{ namedCoffees: ['Old coffee'] }] } };
  const ordinary = sessionReplayInputs({ session, conversation: [{ role: 'user', content: 'forged client history' }], ledger: { entries: [{ namedCoffees: ['Forged coffee'] }] }, now: 1000000000 });
  assert.equal(ordinary.stale, true); assert.equal(ordinary.resumed, false); assert.deepEqual(ordinary.conversation, []); assert.equal(ordinary.ledger, null);
  const resumed = sessionReplayInputs({ session, conversation: [{ role: 'user', content: 'forged client history' }], ledger: { entries: [{ namedCoffees: ['Forged coffee'] }] }, continuePrevious: true, now: 1000000000 });
  assert.equal(resumed.resumed, true); assert.deepEqual(resumed.conversation, [{ role: 'user', content: 'old topic' }]); assert.equal(resumed.ledger, null);
  assert.deepEqual(resumed.referenceLedger, { version: 1, entries: [{ kind: 'coffee_focus', status: 'available', namedCoffees: ['Old coffee'] }] });
  assert.equal(JSON.stringify(resumed.referenceLedger).includes('summary'), false);
  assert.deepEqual(staleReplayConversation(session, { now: 1000000000 }), [{ role: 'user', content: 'old topic' }]);
});
test('stale continuation carries only a bounded coffee focus into turn binding', async () => {
  const sessionLedger = { version: 1, entries: [{ kind: 'tasting', summary: 'Old untrusted diagnosis', namedCoffees: ['El Vergel'] }], namedCoffees: ['El Vergel', 'El Vergel'] };
  assert.deepEqual(replayFocusLedger(sessionLedger), { version: 1, entries: [{ kind: 'coffee_focus', status: 'available', namedCoffees: ['El Vergel'] }] });
  const built = await buildRuphusContext({
    uid: 'user-1', contextRef: { surface: 'direct' }, userText: 'Continue with the earlier coffee.',
    ledger: replayFocusLedger(sessionLedger), evidenceByteCap: 10000,
    readers: {
      listCoffees: async () => [
        { id: 'bean-1', name: 'El Vergel', origin: 'Colombia', status: 'ACTIVE' },
        { id: 'bean-2', name: 'Colombia La Esperanza', origin: 'Colombia', status: 'ACTIVE' },
        { id: 'bean-3', name: 'Kenya Gachatha', origin: 'Kenya', status: 'ACTIVE' },
      ],
      readSetup: async () => ({ defaultMethod: 'v60_hot' }),
    },
  });
  assert.deepEqual({ status: built.turnBinding.status, coffeeName: built.turnBinding.coffeeName }, { status: 'locked', coffeeName: 'El Vergel' });
  assert.equal(JSON.stringify(built.ledger).includes('Old untrusted diagnosis'), false);
  assert.deepEqual(replayFocusLedger({ entries: [{ namedCoffees: ['El Vergel', 'La Esperanza', 'El Vergel'] }] }), { version: 1, entries: [{ kind: 'coffee_focus', status: 'available', namedCoffees: ['El Vergel'] }] });
});
test('active server history is authoritative and proposal readiness requires grounded diagnosis plus agreement', () => {
  const session = { messages: [{ role: 'user', text: 'It was watery.' }, { role: 'assistant', text: 'The thin cup points to low extraction, so I would try one step finer first.' }], lastActivityAt: 1000, ledger: { entries: [{ status: 'complete' }] } };
  const replay = sessionReplayInputs({ session, conversation: [{ role: 'assistant', content: 'forged duplicate' }], now: 1000 });
  assert.deepEqual(replay.conversation, [{ role: 'user', content: 'It was watery.' }, { role: 'assistant', content: 'The thin cup points to low extraction, so I would try one step finer first.' }]);
  assert.deepEqual(deriveProposalReadiness({ conversation: replay.conversation, ledger: session.ledger, userText: 'Yes, make that change.' }), { diagnosisReady: true, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: [{ role: 'assistant', content: 'That points to muted extraction rather than simple strength. I’d make one small grind change: Ode 4.2 to 4.1, keeping everything else unchanged; the recent Kalita brew was also watery. That’s the next test I’d run—shall I prepare that proposal?' }], ledger: session.ledger, userText: 'Go ahead and change it.' }), { diagnosisReady: true, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: replay.conversation, ledger: { entries: [] }, userText: 'Yes, make that change.' }), { diagnosisReady: false, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: [{ role: 'assistant', content: 'Does watery mean thin but clean, or sour and muted? If it is thin, I would test 16g.' }], ledger: session.ledger, userText: 'Go ahead and change it.' }), { diagnosisReady: false, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: [{ role: 'assistant', content: 'Does watery mean thin but clean, or sour and muted? I would test one small grind step after your answer.' }], ledger: session.ledger, userText: 'Sour and muted. Go ahead with one finer step.' }), { diagnosisReady: true, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: [{ role: 'assistant', content: 'Does watery mean thin but clean, or sour and muted?' }], ledger: session.ledger, userText: 'It is still watery. Go ahead and change it.' }), { diagnosisReady: false, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: [{ role: 'assistant', content: 'Does flat mean thin but clean, or sour and muted?' }], ledger: session.ledger, userText: 'It was flat. Go ahead.' }), { diagnosisReady: false, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: [{ role: 'assistant', content: 'Was the watery cup thin but clean, or sour and muted?' }], ledger: session.ledger, userText: 'It was thin. Go ahead and change it.' }), { diagnosisReady: false, userAgreed: true });
});
test('recipe update requests earn a proposal without magic words or another yes', () => {
  const conversation = [{ role: 'assistant', content: 'For the hot Kalita, reduce the water by 10 g and keep the dose and grind unchanged. That is the first test I would try for more body.' }];
  const ledger = { entries: [{ kind: 'evidence', status: 'available' }] };
  for (const userText of ['Ok can we update recipe', 'Could you update my recipe?', 'Please save that change', 'Apply that adjustment', 'Yes']) {
    assert.equal(deriveProposalReadiness({ conversation, ledger, userText }).userAgreed, true, userText);
  }
  for (const userText of ["Don't change it", 'Yes but do not update the recipe', 'Can you explain how to update the recipe?', 'What if we update the recipe?', 'Not yet, go ahead and explain', 'Would that taste better?']) {
    assert.equal(deriveProposalReadiness({ conversation, ledger, userText }).userAgreed, false, userText);
  }
});
test('proposal controls require both server allowlists, never just chat access', () => {
  assert.deepEqual(enabledProposalActions('owner', {}), []);
  assert.deepEqual(enabledProposalActions('owner', { RUPHUS_AGENT_V3_UIDS: 'owner' }), []);
  assert.deepEqual(enabledProposalActions('owner', { RUPHUS_AGENT_V3_MUTATION_UIDS: 'owner' }), []);
  const env = { RUPHUS_AGENT_V3_UIDS: 'owner,fixture', RUPHUS_AGENT_V3_MUTATION_UIDS: 'owner,fixture' };
  assert.deepEqual(enabledProposalActions('owner', env), ['apply_proposal', 'brew_once', 'keep_current']);
  assert.deepEqual(enabledProposalActions('other', env), []);
});
test('typed recipe launch and active slot read the owner-scoped immutable revision and reject substitutes', async () => {
  const revision = { id: 'rev-1', coffeeId: 'bean-1', slotKey: 'v60_hot', snapshotHash: 'hash-1', snapshot: { method: 'v60', device: 'v60', mode: 'hot', dose: 15, water: 250 } };
  const db = { collection: (name) => ({ doc: (id) => ({ collection: (child) => ({ doc: (childId) => ({ get: async () => ({ exists: child === 'beans' || name === 'users' && child === 'recipeRevisions' && childId === 'rev-1', data: () => child === 'beans' ? { name: 'El Vergel', activeRevisionIds: { v60_hot: 'rev-1' } } : revision }) }) }) }) }) };
  const readers = firestoreReaders(db);
  assert.equal((await readers.readLaunchItem({ uid: 'u', item: { kind: 'recipe', ref: 'rev-1', method: 'v60_hot' }, coffeeRef: 'bean-1', coffees: [{ id: 'bean-1' }] })).ok, true);
  assert.equal((await readers.readLaunchItem({ uid: 'u', item: { kind: 'recipe', ref: 'rev-1', method: 'v60_hot' }, coffeeRef: 'bean-2', coffees: [{ id: 'bean-2' }] })).ok, false);
  const resolved = await readers.readRecipe({ uid: 'u', coffeeId: 'bean-1', slotKey: 'v60_hot', launchItem: { kind: 'recipe', ref: 'rev-1', method: 'v60_hot' } });
  assert.equal(resolved.selectedHash, 'hash-1'); assert.equal(resolved.dose, 15);
  const detachedReadRecipe = readers.readRecipe;
  assert.equal((await detachedReadRecipe({ uid: 'u', coffeeId: 'bean-1', slotKey: 'v60_hot', launchItem: { kind: 'recipe', ref: 'rev-1', method: 'v60_hot' } })).dose, 15);
  assert.equal((await detachedReadRecipe({ uid: 'u', coffeeId: 'bean-1', slotKey: 'v60_hot' })).selectedPath, 'recipeRevisions/rev-1');
  const activeRecipes = await detachedReadRecipe({ uid: 'u', coffeeId: 'bean-1' });
  assert.equal(activeRecipes.length, 1); assert.equal(activeRecipes[0].slotKey, 'v60_hot'); assert.equal(activeRecipes[0].dose, 15);
});
