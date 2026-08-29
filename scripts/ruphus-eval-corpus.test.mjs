import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hashValue } from './ruphus-eval/contracts.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = readJson('./fixtures/ruphus-eval/manifest.json');
const calibration = readJson('./fixtures/ruphus-eval/calibration/cases.json');
const decision = readJson('./fixtures/ruphus-eval/decision/cases.json');
const requiredMethods = new Set(['aiden', 'v60', 'kalita', 'v60-switch', 'v60-iced', 'kalita-iced']);
const requiredFields = ['id', 'category', 'method', 'mode', 'action', 'evidenceCondition', 'expectedTerminal', 'groundTruth', 'criticalFailures', 'assertions'];
const initialActions = new Set(['read', 'diagnose', 'propose', 'clarify', 'refuse', 'unauthorized']);

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
    assert.equal(item.groundTruth.mutation === true, item.expectedTerminal === 'resume-idempotent');
    assert.doesNotMatch(JSON.stringify(item), /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${item.id}:PII`);
    assert.doesNotMatch(JSON.stringify(item), /202[0-9]-[0-9]{2}-[0-9]{2}T/, `${item.id}:mutable timestamp`);
  }
  assert.ok([...decision.map((item) => item.method)].some((method) => method.endsWith('-iced')));
  assert.ok(decision.some((item) => ['chemex', 'aeropress', 'french-press'].includes(item.method)));
  assert.equal(new Set(decision.slice(0, 20).map((item) => item.id)).size, 20);
  assert.equal(new Set(decision.slice(20, 44).map((item) => item.id)).size, 24);
  assert.equal(new Set([...decision.slice(0, 20), ...decision.slice(20, 44)].map((item) => item.id)).size, 44);
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
  assert.equal(manifest.hashes.tools, hashValue(manifest.toolContract));
  assert.equal(manifest.hashes.validators, hashValue(manifest.validatorRefs.map((path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))));
  assert.equal(manifest.hashes.graders, hashValue(manifest.graderRefs.map((path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))));
  assert.equal(manifest.hashes.rubric, hashValue(readFileSync(new URL('./../docs/data/ruphus-model-eval/rubric.md', import.meta.url), 'utf8')));
  assert.equal(manifest.hashes.winnerOrdering, hashValue(manifest.winnerOrdering));
  assert.equal(manifest.hashes.retryPolicy, hashValue({ retryReserveRate: manifest.schedule.retryReserveRate, contingencyRate: manifest.schedule.contingencyRate }));
  assert.equal(manifest.hashes.schedule, hashValue(manifest.schedule));
});
