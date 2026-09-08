import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { sanitizeEvidence } from '../src/lib/ruphus/sanitizeEvidence.js';

test('long restored conversations fit the provider budget without deleting transcript or latest exchange', async () => {
  const conversation = Array.from({ length: 20 }, (_, i) => [
    { role: 'user', content: `Earlier question ${i}. ${'Coffee conversation. '.repeat(8)}` },
    { role: 'assistant', content: `Earlier answer ${i}. ${'Coffee advice. '.repeat(8)}` },
  ]).flat();
  conversation.push({ role: 'user', content: 'Use the Kalita recipe.' }, { role: 'assistant', content: 'Keep the dose unchanged and reduce water by 10 g.' });
  const original = structuredClone(conversation);
  const ledger = { entries: [{ kind: 'coffee_focus', status: 'available', namedCoffees: ['Colombia'] }] };
  const context = await buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct' }, userText: 'Actually use jar 3 with v60', conversation, ledger, evidenceByteCap: 4096,
    readers: { listCoffees: async () => [{ id: 'coffee-3', name: 'Kenya', jarSlot: 3, status: 'ACTIVE' }] } });
  assert.deepEqual(conversation, original);
  assert.deepEqual(context.conversation.slice(-2), original.slice(-2));
  assert.ok(context.conversation.length < conversation.length);
  assert.equal(context.conversation[0].role, 'user');
  assert.equal(context.turnBinding.coffeeName, 'Kenya');
  assert.equal(context.methodBinding.slot, 'v60_hot');
  assert.equal(sanitizeEvidence({ userText: context.userText, launchContext: context.launchContext, conversation: context.conversation, ledger: context.ledger }, { maxBytes: 4096 }).truncated, false);
});

test('context accepts direct and typed launch clues without preloading record-shaped evidence', async () => {
  const owners = [];
  const context = await buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct' }, userText: 'What should I brew?', evidenceByteCap: 10000, readers: { listCoffees: async ({ uid }) => { owners.push(uid); return [{ id: 'coffee-1', name: 'El Vergel', jarSlot: 1, status: 'ACTIVE', recipes: ['v60_hot'] }]; }, readSetup: async () => ({ defaultMethod: 'v60_hot', grinder: 'Ode 4.2', units: 'metric' }) } });
  assert.deepEqual(owners, ['u1']); assert.equal(context.launchContext.surface, 'direct'); assert.equal(context.launchCoffeeId, null); assert.match(context.rotationSnapshot.text, /El Vergel/); assert.equal(context.recipe, undefined);
});
test('history compaction reserves the latest exchange ahead of older UTF-8 memory', async () => {
  const conversation = [{ role: 'user', content: 'I used the Kalita.' }, { role: 'assistant', content: 'Reduce water by 10 g.' }];
  const ledger = { entries: Array.from({ length: 4 }, () => ({ kind: 'tastings', status: 'available', summary: '☕'.repeat(220) })) };
  const original = structuredClone(ledger);
  const context = await buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct' }, userText: 'Yes', conversation, ledger, evidenceByteCap: 1024, readers: { listCoffees: async () => [] } });
  assert.deepEqual(context.conversation, conversation);
  assert.deepEqual(ledger, original);
  assert.equal(sanitizeEvidence({ userText: context.userText, launchContext: context.launchContext, conversation: context.conversation, ledger: context.ledger }, { maxBytes: 1024 }).truncated, false);
});
test('oversized current requests still fail closed instead of silently changing user intent', async () => {
  await assert.rejects(buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct' }, userText: '☕'.repeat(2000), evidenceByteCap: 4096, readers: { listCoffees: async () => [] } }), { code: 'evidence_too_large' });
});
test('context rejects legacy cage fields and forged owner hints', async () => {
  const readers = { listCoffees: async () => [] };
  await assert.rejects(() => buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct', slotKey: 'v60_hot' }, readers }), /not valid/);
  await assert.rejects(() => buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct', ownerId: 'evil' }, readers }), /server-bound/);
});
test('context keeps raw refs server-side and carries validated session state', async () => {
  const context = await buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct', coffeeRef: 'coffee-1', launchItem: { kind: 'brew', ref: 'brew-1' } }, userText: 'older brew', conversation: [{ role: 'user', content: 'older brew' }], sessionState: { lastActivityAt: 1, boundaryIndex: 0, launchHintConsumed: true, olderReference: true }, evidenceByteCap: 10000, readers: { listCoffees: async () => [{ id: 'coffee-1', name: 'El Vergel', jarSlot: 1, status: 'ACTIVE', recipes: ['v60_hot'] }], readSetup: async () => ({ defaultMethod: 'v60_hot', grinder: 'Ode', units: 'metric' }), readLaunchItem: async ({ coffeeRef }) => { assert.equal(coffeeRef, 'coffee-1'); return { ok: true }; } } });
  assert.equal(context.rotationSnapshot.refs, undefined); assert.doesNotMatch(JSON.stringify(context.rotationSnapshot), /coffee-1/); assert.equal(context.sessionState.launchHintConsumed, true); assert.equal(context.historyWidened, true); assert.equal(Object.values(context.__ruphusRefs).includes('coffee-1'), true);
});
test('launch coffee outside the three-line rotation snapshot gets an owner-scoped opaque ref', async () => {
  const context = await buildRuphusContext({ uid: 'u1', contextRef: { surface: 'bean_card', coffeeRef: 'coffee-4' }, evidenceByteCap: 10000, readers: { listCoffees: async () => Array.from({ length: 4 }, (_, index) => ({ id: `coffee-${index + 1}`, name: `Coffee ${index + 1}`, jarSlot: index + 1, status: 'ACTIVE' })), readSetup: async () => ({}) } });
  assert.match(context.launchCoffeeId, /^c/); assert.equal(context.__ruphusRefs[context.launchCoffeeId], 'coffee-4'); assert.doesNotMatch(JSON.stringify(context.rotationSnapshot), /coffee-4/);
});
test('direct chat locks an explicitly named brewer ahead of the saved default and carries corrections', async () => {
  const readers = {
    listCoffees: async () => [{ id: 'coffee-1', name: 'Colombia La Esperanza', jarSlot: 1, status: 'ACTIVE' }],
    readSetup: async () => ({ defaultMethod: 'aiden', grinder: 'Ode' }),
  };
  const first = await buildRuphusContext({
    uid: 'u1',
    contextRef: { surface: 'direct' },
    userText: 'I tried the Colombia in jar 1 with the Kalita 155 recipe and it tasted watery.',
    evidenceByteCap: 4096,
    readers,
  });
  assert.equal(first.turnBinding.coffeeName, 'Colombia La Esperanza');
  assert.deepEqual(first.methodBinding, { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita', source: 'M1' });
  assert.equal(first.ledger.entries.some((entry) => entry.kind === 'method_focus' && entry.methodFocus?.displayName === 'hot Kalita'), true);

  const correction = await buildRuphusContext({
    uid: 'u1',
    contextRef: { surface: 'direct' },
    userText: "Huh no, I didn't brew this on Aiden.",
    conversation: [{ role: 'user', content: 'I used the Kalita 155 recipe.' }],
    ledger: first.ledger,
    evidenceByteCap: 4096,
    readers,
  });
  assert.equal(correction.methodBinding.slot, 'kalita_hot');
});
