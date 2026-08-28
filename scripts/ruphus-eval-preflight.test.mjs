import assert from 'node:assert/strict';
import test from 'node:test';
import { checkEvaluationIdentity, checkEnvironment, checkEgress, validatePreflight, runPreflight } from './ruphus-eval/capability-preflight.mjs';
const expected = { projectId: 'eval-1', workspaceId: 'eval-a', credentialFingerprint: 'fp', quotaEvidenceId: 'quota-1', maxQuotaUsd: 30 };
const actual = { ...expected, dedicated: true, quotaUsd: 30 };
test('identity must be dedicated and capped', () => {
  assert.equal(checkEvaluationIdentity(actual, expected).ok, true);
  assert.equal(checkEvaluationIdentity({ ...actual, projectId: 'production' }, expected).ok, false);
  assert.equal(checkEvaluationIdentity({ ...actual, quotaUsd: 31 }, expected).ok, false);
  assert.equal(checkEvaluationIdentity({ ...actual, quotaUsd: Number.NaN }, expected).ok, false);
  assert.equal(checkEvaluationIdentity({ ...actual, quotaUsd: '75' }, expected).ok, false);
  assert.equal(checkEvaluationIdentity(actual).ok, false);
});
test('forbidden credentials and non-provider egress are rejected', () => {
  assert.equal(checkEnvironment({ FIREBASE_PROJECT_ID: 'x' }).ok, false); assert.equal(checkEgress('https://api.openai.com/v1').ok, true); assert.equal(checkEgress('http://api.openai.com/v1').ok, false); assert.equal(checkEgress('https://example.com').ok, false);
});
test('preflight requires every telemetry capability', () => {
  assert.equal(validatePreflight({ identity: actual, expectedIdentity: expected, env: {}, modelAccess: true, streaming: true, completeUsage: true, requestId: 'r', providerHost: 'https://api.anthropic.com', requestedModel: 'claude-sonnet-5', returnedModel: 'claude-sonnet-5' }).ok, true);
  assert.equal(validatePreflight({ identity: actual, expectedIdentity: expected, env: {}, modelAccess: true, streaming: true, completeUsage: true, requestId: 'r' }).ok, false);
  assert.equal(validatePreflight({ identity: actual, expectedIdentity: expected, env: {}, modelAccess: true, streaming: true, completeUsage: true, requestId: 'r', providerHost: 'https://api.openai.com', requestedModel: 'gpt-5.6-luna', returnedModel: 'gpt-5.6-terra' }).ok, false);
});
test('probe cannot forge canonical arm attribution', async () => {
  const probe = { armId: 'terra-medium', model: 'gpt-5.6-terra', modelAccess: true, streaming: true, completeUsage: true, requestId: 'r', providerHost: 'https://api.openai.com', returnedModel: 'gpt-5.6-luna' };
  await assert.rejects(() => runPreflight({ identity: { ...actual, provider: 'openai' }, expectedIdentity: expected, env: {}, adapters: [{ provider: 'openai', probe: () => probe }, { provider: 'anthropic', probe: () => ({ ...probe, providerHost: 'https://api.anthropic.com', returnedModel: 'claude-sonnet-5', model: 'claude-sonnet-5' }) }] }), /override canonical/);
});
test('all six exact arms complete an attributable preflight', async () => {
  const adapters = [{ provider: 'openai', probe: (arm) => ({ modelAccess: true, streaming: true, completeUsage: true, requestId: `r-${arm.id}`, providerHost: 'https://api.openai.com', returnedModel: arm.model }) }, { provider: 'anthropic', probe: (arm) => ({ modelAccess: true, streaming: true, completeUsage: true, requestId: `r-${arm.id}`, providerHost: 'https://api.anthropic.com', returnedModel: arm.model }) }];
  const result = await runPreflight({ identity: { ...actual, provider: 'evaluation' }, expectedIdentity: expected, env: {}, adapters });
  assert.equal(result.ok, true); assert.equal(result.checks.length, 6); assert.ok(result.checks.every((check) => check.ok && check.id === check.armId));
});
test('invalid setup fails before invoking any provider probe', async () => {
  let calls = 0;
  const adapters = [{ provider: 'openai', probe: () => { calls += 1; throw new Error('probe must not run'); } }, { provider: 'anthropic', probe: () => { calls += 1; throw new Error('probe must not run'); } }];
  const overCap = await runPreflight({ identity: { ...actual, quotaUsd: 31 }, expectedIdentity: expected, env: {}, adapters });
  assert.equal(overCap.ok, false); assert.equal(calls, 0);
  const forbiddenEnv = await runPreflight({ identity: actual, expectedIdentity: expected, env: { FIREBASE_PROJECT_ID: 'x' }, adapters });
  assert.equal(forbiddenEnv.ok, false); assert.equal(calls, 0);
});
