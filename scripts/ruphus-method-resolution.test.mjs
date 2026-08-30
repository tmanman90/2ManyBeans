import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMethod } from '../src/lib/ruphus/methodResolver.js';

test('method priority prefers explicit and temporary launch hints', () => {
  assert.equal(resolveMethod({ userText: 'use the Kalita', launchItem: { method: 'aiden' }, coffeeRef: 'a', launchCoffeeRef: 'a' }).slot, 'kalita_hot');
  assert.equal(resolveMethod({ userText: 'use hot Kalita' }).slot, 'kalita_hot');
  assert.equal(resolveMethod({ userText: 'the hot one', recipes: ['v60_iced'] }).slot, 'v60_hot');
  assert.equal(resolveMethod({ launchItem: { method: 'kalita_hot' }, coffeeRef: 'a', launchCoffeeRef: 'a' }).tier, 'M1b');
  assert.equal(resolveMethod({ launchItem: { method: 'kalita_hot' }, coffeeRef: 'b', launchCoffeeRef: 'a', recipes: ['aiden'] }).tier, 'M3');
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
