import assert from 'node:assert/strict';
import { createRuphusTools, isExplicitEspressoRetryRequest, isExplicitEspressoUndoRequest } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { buildEspressoRecipe, espressoSetupKey } from '../src/lib/espressoRecipes.js';
import { bindRuphusTurn } from '../api/_lib/ruphusTurnBinder.js';
import { validateLaunchContext } from '../src/lib/ruphus/conversationContract.js';
import { resolveMethod } from '../src/lib/ruphus/methodResolver.js';
import { resolveRuphusActionRequest } from '../src/lib/ruphusActionIdentity.js';
import { retainActionReceipt } from '../src/lib/ruphus/session.js';
import { espressoReceiptsForSession, firestoreReaders } from '../api/ruphus-agent.js';
import { buildDynamicEvidenceBlock } from '../api/_lib/ruphusPrompt.js';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';

const setup = {
  espressoMachine: 'breville-barista-express',
  espressoBasket: 'stock-double-single-wall',
  espressoGrinder: 'integrated',
  espressoSetupConfirmed: true,
};

const authorityBlock = buildDynamicEvidenceBlock({
  rotationSnapshot: { setup: { ...setup, grinder: 'fellow-ode-gen2' } },
  methodBinding: { status: 'locked', slot: 'espresso', displayName: 'espresso' },
  __ruphusPriorEspressoReceipts: [{ coffeeId: 'bean-1', setupKey: 'espresso-setup', revisionId: 'revision-1', undoAvailable: true }],
});
assert.match(authorityBlock, /current espresso setup is authoritative/i);
assert.match(authorityBlock, /Do not use Fellow Ode labels unless this exact espresso setup identifies that grinder/i);
assert.match(authorityBlock, /An authenticated espresso save receipt exists in this active chat/i);
assert.equal(isExplicitEspressoUndoRequest('Undo that espresso save.'), true);
assert.equal(isExplicitEspressoUndoRequest('Put it back.'), true);
assert.equal(isExplicitEspressoUndoRequest('Please undo that.'), true);
assert.equal(isExplicitEspressoUndoRequest('nah put it back how it was'), true);
assert.equal(isExplicitEspressoUndoRequest('Could you undo that?'), true);
assert.equal(isExplicitEspressoUndoRequest('Would you put it back, please?'), true);
assert.equal(isExplicitEspressoUndoRequest("Don't put it back."), false);
assert.equal(isExplicitEspressoUndoRequest('Don’t put it back.'), false);
assert.equal(isExplicitEspressoUndoRequest('Would undo help?'), false);
assert.equal(isExplicitEspressoUndoRequest('Could undo help?'), false);
assert.equal(isExplicitEspressoUndoRequest('Can undo help?'), false);
assert.equal(isExplicitEspressoUndoRequest('How do I undo?'), false);
assert.equal(isExplicitEspressoUndoRequest('Would you undo it if it helps?'), false);
assert.equal(isExplicitEspressoUndoRequest('What if I undo?'), false);
assert.equal(isExplicitEspressoUndoRequest('Undo jar one or jar two?'), false);
assert.equal(isExplicitEspressoRetryRequest("didn't work? try again pls"), true);
assert.equal(isExplicitEspressoRetryRequest('Please try saving it again.'), true);
assert.equal(isExplicitEspressoRetryRequest('Retry that save.'), true);
assert.equal(isExplicitEspressoRetryRequest('Retry this save'), true);
assert.equal(isExplicitEspressoRetryRequest('try again and change output to 41'), false);
const recipeFor = (dose = 18) => buildEspressoRecipe({ bean: { id: 'bean-1', roastLevel: 'medium' }, setup, doseGrams: dose }).recipe;

function makeFirestore() {
  const values = new Map();
  let failNextMutation = false;
  const node = (path) => ({
    path,
    id: path.split('/').at(-1),
    doc: (id) => node(`${path}/${id}`),
    collection: (name) => node(`${path}/${name}`),
    get: async () => ({ exists: values.has(path), id: path.split('/').at(-1), data: () => clone(values.get(path)) }),
  });
  const clone = (value) => value == null ? value : structuredClone(value);
  const db = {
    collection: (name) => node(name),
    seed(ref, value) { values.set(ref.path, clone(value)); },
    read(ref) { const value = values.get(ref.path); return value == null ? null : clone(value); },
    failNextPersistence() { failNextMutation = true; },
    runTransaction: async (work) => {
      const before = new Map([...values.entries()].map(([key, value]) => [key, clone(value)]));
      const tx = {
        get: async (ref) => ({ exists: values.has(ref.path), id: ref.id, data: () => clone(values.get(ref.path)) }),
        create: (ref, value) => {
          if (failNextMutation && ref.path.includes('/actions/')) {
            failNextMutation = false;
            throw Object.assign(new Error('Synthetic local persistence failure'), { code: 'injected_persistence_failure' });
          }
          if (values.has(ref.path)) throw new Error(`already exists: ${ref.path}`);
          values.set(ref.path, clone(value));
        },
        set: (ref, value, options = {}) => values.set(ref.path, options.merge && values.has(ref.path) ? { ...clone(values.get(ref.path)), ...clone(value) } : clone(value)),
        update: (ref, value) => values.set(ref.path, { ...(clone(values.get(ref.path)) || {}), ...clone(value) }),
      };
      try {
        return await work(tx);
      } catch (error) {
        values.clear();
        for (const [key, value] of before.entries()) values.set(key, value);
        throw error;
      }
    },
  };
  return db;
}

function makeContext(userText, sessionId) {
  return {
    sessionId,
    userText,
    conversation: [],
    rotationSnapshot: { setup, refs: { bean: 'bean-1' }, coffees: [{ refKey: 'bean', id: 'bean-1', name: 'Test Bean' }] },
    __ruphusRefs: { bean: 'bean-1' },
    proposalState: {},
  };
}

const withFrozenNow = async (timestamp, work) => {
  const original = Date.now;
  Date.now = () => timestamp;
  try {
    return await work();
  } finally {
    Date.now = original;
  }
};

function makeReaders(db) {
  return {
    readCoffee: async () => ({ id: 'bean-1', name: 'Test Bean', ownerId: 'owner-1', ...(db.read(db.collection('users').doc('owner-1').collection('beans').doc('bean-1')) || {}) }),
    readRecipe: async () => {
      const bean = db.read(db.collection('users').doc('owner-1').collection('beans').doc('bean-1')) || {};
      return bean.espressoRecipe || { code: 'recipe_missing', slotKey: 'espresso' };
    },
  };
}

