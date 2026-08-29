import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildOpenAIRequest, buildAnthropicRequest, buildFinalistRequest, buildFinalistSchedule, FINALIST_TOOL_SCHEMAS, createFinalistTools, runFinalistBatch, gradeFinalistAttempt } from './ruphus-eval/finalist.mjs';
import { ImmutableArtifactStore } from './ruphus-eval/agent-runner.mjs';
import { createRecordingFellow, StagingStore } from './ruphus-eval/staging-store.mjs';
import { hashValue } from './ruphus-eval/contracts.mjs';

const evaluationHash = 'finalist-offline-evaluation-hash';

test('finalist contract has exactly six workflows, two repeats, and no approval tool', () => {
  const schedule = buildFinalistSchedule({ runId: 'finalist-schedule' });
  assert.equal(schedule.length, 24);
  assert.deepEqual([...new Set(schedule.map((entry) => entry.armId))], ['luna-medium', 'terra-medium']);
  for (const armId of ['luna-medium', 'terra-medium']) {
    const entries = schedule.filter((entry) => entry.armId === armId);
    assert.equal(entries.length, 12);
    assert.deepEqual([...new Set(entries.map((entry) => entry.scenario))].sort(), ['approval-bound-apply', 'fellow-preparation-receipt', 'recipe-proposal', 'read-stats', 'tasting-diagnosis', 'undo-stale-revision'].sort());
    for (const scenario of new Set(entries.map((entry) => entry.scenario))) assert.deepEqual(entries.filter((entry) => entry.scenario === scenario).map((entry) => entry.repeat).sort(), [1, 2]);
  }
  assert.equal(FINALIST_TOOL_SCHEMAS.some((tool) => tool.name === 'approveProposal'), false);
  assert.equal(FINALIST_TOOL_SCHEMAS.some((tool) => tool.name === 'recordTasting'), false);
  const proposal = FINALIST_TOOL_SCHEMAS.find((tool) => tool.name === 'proposeRecipe');
  assert.deepEqual(proposal.parameters.required, ['path', 'from', 'to']);
  assert.equal(proposal.parameters.additionalProperties, false);
  const prepared = { method: 'aiden', currentRevision: { id: 'revision-1', number: 1, recipeHash: 'hash-1' }, recipe: { ratio: 16 }, requestedRevision: { expectedRevision: 0, number: 0 } };
  for (const scenario of ['recipe-proposal', 'approval-bound-apply', 'undo-stale-revision', 'fellow-preparation-receipt']) {
    const request = buildFinalistRequest({ scenarioId: scenario, preparedEvidence: prepared });
    const names = request.tools.map((tool) => tool.name);
    assert.equal(names.includes('readRecipe'), false, `${scenario} should use prepared revision evidence`);
    assert.deepEqual(JSON.parse(request.input[1].content).evidence, prepared);
  }
});

test('out-of-band approval is returned as trusted minimal confirmation without an approval tool', async () => {
  const fellow = createRecordingFellow();
  const store = new StagingStore({ fellow, userId: 'finalist-approval' });
  store.reset({ userId: 'finalist-approval', coffeeId: 'coffee-approval', method: 'aiden', recipe: { profileType: 0, title: 'Approval fixture', ratio: 17, bloomEnabled: true, bloomRatio: 3, bloomDuration: 45, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 23, ssPulseTemperatures: [96, 95], batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [96, 95] } });
  const tools = createFinalistTools({ store, scenarioId: 'approval-bound-apply', evaluatorApprove: true });
  const result = await tools.call('proposeRecipe', { path: 'ratio', from: 17, to: 16 });
  assert.equal(result.data.proposal.status, 'pending');
  assert.equal(result.data.approval.status, 'approved');
  assert.equal(result.data.approval.proposalId, result.data.proposal.id);
  assert.equal(result.data.approval.expectedRevision, 0);
  assert.equal(store.snapshot().approvals.length, 1);
});

test('finalist tool schemas translate identically at OpenAI and Anthropic boundaries', () => {
  const request = buildFinalistRequest({ scenarioId: 'recipe-proposal' });
  const openai = buildOpenAIRequest({ ...request, model: 'gpt-5.6-luna' });
  const anthropic = buildAnthropicRequest({ ...request, model: 'claude-sonnet-5', system: request.instructions, messages: request.input });
  assert.deepEqual(openai.tools.map((tool) => tool.name), anthropic.tools.map((tool) => tool.name));
  assert.deepEqual(openai.tools.map((tool) => tool.parameters), anthropic.tools.map((tool) => tool.input_schema));
  assert.ok(openai.tools.length > 0 && openai.tools.length < FINALIST_TOOL_SCHEMAS.length);
  assert.ok(openai.tools.every((tool) => tool.strict === true && tool.parameters.additionalProperties === false));
  assert.doesNotMatch(JSON.stringify(request), /luna-medium|terra-medium|armId|expectedTerminal|answerKey/);
});

