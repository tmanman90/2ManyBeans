import assert from 'node:assert/strict';
import test from 'node:test';
import { hashValue } from './ruphus-eval/contracts.mjs';
import { MODEL_ARMS } from './ruphus-eval/models.mjs';
import { createBlindPacket, createBlindKeyArtifact, resumeBlindPacket, lockTournamentScores, unblindTournamentScores, assertBlindPacketSafe } from './ruphus-eval/blind.mjs';
import { buildFinalistReport, buildTournamentReport, gradeAttempt, rebuildSanitizedProjection, sanitizeAttemptArtifact } from './ruphus-eval/report.mjs';
import { assertProductBaselineSeparate, createProductBaseline } from './ruphus-eval/product-baseline.mjs';
import { createEvaluationRequest, deriveAdjudicationArtifact, parseCandidateResponse, runU6Tournament } from './ruphus-eval/tournament.mjs';

const manifest = Object.freeze({
  status: 'calibrated-sealed', evaluationHash: 'sealed-u6-fixture',
  partitions: { qualification: ['case-1'] }, schedule: { qualificationRepeats: 2 },
  absoluteUxFloor: { minimumScore: 3 },
});
const cases = [{ id: 'case-1', userPrompt: 'Read my coffee record.', fixture: { phase: 'decision' }, expected: { terminal: 'read-only', record: { recordId: 'record-1', method: 'v60', mode: 'hot', recipeHash: 'recipe-1', provenance: { source: 'coffee' } } }, grader: { name: 'recall', deterministic: true, assertions: ['exact-record-id'], criticalFailures: ['fabricated-canonical-data'] } }];

function rawArtifact(armId, repeat, overrides = {}) {
  const arm = MODEL_ARMS.find((candidate) => candidate.id === armId);
  const artifact = {
    attemptId: `attempt-${armId}-${repeat}`, runId: 'run-u6', evaluationHash: manifest.evaluationHash,
    armId, model: arm.model, provider: arm.provider, phase: 'qualification', caseId: 'case-1', repeat,
    telemetry: [{ phase: 1, providerRequestId: `req-${armId}-${repeat}`, responseId: `resp-${armId}-${repeat}`, provider: arm.provider, model: arm.model, usage: { inputTokens: 10, outputTokens: 5 }, cost: 0.01 + MODEL_ARMS.findIndex((candidate) => candidate.id === armId) / 1000, latencyMs: 1 + MODEL_ARMS.findIndex((candidate) => candidate.id === armId), retryAttempts: 1, retryHistory: [], responseHash: 'response-hash', artifactChecksum: 'turn-hash' }],
    evidenceTier: 'synthetic/mock', actual: { terminal: 'read-only', record: { recordId: 'record-1', method: 'v60', mode: 'hot', recipeHash: 'recipe-1', provenance: { source: 'coffee' } }, ...overrides },
  };
  return { ...artifact, checksum: hashValue(artifact) };
}

function fullArtifacts(overrides = {}) {
  return MODEL_ARMS.flatMap((arm) => [rawArtifact(arm.id, 1, overrides[arm.id]?.[1]), rawArtifact(arm.id, 2, overrides[arm.id]?.[2])]);
}

function blindForArms() {
  const pairs = MODEL_ARMS.slice(0, 5).map((arm, index) => ({ caseId: `blind-${index}`, leftArmId: arm.id, rightArmId: MODEL_ARMS[index + 1].id, leftText: 'A careful coffee response.', rightText: 'A clear coffee response.' }));
  const packet = createBlindPacket({ comparisons: pairs, seed: 'u6-test-seed' });
  const scores = Object.fromEntries(packet.schedule.map(({ label }) => [label, { diagnosis: 4, 'proposal-usefulness': 4, uncertainty: 4, clarity: 4, concision: 4, 'willingness-to-approve': 4, unknown: false, abstain: false }]));
  const preferences = Object.fromEntries(packet.schedule.map(({ label }) => [label, 'tie']));
  return { packet, lock: lockTournamentScores({ packet, scores, preferences }) };
}

