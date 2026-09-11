import assert from 'node:assert/strict';
import test from 'node:test';
import { bindRuphusTurn } from '../api/_lib/ruphusTurnBinder.js';
import { resolveCoffeeReference } from '../src/lib/ruphus/referenceResolver.js';

const coffees = [
  { id: 'a', refKey: 'c-a', name: 'El Vergel', roaster: 'Good Medicine', origin: 'Colombia', process: 'washed', jarSlot: 1 },
  { id: 'b', refKey: 'c-b', name: 'Colombia La Esperanza', roaster: 'Good Medicine', origin: 'Colombia', process: 'natural', jarSlot: 2 },
];
test('current recipe update follows established coffee without capturing a new target', () => {
  const context = { coffees, refs: { 'c-a': 'a', 'c-b': 'b' }, ledger: { namedCoffees: ['Colombia La Esperanza'] }, launchContext: { coffeeRef: 'c-a' } };
  for (const userText of ['Ok update the recipe', 'Please save my recipe.', 'Can we update the recipe?']) {
    assert.equal(bindRuphusTurn({ ...context, userText }).coffeeRef, 'c-b');
    assert.notEqual(bindRuphusTurn({ coffees, refs: context.refs, userText }).status, 'locked');
  }
  assert.equal(bindRuphusTurn({ ...context, userText: 'Update the recipe for an Ethiopian coffee' }).status, 'none');
  assert.equal(bindRuphusTurn({ ...context, userText: 'Update El Vergel recipe' }).coffeeRef, 'c-a');
});
test('trial recipe references retain the current coffee without inventing one', () => {
  const refs = { 'c-a': 'a', 'c-b': 'b' };
  const ledger = { namedCoffees: ['Colombia La Esperanza'] };
  for (const userText of ['Can you make that Kalita trial recipe permanent?', 'Save this trial.', 'Keep that recipe.']) {
    assert.equal(bindRuphusTurn({ userText, coffees, refs, ledger }).coffeeRef, 'c-b');
    assert.notEqual(bindRuphusTurn({ userText, coffees, refs }).status, 'locked');
  }
  assert.equal(bindRuphusTurn({ userText: 'Use El Vergel instead of that trial.', coffees, refs, ledger }).coffeeRef, 'c-a');
});
test('resolver handles unique jar, close spelling, and ambiguity', () => {
  assert.equal(resolveCoffeeReference({ reference: 'jar #1', coffees }).coffee.id, 'a');
  assert.equal(resolveCoffeeReference({ reference: 'jar one', coffees }).coffee.id, 'a');
  assert.equal(resolveCoffeeReference({ reference: 'El Virgil', coffees }).coffee.id, 'a');
  const ambiguous = resolveCoffeeReference({ reference: 'the Colombian one', coffees });
  assert.equal(ambiguous.ok, false); assert.equal(ambiguous.reason, 'ambiguous'); assert.equal(ambiguous.candidates.length, 2);
  assert.equal(resolveCoffeeReference({ reference: 'the washed one', coffees }).coffee.id, 'a');
});
test('resolver rejects a weak partial match when supplied identity details conflict', () => {
  const inventory = [
    ...coffees,
    { id: 'c', refKey: 'c-c', name: 'Kenya Gachatha', roaster: 'SEY', origin: 'Kenya', process: 'washed', jarSlot: 3 },
  ];
  assert.deepEqual(resolveCoffeeReference({ reference: 'It is a SEY coffee from Burundi.', coffees: inventory }), {
    ok: false,
    reason: 'not_found',
    candidates: [],
  });
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
  assert.equal(bindRuphusTurn({ userText: 'jar one', coffees, refs }).coffeeRef, 'c-a');
});

test('trusted binding exposes genuine bounded ambiguity without guessing', () => {
  const result = bindRuphusTurn({ userText: 'the Colombian one', coffees, refs: { 'c-a': 'a', 'c-b': 'b' } });
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.map(({ coffeeRef, coffeeName }) => ({ coffeeRef, coffeeName })), [
    { coffeeRef: 'c-a', coffeeName: 'El Vergel' },
    { coffeeRef: 'c-b', coffeeName: 'Colombia La Esperanza' },
  ]);
});

test('trusted binding carries one active descriptor constraint into the next clarification', () => {
  const refs = { 'c-a': 'a', 'c-b': 'b' };
  const ambiguous = bindRuphusTurn({ userText: 'the Colombian one', coffees, refs });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.ledger.entries.at(-1).kind, 'coffee_reference_constraint');
  const resolved = bindRuphusTurn({ userText: 'the washed one', coffees, refs, ledger: ambiguous.ledger });
  assert.deepEqual({ status: resolved.status, coffeeRef: resolved.coffeeRef, coffeeName: resolved.coffeeName }, { status: 'locked', coffeeRef: 'c-a', coffeeName: 'El Vergel' });
  assert.equal(resolved.ledger.entries.some((entry) => entry.kind === 'coffee_reference_constraint'), false);
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

test('bare technique follow-up binds only to a delivered current-session proposal', () => {
  const proposal = {
    id: 'proposal-technique', type: 'recipe_proposal', status: 'attempt_created', coffeeId: 'a', slotKey: 'v60_hot',
    before: { coffeeGrams: 15 }, after: { coffeeGrams: 15 },
    techniqueExperiment: { kind: 'v60_technique', techniqueId: 'technique-one', familyId: 'family-one', sourceId: 'source-one' },
  };
  const bound = bindRuphusTurn({ userText: 'Show me another one', coffees, refs: { 'c-a': 'a', 'c-b': 'b' }, priorTechniqueProposals: [proposal] });
  assert.equal(bound.status, 'locked');
  assert.equal(bound.coffeeRef, 'c-a');
  assert.equal(bound.techniqueSlot, 'v60_hot');
  assert.equal(bound.techniqueKind, 'v60_technique');

  const noHistory = bindRuphusTurn({ userText: 'Show me another one', coffees, refs: { 'c-a': 'a', 'c-b': 'b' } });
  assert.equal(noHistory.status, 'none');
  const proseOnly = bindRuphusTurn({
    userText: 'Show me another one', coffees, refs: { 'c-a': 'a', 'c-b': 'b' },
    priorTechniqueProposals: [{ type: 'assistant_message', coffeeId: 'a', text: 'I showed you a technique card.' }],
  });
  assert.equal(proseOnly.status, 'none');
});

test('bare technique follow-up stays unbound when retained proposals point at multiple coffees', () => {
  const proposal = (id, coffeeId) => ({
    id, type: 'recipe_proposal', status: 'proposed', coffeeId, slotKey: 'v60_hot',
    before: { coffeeGrams: 15 }, after: { coffeeGrams: 15 },
    techniqueExperiment: { kind: 'v60_technique', techniqueId: id, familyId: id, sourceId: `${id}-source` },
  });
  const result = bindRuphusTurn({
    userText: 'Show me another one', coffees, refs: { 'c-a': 'a', 'c-b': 'b' },
    priorTechniqueProposals: [proposal('one', 'a'), proposal('two', 'b')],
  });
  assert.equal(result.status, 'none');
});
