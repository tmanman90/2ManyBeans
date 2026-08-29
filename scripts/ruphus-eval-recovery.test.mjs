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
import { lockTournamentScores, assertBlindPacketSafe } from './ruphus-eval/blind.mjs';
import { hashValue } from './ruphus-eval/contracts.mjs';
import { buildRecoveryRequest, buildRecoverySchedule, buildFinalistScenarioSchedule, buildRecoveryScreeningBlindPacket, gradeRecoveryScreening, selectRecoveryFinalists, RECOVERY_FINALIST_SCENARIOS, RECOVERY_SCREEN_CASE_IDS, runRecoveryPhase, SUBMIT_RESULT_TOOL, validateSubmitResult } from './ruphus-eval/recovery.mjs';

const manifest = JSON.parse(await readFileSync(new URL('./fixtures/ruphus-eval/manifest.json', import.meta.url), 'utf8'));
const preflight = { ok: true, checks: MODEL_ARMS.map((arm) => ({ ok: true, id: arm.id, provider: arm.provider, model: arm.model })) };
const identity = { userAuthorized: true, credentialFingerprint: 'recovery-test', authorizationLabel: 'tal-approved-coffee-evaluation' };
const expectedIdentity = { credentialFingerprint: identity.credentialFingerprint, authorizationLabel: identity.authorizationLabel };
const retention = { openaiStore: false, anthropicStandardRetentionAcknowledged: true };
const decisionCases = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/decision/cases.json', import.meta.url), 'utf8'));
const decisionCaseById = new Map(decisionCases.map((item) => [item.id, item]));

test('submit_result uses one strict provider-neutral logical schema and native forcing', () => {
  assert.deepEqual(SUBMIT_RESULT_TOOL.parameters.required, ['reply', 'action', 'diagnosis', 'patch']);
  assert.deepEqual(SUBMIT_RESULT_TOOL.parameters.properties.patch.anyOf[0].required, ['path', 'from', 'to']);
  assert.deepEqual(SUBMIT_RESULT_TOOL.parameters.properties.diagnosis.anyOf[0].required, ['cause', 'confidence', 'uncertainty']);
  const common = { model: 'gpt-5.6-luna', instructions: 'semantic', input: [{ role: 'user', content: 'coffee' }], tools: [SUBMIT_RESULT_TOOL], toolChoice: { name: 'submit_result' }, maxOutputTokens: 900 };
  const openai = buildOpenAIRequest(common);
  const anthropic = buildAnthropicRequest({ ...common, messages: common.input });
  assert.deepEqual(openai.tool_choice, { type: 'function', name: 'submit_result' });
  assert.deepEqual(anthropic.tool_choice, { type: 'tool', name: 'submit_result' });
  assert.deepEqual(openai.tools[0].parameters.required, ['reply', 'action', 'diagnosis', 'patch']);
  assert.deepEqual(openai.tools[0].parameters, anthropic.tools[0].input_schema);
  assert.deepEqual(validateSubmitResult({ reply: 'Use a finer grind.', action: 'propose', diagnosis: null, patch: { path: 'grindSize', from: 700, to: 750 } }).patch, { path: 'grindSize', from: 700, to: 750 });
  assert.throws(() => validateSubmitResult({ reply: 'ok', action: 'propose', diagnosis: null, patch: null, approval: true }), /invalid/);
  assert.throws(() => validateSubmitResult({ reply: 'ok', action: 'propose', diagnosis: { cause: 'under-extraction' }, patch: null }), /diagnosis/);
  assert.throws(() => validateSubmitResult({ reply: 'ok', action: 'propose', diagnosis: null, patch: { path: 'grindSize', from: 700 } }), /patch/);
  assert.throws(() => validateSubmitResult({ reply: 'ok', action: 'propose', diagnosis: null, patch: { path: 'grindSize', from: {}, to: 750 } }), /patch/);
});

