import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFixtureManifest } from './ruphus-conversation-runner.mjs';
import {
  appendSmokeLedger, branchAwareTurns, canStartFull, createCostGuard, fixturePass, fullStagePass,
  persistRunArtifact, redactDiagnostic, runLiveEndpointTurn, smokeIsClean, stagePlan, validateCostCap,
} from './ruphus-conversation-runner.mjs';

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
    { text: 'one', branch: 'model-question', unexpectedBranch: true }, { text: 'two', branch: 'scripted', unexpectedBranch: false },
  ]);
});

test('live adapter consumes NDJSON and persisted artifacts redact canary secrets', async () => {
  const response = { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => '{"type":"text_delta","text":"done"}\n{"type":"turn_completed","text":"done"}\n' };
  const result = await runLiveEndpointTurn({ endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'canary-token', payload: {}, fetchImpl: async () => response });
  assert.equal(result.text, 'done');
  assert.equal(redactDiagnostic({ token: 'canary-token', email: 'person@example.com', uid: 'fixture-owner' }).includes('canary-token'), false);
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-u3-artifact-'));
  try {
    const target = await persistRunArtifact(directory, { transcript: [{ text: 'canary-token' }], ref: 'fixture-secret' }, 'run-1');
    const contents = await readFile(join(target, 'report.json'), 'utf8');
    assert.equal(contents.includes('canary-token'), false);
    assert.equal(contents.includes('fixture-secret'), false);
    const ledger = await appendSmokeLedger(join(directory, 'smoke-ledger.json'), { commit: 'abc', clean: true });
    assert.deepEqual(ledger.map((entry) => entry.commit), ['abc']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
