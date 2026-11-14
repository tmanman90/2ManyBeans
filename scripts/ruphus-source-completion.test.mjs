import assert from 'node:assert/strict';
import test from 'node:test';

import { SWITCH_SOURCES } from '../src/data/manualSources/switch.js';
import { projectManualSource } from '../src/lib/manualSourceProjection.js';
import {
  initialManualBrewState,
  transitionManualBrew,
} from '../src/lib/ruphus/sourceTimerState.js';
import { recipeFromManualSourceProjection } from '../src/lib/ruphus/techniqueOptions.js';
import {
  buildTimingEvent,
  mergeTimingEvent,
  selectTimingMemory,
  timingContextFromRecipe,
} from '../src/lib/brewTimingMemory.js';
import { createMemoryCommandStore } from '../api/_lib/ruphusCommandService.js';

const source = SWITCH_SOURCES.find((record) => record.id === 'hario-switch-03-matt-winton-hybrid-24-2022');
assert.ok(source, 'the unknown-finish Switch source fixture must exist');

const sourceConfiguration = {
  device: 'v60',
  variant: 'switch',
  size: '03',
  model: 'V60 Switch',
  filter: 'v60-03-paper',
  material: 'glass',
  mode: 'hot',
};

const projection = projectManualSource(source, sourceConfiguration);
const recipe = recipeFromManualSourceProjection(projection);
const context = timingContextFromRecipe({ beanId: 'coffee-1', recipe });
const timerIdentity = {
  sourceId: projection.sourceId,
  sourceRevision: projection.sourceRevision,
  sourceConfiguration: projection.sourceConfiguration,
  configurationKey: projection.configurationKey,
  fingerprint: projection.sourceFingerprint || null,
  dose: projection.coffeeGrams,
};

function completedSourceState() {
  let state = initialManualBrewState(projection.sourceExecution, timerIdentity);
  for (const [atMs, action] of [
    [1_000, 'start'], [6_000, 'complete'],
    [31_000, 'start'], [32_000, 'complete'],
    [32_001, 'start'], [40_000, 'complete'],
    [181_000, 'start'], [182_000, 'complete'],
    [182_001, 'start'], [183_000, 'complete'],
  ]) {
    state = transitionManualBrew(projection.sourceExecution, state, action, atMs, timerIdentity);
  }
  return state;
}

test('unknown source finish persists null and keeps the native event ledger', () => {
  assert.equal(projection.finish, null);
  assert.equal(context.targetMs, null);
  assert.equal(context.timingRecordVersion, 2);
  assert.equal(context.v60Variant, 'switch');

  const state = completedSourceState();
  assert.equal(state.completed, true);
  const event = buildTimingEvent({
    ...context,
    sessionId: 'attempt-source-1',
    attemptId: 'attempt-source-1',
    revisionId: 'revision-source-1',
    createdAt: 100,
    actualElapsedMs: 182_000,
    targetMs: null,
    completionKind: 'userFinished',
    sourceConfiguration: projection.sourceConfiguration,
    clockOrigin: projection.clock?.origin || null,
    sourceEvents: state.events,
    sourceCorrections: state.corrections,
  });

  assert.ok(event, 'the source timer completion must be persistable');
  assert.equal(event.targetMs, null, 'unknown source finish must not gain a guessed target');
  assert.equal(event.clockOrigin, 'first-water');
  assert.equal(event.v60Variant, 'switch');
  assert.equal(event.sourceId, projection.sourceId);
  assert.equal(event.sourceRevision, projection.sourceRevision);
  assert.deepEqual(event.sourceConfiguration, projection.sourceConfiguration);
  assert.deepEqual(event.sourceEvents, state.events);
  assert.deepEqual(event.sourceCorrections, []);
  assert.equal(Object.hasOwn(event, 'waterGrams'), false);
  assert.equal(Object.hasOwn(event, 'waterMilliliters'), false);
  assert.deepEqual(buildTimingEvent(event), event, 'a persisted source event must round-trip without rewriting facts');

  const history = mergeTimingEvent([], event);
  assert.equal(selectTimingMemory(history, context)?.event.sessionId, event.sessionId);
  const retry = buildTimingEvent({ ...event, createdAt: 999 });
  assert.deepEqual(mergeTimingEvent(history, retry), history, 'source retries must not replace the immutable ledger');

  const missingTarget = { ...event };
  delete missingTarget.targetMs;
  assert.equal(buildTimingEvent(missingTarget), null, 'source completions must state null explicitly when finish is unknown');
  assert.equal(buildTimingEvent({ ...event, actualElapsedMs: 181_999 }), null);
  assert.equal(buildTimingEvent({
    ...event,
    sourceConfiguration: { ...event.sourceConfiguration, variant: 'classic' },
  }), null, 'the source configuration key and Switch identity must agree');
  assert.equal(buildTimingEvent({
    ...event,
    sourceEvents: { ...event.sourceEvents, 'untrusted:observed': 182_500 },
  }), null);
});

