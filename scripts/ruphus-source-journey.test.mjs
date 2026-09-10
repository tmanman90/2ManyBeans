import assert from 'node:assert/strict';
import test from 'node:test';

import { handleRecipePreview } from '../api/ruphus-preview.js';
import { executeRecipeCommand } from '../api/_lib/ruphusCommandService.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { validateManualSourceRecipeSnapshot } from '../src/lib/ruphus/contracts.js';

const CASES = [
  {
    label: 'Kalita Wave 155',
    uid: 'source-journey-kalita-owner',
    coffeeId: 'source-journey-kalita-coffee',
    slotKey: 'kalita_hot',
    currentSourceId: 'kurasu-wave-155-2023',
    alternativeSourceId: 'art-of-brew-wave-155-pulse-2024',
    configuration: { device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot' },
    dose: 14,
    previewDose: 20,
    nativeWaterKey: 'waterGrams',
    nativeWater: 320,
    wrongWaterKey: 'waterMilliliters',
    wrongSize: '185',
  },
  {
    label: 'HARIO Switch 03',
    uid: 'source-journey-switch-owner',
    coffeeId: 'source-journey-switch-coffee',
    slotKey: 'v60_hot',
    currentSourceId: 'hario-switch-03-matt-winton-hybrid-24-2022',
    alternativeSourceId: 'hario-switch-03-instruction-manual-36-2023',
    configuration: { device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot' },
    dose: 24,
    previewDose: 20,
    nativeWaterKey: 'waterMilliliters',
    nativeWater: 244.44,
    wrongWaterKey: 'waterGrams',
    wrongSize: '02',
  },
];

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

function firestoreFromData(data, uid) {
  const root = `users/${uid}`;
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
    where: (field, operator, value) => queryRef(path, [{ field, operator, value }]),
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

function firestoreFromSnapshot(snapshot, uid) {
  const root = `users/${uid}`;
  const data = new Map();
  for (const collection of ['beans', 'proposals', 'revisions', 'attempts', 'receipts', 'actions']) {
    const key = collection === 'revisions' ? 'revisions' : collection;
    const path = collection === 'revisions' ? 'recipeRevisions' : collection === 'attempts' ? 'brewAttempts' : collection;
    for (const value of snapshot[key] || []) data.set(`${root}/${path}/${value.id}`, structuredClone(value));
  }
  return firestoreFromData(data, uid);
}

function cloneFirestore(source, uid) {
  return firestoreFromData(new Map([...source.data.entries()].map(([path, value]) => [path, structuredClone(value)])), uid);
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; },
  };
}

function commandFor(caseData, fields) {
  return { coffeeId: caseData.coffeeId, slotKey: caseData.slotKey, ...fields };
}

async function createSourceProposal(caseData) {
  const current = generateManualSourceTechniqueOption(caseData.currentSourceId, {}, { ...caseData.configuration, dose: caseData.dose }).recipe;
  assert.equal(validateManualSourceRecipeSnapshot(current).valid, true);
  const repository = createMemoryRuphusRepository({ clock: () => 1_789_000_000_000 });
  repository.seedBean(caseData.uid, {
    id: caseData.coffeeId,
    ownerId: caseData.uid,
    handBrewRecipes: { [caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60']: current },
    handBrewRecipe: current,
  });
  const context = {
    userText: `Show me a different technique for this ${caseData.label} recipe.`,
    conversation: [],
    ledger: { entries: [] },
    sessionId: `source-journey-${caseData.slotKey}`,
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Journey Bean', recipes: [caseData.slotKey] }], refs: { c1: caseData.coffeeId } },
    __ruphusRefs: { c1: caseData.coffeeId },
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  const tools = createRuphusTools({
    uid: caseData.uid,
    context,
    readers: {
      readRecipe: async ({ coffeeId, slotKey }) => repository.getBean(caseData.uid, coffeeId).handBrewRecipes[slotKey.startsWith('kalita') ? 'kalita' : 'v60'],
    },
    proposalStore: async (input) => repository.createProposal(input),
    proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: caseData.slotKey });
  assert.equal(options.ok, true, `${caseData.label}: technique options failed`);
  assert.equal(options.actionable, true, `${caseData.label}: no actionable alternative`);
  const selected = options.options.find((option) => option.sourceId === caseData.alternativeSourceId);
  assert.ok(selected, `${caseData.label}: expected source option was not offered`);
  assert.equal(selected.executable, true);
  const proposalResult = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: caseData.slotKey,
    change: null,
    experiment: { kind: 'manual_source_technique', sourceId: selected.sourceId },
  });
  assert.equal(proposalResult.ok, true, `${caseData.label}: source proposal failed: ${proposalResult.message || proposalResult.code}`);
  assert.equal(proposalResult.artifact.after.sourceProjection.sourceId, caseData.alternativeSourceId);
  const sourceProposal = repository.getProposal(caseData.uid, proposalResult.artifact.id);
  assert.ok(sourceProposal);
  assert.equal(sourceProposal.status, 'proposed');
  assert.equal(sourceProposal.before.sourceProjection.sourceId, caseData.currentSourceId);
  assert.equal(sourceProposal.after.sourceProjection.sourceId, caseData.alternativeSourceId);
  return { repository, current, context, sourceProposal };
}

async function runJourney(caseData) {
  const { repository, current, context, sourceProposal } = await createSourceProposal(caseData);
  const firestore = firestoreFromSnapshot(repository.snapshot(), caseData.uid);
  const originalSaved = structuredClone(sourceProposal.before);
  const beanPath = `${firestore.root}/beans/${caseData.coffeeId}`;
  const proposalPath = `${firestore.root}/proposals/${sourceProposal.id}`;
  const initialRevisionId = sourceProposal.sourceRevisionId;
  const previousAllowlist = process.env.RUPHUS_AGENT_V3_UIDS;
  process.env.RUPHUS_AGENT_V3_UIDS = caseData.uid;
  try {
    const previewRequest = {
      method: 'POST',
      body: {
        requestId: `${caseData.slotKey}-dose-${caseData.previewDose}`,
        proposalId: sourceProposal.id,
        coffeeId: caseData.coffeeId,
        slotKey: caseData.slotKey,
        sessionId: context.sessionId,
        dose: caseData.previewDose,
      },
    };
    const previewResponse = response();
    await handleRecipePreview(previewRequest, previewResponse, { uid: caseData.uid }, { db: firestore.db });
    assert.equal(previewResponse.statusCode, 200, `${caseData.label}: ${JSON.stringify(previewResponse.body)}`);
    assert.equal(previewResponse.body.serverValidated, true);
    assert.equal(previewResponse.body.saved, false);
    const preview = previewResponse.body.preview;
    assert.equal(preview.sourceProjection.sourceId, caseData.alternativeSourceId);
    assert.equal(preview.coffeeGrams, caseData.previewDose);
    assert.equal(preview[caseData.nativeWaterKey], caseData.nativeWater);
    assert.equal(Object.hasOwn(preview, caseData.wrongWaterKey), false);
    assert.equal(validateManualSourceRecipeSnapshot(preview).valid, true);
    assert.deepEqual(firestore.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'], current);

    // Preparation is idempotent and remains a draft; repeating the same
    // request does not create a second preview proposal or an attempt.
    const replayPreviewResponse = response();
    await handleRecipePreview(previewRequest, replayPreviewResponse, { uid: caseData.uid }, { db: firestore.db });
    assert.equal(replayPreviewResponse.statusCode, 200);
    assert.equal(replayPreviewResponse.body.proposal.id, previewResponse.body.proposal.id);
    assert.equal([...firestore.data.keys()].filter((path) => path.startsWith(`${firestore.root}/proposals/`)).length, 2);
    assert.equal([...firestore.data.keys()].filter((path) => path.startsWith(`${firestore.root}/brewAttempts/`)).length, 0);

    // A source hardware mismatch is rejected before server reconstruction.
    const wrongConfigurationResponse = response();
    await handleRecipePreview({
      method: 'POST',
      body: { ...previewRequest.body, requestId: `${caseData.slotKey}-wrong-size`, sourceConfiguration: { size: caseData.wrongSize } },
    }, wrongConfigurationResponse, { uid: caseData.uid }, { db: firestore.db });
    assert.equal(wrongConfigurationResponse.statusCode, 400);
    assert.equal(wrongConfigurationResponse.body.error, 'source_configuration_mismatch');

    // The proposal and its immutable after snapshot survive the brew command;
    // the active saved source remains unchanged until the later promotion.
    const brewCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-brew`,
      mode: 'brew_once',
      proposalId: previewResponse.body.proposal.id,
      expectedRevisionId: initialRevisionId,
    });
    const brewed = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...brewCommand });
    assert.equal(brewed.attempt.snapshot.sourceProjection.sourceId, caseData.alternativeSourceId);
    assert.equal(brewed.attempt.snapshot.coffeeGrams, caseData.previewDose);
    assert.equal(brewed.attempt.snapshot[caseData.nativeWaterKey], caseData.nativeWater);
    assert.deepEqual(brewed.attempt.snapshot, previewResponse.body.proposal.after);
    assert.deepEqual(firestore.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'], current);
    const replayBrew = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...brewCommand });
    assert.equal(replayBrew.attempt.id, brewed.attempt.id);
    assert.equal([...firestore.data.keys()].filter((path) => path.startsWith(`${firestore.root}/brewAttempts/`)).length, 1);

    const timerCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-timer`,
      mode: 'timer_started',
      attemptId: brewed.attempt.id,
      expectedRevisionId: initialRevisionId,
    });
    const timerStarted = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...timerCommand });
    assert.equal(timerStarted.attempt.status, 'timer_started');
    const replayTimer = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...timerCommand });
    assert.equal(replayTimer.attempt.id, timerStarted.attempt.id);
    assert.equal(replayTimer.attempt.status, 'timer_started');

    // Rebuild the injected DB from its persisted documents to model relaunch;
    // no provider, phone, or physical confirmation is involved.
    const recovered = cloneFirestore(firestore, caseData.uid);
    const completeCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-complete`,
      mode: 'complete_attempt',
      attemptId: brewed.attempt.id,
      expectedRevisionId: initialRevisionId,
    });
    const completed = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...completeCommand });
    assert.equal(completed.attempt.status, 'completed');
    assert.equal(completed.receipt.timerCompleted, true);
    assert.equal(completed.receipt.physicalBrewConfirmed, false);
    const replayComplete = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...completeCommand });
    assert.equal(replayComplete.attempt.id, completed.attempt.id);
    assert.equal(replayComplete.attempt.status, 'completed');

    const promoteCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-promote`,
      mode: 'promote_attempt',
      attemptId: completed.attempt.id,
      expectedRevisionId: initialRevisionId,
    });
    const promoted = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...promoteCommand });
    assert.equal(promoted.revision.snapshot.sourceProjection.sourceId, caseData.alternativeSourceId);
    assert.equal(promoted.revision.snapshot.coffeeGrams, caseData.previewDose);
    assert.equal(recovered.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'].coffeeGrams, caseData.previewDose);
    const replayPromote = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...promoteCommand });
    assert.equal(replayPromote.revision.id, promoted.revision.id);
    assert.equal([...recovered.data.keys()].filter((path) => path.startsWith(`${recovered.root}/recipeRevisions/`) && recovered.data.get(path)?.source === 'promote').length, 1);

    const undoCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-undo`,
      mode: 'undo_revision',
      expectedRevisionId: promoted.revision.id,
    });
    const undone = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...undoCommand });
    assert.deepEqual(undone.revision.snapshot, originalSaved);
    assert.deepEqual(recovered.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'], originalSaved);
    const replayUndo = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...undoCommand });
    assert.equal(replayUndo.revision.id, undone.revision.id);
    assert.equal([...recovered.data.keys()].filter((path) => path.startsWith(`${recovered.root}/recipeRevisions/`) && recovered.data.get(path)?.source === 'undo').length, 1);

    // Owner and base bindings fail closed on isolated stale copies and never
    // mutate the completed journey.
    await assert.rejects(
      () => executeRecipeCommand({ db: firestore.db, uid: `${caseData.uid}-other`, ...brewCommand }),
      (error) => error.code === 'not_found',
    );
    const stale = cloneFirestore(firestore, caseData.uid);
    const staleReplace = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-stale-replace`,
      mode: 'replace_active_recipe',
      recipe: current,
      expectedRevisionId: initialRevisionId,
    });
    await executeRecipeCommand({ db: stale.db, uid: caseData.uid, ...staleReplace });
    const staleBrewCommand = { ...brewCommand, actionId: `${caseData.slotKey}-journey-stale-brew` };
    await assert.rejects(
      () => executeRecipeCommand({ db: stale.db, uid: caseData.uid, ...staleBrewCommand }),
      (error) => error.code === 'stale',
    );
    const stalePreviewResponse = response();
    await handleRecipePreview(previewRequest, stalePreviewResponse, { uid: caseData.uid }, { db: stale.db });
    assert.equal(stalePreviewResponse.statusCode, 409);
    assert.equal(stalePreviewResponse.body.error, 'stale');

    // Keep the source proposal available as an audit trail while the active
    // saved recipe is restored; endpoint preparation never claims a save.
    assert.equal(firestore.data.get(proposalPath).status, 'proposed');
    const previewProposalPath = `${firestore.root}/proposals/${previewResponse.body.proposal.id}`;
    assert.equal(firestore.data.get(previewProposalPath).status, 'attempt_created');
    assert.equal(recovered.data.get(`${recovered.root}/proposals/${sourceProposal.id}`).status, 'proposed');
    assert.equal(recovered.data.get(`${recovered.root}/proposals/${previewResponse.body.proposal.id}`).status, 'attempt_created');
  } finally {
    if (previousAllowlist == null) delete process.env.RUPHUS_AGENT_V3_UIDS;
    else process.env.RUPHUS_AGENT_V3_UIDS = previousAllowlist;
  }
}

for (const caseData of CASES) {
  test(`source journey: ${caseData.label}`, { concurrency: false }, async () => {
    await runJourney(caseData);
  });
}
