import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hashValue } from './ruphus-eval/contracts.mjs';
import { DEFAULT_LIMITS, MODEL_ARMS } from './ruphus-eval/models.mjs';
import { createBlindPacket, createBlindKeyArtifact, resumeBlindPacket, lockTournamentScores, unblindTournamentScores, assertBlindPacketSafe } from './ruphus-eval/blind.mjs';
import { buildFinalistReport, buildTournamentReport, gradeAttempt, rebuildSanitizedProjection, sanitizeAttemptArtifact } from './ruphus-eval/report.mjs';
import { assertProductBaselineSeparate, createProductBaseline } from './ruphus-eval/product-baseline.mjs';
import { createEvaluationRequest, deriveAdjudicationArtifact, parseCandidateResponse, runU6Tournament } from './ruphus-eval/tournament.mjs';
import { resolveCaseFixture } from './ruphus-eval/cases.mjs';

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
    evidenceTier: 'synthetic/mock', actual: { terminal: 'read-only', mutation: false, approval: false, commit: false, committed: false, physicalClaim: false, record: { recordId: 'record-1', method: 'v60', mode: 'hot', recipeHash: 'recipe-1', provenance: { source: 'coffee' } }, ...overrides },
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
  const forged = parseCandidateResponse(JSON.stringify({ reply: 'ok', actual: { terminal: 'read-only', mutation: false, approval: false, commit: false, committed: false, physicalClaim: true, record: { recordId: 'forged' }, claims: ['Successfully committed the recipe'] } }));
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

test('model requests resolve canonical recipe evidence without exposing answer keys', () => {
  const calibration = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/calibration/cases.json', import.meta.url), 'utf8'));
  const recipeCase = calibration.find((item) => item.id === 'cal-003');
  const request = createEvaluationRequest({ caseDefinition: recipeCase, phase: 'qualification' });
  const payload = JSON.parse(request.input[1].content);
  assert.equal(payload.evidence.recipeInput.method, 'pour-over');
  assert.equal(payload.evidence.recipeInput.device, 'kalita');
  assert.equal(payload.evidence.recipeProjection, undefined);
  assert.equal(Object.hasOwn(payload, 'expected'), false);
  assert.equal(Object.hasOwn(request.evidenceContract, 'expected'), false);
  assert.ok(request.evidenceContract.required.includes('recipe'));
  assert.ok(request.evidenceContract.required.includes('proposal'));
  assert.deepEqual(JSON.parse(request.input[1].content).evidenceContract, request.evidenceContractWire);
});

test('wire evidence contract discloses applicable nested grader keys compactly', () => {
  const calibration = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/calibration/cases.json', import.meta.url), 'utf8'));
  const decision = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/decision/cases.json', import.meta.url), 'utf8'));
  const proposal = createEvaluationRequest({ caseDefinition: calibration.find((item) => item.id === 'cal-003') });
  const diagnosis = createEvaluationRequest({ caseDefinition: decision.find((item) => item.id === 'dec-013') });
  const grind = createEvaluationRequest({ caseDefinition: decision.find((item) => item.id === 'dec-026') });
  const failure = createEvaluationRequest({ caseDefinition: decision.find((item) => item.id === 'dec-051') });
  const proposalContract = JSON.parse(proposal.input[1].content).evidenceContract;
  assert.equal(proposalContract.r, undefined);
  assert.match(proposalContract.n.p, /proposalId/);
  assert.match(proposalContract.n.p, /diff\(path,from,to\)/);
  assert.equal(proposalContract.n.d, undefined);
  assert.match(JSON.parse(diagnosis.input[1].content).evidenceContract.n.d, /cause,confidence,uncertainty/);
  assert.match(JSON.parse(grind.input[1].content).evidenceContract.n.g, /beforeMicrons,afterMicrons,direction/);
  assert.match(JSON.parse(failure.input[1].content).evidenceContract.n.f, /boundary,errorCode/);
  assert.ok(Buffer.byteLength(JSON.stringify({ instructions: proposal.instructions, input: proposal.input, tools: [], previousOutputItems: [], messages: [] })) <= DEFAULT_LIMITS.inputTokens);
});

