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
  appendSmokeLedger, branchAwareTurns, canStartFull, configuredCallMaximum, createCostGuard, deriveFixtureTrace, dispatchValidatedJudge, endpointCallMultiplier, fixturePass, fullStagePass, loadCumulativeCostLedger, persistCumulativeCostLedger,
  fixtureFactSheet, judgeVisibleTranscript, nextBranchTurn, persistRunArtifact, redactDiagnostic, runInjectedCorpus, runLiveCase, runLiveEndpointTurn, smokeIsClean, stagePlan, targetedStagePass, validateCostCap,
} from './ruphus-conversation-runner.mjs';
import { JUDGE_SCHEMA_VERSION } from './ruphus-conversation-judge.mjs';

const validJudgment = () => ({
  schemaVersion: JUDGE_SCHEMA_VERSION,
  scores: {
    friendNotForm: 5, knowsMyCoffee: 5, earnsQuestions: 5, movesBrewForward: 5,
    listens: 5, phoneSized: 5, confidentNotBossy: 5, proposalFeelsEarned: 5,
  },
  mean: 5,
  rationale: 'Good conversation.',
});

test('blind fact sheet includes attempt notes visible to the candidate', async () => {
  const { account } = await loadFixtureManifest();
  const factSheet = fixtureFactSheet(account);
  assert.match(factSheet, /attempt note: watery/);
  assert.match(factSheet, /Colombia La Esperanza/);
});

test('judge dispatch retries one malformed structured result without weakening validation', async () => {
  const responses = [{ result: { schemaVersion: JUDGE_SCHEMA_VERSION } }, { result: validJudgment() }];
  let calls = 0;
  const response = await dispatchValidatedJudge(null, { transcript: [] }, null, {
    dispatch: async () => { calls += 1; return responses.shift(); },
  });
  assert.equal(calls, 2);
  assert.equal(response.result.mean, 5);
});

test('judge dispatch retries one bounded transport failure', async () => {
  let calls = 0;
  const response = await dispatchValidatedJudge(null, { transcript: [] }, null, {
    dispatch: async () => {
      calls += 1;
      if (calls === 1) throw new Error('timed out');
      return { result: validJudgment() };
    },
  });
  assert.equal(calls, 2);
  assert.equal(response.result.mean, 5);
});

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

test('judge transcript includes the visible proposal card without internal identifiers', () => {
  const visible = judgeVisibleTranscript({
    transcript: [{ role: 'user', text: 'Make it.' }, { role: 'assistant', text: 'Prepared for review.' }],
    results: [{ frames: [{ type: 'artifact_ready', artifact: { type: 'recipe_proposal', id: 'private-id', before: { title: 'Kalita recipe', grindSize: { setting: '4.2' } }, after: { title: 'Kalita recipe', grindSize: { setting: '4.0' } } } }] }],
  });
  assert.match(visible.at(-1).text, /Visible recipe proposal card: Kalita recipe; grind 4\.2 to 4\.0; ready to review, not applied/);
  assert.doesNotMatch(JSON.stringify(visible), /private-id/);
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
  const proposalFixture = { turns: ['diagnose', 'agree'], branches: [{ when: 'want me to propose|prepare that', answer: 'Go ahead.' }] };
  for (const question of ['Shall I prepare that adjustment?', 'Should I propose it?', 'Want me to set up that grind change?', 'Would you like to try one small recipe change?', 'Want me to put that one-step finer change forward?']) {
    assert.deepEqual(nextBranchTurn(proposalFixture, 0, { text: question }), { text: 'Go ahead.', unexpectedBranch: false, question });
  }
  const correctionFixture = { turns: ['correct', 'done'], branches: [{ when: 'want me to propose|propose that', answer: 'Not yet.' }] };
  const correctionQuestion = 'Got it—the washed Colombian is El Vergel; want me to propose that change?';
  assert.deepEqual(nextBranchTurn(correctionFixture, 0, { text: correctionQuestion }), { text: 'Not yet.', unexpectedBranch: false, question: correctionQuestion });
});

