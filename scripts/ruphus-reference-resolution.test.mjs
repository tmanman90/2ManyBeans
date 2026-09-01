import assert from 'node:assert/strict';
import test from 'node:test';
import { bindRuphusTurn } from '../api/_lib/ruphusTurnBinder.js';
import { resolveCoffeeReference } from '../src/lib/ruphus/referenceResolver.js';

const coffees = [
  { id: 'a', refKey: 'c-a', name: 'El Vergel', roaster: 'Good Medicine', origin: 'Colombia', process: 'washed', jarSlot: 1 },
  { id: 'b', refKey: 'c-b', name: 'Colombia La Esperanza', roaster: 'Good Medicine', origin: 'Colombia', process: 'natural', jarSlot: 2 },
];
test('resolver handles unique jar, close spelling, and ambiguity', () => {
  assert.equal(resolveCoffeeReference({ reference: 'jar #1', coffees }).coffee.id, 'a');
  assert.equal(resolveCoffeeReference({ reference: 'El Virgil', coffees }).coffee.id, 'a');
  const ambiguous = resolveCoffeeReference({ reference: 'the Colombian one', coffees });
  assert.equal(ambiguous.ok, false); assert.equal(ambiguous.reason, 'ambiguous'); assert.equal(ambiguous.candidates.length, 2);
  assert.equal(resolveCoffeeReference({ reference: 'the washed one', coffees }).coffee.id, 'a');
});
test('pronouns use only named ledger coffees and do not guess without one', () => {
  const ledger = { namedCoffees: [{ id: 'a', refKey: 'c-a', name: 'El Vergel' }, { id: 'b', refKey: 'c-b', name: 'La Esperanza' }] };
  assert.equal(resolveCoffeeReference({ reference: 'that one', coffees: [], ledger }).coffee.id, 'b');
  assert.equal(resolveCoffeeReference({ reference: 'the first one', coffees: [], ledger }).ok, true);
  assert.equal(resolveCoffeeReference({ reference: 'that one', coffees: [] }).ok, false);
});
test('earlier, other, and back-to-first follow the named conversation order', () => {
  const ledger = { namedCoffees: ['El Vergel'] };
  assert.equal(resolveCoffeeReference({ reference: 'Continue with the earlier coffee.', coffees, ledger }).coffee.id, 'a');
  assert.equal(resolveCoffeeReference({ reference: 'Now the other Colombia.', coffees, ledger }).coffee.id, 'b');
  assert.equal(resolveCoffeeReference({ reference: 'back to the first one', coffees, ledger: { namedCoffees: ['El Vergel', 'Colombia La Esperanza'] } }).coffee.id, 'a');
});

test('trusted turn binding admits exact discourse references but leaves fuzzy and foreign refs to fallback', () => {
  const refs = { 'c-a': 'a', 'c-b': 'b' };
  const first = bindRuphusTurn({ userText: 'Tell me about El Vergel.', coffees, refs });
  assert.deepEqual({ status: first.status, coffeeRef: first.coffeeRef, coffeeName: first.coffeeName }, { status: 'locked', coffeeRef: 'c-a', coffeeName: 'El Vergel' });
  const other = bindRuphusTurn({ userText: 'Now the other Colombia.', coffees, refs, ledger: first.ledger });
  assert.deepEqual({ status: other.status, coffeeRef: other.coffeeRef, coffeeName: other.coffeeName }, { status: 'locked', coffeeRef: 'c-b', coffeeName: 'Colombia La Esperanza' });
  const that = bindRuphusTurn({ userText: 'that one', coffees, refs, ledger: other.ledger });
  assert.equal(that.coffeeRef, 'c-b');
  assert.equal(bindRuphusTurn({ userText: 'back to the first one', coffees, refs, ledger: other.ledger }).coffeeRef, 'c-a');
  assert.equal(bindRuphusTurn({ userText: 'El Virgil', coffees, refs }).status, 'none');
  assert.equal(bindRuphusTurn({ userText: 'jar 2', coffees: [coffees[0]], refs: { 'c-a': 'a', 'c-foreign': 'foreign' } }).status, 'none');
});

test('trusted binding exposes genuine bounded ambiguity without guessing', () => {
  const result = bindRuphusTurn({ userText: 'the Colombian one', coffees, refs: { 'c-a': 'a', 'c-b': 'b' } });
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.map(({ coffeeRef, coffeeName }) => ({ coffeeRef, coffeeName })), [
    { coffeeRef: 'c-a', coffeeName: 'El Vergel' },
    { coffeeRef: 'c-b', coffeeName: 'Colombia La Esperanza' },
  ]);
});

test('trusted turn binding seeds a valid launch coffee for current references before evidence exists', () => {
  const result = bindRuphusTurn({
    userText: 'Tell me about this coffee.',
    coffees,
    launchContext: { coffeeRef: 'c-a', surface: 'direct' },
    refs: { 'c-a': 'a', 'c-b': 'b' },
    ledger: { entries: [], namedCoffees: [] },
  });
  assert.deepEqual({ status: result.status, coffeeRef: result.coffeeRef, coffeeName: result.coffeeName }, { status: 'locked', coffeeRef: 'c-a', coffeeName: 'El Vergel' });
});
