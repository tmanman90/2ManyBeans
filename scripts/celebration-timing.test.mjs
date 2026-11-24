// The finish-bag celebration closes on the clip's clock, never a fixed timer:
// a slow network used to close the sheet before the fist-pump clip ever played.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('FinishBagPrompt times its close from the clip, with the 4 s cap', () => {
  const source = readFileSync(new URL('../src/components/FinishBagPrompt.jsx', import.meta.url), 'utf8');
  assert.match(source, /const CELEBRATION = \{ afterPlayMs: 2200, maxMs: 4000 \};/);
  assert.match(source, /onPlay=\{handleClipPlay\}/, 'the clip must report when it starts playing');
  assert.match(source, /celebrationCloseAt\(celebration, CELEBRATION\)/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => onClose\('Saved & finished!'\), \d+\)/, 'no fixed close timer');
});
