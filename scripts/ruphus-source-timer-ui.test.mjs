import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SWITCH_SOURCES } from '../src/data/manualSources/switch.js';
import { projectManualSource } from '../src/lib/manualSourceProjection.js';
import { manualSourceRecipeView } from '../src/lib/manualSourceRecipeView.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('source recipe view preserves native mL checkpoints and qualitative grind copy', () => {
  const source = SWITCH_SOURCES.find((record) => record.id === 'hario-switch-03-matt-winton-hybrid-24-2022');
  const projection = projectManualSource(source, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch',
    filter: 'v60-03-paper', material: 'glass', mode: 'hot',
  });
  const view = manualSourceRecipeView({ sourceProjection: projection });
  assert.equal(view.sourceWaterLabel, '360mL');
  assert.equal(view.ratio, null, 'mL source must not receive an invented mass ratio');
  assert.equal(view.steps.find((step) => step.id === 'main').waterUnit, 'mL');
  assert.equal(view.steps.find((step) => step.id === 'main').waterTotal, 360);
  assert.equal(view.sourceAuthor, 'Matt Winton / HARIO');
  assert.match(view.grindSize.description, /same setting as the source/i);
  assert.equal(view.sourceProjection, projection, 'source projection remains the execution authority');
});

test('iced source view never renders an invented mL-to-gram summary', () => {
  const source = SWITCH_SOURCES.find((record) => record.mode === 'iced');
  const equipment = source.equipment;
  const projection = projectManualSource(source, {
    device: 'v60', variant: 'switch', size: equipment.size, model: equipment.model,
    filter: equipment.filter, material: equipment.material, mode: 'iced',
  });
  const view = manualSourceRecipeView({ sourceProjection: projection });
  assert.equal(view.isIced, true);
  assert.equal(view.waterGrams, undefined);
  assert.equal(view.sourceWaterLabel, '200mL');
  assert.equal(view.ratio, null);
  assert.equal(view.sourceIceLabel, '150g');
});

test('source timer UI routes canonical projections through the shared recipe sheet', async () => {
  const [modal, timer, rotation, app, outbox, view] = await Promise.all([
    read('src/components/HandBrewModal.jsx'),
    read('src/components/ManualSourceBrewTimer.jsx'),
    read('src/tabs/RotationTab.jsx'),
    read('src/App.jsx'),
    read('src/hooks/useRuphusAttemptOutbox.js'),
    read('src/lib/manualSourceRecipeView.js'),
  ]);
  assert.match(modal, /recipe\?\.sourceProjection/);
  assert.doesNotMatch(modal, /<ManualSourceBrewTimer/);
  assert.match(modal, /sourceTimerState=\{sourceTimerState\}/);
  assert.match(modal, /sourceTimerBinding=\{sourceTimerBinding\}/);
  assert.match(modal, /!sourceProjection/);
  assert.match(modal, /manualSourceRecipeView/);
  assert.match(modal, /data-source-attribution/);
  assert.match(modal, /data-grind-adaptation-disclosure/);
  assert.match(view, /manualSourceDisplay/);
  assert.match(view, /sourceProjection: projection/);
  assert.match(view, /sourceWaterLabel/);
  assert.match(timer, /projection\.sourceExecution/);
  assert.match(timer, /sourceTimerIdentity/);
  assert.match(timer, /sourceEvents/);
  assert.match(timer, /never operates a valve/);
  assert.match(rotation, /sourceTimerState/);
  assert.match(rotation, /onSourceTimerStateChange/);
  assert.match(app, /onUpdateRuphusAttempt=\{updateRuphusAttempt\}/);
  assert.match(outbox, /expectedAttemptId/);
});

test('source UI fixture exercises native units and explicit confirmation controls', async () => {
  const fixture = await read('scripts/ruphus-source-timer-ui-fixture.jsx');
  const runner = await read('scripts/verify-ruphus-source-timer-ui.mjs');
  assert.match(fixture, /hario-switch-03-matt-winton-hybrid-24-2022/);
  assert.match(fixture, /projectManualSource/);
  assert.match(fixture, /unsupported/);
  assert.match(runner, /Start brew timer/);
  assert.match(runner, /Finish brew/);
  assert.match(runner, /guided execution is unavailable/);
  assert.match(runner, /automaticEvents: false/);
});

test('source timer persistence rejects stale owner-attempt callbacks', async () => {
  const source = await read('src/hooks/useRuphusAttemptOutbox.js');
  let state;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  globalThis.__attemptHooks = {
    useCallback: fn => fn,
    useEffect: fn => fn(),
    useState: init => {
      state = typeof init === 'function' ? init() : init;
      return [state, value => { state = typeof value === 'function' ? value(state) : value; }];
    },
  };
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(source.replace(
      /import .* from 'react';/,
      'const { useCallback, useEffect, useState } = globalThis.__attemptHooks;'
    )).toString('base64')}`);
    const hook = module.useRuphusAttemptOutbox('owner-1');
    hook.put({ id: 'attempt-a', coffeeId: 'coffee-a', snapshot: { sourceProjection: true } });
    hook.update({ sourceTimerState: { events: { 'stale:start': 1 } } }, 'attempt-b');
    assert.equal(state.sourceTimerState, undefined, 'a remounted source cannot write into another attempt');
    assert.doesNotMatch(storage.get('ruphus-attempt-outbox:owner-1'), /stale:start/);
    hook.update({ sourceTimerState: { events: { 'bloom:start': 1 } } }, 'attempt-a');
    assert.deepEqual(state.sourceTimerState, { events: { 'bloom:start': 1 } });
    assert.match(storage.get('ruphus-attempt-outbox:owner-1'), /bloom:start/);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.__attemptHooks;
  }
});
