import assert from 'node:assert/strict';
import test from 'node:test';

import { executeRecipeCommand, createMemoryCommandStore } from '../api/_lib/ruphusCommandService.js';
import {
  createMemoryRuphusRepository,
  persistProposal,
  persistRecipePreview,
  readRecipeForPreview,
} from '../api/_lib/ruphusRepository.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import {
  absentRecipeSourceHash,
  resolveRecipeSource,
} from '../src/lib/ruphus/recipeSourceState.js';
import { clone, recipeSourceHash, validateProposal } from '../src/lib/ruphus/contracts.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';

const uid = 'absence-owner';
const coffeeId = 'absence-coffee';
const slotKey = 'v60_hot';
const sessionId = 'absence-session';
const after = generateV60Recipe({}, { dose: 15 });

function emptyBean() {
  return { id: coffeeId, ownerId: uid, name: 'Empty slot bean' };
}

function queryRef(collectionPath, filters = []) {
  return {
    kind: 'query',
    collectionPath,
    filters,
    where(field, operator, value) {
      return queryRef(collectionPath, [...filters, { field, operator, value }]);
    },
  };
}

// A small Firestore-shaped store is enough to exercise each transaction's
// reads-before-writes boundary without making any network or cloud writes.
function firestoreFromData(seed = new Map(), owner = uid) {
  const data = new Map([...seed].map(([path, value]) => [path, clone(value)]));
  const root = `users/${owner}`;
  const readField = (value, field) => field.split('.').reduce((current, key) => current?.[key], value);
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    kind: 'doc',
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => ({ exists: data.has(path), id: path.split('/').at(-1), data: () => clone(data.get(path)) }),
    where: (field, operator, value) => queryRef(path, [{ field, operator, value }]),
  });
  const db = {
    collection: (name) => ref(name),
    runTransaction: async (work) => {
      const pending = [];
      let writing = false;
      const tx = {
        get: async (target) => {
          assert.equal(writing, false, 'all transaction reads must precede writes');
          if (target.kind === 'query') {
            const prefix = `${target.collectionPath}/`;
            const docs = [...data.entries()]
              .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
              .map(([path, value]) => ({ id: path.split('/').at(-1), ref: ref(path), data: () => clone(value) }))
              .filter((doc) => target.filters.every(({ field, operator, value }) => operator === '==' && readField(doc.data(), field) === value));
            return { docs };
          }
          return { exists: data.has(target.path), id: target.id, data: () => clone(data.get(target.path)) };
        },
        create: (target, value) => {
          writing = true;
          assert.equal(data.has(target.path), false, `transaction create collided at ${target.path}`);
          assert.equal(pending.some(([path]) => path === target.path), false, `transaction create repeated ${target.path}`);
          pending.push([target.path, clone(value)]);
        },
        set: (target, value) => {
          writing = true;
          pending.push([target.path, clone(value)]);
        },
        update: (target, value) => {
          writing = true;
          pending.push([target.path, { ...(data.get(target.path) || {}), ...clone(value) }]);
        },
      };
      const result = await work(tx);
      pending.forEach(([path, value]) => data.set(path, value));
      return result;
    },
  };
  return { db, data, root };
}

function seedFirestoreBean(firestore, bean = emptyBean()) {
  firestore.data.set(`${firestore.root}/beans/${coffeeId}`, clone(bean));
}

function path(firestore, collection, id) {
  return `${firestore.root}/${collection}/${id}`;
}

test('absence has a stable slot-bound hash and malformed sources remain non-absent', () => {
  assert.equal(absentRecipeSourceHash(slotKey), recipeSourceHash(null, slotKey));
  assert.notEqual(absentRecipeSourceHash(slotKey), absentRecipeSourceHash('kalita_hot'));

  const malformed = { handBrewRecipes: { v60: { device: 'v60', mode: 'hot' } } };
  const malformedSource = resolveRecipeSource(malformed, slotKey);
  assert.equal(malformedSource.sourceState, 'present');
  assert.equal(malformedSource.ok, true);

  const ambiguous = resolveRecipeSource({ handBrewRecipes: { v60: { device: 'kalita', mode: 'hot' } } }, slotKey);
  assert.equal(ambiguous.sourceState, 'invalid');
  assert.equal(ambiguous.ok, false);
});

