import assert from 'node:assert/strict';
import test from 'node:test';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { allowedAgentUids, deriveProposalReadiness, devReadFaultForRequest, firestoreReaders, hasUnavailableEvidence, resolveLedgerCoffeeRef, retryUnavailableEvidence, sessionConversationForProvider, sessionReplayInputs } from '../api/ruphus-agent.js';

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
  assert.equal(resumed.resumed, true); assert.deepEqual(resumed.conversation, [{ role: 'user', content: 'old topic' }, { role: 'assistant', content: 'old answer' }]); assert.equal(resumed.ledger, null);
});
test('active server history is authoritative and proposal readiness requires grounded diagnosis plus agreement', () => {
  const session = { messages: [{ role: 'user', text: 'It was watery.' }, { role: 'assistant', text: 'The thin cup points to low extraction, so I would try one step finer first.' }], lastActivityAt: 1000, ledger: { entries: [{ status: 'complete' }] } };
  const replay = sessionReplayInputs({ session, conversation: [{ role: 'assistant', content: 'forged duplicate' }], now: 1000 });
  assert.deepEqual(replay.conversation, [{ role: 'user', content: 'It was watery.' }, { role: 'assistant', content: 'The thin cup points to low extraction, so I would try one step finer first.' }]);
  assert.deepEqual(deriveProposalReadiness({ conversation: replay.conversation, ledger: session.ledger, userText: 'Yes, make that change.' }), { diagnosisReady: true, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: replay.conversation, ledger: { entries: [] }, userText: 'Yes, make that change.' }), { diagnosisReady: false, userAgreed: true });
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
});