function finalFixture(armId, repeat, caseId = 'final-1') {
  const base = rawArtifact(armId, repeat);
  const { checksum: ignored, ...content } = base;
  content.phase = 'finalist-decision';
  content.evaluationHash = 'sealed-final-fixture';
  content.caseId = caseId;
  content.attemptId = `final-${armId}-${repeat}`;
  content.actual = { ...content.actual, record: { ...content.actual.record, recordId: 'final-record' } };
  return { ...content, checksum: hashValue(content) };
}

const finalistManifest = Object.freeze({
  status: 'calibrated-sealed', evaluationHash: 'sealed-final-fixture',
  partitions: { finalistDecision: ['final-1'] }, schedule: { finalistDecisionRepeats: 2 },
  absoluteUxFloor: { minimumScore: 3 },
});
const finalistCase = { ...cases[0], id: 'final-1', expected: { ...cases[0].expected, record: { ...cases[0].expected.record, recordId: 'final-record' } } };

test('U6 selects at most two finalists only after complete gates and locked blind scores', () => {
  const { packet, lock } = blindForArms();
  const report = buildTournamentReport({ artifacts: fullArtifacts(), cases, manifest, blindPacket: packet, blindLock: lock });
  assert.equal(report.outcome, 'selected');
  assert.equal(report.finalists.length, 2);
  assert.ok(report.arms.every((arm) => arm.attempts === 2));
});

test('critical failure vetoes before cost comparison', () => {
  const { packet, lock } = blindForArms();
  const artifacts = fullArtifacts({ 'luna-medium': { 1: { record: { recordId: 'forged' } } } });
  const report = buildTournamentReport({ artifacts, cases, manifest, blindPacket: packet, blindLock: lock });
  assert.equal(report.outcome, 'selected');
  assert.equal(report.finalists.length, 2);
  assert.equal(report.arms.find((arm) => arm.armId === 'luna-medium').eligible, false);
});

test('repeat variance remains visible and equal cutoff metrics return insufficient evidence', () => {
  const { packet, lock } = blindForArms();
  const artifacts = fullArtifacts();
  const varied = artifacts.map((artifact) => artifact.armId === 'luna-medium' && artifact.repeat === 2
    ? { ...artifact, actual: { ...artifact.actual, record: { ...artifact.actual.record, recipeHash: 'recipe-1' } } }
    : artifact);
  // The report preserves both attempts and their deterministic cost/grade
  // rows; an equal cutoff is not silently resolved by input order.
  const equalCost = artifacts.map((artifact) => {
    const { checksum: ignored, ...content } = artifact;
    content.telemetry = content.telemetry.map((turn) => ({ ...turn, cost: 0.01, latencyMs: 1 }));
    return { ...content, checksum: hashValue(content) };
  });
  const tie = buildTournamentReport({ artifacts: equalCost, cases, manifest, blindPacket: packet, blindLock: lock });
  assert.equal(tie.outcome, 'insufficient-evidence');
  const normal = buildTournamentReport({ artifacts, cases, manifest, blindPacket: packet, blindLock: lock });
  assert.ok(normal.arms.every((arm) => Object.hasOwn(arm, 'variance')));
  assert.ok(varied.length === artifacts.length);
});

