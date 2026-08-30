import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';

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