test('source completion reaches the existing owned attempt lifecycle and legacy targets remain valid', () => {
  const store = createMemoryCommandStore({ uid: 'owner-1', clock: () => 1_700_000_000_000 });
  store.seedBean('coffee-1', { handBrewRecipes: { v60: recipe }, handBrewRecipe: recipe });

  const installed = store.execute({
    actionId: 'install-source-recipe',
    mode: 'replace_active_recipe',
    coffeeId: 'coffee-1',
    slotKey: 'v60_hot',
    recipe,
  });
  const started = store.execute({
    actionId: 'start-source-attempt',
    mode: 'start_attempt',
    coffeeId: 'coffee-1',
    slotKey: 'v60_hot',
    expectedRevisionId: installed.revision.id,
  });
  store.execute({
    actionId: 'start-source-timer',
    mode: 'timer_started',
    coffeeId: 'coffee-1',
    slotKey: 'v60_hot',
    attemptId: started.attempt.id,
    expectedRevisionId: installed.revision.id,
  });

  const sourceEvent = buildTimingEvent({
    ...context,
    sessionId: started.attempt.id,
    attemptId: started.attempt.id,
    revisionId: installed.revision.id,
    actualElapsedMs: 182_000,
    targetMs: null,
    completionKind: 'userFinished',
    sourceConfiguration: projection.sourceConfiguration,
    clockOrigin: projection.clock?.origin || null,
    sourceEvents: completedSourceState().events,
    sourceCorrections: [],
  });
  assert.ok(sourceEvent);
  assert.equal(mergeTimingEvent([], sourceEvent)[0].targetMs, null);

  const completed = store.execute({
    actionId: `complete_${started.attempt.id}`,
    mode: 'complete_attempt',
    coffeeId: 'coffee-1',
    slotKey: 'v60_hot',
    attemptId: sourceEvent.attemptId,
    expectedRevisionId: sourceEvent.revisionId,
  });
  assert.equal(completed.attempt.status, 'completed');
  assert.equal(completed.receipt.timerCompleted, true);
  assert.equal(completed.receipt.physicalBrewConfirmed, false);

  const replay = store.execute({
    actionId: `complete_${started.attempt.id}`,
    mode: 'complete_attempt',
    coffeeId: 'coffee-1',
    slotKey: 'v60_hot',
    attemptId: sourceEvent.attemptId,
    expectedRevisionId: sourceEvent.revisionId,
  });
  assert.deepEqual(replay, completed, 'the completion command remains idempotent');
  assert.equal(store.snapshot().attempts.length, 1);

  const legacyRecipe = {
    device: 'kalita',
    kalitaSize: '155',
    coffeeGrams: 15,
    totalBrewTimeSeconds: 240,
    engineVersion: 'kalita-v1',
    rulesVersion: 'r1',
    candidate: true,
  };
  const legacyContext = timingContextFromRecipe({ beanId: 'legacy-bean', recipe: legacyRecipe });
  const legacyEvent = buildTimingEvent({
    ...legacyContext,
    sessionId: 'legacy-session',
    actualElapsedMs: 182_000,
    completionKind: 'userFinished',
  });
  assert.ok(legacyEvent);
  assert.equal(legacyEvent.targetMs, 240_000);
  assert.equal(legacyEvent.timingRecordVersion, undefined);
});

console.log('Ruphus source completion contract passed');
