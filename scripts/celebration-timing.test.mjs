// The close-time rule behind every celebration sheet (useCelebrationClose).
// The sheets themselves are tested mounted: scripts/verify-celebration-sheets.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { celebrationCloseAt } from '../src/lib/celebrationTiming.js';

const FINISH_BAG = { afterPlayMs: 2200, maxMs: 4000 };

test('the sheet stays up 2.2 s after the clip starts playing', () => {
  assert.equal(celebrationCloseAt({ shownAt: 1000, playedAt: 1100 }, FINISH_BAG), 3300);
  assert.equal(celebrationCloseAt({ shownAt: 1000, playedAt: 2500 }, FINISH_BAG), 4700);
});

test('the sheet never stays past 4 s from open, played or not', () => {
  assert.equal(celebrationCloseAt({ shownAt: 1000, playedAt: null }, FINISH_BAG), 5000);
  assert.equal(celebrationCloseAt({ shownAt: 1000, playedAt: undefined }, FINISH_BAG), 5000);
  assert.equal(celebrationCloseAt({ shownAt: 1000, playedAt: 3500 }, FINISH_BAG), 5000);
});
