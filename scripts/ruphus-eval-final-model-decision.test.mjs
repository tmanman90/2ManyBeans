import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const decision = JSON.parse(readFileSync(new URL('../docs/data/ruphus-model-eval/runs/ruphus-final-model-decision.json', import.meta.url), 'utf8'));
const report = readFileSync(new URL('../docs/data/ruphus-model-eval/FINAL-MODEL-DECISION.md', import.meta.url), 'utf8');

test('redacted final decision preserves the locked rule and terminal result', () => {
  assert.equal(decision.kind, 'ruphus-final-model-decision');
  assert.equal(decision.classification, 'insufficient-evidence');
  assert.equal(decision.run.screen.attempts, 60);
  assert.equal(decision.run.screen.completed, 60);
  assert.deepEqual(decision.run.screen.eligibleArms, ['luna-medium', 'terra-medium']);
  assert.equal(decision.run.screen.blindPreference, 'luna-medium');
  assert.equal(decision.run.finalist.attempts, 24);
  assert.equal(decision.run.finalist.completed, 24);
  assert.equal(decision.run.finalist.retryCount, 0);
  assert.equal(decision.arms['luna-medium'].workflowValidRepeats['approval-bound-apply'].length, 0);
  assert.equal(decision.arms['terra-medium'].workflowValidRepeats['approval-bound-apply'].length, 0);
  assert.equal(decision.arms['terra-medium'].workflowValidRepeats['fellow-preparation-receipt'].length, 1);
  assert.deepEqual(decision.terminal.finalists, []);
  assert.equal(decision.terminal.modelSelected, false);
  assert.equal(decision.terminal.shippingChat, 'unchanged');
  assert.equal(decision.terminal.agentV3, 'locked');
  assert.equal(decision.terminal.productionModelSwitch, false);
  assert.equal(decision.budget.providerCapUsd, 30);
  assert.equal(decision.budget.frozenDispatchReservationUsd, 27.798201000000006);
  assert.equal(decision.knownArtifactMeteredSpendUsd.total, 0.7365299999999998);
  assert.equal(decision.rawProviderContentCommitted, false);
  assert.match(report, /insufficient-evidence/);
  assert.match(report, /calibration-outcome\.json/);
  assert.match(report, /development candidate/);
});
