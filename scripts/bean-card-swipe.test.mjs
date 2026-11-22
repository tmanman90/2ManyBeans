import test from 'node:test';
import assert from 'node:assert/strict';
import { lockSwipeAxis, resolveCardSwipe } from '../src/lib/cardSwipe.js';

const still = { x: 0, y: 0 };
const neighbors = { hasPrev: true, hasNext: true };

test('axis stays open until the finger has moved far enough', () => {
  assert.equal(lockSwipeAxis({ x: -6, y: 4 }), null);
  assert.equal(lockSwipeAxis({ x: 10, y: -10 }), null);
});

test('axis follows the dominant direction, even when y has passed the lock distance', () => {
  assert.equal(lockSwipeAxis({ x: -25, y: 11 }), 'x');
  assert.equal(lockSwipeAxis({ x: 40, y: -12 }), 'x');
  assert.equal(lockSwipeAxis({ x: 6, y: 14 }), 'y');
  assert.equal(lockSwipeAxis({ x: 12, y: 12 }), 'y');
});

test('a left swipe that arcs downward goes to the next bean and never closes the card', () => {
  const action = resolveCardSwipe({ axis: 'x', offset: { x: -128, y: 180 }, velocity: { x: -200, y: 900 }, ...neighbors });
  assert.equal(action, 'next');
});

test('a right swipe that arcs downward goes to the previous bean', () => {
  const action = resolveCardSwipe({ axis: 'x', offset: { x: 128, y: 180 }, velocity: { x: 200, y: 900 }, ...neighbors });
  assert.equal(action, 'prev');
});

test('an arced swipe with no neighbor snaps back instead of closing the card', () => {
  const action = resolveCardSwipe({ axis: 'x', offset: { x: -128, y: 180 }, velocity: { x: -200, y: 900 }, hasPrev: true, hasNext: false });
  assert.equal(action, null);
});

test('a downward swipe that drifts sideways still closes the card', () => {
  const action = resolveCardSwipe({ axis: 'y', offset: { x: -150, y: 120 }, velocity: still, ...neighbors });
  assert.equal(action, 'dismiss');
});

test('thresholds are unchanged', () => {
  assert.equal(resolveCardSwipe({ axis: 'x', offset: { x: -90, y: 0 }, velocity: still, ...neighbors }), null);
  assert.equal(resolveCardSwipe({ axis: 'x', offset: { x: -91, y: 0 }, velocity: still, ...neighbors }), 'next');
  assert.equal(resolveCardSwipe({ axis: 'x', offset: { x: 20, y: 0 }, velocity: { x: 501, y: 0 }, ...neighbors }), 'prev');
  assert.equal(resolveCardSwipe({ axis: 'y', offset: { x: 0, y: 110 }, velocity: still, ...neighbors }), null);
  assert.equal(resolveCardSwipe({ axis: 'y', offset: { x: 0, y: 111 }, velocity: still, ...neighbors }), 'dismiss');
  assert.equal(resolveCardSwipe({ axis: 'y', offset: { x: 0, y: 20 }, velocity: { x: 0, y: 651 }, ...neighbors }), 'dismiss');
});
