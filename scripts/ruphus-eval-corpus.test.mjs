import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hashValue } from './ruphus-eval/contracts.mjs';
import { casePayloadHash, gradeCase, runCase } from './ruphus-eval/cases.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const repoRoot = new URL('../', import.meta.url);
const readRepoFile = (path) => readFileSync(new URL(path, repoRoot), 'utf8');
const manifest = readJson('./fixtures/ruphus-eval/manifest.json');
const calibration = readJson('./fixtures/ruphus-eval/calibration/cases.json');
const decision = readJson('./fixtures/ruphus-eval/decision/cases.json');
const requiredMethods = new Set(['aiden', 'v60', 'kalita', 'v60-switch', 'v60-iced', 'kalita-iced']);
const requiredFields = ['id', 'category', 'method', 'mode', 'action', 'evidenceCondition', 'expectedTerminal', 'groundTruth', 'criticalFailures', 'assertions'];
const initialActions = new Set(['read', 'diagnose', 'propose', 'clarify', 'refuse', 'unauthorized']);
const expectedPayloadFields = ['recipe', 'diff', 'grind', 'fault', 'ledger'];

function assertPartition(name, ids) {
  assert.equal(ids.length, name === 'qualification' ? 20 : 24);
  assert.equal(new Set(ids).size, ids.length, `${name}:duplicate ids`);
  const cases = ids.map((id) => decision.find((item) => item.id === id));
  assert.ok(cases.every(Boolean), `${name}:unknown case`);
  assert.deepEqual(new Set(cases.map((item) => item.category)), new Set(['exact-recall', 'taste-diagnosis', 'method-grinder', 'authority-revision', 'failures-receipts']), `${name}:categories`);
  const methods = new Set(cases.map((item) => item.method));
  for (const method of requiredMethods) assert.ok(methods.has(method), `${name}:method:${method}`);
  assert.ok(new Set(cases.map((item) => item.mode)).size >= 2, `${name}:modes`);
  assert.deepEqual(new Set(cases.map((item) => item.action)), initialActions, `${name}:actions`);
  assert.ok(new Set(cases.map((item) => item.evidenceCondition)).size >= 4, `${name}:evidence strata`);
  assert.ok(cases.every((item) => item.criticalFailures.length > 0), `${name}:failure strata`);
}

