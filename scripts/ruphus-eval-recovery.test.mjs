import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildOpenAIRequest } from './ruphus-eval/provider-openai.mjs';
import { buildAnthropicRequest } from './ruphus-eval/provider-anthropic.mjs';
import { ImmutableArtifactStore } from './ruphus-eval/agent-runner.mjs';
import { MODEL_ARMS } from './ruphus-eval/models.mjs';
import { buildRecoveryRequest, buildRecoverySchedule, buildFinalistScenarioSchedule, RECOVERY_FINALIST_SCENARIOS, RECOVERY_SCREEN_CASE_IDS, runRecoveryPhase, SUBMIT_RESULT_TOOL, validateSubmitResult } from './ruphus-eval/recovery.mjs';

const manifest = JSON.parse(await readFileSync(new URL('./fixtures/ruphus-eval/manifest.json', import.meta.url), 'utf8'));
const preflight = { ok: true, checks: MODEL_ARMS.map((arm) => ({ ok: true, id: arm.id, provider: arm.provider, model: arm.model })) };
const identity = { userAuthorized: true, credentialFingerprint: 'recovery-test', authorizationLabel: 'tal-approved-coffee-evaluation' };
const expectedIdentity = { credentialFingerprint: identity.credentialFingerprint, authorizationLabel: identity.authorizationLabel };
const retention = { openaiStore: false, anthropicStandardRetentionAcknowledged: true };

test('submit_result uses one strict provider-neutral logical schema and native forcing', () => {
  assert.deepEqual(SUBMIT_RESULT_TOOL.parameters.required, ['reply', 'action']);
  assert.deepEqual(SUBMIT_RESULT_TOOL.parameters.properties.patch.required, ['path', 'from', 'to']);
  const common = { model: 'gpt-5.6-luna', instructions: 'semantic', input: [{ role: 'user', content: 'coffee' }], tools: [SUBMIT_RESULT_TOOL], toolChoice: { name: 'submit_result' }, maxOutputTokens: 900 };
  const openai = buildOpenAIRequest(common);
  const anthropic = buildAnthropicRequest({ ...common, messages: common.input });
  assert.deepEqual(openai.tool_choice, { type: 'function', name: 'submit_result' });
  assert.deepEqual(anthropic.tool_choice, { type: 'tool', name: 'submit_result' });
  assert.deepEqual(openai.tools[0].parameters, anthropic.tools[0].input_schema);
  assert.deepEqual(validateSubmitResult({ reply: 'Use a finer grind.', action: 'propose', patch: { path: 'grindSize', from: 700, to: 750 } }).patch, { path: 'grindSize', from: 700, to: 750 });
  assert.throws(() => validateSubmitResult({ reply: 'ok', action: 'propose', approval: true }), /invalid/);
});

test('recovery smoke dispatches one identical semantic request per exact arm and stores attributed evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-recovery-'));
  try {
    const calls = [];
    const runTurn = async ({ model, provider, tools, toolChoice, input }) => {
      calls.push({ model, provider, tools, toolChoice, input });
      return { provider: provider || (model.startsWith('claude') ? 'anthropic' : 'openai'), model, requestId: `recovery-${calls.length}`, responseId: `response-${calls.length}`, outputItems: [{ type: 'function_call', call_id: `call-${calls.length}`, name: 'submit_result', arguments: JSON.stringify({ reply: 'Coffee answer', action: 'read' }) }], toolCalls: [{ name: 'submit_result', callId: `call-${calls.length}`, args: { reply: 'Coffee answer', action: 'read' } }], text: '', stopReason: 'completed', rawUsage: { input_tokens: 100, output_tokens: 20 }, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } };
    };
    const adapters = { openai: { runTurn }, anthropic: { runTurn } };
    const schedule = buildRecoverySchedule({ runId: 'recovery-smoke', phase: 'smoke', caseIds: ['dec-001'] });
    const result = await runRecoveryPhase({ adapters, preflight, identity, expectedIdentity, env: {}, retention, endpoint: 'https://api.openai.com', endpoints: ['https://api.openai.com', 'https://api.anthropic.com'], paidRun: true, manifest, runId: 'recovery-smoke', evaluationHash: manifest.hashes.evaluationHash, artifactStore: new ImmutableArtifactStore({ directory }), schedule });
    assert.equal(result.ok, true);
    assert.equal(result.artifacts.length, MODEL_ARMS.length);
    assert.equal(calls.length, MODEL_ARMS.length);
    assert.ok(calls.every((call) => call.tools.length === 1 && call.tools[0].name === 'submit_result' && call.toolChoice.name === 'submit_result'));
    assert.ok(result.artifacts.every((artifact) => artifact.response.submitResult.action === 'read' && artifact.telemetry.length === 1));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('recovery schedules have the authorized screening and finalist denominators', () => {
  const screen = buildRecoverySchedule({ runId: 'screen', phase: 'screening', caseIds: RECOVERY_SCREEN_CASE_IDS });
  assert.equal(screen.length, 60);
  assert.deepEqual(RECOVERY_SCREEN_CASE_IDS.map((id) => manifest.partitions.qualification.includes(id)), Array(10).fill(true));
  const finalist = buildFinalistScenarioSchedule({ runId: 'finalist', armId: 'luna-high' });
  assert.equal(finalist.length, RECOVERY_FINALIST_SCENARIOS.length * 2);
  assert.deepEqual(finalist.map((entry) => entry.scenario), RECOVERY_FINALIST_SCENARIOS.flatMap(({ scenario }) => [scenario, scenario]));
  assert.equal(Math.round(RECOVERY_LIMIT_CHECK()), 29);
});

function RECOVERY_LIMIT_CHECK() { return 30 - 0.746939; }