test('natural model questions observed in the latest full report are declared by their fixtures', async () => {
  const { cases } = await loadFixtureManifest();
  const byId = new Map(cases.cases.map((fixture) => [fixture.id, fixture]));
  const observed = [
    ['AE05', 0, 'The Kalita was watery; want me to suggest the exact adjustment?', 'Would more dose beat a finer grind?'],
    ['AE05', 0, 'The Kalita was watery; want me to suggest the exact change?', 'Would more dose beat a finer grind?'],
    ['AE13', 0, 'The pale brew is ambiguous; would you like one bounded recipe change?', 'No, just describe the photo for now.'],
    ['AE14', 1, 'Got it—the V60 is the one you brewed; would you like me to suggest one small V60 adjustment?', 'Not yet.'],
    ['AE07', 0, 'Was it thin but sweet and clean, or sharp/sour and muted?', 'Sharp and under-ripe. What should I adjust now?'],
  ];
  for (const [id, index, question, expectedText] of observed) {
    const branch = nextBranchTurn(byId.get(id), index, { question });
    assert.deepEqual(branch, { text: expectedText, unexpectedBranch: false, question }, `${id}: ${question}`);
  }
});

test('AE09 cannot skip the sensory answer by asking for proposal permission on turn one', async () => {
  const { cases } = await loadFixtureManifest();
  const fixture = cases.cases.find((item) => item.id === 'AE09');
  const premature = nextBranchTurn(fixture, 0, { text: 'I would go one small step finer. Want me to propose that change?' });
  assert.equal(premature.unexpectedBranch, true);
  const sensory = nextBranchTurn(fixture, 0, { text: 'Was it thin but sweet and clean, or sour, sharp, or muted?' });
  assert.deepEqual({ text: sensory.text, unexpectedBranch: sensory.unexpectedBranch }, { text: 'It is sour and muted.', unexpectedBranch: false });
  const permission = nextBranchTurn(fixture, 1, { text: 'Try one small step finer. Want me to propose that change?' });
  assert.deepEqual({ text: permission.text, unexpectedBranch: permission.unexpectedBranch }, { text: 'Go ahead and change it.', unexpectedBranch: false });
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
  const carried = deriveFixtureTrace({ fixture: { expected: { turns: [{ focus: 'fixture-right' }, { focus: 'fixture-right' }] }, launchContext: { coffeeRef: 'fixture-wrong' } }, turnIndex: 1, priorCoffeeId: 'fixture-right', frames: [], reply: 'That adjustment should keep El Vergel balanced.' });
  assert.equal(carried.actualCoffeeId, 'fixture-right');
  assert.equal(gradeReply({ reply: 'That adjustment should keep El Vergel balanced.', trace: carried, expectedCoffeeId: carried.expectedCoffeeId, actualCoffeeId: carried.actualCoffeeId }).catastrophic.length, 0);
  const currentWrongOverridesCarry = deriveFixtureTrace({ fixture, priorCoffeeId: 'fixture-right', frames: [{ type: 'tool_result', result: { coffeeRef: 'fixture-wrong' } }] });
  assert.equal(currentWrongOverridesCarry.actualCoffeeId, 'fixture-wrong');
  const namedSwitchOverridesCarry = deriveFixtureTrace({ fixture: { expected: { focus: ['fixture-colombia-other'] } }, priorCoffeeId: 'fixture-el-vergel', coffees: [{ id: 'fixture-el-vergel', name: 'El Vergel' }, { id: 'fixture-colombia-other', name: 'Colombia La Esperanza' }], reply: 'Got it—the other Colombian is Colombia La Esperanza.' });
  assert.equal(namedSwitchOverridesCarry.actualCoffeeId, 'fixture-colombia-other');
  const wrongFocus = deriveFixtureTrace({ fixture: { expected: { focus: ['fixture-right'] } }, refMap: snapshot.refs, frames: [{ type: 'tool_result', result: { coffeeRef: 'fixture-wrong' } }] });
  assert.equal(gradeReply({ reply: 'The coffee is ready.', trace: wrongFocus, expectedCoffeeId: wrongFocus.expectedCoffeeId, actualCoffeeId: wrongFocus.actualCoffeeId }).catastrophic.some((item) => item.code === 'CF1_WRONG_COFFEE'), true);
  const grounded = deriveFixtureTrace({ fixture, reply: 'The tasting was thin and sour.', factSheet: 'The tasting was thin and sour.', frames: [] });
  assert.equal(grounded.fabricatedEvidence, false);
  const userSupplied = deriveFixtureTrace({ fixture: { ...fixture, turns: ['I used the Kalita 155 with 250 grams of water.'] }, turnIndex: 0, reply: 'Your Kalita 155 brew used 250 grams of water.', frames: [] });
  assert.equal(userSupplied.fabricatedEvidence, false);
  const advice = deriveFixtureTrace({ fixture, reply: 'The last brew used Ode 4.2. Next time, try Ode 4.0 and aim for 3:00.', factSheet: 'The last brew used Ode 4.2.', frames: [] });
  assert.equal(advice.fabricatedEvidence, false);
  const sameSentenceAdvice = deriveFixtureTrace({ fixture, reply: 'Your V60 recipe was 15 g to 250 g at 94°C, Ode 4.2, finishing around 2:45; for a flat cup, I’d test one small step finer to 4.0.', factSheet: 'V60 recipe 15 g to 250 g at 94°C, Ode 4.2, finishing around 2:45.', frames: [] });
  assert.equal(sameSentenceAdvice.fabricatedEvidence, false);
  const sinceGrounded = deriveFixtureTrace({ fixture, reply: 'Since El Vergel tasted thin and sour, try one small step finer.', factSheet: 'El Vergel tasted thin and sour.', frames: [] });
  assert.equal(sinceGrounded.fabricatedEvidence, false);
  const withGrounded = deriveFixtureTrace({ fixture, reply: 'With El Vergel, the brew log shows one recent hot V60 at 15 g.', factSheet: 'El Vergel has one recent hot V60 at 15 g.', frames: [] });
  assert.equal(withGrounded.fabricatedEvidence, false);
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

test('live playback accepts history grounded by an earlier turn in the active conversation', async () => {
  const { account, cases } = await loadFixtureManifest();
  const fixture = { ...cases.cases.find((item) => item.id === 'AE11'), turns: ['Check my recent brews.', 'What did the previous brew show?'], branches: [] };
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const frames = calls === 1
      ? [
          { type: 'tool_result', name: 'read_coffee_evidence', result: { brews: { status: 'available', records: [{ summary: 'balanced' }] } } },
          { type: 'turn_completed', text: 'I checked your recent brews.' },
        ]
      : [{ type: 'turn_completed', text: 'The previous brew was balanced.' }];
    frames.push({ type: 'usage', usage: { input_tokens: 1, output_tokens: 1 } });
    return { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => `${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n` };
  };
  const cost = { spentUsd: 0, charge(value) { this.spentUsd += value; }, assertCanCall() {} };
  const result = await runLiveCase(account, fixture, { endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'auth', fetchImpl, costGuard: cost });
  assert.equal(result.results[0].evidenceBeforeHistory, true);
  assert.equal(result.results[1].grader.ordinary.some((item) => item.code === 'U3_EVIDENCE_BEFORE_HISTORY'), false);
});

test('coffee resolution alone does not count as history evidence', async () => {
  const { account, cases } = await loadFixtureManifest();
  const fixture = { ...cases.cases.find((item) => item.id === 'AE11'), turns: ['Use El Vergel.', 'What did the previous brew show?'], branches: [] };
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const frames = calls === 1
      ? [
          { type: 'tool_result', name: 'resolve_coffee', result: { ok: true, coffeeRef: 'c1' } },
          { type: 'turn_completed', text: 'Got it, El Vergel.' },
        ]
      : [{ type: 'turn_completed', text: 'The previous brew was balanced.' }];
    frames.push({ type: 'usage', usage: { input_tokens: 1, output_tokens: 1 } });
    return { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => `${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n` };
  };
  const cost = { spentUsd: 0, charge(value) { this.spentUsd += value; }, assertCanCall() {} };
  const result = await runLiveCase(account, fixture, { endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'auth', fetchImpl, costGuard: cost });
  assert.equal(result.results[0].evidenceBeforeHistory, false);
  assert.equal(result.results[1].grader.ordinary.some((item) => item.code === 'U3_EVIDENCE_BEFORE_HISTORY'), true);
});