test('memory repository creates absent proposal and preview without a baseline revision', () => {
  const repository = createMemoryRuphusRepository({ clock: () => 1_789_000_000_000 });
  repository.seedBean(uid, emptyBean());

  const proposal = repository.createProposal({ uid, coffeeId, slotKey, sessionId, after, proposalId: 'absent-proposal' });
  assert.equal(proposal.sourceState, 'absent');
  assert.equal(proposal.before, null);
  assert.equal(proposal.sourceRevisionId, null);
  assert.equal(proposal.sourceHash, absentRecipeSourceHash(slotKey));
  assert.equal(repository.snapshot().revisions.length, 0);
  assert.equal(validateProposal(proposal).valid, true);
  assert.equal(validateProposal({ ...proposal, sourceHash: 'forged-absence-hash' }).valid, false);

  const preview = repository.createPreview({
    uid, coffeeId, slotKey, sessionId, after, previewKey: 'empty-preview', previewDose: 15,
    previewRatio: null, previewConfiguration: {}, sourceRevisionId: null,
    sourceHash: proposal.sourceHash, sourceProposalId: proposal.id, requestId: 'empty-request',
    proposalId: 'absent-preview',
  });
  assert.equal(preview.sourceState, 'absent');
  assert.equal(preview.before, null);
  assert.equal(preview.sourceHash, proposal.sourceHash);
  assert.equal(repository.snapshot().revisions.length, 0);

  repository.seedBean(uid, { ...emptyBean(), handBrewRecipes: { v60: after } });
  assert.throws(
    () => repository.createPreview({
      uid, coffeeId, slotKey, sessionId, after, previewKey: 'stale-preview', previewDose: 15,
      previewConfiguration: {}, sourceRevisionId: null, sourceHash: proposal.sourceHash,
      sourceProposalId: proposal.id, requestId: 'stale-request', proposalId: 'stale-preview-proposal',
    }),
    (error) => error.code === 'stale',
  );
});

test('memory absent try follows timer and complete, promotes once, then Undo restores absence', () => {
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, emptyBean());
  const proposal = repository.createProposal({ uid, coffeeId, slotKey, sessionId, after, proposalId: 'memory-action-proposal' });

  const store = createMemoryCommandStore({ uid, clock: () => 1_789_000_000_000 });
  store.seedBean(coffeeId, emptyBean());
  store.seedProposal(proposal);
  assert.throws(
    () => store.execute({ actionId: 'memory-dose-empty', mode: 'set_dose', coffeeId, slotKey, dose: 15 }),
    (error) => error.code === 'recipe_missing',
    'ordinary dose writes must not manufacture a baseline for an empty slot',
  );
  assert.equal(store.snapshot().revisions.length, 0);

  const brewCommand = { actionId: 'memory-brew', mode: 'brew_once', coffeeId, slotKey, proposalId: proposal.id, expectedRevisionHash: proposal.sourceHash };
  const brewed = store.execute(brewCommand);
  assert.equal(brewed.attempt.revisionId, null);
  assert.equal(brewed.attempt.sourceState, 'absent');
  assert.equal(brewed.attempt.sourceHash, proposal.sourceHash);
  assert.equal(store.snapshot().revisions.length, 0);
  assert.deepEqual(store.execute(brewCommand), brewed, 'the immutable Try action is idempotent');

  const timer = store.execute({ actionId: 'memory-timer', mode: 'timer_started', coffeeId, slotKey, attemptId: brewed.attempt.id });
  assert.equal(timer.attempt.status, 'timer_started');
  assert.equal(timer.attempt.sourceState, 'absent');
  const complete = store.execute({ actionId: 'memory-complete', mode: 'complete_attempt', coffeeId, slotKey, attemptId: brewed.attempt.id });
  assert.equal(complete.attempt.status, 'completed');
  assert.equal(complete.receipt.sourceState, 'absent');

  const promoted = store.execute({ actionId: 'memory-promote', mode: 'promote_attempt', coffeeId, slotKey, attemptId: brewed.attempt.id });
  assert.equal(promoted.revision.sourceState, 'present');
  assert.equal(promoted.revision.parentId, null);
  assert.equal(promoted.receipt.parentSourceState, 'absent');
  assert.equal(promoted.receipt.createdFirstSavedRecipe, true);
  assert.deepEqual(store.getBean(coffeeId).handBrewRecipes.v60, promoted.revision.snapshot);

  const undone = store.execute({ actionId: 'memory-undo', mode: 'undo_revision', coffeeId, slotKey, expectedRevisionId: promoted.revision.id });
  assert.equal(undone.revision.sourceState, 'absent');
  assert.equal(undone.revision.snapshot, null);
  assert.equal(undone.receipt.restoredSourceState, 'absent');
  assert.equal(store.getBean(coffeeId).handBrewRecipes, undefined);
  assert.equal(store.getBean(coffeeId).activeRevisionIds, undefined);
});