test('U4 corpus is unique, balanced, synthetic, and fully adjudicated', () => {
  assert.equal(calibration.length, 6);
  assert.equal(decision.length, 60);
  assert.equal(new Set(decision.map((item) => item.id)).size, 60);
  assert.deepEqual(new Set(decision.map((item) => item.category)), new Set(['exact-recall', 'taste-diagnosis', 'method-grinder', 'authority-revision', 'failures-receipts']));
  for (const category of new Set(decision.map((item) => item.category))) assert.equal(decision.filter((item) => item.category === category).length, 12, category);
  for (const item of [...calibration, ...decision]) {
    for (const field of requiredFields) assert.ok(Object.prototype.hasOwnProperty.call(item, field), `${item.id}:${field}`);
    assert.ok(requiredMethods.has(item.method) || ['chemex', 'aeropress', 'french-press'].includes(item.method), item.id);
    assert.ok(manifest.terminalStates.includes(item.expectedTerminal), `${item.id}:terminal`);
    assert.ok(initialActions.has(item.action), `${item.id}:initial-action`);
    assert.equal(typeof item.userPrompt, 'string');
    assert.equal(item.fixture.phase, calibration.includes(item) ? 'calibration' : 'decision');
    assert.equal(item.fixture.identity.method, item.method);
    assert.equal(item.fixture.identity.mode, item.mode);
    assert.deepEqual(item.fixture.identity.provenance, item.expected.provenance);
    for (const field of expectedPayloadFields) assert.ok(Object.prototype.hasOwnProperty.call(item.expected, field), `${item.id}:expected:${field}`);
    assert.equal(item.grader.deterministic, true);
    assert.equal(typeof item.grader.name, 'string');
    assert.doesNotThrow(() => runCase(item));
    assert.match(casePayloadHash(item), /^[a-f0-9]{64}$/);
    assert.equal(item.groundTruth.mutation === true, item.expectedTerminal === 'resume-idempotent');
    assert.doesNotMatch(JSON.stringify(item), /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${item.id}:PII`);
    assert.doesNotMatch(JSON.stringify(item), /202[0-9]-[0-9]{2}-[0-9]{2}T/, `${item.id}:mutable timestamp`);
  }
  assert.ok([...decision.map((item) => item.method)].some((method) => method.endsWith('-iced')));
  assert.ok(decision.some((item) => ['chemex', 'aeropress', 'french-press'].includes(item.method)));
  assertPartition('qualification', manifest.partitions.qualification);
  assertPartition('finalistDecision', manifest.partitions.finalistDecision);
  assert.equal(new Set([...manifest.partitions.qualification, ...manifest.partitions.finalistDecision]).size, 44);
  assert.ok(calibration.every((item) => item.fixture.phase === 'calibration'));
  assert.ok(decision.every((item) => item.fixture.phase === 'decision'));
  assert.equal(new Set(calibration.map(casePayloadHash)).size, calibration.length);
  assert.equal(new Set(decision.map(casePayloadHash)).size, decision.length);
  assert.equal(new Set(calibration.map(casePayloadHash).filter((hash) => decision.map(casePayloadHash).includes(hash))).size, 0);
});

test('U4 manifest freezes the amended schedule and gate-first outcomes', () => {
  assert.equal(manifest.budget.providerCapUsd, 30);
  assert.equal(manifest.budget.approvedDispatchReservationUsd, 27.798201000000006);
  assert.equal(manifest.budget.headroomUsd, 2.201798999999994);
  assert.equal(manifest.schedule.calibrationPassesMaximum, 2);
  assert.equal(manifest.schedule.qualificationCasesPerArm, 20);
  assert.equal(manifest.schedule.qualificationRepeats, 2);
  assert.equal(manifest.schedule.finalistMaximum, 2);
  assert.equal(manifest.schedule.finalistDecisionCases, 24);
  assert.equal(manifest.schedule.lifecycleOwnedBy, 'U7');
  assert.equal(manifest.schedule.warmTurnsReserved, 80);
  assert.equal(manifest.schedule.retryReserveRate, 0.25);
  assert.deepEqual(manifest.winnerOrdering.slice(0, 3), ['critical-failure-veto', 'hard-gates', 'absolute-blind-floor']);
  assert.ok(manifest.terminalStates.includes('insufficient-evidence'));
  assert.ok(manifest.terminalStates.includes('no-pass'));
  assert.equal(manifest.outcomeTable['incomplete-six-arm-field'], 'insufficient-evidence');
  assert.equal(manifest.outcomeTable['zero-eligible'], 'no-pass');
  assert.equal(manifest.absoluteUxFloor.minimumScore, 3);
  assert.equal(manifest.absoluteUxFloor.unknownFailsFloor, true);
  assert.equal(manifest.blindSchedules.randomizedLeftRight, true);
  assert.equal(manifest.blindSchedules.unblinding, 'after-score-lock');
  for (const value of Object.values(manifest.hashes)) assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(manifest.hashes.corpora, hashValue({ calibration, decision }));
  assert.equal(manifest.hashes.prompts, hashValue(manifest.promptContract));
  assert.equal(manifest.hashes.tools, hashValue(manifest.toolRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.modelRegistry, hashValue(manifest.modelRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.validators, hashValue(manifest.validatorRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.graders, hashValue(manifest.graderRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.renderer, hashValue(manifest.rendererRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.corpusManifest, hashValue(readRepoFile(manifest.corpusManifestRef)));
  assert.equal(manifest.hashes.rubric, hashValue(readRepoFile(manifest.rubricRef)));
  assert.equal(manifest.hashes.blindReviewProtocol, hashValue(readRepoFile(manifest.blindReviewProtocolRef)));
  assert.equal(manifest.hashes.physicalProtocol, hashValue(readRepoFile(manifest.physicalProtocolRef)));
  assert.equal(manifest.hashes.winnerOrdering, hashValue(manifest.winnerOrdering));
  assert.equal(manifest.hashes.retryPolicy, hashValue({ retryReserveRate: manifest.schedule.retryReserveRate, contingencyRate: manifest.schedule.contingencyRate }));
  assert.equal(manifest.hashes.schedule, hashValue(manifest.schedule));
  assert.equal(manifest.hashes.partitions, hashValue(manifest.partitions));
  const { evaluationHash: ignoredEvaluationHash, ...componentHashes } = manifest.hashes;
  assert.equal(manifest.hashes.evaluationHash, hashValue({ ...manifest, hashes: componentHashes }));
});

test('U4 cases execute through deterministic category graders', () => {
  const recallCase = decision.find((item) => item.category === 'exact-recall');
  const diagnosisCase = decision.find((item) => item.category === 'taste-diagnosis');
  const recipeCase = decision.find((item) => item.category === 'method-grinder');
  const authorityCase = decision.find((item) => item.category === 'authority-revision');
  const failureCase = decision.find((item) => item.category === 'failures-receipts');
  assert.equal(gradeCase(recallCase, { ...recallCase.expected.identity, recipeHash: recallCase.expected.identity.revisionId, provenance: recallCase.expected.provenance, terminal: recallCase.expected.terminal }).hardGate, true);
  assert.equal(gradeCase(recallCase, { ...recallCase.expected.identity, recipeHash: 'wrong', provenance: recallCase.expected.provenance, terminal: recallCase.expected.terminal }).hardGate, false);
  assert.equal(gradeCase(diagnosisCase, { terminal: diagnosisCase.expected.terminal, action: diagnosisCase.action, mutation: false }).hardGate, true);
  assert.equal(gradeCase(recipeCase, { terminal: recipeCase.expected.terminal, mutation: false, recipe: { valid: true, method: recipeCase.method }, grind: { valid: true } }).hardGate, true);
  assert.equal(gradeCase(authorityCase, { terminal: authorityCase.expected.terminal, events: [{ mutation: false }] }).hardGate, true);
  assert.equal(gradeCase(failureCase, { terminal: failureCase.expected.terminal, mutation: false, failureAttributed: true }).hardGate, true);
  assert.equal(gradeCase(failureCase, { terminal: failureCase.expected.terminal, mutation: false, failureAttributed: false }).hardGate, false);
});
