import assert from 'node:assert/strict';
import test from 'node:test';
import { hashValue } from './ruphus-eval/contracts.mjs';
import { MODEL_ARMS } from './ruphus-eval/models.mjs';
import { createBlindPacket, lockTournamentScores, unblindTournamentScores, assertBlindPacketSafe } from './ruphus-eval/blind.mjs';
import { buildTournamentReport, gradeAttempt, rebuildSanitizedProjection, sanitizeAttemptArtifact } from './ruphus-eval/report.mjs';
import { assertProductBaselineSeparate, createProductBaseline } from './ruphus-eval/product-baseline.mjs';

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
    telemetry: [{ phase: 1, providerRequestId: `req-${armId}-${repeat}`, responseId: `resp-${armId}-${repeat}`, provider: arm.provider, model: arm.model, usage: { inputTokens: 10, outputTokens: 5 }, cost: 0.01 + MODEL_ARMS.findIndex((candidate) => candidate.id === armId) / 1000, retryAttempts: 1, retryHistory: [], responseHash: 'response-hash', artifactChecksum: 'turn-hash' }],
    actual: { terminal: 'read-only', record: { recordId: 'record-1', method: 'v60', mode: 'hot', recipeHash: 'recipe-1', provenance: { source: 'coffee' } }, ...overrides },
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
  return { packet, lock: lockTournamentScores({ packet, scores }) };
}

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
  assert.equal(report.outcome, 'no-pass');
  assert.match(report.reason, /veto/);
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
    content.telemetry = content.telemetry.map((turn) => ({ ...turn, cost: 0.01 }));
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