test('Firestore transactions persist absent proposal/preview and full Try lifecycle without a baseline', async () => {
  const firestore = firestoreFromData();
  seedFirestoreBean(firestore);

  const proposal = await persistProposal({
    db: firestore.db, uid, coffeeId, slotKey, sessionId, after,
    proposalId: 'firestore-absent-proposal', now: () => '2026-09-11T00:00:00.000Z',
  });
  assert.equal(proposal.sourceState, 'absent');
  assert.equal(proposal.before, null);
  assert.equal(proposal.sourceRevisionId, null);
  assert.equal(firestore.data.has(path(firestore, 'recipeRevisions', 'firestore-absent-proposal')), false);
  assert.equal([...firestore.data.keys()].filter((key) => key.includes('/recipeRevisions/')).length, 0);

  const read = await readRecipeForPreview({ db: firestore.db, uid, coffeeId, slotKey, proposalId: proposal.id, sessionId });
  assert.equal(read.sourceState, 'absent');
  assert.equal(read.revisionId, null);
  assert.equal(read.sourceHash, proposal.sourceHash);
  assert.deepEqual(read.recipe, proposal.after);

  const preview = await persistRecipePreview({
    db: firestore.db, uid, coffeeId, slotKey, sessionId, after,
    previewKey: 'firestore-empty-preview', previewDose: 15, previewConfiguration: {},
    sourceRevisionId: null, sourceHash: proposal.sourceHash, sourceProposalId: proposal.id,
    requestId: 'firestore-empty-request', proposalId: 'firestore-absent-preview',
    now: () => '2026-09-11T00:00:01.000Z',
  });
  assert.equal(preview.sourceState, 'absent');
  assert.equal(preview.before, null);
  assert.equal([...firestore.data.keys()].filter((key) => key.includes('/recipeRevisions/')).length, 0);

  firestore.data.set(path(firestore, 'beans', coffeeId), { ...emptyBean(), handBrewRecipes: { v60: after } });
  await assert.rejects(
    () => readRecipeForPreview({ db: firestore.db, uid, coffeeId, slotKey, proposalId: proposal.id, sessionId }),
    (error) => error.code === 'stale',
  );
  await assert.rejects(
    () => persistRecipePreview({
      db: firestore.db, uid, coffeeId, slotKey, sessionId, after,
      previewKey: 'firestore-stale-preview', previewDose: 15, previewConfiguration: {},
      sourceRevisionId: null, sourceHash: proposal.sourceHash, sourceProposalId: proposal.id,
      requestId: 'firestore-stale-request', proposalId: 'firestore-stale-proposal',
      now: () => '2026-09-11T00:00:02.000Z',
    }),
    (error) => error.code === 'stale',
  );

  const actionDb = firestoreFromData();
  seedFirestoreBean(actionDb);
  const actionProposal = await persistProposal({
    db: actionDb.db, uid, coffeeId, slotKey, sessionId: 'firestore-action-session', after,
    proposalId: 'firestore-action-proposal', now: () => '2026-09-11T00:00:00.000Z',
  });
  const baseCommand = { db: actionDb.db, uid, coffeeId, slotKey };
  const brewed = await executeRecipeCommand({ ...baseCommand, actionId: 'firestore-brew', mode: 'brew_once', proposalId: actionProposal.id, expectedRevisionHash: actionProposal.sourceHash });
  assert.equal(brewed.attempt.revisionId, null);
  assert.equal(brewed.attempt.sourceState, 'absent');
  assert.equal([...actionDb.data.keys()].filter((key) => key.includes('/recipeRevisions/')).length, 0);
  const replayedBrew = await executeRecipeCommand({ ...baseCommand, actionId: 'firestore-brew', mode: 'brew_once', proposalId: actionProposal.id, expectedRevisionHash: actionProposal.sourceHash });
  assert.equal(replayedBrew.attempt.id, brewed.attempt.id);
  assert.equal([...actionDb.data.keys()].filter((key) => key.includes('/recipeRevisions/')).length, 0);
  const timer = await executeRecipeCommand({ ...baseCommand, actionId: 'firestore-timer', mode: 'timer_started', attemptId: brewed.attempt.id });
  assert.equal(timer.attempt.status, 'timer_started');
  const complete = await executeRecipeCommand({ ...baseCommand, actionId: 'firestore-complete', mode: 'complete_attempt', attemptId: brewed.attempt.id });
  assert.equal(complete.attempt.status, 'completed');
  assert.equal(complete.receipt.sourceState, 'absent');
  const promoted = await executeRecipeCommand({ ...baseCommand, actionId: 'firestore-promote', mode: 'promote_attempt', attemptId: brewed.attempt.id });
  assert.equal(promoted.revision.parentId, null);
  assert.equal(promoted.receipt.parentSourceState, 'absent');
  assert.equal(promoted.receipt.createdFirstSavedRecipe, true);
  assert.deepEqual(actionDb.data.get(path(actionDb, 'beans', coffeeId)).handBrewRecipes.v60, promoted.revision.snapshot);
  const undone = await executeRecipeCommand({ ...baseCommand, actionId: 'firestore-undo', mode: 'undo_revision', expectedRevisionId: promoted.revision.id });
  assert.equal(undone.revision.sourceState, 'absent');
  assert.equal(undone.revision.snapshot, null);
  assert.equal(undone.receipt.restoredSourceState, 'absent');
  assert.equal(actionDb.data.get(path(actionDb, 'beans', coffeeId)).handBrewRecipes, undefined);
  assert.equal(actionDb.data.get(path(actionDb, 'beans', coffeeId)).activeRevisionIds, undefined);
});