test('trusted rotation recipe language does not masquerade as a history claim', async () => {
  const { account, cases } = await loadFixtureManifest();
  const fixture = { ...cases.cases.find((item) => item.id === 'AE11'), turns: ['Use jar one.'], branches: [] };
  const fetchImpl = async () => ({ ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => `${JSON.stringify({ type: 'turn_completed', text: 'Its recorded recipe is hot V60.' })}\n${JSON.stringify({ type: 'usage', usage: { input_tokens: 1, output_tokens: 1 } })}\n` });
  const cost = { spentUsd: 0, charge(value) { this.spentUsd += value; }, assertCanCall() {} };
  const result = await runLiveCase(account, fixture, { endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'auth', fetchImpl, costGuard: cost });
  assert.equal(result.results[0].grader.ordinary.some((item) => item.code === 'U3_EVIDENCE_BEFORE_HISTORY'), false);
});

test('a seeded authoritative session ledger counts as history evidence on explicit continuation', async () => {
  const { account, cases } = await loadFixtureManifest();
  const fixture = { ...cases.cases.find((item) => item.id === 'AE11'), turns: ['Continue with the earlier coffee.'], branches: [], session: { ledger: { version: 1, entries: [{ kind: 'tasting', status: 'complete', summary: 'Balanced cup.' }], namedCoffees: ['El Vergel'] } } };
  const fetchImpl = async () => ({ ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => `${JSON.stringify({ type: 'turn_completed', text: 'The last cup was balanced.' })}\n${JSON.stringify({ type: 'usage', usage: { input_tokens: 1, output_tokens: 1 } })}\n` });
  const cost = { spentUsd: 0, charge(value) { this.spentUsd += value; }, assertCanCall() {} };
  const result = await runLiveCase(account, fixture, { endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'auth', fetchImpl, costGuard: cost });
  assert.equal(result.results[0].grader.ordinary.some((item) => item.code === 'U3_EVIDENCE_BEFORE_HISTORY'), false);
});