const db = makeFirestore();
db.seed(db.collection('users').doc('owner-1'), { preferences: setup });
db.seed(db.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { id: 'bean-1', ownerId: 'owner-1', name: 'Test Bean' });

const espressoTools = createRuphusTools({
  uid: 'owner-1',
  context: { ...makeContext('Tell me how this espresso would taste.', 'turn-espresso-advice'), methodBinding: { status: 'locked', slot: 'espresso', displayName: 'espresso' } },
  readers: makeReaders(db),
  db,
});
assert.equal(espressoTools.definitions.some((definition) => definition.name === 'propose_recipe_change'), false);
assert.equal(espressoTools.definitions.some((definition) => definition.name === 'read_technique_options'), false);
const v60Tools = createRuphusTools({
  uid: 'owner-1',
  context: { ...makeContext('Suggest a V60 recipe.', 'turn-v60-advice'), methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'V60' } },
  readers: makeReaders(db),
  db,
});
assert.equal(v60Tools.definitions.some((definition) => definition.name === 'propose_recipe_change'), true);
assert.equal(v60Tools.definitions.some((definition) => definition.name === 'read_technique_options'), true);

// An explicit espresso save may legitimately follow the resolver and exact
// recipe reader. This is the one bounded third tool round allowed by the
// orchestrator; it must reach the real command service and produce one
// canonical receipt rather than being stopped as a generic read-limit error.
const roundBudgetDb = makeFirestore();
roundBudgetDb.seed(roundBudgetDb.collection('users').doc('owner-1'), { preferences: setup });
roundBudgetDb.seed(roundBudgetDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), {
  id: 'bean-1', ownerId: 'owner-1', name: 'Round Budget Bean',
});
const roundBudgetSeedContext = makeContext('Please save 18 grams for this espresso recipe.', 'turn-round-budget-seed');
const roundBudgetSeedTools = createRuphusTools({ uid: 'owner-1', context: roundBudgetSeedContext, readers: makeReaders(roundBudgetDb), db: roundBudgetDb });
const roundBudgetSeed = await roundBudgetSeedTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 18, yieldGrams: 36, grinderValue: null, temperatureOffsetF: null });
assert.equal(roundBudgetSeed.ok, true);
const roundBudgetContext = makeContext('Please save output 39 grams for this espresso recipe.', 'turn-round-budget-save');
roundBudgetContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
roundBudgetContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
const roundBudgetTools = createRuphusTools({ uid: 'owner-1', context: roundBudgetContext, readers: makeReaders(roundBudgetDb), db: roundBudgetDb });
let roundBudgetProviderCalls = 0;
const roundBudgetProvider = {
  runTurn: async () => {
    roundBudgetProviderCalls += 1;
    if (roundBudgetProviderCalls === 1) return { toolCalls: [{ callId: 'round-budget-resolve', name: 'resolve_coffee', args: { reference: 'Test Bean' } }] };
    if (roundBudgetProviderCalls === 2) return { toolCalls: [{ callId: 'round-budget-read', name: 'read_recipe', args: { coffeeRef: 'bean', slot: 'espresso' } }] };
    return { toolCalls: [{ callId: 'round-budget-save', name: 'save_espresso_recipe', args: { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null } }] };
  },
};
const roundBudgetResult = await runRuphusTurn({
  turnId: roundBudgetContext.sessionId,
  context: roundBudgetContext,
  userText: roundBudgetContext.userText,
  provider: roundBudgetProvider,
  tools: roundBudgetTools,
  emit: () => {},
});
assert.equal(roundBudgetResult.ok, true);
assert.equal(roundBudgetProviderCalls, 3);
assert.equal(roundBudgetResult.artifacts.at(-1)?.status, 'succeeded');
assert.equal(roundBudgetResult.artifacts.at(-1)?.mode, 'replace_active_recipe');
assert.equal(roundBudgetResult.artifacts.at(-1)?.recipe?.yieldGrams, 39);
assert.equal(roundBudgetDb.read(roundBudgetDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe.yieldGrams, 39);

// The same round exception must not bypass the explicit-intent guard. A
// negated request remains read-only even when supplied through the command
// path that the round-budget regression exercises.
const roundBudgetBeforeNegation = structuredClone(roundBudgetDb.read(roundBudgetDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe);
const roundBudgetNegatedContext = makeContext("Don't change my saved recipe; just explain it.", 'turn-round-budget-negated');
roundBudgetNegatedContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
roundBudgetNegatedContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
const roundBudgetNegatedTools = createRuphusTools({ uid: 'owner-1', context: roundBudgetNegatedContext, readers: makeReaders(roundBudgetDb), db: roundBudgetDb });
const roundBudgetNegated = await roundBudgetNegatedTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 41, grinderValue: null, temperatureOffsetF: null });
assert.equal(roundBudgetNegated.code, 'espresso_save_requires_explicit_request');
assert.deepEqual(roundBudgetDb.read(roundBudgetDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe, roundBudgetBeforeNegation);

// A blocked provider envelope must not turn negated, hypothetical, or
// ambiguous Undo language into a runtime mutation recovery.
for (const [label, userText, binding] of [
  ['negated', "Don’t put it back.", { status: 'locked', coffeeRef: 'bean' }],
  ['would-hypothetical', 'Would undo help?', { status: 'locked', coffeeRef: 'bean' }],
  ['hypothetical', 'Could undo help?', { status: 'locked', coffeeRef: 'bean' }],
  ['can-hypothetical', 'Can undo help?', { status: 'locked', coffeeRef: 'bean' }],
  ['how-to', 'How do I undo?', { status: 'locked', coffeeRef: 'bean' }],
  ['conditional', 'Would you undo it if it helps?', { status: 'locked', coffeeRef: 'bean' }],
  ['ambiguous', 'Undo jar one or jar two?', { status: 'ambiguous' }],
]) {
  const recoveryContext = makeContext(userText, `turn-blocked-${label}`);
  recoveryContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
  recoveryContext.turnBinding = binding;
  Object.defineProperty(recoveryContext, '__ruphusPriorEspressoReceipts', {
    value: [{ coffeeId: 'bean-1', setupKey: espressoSetupKey(setup), revisionId: 'revision-1', undoAvailable: true }],
    enumerable: false,
  });
  const baseTools = createRuphusTools({ uid: 'owner-1', context: recoveryContext, readers: makeReaders(db), db });
  let undoCalls = 0;
  const guardedTools = {
    ...baseTools,
    call: async (name, args) => {
      if (name === 'undo_espresso_recipe') undoCalls += 1;
      return baseTools.call(name, args);
    },
  };
  const blocked = await runRuphusTurn({
    turnId: recoveryContext.sessionId,
    context: recoveryContext,
    userText,
    provider: { runTurn: async () => ({ text: 'I need a recipe card first.', envelope: { intent: 'information', state: 'blocked', text: 'I need a recipe card first.' } }) },
    tools: guardedTools,
    emit: () => {},
  });
  assert.equal(blocked.code, 'response_blocked', `${label} blocked recovery should remain blocked`);
  assert.equal(undoCalls, 0, `${label} blocked recovery must not dispatch Undo`);
}

const firstContext = makeContext('Please save 17.5 grams for this espresso recipe.', 'turn-save-1');
const firstTools = createRuphusTools({ uid: 'owner-1', context: firstContext, readers: makeReaders(db), db });
const negatedContext = makeContext("Don't change my saved recipe; just explain it.", 'turn-negated');
const negatedTools = createRuphusTools({ uid: 'owner-1', context: negatedContext, readers: makeReaders(db), db });
const negated = await negatedTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17.5, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(negated.code, 'espresso_save_requires_explicit_request');
const ambiguousContext = makeContext('We discussed either a finer grind or more output. Save that.', 'turn-ambiguous');
const ambiguousTools = createRuphusTools({ uid: 'owner-1', context: ambiguousContext, readers: makeReaders(db), db });
const ambiguous = await ambiguousTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(ambiguous.code, 'espresso_save_requires_explicit_request');
const first = await firstTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17.5, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(first.ok, true);
assert.equal(first.receipt.status, 'succeeded');
assert.equal(first.receipt.undoAvailable, true);
assert.equal(first.recipe.doseGrams, 17.5);
assert.equal(first.artifact.status, 'succeeded');
assert.equal(first.artifact.recipe.doseGrams, 17.5);

// A command-level persistence failure records one server-owned, exact retry
// candidate under chatSessions/espresso-retry. The next turn may replay only
// that frozen command after owner/setup/revision/focus checks; client chat
// history and model-provided changes cannot authorize a different write.
const retryDb = makeFirestore();
retryDb.seed(retryDb.collection('users').doc('owner-1'), { preferences: setup });
retryDb.seed(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { id: 'bean-1', ownerId: 'owner-1', name: 'Retry Bean' });
const retrySeedContext = makeContext('Please save 18 grams for this espresso recipe.', 'turn-retry-seed');
const retrySeedTools = createRuphusTools({ uid: 'owner-1', context: retrySeedContext, readers: makeReaders(retryDb), db: retryDb });
const retrySeed = await retrySeedTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 18, yieldGrams: 36, grinderValue: null, temperatureOffsetF: null });
assert.equal(retrySeed.ok, true);
retryDb.failNextPersistence();
const failedSaveContext = makeContext('Please save output 39 grams for this espresso recipe.', 'turn-retry-failed');
failedSaveContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
failedSaveContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
failedSaveContext.sessionState = { boundaryIndex: 0 };
const failedSaveTools = createRuphusTools({ uid: 'owner-1', context: failedSaveContext, readers: makeReaders(retryDb), db: retryDb });
const failedSave = await failedSaveTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(failedSave.code, 'injected_persistence_failure');
const retryDocRef = retryDb.collection('users').doc('owner-1').collection('chatSessions').doc('espresso-retry');
const retryDoc = retryDb.read(retryDocRef);
assert.equal(retryDoc.status, 'retryable');
assert.equal(retryDoc.slotKey, 'espresso');
assert.equal(retryDoc.recipeFingerprint, retryDoc.recipe && retryDoc.recipe.fingerprint);
const retryFollowupContext = makeContext("didn't work? try again pls", 'turn-retry-followup');
retryFollowupContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
retryFollowupContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
retryFollowupContext.sessionState = { boundaryIndex: 0 };
const retryTools = createRuphusTools({ uid: 'owner-1', context: retryFollowupContext, readers: makeReaders(retryDb), db: retryDb });
const retriedSave = await retryTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(retriedSave.ok, true);
assert.equal(retriedSave.receipt.actionId, retryDoc.actionId);
assert.equal(retryDb.read(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe.yieldGrams, 39);
assert.equal(retryDb.read(retryDocRef).status, 'succeeded');

assert.equal(typeof retryDoc.operationStartedAt, 'number');

// A later authorized operation replaces a settled retry tombstone. The exact
// retry reuses B's original action ID, and a delayed A failure with an older
// frozen start cannot replace B or reopen A.
const lifecycleA = retryDb.read(retryDocRef);
const lifecycleClock = Date.now();
// A fresh explicit save must also supersede an older still-retryable failure,
// without inheriting that operation's timestamp or original user turn.
retryDb.seed(retryDocRef, { ...lifecycleA, status: 'retryable' });
const lifecycleBFailure = await withFrozenNow(lifecycleClock + 2000, async () => {
  retryDb.failNextPersistence();
  const context = makeContext('Please save output 41 grams for this espresso recipe.', 'turn-retry-b-failed');
  context.turnBinding = { status: 'locked', coffeeRef: 'bean' };
  context.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
  context.sessionState = { boundaryIndex: 0 };
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: makeReaders(retryDb), db: retryDb });
  return tools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 41, grinderValue: null, temperatureOffsetF: null });
});
assert.equal(lifecycleBFailure.code, 'injected_persistence_failure');
const lifecycleB = retryDb.read(retryDocRef);
assert.equal(lifecycleB.status, 'retryable');
assert.notEqual(lifecycleB.actionId, lifecycleA.actionId);
assert.ok(lifecycleB.operationStartedAt > lifecycleA.operationStartedAt);
assert.equal(lifecycleB.originalTurnId, 'turn-retry-b-failed');
assert.equal(lifecycleB.createdAt, lifecycleClock + 2000);
assert.equal(lifecycleB.attempts, 1);

