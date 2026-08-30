import assert from 'node:assert/strict';
import test from 'node:test';
import { appendLedger, buildRotationSnapshot, readCoffeeEvidence } from '../api/_lib/ruphusEvidence.js';

test('snapshot is compact, ref-keyed, and carries setup plus jars', () => {
  const snapshot = buildRotationSnapshot({ setup: { defaultMethod: 'v60_hot', grinder: 'Ode 4.2', units: 'metric' }, coffees: [{ id: 'a', name: 'El Vergel', jarSlot: 1, status: 'ACTIVE', recipes: ['v60_hot'] }, { id: 'b', name: 'Other', jarSlot: 2, status: 'ACTIVE' }] });
  assert.match(snapshot.lines[0], /Setup/); assert.equal(snapshot.coffees.length, 2); assert.ok(Object.keys(snapshot.refs).length === 2); assert.ok(snapshot.lines.length <= 12);
});
test('ledger evicts oldest entries and composite reads run in parallel with scoped outage', async () => {
  let started = 0;
  const ledger = Array.from({ length: 10 }, (_, index) => ({ namedCoffees: [`Coffee ${index}`], summary: 'x'.repeat(100) })).reduce(appendLedger, { entries: [], namedCoffees: [] });
  assert.ok(ledger.entries.length <= 8);
  const evidence = await readCoffeeEvidence({ uid: 'u', coffeeId: 'a', readers: { readCoffee: async () => ({ name: 'El Vergel' }), readRecipe: async () => { started += 1; return [{ slot: 'v60_hot', dose: 15 }]; }, readBrews: async () => { started += 1; return []; }, readTastings: async () => { started += 1; throw Object.assign(new Error('down'), { code: 'offline' }); } } });
  assert.equal(started, 3); assert.equal(evidence.tastings.status, 'unavailable'); assert.match(evidence.tastings.summary, /couldn't check/);
});
