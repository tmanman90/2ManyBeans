import assert from 'node:assert/strict';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60TechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { executeRecipeCommand } from '../api/_lib/ruphusCommandService.js';
import { handleRecipePreview } from '../api/ruphus-preview.js';

function firestoreFromSnapshot(snapshot, uid) {
  const root = `users/${uid}`;
  const data = new Map();
  for (const bean of snapshot.beans) data.set(`${root}/beans/${bean.id}`, structuredClone(bean));
  for (const proposal of snapshot.proposals) data.set(`${root}/proposals/${proposal.id}`, structuredClone(proposal));
  for (const revision of snapshot.revisions) data.set(`${root}/recipeRevisions/${revision.id}`, structuredClone(revision));

  const readField = (value, field) => field.split('.').reduce((current, key) => current?.[key], value);
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => {
      const value = data.get(path);
      return { exists: data.has(path), id: path.split('/').at(-1), data: () => structuredClone(value) };
    },
    where: (field, operator, value) => ({
      kind: 'query',
      collectionPath: path,
      filters: [{ field, operator, value }],
      where(nextField, nextOperator, nextValue) {
        return {
          kind: 'query',
          collectionPath: path,
          filters: [...this.filters, { field: nextField, operator: nextOperator, value: nextValue }],
          where: this.where,
        };
      },
    }),
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
        create: (target, value) => {
          assert.equal(data.has(target.path), false, `transaction create collided at ${target.path}`);
          pending.push([target.path, structuredClone(value)]);
        },
        set: (target, value) => pending.push([target.path, structuredClone(value)]),
        update: (target, value) => pending.push([target.path, { ...(data.get(target.path) || {}), ...structuredClone(value) }]),
      };
      const result = await callback(tx);
      pending.forEach(([path, value]) => data.set(path, value));
      return result;
    },
  };
  return { db, data, root };
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; },
  };
}

const uid = 'recipe-first-owner';
const coffeeId = 'kalita-coffee';
const sessionId = 'recipe-first-session';
const source = generateKalitaRecipe({}, { size: '155', dose: 13 });
assert.equal(source.coffeeGrams, 13);
assert.equal(source.waterGrams, 208);

// Seed a reviewed ratio change through the actual memory repository seam.
// This is the canonical 13g source, reviewed to 1:15 (195g), from which U2
// must derive the 20g/300g preview.
const repository = createMemoryRuphusRepository({ clock: () => 1_757_000_000_000 });
repository.seedBean(uid, { id: coffeeId, ownerId: uid, handBrewRecipes: { kalita: source }, handBrewRecipe: source });
const reviewedSource = createRecipePreview({ recipe: source, dose: 13, targetRatio: 15 });
assert.equal(reviewedSource.waterGrams, 195);
const sourceProposal = repository.createProposal({ uid, coffeeId, slotKey: 'kalita_hot', sessionId, after: reviewedSource, proposalId: 'reviewed-source' });
const firestore = firestoreFromSnapshot(repository.snapshot(), uid);
const beforePreparation = structuredClone(firestore.data.get(`${firestore.root}/beans/${coffeeId}`));
const previousAllowlist = process.env.RUPHUS_AGENT_V3_UIDS;
process.env.RUPHUS_AGENT_V3_UIDS = uid;

