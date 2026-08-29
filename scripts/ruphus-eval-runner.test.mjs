import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAgentRunner, ImmutableArtifactStore, classifyProviderError, validateColdSchedule, validateRunnerGates, validateEvaluationEnvironment, runAgentAttempt, sealCalibrationManifest } from './ruphus-eval/agent-runner.mjs';
import { runEvaluation } from './ruphus-eval/run.mjs';
import { APPROVED_DISPATCH_RESERVATION_USD, MODEL_ARMS } from './ruphus-eval/models.mjs';

const expectedIdentity = { projectId: 'eval-1', workspaceId: 'eval-a', credentialFingerprint: 'fp', quotaEvidenceId: 'quota-1', maxQuotaUsd: 30 };
const identity = { ...expectedIdentity, dedicated: true, quotaUsd: 30 };
const preflight = { identity, expectedIdentity, env: {}, modelAccess: true, streaming: true, completeUsage: true, requestId: 'preflight-1', providerHost: 'https://api.openai.com', requestedModel: 'gpt-5.6-luna', returnedModel: 'gpt-5.6-luna' };
const retention = { openaiStore: false, anthropicZdrVerified: true };
const sourceManifest = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/manifest.json', import.meta.url), 'utf8'));
const sealedManifest = sealCalibrationManifest({ manifest: sourceManifest, calibrationArtifacts: [{ caseId: 'cal-001', score: 1 }], sealedAt: '2026-08-28T00:00:00.000Z' });
const qualificationSchedule = () => sealedManifest.partitions.qualification.flatMap((caseId) => [1, 2].flatMap((repeat) => MODEL_ARMS.map((arm) => ({ armId: arm.id, phase: 'qualification', caseId, repeat, cacheRegime: 'cold' }))));

test('provider and semantic failure classes keep transport retries separate', () => {
  assert.equal(classifyProviderError({ status: 429 }), 'transient-provider');
  assert.equal(classifyProviderError({ code: 'INVALID_TOOL_INPUT' }), 'semantic-candidate-failure');
  assert.equal(classifyProviderError({ status: 400 }), 'provider-operational-failure');
});

test('calibration sealing creates an immutable decision boundary', () => {
  const sealed = sealCalibrationManifest({ manifest: { manifestVersion: 'u5-test' }, calibrationArtifacts: [{ caseId: 'cal-001', terminal: 'complete' }], sealedAt: '2026-08-28T00:00:00.000Z' });
  assert.equal(sealed.status, 'calibrated-sealed');
  assert.equal(typeof sealed.evaluationHash, 'string');
  assert.throws(() => sealCalibrationManifest({ manifest: {}, calibrationArtifacts: [{ caseId: 'dec-001' }], sealedAt: '2026-08-28T00:00:00.000Z' }), /decision-corpus/);
  assert.throws(() => { sealed.status = 'mutable'; }, TypeError);
});

test('runner gates fail closed without dispatch when identity, retention, or paid flag is absent', async () => {
  let calls = 0;
    const result = createAgentRunner({ runId: 'run-gated', evaluationHash: 'hash-gated', manifest: sealedManifest, preflight: {}, endpoint: 'https://api.openai.com', retention, adapters: { openai: { runTurn: async () => { calls += 1; } } } });
  const outcome = await result.runAttempt({ arm: 'luna-medium', attemptId: 'attempt-gated' });
  assert.equal(outcome.dispatched, false);
  assert.equal(calls, 0);
  assert.equal(result.gates().ok, false);
});

test('cold schedule requires every exact arm and rejects warm or duplicate identities', () => {
  const schedule = qualificationSchedule();
  assert.equal(validateColdSchedule(schedule, { manifest: sealedManifest }), true);
  assert.throws(() => validateColdSchedule(schedule.slice(0, 5), { manifest: sealedManifest }), /six exact arms|complete authorized phase denominator/);
  assert.throws(() => validateColdSchedule(schedule.map(({ phase, ...entry }) => entry), { manifest: sealedManifest }), /phase is not authorized/);
  assert.throws(() => validateColdSchedule(schedule.map((entry, index) => index === 0 ? { ...entry, cacheRegime: 'warm' } : entry), { manifest: sealedManifest }), /cold-cache/);
  assert.throws(() => validateColdSchedule([...schedule, schedule[0]], { manifest: sealedManifest }), /duplicate/);
  assert.throws(() => validateColdSchedule(schedule, { manifest: { ...sealedManifest, partitions: { ...sealedManifest.partitions, qualification: ['dec-002'] } } }), /authorized phase/);
});