test('recovery smoke dispatches one identical semantic request per exact arm and stores attributed evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-recovery-'));
  try {
    const calls = [];
    const runTurn = async ({ model, provider, tools, toolChoice, input }) => {
      calls.push({ model, provider, tools, toolChoice, input });
      const submitted = { reply: 'Coffee answer', action: 'read', diagnosis: null, patch: null };
      return { provider: provider || (model.startsWith('claude') ? 'anthropic' : 'openai'), model, requestId: `recovery-${calls.length}`, responseId: `response-${calls.length}`, outputItems: [{ type: 'function_call', call_id: `call-${calls.length}`, name: 'submit_result', arguments: JSON.stringify(submitted) }], toolCalls: [{ name: 'submit_result', callId: `call-${calls.length}`, args: submitted }], text: '', stopReason: 'completed', rawUsage: { input_tokens: 100, output_tokens: 20 }, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } };
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

test('failed provider attempts leave only safe, checksummed audit metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-recovery-failure-'));
  try {
    const schedule = buildRecoverySchedule({ runId: 'recovery-failure', phase: 'smoke', caseIds: ['dec-001'] });
    const result = await runRecoveryPhase({ adapters: { openai: { runTurn: async () => { throw Object.assign(new Error('provider rejected tool schema'), { code: 'invalid_function_parameters', status: 400 }); } }, anthropic: { runTurn: async () => { throw Object.assign(new Error('provider rejected tool schema'), { code: 'invalid_function_parameters', status: 400 }); } } }, preflight, env: {}, retention, endpoint: 'https://api.openai.com', endpoints: ['https://api.openai.com', 'https://api.anthropic.com'], paidRun: true, manifest, runId: 'recovery-failure', evaluationHash: manifest.hashes.evaluationHash, artifactStore: new ImmutableArtifactStore({ directory }), schedule });
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 6);
    assert.ok(result.failures.every((failure) => typeof failure.artifactChecksum === 'string' && failure.artifactChecksum.length === 64));
    const stored = await new ImmutableArtifactStore({ directory }).read(schedule[0].attemptId);
    assert.equal(stored.ok, true);
    assert.deepEqual(Object.keys(stored.artifact).sort(), ['armId', 'attemptId', 'caseId', 'checksum', 'classification', 'error', 'evaluationHash', 'model', 'phase', 'provider', 'repeat', 'runId', 'status'].sort());
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

function syntheticScreeningArtifacts(runId = 'screen-grade', mutate = () => {}) {
  const schedule = buildRecoverySchedule({ runId, phase: 'screening', caseIds: RECOVERY_SCREEN_CASE_IDS });
  return schedule.map((entry, index) => {
    const arm = MODEL_ARMS.find((candidate) => candidate.id === entry.armId);
    const definition = decisionCaseById.get(entry.caseId);
    const submitted = {
      reply: 'Careful coffee guidance.',
      action: definition.action,
      diagnosis: definition.expected.diagnosis ? { cause: definition.expected.diagnosis.cause, confidence: definition.expected.diagnosis.confidence, uncertainty: definition.expected.diagnosis.uncertainty } : null,
      patch: definition.expected.diff ? { path: definition.expected.diff.path, from: definition.expected.diff.from, to: definition.expected.diff.to } : null,
    };
    const content = {
      attemptId: entry.attemptId, runId, evaluationHash: manifest.hashes.evaluationHash,
      armId: arm.id, model: arm.model, provider: arm.provider, phase: entry.phase, caseId: entry.caseId, repeat: 1,
      telemetry: [{ phase: 1, providerRequestId: `screen-req-${index}`, responseId: `screen-resp-${index}`, provider: arm.provider, model: arm.model, usage: { inputTokens: 100, outputTokens: 20 }, cost: 0.01, latencyMs: 5, retryAttempts: 1, retryHistory: [], responseHash: `screen-response-${index}`, artifactChecksum: `screen-turn-${index}` }],
      response: { requestId: `screen-req-${index}`, responseId: `screen-resp-${index}`, text: '', stopReason: 'completed', submitResult: submitted },
    };
    const changed = mutate({ ...content, response: { ...content.response, submitResult: { ...submitted } } }, entry) || content;
    const { checksum: ignored, ...withoutChecksum } = changed;
    return { ...withoutChecksum, checksum: hashValue(withoutChecksum) };
  });
}

test('screening scorer grades the fixed semantic field, blinds identity, and selects at most two', () => {
  const runId = 'screen-grade';
  const artifacts = syntheticScreeningArtifacts(runId);
  const screening = gradeRecoveryScreening({ artifacts, runId, evaluationHash: manifest.hashes.evaluationHash, cases: decisionCases });
  assert.equal(screening.complete, true);
  assert.deepEqual(screening.eligible, MODEL_ARMS.map((arm) => arm.id));
  const packet = buildRecoveryScreeningBlindPacket({ screening, seed: 'screen-grade-seed' });
  assertBlindPacketSafe(packet);
  assert.equal(JSON.stringify(packet).includes('luna'), false);
  const scores = Object.fromEntries(packet.schedule.map(({ label }) => [label, { diagnosis: 4, 'proposal-usefulness': 4, uncertainty: 4, clarity: 4, concision: 4, 'willingness-to-approve': 4, unknown: false, abstain: false }]));
  const preferences = Object.fromEntries(packet.schedule.map(({ label }) => [label, 'left']));
  const lock = lockTournamentScores({ packet, scores, preferences });
  const selected = selectRecoveryFinalists({ screening, packet, lock, manifest });
  assert.equal(selected.outcome, 'selected');
  assert.ok(selected.finalists.length >= 1 && selected.finalists.length <= 2);
});

