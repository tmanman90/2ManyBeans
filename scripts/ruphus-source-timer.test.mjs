import assert from 'node:assert/strict';
import test from 'node:test';

import { SWITCH_SOURCES } from '../src/data/manualSources/switch.js';
import {
  initialManualBrewState,
  manualBrewView,
  restoreManualBrewState,
  transitionManualBrew,
  validateManualBrewState,
} from '../src/hooks/useManualSourceBrewTimer.js';

const source = (id) => {
  const record = SWITCH_SOURCES.find((candidate) => candidate.id === id);
  assert.ok(record, `missing source ${id}`);
  return record;
};

const hybrid = source('hario-switch-03-matt-winton-hybrid-24-2022');
const immersion = source('hario-switch-03-instruction-manual-36-2023');
const identity = {
  sourceConfiguration: {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot',
  },
  configurationKey: 'switch:03:V60-Switch:v60-03-paper:hot',
  fingerprint: 'projection-switch-03-v1',
};

test('HARIO03 immersion starts its post-main-pour clock only on confirmed completion', () => {
  let state = initialManualBrewState(immersion, identity);
  assert.equal(manualBrewView(immersion, state, 0, identity).readiness.status, 'ready');

  state = transitionManualBrew(immersion, state, 'start', 1_000, identity);
  assert.equal(state.events['main-pour:start'], 1_000);
  assert.equal(state.events['main-pour:complete'], undefined);
  assert.equal(manualBrewView(immersion, state, 121_000, identity).active, true);
  assert.equal(manualBrewView(immersion, state, 121_000, identity).sourceElapsedMs, null);

  state = transitionManualBrew(immersion, state, 'complete', 11_000, identity);
  assert.equal(state.events['main-pour:complete'], 11_000);
  assert.equal(manualBrewView(immersion, state, 130_999, identity).readiness.status, 'countdown');
  assert.equal(manualBrewView(immersion, state, 131_000, identity).readiness.status, 'ready');
  assert.equal(manualBrewView(immersion, state, 131_000, identity).sourceElapsedMs, 120_000);
  assert.equal(state.events['steep:complete'], undefined, 'time never completes the steep');
});

test('HARIO03 hybrid requires explicit open/close confirmations and retains native units', () => {
  let state = initialManualBrewState(hybrid, identity);
  state = transitionManualBrew(hybrid, state, 'start', 1_000, identity);
  state = transitionManualBrew(hybrid, state, 'complete', 6_000, identity);
  assert.deepEqual(state.events, {
    'first-water': 1_000,
    'bloom:start': 1_000,
    'bloom:complete': 6_000,
  });

  assert.equal(manualBrewView(hybrid, state, 30_999, identity).readiness.status, 'countdown');
  state = transitionManualBrew(hybrid, state, 'start', 31_000, identity);
  state = transitionManualBrew(hybrid, state, 'complete', 32_000, identity);
  assert.equal(state.events['close:complete'], 32_000);

  state = transitionManualBrew(hybrid, state, 'start', 32_001, identity);
  assert.equal(state.events['main:start'], 32_001);
  assert.equal(state.events['main:complete'], undefined);
  state = transitionManualBrew(hybrid, state, 'complete', 40_000, identity);
  assert.equal(state.events['main:complete'], 40_000);
  assert.equal(state.completed, false);
  assert.equal(hybrid.stages[0].waterToGrams, 50);
  assert.equal(hybrid.stages[2].waterToMilliliters, 360);
});

test('pause/remount restoration preserves the event ledger and does not replay actions', () => {
  let state = initialManualBrewState(hybrid, identity);
  state = transitionManualBrew(hybrid, state, 'start', 1_000, identity);
  state = transitionManualBrew(hybrid, state, 'complete', 5_000, identity);
  const restored = restoreManualBrewState(hybrid, structuredClone(state), identity);
  assert.deepEqual(restored, state);
  assert.equal(restored.events['bloom:complete'], 5_000);
  assert.equal(manualBrewView(hybrid, restored, 900_000, identity).stage.id, 'close');
  assert.equal(restored.events['close:complete'], undefined);
  assert.deepEqual(restoreManualBrewState(hybrid, restored, identity), restored);
});

test('wrong-source and corrupt restoration are rejected without importing events', () => {
  const state = transitionManualBrew(hybrid, initialManualBrewState(hybrid, identity), 'start', 1_000, identity);
  const wrongSource = { ...state, sourceId: 'other-source' };
  const wrong = restoreManualBrewState(hybrid, wrongSource, identity);
  assert.equal(wrong, null);
  assert.ok(validateManualBrewState(hybrid, wrongSource, identity).errors.includes('source-id-mismatch'));
  assert.equal(restoreManualBrewState(hybrid, state, { ...identity, sourceConfiguration: { ...identity.sourceConfiguration, size: '02' } }), null);
  assert.equal(restoreManualBrewState(hybrid, state, { ...identity, dose: 20 }), null);

  const corrupt = structuredClone(state);
  corrupt.events['later:complete'] = 900;
  assert.equal(restoreManualBrewState(hybrid, corrupt, identity), null);
  assert.equal(restoreManualBrewState(hybrid, { events: { 'first-water': 1_000 } }, identity), null);
  const fresh = restoreManualBrewState(hybrid, null, identity);
  assert.equal(fresh.events['first-water'], undefined);
  assert.equal(fresh.sourceId, hybrid.id);
});

test('passage of time creates no physical events and explicit undo removes only its completion anchor', () => {
  let state = initialManualBrewState(immersion, identity);
  state = transitionManualBrew(immersion, state, 'start', 1_000, identity);
  state = transitionManualBrew(immersion, state, 'complete', 11_000, identity);
  assert.equal(manualBrewView(immersion, state, 999_999, identity).stage.id, 'steep');
  assert.equal(state.events['steep:complete'], undefined);

  assert.throws(() => transitionManualBrew(immersion, state, 'undo', 10_000, identity), /chronological/);
  state = transitionManualBrew(immersion, state, 'undo', 12_000, identity);
  assert.equal(state.events['main-pour:complete'], undefined);
  assert.equal(state.events['main-pour:start'], 1_000);
  assert.equal(state.activeStageId, 'main-pour');
  assert.equal(state.corrections[0].withdrawnAtMs, 11_000);
  assert.equal(manualBrewView(immersion, state, 999_999, identity).sourceElapsedMs, null);
  state = transitionManualBrew(immersion, state, 'complete', 20_000, identity);
  assert.equal(state.events['main-pour:complete'], 20_000);
  assert.equal(manualBrewView(immersion, state, 140_000, identity).readiness.dueAtMs, 140_000);
});

test('completed state is immutable until a new initial state is deliberately created', () => {
  let state = initialManualBrewState(hybrid, identity);
  for (const [atMs, action] of [[1_000, 'start'], [2_000, 'complete'], [31_000, 'start'], [32_000, 'complete'], [32_001, 'start'], [40_000, 'complete'], [181_000, 'start'], [182_000, 'complete'], [182_001, 'start'], [183_000, 'complete']]) {
    state = transitionManualBrew(hybrid, state, action, atMs, identity);
  }
  assert.equal(state.completed, true);
  assert.equal(transitionManualBrew(hybrid, state, 'undo', 200_000, identity), state);
  assert.equal(transitionManualBrew(hybrid, state, 'start', 200_000, identity), state);
});
