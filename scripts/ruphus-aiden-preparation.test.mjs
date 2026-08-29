import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareRuphusAttempt, reconcileRuphusAttempt } from '../api/_lib/ruphusAidenPreparation.js';

const snapshot = { profileType: 0, title: 'ignored', ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 1, ssPulsesInterval: 20, ssPulseTemperatures: [96], batchPulsesEnabled: true, batchPulsesNumber: 1, batchPulsesInterval: 30, batchPulseTemperatures: [96], modelMetadata: 'must not reach Fellow' };

test('Aiden preparation projects only the attempt snapshot and records prepared state', async () => {
  let received;
  const result = await prepareRuphusAttempt({ attempt: { id: 'attempt-1', status: 'preparing', snapshot }, bean: { id: 'bean-1', name: 'Kenya' }, adapter: async (profile) => { received = profile; return { profileId: 'fellow-1', link: 'https://example.test' }; }, now: '2026-08-29T12:00:00.000Z' });
  assert.equal(result.attempt.status, 'profile_prepared');
  assert.equal(result.attempt.externalId, 'fellow-1');
  assert.equal(received.title, 'Kenya');
  assert.equal(received.modelMetadata, undefined);
});

test('Aiden preparation marks timeout uncertain for reconciliation', async () => {
  const result = await prepareRuphusAttempt({ attempt: { id: 'attempt-2', status: 'preparing', snapshot }, bean: { id: 'bean-1', name: 'Kenya' }, adapter: async () => { throw Object.assign(new Error('timeout'), { code: 'timeout' }); } });
  assert.equal(result.attempt.status, 'uncertain');
});

test('uncertain Aiden preparation reconciles an existing external profile without a new create', async () => {
  const result = await reconcileRuphusAttempt({ attempt: { id: 'attempt-3', status: 'uncertain', externalId: 'fellow-3' }, adapter: { reconcile: async ({ attemptId, externalId }) => ({ profileId: externalId, link: `https://example.test/${attemptId}` }) } });
  assert.equal(result.attempt.status, 'profile_prepared');
  assert.equal(result.attempt.externalId, 'fellow-3');
});

test('server Aiden boundary accepts an attempt ID rather than a client recipe', async () => {
  const source = await readFile(new URL('../api/aiden.js', import.meta.url), 'utf8');
  assert.match(source, /attemptId/);
  assert.match(source, /Object\.keys\(body\)\.some\(\(key\) => key !== 'attemptId'\)/);
  assert.match(source, /toAidenProfile\(attempt\.snapshot/);
  assert.match(source, /status: 'preparing'/);
  assert.match(source, /status: 'profile_prepared'/);
});
