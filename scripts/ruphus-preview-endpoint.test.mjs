import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { validateRecipePreviewRequest } from '../src/lib/ruphus/contracts.js';
import { createMemoryRuphusRepository, persistRecipePreview } from '../api/_lib/ruphusRepository.js';
import { isAgentAccessAllowed } from '../api/_lib/ruphusRollout.js';
import { RATE_LIMIT } from '../api/_lib/claudeShared.js';
import { handleRecipePreview } from '../api/ruphus-preview.js';

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
  const sourceIntent = createRecipePreview({ recipe: source, dose: 13, ratio: 15 });
  const sourceProposal = repository.createProposal({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', after: sourceIntent, proposalId: 'source-proposal' });
  const preview = createRecipePreview({ recipe: sourceProposal.after, dose: 20 });
  const first = repository.createPreview({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', sourceProposalId: sourceProposal.id, requestId: 'request-1', after: preview, previewKey: 'latest-dose-20', previewDose: 20, previewRatio: preview.ratio, previewConfiguration: {} });
  const replay = repository.createPreview({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', sourceProposalId: sourceProposal.id, requestId: 'request-1', after: preview, previewKey: 'latest-dose-20', previewDose: 20, previewRatio: preview.ratio, previewConfiguration: {} });
  assert.equal(first.id, replay.id);
  assert.equal(first.previewVersion, 'ruphus-recipe-preview-v1');
  assert.equal(repository.getBean(uid, 'coffee').handBrewRecipes.kalita.coffeeGrams, 13);
  assert.equal(repository.getBean(uid, 'coffee').handBrewRecipes.kalita.waterGrams, 208);
  assert.equal(first.before.waterGrams, 208);
  assert.equal(repository.getProposal(uid, first.id).after.coffeeGrams, 20);
  assert.equal(repository.getProposal(uid, first.id).after.waterGrams, 300);
  assert.throws(() => repository.createPreview({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', sourceProposalId: sourceProposal.id, requestId: 'request-1', after: source, previewKey: 'request-reused', previewDose: 13, previewRatio: source.ratio, previewConfiguration: {} }), /request id was reused/i);
}

// Firestore persistence uses the canonical active revision for lineage while
// projecting from a reviewed proposal whose intent already changed the ratio.
{
  const uid = 'firestore-owner';
  const source = generateKalitaRecipe({}, { size: '155', dose: 13 });
  const sourceIntent = createRecipePreview({ recipe: source, dose: 13, ratio: 15 });
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { id: 'coffee', ownerId: uid, handBrewRecipes: { kalita: source } });
  const sourceProposal = repository.createProposal({ uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', after: sourceIntent, proposalId: 'source-proposal' });
  const snapshot = repository.snapshot();
  const root = `users/${uid}`;
  const data = new Map();
  data.set(`${root}/beans/coffee`, snapshot.beans[0]);
  data.set(`${root}/proposals/${sourceProposal.id}`, sourceProposal);
  const revision = snapshot.revisions.find((item) => item.id === sourceProposal.sourceRevisionId);
  data.set(`${root}/recipeRevisions/${revision.id}`, revision);
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => { const value = data.get(path); return { exists: data.has(path), id: path.split('/').at(-1), data: () => structuredClone(value) }; },
    where: (field, operator, value) => ({ kind: 'query', collectionPath: path, filters: [{ field, operator, value }], where(nextField, nextOperator, nextValue) { return { kind: 'query', collectionPath: path, filters: [...this.filters, { field: nextField, operator: nextOperator, value: nextValue }], where: this.where }; } }),
  });
  const readField = (value, field) => field.split('.').reduce((current, key) => current?.[key], value);
  const db = {
    collection: (name) => ref(name),
    runTransaction: async (callback) => {
      const pending = [];
      const tx = {
        get: async (target) => {
          if (target.kind === 'query') {
            const prefix = `${target.collectionPath}/`;
            const docs = [...data.entries()]
              .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
              .map(([path, value]) => ({ id: path.split('/').at(-1), ref: ref(path), data: () => structuredClone(value) }))
              .filter((doc) => target.filters.every(({ field, operator, value }) => operator === '==' && readField(doc.data(), field) === value));
            return { docs };
          }
          const value = data.get(target.path);
          return { exists: data.has(target.path), id: target.id, data: () => structuredClone(value) };
        },
        create: (target, value) => { assert.equal(data.has(target.path), false); pending.push([target.path, structuredClone(value)]); },
        set: (target, value) => pending.push([target.path, structuredClone(value)]),
        update: (target, value) => pending.push([target.path, { ...(data.get(target.path) || {}), ...structuredClone(value) }]),
      };
      const result = await callback(tx);
      pending.forEach(([path, value]) => data.set(path, value));
      return result;
    },
  };
  const preview = createRecipePreview({ recipe: sourceProposal.after, dose: 20 });
  const derived = await persistRecipePreview({
    db, uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', after: preview,
    previewKey: 'firestore-preview', previewDose: 20, previewRatio: preview.ratio,
    sourceRevisionId: sourceProposal.sourceRevisionId, sourceHash: sourceProposal.sourceHash,
    sourceProposalId: sourceProposal.id, requestId: 'firestore-request', now: () => '2026-09-08T00:00:00.000Z',
  });
  assert.equal(derived.before.waterGrams, 208);
  assert.equal(derived.after.waterGrams, 300);
  assert.equal(data.get(`${root}/beans/coffee`).handBrewRecipes.kalita.waterGrams, 208);
  await assert.rejects(() => persistRecipePreview({
    db, uid, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', after: preview,
    previewKey: 'wrong-canonical', previewDose: 20, previewRatio: preview.ratio,
    sourceRevisionId: sourceProposal.sourceRevisionId, sourceHash: 'wrong-canonical',
    sourceProposalId: sourceProposal.id, requestId: 'wrong-canonical-request', now: () => '2026-09-08T00:00:01.000Z',
  }), /proposal source changed/i);

  process.env.RUPHUS_AGENT_V3_UIDS = uid;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await handleRecipePreview({ method: 'POST', body: { requestId: 'endpoint-request', proposalId: sourceProposal.id, coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', dose: 20 } }, response, { uid }, { db });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.saved, false);
  assert.equal(response.body.preview.waterGrams, 300);
  assert.equal(response.body.proposal.before.waterGrams, 208);
  delete process.env.RUPHUS_AGENT_V3_UIDS;
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

// Preview access reuses the existing agent allowlist; no separate preview UID
// environment can widen access.
assert.equal(isAgentAccessAllowed({ uid: 'u1', rawUids: 'u1' }), true);
assert.equal(isAgentAccessAllowed({ uid: 'u2', rawUids: 'u1' }), false);

const endpoint = await readFile(new URL('../api/ruphus-preview.js', import.meta.url), 'utf8');
assert.match(endpoint, /createRecipePreview\(/);
assert.match(endpoint, /persistRecipePreview\(/);
assert.match(endpoint, /handleRecipePreview/);
assert.match(endpoint, /claudeShared\.js/);
assert.match(endpoint, /rateLimit: RATE_LIMIT/);
assert.deepEqual(RATE_LIMIT, { key: 'claude', limit: 120, windowMs: 60 * 60 * 1000 });
assert.match(endpoint, /saved: false/);
assert.match(endpoint, /preview_recipe_is_server_bound/);

console.log('Ruphus preview endpoint contract passed');