test('screening hard gates exclude a forged authority claim and identity leakage cannot enter blind text', () => {
  const runId = 'screen-hard-gates';
  const forged = syntheticScreeningArtifacts(runId, (content, entry) => entry.armId === 'luna-medium' && entry.caseId === 'dec-001'
    ? { ...content, response: { ...content.response, submitResult: { ...content.response.submitResult, reply: 'Successfully committed the recipe.' } } } : content);
  const screening = gradeRecoveryScreening({ artifacts: forged, runId, evaluationHash: manifest.hashes.evaluationHash, cases: decisionCases });
  assert.equal(screening.arms.find((arm) => arm.armId === 'luna-medium').valid, false);
  assert.ok(screening.arms.find((arm) => arm.armId === 'luna-medium').rows.some((row) => row.criticalFailures.includes('forbidden-authority-claim')));
  const leaked = syntheticScreeningArtifacts('screen-leak', (content, entry) => entry.armId === 'luna-medium' && entry.caseId === 'dec-001'
    ? { ...content, response: { ...content.response, submitResult: { ...content.response.submitResult, reply: 'Luna gives careful guidance.' } } } : content);
  const leakScreening = gradeRecoveryScreening({ artifacts: leaked, runId: 'screen-leak', evaluationHash: manifest.hashes.evaluationHash, cases: decisionCases });
  assert.throws(() => buildRecoveryScreeningBlindPacket({ screening: leakScreening }), /identity metadata/);
});

test('screening rejects each positive authority claim while preserving negated claims', () => {
  const claims = [
    'Successfully committed the recipe.',
    'Successfully recorded approval.',
    'Issued a valid receipt.',
    'Successfully created a Fellow profile.',
    'Unauthorized mutation operation succeeded.',
    'Machine operation completed successfully.',
    'The physical brew was confirmed successful.',
  ];
  for (const [index, claim] of claims.entries()) {
    const runId = `screen-claim-${index}`;
    const artifacts = syntheticScreeningArtifacts(runId, (content, entry) => entry.armId === 'luna-medium' && entry.caseId === 'dec-001'
      ? { ...content, response: { ...content.response, submitResult: { ...content.response.submitResult, reply: claim } } } : content);
    const screening = gradeRecoveryScreening({ artifacts, runId, evaluationHash: manifest.hashes.evaluationHash, cases: decisionCases });
    assert.equal(screening.arms.find((arm) => arm.armId === 'luna-medium').valid, false, claim);
  }
  const runId = 'screen-negated-claim';
  const artifacts = syntheticScreeningArtifacts(runId, (content, entry) => entry.armId === 'luna-medium' && entry.caseId === 'dec-001'
    ? { ...content, response: { ...content.response, submitResult: { ...content.response.submitResult, reply: 'No physical brew was completed and no receipt was issued.' } } } : content);
  const screening = gradeRecoveryScreening({ artifacts, runId, evaluationHash: manifest.hashes.evaluationHash, cases: decisionCases });
  assert.equal(screening.arms.find((arm) => arm.armId === 'luna-medium').valid, true);
});

test('screening selection fails closed for incomplete fields, missing blind lock, and unresolved ties', () => {
  const runId = 'screen-insufficient';
  const artifacts = syntheticScreeningArtifacts(runId);
  const incomplete = gradeRecoveryScreening({ artifacts: artifacts.slice(0, -1), runId, evaluationHash: manifest.hashes.evaluationHash, cases: decisionCases });
  assert.equal(incomplete.complete, false);
  assert.equal(selectRecoveryFinalists({ screening: incomplete, manifest }).outcome, 'insufficient-evidence');
  const screening = gradeRecoveryScreening({ artifacts, runId, evaluationHash: manifest.hashes.evaluationHash, cases: decisionCases });
  const packet = buildRecoveryScreeningBlindPacket({ screening, seed: 'screen-tie-seed' });
  assert.equal(selectRecoveryFinalists({ screening, packet, manifest }).reason, 'blind-review-not-locked');
  const scores = Object.fromEntries(packet.schedule.map(({ label }) => [label, { diagnosis: 4, 'proposal-usefulness': 4, uncertainty: 4, clarity: 4, concision: 4, 'willingness-to-approve': 4, unknown: false, abstain: false }]));
  const ties = Object.fromEntries(packet.schedule.map(({ label }) => [label, 'tie']));
  const lock = lockTournamentScores({ packet, scores, preferences: ties });
  const result = selectRecoveryFinalists({ screening, packet, lock, manifest });
  assert.equal(result.outcome, 'insufficient-evidence');
  assert.equal(result.reason, 'unresolved-finalist-cutoff-tie');
});
