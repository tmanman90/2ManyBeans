import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCalibration, createBlindJudgePacket, createBlindPairwisePacket, JUDGE_DIMENSIONS, JUDGE_SCHEMA_VERSION, pairwisePass, validateJudgeResult, validatePairwiseResult } from './ruphus-conversation-judge.mjs';

const scores = (value) => Object.fromEntries(JUDGE_DIMENSIONS.map((dimension) => [dimension, value]));
const judged = (value) => ({ schemaVersion: JUDGE_SCHEMA_VERSION, scores: scores(value), mean: value, rationale: 'bounded rationale' });

test('judge schema is strict and means are reproducible', () => {
  assert.equal(validateJudgeResult(judged(4.5)).valid, true);
  assert.equal(validateJudgeResult({ ...judged(4), mean: 3 }).valid, false);
  assert.equal(validateJudgeResult({ ...judged(4), mean: 3.75, scores: { ...scores(4), listens: 2 } }).valid, true);
  assert.equal(validatePairwiseResult({ schemaVersion: JUDGE_SCHEMA_VERSION, winner: 'tie', rationale: 'not enough' }).valid, true);
});

test('calibration requires every gold and known-bad reference to meet thresholds', () => {
  assert.equal(assessCalibration({ goldResults: Array.from({ length: 11 }, () => judged(4.5)), knownBadResults: Array.from({ length: 11 }, () => judged(2.5)) }).calibrated, true);
  assert.equal(assessCalibration({ goldResults: Array.from({ length: 10 }, () => judged(4.5)), knownBadResults: Array.from({ length: 11 }, () => judged(2.5)) }).calibrated, false);
  assert.equal(assessCalibration({ goldResults: Array.from({ length: 11 }, () => judged(4.4)), knownBadResults: Array.from({ length: 11 }, () => judged(2.5)) }).calibrated, false);
});

test('blind packets contain only intent, fact sheet, and visible transcript', () => {
  const packet = createBlindJudgePacket({ id: 'AE01', intent: 'intent', factSheet: 'Jar 1: coffee', transcript: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'world' }], seed: 'x' });
  assert.equal(packet.schemaVersion, JUDGE_SCHEMA_VERSION);
  assert.equal(JSON.stringify(packet).includes('known-bad'), false);
  assert.equal(JSON.stringify(packet).includes('gold'), false);
  assert.equal(JSON.stringify(packet).includes('grader'), false);
  const pair = createBlindPairwisePacket({ candidate: [{ role: 'assistant', text: 'candidate' }], reference: [{ role: 'assistant', text: 'reference' }], intent: 'intent', factSheet: 'facts', seed: 'pair' });
  assert.equal(pair.left.length, 1);
  assert.equal(pairwisePass({ schemaVersion: JUDGE_SCHEMA_VERSION, winner: pair.orderToken, rationale: 'candidate is better' }, pair), true);
});
