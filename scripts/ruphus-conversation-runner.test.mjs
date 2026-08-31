import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFixtureManifest } from './ruphus-conversation-runner.mjs';
import { buildRotationSnapshot } from '../api/_lib/ruphusEvidence.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { gradeReply } from '../src/lib/ruphus/conversationContract.js';
import {
  appendSmokeLedger, branchAwareTurns, canStartFull, configuredCallMaximum, createCostGuard, deriveFixtureTrace, endpointCallMultiplier, fixturePass, fullStagePass, loadCumulativeCostLedger, persistCumulativeCostLedger,
  persistRunArtifact, redactDiagnostic, runInjectedCorpus, runLiveCase, runLiveEndpointTurn, smokeIsClean, stagePlan, targetedStagePass, validateCostCap,
} from './ruphus-conversation-runner.mjs';

test('live CLI reaches fail-closed preflight without circular-import deadlock', () => {
  const result = spawnSync(process.execPath, [
    'scripts/ruphus-conversation-runner.mjs',
    '--mode=live',
    '--stage=smoke',
    '--cost-cap-usd=30',
  ], {
    cwd: join(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      RUPHUS_AGENT_MAX_INPUT_TOKENS: '1000000',
      RUPHUS_AGENT_MAX_OUTPUT_TOKENS: '1000',
      RUPHUS_DEV_PROJECT_ID: '',
      RUPHUS_DEV_FIXTURE_UID: '',
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture seeding requires a Dev project/);
  assert.doesNotMatch(result.stderr, /unsettled top-level await/);
});

test('U3 stage denominators are frozen and targeted always appends smoke', async () => {
  const { cases } = await loadFixtureManifest();
  assert.equal(stagePlan('smoke', { fixtures: cases.cases }).length, 11);
  assert.equal(stagePlan('calibration', { fixtures: cases.cases }).length, 36);
  assert.equal(stagePlan('full', { fixtures: cases.cases }).length, 64);
  assert.equal(stagePlan('targeted', { fixtures: cases.cases, fixtureIds: ['AE05'] }).length, 16);
  assert.throws(() => stagePlan('targeted', { fixtures: cases.cases }), /named fixture/);
});

test('U3 cost cap is explicit and hard-stops before overspend', () => {
  assert.throws(() => validateCostCap(), /explicit positive cost cap/);
  const guard = createCostGuard(2);
  assert.equal(guard.charge(1.25), 1.25);
  assert.throws(() => guard.charge(0.76), /cost cap/);
  assert.equal(guard.spentUsd, 1.25);
});

test('U3 cumulative live ledger persists reconciled spend atomically and hard-stops the authorized ceiling', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u3-cost-'));
  const path = join(directory, 'cost-ledger.json');
  try {
    const guard = createCostGuard(30, { persist: (value) => persistCumulativeCostLedger(path, value) });
    const reservation = guard.reserveMaximum(2);
    await guard.persistState();
    guard.reconcile(reservation, 1.25);
    await guard.persistState();
    const ledger = await loadCumulativeCostLedger(path);
    assert.equal(ledger.spentUsd, 1.25);
    assert.throws(() => createCostGuard(30, { initialSpentUsd: 29, initialReservedUsd: 2 }), /authorized ceiling/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('smoke and full pass semantics preserve catastrophic, ordinary, and 58/64 gates', () => {
  assert.equal(smokeIsClean([{ grader: { catastrophic: [], ordinary: [] } }]), true);
  assert.equal(smokeIsClean([{ grader: { catastrophic: [], ordinary: [{ code: 'ordinary' }] } }]), true);
  assert.equal(smokeIsClean([{ grader: { catastrophic: [], ordinary: [{ code: 'ordinary' }] } }, { grader: { catastrophic: [], ordinary: [{ code: 'ordinary' }] } }]), false);
  const run = (fixtureId, critical, clean = true) => ({ fixtureId, critical, grader: { catastrophic: [], ordinary: clean ? [] : [{ code: 'ordinary' }] }, judge: critical ? { mean: 4.2, scores: { friendNotForm: 4, knowsMyCoffee: 4, earnsQuestions: 4, movesBrewForward: 4, listens: 4, phoneSized: 4, confidentNotBossy: 4, proposalFeelsEarned: 4 } } : null, pairwise: critical });
  const passing = [
    ...['AE01','AE02','AE03','AE04','AE05','AE06','AE07','AE08','AE09','AE10','AE14'].flatMap((id) => Array.from({ length: 5 }, () => run(id, true))),
    ...['AE11','AE12','AE13'].flatMap((id) => Array.from({ length: 3 }, () => run(id, false))),
  ];
  assert.equal(fullStagePass(passing), true);
  assert.equal(fullStagePass(passing.map((item, index) => index < 7 ? { ...item, grader: { catastrophic: [], ordinary: [{ code: 'ordinary' }] } } : item)), false);
  assert.equal(fixturePass(Array.from({ length: 4 }, () => run('AE01', true)), { critical: true }), true);
});

test('full stage requires two clean smokes on the current commit and branches are recorded', () => {
  assert.equal(canStartFull([{ stage: 'smoke', commit: 'a', clean: true }, { stage: 'smoke', commit: 'a', clean: true }], 'a'), true);
  assert.equal(canStartFull([{ stage: 'smoke', commit: 'a', clean: true }, { stage: 'smoke', commit: 'b', clean: true }], 'a'), false);
  assert.deepEqual(branchAwareTurns({ turns: ['one', 'two'], replies: [{ question: 'Which?' }, { text: 'done' }] }), [
    { text: 'one', branch: 'model-question', unexpectedBranch: true, question: 'Which?' }, { text: 'two', branch: 'scripted', unexpectedBranch: false, question: null },
  ]);
});

test('each injected fixture is reset before execution, including stale session metadata', async () => {
  const resets = [];
  const report = await runInjectedCorpus(undefined, { resetSession: async (input) => resets.push(input) });
  assert.equal(report.results.length, 14);
  assert.equal(resets.length, 14);
  assert.equal(resets.find((entry) => entry.fixture.id === 'AE07').session.lastActivityOffsetDays, 14);
});

test('fixture expectations and tool-result traces enforce wrong-coffee and fabricated-evidence failures', () => {
  const fixture = { expected: { focus: ['fixture-right'] } };
  const wrong = deriveFixtureTrace({ fixture, frames: [{ type: 'tool_result', result: { coffeeRef: 'fixture-wrong' } }] });
  assert.equal(gradeReply({ reply: 'The coffee is ready.', trace: wrong, expectedCoffeeId: wrong.expectedCoffeeId, actualCoffeeId: wrong.actualCoffeeId }).catastrophic.some((item) => item.code === 'CF1_WRONG_COFFEE'), true);
  const fabricated = deriveFixtureTrace({ fixture, frames: [{ type: 'tool_result', result: { fabricatedEvidence: true } }] });
  assert.equal(gradeReply({ reply: 'The coffee is ready.', trace: fabricated }).catastrophic.some((item) => item.code === 'CF2_FABRICATED_EVIDENCE'), true);
  const fabricatedClaim = deriveFixtureTrace({ fixture, reply: 'Your brew used 99 grams and tasted like Moon Base.', frames: [{ type: 'tool_result', result: { coffeeRef: 'fixture-right', evidence: { coffeeRef: 'fixture-right', dose: 15 } } }] });
  assert.equal(fabricatedClaim.fabricatedEvidence, true);
  const snapshot = buildRotationSnapshot({ coffees: [{ id: 'fixture-right', name: 'Right', jarSlot: 1, status: 'ACTIVE' }], setup: {} });
  const ref = Object.keys(snapshot.refs)[0];
  const expected = deriveFixtureTrace({ fixture: { expected: { focus: ['fixture-right'] } }, refMap: snapshot.refs, frames: [{ type: 'tool_result', result: { coffeeRef: ref } }] });
  assert.equal(expected.expectedCoffeeId, 'fixture-right');
  assert.equal(expected.actualCoffeeId, 'fixture-right');
  assert.equal(gradeReply({ reply: 'The coffee is ready.', trace: expected, expectedCoffeeId: expected.expectedCoffeeId, actualCoffeeId: expected.actualCoffeeId }).catastrophic.length, 0);
  const wrongFocus = deriveFixtureTrace({ fixture: { expected: { focus: ['fixture-right'] } }, refMap: snapshot.refs, frames: [{ type: 'tool_result', result: { coffeeRef: 'fixture-wrong' } }] });
  assert.equal(gradeReply({ reply: 'The coffee is ready.', trace: wrongFocus, expectedCoffeeId: wrongFocus.expectedCoffeeId, actualCoffeeId: wrongFocus.actualCoffeeId }).catastrophic.some((item) => item.code === 'CF1_WRONG_COFFEE'), true);
  const grounded = deriveFixtureTrace({ fixture, reply: 'The tasting was thin and sour.', factSheet: 'The tasting was thin and sour.', frames: [] });
  assert.equal(grounded.fabricatedEvidence, false);
  const userSupplied = deriveFixtureTrace({ fixture: { ...fixture, turns: ['I used the Kalita 155 with 250 grams of water.'] }, turnIndex: 0, reply: 'Your Kalita 155 brew used 250 grams of water.', frames: [] });
  assert.equal(userSupplied.fabricatedEvidence, false);
});

test('candidate dispatch reserves configured priced maximums and targeted pass partitions its appended smoke', () => {
  const maximum = configuredCallMaximum({ model: 'gpt-5.6-luna', inputTokens: 100, outputTokens: 100 });
  assert.equal(endpointCallMultiplier.total, 1 + endpointCallMultiplier.continuations + endpointCallMultiplier.regeneration);
  const guard = createCostGuard(maximum * 2);
  const reservation = guard.reserveMaximum(maximum);
  assert.equal(guard.reservedUsd, maximum);
  guard.reconcile(reservation, maximum / 2);
  assert.equal(guard.spentUsd, maximum / 2);
  const run = (kind, id, critical = true) => ({ kind, fixtureId: id, critical, grader: { catastrophic: [], ordinary: [] }, judge: critical ? { mean: 4, scores: { a: 4 } } : null, pairwise: critical });
  assert.equal(targetedStagePass([run('targeted', 'AE05'), run('targeted', 'AE05'), run('targeted', 'AE05'), run('targeted', 'AE05'), run('targeted', 'AE05'), ...Array.from({ length: 11 }, (_, index) => run('targeted-smoke', `AE0${index + 1}`))], ['AE05']), true);
  assert.equal(targetedStagePass([run('targeted', 'AE05'), run('targeted', 'AE05'), run('targeted', 'AE05'), run('targeted', 'AE05'), run('targeted', 'AE05', true), ...Array.from({ length: 11 }, (_, index) => run('targeted-smoke', `AE0${index + 1}`))].map((item, index) => index === 4 ? { ...item, pairwise: false } : item), ['AE05']), false);
});

test('live playback follows a declared model-question branch and rejects unmetered usage', async () => {
  const { account, cases } = await loadFixtureManifest();
  const fixture = { ...cases.cases.find((item) => item.id === 'AE11'), turns: ['Tell me about a coffee', 'planned answer'], branches: [{ when: 'Which coffee', answer: 'actual answer' }] };
  const payloads = [];
  const fetchImpl = async (_endpoint, request) => {
    const payload = JSON.parse(request.body); payloads.push(payload);
    const first = payloads.length === 1;
    const frame = first ? { type: 'turn_completed', text: 'Which coffee?' } : { type: 'turn_completed', text: 'specific answer' };
    return { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => `${JSON.stringify(frame)}\n${JSON.stringify({ type: 'usage', usage: { input_tokens: 1, output_tokens: 1 } })}\n` };
  };
  const cost = { spentUsd: 0, charge(value) { this.spentUsd += value; }, assertCanCall() {} };
  const result = await runLiveCase(account, fixture, { endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'auth', fetchImpl, costGuard: cost });
  assert.equal(payloads[1].userText, 'actual answer');
  assert.equal(result.results[0].unexpectedBranch, false);
  assert.match(payloads[0].turnId, /-r1-t1$/);
  assert.notEqual(payloads[0].turnId, payloads[1].turnId);
  await runLiveCase(account, fixture, { endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'auth', fetchImpl, costGuard: cost, stageRunId: 'stage-2', repetition: 2 });
  assert.notEqual(payloads[0].turnId, payloads[2].turnId);
  assert.ok(cost.spentUsd > 0);
  const previousInput = process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS;
  const previousOutput = process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS;
  process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS = '100';
  process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS = '100';
  const unpricedGuard = createCostGuard(1);
  try {
    await assert.rejects(() => runLiveCase(account, fixture, { endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'auth', fetchImpl: async () => ({ ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => '{"type":"turn_completed","text":"x"}\n' }), costGuard: unpricedGuard }), /maximum reservation charged/);
    assert.ok(unpricedGuard.spentUsd > 0);
    assert.equal(unpricedGuard.reservedUsd, 0);
  } finally {
    if (previousInput === undefined) delete process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS; else process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS = previousInput;
    if (previousOutput === undefined) delete process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS; else process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS = previousOutput;
  }
});

test('live adapter consumes NDJSON and persisted artifacts redact canary secrets', async () => {
  const response = { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => '{"type":"text_delta","text":"done"}\n{"type":"turn_completed","text":"done","timing":{"firstFrameMs":12,"checkedReplyMs":30,"readRoundMs":4,"regenerationCount":0}}\n' };
  const result = await runLiveEndpointTurn({ endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'canary-token', payload: {}, fetchImpl: async () => response });
  assert.equal(result.text, 'done');
  assert.equal(result.timing.checkedReplyMs, 30);
  assert.equal(redactDiagnostic({ token: 'canary-token', email: 'person@example.com', uid: 'fixture-owner' }).includes('canary-token'), false);
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u3-artifact-'));
  try {
    const target = await persistRunArtifact(directory, { transcript: [{ text: 'canary-token' }], ref: 'fixture-secret' }, 'run-1');
    const contents = await readFile(join(target, 'report.json'), 'utf8');
    const artifact = JSON.parse(contents);
    assert.equal(artifact.retentionDays, 30);
    assert.ok(artifact.expiresAt > artifact.generatedAt);
    assert.equal(contents.includes('canary-token'), false);
    assert.equal(contents.includes('fixture-secret'), false);
    const ledger = await appendSmokeLedger(join(directory, 'smoke-ledger.json'), { commit: 'abc', clean: true });
    assert.deepEqual(ledger.map((entry) => entry.commit), ['abc']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('live adapter surfaces only a bounded endpoint error code', async () => {
  await assert.rejects(() => runLiveEndpointTurn({
    endpoint: 'https://dev.example.test/api/ruphus-agent',
    token: 'canary-token',
    payload: {},
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: 'launch_item_not_found', message: 'fixture-secret should not escape' }) }),
  }), (error) => {
    assert.match(error.message, /HTTP 400 \(launch_item_not_found\)/);
    assert.doesNotMatch(error.message, /fixture-secret/);
    return true;
  });
});

test('live adapter rejects interrupted terminal frames while preserving priceable usage', async () => {
  const response = { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => [
    JSON.stringify({ type: 'turn_interrupted', code: 'slot_required', message: 'internal detail' }),
    JSON.stringify({ type: 'usage', usage: { input_tokens: 12, output_tokens: 3 } }),
  ].join('\n') };
  await assert.rejects(() => runLiveEndpointTurn({ endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'canary-token', payload: {}, fetchImpl: async () => response }), (error) => {
    assert.match(error.message, /turn_interrupted \(slot_required\)/);
    assert.deepEqual(error.usage, { input_tokens: 12, output_tokens: 3 });
    assert.equal(error.providerDispatched, true);
    return true;
  });
});

test('orchestrator emits safe timing on the completed frame without exposing evidence', async () => {
  const frames = [];
  const result = await runRuphusTurn({
    turnId: 'timing-test', userText: 'hello', context: { conversation: [] },
    provider: { runTurn: async () => ({ text: 'A short coffee reply.', usage: { input_tokens: 1, output_tokens: 1 }, model: 'gpt-5.6-luna' }) },
    tools: { definitions: [], names: [], call: async () => ({}) }, emit: (frame) => frames.push(frame),
  });
  const completed = frames.find((frame) => frame.type === 'turn_completed');
  assert.equal(completed.timing.regenerationCount, 0);
  assert.equal(typeof completed.timing.checkedReplyMs, 'number');
  assert.equal(result.turnId, 'timing-test');
  assert.equal(Object.hasOwn(completed.timing, 'evidence'), false);
});