test('phase schedules require complete frozen calibration, canary, qualification, and finalist denominators', () => {
  const full = (phase, cases, arms, repeats) => cases.flatMap((caseId) => Array.from({ length: repeats }, (_, index) => arms.map((armId) => ({ armId, phase, caseId, repeat: index + 1, cacheRegime: 'cold' }))).flat());
  const armIds = MODEL_ARMS.map((arm) => arm.id);
  assert.equal(validateColdSchedule(full('calibration', sealedManifest.partitions.calibration, armIds, 2), { manifest: sealedManifest }), true);
  assert.equal(validateColdSchedule(full('tool-canary', sealedManifest.partitions['tool-canary'], armIds, 1), { manifest: sealedManifest }), true);
  assert.equal(validateColdSchedule(full('qualification', sealedManifest.partitions.qualification, armIds, 2), { manifest: sealedManifest }), true);
  assert.equal(validateColdSchedule(full('finalist-decision', sealedManifest.partitions.finalistDecision, armIds.slice(0, 2), 2), { manifest: sealedManifest }), true);
  assert.throws(() => validateColdSchedule(full('qualification', sealedManifest.partitions.qualification.slice(0, 1), armIds, 2), { manifest: sealedManifest }), /complete authorized phase denominator/);
  assert.throws(() => validateColdSchedule([...full('qualification', sealedManifest.partitions.qualification, armIds, 2), ...full('finalist-decision', sealedManifest.partitions.finalistDecision, armIds.slice(0, 2), 2)], { manifest: sealedManifest }), /one complete phase/);
});

test('provisional calibration phase dispatches one bounded turn per exact arm/case', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u5-calibration-'));
  try {
    const schedule = sealedManifest.partitions.calibration.flatMap((caseId) => MODEL_ARMS.map((arm) => ({ armId: arm.id, phase: 'calibration', caseId, repeat: 1, cacheRegime: 'cold' })));
    const runTurn = async ({ model }) => ({ provider: model.startsWith('claude-') ? 'anthropic' : 'openai', model, requestId: `cal-${model}`, outputItems: [], content: [], text: 'calibrated', toolCalls: [], stopReason: 'completed', rawUsage: { input_tokens: 1, output_tokens: 1 }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } });
    const runner = createAgentRunner({ adapters: { openai: { runTurn }, anthropic: { runTurn } }, artifactStore: new ImmutableArtifactStore({ directory }), runId: 'calibration-run', evaluationHash: sourceManifest.hashes.evaluationHash, manifest: sourceManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
    const result = await runner.runSchedule({ schedule });
    assert.equal(result.ok, true);
    assert.equal(result.artifacts.length, 36);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('runner records attributed usage, retries only transient failures, and writes no-overwrite checksummed artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u5-'));
  try {
    const store = new ImmutableArtifactStore({ directory });
    let calls = 0;
    const adapter = { runTurn: async () => { calls += 1; if (calls === 1) throw Object.assign(new Error('rate limited'), { status: 429 }); return { provider: 'openai', model: 'gpt-5.6-luna', requestId: 'provider-1', outputItems: [], text: 'done', toolCalls: [], stopReason: 'completed', rawUsage: { input_tokens: 100, output_tokens: 20 }, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } }; } };
    const artifact = await runAgentAttempt({ adapter, arm: 'luna-medium', attemptId: 'attempt-1', artifactStore: store, retry: { maxAttempts: 2 } });
    assert.equal(calls, 2);
    assert.equal(artifact.telemetry[0].requestId, 'provider-1');
    assert.equal(artifact.telemetry[0].retryHistory[0].status, 429);
    assert.equal(artifact.telemetry[0].providerRequestId, 'provider-1');
    assert.equal(typeof artifact.telemetry[0].artifactChecksum, 'string');
    assert.equal(typeof artifact.attemptBinding, 'string');
    assert.equal((await store.read('attempt-1')).ok, true);
    await assert.rejects(() => store.write('attempt-1', { changed: true }), /overwrite/);
    assert.equal(APPROVED_DISPATCH_RESERVATION_USD, 27.798201000000006);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('runner preserves every parallel function call in the stateless continuation', async () => {
  const inputs = [];
  let turn = 0;
  const adapter = { runTurn: async (request) => {
    inputs.push(request);
    turn += 1;
    if (turn === 1) return { provider: 'openai', model: 'gpt-5.6-luna', requestId: 'multi-1', outputItems: [{ type: 'function_call', call_id: 'one', name: 'readCoffee', arguments: '{}' }, { type: 'function_call', call_id: 'two', name: 'readTastings', arguments: '{}' }], text: '', toolCalls: [{ callId: 'one', name: 'readCoffee', args: {} }, { callId: 'two', name: 'readTastings', args: {} }], stopReason: 'tool_calls', rawUsage: { input_tokens: 10, output_tokens: 5 }, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } };
    return { provider: 'openai', model: 'gpt-5.6-luna', requestId: 'multi-2', outputItems: [], text: 'done', toolCalls: [], stopReason: 'completed', rawUsage: { input_tokens: 20, output_tokens: 5 }, usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } };
  } };
  const called = [];
  const artifact = await runAgentAttempt({ adapter, arm: 'luna-medium', attemptId: 'attempt-multi', maxTurns: 2, tools: { call: async (name) => { called.push(name); return { ok: true, name }; } } });
  assert.deepEqual(called, ['readCoffee', 'readTastings']);
  assert.equal(inputs[1].input.length, 2);
  assert.deepEqual(inputs[1].input.map((item) => item.call_id), ['one', 'two']);
  assert.equal(artifact.telemetry.length, 2);
});