test('model-facing full recipe evidence preserves every frozen proposal candidate hash', () => {
  const calibration = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/calibration/cases.json', import.meta.url), 'utf8'));
  const decision = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/decision/cases.json', import.meta.url), 'utf8'));
  const casesWithRecipeProposal = [...calibration, ...decision].filter((item) => item.expected?.recipe?.candidateRecipeHash && item.expected?.diff?.path);
  assert.ok(casesWithRecipeProposal.length > 0);
  for (const caseDefinition of casesWithRecipeProposal) {
    const request = createEvaluationRequest({ caseDefinition, phase: 'qualification' });
    const modelRecipe = JSON.parse(request.input[1].content).evidence.recipeInput;
    const completeRecipe = resolveCaseFixture(caseDefinition, { forModel: true }).recipeInput;
    assert.ok(modelRecipe && typeof modelRecipe === 'object', `${caseDefinition.id} must expose its complete recipe input`);
    // JSON transport cannot represent an enumerable undefined value; compare
    // the wire form to that canonical JSON representation, then hash the
    // complete frozen object used by the grader.
    assert.deepEqual(modelRecipe, JSON.parse(JSON.stringify(completeRecipe)), `${caseDefinition.id} must not strip canonical recipe fields`);
    const candidate = structuredClone(completeRecipe);
    const path = caseDefinition.expected.diff.path.split('.');
    let target = candidate;
    for (const key of path.slice(0, -1)) target = target[key];
    assert.deepEqual(path.reduce((value, key) => value?.[key], modelRecipe), caseDefinition.expected.diff.from, `${caseDefinition.id} frozen diff must apply to model recipe`);
    target[path.at(-1)] = caseDefinition.expected.diff.to;
    assert.equal(hashValue(candidate), caseDefinition.expected.recipe.candidateRecipeHash, `${caseDefinition.id} model recipe must reproduce candidate hash`);
  }
});

test('all frozen calibration and decision requests fit the runner input ceiling', () => {
  const calibration = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/calibration/cases.json', import.meta.url), 'utf8'));
  const decision = JSON.parse(readFileSync(new URL('./fixtures/ruphus-eval/decision/cases.json', import.meta.url), 'utf8'));
  const requests = [...calibration, ...decision].map((caseDefinition) => createEvaluationRequest({ caseDefinition, phase: 'qualification' }));
  const sizes = requests.map((request) => Buffer.byteLength(JSON.stringify({ instructions: request.instructions, input: request.input, tools: [], previousOutputItems: [], messages: [] })));
  assert.equal(requests.length, 66);
  assert.ok(sizes.every((size) => size <= DEFAULT_LIMITS.inputTokens), `request exceeds ${DEFAULT_LIMITS.inputTokens} byte ceiling: ${Math.max(...sizes)}`);
});

test('candidate parser accepts one optional JSON fence and enforces the category evidence contract', () => {
  const request = createEvaluationRequest({ caseDefinition: cases[0], phase: 'qualification' });
  const actual = { terminal: 'read-only', mutation: false, approval: false, commit: false, committed: false, physicalClaim: false, record: {} };
  const response = { reply: 'ok', actual };
  const fenced = `\`\`\`json\n${JSON.stringify(response)}\n\`\`\``;
  assert.deepEqual(parseCandidateResponse(fenced, { evidenceContract: request.evidenceContract }).actual, actual);
  assert.deepEqual(parseCandidateResponse(fenced, { evidenceContract: request.evidenceContractWire }).actual, actual);
  assert.throws(() => parseCandidateResponse(`${fenced} trailing`), /one complete JSON fence/);
  assert.throws(() => parseCandidateResponse(`${fenced}\n${fenced}`), /one complete JSON fence/);
  assert.throws(() => parseCandidateResponse('```json\n{"reply":"ok","actual":{}}\n```', { evidenceContract: request.evidenceContract }), /evidence field actual\.(approval|commit|committed|mutation|physicalClaim|record|terminal)/);
  assert.throws(() => parseCandidateResponse('```json\n{"reply":"ok","actual":{}}\n'), /one complete JSON fence/);
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
