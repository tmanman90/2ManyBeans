import assert from 'node:assert/strict';
import test from 'node:test';
import { checkEvaluationIdentity, checkEnvironment, checkEgress, validatePreflight, runPreflight } from './ruphus-eval/capability-preflight.mjs';
import { createOpenAIAdapter } from './ruphus-eval/provider-openai.mjs';
import { createAnthropicAdapter } from './ruphus-eval/provider-anthropic.mjs';
const expected = { credentialFingerprint: 'fp', authorizationLabel: 'tal-approved-coffee-evaluation' };
const actual = { ...expected, userAuthorized: true };
test('identity requires explicit authorization and immutable credential evidence', () => {
  assert.equal(checkEvaluationIdentity(actual, expected).ok, true);
  assert.equal(checkEvaluationIdentity({ ...actual, projectId: 'production' }, expected).ok, false);
  assert.equal(checkEvaluationIdentity({ ...actual, userAuthorized: false }, expected).ok, false);
  assert.equal(checkEvaluationIdentity({ ...actual, credentialFingerprint: '' }, expected).ok, false);
  assert.equal(checkEvaluationIdentity({ ...actual, authorizationLabel: 'other' }, expected).ok, false);
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
  const unauthorized = await runPreflight({ identity: { ...actual, userAuthorized: false }, expectedIdentity: expected, env: {}, adapters });
  assert.equal(unauthorized.ok, false); assert.equal(calls, 0);
  const forbiddenEnv = await runPreflight({ identity: actual, expectedIdentity: expected, env: { FIREBASE_PROJECT_ID: 'x' }, adapters });
  assert.equal(forbiddenEnv.ok, false); assert.equal(calls, 0);
});

function openAIClient({ wrongModel = false, requestId = 'probe-openai' } = {}) {
  return { responses: { create: async (request) => { const stream = (async function* () { yield { type: 'response.completed', response: { id: 'response-probe', model: wrongModel ? 'gpt-5.6-terra' : request.model, status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 1 } } }; })(); if (requestId) stream._request_id = requestId; return stream; } } };
}
function anthropicClient({ wrongModel = false, requestId = 'probe-anthropic' } = {}) {
  return { messages: { create: async (request) => { const stream = (async function* () { yield { type: 'message_start', message: { id: 'message-probe', model: wrongModel ? 'claude-sonnet-5-wrong' : request.model, usage: { input_tokens: 1 } } }; yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }; yield { type: 'message_stop' }; })(); if (requestId) stream._request_id = requestId; return stream; } } };
}

test('real injected adapters probe all six exact arms without provider persistence', async () => {
  const result = await runPreflight({
    identity: actual, expectedIdentity: expected, env: {},
    adapters: [createOpenAIAdapter({ client: openAIClient() }), createAnthropicAdapter({ client: anthropicClient() })],
  });
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 6);
  assert.ok(result.checks.every((check) => check.ok && check.modelAccess && check.streaming && check.completeUsage && check.requestId));
});

test('real adapter probe mismatch or missing request telemetry fails closed', async () => {
  const mismatch = await runPreflight({ identity: actual, expectedIdentity: expected, env: {}, adapters: [createOpenAIAdapter({ client: openAIClient({ wrongModel: true }) }), createAnthropicAdapter({ client: anthropicClient() })] });
  assert.equal(mismatch.ok, false);
  const missingRequest = await runPreflight({ identity: actual, expectedIdentity: expected, env: {}, adapters: [createOpenAIAdapter({ client: openAIClient({ requestId: null }) }), createAnthropicAdapter({ client: anthropicClient() })] });
  assert.equal(missingRequest.ok, false);
});