try {
  const request = {
    method: 'POST',
    body: { requestId: 'preview-20', proposalId: sourceProposal.id, coffeeId, slotKey: 'kalita_hot', sessionId, dose: 20 },
  };
  const firstResponse = response();
  await handleRecipePreview(request, firstResponse, { uid }, { db: firestore.db });
  assert.equal(firstResponse.statusCode, 200);
  assert.equal(firstResponse.body.serverValidated, true);
  assert.equal(firstResponse.body.saved, false);
  assert.equal(firstResponse.body.preview.coffeeGrams, 20);
  assert.equal(firstResponse.body.preview.waterGrams, 300);
  assert.equal(firstResponse.body.proposal.before.coffeeGrams, 13);
  assert.equal(firstResponse.body.proposal.before.waterGrams, 208);
  assert.equal(firstResponse.body.proposal.after.coffeeGrams, 20);
  assert.equal(firstResponse.body.proposal.after.waterGrams, 300);

  // Preparation/opening is not an active-recipe write.
  const afterPreparation = firestore.data.get(`${firestore.root}/beans/${coffeeId}`);
  assert.deepEqual(afterPreparation.handBrewRecipes.kalita, beforePreparation.handBrewRecipes.kalita);
  assert.deepEqual(afterPreparation.activeRevisionIds, beforePreparation.activeRevisionIds);

  // Replaying the exact preparation request reuses its proposal and does not
  // grow the proposal set or create an attempt.
  const replayResponse = response();
  await handleRecipePreview(request, replayResponse, { uid }, { db: firestore.db });
  assert.equal(replayResponse.statusCode, 200);
  assert.equal(replayResponse.body.proposal.id, firstResponse.body.proposal.id);
  assert.equal([...firestore.data.keys()].filter((path) => path.includes('/proposals/')).length, 2);
  assert.equal([...firestore.data.keys()].filter((path) => path.includes('/brewAttempts/')).length, 0);

  const previewProposalId = firstResponse.body.proposal.id;
  const sourceRevisionId = sourceProposal.sourceRevisionId;
  const brewCommand = {
    actionId: 'brew-preview-20', mode: 'brew_once', coffeeId, slotKey: 'kalita_hot', proposalId: previewProposalId,
    expectedRevisionId: sourceRevisionId,
  };
  const brewed = await executeRecipeCommand({ db: firestore.db, uid, ...brewCommand });
  assert.equal(brewed.attempt.snapshot.coffeeGrams, 20);
  assert.equal(brewed.attempt.snapshot.waterGrams, 300);
  assert.deepEqual(brewed.attempt.snapshot, firstResponse.body.proposal.after);
  assert.equal(firestore.data.get(`${firestore.root}/beans/${coffeeId}`).handBrewRecipes.kalita.waterGrams, 208);

  // The exact command identity is idempotent: replay returns the same attempt
  // and the injected Firestore has one attempt document.
  const replayBrew = await executeRecipeCommand({ db: firestore.db, uid, ...brewCommand });
  assert.equal(replayBrew.attempt.id, brewed.attempt.id);
  assert.equal([...firestore.data.keys()].filter((path) => path.includes('/brewAttempts/')).length, 1);

  const promoted = await executeRecipeCommand({
    db: firestore.db,
    uid,
    actionId: 'promote-preview-20',
    mode: 'promote_attempt',
    coffeeId,
    slotKey: 'kalita_hot',
    attemptId: brewed.attempt.id,
    expectedRevisionId: sourceRevisionId,
  });
  assert.equal(promoted.revision.snapshot.coffeeGrams, 20);
  assert.equal(promoted.revision.snapshot.waterGrams, 300);
  assert.equal(firestore.data.get(`${firestore.root}/beans/${coffeeId}`).handBrewRecipes.kalita.waterGrams, 300);

  const undone = await executeRecipeCommand({
    db: firestore.db,
    uid,
    actionId: 'undo-preview-20',
    mode: 'undo_revision',
    coffeeId,
    slotKey: 'kalita_hot',
    expectedRevisionId: promoted.revision.id,
  });
  assert.equal(undone.revision.snapshot.coffeeGrams, 13);
  assert.equal(undone.revision.snapshot.waterGrams, 208);
  assert.equal(firestore.data.get(`${firestore.root}/beans/${coffeeId}`).handBrewRecipes.kalita.coffeeGrams, 13);
  assert.equal(firestore.data.get(`${firestore.root}/beans/${coffeeId}`).handBrewRecipes.kalita.waterGrams, 208);
} finally {
  if (previousAllowlist == null) delete process.env.RUPHUS_AGENT_V3_UIDS;
  else process.env.RUPHUS_AGENT_V3_UIDS = previousAllowlist;
}

console.log('Ruphus recipe-first actions passed (Kalita 13g/208g -> reviewed 1:15 -> preview 20g/300g -> brew/promote/Undo)');

