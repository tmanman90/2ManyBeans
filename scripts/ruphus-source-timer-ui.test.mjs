import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('source timer UI routes canonical projections without invoking the legacy timer', async () => {
  const [modal, timer, rotation, app, outbox] = await Promise.all([
    read('src/components/HandBrewModal.jsx'),
    read('src/components/ManualSourceBrewTimer.jsx'),
    read('src/tabs/RotationTab.jsx'),
    read('src/App.jsx'),
    read('src/hooks/useRuphusAttemptOutbox.js'),
  ]);
  assert.match(modal, /recipe\?\.sourceProjection/);
  assert.match(modal, /sourceProjection \? \(/);
  assert.match(modal, /ManualSourceBrewTimer/);
  assert.match(modal, /!sourceProjection/);
  assert.match(modal, /manualSourceDisplay/);
  assert.match(modal, /manualSourceGrindGuidance/);
  assert.match(modal, /Approximate starting point from the source micron note/);
  assert.match(modal, /data-source-finish-guidance/);
  assert.match(modal, /source target, not an automatic stop/);
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
  assert.match(runner, /Start first pour/);
  assert.match(runner, /Pour finished/);
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
