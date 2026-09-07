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

test('timer dismissal is wired to the durable app outbox and excluded from automatic launch', async () => {
  const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(await read('src/App.jsx'), /stage === 'dismissed'/);
  assert.match(await read('src/App.jsx'), /onDismissRuphusAttempt=\{dismissRuphusAttempt\}/);
  assert.match(await read('src/tabs/RotationTab.jsx'), /onDismissAttempt=\{onDismissRuphusAttempt\}/);
  assert.match(await read('src/components/HandBrewModal.jsx'), /onDismissAttempt\?\.\(attemptId\)/);
});
