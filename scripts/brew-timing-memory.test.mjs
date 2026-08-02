import assert from 'node:assert/strict';
import {
  TIMING_MEMORY_LIMIT, buildTimingEvent, formatTimingMs, mergeTimingEvent,
  normalizeTimingHistory, selectTimingMemory, timingContextFromRecipe,
} from '../src/lib/brewTimingMemory.js';

const recipe = {
  device: 'kalita', kalitaSize: '155', coffeeGrams: 15,
  totalBrewTimeSeconds: 240, engineVersion: 'kalita-v1', rulesVersion: 'r1', candidate: true,
};
const context = timingContextFromRecipe({ beanId: 'bombe', recipe });
const sample = (sessionId, overrides = {}) => ({
  sessionId, beanId: 'bombe', device: 'kalita', kalitaSize: '155', mode: 'hot',
  doseGrams: 15, actualElapsedMs: 182000, targetMs: 240000,
  completionKind: 'manualEarly', createdAt: 1000, lineage: context.lineage,
  ...overrides,
});

// Compact events retain the immutable, actual configuration that ran.
{
  const event = buildTimingEvent(sample('manual'));
  assert.equal(event.completionKind, 'manualEarly');
  assert.equal(event.lineage.profile, 'kalita-v1:r1');
  assert.equal(event.actualElapsedMs, 182000);
  assert.ok(buildTimingEvent(sample('natural', { completionKind: 'natural' })));
  assert.ok(buildTimingEvent(sample('finished', { completionKind: 'userFinished' })));
}

// Bad, missing, and duplicate legacy data is harmless rather than becoming a
// false completion record.
{
  assert.deepEqual(normalizeTimingHistory(undefined), []);
  assert.deepEqual(normalizeTimingHistory([{ nope: true }]), []);
  assert.equal(mergeTimingEvent([sample('one')], sample('one')).length, 1);
  assert.equal(mergeTimingEvent([], sample('bad', { targetMs: Infinity })).length, 0);
  assert.equal(mergeTimingEvent([], sample('bad', { actualElapsedMs: -1 })).length, 0);
  assert.equal(mergeTimingEvent([], sample('bad', { completionKind: 'abandoned' })).length, 0);
}

// The cap only evicts the oldest event, never a newly written one.
{
  const history = Array.from({ length: TIMING_MEMORY_LIMIT + 1 }, (_, index) =>
    sample(`s${index}`, { createdAt: index })
  );
  const merged = mergeTimingEvent(history, sample('new', { createdAt: 999 }));
  assert.equal(merged.length, TIMING_MEMORY_LIMIT);
  assert.equal(merged[0].sessionId, 'new');
  assert.equal(merged.at(-1).sessionId, 's2');
}

// Exact configuration is the only source for learning. A same-bean different
// dose is labeled context, and skipped samples never train the range.
{
  const one = selectTimingMemory([sample('one')], context);
  assert.equal(one.isExactDose, true);
  assert.equal(one.range, null);
  const three = selectTimingMemory([
    sample('one', { actualElapsedMs: 180000, createdAt: 1 }),
    sample('two', { actualElapsedMs: 182000, createdAt: 2, completionKind: 'natural' }),
    sample('three', { actualElapsedMs: 184000, createdAt: 3 }),
    sample('skip', { actualElapsedMs: 999000, createdAt: 4, completionKind: 'skipped' }),
  ], context);
  assert.deepEqual(three.range, { minMs: 180000, maxMs: 184000, medianMs: 182000, sampleCount: 3 });
  assert.equal(selectTimingMemory([sample('skip-only', { completionKind: 'skipped' })], context), null);
  const crossDose = selectTimingMemory([sample('twenty', { doseGrams: 20 })], context);
  assert.equal(crossDose.isExactDose, false);
  assert.equal(crossDose.event.doseGrams, 20);
  assert.equal(crossDose.range, null);
  assert.equal(selectTimingMemory([sample('other', { beanId: 'other' })], context), null);
  assert.equal(selectTimingMemory([sample('iced', { mode: 'iced' })], context), null);
  assert.equal(selectTimingMemory([sample('185', { kalitaSize: '185' })], context), null);
  assert.equal(selectTimingMemory([sample('legacy', { lineage: { profile: 'legacy' } })], context), null);
  assert.equal(selectTimingMemory([sample('stale-source', { lineage: { ...context.lineage, sourceContextHash: 'old' } })], {
    ...context,
    lineage: { ...context.lineage, sourceContextHash: 'new' },
  }), null);
}

assert.equal(formatTimingMs(182000), '3:02');
console.log('brew timing memory passed');
