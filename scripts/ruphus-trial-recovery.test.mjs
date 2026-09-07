import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';

test('trial review recovers the stored recipe and confirmation without a model mutation', async () => {
  const trial = { id: 'trial', ownerId: 'owner', coffeeId: 'coffee', slotKey: 'kalita_hot', proposalId: 'proposal', revisionId: 'revision', sourceHash: 'hash', status: 'created', snapshot: { coffeeGrams: 13, waterGrams: 205 } };
  let attempts = [trial]; let receiptOwner = 'owner'; let writes = 0;
  const tools = createRuphusTools({ uid: 'owner', context: { rotationSnapshot: { refs: { c1: 'coffee' }, coffees: [{ refKey: 'c1', name: 'Colombia' }] } }, proposalActions: ['apply_proposal'], proposalStore: () => { writes++; }, readers: {
    readAttempts: async () => attempts,
    readTrialReceipt: async ({ attemptId }) => ({ id: `receipt-${attemptId}`, ownerId: receiptOwner, actionId: `action-${attemptId}`, mode: 'brew_once', attemptId, coffeeId: 'coffee', slotKey: 'kalita_hot' }),
  } });
  const review = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(review.ok, true);
  assert.equal(review.artifact.recipe.waterGrams, 205);
  assert.equal(review.artifact.promoteAvailable, true);
  assert.equal(review.artifact.attemptId, 'trial');
  const frames = [];
  const turn = await runRuphusTurn({ turnId: 'recover-turn', context: {}, userText: 'Can you make that trial permanent?', tools, provider: { runTurn: async () => ({ toolCalls: [{ callId: 'review', name: 'review_trial_recipe', args: { coffeeRef: 'c1', slot: 'kalita_hot', trialRef: null } }], usage: { input_tokens: 10, output_tokens: 10 } }) }, emit: frame => frames.push(frame) });
  assert.equal(turn.ok, true);
  assert.match(turn.text, /Make this my recipe/);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
  assert.equal(writes, 0);
  assert.equal((await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'v60_hot' })).ok, false);
  receiptOwner = 'other';
  assert.equal((await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' })).ok, false);
  receiptOwner = 'owner'; attempts = [trial, { ...trial, id: 'second' }];
  const ambiguous = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(ambiguous.artifact, undefined);
  const selected = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', trialRef: ambiguous.candidates[1].trialRef });
  assert.equal(selected.artifact.attemptId, 'second');
  assert.equal((await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', trialRef: 'made-up' })).artifact, undefined);
  await assert.rejects(tools.call('review_trial_recipe', { coffeeRef: 'foreign', slot: 'kalita_hot' }), /owner-scoped/);
  assert.equal(writes, 0);
});
