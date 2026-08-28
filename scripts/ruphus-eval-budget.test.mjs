import assert from 'node:assert/strict';
import test from 'node:test';
import { BudgetReservation, estimateSchedule, MODEL_ARMS, assertExactArms, LONG_CONTEXT_THRESHOLD, estimateTurnCost, validateLimits } from './ruphus-eval/models.mjs';
test('conservative complete schedule explicitly accounts for tool loops and fails closed when over cap', () => {
  const estimate = estimateSchedule();
  assert.equal(estimate.initialModelTurnsPerArm, 910); // (60*3 + 2 canaries) * five turns
  assert.ok(estimate.lifecycleTurns > 0 && estimate.warmCreationTurn > 0 && estimate.warmRead > 0);
  assert.equal(estimate.feasible, false);
  assert.ok(estimate.total > estimate.cap);
});
test('reservations reject duplicate and over-cap allocations', () => {
  const budget = new BudgetReservation(1); budget.reserve('a', 0.6);
  assert.throws(() => budget.reserve('a', 0.1), /duplicate/); assert.throws(() => budget.reserve('b', 0.5), /exceeded/);
});
test('all exact arms are present and unique', () => {
  assert.equal(MODEL_ARMS.length, 6);
  assert.throws(() => new BudgetReservation(76), /no higher/);
  assert.throws(() => assertExactArms([MODEL_ARMS[0], ...MODEL_ARMS.slice(0, 5)]), /exactly once/);
});
test('long-context pricing is fail-closed until explicitly frozen', () => {
  assert.throws(() => estimateTurnCost(MODEL_ARMS[0], { inputTokens: LONG_CONTEXT_THRESHOLD + 1, outputTokens: 1 }), /long-context/);
  assert.throws(() => estimateTurnCost({ ...MODEL_ARMS[0], model: 'unknown-model' }), /unknown pricing/);
  assert.throws(() => assertExactArms([{ ...MODEL_ARMS[0], model: 'wrong-model' }, ...MODEL_ARMS.slice(1)]), /canonical model/);
});
test('schedule limits cannot be manipulated into free or negative work', () => {
  for (const key of ['toolTurns', 'cases', 'repeats', 'finalistCases', 'finalistRepeats']) assert.throws(() => validateLimits({ ...estimateSchedule ? { inputTokens: 1, outputTokens: 1, toolTurns: 1, cases: 1, repeats: 1, finalistCases: 1, finalistRepeats: 1, retries: 0, canaryRuns: 0 } : {}, [key]: 0 }), /invalid/);
  assert.throws(() => estimateSchedule({ limits: { inputTokens: 1, outputTokens: 1, toolTurns: 1, cases: 1, repeats: 1, finalistCases: 1, finalistRepeats: 1, retries: -1, canaryRuns: 0 } }), /invalid/);
  assert.throws(() => estimateSchedule({ limits: { inputTokens: 1, outputTokens: -1, toolTurns: 1, cases: 1, repeats: 1, finalistCases: 1, finalistRepeats: 1, retries: 0, canaryRuns: 0 } }), /invalid/);
});
