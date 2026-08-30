import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCoffeeReference } from '../src/lib/ruphus/referenceResolver.js';

const coffees = [
  { id: 'a', refKey: 'c-a', name: 'El Vergel', roaster: 'Good Medicine', origin: 'Colombia', jarSlot: 1 },
  { id: 'b', refKey: 'c-b', name: 'Colombia La Esperanza', roaster: 'Good Medicine', origin: 'Colombia', jarSlot: 2 },
];
test('resolver handles unique jar, close spelling, and ambiguity', () => {
  assert.equal(resolveCoffeeReference({ reference: 'jar #1', coffees }).coffee.id, 'a');
  assert.equal(resolveCoffeeReference({ reference: 'El Virgil', coffees }).coffee.id, 'a');
  const ambiguous = resolveCoffeeReference({ reference: 'the Colombian one', coffees });
  assert.equal(ambiguous.ok, false); assert.equal(ambiguous.reason, 'ambiguous'); assert.equal(ambiguous.candidates.length, 2);
});
test('pronouns use only named ledger coffees and do not guess without one', () => {
  const ledger = { namedCoffees: [{ id: 'a', refKey: 'c-a', name: 'El Vergel' }, { id: 'b', refKey: 'c-b', name: 'La Esperanza' }] };
  assert.equal(resolveCoffeeReference({ reference: 'that one', coffees: [], ledger }).coffee.id, 'b');
  assert.equal(resolveCoffeeReference({ reference: 'the first one', coffees: [], ledger }).ok, true);
  assert.equal(resolveCoffeeReference({ reference: 'that one', coffees: [] }).ok, false);
});
