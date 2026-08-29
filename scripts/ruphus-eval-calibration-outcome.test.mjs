import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { hashValue } from './ruphus-eval/contracts.mjs';

const outcome = JSON.parse(readFileSync(new URL('../docs/data/ruphus-model-eval/runs/ruphus-2026-08-28-e5acab4d-calibration-outcome.json', import.meta.url), 'utf8'));
const defaultArtifactDirectory = '/Users/talmeltzer/Library/Application Support/RuphusEval/2026-08-28-six-arm-e5acab4d';
const artifactDirectory = process.env.RUPHUS_EVAL_ARTIFACT_DIR || defaultArtifactDirectory;

function safeArtifactRecords() {
  if (!existsSync(artifactDirectory)) return null;
  return readdirSync(artifactDirectory).filter((name) => name.endsWith('.json')).sort().map((name) => {
    const artifact = JSON.parse(readFileSync(`${artifactDirectory}/${name}`, 'utf8'));
    const { checksum, ...content } = artifact;
    assert.equal(typeof checksum, 'string');
    assert.equal(hashValue(content), checksum, `checksum mismatch for ${name}`);
    return { attemptId: artifact.attemptId, runId: artifact.runId, checksum, evaluationHash: artifact.evaluationHash, armId: artifact.armId, caseId: artifact.caseId, repeat: artifact.repeat, telemetry: artifact.telemetry };
  });
}

function boundHash(records) {
  return hashValue(records.map(({ attemptId, checksum, evaluationHash, armId, caseId, repeat }) => ({ attemptId, checksum, evaluationHash, armId, caseId, repeat })).sort((a, b) => a.attemptId.localeCompare(b.attemptId)));
}

test('committed calibration outcome is a redacted, frozen terminal decision', () => {
  assert.equal(outcome.kind, 'ruphus-calibration-outcome');
  assert.equal(outcome.runId, 'ruphus-2026-08-28-e5acab4d');
  assert.equal(outcome.combined.attemptCount, 72);
  assert.equal(outcome.combined.completedCount, 72);
  assert.equal(outcome.combined.acceptedByFinalContract, 0);
  assert.equal(outcome.combined.retryCount, 0);
  assert.equal(outcome.terminal.classification, 'insufficient-evidence');
  assert.equal(outcome.terminal.reason, 'incomplete-calibration-evidence');
  assert.equal(outcome.terminal.modelSelected, false);
  assert.equal(outcome.terminal.shippingChat, 'unchanged');
  assert.equal(outcome.terminal.agentV3, 'locked');
  assert.equal(outcome.redaction.rawProviderContentCommitted, false);
  assert.equal(outcome.redaction.providerReasoningCommitted, false);
  assert.equal(outcome.redaction.headersOrSecretsCommitted, false);
  assert.equal(outcome.budget.providerCapUsd, 30);
  assert.equal(outcome.budget.approvedDispatchReservationUsd, 27.798201000000006);
  assert.equal(outcome.passes.length, 2);
  for (const pass of outcome.passes) {
    assert.equal(pass.attemptCount, 36);
    assert.equal(pass.completedCount, 36);
    assert.equal(pass.acceptedByFinalContract, 0);
    assert.equal(pass.retryCount, 0);
    assert.deepEqual(Object.keys(pass.perArm).sort(), [...outcome.arms].sort());
    assert.ok(Object.values(pass.perArm).every((arm) => arm.attemptCount === 6 && arm.completedCount === 6 && arm.acceptedByFinalContract === 0));
  }
});

test('checksum-valid artifact metadata deterministically derives the committed outcome', () => {
  const records = safeArtifactRecords();
  if (!records) return;
  assert.equal(records.length, outcome.combined.attemptCount);
  assert.ok(records.every((record) => record.runId === outcome.runId));
  const byEvaluation = new Map();
  for (const record of records) {
    const list = byEvaluation.get(record.evaluationHash) || [];
    list.push(record);
    byEvaluation.set(record.evaluationHash, list);
    assert.equal(record.repeat, 1);
    assert.ok(outcome.arms.includes(record.armId));
    assert.ok(Array.isArray(record.telemetry) && record.telemetry.length > 0);
  }
  assert.deepEqual([...byEvaluation.keys()].sort(), [...outcome.evaluationHashes].sort());
  let totalSpend = 0;
  for (const pass of outcome.passes) {
    const recordsForPass = byEvaluation.get(pass.evaluationHash);
    assert.equal(recordsForPass.length, pass.attemptCount);
    assert.equal(boundHash(recordsForPass), pass.checksumSetHash);
    const spend = recordsForPass.reduce((sum, record) => sum + record.telemetry.reduce((inner, turn) => inner + turn.cost, 0), 0);
    assert.ok(Math.abs(spend - pass.meteredSpendUsd) < 1e-12);
    totalSpend += spend;
    for (const armId of outcome.arms) assert.equal(recordsForPass.filter((record) => record.armId === armId).length, 6);
  }
  assert.equal(boundHash(records), outcome.combined.sortedChecksumSetHash);
  assert.ok(Math.abs(totalSpend - outcome.combined.meteredSpendUsd) < 1e-12);
});
