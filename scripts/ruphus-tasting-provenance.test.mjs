import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRuphusTastingState } from '../api/ruphus-tasting.js';

test('tasting provenance is bound to the immutable attempt snapshot and marks it tasted', () => {
  const attempt = { id: 'attempt-1', coffeeId: 'bean-1', revisionId: 'revision-1', snapshotHash: 'hash-1', status: 'completed', snapshot: { method: 'v60' } };
  const result = applyRuphusTastingState({ attempt, tastingId: 'tasting-1', coffeeId: 'bean-1', sensory: { scores: { acidity: 7 }, notes: 'bright' }, now: '2026-08-29T12:00:00.000Z' });
  assert.equal(result.tasting.agentProvenance.attemptId, 'attempt-1');
  assert.equal(result.tasting.agentProvenance.revisionId, 'revision-1');
  assert.equal(result.tasting.recipeSnapshotHash, 'hash-1');
  assert.equal(result.attempt.status, 'tasted');
  assert.throws(() => applyRuphusTastingState({ attempt: { ...attempt, coffeeId: 'other' }, tastingId: 'tasting-2', coffeeId: 'bean-1', sensory: {} }), /coffee/);
});
