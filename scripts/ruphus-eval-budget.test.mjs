import assert from 'node:assert/strict';
import test from 'node:test';
import { BudgetReservation, estimateSchedule, MODEL_ARMS } from './ruphus-eval/models.mjs';
test('conservative complete schedule fits the approved cap before paid work', () => assert.equal(estimateSchedule({ includeWarmFinalists: false }).feasible, true));
test('reservations reject duplicate and over-cap allocations', () => {
  const budget = new BudgetReservation(1); budget.reserve('a', 0.6);
  assert.throws(() => budget.reserve('a', 0.1), /duplicate/); assert.throws(() => budget.reserve('b', 0.5), /exceeded/);
});
test('all exact arms are present', () => assert.equal(MODEL_ARMS.length, 6));