test('source-backed Kalita 185 flows from tools into persistence and back to absence on Undo', async () => {
  const firestore = firestoreFromData();
  seedFirestoreBean(firestore);
  const context = {
    userText: 'Try a Kalita 185 technique for Jar one',
    conversation: [],
    sessionId: 'tools-kalita-action-session',
    rotationSnapshot: {
      refs: { c1: coffeeId },
      coffees: [{ refKey: 'c1', name: 'Jar one', recipes: [] }],
      setup: { grinder: 'fellow-ode-gen2' },
    },
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  let recipeReads = 0;
  const tools = createRuphusTools({
    uid,
    context,
    readers: {
      readRecipe: async () => { recipeReads += 1; return null; },
    },
    proposalStore: (input) => persistProposal({
      ...input,
      db: firestore.db,
      now: () => '2026-09-11T00:01:00.000Z',
    }),
    proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });

  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(options.ok, true);
  const selected = options.options.find((option) => option.executable && String(option.sourceConfiguration?.size) === '185');
  assert.ok(selected, 'a complete Kalita 185 source must be selectable without a saved base');
  const created = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'kalita_hot', change: null,
    experiment: { kind: 'manual_source_technique', sourceId: selected.sourceId },
  });
  assert.equal(created.ok, true, created.code);
  assert.equal(recipeReads >= 2, true);
  assert.equal(created.artifact.before, null);
  assert.equal(created.proposal.sourceState, 'absent');
  assert.equal(created.proposal.sourceHash, absentRecipeSourceHash('kalita_hot'));
  assert.equal(created.proposal.after.sourceProjection.equipment.size, '185');
  assert.equal([...firestore.data.keys()].filter((key) => key.includes('/recipeRevisions/')).length, 0);

  const sourceRead = await readRecipeForPreview({ db: firestore.db, uid, coffeeId, slotKey: 'kalita_hot', proposalId: created.proposal.id, sessionId: context.sessionId });
  assert.equal(sourceRead.sourceState, 'absent');
  assert.equal(sourceRead.recipe.sourceProjection.equipment.size, '185');
  const preview = await persistRecipePreview({
    db: firestore.db, uid, coffeeId, slotKey: 'kalita_hot', sessionId: context.sessionId,
    after: created.proposal.after, previewKey: 'tools-kalita-preview', previewDose: created.proposal.after.coffeeGrams,
    previewConfiguration: selected.sourceConfiguration, sourceRevisionId: null, sourceHash: sourceRead.sourceHash,
    sourceProposalId: created.proposal.id, requestId: 'tools-kalita-preview-request', proposalId: 'tools-kalita-preview-proposal',
    now: () => '2026-09-11T00:01:01.000Z',
  });
  assert.equal(preview.sourceState, 'absent');
  assert.equal(preview.before, null);
  assert.equal([...firestore.data.keys()].filter((key) => key.includes('/recipeRevisions/')).length, 0);

  const command = { db: firestore.db, uid, coffeeId, slotKey: 'kalita_hot' };
  const brewed = await executeRecipeCommand({ ...command, actionId: 'tools-kalita-brew', mode: 'brew_once', proposalId: preview.id, expectedRevisionHash: sourceRead.sourceHash });
  assert.equal(brewed.attempt.sourceState, 'absent');
  assert.equal(brewed.attempt.revisionId, null);
  assert.equal([...firestore.data.keys()].filter((key) => key.includes('/recipeRevisions/')).length, 0);
  await executeRecipeCommand({ ...command, actionId: 'tools-kalita-timer', mode: 'timer_started', attemptId: brewed.attempt.id });
  const completed = await executeRecipeCommand({ ...command, actionId: 'tools-kalita-complete', mode: 'complete_attempt', attemptId: brewed.attempt.id });
  assert.equal(completed.attempt.status, 'completed');
  assert.equal(completed.receipt.sourceState, 'absent');
  const promoted = await executeRecipeCommand({ ...command, actionId: 'tools-kalita-promote', mode: 'promote_attempt', attemptId: brewed.attempt.id });
  assert.equal(promoted.revision.snapshot.kalitaSize, '185');
  assert.equal(promoted.receipt.createdFirstSavedRecipe, true);
  assert.equal(promoted.receipt.parentSourceState, 'absent');
  assert.equal(firestore.data.get(path(firestore, 'beans', coffeeId)).handBrewRecipes.kalita.kalitaSize, '185');
  const undone = await executeRecipeCommand({ ...command, actionId: 'tools-kalita-undo', mode: 'undo_revision', expectedRevisionId: promoted.revision.id });
  assert.equal(undone.revision.sourceState, 'absent');
  assert.equal(undone.receipt.restoredSourceState, 'absent');
  assert.equal(firestore.data.get(path(firestore, 'beans', coffeeId)).handBrewRecipes, undefined);
  assert.equal(firestore.data.get(path(firestore, 'beans', coffeeId)).activeRevisionIds, undefined);
});

