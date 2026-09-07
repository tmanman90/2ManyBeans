import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryCommandStore } from '../api/_lib/ruphusCommandService.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { applyRuphusTastingState } from '../api/ruphus-tasting.js';
import { resolveRuphusActionRequest } from '../src/lib/ruphusActionIdentity.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { deriveProposalReadiness } from '../api/ruphus-agent.js';
import { resolveLegacyRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';

function setup() {
  const store = createMemoryCommandStore({ uid: 'user-1' });
  const recipe = generateV60Recipe({}, { dose: 15 });
  store.seedBean('bean-1', { id: 'bean-1', ownerId: 'user-1', handBrewRecipes: { v60: recipe }, handBrewRecipe: recipe });
  return { store, recipe };
}

test('Kalita update request produces a persisted card, then explicit Apply changes canonical recipe and Undo restores it', async () => {
  const uid = 'user-1';
  const store = createMemoryCommandStore({ uid });
  const before = generateKalitaRecipe({ targetRatio: 215 / 13 }, { dose: 13, size: '155' });
  store.seedBean('bean-1', { name: 'El Vergel', handBrewRecipes: { kalita: before }, handBrewRecipe: before });
  store.execute({ actionId: 'initial', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'kalita_hot', recipe: before });
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, store.getBean('bean-1'));
  const userText = 'Ok can we update recipe';
  const conversation = [{ role: 'assistant', content: 'For a little more body, reduce the water by 10 g and keep the dose and grind unchanged.' }];
  const ledger = { entries: [{ kind: 'evidence', status: 'available', namedCoffees: ['El Vergel'] }] };
  const context = { userText, conversation, ledger, sessionId: 'kalita-conversation', rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'El Vergel' }], refs: { c1: 'bean-1' } }, proposalState: { target: null, ...deriveProposalReadiness({ conversation, ledger, userText }) } };
  const tools = createRuphusTools({ uid, context, proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
    readers: { readRecipe: async () => resolveLegacyRecipe(repository.getBean(uid, 'bean-1'), 'kalita_hot').recipe },
    proposalStore: async (input) => repository.createProposal(input),
  });
  const frames = []; let round = 0;
  const provider = { runTurn: async () => (++round === 1
    ? { toolCalls: [{ callId: 'read', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'kalita_hot' } }] }
    : { toolCalls: [{ callId: 'propose', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'water', value: 205 } } }] }) };
  const turn = await runRuphusTurn({ turnId: 'kalita-update', context, userText, provider, tools, emit: frame => frames.push(frame) });
  assert.equal(turn.ok, true);
  const artifact = frames.find(frame => frame.type === 'artifact_ready')?.artifact;
  assert.ok(artifact);
  assert.equal(artifact.coffeeName, 'El Vergel');
  assert.deepEqual(artifact.actions, ['apply_proposal', 'brew_once', 'keep_current']);
  assert.equal(resolveLegacyRecipe(store.getBean('bean-1'), 'kalita_hot').recipe.waterGrams, 215);
  store.seedProposal(repository.getProposal(uid, artifact.id));
  const storage = { getItem: () => null, setItem: () => {} };
  const { request } = resolveRuphusActionRequest({ uid, mode: 'apply_proposal', artifact, storage, idFactory: () => 'owner-tap' });
  const applied = store.execute(request);
  const after = resolveLegacyRecipe(store.getBean('bean-1'), 'kalita_hot').recipe;
  assert.equal(after.waterGrams, 205);
  assert.equal(after.steps.at(-1).waterTotal, 205);
  assert.match(after.steps.at(-1).action, /205g/);
  assert.equal(applied.receipt.executionAvailable, true);
  assert.equal(store.execute(request).revision.id, applied.revision.id);
  store.execute({ actionId: 'owner-undo', mode: 'undo_revision', coffeeId: 'bean-1', slotKey: 'kalita_hot', expectedRevisionId: applied.revision.id });
  assert.equal(resolveLegacyRecipe(store.getBean('bean-1'), 'kalita_hot').recipe.waterGrams, 215);
});

