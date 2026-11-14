import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dismissing a trial survives remount without deleting its recipe or login', async () => {
  const source = await readFile(new URL('../src/hooks/useRuphusAttemptOutbox.js', import.meta.url), 'utf8');
  let state;
  const storage = new Map([['firebase:authUser', 'signed-in']]);
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  globalThis.__attemptHooks = {
    useCallback: fn => fn,
    useEffect: fn => fn(),
    useState: init => {
      state = init();
      return [state, value => { state = typeof value === 'function' ? value(state) : value; }];
    },
  };
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(source.replace(
      /import .* from 'react';/,
      'const { useCallback, useEffect, useState } = globalThis.__attemptHooks;'
    )).toString('base64')}`);
    const hook = module.useRuphusAttemptOutbox('dev-owner');
    hook.put({ id: 'trial', coffeeId: 'coffee', snapshot: { coffeeGrams: 14 } });
    hook.dismiss('different-trial');
    assert.equal(state.stage, 'brew', 'stale callbacks cannot dismiss a newer trial');
    hook.dismiss('trial');
    const remounted = module.useRuphusAttemptOutbox('dev-owner');
    assert.equal(remounted.attempt.stage, 'dismissed');
    assert.deepEqual(remounted.attempt.snapshot, { coffeeGrams: 14 });
    assert.equal(storage.get('firebase:authUser'), 'signed-in');
    remounted.put({ id: 'trial', coffeeId: 'coffee', snapshot: { coffeeGrams: 14 } });
    assert.equal(state.stage, 'brew', 'an explicit new handoff can start the trial again');
  } finally {
    delete globalThis.localStorage;
    delete globalThis.__attemptHooks;
  }
});

test('recipe and timer dismissal are wired to the durable app outbox and excluded from automatic launch', async () => {
  const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(await read('src/App.jsx'), /stage === 'dismissed'/);
  assert.match(await read('src/App.jsx'), /onDismissRuphusAttempt=\{dismissRuphusAttempt\}/);
  assert.match(await read('src/tabs/RotationTab.jsx'), /onDismissAttempt=\{onDismissRuphusAttempt\}/);
  const modal = await read('src/components/HandBrewModal.jsx');
  assert.match(modal, /const handleDismiss = useCallback\(/);
  const modalSheet = modal.slice(modal.indexOf('<Modal'), modal.indexOf('{\/\* Loading state'));
  assert.match(modalSheet, /onClose=\{handleDismiss\}/, 'closing the recipe sheet dismisses the attempt');
  const sourcePreview = modal.slice(modal.indexOf('<SourceProjectionPreview'), modal.indexOf('{\/\* Hot recipe display'));
  assert.match(sourcePreview, /onClose=\{handleDismiss\}/, 'source preview Back to chat dismisses the attempt');
  assert.match(modal, /handleClose\(\);\s*onStartTasting\?\.\(beanId, attemptId\)/, 'tasting handoff retains the non-dismiss close path');
  assert.match(modal, /const handleTimerClose = useCallback\(/);
  assert.equal((modal.match(/onClose=\{handleTimerClose\}/g) || []).length, 2, 'source and generated timers share dismissal');
  assert.match(modal, /setTimerRecipeOverride\(null\);\s*onDismissAttempt\?\.\(attemptId\);/);
});
