import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';

test('trial review recovers the stored recipe and confirmation without a model mutation', async () => {
  const trial = { id: 'trial', ownerId: 'owner', coffeeId: 'coffee', slotKey: 'kalita_hot', proposalId: 'proposal', revisionId: 'revision', sourceHash: 'hash', status: 'created', snapshot: { coffeeGrams: 13, waterGrams: 205 } };
  let attempts = [trial]; let receiptOwner = 'owner'; let writes = 0;
  const tools = createRuphusTools({ uid: 'owner', context: { rotationSnapshot: { refs: { c1: 'coffee' }, coffees: [{ refKey: 'c1', name: 'Colombia' }] } }, proposalActions: ['apply_proposal'], proposalStore: () => { writes++; }, readers: {
    readAttempts: async () => attempts,
    readTrialReceipt: async () => ({ id: 'receipt', ownerId: receiptOwner, actionId: 'action', mode: 'brew_once', attemptId: 'trial', coffeeId: 'coffee', slotKey: 'kalita_hot' }),
  } });
  const review = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(review.ok, true);
  assert.equal(review.artifact.recipe.waterGrams, 205);
  assert.equal(review.artifact.promoteAvailable, true);
  assert.equal(review.artifact.attemptId, 'trial');
  assert.equal(writes, 0);
  assert.equal((await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'v60_hot' })).ok, false);
  receiptOwner = 'other';
  assert.equal((await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' })).ok, false);
  receiptOwner = 'owner'; attempts = [trial, { ...trial, id: 'second' }];
  assert.equal((await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' })).artifact, undefined);
  await assert.rejects(tools.call('review_trial_recipe', { coffeeRef: 'foreign', slot: 'kalita_hot' }), /owner-scoped/);
  assert.equal(writes, 0);
});
