import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { trialReceiptsForSession } from '../api/ruphus-agent.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';

test('current conversation selects its exact trial, not another trial or an old chat', async () => {
  const receipt = { id: 'receipt-new', type: 'action_receipt', mode: 'brew_once', attemptId: 'new', coffeeId: 'coffee', slotKey: 'kalita_hot' };
  const session = { lastActivityAt: 1000, boundaryIndex: 0, messages: [{ artifacts: [receipt] }] };
  const context = { rotationSnapshot: { refs: { c1: 'coffee' }, coffees: [] } };
  Object.defineProperty(context, '__ruphusTrialReceipts', { value: trialReceiptsForSession(session, { now: 1001 }) });
  assert.equal(JSON.stringify(context).includes('receipt-new'), false);
  assert.deepEqual(trialReceiptsForSession({ ...session, boundaryIndex: 1 }, { now: 1001 }), []);
  assert.deepEqual(trialReceiptsForSession(session, { now: 9 * 86400000 }), []);
  let canonicalReceipt = { ...receipt, ownerId: 'owner' };
  const tools = createRuphusTools({ uid: 'owner', context, readers: {
    readAttempts: async () => ['old', 'new'].map(id => ({ id, ownerId: 'owner', coffeeId: 'coffee', slotKey: 'kalita_hot', proposalId: 'proposal', status: 'timer_started', snapshot: { coffeeGrams: 13, waterGrams: 205 } })),
    readTrialReceipt: async () => canonicalReceipt,
  } });
  const recovered = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', trialRef: null });
  assert.equal(recovered.artifact.attemptId, 'new');
  canonicalReceipt = { ...canonicalReceipt, id: 'different' };
  assert.equal((await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' })).ok, false);
});

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

test('trial review keeps the exact promoted Switch attempt after Save then Undo', async () => {
  const sourceConfiguration = { device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot' };
  const sourceRecipe = (sourceId, dose) => generateManualSourceTechniqueOption(sourceId, {}, { ...sourceConfiguration, dose }).recipe;
  const hybrid = sourceRecipe('hario-switch-03-matt-winton-hybrid-24-2022', 16);
  const olderImmersion = sourceRecipe('hario-switch-03-instruction-manual-36-2023', 36);
  const currentImmersion = sourceRecipe('hario-switch-03-instruction-manual-36-2023', 16);
  const attempts = [
    { id: 'trial-hybrid', ownerId: 'owner', coffeeId: 'coffee', slotKey: 'v60_hot', proposalId: 'proposal-hybrid', revisionId: 'revision-hybrid', sourceHash: 'hash-hybrid', status: 'completed', snapshot: hybrid },
    { id: 'trial-old-immersion', ownerId: 'owner', coffeeId: 'coffee', slotKey: 'v60_hot', proposalId: 'proposal-old-immersion', revisionId: 'revision-old-immersion', sourceHash: 'hash-old-immersion', status: 'completed', snapshot: olderImmersion },
    { id: 'trial-current-immersion', ownerId: 'owner', coffeeId: 'coffee', slotKey: 'v60_hot', proposalId: 'proposal-current-immersion', revisionId: 'revision-current-immersion', promotedRevisionId: 'revision-current-immersion', status: 'completed', snapshot: currentImmersion },
  ];
  const currentReceipt = { id: 'receipt-current-immersion', ownerId: 'owner', actionId: 'action-current-immersion', mode: 'brew_once', attemptId: 'trial-current-immersion', coffeeId: 'coffee', slotKey: 'v60_hot' };
  const context = {
    rotationSnapshot: { refs: { c1: 'coffee' }, coffees: [{ refKey: 'c1', name: 'El Vergel' }] },
    __ruphusTrialReceipts: [{ id: currentReceipt.id, attemptId: currentReceipt.attemptId, coffeeId: currentReceipt.coffeeId, slotKey: currentReceipt.slotKey }],
  };
  let writes = 0;
  const tools = createRuphusTools({ uid: 'owner', context, proposalActions: ['apply_proposal'], proposalStore: () => { writes += 1; }, readers: {
    readAttempts: async () => attempts,
    readTrialReceipt: async () => currentReceipt,
  } });

  const review = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(review.ok, true);
  assert.equal(review.artifact.attemptId, 'trial-current-immersion');
  assert.equal(review.artifact.recipe.coffeeGrams, 16);
  assert.equal(review.artifact.recipe.waterMilliliters, 195.56);
  assert.equal(review.artifact.promoteAvailable, false);
  assert.match(review.artifact.message, /previously saved/);
  assert.equal(writes, 0);

  const frames = [];
  const turn = await runRuphusTurn({ turnId: 'review-promoted', context: {}, userText: 'Show my trial recipe', tools,
    provider: { runTurn: async () => ({ toolCalls: [{ callId: 'review', name: 'review_trial_recipe', args: { coffeeRef: 'c1', slot: 'v60_hot', trialRef: null } }], usage: { input_tokens: 10, output_tokens: 10 } }) },
    emit: frame => frames.push(frame),
  });
  assert.equal(turn.ok, true);
  assert.doesNotMatch(turn.text, /Make this my recipe|to save it/);
  assert.match(turn.text, /exact trial recipe for review/);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);

  context.__ruphusTrialReceipts = [];
  const ambiguous = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.candidates.length, 3);
  assert.ok(ambiguous.candidates.some((candidate) => candidate.recipe.waterMilliliters === 195.56));
  assert.equal(writes, 0);
});