test('live adapter consumes NDJSON and persisted artifacts redact canary secrets', async () => {
  const response = { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => '{"type":"text_delta","text":"done"}\n{"type":"turn_completed","text":"done","timing":{"firstFrameMs":12,"checkedReplyMs":30,"readRoundMs":4,"regenerationCount":0}}\n' };
  let request;
  const result = await runLiveEndpointTurn({ endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'canary-token', payload: { userText: 'hello' }, devReadFault: 'tastings_timeout', fetchImpl: async (_endpoint, value) => { request = value; return response; } });
  assert.equal(result.text, 'done');
  assert.equal(result.timing.checkedReplyMs, 30);
  assert.equal(request.headers['x-ruphus-dev-read-fault'], 'tastings_timeout');
  assert.equal(JSON.parse(request.body).devReadFault, undefined);
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

test('live endpoint aborts a stalled response and marks provider dispatch uncertain', async () => {
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(
    runLiveEndpointTurn({ endpoint: 'https://dev.example/api/ruphus-agent', token: 'dev-token', payload: {}, fetchImpl, timeoutMs: 5 }),
    (error) => error.message === 'U3 endpoint request timed out' && error.providerDispatched === true,
  );
});

test('live adapter rejects interrupted terminal frames while preserving priceable usage', async () => {
  const response = { ok: true, headers: { get: () => 'application/x-ndjson' }, text: async () => [
    JSON.stringify({ type: 'tool_result', name: 'propose_recipe_change', result: { ok: false, code: 'one_change_required', message: 'private detail' } }),
    JSON.stringify({ type: 'turn_interrupted', code: 'slot_required', message: 'internal detail' }),
    JSON.stringify({ type: 'usage', usage: { input_tokens: 12, output_tokens: 3 } }),
  ].join('\n') };
  await assert.rejects(() => runLiveEndpointTurn({ endpoint: 'https://dev.example.test/api/ruphus-agent', token: 'canary-token', payload: {}, fetchImpl: async () => response }), (error) => {
    assert.match(error.message, /turn_interrupted \(slot_required\); last_tool_failure=one_change_required/);
    assert.equal(error.toolFailureCode, 'one_change_required');
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
