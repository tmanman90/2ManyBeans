import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';

test('context accepts direct and typed launch clues without preloading record-shaped evidence', async () => {
  const owners = [];
  const context = await buildRuphusContext({ uid: 'u1', contextRef: { surface: 'direct' }, userText: 'What should I brew?', evidenceByteCap: 10000, readers: { listCoffees: async ({ uid }) => { owners.push(uid); return [{ id: 'coffee-1', name: 'El Vergel', jarSlot: 1, status: 'ACTIVE', recipes: ['v60_hot'] }]; }, readSetup: async () => ({ defaultMethod: 'v60_hot', grinder: 'Ode 4.2', units: 'metric' }) } });
  assert.deepEqual(owners, ['u1']); assert.equal(context.launchContext.surface, 'direct'); assert.equal(context.launchCoffeeId, null); assert.match(context.rotationSnapshot.text, /El Vergel/); assert.equal(context.recipe, undefined);
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
