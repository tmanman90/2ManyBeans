import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryCommandStore } from '../api/_lib/ruphusCommandService.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { applyRuphusTastingState } from '../api/ruphus-tasting.js';

function setup() {
  const store = createMemoryCommandStore({ uid: 'user-1' });
  const recipe = generateV60Recipe({}, { dose: 15 });
  store.seedBean('bean-1', { id: 'bean-1', ownerId: 'user-1', handBrewRecipes: { v60: recipe }, handBrewRecipe: recipe });
  return { store, recipe };
}

test('Apply creates one active revision and idempotent replay does not duplicate it', () => {
  const { store, recipe } = setup();
  const replaced = store.execute({ actionId: 'replace-1', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe });
  store.seedProposal({ id: 'proposal-1', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: replaced.revision.id, sourceHash: replaced.revision.snapshotHash, after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: 98 } }, status: 'proposed' });
  const result = store.execute({ actionId: 'apply-1', mode: 'apply_proposal', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-1', expectedRevisionId: replaced.revision.id });
  const replay = store.execute({ actionId: 'apply-1', mode: 'apply_proposal', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-1', expectedRevisionId: replaced.revision.id });
  assert.equal(result.revision.id, replay.revision.id);
  assert.equal(store.snapshot().revisions.filter((item) => item.source === 'apply').length, 1);
  assert.equal(store.snapshot().receipts.filter((item) => item.actionId === 'apply-1').length, 1);
  assert.throws(() => store.execute({ actionId: 'apply-1', mode: 'apply_proposal', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-1', expectedRevisionId: 'different' }), /idempotency/i);
});

test('Brew once preserves the active projection and binds the exact proposal snapshot', () => {
  const { store, recipe } = setup();
  const replaced = store.execute({ actionId: 'replace-2', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe });
  store.seedProposal({ id: 'proposal-2', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: replaced.revision.id, sourceHash: replaced.revision.snapshotHash, after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: 97 } }, status: 'proposed' });
  const result = store.execute({ actionId: 'brew-1', mode: 'brew_once', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-2', expectedRevisionId: replaced.revision.id });
  assert.equal(result.attempt.snapshot.waterTemp.celsius, 97);
  assert.equal(store.getBean('bean-1').activeRevisionIds['v60_hot'], replaced.revision.id);
});

test('Undo rejects stale revision and restores only the targeted slot', () => {
  const { store, recipe } = setup();
  const replaced = store.execute({ actionId: 'replace-3', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe });
  assert.throws(() => store.execute({ actionId: 'undo-stale', mode: 'undo_revision', coffeeId: 'bean-1', slotKey: 'v60_hot', expectedRevisionId: replaced.revision.parentId, }), /stale/i);
  const undone = store.execute({ actionId: 'undo-1', mode: 'undo_revision', coffeeId: 'bean-1', slotKey: 'v60_hot', expectedRevisionId: replaced.revision.id });
  assert.equal(undone.receipt.mode, 'undo_revision');
  assert.equal(undone.revision.snapshotHash, store.snapshot().revisions.find((item) => item.id === replaced.revision.parentId).snapshotHash);
});

test('Keep current is a no-change, idempotent proposal closure', () => {
  const { store, recipe } = setup();
  const current = store.execute({ actionId: 'keep-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe }).revision;
  store.seedProposal({ id: 'proposal-keep', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: current.id, sourceHash: current.snapshotHash, after: recipe, status: 'proposed' });
  const first = store.execute({ actionId: 'keep-1', mode: 'keep_current', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-keep' });
  const replay = store.execute({ actionId: 'keep-1', mode: 'keep_current', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-keep' });
  assert.equal(first.receipt.id, replay.receipt.id);
  assert.equal(store.snapshot().revisions.length, 2);
});

test('Aiden link compatibility writes retain relay state through the command seam', () => {
  const { store, recipe } = setup();
  store.execute({ actionId: 'link-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe });
  store.seedBean('bean-2', { id: 'bean-2', ownerId: 'user-1', aidenRecipe: { method: 'aiden', device: 'aiden', mode: 'hot' } });
  store.execute({ actionId: 'link-1', mode: 'set_aiden_link', coffeeId: 'bean-2', slotKey: 'aiden', link: 'https://example.test/aiden', patch: { aidenLink: 'https://example.test/aiden', aidenUsedRelay: true } });
  assert.equal(store.getBean('bean-2').aidenUsedRelay, true);
});

test('Iced map writers resolve dotted legacy fields into the canonical slot projection', () => {
  const { store, recipe } = setup();
  const iced = generateV60IcedRecipe({}, { dose: 15 });
  store.seedBean('bean-iced', { id: 'bean-iced', ownerId: 'user-1', handBrewRecipes: { v60: recipe }, handBrewIcedRecipes: { v60: iced } });
  const result = store.execute({ actionId: 'iced-1', mode: 'replace_active_recipe', coffeeId: 'bean-iced', slotKey: 'v60_iced', recipe: iced, patch: { 'handBrewIcedRecipes.v60': iced } });
  assert.equal(result.bean.handBrewIcedRecipes.v60.mode, 'iced');
  assert.equal(result.bean['handBrewIcedRecipes.v60'], undefined);
});

test('A tasted Brew-once attempt can be promoted only after provenance transition', () => {
  const { store, recipe } = setup();
  const current = store.execute({ actionId: 'promote-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe }).revision;
  store.seedProposal({ id: 'proposal-promote', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: current.id, sourceHash: current.snapshotHash, after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: 96 } }, status: 'proposed' });
  const brewed = store.execute({ actionId: 'promote-brew', mode: 'brew_once', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-promote' });
  assert.throws(() => store.execute({ actionId: 'promote-too-soon', mode: 'promote_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: brewed.attempt.id }), /tasted/);
  const tasting = applyRuphusTastingState({ attempt: brewed.attempt, tastingId: 'tasting-promote', coffeeId: 'bean-1', sensory: { notes: 'balanced' } });
  store.seedAttempt({ ...brewed.attempt, ...tasting.attempt });
  const promoted = store.execute({ actionId: 'promote-1', mode: 'promote_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: brewed.attempt.id, expectedRevisionId: current.id });
  assert.equal(promoted.revision.snapshot.waterTemp.celsius, 96);
});