await withFrozenNow(lifecycleClock + 2000, async () => {
  retryDb.failNextPersistence();
  const context = makeContext('Please save output 42 grams for this espresso recipe.', 'turn-retry-c-tied');
  context.turnBinding = { status: 'locked', coffeeRef: 'bean' };
  context.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
  context.sessionState = { boundaryIndex: 0 };
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: makeReaders(retryDb), db: retryDb });
  const result = await tools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 42, grinderValue: null, temperatureOffsetF: null });
  assert.equal(result.code, 'injected_persistence_failure');
});
assert.equal(retryDb.read(retryDocRef).actionId, lifecycleB.actionId);

const lifecycleBRetry = await withFrozenNow(lifecycleClock + 2100, async () => {
  const context = makeContext('Retry that save.', 'turn-retry-b-followup');
  context.turnBinding = { status: 'locked', coffeeRef: 'bean' };
  context.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
  context.sessionState = { boundaryIndex: 0 };
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: makeReaders(retryDb), db: retryDb });
  return tools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 41, grinderValue: null, temperatureOffsetF: null });
});
assert.equal(lifecycleBRetry.ok, true);
assert.equal(lifecycleBRetry.receipt.actionId, lifecycleB.actionId);
assert.equal(retryDb.read(retryDocRef).status, 'succeeded');
assert.equal(retryDb.read(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe.yieldGrams, 41);

const delayedA = await withFrozenNow(lifecycleClock + 1000, async () => {
  retryDb.failNextPersistence();
  const context = makeContext('Please save output 39 grams for this espresso recipe.', 'turn-retry-a-delayed');
  context.turnBinding = { status: 'locked', coffeeRef: 'bean' };
  context.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
  context.sessionState = { boundaryIndex: 0 };
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: makeReaders(retryDb), db: retryDb });
  return tools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
});
assert.equal(delayedA.code, 'injected_persistence_failure');
assert.equal(retryDb.read(retryDocRef).actionId, lifecycleB.actionId);
assert.equal(retryDb.read(retryDocRef).status, 'succeeded');
assert.equal(retryDb.read(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe.yieldGrams, 41);

// A forged history or changed model arguments cannot widen the frozen retry.
const forgedRetryRecord = { ...retryDoc, status: 'retryable', setupKey: retryDoc.setupKey, expiresAt: Date.now() + 600000 };
retryDb.seed(retryDocRef, forgedRetryRecord);
const forgedContext = makeContext("didn't work? try again pls", 'turn-retry-forged');
forgedContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
forgedContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
forgedContext.sessionState = { boundaryIndex: 0 };
const forgedTools = createRuphusTools({ uid: 'owner-1', context: forgedContext, readers: makeReaders(retryDb), db: retryDb });
const changedArgs = await forgedTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 41, grinderValue: null, temperatureOffsetF: null });
assert.equal(changedArgs.code, 'espresso_retry_stale');
assert.equal(retryDb.read(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe.yieldGrams, 41);

retryDb.seed(retryDocRef, { ...retryDoc, status: 'retryable', expiresAt: Date.now() + 600000 });
retryDb.seed(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-2'), { id: 'bean-2', ownerId: 'owner-1', name: 'Other Bean' });
const wrongBeanContext = makeContext("didn't work? try again pls", 'turn-retry-bean');
wrongBeanContext.rotationSnapshot.refs = { bean: 'bean-1', other: 'bean-2' };
wrongBeanContext.__ruphusRefs = { bean: 'bean-1', other: 'bean-2' };
wrongBeanContext.turnBinding = { status: 'locked', coffeeRef: 'other' };
wrongBeanContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
wrongBeanContext.sessionState = { boundaryIndex: 0 };
const wrongBeanTools = createRuphusTools({ uid: 'owner-1', context: wrongBeanContext, readers: makeReaders(retryDb), db: retryDb });
const wrongBean = await wrongBeanTools.call('save_espresso_recipe', { coffeeRef: 'other', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(wrongBean.code, 'invalid_recipe');
assert.equal(retryDb.read(retryDocRef).status, 'stale');

retryDb.seed(retryDocRef, { ...retryDoc, status: 'retryable', expiresAt: Date.now() + 600000 });
const currentRetryBean = retryDb.read(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'));
retryDb.seed(retryDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { ...currentRetryBean, activeRevisionIds: { espresso: 'external-revision' }, espressoRecipe: { ...currentRetryBean.espressoRecipe, yieldGrams: 38 } });
const staleBaselineContext = makeContext("didn't work? try again pls", 'turn-retry-stale');
staleBaselineContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
staleBaselineContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
staleBaselineContext.sessionState = { boundaryIndex: 0 };
const staleBaselineTools = createRuphusTools({ uid: 'owner-1', context: staleBaselineContext, readers: makeReaders(retryDb), db: retryDb });
const staleBaseline = await staleBaselineTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(staleBaseline.code, 'espresso_retry_stale');

const negatedRetryRecord = { ...retryDoc, status: 'retryable', expiresAt: Date.now() + 600000 };
retryDb.seed(retryDocRef, negatedRetryRecord);
const negatedRetryContext = makeContext("Don't try again; just explain.", 'turn-retry-negated');
negatedRetryContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
negatedRetryContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
negatedRetryContext.sessionState = { boundaryIndex: 0 };
const negatedRetryTools = createRuphusTools({ uid: 'owner-1', context: negatedRetryContext, readers: makeReaders(retryDb), db: retryDb });
const negatedRetry = await negatedRetryTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(negatedRetry.code, 'espresso_save_requires_explicit_request');

const wrongSetupRecord = { ...retryDoc, status: 'retryable', setupKey: 'different-setup', expiresAt: Date.now() + 600000 };
retryDb.seed(retryDocRef, wrongSetupRecord);
const wrongSetupContext = makeContext("didn't work? try again pls", 'turn-retry-setup');
wrongSetupContext.turnBinding = { status: 'locked', coffeeRef: 'bean' };
wrongSetupContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
wrongSetupContext.sessionState = { boundaryIndex: 0 };
const wrongSetupTools = createRuphusTools({ uid: 'owner-1', context: wrongSetupContext, readers: makeReaders(retryDb), db: retryDb });
const wrongSetup = await wrongSetupTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(wrongSetup.code, 'espresso_retry_stale');

// A response-loss retry in the same turn reuses the exact action and receipt.
const duplicate = await firstTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17.5, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(duplicate.receipt.id, first.receipt.id);

// A new turn with explicit retry wording replays the persisted receipt when
// the live revision already matches, rather than creating a second revision.
const replayContext = makeContext('Please try saving it again.', 'turn-save-1-retry');
Object.defineProperty(replayContext, '__ruphusPriorEspressoReceipts', { value: [first.artifact], enumerable: false });
const replayTools = createRuphusTools({ uid: 'owner-1', context: replayContext, readers: makeReaders(db), db });
const replay = await replayTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17.5, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(replay.ok, true);
assert.equal(replay.replayed, true);
assert.equal(replay.receipt.id, first.receipt.id);

// An identical request after a response-loss replay is receipt-bound even
// without retry wording; a live revision change remains a new operation.
const sameRequestContext = makeContext('Please save 17.5 grams for this espresso recipe.', 'turn-save-1-identical-replay');
Object.defineProperty(sameRequestContext, '__ruphusPriorEspressoReceipts', { value: [first.artifact], enumerable: false });
const sameRequestTools = createRuphusTools({ uid: 'owner-1', context: sameRequestContext, readers: makeReaders(db), db });
const sameRequestReplay = await sameRequestTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17.5, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(sameRequestReplay.ok, true);
assert.equal(sameRequestReplay.replayed, true);
assert.equal(sameRequestReplay.receipt.id, first.receipt.id);

// If the transaction commits before the chat session can persist its
// receipt, a fresh context with the same turn identity recovers the owner
// action journal entry instead of issuing a second command.
const durableReplayDb = makeFirestore();
durableReplayDb.seed(durableReplayDb.collection('users').doc('owner-1'), { preferences: setup });
durableReplayDb.seed(durableReplayDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { id: 'bean-1', ownerId: 'owner-1', name: 'Durable Replay Bean' });
const durableReplayTurn = 'turn-durable-replay';
const durableOriginalContext = makeContext('Please save 17.5 grams for this espresso recipe.', durableReplayTurn);
const durableOriginalTools = createRuphusTools({ uid: 'owner-1', context: durableOriginalContext, readers: makeReaders(durableReplayDb), db: durableReplayDb });
const durableOriginal = await durableOriginalTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17.5, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(durableOriginal.ok, true);
const durableRetryContext = makeContext('Please save 17.5 grams for this espresso recipe.', durableReplayTurn);
const durableRetryTools = createRuphusTools({ uid: 'owner-1', context: durableRetryContext, readers: makeReaders(durableReplayDb), db: durableReplayDb });
const durableRetry = await durableRetryTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17.5, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(durableRetry.ok, true);
assert.equal(durableRetry.replayed, true);
assert.equal(durableRetry.receipt.id, durableOriginal.receipt.id);

// A recipe launch can remain on the historical 36g card after the same-turn
// 39g save committed. With the chat receipt missing, the exact action journal
// match is allowed through the stale-launch guard; a nonmatching action still
// returns recipe_stale before any write.
const historicalReplayDb = makeFirestore();
historicalReplayDb.seed(historicalReplayDb.collection('users').doc('owner-1'), { preferences: setup });
historicalReplayDb.seed(historicalReplayDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { id: 'bean-1', ownerId: 'owner-1', name: 'Historical Launch Bean' });
let launchReplayBaselineRevisionId = null;
const launchReplayReaders = {
  ...makeReaders(historicalReplayDb),
  readRecipe: async ({ launchItem }) => launchItem
    ? { ...recipeFor(18), selectedPath: `recipeRevisions/${launchReplayBaselineRevisionId || 'historical-36'}`, slotKey: 'espresso' }
    : historicalReplayDb.read(historicalReplayDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'))?.espressoRecipe
      ? { ...historicalReplayDb.read(historicalReplayDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe, slotKey: 'espresso' }
      : { code: 'recipe_missing', slotKey: 'espresso' },
};
const historicalBaselineContext = makeContext('Please save 18 grams and 36 grams output for this espresso recipe.', 'turn-historical-baseline');
const historicalBaselineTools = createRuphusTools({ uid: 'owner-1', context: historicalBaselineContext, readers: launchReplayReaders, db: historicalReplayDb });
const historicalBaseline = await historicalBaselineTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 18, yieldGrams: 36, grinderValue: null, temperatureOffsetF: null });
assert.equal(historicalBaseline.ok, true);
launchReplayBaselineRevisionId = historicalBaseline.receipt.revisionId;
const historicalTurn = 'turn-historical-launch-save';
const historicalLaunch = { launchItem: { kind: 'recipe', method: 'espresso', ref: historicalBaseline.receipt.revisionId } };
const historicalSaveContext = makeContext('Please save output 39 grams for this espresso recipe.', historicalTurn);
historicalSaveContext.launchCoffeeId = 'bean';
Object.defineProperty(historicalSaveContext, '__ruphusLaunchContext', { value: historicalLaunch, enumerable: false });
const historicalSaveTools = createRuphusTools({ uid: 'owner-1', context: historicalSaveContext, readers: launchReplayReaders, db: historicalReplayDb });
const historicalSave = await historicalSaveTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(historicalSave.ok, true);
const historicalRetryContext = makeContext('Please save output 39 grams for this espresso recipe.', historicalTurn);
historicalRetryContext.launchCoffeeId = 'bean';
Object.defineProperty(historicalRetryContext, '__ruphusLaunchContext', { value: historicalLaunch, enumerable: false });
const historicalRetryTools = createRuphusTools({ uid: 'owner-1', context: historicalRetryContext, readers: launchReplayReaders, db: historicalReplayDb });
const historicalRetry = await historicalRetryTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 39, grinderValue: null, temperatureOffsetF: null });
assert.equal(historicalRetry.ok, true);
assert.equal(historicalRetry.replayed, true);
assert.equal(historicalRetry.receipt.id, historicalSave.receipt.id);

// A later explicit edit in the same chat may continue from this chat's
// persisted receipt even when the launch card still points at an older
// revision. An external revision remains stale because it does not match the
// trusted receipt's live revision.
const continuationContext = makeContext('Please save 18 grams for this espresso recipe.', 'turn-save-1-followup');
continuationContext.launchCoffeeId = 'bean';
Object.defineProperty(continuationContext, '__ruphusLaunchContext', { value: { launchItem: { kind: 'recipe', method: 'espresso', ref: 'old-revision-36' } }, enumerable: false });
Object.defineProperty(continuationContext, '__ruphusPriorEspressoReceipts', { value: [first.artifact], enumerable: false });
const continuationReaders = {
  ...makeReaders(db),
  readRecipe: async ({ launchItem }) => launchItem
    ? { ...recipeFor(18), selectedPath: 'recipeRevisions/old-revision-36', slotKey: 'espresso' }
    : { ...(db.read(db.collection('users').doc('owner-1').collection('beans').doc('bean-1'))?.espressoRecipe || {}), slotKey: 'espresso' },
};
const continuationTools = createRuphusTools({ uid: 'owner-1', context: continuationContext, readers: continuationReaders, db });
const continuation = await continuationTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 18, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(continuation.ok, true);
assert.equal(continuation.recipe.doseGrams, 18);

// A retained app launch item must not shadow the current conversational
// espresso revision after that save has committed.
const liveAfterLaunchContext = makeContext('Show me the current espresso recipe.', 'turn-live-after-launch');
liveAfterLaunchContext.launchCoffeeId = 'bean';
Object.defineProperty(liveAfterLaunchContext, '__ruphusLaunchContext', { value: { launchItem: { kind: 'recipe', method: 'espresso', ref: 'old-revision-36' } }, enumerable: false });
const launchAwareReaders = {
  ...makeReaders(db),
  readRecipe: async ({ launchItem }) => launchItem
    ? { ...recipeFor(18), selectedPath: 'recipeRevisions/old-revision-36', slotKey: 'espresso' }
    : { ...(db.read(db.collection('users').doc('owner-1').collection('beans').doc('bean-1'))?.espressoRecipe || {}), slotKey: 'espresso' },
};
const liveAfterLaunchTools = createRuphusTools({ uid: 'owner-1', context: liveAfterLaunchContext, readers: launchAwareReaders, db });
const liveAfterLaunch = await liveAfterLaunchTools.call('read_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(liveAfterLaunch.recipe.doseGrams, 18);

// Undo is bound to the authenticated prior receipt, rather than whichever
// revision happens to be current after another direct save.
const interveningContext = makeContext('Please save 18 grams for this espresso recipe.', 'turn-save-2');
const interveningTools = createRuphusTools({ uid: 'owner-1', context: interveningContext, readers: makeReaders(db), db });
const intervening = await interveningTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 18, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(intervening.ok, true);
firstContext.userText = 'nah put it back how it was';
const staleUndo = await firstTools.call('undo_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(staleUndo.code, 'recipe_stale');

const currentContext = makeContext('Please save 17 grams for this espresso recipe.', 'turn-save-3');
const currentTools = createRuphusTools({ uid: 'owner-1', context: currentContext, readers: makeReaders(db), db });
const current = await currentTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(current.ok, true);
currentContext.userText = 'undo that espresso save';
const undone = await currentTools.call('undo_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(undone.ok, true);
assert.equal(undone.receipt.mode, 'undo_revision');
const afterUndo = db.read(db.collection('users').doc('owner-1').collection('beans').doc('bean-1'));
currentContext.userText = 'undo that espresso save again';
const repeatedUndo = await currentTools.call('undo_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(repeatedUndo.ok, true);
assert.equal(repeatedUndo.replayed, true);
assert.equal(repeatedUndo.receipt.revisionId, undone.receipt.revisionId);
assert.deepEqual(db.read(db.collection('users').doc('owner-1').collection('beans').doc('bean-1')), afterUndo);

// A persisted Undo replay returns the canonical prior recipe without issuing
// another command when the restored revision is still live.
const duplicateUndoContext = makeContext('nah put it back how it was', 'turn-save-3-duplicate-undo');
Object.defineProperty(duplicateUndoContext, '__ruphusPriorEspressoReceipts', {
  value: [{ ...current.artifact, status: 'undone', undoAvailable: false, restoredRevisionId: undone.receipt.restoredRevisionId, restoredRecipe: undone.recipe, undoReceipt: undone.artifact }],
  enumerable: false,
});
const duplicateUndoTools = createRuphusTools({ uid: 'owner-1', context: duplicateUndoContext, readers: makeReaders(db), db });
const duplicateUndo = await duplicateUndoTools.call('undo_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(duplicateUndo.ok, true);
assert.equal(duplicateUndo.replayed, true);
assert.equal(duplicateUndo.artifact.mode, 'undo_revision');
assert.deepEqual(db.read(db.collection('users').doc('owner-1').collection('beans').doc('bean-1')), afterUndo);

// A resumed pronoun-only Undo can have no turn binding. The persisted session
// projection still supplies the owner-scoped saved and Undo artifacts, while
// the launch clue supplies the exact espresso bean without guessing among
// other coffees.
const persistedUndoMessages = retainActionReceipt(
  [{ id: 'saved-espresso', role: 'assistant', artifacts: [current.artifact] }],
  undone.artifact,
);
const persistedUndoReceipts = espressoReceiptsForSession({ messages: persistedUndoMessages, boundaryIndex: 0 });
assert.equal(persistedUndoReceipts.length, 1);
assert.equal(persistedUndoReceipts[0].status, 'undone');
assert.equal(persistedUndoReceipts[0].undoReceipt.revisionId, undone.receipt.revisionId);
const resumedUndoContext = makeContext('nah put it back how it was', 'turn-save-3-resumed-undo');
resumedUndoContext.methodBinding = { status: 'locked', slot: 'espresso', displayName: 'espresso' };
const resumedUndoBinding = bindRuphusTurn({
  userText: resumedUndoContext.userText,
  coffees: [{ id: 'bean-1', refKey: 'bean', name: 'Test Bean' }],
  refs: { bean: 'bean-1' },
  ledger: { namedCoffees: ['Test Bean'] },
  launchContext: { coffeeRef: 'bean', launchItem: { kind: 'recipe', method: 'espresso' } },
});
assert.equal(resumedUndoBinding.status, 'locked');
assert.equal(resumedUndoBinding.coffeeRef, 'bean');
resumedUndoContext.turnBinding = resumedUndoBinding;
Object.defineProperty(resumedUndoContext, '__ruphusPriorEspressoReceipts', { value: persistedUndoReceipts, enumerable: false });
const resumedUndoTools = createRuphusTools({ uid: 'owner-1', context: resumedUndoContext, readers: makeReaders(db), db });
const resumedUndo = await runRuphusTurn({
  turnId: resumedUndoContext.sessionId,
  context: resumedUndoContext,
  userText: resumedUndoContext.userText,
  provider: { runTurn: async () => ({ text: 'I need a recipe card first.', envelope: { intent: 'information', state: 'blocked', text: 'I need a recipe card first.' } }) },
  tools: resumedUndoTools,
  emit: () => {},
});
assert.equal(resumedUndo.ok, true);
assert.match(resumedUndo.text, /restored|already back/i);

// Returning to an earlier recipe after intervening revisions is a new
// operation. Its action identity must not collide with the first save's
// expected revision or trigger idempotency_conflict.
const roundTripDb = makeFirestore();
roundTripDb.seed(roundTripDb.collection('users').doc('owner-1'), { preferences: setup });
roundTripDb.seed(roundTripDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { id: 'bean-1', ownerId: 'owner-1', name: 'Round Trip Bean' });
const roundTripSave = async (dose, turn) => {
  const context = makeContext(`Please save ${dose} grams for this espresso recipe.`, turn);
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: makeReaders(roundTripDb), db: roundTripDb });
  return tools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: dose, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
};
const roundTrip39 = await roundTripSave(18, 'turn-round-trip-39');
const roundTrip42 = await roundTripSave(19, 'turn-round-trip-42');
const roundTripBack = await roundTripSave(18, 'turn-round-trip-back-39');
assert.equal(roundTrip39.ok, true);
assert.equal(roundTrip42.ok, true);
assert.equal(roundTripBack.ok, true);
assert.equal(roundTripBack.replayed, undefined);
assert.notEqual(roundTripBack.receipt.id, roundTrip39.receipt.id);
assert.equal(roundTripBack.recipe.doseGrams, 18);

// A historical launch revision cannot be paired with the now-absent live slot.
const absenceDb = makeFirestore();
absenceDb.seed(absenceDb.collection('users').doc('owner-1'), { preferences: setup });
absenceDb.seed(absenceDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { id: 'bean-1', ownerId: 'owner-1', name: 'Test Bean' });
const absenceSaveContext = makeContext('Please save 17 grams for this espresso recipe.', 'turn-absence-save');
const absenceTools = createRuphusTools({ uid: 'owner-1', context: absenceSaveContext, readers: makeReaders(absenceDb), db: absenceDb });
const absenceSave = await absenceTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 17, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(absenceSave.ok, true);
absenceSaveContext.userText = 'undo that espresso save';
const absenceUndo = await absenceTools.call('undo_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(absenceUndo.ok, true);

// An Undo receipt's revisionId is the new live restoration revision; its
// restoredRevisionId is only the parent snapshot. A first-save Undo restores
// absence, so replay must remain receipt-bound even without a recipe payload.
const absenceReplayContext = makeContext('undo that espresso save', 'turn-absence-duplicate-undo');
Object.defineProperty(absenceReplayContext, '__ruphusPriorEspressoReceipts', {
  value: [{ ...absenceSave.artifact, status: 'undone', undoAvailable: false, restoredRevisionId: null, restoredRecipe: null, restoredSourceState: 'absent', undoRevisionId: absenceUndo.receipt.revisionId, undoReceipt: absenceUndo.artifact }],
  enumerable: false,
});
const absenceReplayTools = createRuphusTools({ uid: 'owner-1', context: absenceReplayContext, readers: makeReaders(absenceDb), db: absenceDb });
const absenceReplay = await absenceReplayTools.call('undo_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(absenceReplay.ok, true);
assert.equal(absenceReplay.replayed, true);
assert.equal(absenceReplay.recipe, null);
assert.equal(absenceReplay.receipt.revisionId, absenceUndo.receipt.revisionId);

const settledHistory = retainActionReceipt([{ id: 'espresso-save', role: 'assistant', artifacts: [absenceSave.artifact] }], { type: 'undo_receipt', ...absenceUndo.receipt });
assert.equal(settledHistory.flatMap(message => message.artifacts || []).find(item => item.id === absenceSave.artifact.id)?.status, 'undone');
const historicalContext = makeContext('Please save grind 5 for this espresso recipe.', 'turn-historical');
historicalContext.launchCoffeeId = 'bean';
Object.defineProperty(historicalContext, '__ruphusLaunchContext', { value: { launchItem: { kind: 'recipe', method: 'espresso', ref: absenceSave.receipt.revisionId } }, enumerable: false });
const historicalReaders = { ...makeReaders(absenceDb), readRecipe: async () => ({ ...recipeFor(17), selectedPath: `recipeRevisions/${absenceSave.receipt.revisionId}`, selectedHash: 'historical-hash', slotKey: 'espresso' }) };
const historicalTools = createRuphusTools({ uid: 'owner-1', context: historicalContext, readers: historicalReaders, db: absenceDb });
const historical = await historicalTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: null, grinderValue: 5, temperatureOffsetF: null });
assert.equal(historical.code, 'recipe_stale');

const { request: espressoUndoRequest } = resolveRuphusActionRequest({ uid: 'owner-1', mode: 'undo_revision', artifact: { type: 'action_receipt', actionId: 'espresso-save-receipt', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'espresso', revisionId: 'revision-1' }, idFactory: () => 'espresso-undo' });
assert.equal(espressoUndoRequest.clientIntent, 'espresso_direct_undo');
const { request: pourOverUndoRequest } = resolveRuphusActionRequest({ uid: 'owner-1', mode: 'undo_revision', artifact: { type: 'action_receipt', actionId: 'v60-save-receipt', mode: 'replace_active_recipe', coffeeId: 'bean-1', slotKey: 'v60_hot', revisionId: 'revision-2' }, idFactory: () => 'v60-undo' });
assert.equal(pourOverUndoRequest.clientIntent, undefined);

assert.equal(validateLaunchContext({ surface: 'recipe_espresso', coffeeRef: 'bean', launchMethod: 'espresso' }).valid, true);
assert.equal(resolveMethod({ launchMethod: 'espresso', defaultMethod: 'v60_hot', recipeSlots: [] }).slot, 'espresso');
// Aiden default and a pour-over Ode never hide generic espresso or become its grinder.
const genericSetup = { defaultMethod: 'aiden', brewMethod: 'aiden', grinder: 'fellow-ode-gen2', espressoMachine: 'other', espressoMachineName: 'My espresso machine', espressoGrinder: 'external', espressoGrinderModel: 'DF64' };
const genericDb = makeFirestore();
genericDb.seed(genericDb.collection('users').doc('owner-1'), { preferences: genericSetup });
genericDb.seed(genericDb.collection('users').doc('owner-1').collection('beans').doc('bean-1'), { id: 'bean-1', ownerId: 'owner-1', name: 'Test Bean' });
const genericContext = { ...makeContext('Can I make espresso if Aiden is my default?', 'generic-read'), rotationSnapshot: { setup: genericSetup, refs: { bean: 'bean-1' }, coffees: [{ refKey: 'bean', id: 'bean-1', name: 'Test Bean' }] }, methodBinding: { status: 'locked', slot: 'espresso', displayName: 'espresso' } };
const genericTools = createRuphusTools({ uid: 'owner-1', context: genericContext, readers: makeReaders(genericDb), db: genericDb });
const genericRead = await genericTools.call('read_recipe', { coffeeRef: 'bean', slot: 'espresso' });
assert.equal(genericRead.ok, true);
assert.equal(genericRead.recipe.doseGrams, null);
assert.equal(genericRead.recipe.ratio, 2);
assert.equal(genericRead.recipe.recipeKind, 'generic');
assert.equal(genericRead.recipe.setup.grinderModel, 'DF64');
assert.equal(genericRead.grinderGuidance, undefined);
genericContext.userText = 'Please save output 40 grams for this espresso recipe.';
const doseMissing = await genericTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: 40, grinderValue: null, temperatureOffsetF: null });
assert.equal(doseMissing.code, 'espresso_dose_required');
assert.equal(genericDb.read(genericDb.collection('users').doc('owner-1').collection('beans').doc('bean-1')).espressoRecipe, undefined);
genericContext.userText = 'Please save 20 grams for this espresso recipe.';
const genericSave = await genericTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: 20, yieldGrams: null, grinderValue: null, temperatureOffsetF: null });
assert.equal(genericSave.ok, true);
assert.equal(genericSave.recipe.yieldGrams, 40);
assert.equal(genericSave.recipe.temperature.unit, null);
assert.equal(genericSave.recipe.setup.machineName, 'My espresso machine');
assert.equal(genericDb.read(genericDb.collection('users').doc('owner-1')).preferences.brewMethod, 'aiden');
genericContext.userText = 'Please save temperature offset 2 for this espresso recipe.';
const genericTemperature = await genericTools.call('save_espresso_recipe', { coffeeRef: 'bean', slot: 'espresso', doseGrams: null, yieldGrams: null, grinderValue: null, temperatureOffsetF: 2 });
assert.equal(genericTemperature.ok, false);
const genericServerReader = firestoreReaders(genericDb);
const sameEquipmentRead = await genericServerReader.readRecipe({ uid: 'owner-1', coffeeId: 'bean-1', slotKey: 'espresso' });
assert.equal(sameEquipmentRead.doseGrams, 20);
assert.equal(sameEquipmentRead.validationStatus, undefined);
const changedEquipment = { ...genericSetup, espressoGrinderModel: 'Niche Zero' };
genericDb.seed(genericDb.collection('users').doc('owner-1'), { preferences: changedEquipment });
const changedEquipmentRead = await genericServerReader.readRecipe({ uid: 'owner-1', coffeeId: 'bean-1', slotKey: 'espresso' });
assert.equal(changedEquipmentRead.doseGrams, null);
assert.equal(changedEquipmentRead.setupMismatch, true);
assert.equal(changedEquipmentRead.previousRecipe.doseGrams, 20);
assert.equal(changedEquipmentRead.setup.grinderModel, 'Niche Zero');
const historicalGenericRead = await genericServerReader.readRecipe({ uid: 'owner-1', coffeeId: 'bean-1', slotKey: 'espresso', launchItem: { kind: 'recipe', ref: genericSave.receipt.revisionId } });
assert.equal(historicalGenericRead.doseGrams, 20);
assert.equal(historicalGenericRead.setup.grinderModel, 'DF64');
assert.equal(historicalGenericRead.validationStatus, undefined);
const partialGeneric = buildEspressoRecipe({ bean: { id: 'bean-1' }, setup: { espressoMachine: 'breville-barista-express' } });
assert.equal(partialGeneric.recipe.doseGrams, null);
assert.match(partialGeneric.recipe.setupDescription, /Barista Express/);
assert.doesNotMatch(partialGeneric.recipe.grindGuidance, /Barista Express grinder default/);
// Sealed shelf refs reach the tools. A save named with a sealed bag's ref
// must land on that exact bag, and a rotation ref must still land on the jar.
{
  const sealedDb = makeFirestore();
  const beanRef = (id) => sealedDb.collection('users').doc('owner-1').collection('beans').doc(id);
  sealedDb.seed(sealedDb.collection('users').doc('owner-1'), { preferences: setup });
  const inventory = [
    { id: 'jar-bean', ownerId: 'owner-1', name: 'El Vergel', origin: 'Colombia', process: 'Washed', jarSlot: 1, status: 'ACTIVE' },
    { id: 'sealed-bean', ownerId: 'owner-1', name: 'Kafiex Colombia', roaster: 'Kafiex', origin: 'Colombia', process: 'Natural', status: 'SEALED', roastDate: '2026-11-13', degasMin: 3, peakStart: 10, peakEnd: 30 },
    { id: 'sealed-other', ownerId: 'owner-1', name: 'Fritz Ethiopia', roaster: 'Fritz', origin: 'Ethiopia', process: 'Washed', status: 'SEALED', roastDate: '2026-11-20', degasMin: 3, peakStart: 10, peakEnd: 30 },
  ];
  for (const bean of inventory) sealedDb.seed(beanRef(bean.id), bean);
  const readers = {
    listCoffees: async () => inventory.map((bean) => ({ ...bean, ...(sealedDb.read(beanRef(bean.id)) || {}) })),
    readSetup: async () => setup,
    readCoffee: async ({ coffeeId }) => sealedDb.read(beanRef(coffeeId)),
    readRecipe: async ({ coffeeId }) => (sealedDb.read(beanRef(coffeeId)) || {}).espressoRecipe || { code: 'recipe_missing', slotKey: 'espresso' },
  };
  const saveFor = async (userText, pickRef, sessionId, doseGrams) => {
    const context = await buildRuphusContext({ uid: 'owner-1', contextRef: { surface: 'direct' }, userText, evidenceByteCap: 10000, readers });
    context.sessionId = sessionId;
    const coffeeRef = pickRef(context);
    assert.ok(coffeeRef, 'expected a ref for the target bag');
    const tools = createRuphusTools({ uid: 'owner-1', context, readers, db: sealedDb });
    return { coffeeRef, result: await tools.call('save_espresso_recipe', { coffeeRef, slot: 'espresso', doseGrams, yieldGrams: doseGrams * 2, grinderValue: null, temperatureOffsetF: null }) };
  };
  const sealedSave = await saveFor('Please save 18 grams for the Kafiex Colombia espresso recipe.', (context) => context.rotationSnapshot.sealedShelf.find((bag) => bag.name === 'Kafiex Colombia')?.refKey, 'turn-sealed-save', 18);
  assert.equal(sealedSave.result.ok, true, JSON.stringify(sealedSave.result));
  assert.equal(sealedDb.read(beanRef('sealed-bean')).espressoRecipe.doseGrams, 18);
  assert.equal(sealedDb.read(beanRef('sealed-other')).espressoRecipe, undefined);
  assert.equal(sealedDb.read(beanRef('jar-bean')).espressoRecipe, undefined);
  const jarSave = await saveFor('Please save 19 grams for the El Vergel espresso recipe.', (context) => context.rotationSnapshot.coffees.find((coffee) => coffee.name === 'El Vergel')?.refKey, 'turn-jar-save', 19);
  assert.equal(jarSave.result.ok, true, JSON.stringify(jarSave.result));
  assert.equal(sealedDb.read(beanRef('jar-bean')).espressoRecipe.doseGrams, 19);
  assert.equal(sealedDb.read(beanRef('sealed-bean')).espressoRecipe.doseGrams, 18);
  assert.equal(sealedDb.read(beanRef('sealed-other')).espressoRecipe, undefined);
  assert.notEqual(sealedSave.coffeeRef, jarSave.coffeeRef);
}
console.log('ruphus espresso tools tests: existing save/idempotency/Undo plus generic equipment contracts passed');