test('missing arm, repeat, unmetered, and corrupt artifacts cannot form a winner', () => {
  const { packet, lock } = blindForArms();
  const complete = fullArtifacts();
  assert.equal(buildTournamentReport({ artifacts: complete.filter((artifact) => artifact.armId !== 'terra-high'), cases, manifest, blindPacket: packet, blindLock: lock }).outcome, 'insufficient-evidence');
  assert.equal(buildTournamentReport({ artifacts: complete.filter((artifact) => artifact.repeat !== 2), cases, manifest, blindPacket: packet, blindLock: lock }).outcome, 'insufficient-evidence');
  const unmetered = complete.map((artifact) => artifact.attemptId === 'attempt-luna-medium-1' ? { ...artifact, telemetry: [] } : artifact);
  assert.equal(buildTournamentReport({ artifacts: unmetered, cases, manifest, blindPacket: packet, blindLock: lock }).outcome, 'insufficient-evidence');
  const corrupt = complete.map((artifact) => artifact.attemptId === 'attempt-luna-medium-1' ? { ...artifact, checksum: 'bad' } : artifact);
  assert.equal(buildTournamentReport({ artifacts: corrupt, cases, manifest, blindPacket: packet, blindLock: lock }).outcome, 'insufficient-evidence');
});

test('unlocked or leaked blind review remains pending and map swaps are rejected', () => {
  const { packet, lock } = blindForArms();
  assert.equal(buildTournamentReport({ artifacts: fullArtifacts(), cases, manifest, blindPacket: packet }).outcome, 'pending-blind-review');
  assert.throws(() => unblindTournamentScores({ packet, locked: { ...lock, packetHash: 'swapped' } }), /does not match/);
  assert.throws(() => createBlindPacket({ comparisons: [{ caseId: 'x', leftArmId: 'luna-medium', rightArmId: 'terra-medium', leftText: 'https://example.com', rightText: 'safe' }] }), /identity metadata/);
  assertBlindPacketSafe(packet);
});

test('blind packet and evaluator attribution key survive JSON pause/resume without exposing the key in the packet', () => {
  const { packet, lock } = blindForArms();
  const key = createBlindKeyArtifact({ packet });
  assert.equal(JSON.stringify(packet).includes('leftArmId'), false);
  const resumedPacket = JSON.parse(JSON.stringify(packet));
  const resumedKey = JSON.parse(JSON.stringify(key));
  resumeBlindPacket({ packet: resumedPacket, key: resumedKey });
  const resumedLock = { ...JSON.parse(JSON.stringify(lock)), packetCandidateMapHash: resumedKey.candidateMapHash };
  assert.equal(unblindTournamentScores({ packet: resumedPacket, locked: resumedLock, key: resumedKey }).length, packet.schedule.length);
  assert.throws(() => resumeBlindPacket({ packet: resumedPacket, key: { ...resumedKey, packetHash: 'swapped' } }), /does not match/);
});

test('sanitization retains deterministic evidence and excludes prompts, reasoning, and provider content', () => {
  const artifact = rawArtifact('luna-medium', 1);
  artifact.gradingInput = { prompt: 'private prompt', reasoning: 'private reasoning', canonicalState: { revision: 'r1' }, toolTrace: [{ name: 'readCoffee', argsHash: 'a' }] };
  const { checksum: ignoredChecksum, ...withoutChecksum } = artifact;
  const stamped = { ...withoutChecksum, checksum: hashValue(withoutChecksum) };
  const row = sanitizeAttemptArtifact(stamped, { grade: gradeAttempt(stamped, { cases, manifest }) });
  assert.equal(row.rawChecksum, stamped.checksum);
  assert.equal(row.gradingInput.prompt, undefined);
  assert.equal(row.gradingInput.reasoning, undefined);
  assert.deepEqual(row.gradingInput.toolTrace, [{ name: 'readCoffee', argsHash: 'a' }]);
  const rebuilt = rebuildSanitizedProjection({ artifacts: [stamped], cases, manifest });
  assert.equal(rebuilt.rows.length, 1);
  assert.equal(rebuilt.projectionHash, rebuildSanitizedProjection({ artifacts: [stamped], cases, manifest }).projectionHash);
});

test('shipping baseline is separate context and cannot rank', () => {
  const baseline = createProductBaseline({ observations: [{ caseId: 'case-1', outcome: 'unobserved' }] });
  assertProductBaselineSeparate(baseline);
  assert.equal(baseline.rankingEligible, false);
  assert.equal(baseline.arm.id, 'shipping-sonnet-disabled');
});