test('Apply creates one active revision and idempotent replay does not duplicate it', () => {
  const { store, recipe } = setup();
  const replaced = store.execute({ actionId: 'replace-1', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe });
  store.seedProposal({ id: 'proposal-1', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: replaced.revision.id, sourceHash: replaced.revision.snapshotHash, after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: 98 } }, status: 'proposed' });
  const result = store.execute({ actionId: 'apply-1', mode: 'apply_proposal', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-1', expectedRevisionId: replaced.revision.id });
  const replay = store.execute({ actionId: 'apply-1', mode: 'apply_proposal', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-1', expectedRevisionId: replaced.revision.id });
  assert.equal(result.revision.id, replay.revision.id);
  assert.equal(store.snapshot().revisions.filter((item) => item.source === 'apply').length, 1);
  assert.equal(store.snapshot().receipts.filter((item) => item.actionId === 'apply-1').length, 1);
  assert.equal(result.receipt.executionAvailable, true);
  const started = store.execute({ actionId: 'apply-start-1', mode: 'start_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', expectedRevisionId: result.revision.id });
  assert.equal(started.attempt.revisionId, result.revision.id);
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

test('brew attempt completion is an idempotent server transition before tasting', () => {
  const { store, recipe } = setup();
  const current = store.execute({ actionId: 'complete-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe }).revision;
  store.seedProposal({ id: 'proposal-complete', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: current.id, sourceHash: current.snapshotHash, after: recipe, status: 'proposed' });
  const brewed = store.execute({ actionId: 'complete-brew', mode: 'brew_once', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-complete' });
  const timerStarted = store.execute({ actionId: 'timer-started', mode: 'timer_started', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: brewed.attempt.id, expectedRevisionId: current.id });
  assert.equal(timerStarted.attempt.status, 'timer_started');
  const completed = store.execute({ actionId: 'complete-attempt', mode: 'complete_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: brewed.attempt.id, expectedRevisionId: current.id });
  const replay = store.execute({ actionId: 'complete-attempt', mode: 'complete_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: brewed.attempt.id, expectedRevisionId: current.id });
  assert.equal(completed.attempt.status, 'completed');
  assert.equal(replay.attempt.status, 'completed');
  assert.equal(completed.receipt.physicalBrewConfirmed, false);
  assert.equal(completed.receipt.timerCompleted, true);
});

test('attempt lifecycle requires timer start for manual brews and profile preparation for Aiden', () => {
  const { store, recipe } = setup();
  const current = store.execute({ actionId: 'lifecycle-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe }).revision;
  const started = store.execute({ actionId: 'lifecycle-start', mode: 'start_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', expectedRevisionId: current.id });
  assert.throws(() => store.execute({ actionId: 'lifecycle-skip', mode: 'complete_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: started.attempt.id }), /timer must be started/i);
  const aidenRecipe = { title: 'Aiden', profileType: 0, ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 1, ssPulsesInterval: 20, ssPulseTemperatures: [96], batchPulsesEnabled: true, batchPulsesNumber: 1, batchPulsesInterval: 30, batchPulseTemperatures: [96], device: 'aiden', method: 'aiden' };
  store.seedBean('lifecycle-aiden', { id: 'lifecycle-aiden', ownerId: 'user-1', aidenRecipe });
  const aidenStart = store.execute({ actionId: 'lifecycle-aiden-start', mode: 'start_attempt', coffeeId: 'lifecycle-aiden', slotKey: 'aiden' });
  assert.throws(() => store.execute({ actionId: 'lifecycle-aiden-skip', mode: 'complete_attempt', coffeeId: 'lifecycle-aiden', slotKey: 'aiden', attemptId: aidenStart.attempt.id }), /profile-prepared/i);
  store.seedAttempt({ ...aidenStart.attempt, status: 'profile_prepared' });
  assert.equal(store.execute({ actionId: 'lifecycle-aiden-complete', mode: 'complete_attempt', coffeeId: 'lifecycle-aiden', slotKey: 'aiden', attemptId: aidenStart.attempt.id }).attempt.status, 'completed');
});

test('promotion rejects a live dose change against the attempt-time binding', () => {
  const { store, recipe } = setup();
  const current = store.execute({ actionId: 'attempt-binding-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe }).revision;
  const started = store.execute({ actionId: 'attempt-binding-start', mode: 'start_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', expectedRevisionId: current.id });
  store.seedAttempt({ ...started.attempt, status: 'tasted' });
  const bean = store.getBean('bean-1');
  bean.handBrewRecipes.v60 = { ...bean.handBrewRecipes.v60, userCoffeeGrams: 18 };
  bean.handBrewRecipe = bean.handBrewRecipes.v60;
  store.seedBean('bean-1', bean);
  assert.throws(() => store.execute({ actionId: 'attempt-binding-promote', mode: 'promote_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: started.attempt.id }), /dose changed/i);
});

test('action identity survives storage-backed relaunch before a response arrives', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const artifact = { id: 'proposal-relaunch', coffeeId: 'bean-1', slotKey: 'v60_hot', type: 'recipe_proposal' };
  const first = resolveRuphusActionRequest({ uid: 'user-1', mode: 'apply_proposal', artifact, storage, idFactory: () => 'stable-action' });
  const relaunched = resolveRuphusActionRequest({ uid: 'user-1', mode: 'apply_proposal', artifact, storage, idFactory: () => 'different-action' });
  assert.equal(first.request.actionId, 'stable-action');
  assert.equal(relaunched.request.actionId, 'stable-action');
  assert.equal(relaunched.request.actionId, first.request.actionId);
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

test('A direct legacy projection drift fails closed before Apply can overwrite it', () => {
  const { store, recipe } = setup();
  const current = store.execute({ actionId: 'drift-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe }).revision;
  store.seedProposal({ id: 'proposal-drift', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: current.id, sourceHash: current.snapshotHash, after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: 96 } }, status: 'proposed' });
  const bean = store.getBean('bean-1');
  bean.handBrewRecipes.v60 = { ...bean.handBrewRecipes.v60, waterTemp: { ...bean.handBrewRecipes.v60.waterTemp, celsius: 91 } };
  store.seedBean('bean-1', bean);
  assert.throws(() => store.execute({ actionId: 'drift-apply', mode: 'apply_proposal', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-drift' }), /outside the command boundary/);
});

test('a command cannot patch a sibling recipe projection or forge Aiden grind provenance', () => {
  const { store, recipe } = setup();
  store.execute({ actionId: 'patch-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe });
  assert.throws(() => store.execute({ actionId: 'patch-cross-slot', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe, patch: { 'handBrewRecipes.kalita': recipe } }), /selected slot/i);
  const aidenRecipe = { title: 'Aiden profile', profileType: 0, ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 1, ssPulsesInterval: 20, ssPulseTemperatures: [96], batchPulsesEnabled: true, batchPulsesNumber: 1, batchPulsesInterval: 30, batchPulseTemperatures: [96], device: 'aiden', method: 'aiden' };
  store.seedBean('aiden-drift', { id: 'aiden-drift', ownerId: 'user-1', aidenRecipe, aidenGrind: { singleServe: 5, batch: 7 } });
  const aiden = store.getBean('aiden-drift');
  store.execute({ actionId: 'aiden-base', mode: 'replace_active_recipe', coffeeId: 'aiden-drift', slotKey: 'aiden', recipe: aiden.aidenRecipe, patch: { aidenGrind: { singleServe: 5, batch: 7 } } });
  const drifted = store.getBean('aiden-drift'); drifted.aidenGrind = { singleServe: 4, batch: 6 }; store.seedBean('aiden-drift', drifted);
  assert.throws(() => store.execute({ actionId: 'aiden-drift-check', mode: 'apply_proposal', coffeeId: 'aiden-drift', slotKey: 'aiden', proposalId: 'missing' }), (error) => error.code === 'not_found');
});

test('new Aiden and Kalita projections accept complete generated recipes and reject mismatched flat mirrors', () => {
  const store = createMemoryCommandStore({ uid: 'user-1' });
  const aiden = { title: 'Kenya', profileType: 0, ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 1, ssPulsesInterval: 20, ssPulseTemperatures: [96], batchPulsesEnabled: true, batchPulsesNumber: 1, batchPulsesInterval: 30, batchPulseTemperatures: [96] };
  store.seedBean('new-aiden', { id: 'new-aiden', ownerId: 'user-1' });
  const aidenResult = store.execute({ actionId: 'new-aiden-replace', mode: 'replace_active_recipe', coffeeId: 'new-aiden', slotKey: 'aiden', recipe: aiden, patch: { aidenRecipe: aiden } });
  assert.equal(aidenResult.bean.aidenRecipe.title, 'Kenya');
  const kalita = generateKalitaRecipe({}, { dose: 15 });
  store.seedBean('new-kalita', { id: 'new-kalita', ownerId: 'user-1' });
  const kalitaResult = store.execute({ actionId: 'new-kalita-replace', mode: 'replace_active_recipe', coffeeId: 'new-kalita', slotKey: 'kalita_hot', recipe: kalita, patch: { handBrewRecipe: kalita, 'handBrewRecipes.kalita': kalita } });
  assert.equal(kalitaResult.bean.handBrewRecipes.kalita.mode, 'hot');
  assert.throws(() => store.execute({ actionId: 'bad-flat-mirror', mode: 'replace_active_recipe', coffeeId: 'new-kalita', slotKey: 'kalita_hot', recipe: kalita, patch: { handBrewRecipe: { ...kalita, device: 'v60' } } }), /selected slot/i);
});

test('proposal bindings track dose and Aiden grind separately from recipe identity', () => {
  const repository = createMemoryRuphusRepository();
  const base = generateV60Recipe({}, { dose: 15 });
  repository.seedBean('user-1', { id: 'dose-bean', handBrewRecipes: { v60: base } });
  const first = repository.createProposal({ uid: 'user-1', coffeeId: 'dose-bean', slotKey: 'v60_hot', sessionId: 'session-1', after: { ...base, ratio: 17 }, proposalId: 'dose-old' });
  const changed = { ...base, userCoffeeGrams: 18 };
  repository.seedBean('user-1', { id: 'dose-bean', handBrewRecipes: { v60: changed }, activeRevisionIds: { v60_hot: first.sourceRevisionId } });
  const second = repository.createProposal({ uid: 'user-1', coffeeId: 'dose-bean', slotKey: 'v60_hot', sessionId: 'session-2', after: { ...changed, ratio: 17 }, proposalId: 'dose-new' });
  assert.equal(second.sourceDose, 18);
  const store = createMemoryCommandStore({ uid: 'user-1' });
  store.seedBean('dose-bean', { id: 'dose-bean', ownerId: 'user-1', handBrewRecipes: { v60: changed } });
  const current = store.execute({ actionId: 'dose-base', mode: 'replace_active_recipe', coffeeId: 'dose-bean', slotKey: 'v60_hot', recipe: changed }).revision;
  store.seedProposal({ ...first, sourceRevisionId: current.id, sourceHash: current.snapshotHash, status: 'proposed' });
  store.seedProposal({ ...second, sourceRevisionId: current.id, sourceHash: current.snapshotHash, status: 'proposed' });
  assert.throws(() => store.execute({ actionId: 'dose-old-apply', mode: 'apply_proposal', coffeeId: 'dose-bean', slotKey: 'v60_hot', proposalId: 'dose-old' }), /dose changed/i);
  assert.doesNotThrow(() => store.execute({ actionId: 'dose-new-apply', mode: 'apply_proposal', coffeeId: 'dose-bean', slotKey: 'v60_hot', proposalId: 'dose-new' }));
  const aidenBase = { title: 'Aiden', profileType: 0, ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 1, ssPulsesInterval: 20, ssPulseTemperatures: [96], batchPulsesEnabled: true, batchPulsesNumber: 1, batchPulsesInterval: 30, batchPulseTemperatures: [96], device: 'aiden', method: 'aiden' };
  const aidenRepo = createMemoryRuphusRepository();
  aidenRepo.seedBean('user-1', { id: 'grind-bean', aidenRecipe: aidenBase, aidenGrind: { singleServe: 5, batch: 7 } });
  const grindOld = aidenRepo.createProposal({ uid: 'user-1', coffeeId: 'grind-bean', slotKey: 'aiden', sessionId: 'grind-1', after: { ...aidenBase, ratio: 17 }, proposalId: 'grind-old' });
  aidenRepo.seedBean('user-1', { id: 'grind-bean', aidenRecipe: aidenBase, aidenGrind: { singleServe: 6, batch: 8 }, activeRevisionIds: { aiden: grindOld.sourceRevisionId } });
  const grindNew = aidenRepo.createProposal({ uid: 'user-1', coffeeId: 'grind-bean', slotKey: 'aiden', sessionId: 'grind-2', after: { ...aidenBase, ratio: 17 }, proposalId: 'grind-new' });
  const grindStore = createMemoryCommandStore({ uid: 'user-1' });
  grindStore.seedBean('grind-bean', { id: 'grind-bean', ownerId: 'user-1', aidenRecipe: aidenBase, aidenGrind: { singleServe: 6, batch: 8 } });
  const grindCurrent = grindStore.execute({ actionId: 'grind-base', mode: 'replace_active_recipe', coffeeId: 'grind-bean', slotKey: 'aiden', recipe: aidenBase, patch: { aidenGrind: { singleServe: 6, batch: 8 } } }).revision;
  grindStore.seedProposal({ ...grindOld, sourceRevisionId: grindCurrent.id, sourceHash: grindCurrent.snapshotHash, status: 'proposed' });
  grindStore.seedProposal({ ...grindNew, sourceRevisionId: grindCurrent.id, sourceHash: grindCurrent.snapshotHash, status: 'proposed' });
  assert.throws(() => grindStore.execute({ actionId: 'grind-old-apply', mode: 'apply_proposal', coffeeId: 'grind-bean', slotKey: 'aiden', proposalId: 'grind-old' }), /grind changed/i);
  assert.doesNotThrow(() => grindStore.execute({ actionId: 'grind-new-apply', mode: 'apply_proposal', coffeeId: 'grind-bean', slotKey: 'aiden', proposalId: 'grind-new' }));
});

test('recipe provenance is slot-scoped and clears only the selected active revision', () => {
  const store = createMemoryCommandStore({ uid: 'user-1' });
  const v60 = generateV60Recipe({}, { dose: 15 });
  const kalita = generateKalitaRecipe({}, { dose: 15 });
  store.seedBean('multi-slot', { id: 'multi-slot', ownerId: 'user-1', handBrewRecipe: v60, handBrewRecipes: { v60, kalita } });
  const v60Base = store.execute({ actionId: 'multi-v60-base', mode: 'replace_active_recipe', coffeeId: 'multi-slot', slotKey: 'v60_hot', recipe: v60 }).revision;
  const kalitaBase = store.execute({ actionId: 'multi-kalita-base', mode: 'replace_active_recipe', coffeeId: 'multi-slot', slotKey: 'kalita_hot', recipe: kalita }).revision;
  store.seedProposal({ id: 'multi-v60-proposal', ownerId: 'user-1', coffeeId: 'multi-slot', slotKey: 'v60_hot', sourceRevisionId: v60Base.id, sourceHash: v60Base.snapshotHash, after: { ...v60, waterTemp: { ...v60.waterTemp, celsius: 98 } }, status: 'proposed' });
  store.execute({ actionId: 'multi-v60-apply', mode: 'apply_proposal', coffeeId: 'multi-slot', slotKey: 'v60_hot', proposalId: 'multi-v60-proposal' });
  store.seedProposal({ id: 'multi-kalita-proposal', ownerId: 'user-1', coffeeId: 'multi-slot', slotKey: 'kalita_hot', sourceRevisionId: kalitaBase.id, sourceHash: kalitaBase.snapshotHash, after: { ...kalita, waterTemp: { ...kalita.waterTemp, celsius: 97 } }, status: 'proposed' });
  const appliedKalita = store.execute({ actionId: 'multi-kalita-apply', mode: 'apply_proposal', coffeeId: 'multi-slot', slotKey: 'kalita_hot', proposalId: 'multi-kalita-proposal' });
  let bean = store.getBean('multi-slot');
  assert.equal(bean.recipeProvenance.v60_hot.slotKey, 'v60_hot');
  assert.equal(bean.recipeProvenance.kalita_hot.slotKey, 'kalita_hot');
  store.execute({ actionId: 'multi-v60-replace', mode: 'replace_active_recipe', coffeeId: 'multi-slot', slotKey: 'v60_hot', recipe: { ...v60, waterTemp: { ...v60.waterTemp, celsius: 99 } } });
  bean = store.getBean('multi-slot');
  assert.equal(bean.recipeProvenance.v60_hot, undefined);
  assert.equal(bean.recipeProvenance.kalita_hot.slotKey, 'kalita_hot');
  store.execute({ actionId: 'multi-kalita-undo', mode: 'undo_revision', coffeeId: 'multi-slot', slotKey: 'kalita_hot', expectedRevisionId: appliedKalita.revision.id });
  assert.equal(store.getBean('multi-slot').recipeProvenance.kalita_hot, undefined);
});

test('A tasted Brew-once attempt can be promoted only after provenance transition', () => {
  const { store, recipe } = setup();
  const current = store.execute({ actionId: 'promote-base', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', recipe }).revision;
  store.seedProposal({ id: 'proposal-promote', ownerId: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceRevisionId: current.id, sourceHash: current.snapshotHash, after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: 96 } }, status: 'proposed' });
  const brewed = store.execute({ actionId: 'promote-brew', mode: 'brew_once', coffeeId: 'bean-1', slotKey: 'v60_hot', proposalId: 'proposal-promote' });
  assert.throws(() => store.execute({ actionId: 'promote-too-soon', mode: 'promote_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: brewed.attempt.id }), /tasted/);
  const tasting = applyRuphusTastingState({ attempt: { ...brewed.attempt, status: 'completed' }, tastingId: 'tasting-promote', coffeeId: 'bean-1', sensory: { notes: 'balanced' } });
  store.seedAttempt({ ...brewed.attempt, ...tasting.attempt });
  const promoted = store.execute({ actionId: 'promote-1', mode: 'promote_attempt', coffeeId: 'bean-1', slotKey: 'v60_hot', attemptId: brewed.attempt.id, expectedRevisionId: current.id });
  assert.equal(promoted.revision.snapshot.waterTemp.celsius, 96);
});
