import assert from 'node:assert/strict';
import test from 'node:test';
import { checkEvaluationIdentity, checkEnvironment, checkEgress, validatePreflight } from './ruphus-eval/capability-preflight.mjs';
test('identity must be dedicated and capped', () => {
  assert.equal(checkEvaluationIdentity({ projectId: 'eval-1', workspaceId: 'eval-a', dedicated: true, quotaUsd: 75 }).ok, true);
  assert.equal(checkEvaluationIdentity({ projectId: 'production', workspaceId: 'eval-a', dedicated: true, quotaUsd: 75 }).ok, false);
  assert.equal(checkEvaluationIdentity({ projectId: 'eval-1', workspaceId: 'eval-a', quotaUsd: 76 }).ok, false);
});
test('forbidden credentials and non-provider egress are rejected', () => {
  assert.equal(checkEnvironment({ FIREBASE_PROJECT_ID: 'x' }).ok, false); assert.equal(checkEgress('https://api.openai.com/v1').ok, true); assert.equal(checkEgress('http://api.openai.com/v1').ok, false); assert.equal(checkEgress('https://example.com').ok, false);
});
test('preflight requires every telemetry capability', () => {
  assert.equal(validatePreflight({ identity: { projectId: 'e', workspaceId: 'w', dedicated: true, quotaUsd: 75 }, env: {}, modelAccess: true, streaming: true, completeUsage: true, requestId: 'r', providerHost: 'https://api.anthropic.com' }).ok, true);
  assert.equal(validatePreflight({ identity: { projectId: 'e', workspaceId: 'w', dedicated: true, quotaUsd: 75 }, env: {}, modelAccess: true, streaming: true, completeUsage: true, requestId: 'r' }).ok, false);
  assert.equal(validatePreflight({ identity: { projectId: 'e', workspaceId: 'w', dedicated: true, quotaUsd: 75 }, env: {}, modelAccess: true, streaming: true, completeUsage: true, requestId: 'r', providerHost: 'https://api.openai.com', requestedModel: 'gpt-5.6-luna', returnedModel: 'gpt-5.6-terra' }).ok, false);
});
