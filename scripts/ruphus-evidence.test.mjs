import assert from 'node:assert/strict';
import test from 'node:test';
import { appendLedger, buildRotationSnapshot, ledgerEntryFromEvidence, readCoffeeEvidence } from '../api/_lib/ruphusEvidence.js';

test('snapshot is compact, ref-keyed, and carries setup plus jars', () => {
  const snapshot = buildRotationSnapshot({ setup: { defaultMethod: 'v60_hot', grinder: 'Ode 4.2', units: 'metric' }, coffees: [{ id: 'a', name: 'El Vergel', jarSlot: 1, status: 'ACTIVE', recipes: ['v60_hot'] }, { id: 'b', name: 'Other', jarSlot: 2, status: 'ACTIVE' }] });
  assert.match(snapshot.lines[0], /Setup/); assert.equal(snapshot.coffees.length, 2); assert.ok(Object.keys(snapshot.refs).length === 2); assert.ok(snapshot.lines.length <= 12); assert.ok(snapshot.text.length <= 600);
});
test('ledger evicts oldest entries and composite reads run in parallel with scoped outage', async () => {
  let started = 0;
  const ledger = Array.from({ length: 10 }, (_, index) => ({ namedCoffees: [`Coffee ${index}`], summary: 'x'.repeat(100) })).reduce((value, entry) => appendLedger(value, entry, { maxBytes: 700 }), { entries: [], namedCoffees: [] });
  assert.ok(ledger.entries.length <= 8); assert.ok(ledger.bytes <= 700);
  const evidence = await readCoffeeEvidence({ uid: 'u', coffeeId: 'a', readers: { readCoffee: async () => ({ name: 'El Vergel' }), readRecipe: async () => { started += 1; return [{ slot: 'v60_hot', dose: 15 }]; }, readBrews: async () => { started += 1; return []; }, readTastings: async () => { started += 1; throw Object.assign(new Error('down'), { code: 'offline' }); } } });
  assert.equal(started, 3); assert.equal(evidence.tastings.status, 'unavailable'); assert.match(evidence.tastings.summary, /couldn't check/);
});
test('evidence ledger replays successful and unavailable bounded summaries without server fields', () => {
  const evidence = { windowDays: 14, unavailable: ['tastings'], coffee: { status: 'available', coffee: { id: 'firestore-secret', name: 'El Vergel', privateNote: 'no' }, summary: 'El Vergel is in your rotation.' }, tastings: { status: 'unavailable', summary: "I couldn't check tastings in the last 14 days.", windowDays: 14 } };
  const ledger = appendLedger(null, ledgerEntryFromEvidence(evidence, { coffee: evidence.coffee.coffee }));
  const serialized = JSON.stringify(ledger);
  assert.match(serialized, /couldn't check/); assert.match(serialized, /El Vergel/); assert.doesNotMatch(serialized, /firestore-secret|privateNote|records/);
});
test('null window widens history and still returns scoped evidence', async () => {
  const evidence = await readCoffeeEvidence({ uid: 'u', coffeeId: 'a', windowDays: null, now: Date.parse('2026-08-30T00:00:00Z'), readers: { readRecipe: async () => [], readBrews: async () => [], readTastings: async () => [{ id: 'old', createdAt: '2026-07-01T00:00:00Z', notes: 'berry' }] } });
  assert.equal(evidence.windowDays, null); assert.equal(evidence.tastings.status, 'available'); assert.match(evidence.tastings.summary, /berry/);
});
