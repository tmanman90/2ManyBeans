import assert from 'node:assert/strict';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { clearBrewTimerSession, readBrewTimerSession, writeBrewTimerSession } from '../src/lib/brewTimerSession.js';

const recipe = generateKalitaRecipe({}, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });
const entries = new Map();
const storage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
};
const now = Date.now();
const running = {
  phase: 'running', stepIndex: 0, startedAt: now - 20_000,
  stepStartedAt: now - 20_000, pauseStartedAt: null,
  pausedAccumMs: 0, stepPausedAccumMs: 0, completion: null,
  recipe, bean: { id: 'jar-1', name: 'Jar 1' },
};

assert.equal(writeBrewTimerSession('user-a', running, storage), true);
assert.equal(readBrewTimerSession('user-b', storage, now), null, 'a second account cannot inherit the brew');
assert.deepEqual(readBrewTimerSession('user-a', storage, now).bean, running.bean);
assert.equal(now - readBrewTimerSession('user-a', storage, now).startedAt, 20_000);

const paused = { ...running, phase: 'paused', pauseStartedAt: now - 5_000 };
writeBrewTimerSession('user-a', paused, storage);
assert.equal(readBrewTimerSession('user-a', storage, now + 20_000).pauseStartedAt, now - 5_000,
  'time in another app must remain excluded while manually paused');

writeBrewTimerSession('user-a', { ...running, startedAt: now - 7 * 60 * 60 * 1000 }, storage);
assert.equal(readBrewTimerSession('user-a', storage, now), null, 'stale sessions are discarded');

writeBrewTimerSession('user-a', running, storage);
clearBrewTimerSession('user-a', storage);
assert.equal(readBrewTimerSession('user-a', storage, now), null, 'explicit close clears recovery');

console.log('brew timer session recovery passed');
