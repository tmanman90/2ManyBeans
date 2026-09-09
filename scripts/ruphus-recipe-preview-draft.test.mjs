import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clearRecipePreviewDraft, readRecipePreviewDraft, recipePreviewDraftKey, restoreRecipePreviewAction, writeRecipePreviewDraft } from '../src/lib/ruphus/recipePreviewDraft.js';
import { resolveRuphusActionRequest } from '../src/lib/ruphusActionIdentity.js';

const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test('recipe preview drafts are owner and proposal scoped', () => {
  const target = storage();
  const saved = writeRecipePreviewDraft({ uid: 'owner-a', proposalId: 'proposal-1', coffeeId: 'coffee-1', slotKey: 'v60_hot', dose: 20, sourceRevisionId: 'revision-1', sourceHash: 'hash-1', configuration: { grinder: 'ode' }, storage: target });
  assert.equal(saved.ownerUid, 'owner-a');
  assert.equal(readRecipePreviewDraft({ uid: 'owner-a', proposalId: 'proposal-1', storage: target }).dose, 20);
  assert.equal(readRecipePreviewDraft({ uid: 'owner-b', proposalId: 'proposal-1', storage: target }), null);
  assert.equal(readRecipePreviewDraft({ uid: 'owner-a', proposalId: 'proposal-2', storage: target }), null);
});

test('draft cleanup is explicit and never affects another proposal', () => {
  const target = storage();
  writeRecipePreviewDraft({ uid: 'owner-a', proposalId: 'proposal-1', coffeeId: 'coffee-1', slotKey: 'kalita_hot', dose: 13, storage: target });
  writeRecipePreviewDraft({ uid: 'owner-a', proposalId: 'proposal-2', coffeeId: 'coffee-1', slotKey: 'kalita_hot', dose: 20, storage: target });
  clearRecipePreviewDraft({ uid: 'owner-a', proposalId: 'proposal-1', storage: target });
  assert.equal(target.getItem(recipePreviewDraftKey('owner-a', 'proposal-1')), null);
  assert.equal(readRecipePreviewDraft({ uid: 'owner-a', proposalId: 'proposal-2', storage: target }).dose, 20);
});

test('response-loss retries keep the prepared proposal and action identity', () => {
  const chat = readFileSync(new URL('../src/tabs/ChatTab.jsx', import.meta.url), 'utf8');
  assert.match(chat, /let preparedProposal = current\.preparedProposal/);
  assert.match(chat, /proposalId: sourceArtifact\.id/);
  assert.match(chat, /sessionId: previewSessionId/);
  assert.match(chat, /clearRecipePreviewDraft\(\{ uid, proposalId: \(current\.sourceArtifact \|\| current\.artifact\)\.id \}/);

  const values = new Map();
  const prepared = { id: 'prepared-1', type: 'recipe_proposal', coffeeId: 'coffee-1', slotKey: 'kalita_hot', sourceRevisionId: 'revision-1' };
  const first = resolveRuphusActionRequest({ uid: 'owner-a', mode: 'brew_once', artifact: prepared, storage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) }, idFactory: () => 'action-1' });
  const retry = resolveRuphusActionRequest({ uid: 'owner-a', mode: 'brew_once', artifact: prepared, storage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) }, idFactory: () => 'action-2' });
  assert.equal(first.request.proposalId, 'prepared-1');
  assert.equal(retry.request.actionId, 'action-1');
  assert.equal(retry.request.proposalId, first.request.proposalId);
});

test('relaunch restores a prepared action without preparing or mutating on mount', () => {
  const target = storage();
  const sourceArtifact = { id: 'source-1', type: 'recipe_proposal', coffeeId: 'coffee-1', slotKey: 'kalita_hot', sessionId: 'proposal-turn-1', sourceRevisionId: 'revision-1', sourceHash: 'hash-1', after: { coffeeGrams: 13, waterGrams: 195, ratio: '1:15' } };
  const preview = { coffeeGrams: 20, waterGrams: 300, ratio: '1:15' };
  writeRecipePreviewDraft({ uid: 'owner-a', proposalId: sourceArtifact.id, coffeeId: sourceArtifact.coffeeId, slotKey: sourceArtifact.slotKey, dose: 20, sourceRevisionId: sourceArtifact.sourceRevisionId, sourceHash: sourceArtifact.sourceHash, requestId: 'preview-request-1', preparedProposalId: 'prepared-1', preparedSourceRevisionId: 'revision-1', preparedSourceHash: 'hash-1', pendingAction: 'brew_once', actionId: 'action-1', storage: target });

  let prepareCalls = 0;
  const reopen = () => {
    const draft = readRecipePreviewDraft({ uid: 'owner-a', proposalId: sourceArtifact.id, storage: target });
    const action = restoreRecipePreviewAction({ draft, sourceArtifact, preview });
    if (!action) prepareCalls += 1;
    return action;
  };
  const restored = reopen();
  assert.equal(prepareCalls, 0);
  assert.equal(restored.id, 'prepared-1');
  assert.equal(restored.actionId, 'action-1');
  assert.equal(restored.mode, 'brew_once');
  assert.equal(restored.sessionId, 'proposal-turn-1');
  assert.equal(restored.after, preview);
  assert.equal(readRecipePreviewDraft({ uid: 'owner-b', proposalId: sourceArtifact.id, storage: target }), null);
});