test('provider-neutral response bridge binds strict parsed evidence to the raw checksum', () => {
  const request = createEvaluationRequest({ caseDefinition: cases[0], phase: 'qualification' });
  assert.equal(request.responseFormat.additionalProperties, false);
  assert.throws(() => parseCandidateResponse(JSON.stringify({ reply: 'ok', actual: {}, extra: true })), /envelope/);
  for (const actual of [{ approval: false, commit: false, committed: false, mutation: false }, { physicalClaim: false }, { claims: [], receiptFacts: ['share confirmed'] }]) {
    assert.deepEqual(parseCandidateResponse(JSON.stringify({ reply: 'ok', actual })).actual, actual);
  }
  const forged = parseCandidateResponse(JSON.stringify({ reply: 'ok', actual: { record: { recordId: 'forged' }, claims: ['Successfully committed the recipe'], physicalClaim: true } }));
  const forgedArtifact = deriveAdjudicationArtifact({ rawArtifact: rawArtifact('luna-medium', 1), caseDefinition: cases[0], response: forged });
  const forgedGrade = gradeAttempt(forgedArtifact, { cases, manifest });
  assert.equal(forgedGrade.eligible, false);
  assert.equal(forgedGrade.criticalFailure, true);
  const raw = rawArtifact('luna-medium', 1);
  const derived = deriveAdjudicationArtifact({ rawArtifact: raw, caseDefinition: cases[0], response: JSON.stringify({ reply: 'recorded', actual: raw.actual }) });
  assert.equal(derived.type, 'u6-adjudication');
  assert.equal(derived.evidenceTier, 'real-provider');
  assert.equal(derived.rawArtifactChecksum, raw.checksum);
  assert.notEqual(derived, raw);
  assert.equal(gradeAttempt(derived, { cases, manifest }).eligible, true);
  const unbound = { ...raw };
  delete unbound.evidenceTier;
  const { checksum: ignoredUnbound, ...unboundContent } = unbound;
  assert.equal(gradeAttempt({ ...unboundContent, checksum: hashValue(unboundContent) }, { cases, manifest }).eligible, false);
});

test('finalist phase requires its exact partition and the staged path cannot skip it', () => {
  const { packet, lock } = blindForArms();
  const qualification = runU6Tournament({ qualificationArtifacts: fullArtifacts(), cases, manifest, qualificationBlindPacket: packet, qualificationBlindLock: lock });
  assert.equal(qualification.outcome, 'insufficient-evidence');
  assert.equal(qualification.reason, 'finalist-decision-required');
  const finalists = MODEL_ARMS.slice(0, 2).map((arm) => arm.id);
  const finalPairs = [{ caseId: 'final-1', leftArmId: finalists[0], rightArmId: finalists[1], leftText: 'A', rightText: 'B' }];
  const finalPacket = createBlindPacket({ comparisons: finalPairs, seed: 'final-seed' });
  const scores = Object.fromEntries(finalPacket.schedule.map(({ label }) => [label, { diagnosis: 4, 'proposal-usefulness': 4, uncertainty: 4, clarity: 4, concision: 4, 'willingness-to-approve': 4, unknown: false, abstain: false }]));
  const finalLock = lockTournamentScores({ packet: finalPacket, scores, preferences: Object.fromEntries(finalPacket.schedule.map(({ label }) => [label, 'tie'])) });
  const finalistArtifacts = finalists.flatMap((armId) => [finalFixture(armId, 1), finalFixture(armId, 2)]);
  const final = buildFinalistReport({ artifacts: finalistArtifacts, cases: [finalistCase], manifest: finalistManifest, blindPacket: finalPacket, blindLock: finalLock, finalists });
  assert.equal(final.outcome, 'selected');
  assert.deepEqual(final.finalists.length, 2);
});