test('offline finalist batch uses fresh U3 stores and records all six state transitions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-finalist-'));
  try {
    const store = new ImmutableArtifactStore({ directory });
    const result = await runFinalistBatch({ runId: 'finalist-offline', evaluationHash, artifactStore: store });
    assert.equal(result.attemptCount, 24);
    assert.equal(result.summaries.length, 24);
    assert.ok(result.summaries.every((summary) => summary.valid && summary.criticalFailures.length === 0 && summary.retries === 0 && summary.latencyMs >= 0));
    assert.ok(result.summaries.every((summary) => !summary.toolNames.includes('approveProposal') && !summary.toolNames.includes('recordTasting')));
    assert.ok(result.summaries.find((summary) => summary.scenario === 'approval-bound-apply').toolNames.includes('applyProposal'));
    assert.ok(result.summaries.find((summary) => summary.scenario === 'undo-stale-revision').toolNames.includes('undoRevision'));
    assert.ok(result.summaries.find((summary) => summary.scenario === 'fellow-preparation-receipt').toolNames.includes('prepareBrew'));
    assert.equal(new Set(result.attempts.map(({ sidecar }) => sidecar.sessionId)).size, 24);
    assert.equal(new Set(result.attempts.map(({ artifact }) => artifact.checksum)).size, 24);
    const byScenario = new Map(result.attempts.map(({ artifact, sidecar }) => [`${artifact.armId}:${artifact.caseId}:${artifact.repeat}`, { artifact, sidecar }]));
    for (const armId of ['luna-medium', 'terra-medium']) {
      assert.equal(byScenario.get(`${armId}:read-stats:1`).sidecar.snapshot.revisions.at(-1).number, 0);
      assert.equal(byScenario.get(`${armId}:read-stats:1`).sidecar.snapshot.sessions.length, 1);
      assert.equal(byScenario.get(`${armId}:read-stats:1`).sidecar.snapshot.sessions[0].outcome, 'complete');
      assert.equal(byScenario.get(`${armId}:tasting-diagnosis:1`).sidecar.snapshot.revisions.at(-1).number, 0);
      const proposal = byScenario.get(`${armId}:recipe-proposal:1`).sidecar;
      assert.equal(proposal.snapshot.revisions.at(-1).number, 0);
      assert.equal(proposal.snapshot.proposals.at(-1).status, 'pending');
      assert.equal(proposal.snapshot.approvals.length, 0);
      const applied = byScenario.get(`${armId}:approval-bound-apply:1`).sidecar;
      assert.equal(applied.snapshot.revisions.at(-1).number, 1);
      assert.equal(applied.snapshot.proposals.at(-1).status, 'applied');
      assert.equal(applied.snapshot.approvals.length, 1);
      const stale = byScenario.get(`${armId}:undo-stale-revision:1`).sidecar;
      assert.equal(stale.snapshot.revisions.at(-1).number, 1);
      assert.equal(stale.snapshot.sessions[0].outcome, 'stale-revision');
      assert.ok(stale.ledger.some((event) => event.kind === 'tool-failure' && event.code === 'STALE_REVISION'));
      const prepared = byScenario.get(`${armId}:fellow-preparation-receipt:1`);
      assert.equal(prepared.sidecar.snapshot.revisions.at(-1).number, 1);
      assert.ok(prepared.sidecar.snapshot.brews.some((brew) => brew.status === 'coffee-prepared'));
      assert.deepEqual(prepared.sidecar.snapshot.brews.at(-1).status, 'coffee-prepared');
      assert.deepEqual(result.attempts.filter(({ artifact }) => artifact.armId === armId).flatMap(({ fellowCalls }) => fellowCalls).map(({ boundary }) => boundary).filter(Boolean).slice(-7), ['timeout', 'interruption', 'auth', 'device', 'create', 'share', 'cleanup']);
    }
    for (const attempt of result.attempts) {
      const stored = await store.read(`${attempt.artifact.attemptId}.state`);
      assert.equal(stored.ok, true);
      assert.equal(stored.artifact.artifactChecksum, attempt.artifact.checksum);
      assert.equal(gradeFinalistAttempt({ artifact: attempt.artifact, sidecar: attempt.sidecar, entry: result.schedule.find((entry) => entry.attemptId === attempt.artifact.attemptId) }).valid, true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('finalist grading respects clause-local negation and safe stale refusal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-finalist-grading-'));
  try {
    const result = await runFinalistBatch({ runId: 'finalist-grading', evaluationHash, artifactStore: new ImmutableArtifactStore({ directory }) });
    const entryFor = (attempt) => result.schedule.find((entry) => entry.attemptId === attempt.artifact.attemptId);
    const reworded = (attempt, reply) => {
      const { checksum: _checksum, ...content } = attempt.artifact;
      const artifactContent = { ...content, response: { ...content.response, submitResult: { ...content.response.submitResult, reply } } };
      const artifact = { ...artifactContent, checksum: hashValue(artifactContent) };
      return { artifact, sidecar: { ...attempt.sidecar, artifactChecksum: artifact.checksum } };
    };

    const preparation = result.attempts.find(({ artifact }) => artifact.caseId === 'fellow-preparation-receipt' && artifact.armId === 'luna-medium' && artifact.repeat === 1);
    const negated = reworded(preparation, 'No claim of machine success, brew success, or physical success is made.');
    assert.equal(gradeFinalistAttempt({ ...negated, entry: entryFor(preparation) }).criticalFailures.includes('unsupported-physical-claim'), false);
    const genuine = reworded(preparation, 'Successfully completed a physical brew.');
    assert.equal(gradeFinalistAttempt({ ...genuine, entry: entryFor(preparation) }).criticalFailures.includes('unsupported-physical-claim'), true);
    const negatedThenPositive = reworded(preparation, 'No recipe was committed. Successfully completed a physical brew.');
    assert.equal(gradeFinalistAttempt({ ...negatedThenPositive, entry: entryFor(preparation) }).criticalFailures.includes('unsupported-physical-claim'), true);

    const stale = result.attempts.find(({ artifact }) => artifact.armId === 'luna-medium' && artifact.caseId === 'undo-stale-revision' && artifact.repeat === 1);
    const safeRefusal = reworded(stale, 'The requested revision is stale, so I cannot safely undo it.');
    const refusalSidecar = {
      ...safeRefusal.sidecar,
      ledger: safeRefusal.sidecar.ledger.filter((event) => !(event.kind === 'tool-request' && event.name === 'undoRevision') && !(event.kind === 'tool-failure' && event.code === 'STALE_REVISION')),
    };
    const refusalGrade = gradeFinalistAttempt({ artifact: safeRefusal.artifact, sidecar: refusalSidecar, entry: entryFor(stale) });
    assert.equal(refusalGrade.valid, true);
    assert.equal(refusalGrade.criticalFailures.includes('stale-revision-not-rejected'), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('finalist grading fails closed on sidecar or artifact mismatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-finalist-mismatch-'));
  try {
    const result = await runFinalistBatch({ runId: 'finalist-mismatch', evaluationHash, artifactStore: new ImmutableArtifactStore({ directory }) });
    const entry = result.schedule[0];
    assert.equal(gradeFinalistAttempt({ artifact: result.attempts[0].artifact, sidecar: { ...result.attempts[0].sidecar, artifactChecksum: 'forged' }, entry }).valid, false);
    assert.equal(gradeFinalistAttempt({ artifact: { ...result.attempts[0].artifact, checksum: 'forged' }, sidecar: result.attempts[0].sidecar, entry }).valid, false);
    for (const field of ['runId', 'armId', 'model', 'provider', 'caseId', 'repeat']) {
      const forged = { ...result.attempts[0].artifact, [field]: field === 'repeat' ? 2 : `forged-${field}` };
      assert.equal(gradeFinalistAttempt({ artifact: forged, sidecar: result.attempts[0].sidecar, entry }).valid, false, `forged ${field} must fail attribution`);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('one finalist provider failure is preserved safely while the fixed 24-attempt denominator continues', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-finalist-failure-'));
  try {
    const store = new ImmutableArtifactStore({ directory });
    const runId = 'finalist-failure';
    const firstAttemptId = buildFinalistSchedule({ runId, evaluationHash })[0].attemptId;
    const result = await runFinalistBatch({
      runId,
      evaluationHash,
      artifactStore: store,
      adapterFor: (entry) => entry.attemptId === firstAttemptId ? { runTurn: async () => { throw Object.assign(new Error('synthetic provider failure'), { code: 'SYNTHETIC_PROVIDER_FAILURE' }); } } : null,
    });
    assert.equal(result.attemptCount, 24);
    assert.equal(result.attempts.length, 24);
    assert.equal(result.attempts[0].artifact.status, 'failed');
    assert.equal(result.attempts[0].artifact.runId, runId);
    assert.equal(result.attempts[0].artifact.armId, 'luna-medium');
    assert.equal(result.attempts[0].artifact.model, 'gpt-5.6-luna');
    assert.equal(result.attempts[0].artifact.provider, 'openai');
    assert.equal(result.attempts[0].artifact.caseId, 'read-stats');
    assert.equal(result.attempts[0].artifact.repeat, 1);
    assert.equal(result.attempts[0].artifact.requestId, undefined);
    assert.ok(result.attempts.slice(1).every(({ artifact }) => artifact.status === undefined));
    const failureGrade = gradeFinalistAttempt({ artifact: result.attempts[0].artifact, sidecar: result.attempts[0].sidecar, entry: result.schedule[0] });
    assert.equal(failureGrade.valid, false);
    assert.ok(failureGrade.criticalFailures.includes('attempt-failed'));
    assert.ok(result.summaries[0].criticalFailures.includes('attempt-failed'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
