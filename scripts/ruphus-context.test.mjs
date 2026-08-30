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
