import assert from 'node:assert/strict';
import test from 'node:test';
import { explicitMethodFromText, explicitMethodVariantFromText, resolveMethod } from '../src/lib/ruphus/methodResolver.js';

test('method priority prefers explicit and temporary launch hints', () => {
  assert.equal(resolveMethod({ userText: 'use the Kalita', launchItem: { method: 'aiden' }, coffeeRef: 'a', launchCoffeeRef: 'a' }).slot, 'kalita_hot');
  assert.equal(resolveMethod({ userText: 'use hot Kalita' }).slot, 'kalita_hot');
  assert.equal(resolveMethod({ userText: 'the hot one', recipes: ['v60_iced'] }).slot, 'v60_hot');
  assert.equal(resolveMethod({ launchItem: { method: 'kalita_hot' }, coffeeRef: 'a', launchCoffeeRef: 'a' }).tier, 'M1b');
  assert.equal(resolveMethod({ launchItem: { method: 'kalita_hot' }, coffeeRef: 'b', launchCoffeeRef: 'a', recipes: ['aiden'] }).tier, 'M3');
});
test('natural brewer mentions bind directly while negated brewers never become the target', () => {
  assert.equal(explicitMethodFromText('I used the Kalita 155 recipe today.'), 'kalita_hot');
  assert.equal(explicitMethodFromText('My V60 tasted thin.'), 'v60_hot');
  assert.equal(explicitMethodFromText("Huh no, I didn't brew this on Aiden."), null);
  assert.equal(explicitMethodFromText('Not Aiden—I used the Kalita 155.'), 'kalita_hot');
  assert.equal(explicitMethodFromText('It tasted thin but sweet and clean, not sour with the hot Kalita recipe.'), 'kalita_hot');
});
test('explicit Switch equipment wins across multiple saved slots while switch-to remains a coffee verb', () => {
  const multiRecipeInput = {
    recipeSlots: ['aiden', 'v60_hot', 'kalita_hot', 'kalita_iced'],
    recipes: [
      { slotKey: 'aiden' },
      { slotKey: 'v60_hot', variant: 'switch' },
      { slotKey: 'kalita_hot' },
      { slotKey: 'kalita_iced' },
    ],
    defaultMethod: 'aiden',
    coffeeRef: 'c1',
  };
  assert.equal(explicitMethodVariantFromText('Try a different Switch technique for El Vergel'), 'switch');
  assert.equal(explicitMethodFromText('Try a different Switch technique for El Vergel'), 'v60_hot');
  assert.deepEqual(resolveMethod({ ...multiRecipeInput, userText: 'Try a different Switch technique for El Vergel' }), { slot: 'v60_hot', displayName: 'hot Switch', tier: 'M1' });
  assert.equal(explicitMethodFromText('Show me an iced Switch recipe'), 'v60_iced');

  assert.equal(explicitMethodVariantFromText('Switch to Jar 2'), null);
  assert.equal(explicitMethodFromText('Switch to Jar 2'), null);
  const coffeeSwitch = resolveMethod({ ...multiRecipeInput, userText: 'Switch to Jar 2' });
  assert.notEqual(coffeeSwitch.slot, 'v60_hot');
  assert.notEqual(coffeeSwitch.tier, 'M1');
});
test('method inference applies recent agreement, iced mode, and M6 ask', () => {
  assert.equal(resolveMethod({ brews: [{ slot: 'v60_iced' }, { slot: 'v60_iced' }], isChangeRequest: true }).slot, 'v60_iced');
  assert.equal(resolveMethod({ recipes: ['v60_iced'] }).slot, 'v60_iced');
  const ask = resolveMethod({ recipes: ['kalita_hot', 'v60_hot'], isChangeRequest: true });
  assert.equal(ask.tier, 'M6'); assert.deepEqual(ask.ask.map((item) => item.slot), ['kalita_hot', 'v60_hot']);
});
test('M4 general questions choose the most recently evidenced recipe, never array order', () => {
  const result = resolveMethod({
    userText: 'How did this recipe go?',
    recipes: [
      { slot: 'v60_hot', updatedAt: '2026-08-01T00:00:00Z' },
      { slot: 'kalita_hot', updatedAt: '2026-08-20T00:00:00Z' },
    ],
    now: Date.parse('2026-08-30T00:00:00Z'),
  });
  assert.equal(result.tier, 'M4'); assert.equal(result.slot, 'kalita_hot');
});
test('explicit mode correction never falls through to opposite recorded mode', () => {
  const result = resolveMethod({ userText: 'Actually, I used hot', brews: [{ slot: 'v60_iced' }], recipes: ['v60_iced'] });
  assert.notEqual(result.slot, 'v60_iced'); assert.equal(result.ask?.length ?? 0, 0);
});
test('launch hint is one-shot and stays dropped on later return', () => {
  const result = resolveMethod({ launchItem: { method: 'kalita_hot' }, launchCoffeeRef: 'a', coffeeRef: 'a', launchHintConsumed: true, recipes: ['v60_iced'] });
  assert.equal(result.slot, 'v60_iced'); assert.notEqual(result.tier, 'M1b');
});
test('trusted method focus carries same-coffee continuity but yields to correction or switch', () => {
  const carried = resolveMethod({ methodFocus: { displayName: 'hot Kalita' }, methodFocusCoffeeRef: 'a', coffeeRef: 'a', launchHintConsumed: true, recipes: ['v60_hot'], brews: [{ slot: 'v60_hot' }] });
  assert.equal(carried.slot, 'kalita_hot'); assert.equal(carried.tier, 'M2');
  assert.equal(resolveMethod({ methodFocus: { displayName: 'hot Kalita' }, methodFocusCoffeeRef: 'a', coffeeRef: 'a', userText: 'make it iced', launchHintConsumed: true }).slot, 'kalita_iced');
  const corrected = resolveMethod({ methodFocus: { displayName: 'hot Kalita' }, methodFocusCoffeeRef: 'a', coffeeRef: 'a', userText: 'Actually, I used the V60.', methodCorrected: true, launchHintConsumed: true, recipes: ['v60_hot'] });
  assert.notEqual(corrected.slot, 'kalita_hot');
  const switched = resolveMethod({ methodFocus: { displayName: 'hot Kalita' }, methodFocusCoffeeRef: 'a', coffeeRef: 'b', launchHintConsumed: true, recipes: ['v60_hot'] });
  assert.notEqual(switched.slot, 'kalita_hot');
});

test('Switch equipment identity survives the shared V60 slot and the next turn', () => {
  const explicit = resolveMethod({ userText: 'What about jar 1 on my Switch 03', recipes: ['v60_hot', 'kalita_hot'] });
  assert.equal(explicit.slot, 'v60_hot');
  assert.equal(explicit.displayName, 'hot Switch 03');
  const carried = resolveMethod({ userText: 'Why that one?', methodFocus: { displayName: explicit.displayName }, methodFocusCoffeeRef: 'a', coffeeRef: 'a' });
  assert.equal(carried.slot, 'v60_hot');
  assert.equal(carried.displayName, 'hot Switch 03');
  assert.equal(resolveMethod({ userText: 'Actually classic V60', methodFocus: { displayName: explicit.displayName } }).displayName, 'hot V60');
  assert.equal(resolveMethod({ userText: 'make it iced', methodFocus: { displayName: explicit.displayName } }).displayName, 'iced Switch 03');
});
