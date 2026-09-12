import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe, generateV60RecipeForTechnique } from '../src/lib/v60Adapter.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { validateRecipePreviewRequest } from '../src/lib/ruphus/contracts.js';
import { createMemoryRuphusRepository, persistRecipePreview } from '../api/_lib/ruphusRepository.js';
import { executeRecipeCommand } from '../api/_lib/ruphusCommandService.js';
import { isAgentAccessAllowed } from '../api/_lib/ruphusRollout.js';
import { RATE_LIMIT } from '../api/_lib/claudeShared.js';
import { handleRecipePreview } from '../api/ruphus-preview.js';
import { Firestore } from '@google-cloud/firestore';

// The request carries configuration only. A recipe snapshot, owner identity,
// or arbitrary action payload is never accepted as preview input.
{
  const shape = validateRecipePreviewRequest({ requestId: 'r1', proposalId: 'p1', coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', dose: 20, intent: {}, recipe: {} });
  assert.equal(shape.valid, false);
  assert.ok(shape.errors.some((error) => /server-bound/.test(error)));
  assert.equal(validateRecipePreviewRequest({ requestId: 'r1', proposalId: 'p1', coffeeId: 'coffee', slotKey: 'kalita_hot', sessionId: 's', dose: 20, ratio: '1:16' }).valid, false);
}

// A versioned source proposal is reconstructed from its trusted source
// identity before a dose preview. The source's native mL fields remain mL;
// the endpoint never accepts a client-supplied projection as authority.
{
  const uid = 'source-preview-owner';
  const baseRecipe = generateV60RecipeForTechnique('hoffmann-one-cup-v1', { targetRatio: 15 }, { dose: 20, grinder: 'fellow-ode-gen2' });
  const source = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023', {}, { dose: 36 }).recipe;
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, { id: 'coffee', ownerId: uid, handBrewRecipes: { v60: baseRecipe } });
  const sourceProposal = repository.createProposal({ uid, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'source-session', after: source, proposalId: 'source-switch-proposal' });
  const legacyDoseProposal = repository.createProposal({ uid, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'legacy-dose-session', after: baseRecipe, proposalId: 'legacy-dose-proposal' });
  const snapshot = repository.snapshot();
  const root = `users/${uid}`;
  const data = new Map([
    [`${root}/beans/coffee`, snapshot.beans[0]],
    [`${root}/proposals/${sourceProposal.id}`, sourceProposal],
    [`${root}/proposals/${legacyDoseProposal.id}`, legacyDoseProposal],
  ]);
  const revision = snapshot.revisions.find((item) => item.id === sourceProposal.sourceRevisionId);
  data.set(`${root}/recipeRevisions/${revision.id}`, revision);
  const readField = (value, field) => field.split('.').reduce((current, key) => current?.[key], value);
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => ({ exists: data.has(path), id: path.split('/').at(-1), data: () => structuredClone(data.get(path)) }),
    where: (field, operator, value) => ({ kind: 'query', collectionPath: path, filters: [{ field, operator, value }], where(nextField, nextOperator, nextValue) { return { kind: 'query', collectionPath: path, filters: [...this.filters, { field: nextField, operator: nextOperator, value: nextValue }], where: this.where }; } }),
  });
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
  process.env.RUPHUS_AGENT_V3_UIDS = uid;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await handleRecipePreview({ method: 'POST', body: { requestId: 'source-preview-20', proposalId: sourceProposal.id, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'source-session', dose: 20 } }, response, { uid }, { db });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.preview.coffeeGrams, 20);
  assert.equal(response.body.preview.waterMilliliters, 244.44);
  assert.equal(Object.hasOwn(response.body.preview, 'waterGrams'), false);
  assert.equal(Object.hasOwn(response.body.preview, 'ratio'), false);
  assert.equal(response.body.preview.sourceProjection.sourceId, source.sourceProjection.sourceId);
  assert.equal(response.body.preview.sourceProjection.adaptation.timingPolicy, 'ruphus-manual-source-checkpoint-v2');
  assert.equal(response.body.proposal.preview.ratio, null);
  const doseResponse = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await handleRecipePreview({ method: 'POST', body: { requestId: 'legacy-dose-preview-30', proposalId: legacyDoseProposal.id, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'legacy-dose-session', dose: 30 } }, doseResponse, { uid }, { db });
  assert.equal(doseResponse.statusCode, 200);
  assert.equal(doseResponse.body.preview.coffeeGrams, 30);
  assert.equal(doseResponse.body.preview.waterGrams, 450);
  assert.equal(doseResponse.body.preview.ratio, '1:15');
  assert.equal(doseResponse.body.preview.technique, baseRecipe.technique);
  assert.deepEqual(doseResponse.body.preview.sourceLineage.sourceIds, baseRecipe.sourceLineage.sourceIds);
  assert.equal(doseResponse.body.preview.configurationKey, baseRecipe.configurationKey);
  assert.equal(doseResponse.body.preview.grindSize.setting, baseRecipe.grindSize.setting);
  const persistedSource = data.get(`${root}/recipeRevisions/${revision.id}`).snapshot;
  assert.equal(persistedSource.coffeeGrams, baseRecipe.coffeeGrams);
  assert.equal(persistedSource.waterGrams, baseRecipe.waterGrams);
  assert.equal(persistedSource.grindSize.setting, baseRecipe.grindSize.setting);
  assert.deepEqual(persistedSource.sourceLineage.sourceIds, baseRecipe.sourceLineage.sourceIds);
  const serializer = new Firestore({ projectId: 'ruphus-source-endpoint-regression' })._serializer;
  assert.doesNotThrow(() => serializer.encodeFields(response.body.proposal));

  const wrongHardware = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await handleRecipePreview({ method: 'POST', body: { requestId: 'source-preview-wrong-size', proposalId: sourceProposal.id, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'source-session', dose: 20, sourceId: source.sourceProjection.sourceId, sourceRevision: source.sourceProjection.sourceRevision, sourceConfiguration: { size: '02' } } }, wrongHardware, { uid }, { db });
  assert.equal(wrongHardware.statusCode, 400);
  assert.equal(wrongHardware.body.error, 'source_configuration_mismatch');

  const clientProjection = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await handleRecipePreview({ method: 'POST', body: { requestId: 'source-preview-client-snapshot', proposalId: sourceProposal.id, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'source-session', dose: 20, sourceProjection: {} } }, clientProjection, { uid }, { db });
  assert.equal(clientProjection.statusCode, 400);
  assert.equal(clientProjection.body.error, 'invalid_preview_request');

  // Pre-label-fix owners may have a reviewed source projection whose typed
  // checkpoints are adapted but whose executable labels still use the source
  // wording. The endpoint accepts that exact legacy shape, then returns the
  // corrected projection without mutating the historical proposal.
  const sourceAt15 = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 15,
  }).recipe;
  const legacyProjection = structuredClone(sourceAt15.sourceProjection);
  legacyProjection.sourceExecution.stages = legacyProjection.sourceExecution.stages.map((stage, index) => ({ ...stage, label: legacyProjection.sourceSnapshot.stages[index].label }));
  legacyProjection.stages = legacyProjection.stages.map((stage, index) => ({ ...stage, label: legacyProjection.sourceSnapshot.stages[index].label }));
  legacyProjection.adaptation = {
    ...legacyProjection.adaptation,
    changes: legacyProjection.adaptation.changes.filter((change) => !/^stages\.\d+\.label$/.test(change.path)),
    disclosure: 'App-scaled typed quantities preserve native units and the source checkpoint/event anchors. Timing is an unchanged source guide at the selected dose, not a new author claim.',
  };
  const legacyRecipe = {
    ...sourceAt15,
    sourceProjection: legacyProjection,
    stages: legacyProjection.stages,
    sourceLineage: {
      ...sourceAt15.sourceLineage,
      adaptation: legacyProjection.adaptation.disclosure,
      changedFields: sourceAt15.sourceLineage.changedFields.filter((path) => !/^stages\.\d+\.label$/.test(path)),
    },
  };
  const legacyProposal = {
    ...sourceProposal,
    id: 'old-source-proposal',
    after: legacyRecipe,
  };
  data.set(`${root}/proposals/${legacyProposal.id}`, legacyProposal);
  const oldPreview = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await handleRecipePreview({ method: 'POST', body: { requestId: 'old-source-preview-16', proposalId: legacyProposal.id, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'source-session', dose: 16 } }, oldPreview, { uid }, { db });
  assert.equal(oldPreview.statusCode, 200);
  assert.equal(oldPreview.body.preview.coffeeGrams, 16);
  assert.equal(oldPreview.body.preview.waterMilliliters, 195.56);
  assert.equal(oldPreview.body.preview.sourceProjection.stages[0].label, 'With the switch closed, pour approximately 195.56mL of hot water');
  assert.equal(oldPreview.body.preview.sourceProjection.sourceSnapshot.stages[0].label, 'With the switch closed, pour approximately 440mL of hot water');
  assert.equal(data.get(`${root}/proposals/${legacyProposal.id}`).after.sourceProjection.stages[0].label, 'With the switch closed, pour approximately 440mL of hot water');

  const tamperedProposal = structuredClone(legacyProposal);
  tamperedProposal.id = 'old-source-tampered';
  tamperedProposal.after.sourceProjection.water.value += 1;
  data.set(`${root}/proposals/${tamperedProposal.id}`, tamperedProposal);
  const tamperedPreview = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await handleRecipePreview({ method: 'POST', body: { requestId: 'old-source-tampered-preview', proposalId: tamperedProposal.id, coffeeId: 'coffee', slotKey: 'v60_hot', sessionId: 'source-session', dose: 16 } }, tamperedPreview, { uid }, { db });
  assert.equal(tamperedPreview.statusCode, 400);
  assert.equal(tamperedPreview.body.error, 'source_projection_mismatch');

  const brew = await executeRecipeCommand({ db, uid, coffeeId: 'coffee', slotKey: 'v60_hot', actionId: 'old-source-brew-16', mode: 'brew_once', proposalId: oldPreview.body.proposal.id, expectedRevisionId: revision.id });
  assert.equal(brew.attempt.snapshot.coffeeGrams, 16);
  assert.equal(brew.attempt.snapshot.waterMilliliters, 195.56);
  assert.equal(brew.attempt.snapshot.sourceProjection.stages[0].label, 'With the switch closed, pour approximately 195.56mL of hot water');
  const appliedDose = await executeRecipeCommand({ db, uid, coffeeId: 'coffee', slotKey: 'v60_hot', actionId: 'legacy-dose-apply-30', mode: 'apply_proposal', proposalId: doseResponse.body.proposal.id, expectedRevisionId: revision.id });
  assert.equal(appliedDose.revision.snapshot.coffeeGrams, 30);
  assert.equal(appliedDose.revision.snapshot.waterGrams, 450);
  assert.equal(appliedDose.revision.snapshot.ratio, '1:15');
  assert.equal(appliedDose.revision.snapshot.technique, baseRecipe.technique);
  assert.deepEqual(appliedDose.revision.snapshot.sourceLineage.sourceIds, baseRecipe.sourceLineage.sourceIds);
  assert.equal(appliedDose.revision.snapshot.grindSize.setting, baseRecipe.grindSize.setting);
  delete process.env.RUPHUS_AGENT_V3_UIDS;
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