test('runner gate evidence requires HTTPS provider host and verified retention', () => {
  assert.equal(validateRunnerGates({ preflight, endpoint: 'http://api.openai.com', retention, paidRun: true }).ok, false);
  assert.equal(validateRunnerGates({ preflight, endpoint: 'https://api.openai.com', retention: { openaiStore: true, anthropicZdrVerified: false }, paidRun: true }).ok, false);
  assert.throws(() => createAgentRunner({ runId: 'bad-reserve', evaluationHash: 'bad-reserve', preflight, endpoint: 'https://api.openai.com', retention, paidRun: true, reservationUsd: 30 }), /exact approved/);
  assert.equal(validateEvaluationEnvironment({ OPENAI_API_KEY: 'injected-only', RUPHUS_EVAL_RUN_ID: 'r' }).ok, true);
  assert.equal(validateEvaluationEnvironment({ AWS_SECRET_ACCESS_KEY: 'must-not-enter' }).ok, false);
  assert.equal(validateRunnerGates({ preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true, manifest: sealedManifest }).ok, false);
});

test('resumable schedule skips only checksum-valid attempts under one lease', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u5-schedule-'));
  try {
    let calls = 0;
    const adapters = {
      openai: { runTurn: async ({ model }) => { calls += 1; return { provider: 'openai', model, requestId: `schedule-${calls}`, outputItems: [], text: 'done', toolCalls: [], stopReason: 'completed', rawUsage: { input_tokens: 10, output_tokens: 5 }, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } }; } },
      anthropic: { runTurn: async ({ model }) => { calls += 1; return { provider: 'anthropic', model, requestId: `schedule-${calls}`, content: [], text: 'done', toolCalls: [], stopReason: 'end_turn', rawUsage: { input_tokens: 10, output_tokens: 5 }, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: false } }; } },
    };
    const runner = createAgentRunner({ adapters, artifactStore: new ImmutableArtifactStore({ directory }), runId: 'schedule-run', evaluationHash: sealedManifest.evaluationHash, manifest: sealedManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
    const schedule = qualificationSchedule();
    const first = await runner.runSchedule({ schedule });
    assert.equal(first.ok, true);
    assert.equal(first.artifacts.length, 240);
    assert.equal(calls, 240);
    const resumed = await runner.runSchedule({ schedule });
    assert.equal(resumed.ok, true);
    assert.equal(calls, 240);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('runner rejects a hash that is not the sealed manifest identity', () => {
  const runner = createAgentRunner({ runId: 'hash-mismatch', evaluationHash: 'different-run-hash', manifest: sealedManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
  assert.equal(runner.gates().ok, false);
  assert.match(runner.gates().errors.join(' '), /sealed manifest/);
});

test('concurrent schedules cannot acquire a second lease for the same run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u5-lease-'));
  try {
  let release;
  const runTurn = async ({ model }) => { if (!release) await new Promise((resolve) => { release = resolve; }); return { provider: model.startsWith('claude-') ? 'anthropic' : 'openai', model, requestId: `lease-${model}`, outputItems: [], content: [], text: 'done', toolCalls: [], stopReason: 'completed', rawUsage: { input_tokens: 1, output_tokens: 1 }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } }; };
  const adapters = { openai: { runTurn }, anthropic: { runTurn } };
  const artifactStore = new ImmutableArtifactStore({ directory });
  const runner = createAgentRunner({ adapters, artifactStore, runId: 'lease-run', evaluationHash: sealedManifest.evaluationHash, manifest: sealedManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
  const competingRunner = createAgentRunner({ adapters, artifactStore, runId: 'lease-run', evaluationHash: sealedManifest.evaluationHash, manifest: sealedManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
  const schedule = qualificationSchedule();
  const first = runner.runSchedule({ schedule, retry: { maxAttempts: 1 } });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  await assert.rejects(() => competingRunner.runSchedule({ schedule }), /lease is already held/);
  release();
  const outcome = await first;
  assert.equal(outcome.ok, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('paid runner requires a real artifact store and cumulative reservation before dispatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u5-budget-'));
  try {
    const artifactStore = new ImmutableArtifactStore({ directory });
    const runId = 'budget-run';
    const evaluationHash = sealedManifest.evaluationHash;
    const terra = MODEL_ARMS.find((arm) => arm.id === 'terra-medium');
    const estimated = 0.0316;
    await artifactStore.write('prior-budget', { runId, evaluationHash, attemptId: 'prior-budget', armId: terra.id, model: terra.model, provider: terra.provider, telemetry: Array.from({ length: 650 }, (_, index) => ({ attemptId: `prior-budget-${index}`, armId: terra.id, phase: 1, retryAttempts: 1, cost: estimated })) });
    let calls = 0;
    const adapters = { openai: { runTurn: async ({ model }) => { calls += 1; return { provider: 'openai', model, requestId: 'must-not-dispatch', outputItems: [], text: 'done', toolCalls: [], rawUsage: { input_tokens: 1, output_tokens: 1 }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } }; } }, anthropic: { runTurn: async () => { calls += 1; throw new Error('must not dispatch'); } } };
    const runner = createAgentRunner({ adapters, artifactStore, runId, evaluationHash, manifest: sealedManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
  const schedule = qualificationSchedule();
    const single = await runner.runAttempt({ arm: 'luna-medium', attemptId: 'single-paid' });
    assert.equal(single.dispatched, false);
    await assert.rejects(() => runner.runAttempt({ arm: 'luna-medium', attemptId: 'over-limit', maxTurns: 6 }), /frozen five-turn/);
    const first = await runner.runSchedule({ schedule });
    assert.equal(first.ok, false);
    assert.equal(first.classification, 'budget-stop');
    assert.equal(calls, 3);
    const resumed = await runner.runSchedule({ schedule });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.classification, 'budget-stop');
    assert.equal(calls, 3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('tool canary permits five sequential provider continuations and rejects a sixth', async () => {
  const canarySchedule = MODEL_ARMS.map((arm) => ({ armId: arm.id, phase: 'tool-canary', caseId: 'canary-001', repeat: 1, cacheRegime: 'cold' }));
  const makeAdapter = ({ endless = false } = {}) => {
    const counts = new Map();
    const runTurn = async ({ model, effort, thinking }) => {
      const key = `${model}:${effort || thinking || 'disabled'}`;
      const turn = (counts.get(key) || 0) + 1; counts.set(key, turn);
      const tool = endless || turn < 5;
      return { provider: model.startsWith('claude-') ? 'anthropic' : 'openai', model, requestId: `canary-${key}-${turn}`, outputItems: tool ? [{ type: 'function_call', call_id: `call-${key}-${turn}`, name: 'readCoffee', arguments: '{}' }] : [], content: [], text: '', toolCalls: tool ? [{ callId: `call-${key}-${turn}`, name: 'readCoffee', args: {} }] : [], stopReason: tool ? 'tool_calls' : 'completed', rawUsage: { input_tokens: 1, output_tokens: 1 }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: !model.startsWith('claude-') } };
    };
    return { adapters: { openai: { runTurn }, anthropic: { runTurn } }, counts };
  };
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u5-canary-'));
  try {
    const good = makeAdapter();
    const runner = createAgentRunner({ adapters: good.adapters, artifactStore: new ImmutableArtifactStore({ directory }), runId: 'canary-good', evaluationHash: sealedManifest.evaluationHash, manifest: sealedManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
    const result = await runner.runSchedule({ schedule: canarySchedule, toolsFor: () => ({ call: async () => ({ ok: true }) }) });
    assert.equal(result.ok, true);
    assert.deepEqual([...good.counts.values()], [5, 5, 5, 5, 5, 5]);
  } finally { await rm(directory, { recursive: true, force: true }); }
  const secondDirectory = await mkdtemp(join(tmpdir(), 'ruphus-u5-canary-limit-'));
  try {
    const endless = makeAdapter({ endless: true });
    const runner = createAgentRunner({ adapters: endless.adapters, artifactStore: new ImmutableArtifactStore({ directory: secondDirectory }), runId: 'canary-limit', evaluationHash: sealedManifest.evaluationHash, manifest: sealedManifest, preflight, env: {}, endpoint: 'https://api.openai.com', retention, paidRun: true });
    const result = await runner.runSchedule({ schedule: canarySchedule, toolsFor: () => ({ call: async () => ({ ok: true }) }) });
    assert.equal(result.ok, false);
    assert.equal(result.classification, 'semantic-candidate-failure');
    assert.deepEqual([...endless.counts.values()], [5]);
  } finally { await rm(secondDirectory, { recursive: true, force: true }); }
});

test('top-level runner fails closed before schedule or provider dispatch without identity evidence', async () => {
  let probes = 0;
  const result = await runEvaluation({ adapters: [{ provider: 'openai', probe: async () => { probes += 1; } }], env: {}, endpoint: 'https://api.openai.com', paidRun: true });
  assert.equal(result.dispatched, false);
  assert.equal(result.classification, 'insufficient-evidence');
  assert.equal(probes, 0);
});

test('top-level dispatch requires sealed calibration and every arm preflight before mock calls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u5-top-level-'));
  try {
  let calls = 0;
  const adapters = [
    { provider: 'openai', probe: (arm) => ({ modelAccess: true, streaming: true, completeUsage: true, requestId: `pre-${arm.id}`, providerHost: 'https://api.openai.com', returnedModel: arm.model }), runTurn: async ({ model }) => ({ provider: 'openai', model, requestId: `mock-${++calls}`, outputItems: [], text: 'ok', toolCalls: [], rawUsage: { input_tokens: 1, output_tokens: 1 }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } }) },
    { provider: 'anthropic', probe: (arm) => ({ modelAccess: true, streaming: true, completeUsage: true, requestId: `pre-${arm.id}`, providerHost: 'https://api.anthropic.com', returnedModel: arm.model }), runTurn: async ({ model }) => ({ provider: 'anthropic', model, requestId: `mock-${++calls}`, content: [], text: 'ok', toolCalls: [], rawUsage: { input_tokens: 1, output_tokens: 1 }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: false } }) },
  ];
  const outcome = await runEvaluation({ adapters, identity, expectedIdentity, env: {}, retention, endpoints: ['https://api.openai.com', 'https://api.anthropic.com'], paidRun: true, manifest: sealedManifest, runId: 'top-level-run', evaluationHash: sealedManifest.evaluationHash, artifactStore: new ImmutableArtifactStore({ directory }), schedule: qualificationSchedule(), dispatch: true });
  assert.equal(outcome.ok, true);
  assert.equal(calls, 240);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