// The U2 contract accepts only the existing proposal identity and requested
// dose. The proposal's trusted `after` carries the selected V60 family; no
// arbitrary technique configuration is sent through the preview endpoint.
{
  const v60Uid = 'recipe-first-v60-owner';
  const v60CoffeeId = 'v60-technique-coffee';
  const v60SessionId = 'recipe-first-v60-session';
  const selectedV60 = generateV60TechniqueOption('kasuya-46-v1', {}, { dose: 13 }).recipe;
  const aiden = { title: 'Aiden sibling', profileType: 0, ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 1, ssPulsesInterval: 20, ssPulseTemperatures: [96], batchPulsesEnabled: true, batchPulsesNumber: 1, batchPulsesInterval: 30, batchPulseTemperatures: [96], device: 'aiden', method: 'aiden' };
  const v60Repository = createMemoryRuphusRepository();
  // The source is a V60 recipe; the local variable name intentionally keeps
  // the original slot shape explicit in this bounded fixture.
  const originalV60Hot = generateV60RecipeForFixture();
  v60Repository.seedBean(v60Uid, { id: v60CoffeeId, ownerId: v60Uid, handBrewRecipes: { v60: originalV60Hot }, handBrewRecipe: originalV60Hot, aidenRecipe: aiden });
  const selectedProposal = v60Repository.createProposal({ uid: v60Uid, coffeeId: v60CoffeeId, slotKey: 'v60_hot', sessionId: v60SessionId, after: selectedV60, proposalId: 'selected-v60-technique' });
  const v60Firestore = firestoreFromSnapshot(v60Repository.snapshot(), v60Uid);
  const originalAiden = structuredClone(v60Firestore.data.get(`${v60Firestore.root}/beans/${v60CoffeeId}`).aidenRecipe);
  const previousAllowlist = process.env.RUPHUS_AGENT_V3_UIDS;
  process.env.RUPHUS_AGENT_V3_UIDS = v60Uid;
  try {
    const v60Response = response();
    await handleRecipePreview({ method: 'POST', body: { requestId: 'v60-preview-20', proposalId: selectedProposal.id, coffeeId: v60CoffeeId, slotKey: 'v60_hot', sessionId: v60SessionId, dose: 20 } }, v60Response, { uid: v60Uid }, { db: v60Firestore.db });
    assert.equal(v60Response.statusCode, 200, JSON.stringify(v60Response.body));
    assert.equal(v60Response.body.preview.technique, selectedV60.technique);
    assert.equal(v60Response.body.preview.sourceLineage.sourceIds[0], 'kasuya-46-v1');
    assert.equal(v60Response.body.preview.coffeeGrams, 20);
    assert.equal(v60Response.body.preview.steps.at(-1).waterTotal, v60Response.body.preview.waterGrams);
    assert.equal(v60Response.body.preview.timerReady, true);
    assert.deepEqual(v60Firestore.data.get(`${v60Firestore.root}/beans/${v60CoffeeId}`).aidenRecipe, originalAiden);

    const v60BrewCommand = { actionId: 'v60-brew-preview-20', mode: 'brew_once', coffeeId: v60CoffeeId, slotKey: 'v60_hot', proposalId: v60Response.body.proposal.id, expectedRevisionId: selectedProposal.sourceRevisionId };
    const v60Brewed = await executeRecipeCommand({ db: v60Firestore.db, uid: v60Uid, ...v60BrewCommand });
    assert.equal(v60Brewed.attempt.snapshot.technique, selectedV60.technique);
    assert.equal(v60Brewed.attempt.snapshot.sourceLineage.sourceIds[0], 'kasuya-46-v1');
    assert.equal(v60Brewed.attempt.snapshot.coffeeGrams, 20);
    assert.equal(v60Brewed.attempt.snapshot.steps.at(-1).waterTotal, v60Brewed.attempt.snapshot.waterGrams);

    const v60Promoted = await executeRecipeCommand({ db: v60Firestore.db, uid: v60Uid, actionId: 'v60-promote-preview-20', mode: 'promote_attempt', coffeeId: v60CoffeeId, slotKey: 'v60_hot', attemptId: v60Brewed.attempt.id, expectedRevisionId: selectedProposal.sourceRevisionId });
    assert.equal(v60Promoted.revision.snapshot.technique, selectedV60.technique);
    assert.equal(v60Firestore.data.get(`${v60Firestore.root}/beans/${v60CoffeeId}`).aidenRecipe.title, originalAiden.title);

    const v60Undone = await executeRecipeCommand({ db: v60Firestore.db, uid: v60Uid, actionId: 'v60-undo-preview-20', mode: 'undo_revision', coffeeId: v60CoffeeId, slotKey: 'v60_hot', expectedRevisionId: v60Promoted.revision.id });
    assert.equal(v60Undone.revision.snapshot.technique, originalV60Hot.technique);
    assert.equal(v60Undone.revision.snapshot.coffeeGrams, originalV60Hot.coffeeGrams);
    assert.equal(v60Undone.revision.snapshot.waterGrams, originalV60Hot.waterGrams);
    assert.deepEqual(v60Firestore.data.get(`${v60Firestore.root}/beans/${v60CoffeeId}`).aidenRecipe, originalAiden);
  } finally {
    if (previousAllowlist == null) delete process.env.RUPHUS_AGENT_V3_UIDS;
    else process.env.RUPHUS_AGENT_V3_UIDS = previousAllowlist;
  }
}

function generateV60RecipeForFixture() {
  // Kept local to make the original slot's source and expected Undo snapshot
  // obvious without adding a second production seam to this integration test.
  return generateV60Recipe({}, { dose: 13 });
}
