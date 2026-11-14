import assert from 'node:assert/strict';
import test from 'node:test';
import { BudgetReservation, estimateSchedule, MODEL_ARMS, assertExactArms, LONG_CONTEXT_THRESHOLD, estimateTurnCost, validateLimits, DEFAULT_LIMITS, EVALUATION_CAP_USD, APPROVED_DISPATCH_RESERVATION_USD } from './ruphus-eval/models.mjs';
test('sequential six-arm qualification and finalist phases fit the amended cap', () => {
  const estimate = estimateSchedule();
  assert.equal(estimate.qualificationRunsPerArm, 40);
  assert.equal(estimate.qualificationModelTurnsPerArm, 40); // 20 cases * 2 repeats * 1 turn
  assert.ok(estimate.qualification > 0 && estimate.decision > 0 && estimate.lifecycle > 0 && estimate.warm > 0);
  assert.equal(estimate.warmCalls, 80); // 2 finalists * 8 cases * 5 turns
  assert.equal(estimate.cap, 30); assert.equal(estimate.cap, EVALUATION_CAP_USD);
  assert.equal(estimate.total, APPROVED_DISPATCH_RESERVATION_USD);
  assert.equal(estimate.feasible, true);
  assert.ok(estimate.total > 27.79 && estimate.total < 27.81);
  assert.ok(estimate.headroom > 2.19 && estimate.headroom < 2.21);
  assert.throws(() => estimateSchedule({ limits: { qualificationCases: 1 } }), /frozen schedule/);
  assert.throws(() => estimateSchedule({ arms: MODEL_ARMS.slice(0, 5) }), /frozen schedule/);
});
test('reservations reject duplicate and over-cap allocations', () => {
  const budget = new BudgetReservation(1); budget.reserve('a', 0.6);
  assert.throws(() => budget.reserve('a', 0.1), /duplicate/); assert.throws(() => budget.reserve('b', 0.5), /exceeded/);
});
test('all exact arms are present and unique', () => {
  assert.equal(MODEL_ARMS.length, 6);
  assert.equal(EVALUATION_CAP_USD, 30);
  assert.equal(new BudgetReservation().cap, APPROVED_DISPATCH_RESERVATION_USD);
  assert.throws(() => new BudgetReservation(EVALUATION_CAP_USD), /approved dispatch reservation/);
  assert.throws(() => new BudgetReservation(76), /approved dispatch reservation/);
  const reservation = new BudgetReservation(1);
  assert.equal(typeof reservation.release, 'undefined');
  assert.throws(() => assertExactArms([MODEL_ARMS[0], ...MODEL_ARMS.slice(0, 5)]), /exactly once/);
});
test('long-context pricing is fail-closed until explicitly frozen', () => {
  assert.throws(() => estimateTurnCost(MODEL_ARMS[0], { inputTokens: LONG_CONTEXT_THRESHOLD + 1, outputTokens: 1 }), /long-context/);
  assert.throws(() => estimateTurnCost({ ...MODEL_ARMS[0], model: 'unknown-model' }), /unknown pricing/);
  assert.throws(() => assertExactArms([{ ...MODEL_ARMS[0], model: 'wrong-model' }, ...MODEL_ARMS.slice(1)]), /canonical model/);
});
test('schedule limits cannot be manipulated into free or negative work', () => {
  for (const key of ['qualificationCases', 'qualificationRepeats', 'qualificationToolTurns', 'decisionCases', 'decisionRepeats', 'decisionToolTurns', 'lifecycleCases', 'lifecycleRepeats', 'lifecycleToolTurns']) assert.throws(() => validateLimits({ ...DEFAULT_LIMITS, [key]: 0 }), /invalid/);
  assert.throws(() => estimateSchedule({ limits: { retryReserveRate: -1 } }), /frozen schedule/);
  assert.throws(() => estimateSchedule({ limits: { outputTokens: -1 } }), /frozen schedule/);
  assert.throws(() => estimateSchedule({ limits: { calibrationPasses: 3 } }), /frozen schedule/);
  assert.throws(() => estimateSchedule({ limits: { warmTriggerCostDeltaUsd: 0 } }), /frozen schedule/);
  assert.throws(() => estimateSchedule({ limits: { finalistCount: 3 } }), /frozen schedule/);
});