test('an existing Kalita 155 source remains the real Undo parent when saving a 185 proposal', async () => {
  const existingCoffeeId = 'kalita-size-coffee';
  const existingSession = 'kalita-size-session';
  const before155 = generateKalitaRecipe({}, { size: '155', dose: 13 });
  const after185 = generateKalitaRecipe({}, { size: '185', dose: 15 });
  const firestore = firestoreFromData();
  firestore.data.set(`${firestore.root}/beans/${existingCoffeeId}`, {
    id: existingCoffeeId, ownerId: uid, handBrewRecipes: { kalita: before155 }, handBrewRecipe: before155,
  });
  const proposal = await persistProposal({
    db: firestore.db, uid, coffeeId: existingCoffeeId, slotKey: 'kalita_hot', sessionId: existingSession,
    after: after185, proposalId: 'kalita-size-proposal', now: () => '2026-09-11T00:02:00.000Z',
  });
  assert.equal(proposal.sourceState, 'present');
  assert.equal(proposal.before.kalitaSize, '155');
  assert.equal(proposal.after.kalitaSize, '185');
  const baseRevision = firestore.data.get(path(firestore, 'recipeRevisions', proposal.sourceRevisionId));
  assert.equal(baseRevision.snapshot.kalitaSize, '155');

  const command = { db: firestore.db, uid, coffeeId: existingCoffeeId, slotKey: 'kalita_hot' };
  const brewed = await executeRecipeCommand({ ...command, actionId: 'kalita-size-brew', mode: 'brew_once', proposalId: proposal.id, expectedRevisionId: proposal.sourceRevisionId });
  const promoted = await executeRecipeCommand({ ...command, actionId: 'kalita-size-promote', mode: 'promote_attempt', attemptId: brewed.attempt.id, expectedRevisionId: proposal.sourceRevisionId });
  assert.equal(promoted.revision.snapshot.kalitaSize, '185');
  assert.equal(promoted.revision.parentId, proposal.sourceRevisionId);
  assert.equal(promoted.receipt.createdFirstSavedRecipe, false);
  assert.equal(firestore.data.get(path(firestore, 'beans', existingCoffeeId)).handBrewRecipes.kalita.kalitaSize, '185');

  const undone = await executeRecipeCommand({ ...command, actionId: 'kalita-size-undo', mode: 'undo_revision', expectedRevisionId: promoted.revision.id });
  assert.equal(undone.revision.snapshot.kalitaSize, '155');
  assert.equal(undone.revision.sourceState, 'present');
  assert.equal(firestore.data.get(path(firestore, 'beans', existingCoffeeId)).handBrewRecipes.kalita.kalitaSize, '155');
  assert.equal(firestore.data.get(path(firestore, 'beans', existingCoffeeId)).handBrewRecipe.kalitaSize, '155');
});
