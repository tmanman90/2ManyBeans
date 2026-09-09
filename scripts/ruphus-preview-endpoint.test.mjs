import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { validateRecipePreviewRequest } from '../src/lib/ruphus/contracts.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { isRecipePreviewAllowed } from '../api/_lib/ruphusRollout.js';

// The request carries configuration only. A recipe snapshot, owner identity,
// or arbitrary action payload is never accepted as preview input.
{
  const shape = validateRecipePreviewRequest({ requestId: 'r1', proposalId: 'p1', coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', dose: 20, intent: {}, recipe: {} });
  assert.equal(shape.valid, false);
  assert.ok(shape.errors.some((error) => /server-bound/.test(error)));
  assert.equal(validateRecipePreviewRequest({ requestId: 'r1', proposalId: 'p1', coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', dose: 20, ratio: '1:16' }).valid, false);
}

// Preparation is non-mutating, owner-scoped, and replayable by its preview key.
{
  const uid = 'preview-owner';
  const source = generateKalitaRecipe({}, { size: '155', dose: 13 });
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { id: 'coffee', ownerId: uid, handBrewRecipes: { kalita: source } });
  const sourceProposal = repository.createProposal({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', after: source, proposalId: 'source-proposal' });
  const preview = createRecipePreview({ recipe: sourceProposal.after, dose: 20 });
  const first = repository.createPreview({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', sourceProposalId: sourceProposal.id, after: preview, previewKey: 'latest-dose-20', previewDose: 20, previewRatio: preview.ratio, previewConfiguration: {} });
  const replay = repository.createPreview({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', sourceProposalId: sourceProposal.id, after: preview, previewKey: 'latest-dose-20', previewDose: 20, previewRatio: preview.ratio, previewConfiguration: {} });
  assert.equal(first.id, replay.id);
  assert.equal(first.previewVersion, 'ruphus-recipe-preview-v1');
  assert.equal(repository.getBean(uid, 'coffee').handBrewRecipes.kalita.coffeeGrams, 13);
  assert.equal(repository.getBean(uid, 'coffee').handBrewRecipes.kalita.waterGrams, 208);
  assert.equal(repository.getProposal(uid, first.id).after.coffeeGrams, 20);
}

// A stale base revision cannot be rebound to a newly prepared preview.
{
  const uid = 'preview-owner';
  const source = generateKalitaRecipe({}, { size: '155', dose: 13 });
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { id: 'coffee', ownerId: uid, handBrewRecipes: { kalita: source } });
  const sourceProposal = repository.createProposal({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', after: source, proposalId: 'source-proposal' });
  const preview = createRecipePreview({ recipe: sourceProposal.after, dose: 20 });
  const changed = { ...source, waterGrams: 207 };
  repository.seedBean(uid, { id: 'coffee', ownerId: uid, handBrewRecipes: { kalita: changed } });
  assert.throws(() => repository.createPreview({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', sourceProposalId: sourceProposal.id, after: preview, previewKey: 'stale', sourceHash: 'old-hash', previewDose: 20, previewRatio: preview.ratio }), /saved recipe changed/i);
}

// Preview rollout is an allowlisted capability and does not widen mutation UID
// access implicitly.
assert.equal(isRecipePreviewAllowed({ uid: 'u1', rawUids: 'u1', rawPreviewUids: 'u1' }), true);
assert.equal(isRecipePreviewAllowed({ uid: 'u2', rawUids: 'u1', rawPreviewUids: 'u2' }), false);

const endpoint = await readFile(new URL('../api/ruphus-preview.js', import.meta.url), 'utf8');
assert.match(endpoint, /createRecipePreview\(/);
assert.match(endpoint, /persistRecipePreview\(/);
assert.match(endpoint, /saved: false/);
assert.match(endpoint, /preview_recipe_is_server_bound/);

console.log('Ruphus preview endpoint contract passed');
