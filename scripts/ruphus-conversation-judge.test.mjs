import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCalibration, createAnthropicJudgeAdapter, createBlindJudgePacket, createBlindPairwisePacket, createCalibrationPackets, JUDGE_DIMENSIONS, JUDGE_INSTRUCTIONS, JUDGE_SCHEMA_VERSION, pairwisePass, validateJudgeResult, validatePairwiseResult } from './ruphus-conversation-judge.mjs';

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

test('calibration packets are exactly 11 plus 11 and carry no calibration label', () => {
  const gold = Array.from({ length: 11 }, (_, index) => ({ id: `AE${String(index + 1).padStart(2, '0')}`, intent: 'intent', transcript: [] }));
  const knownBad = gold.map((item) => ({ ...item }));
  const packets = createCalibrationPackets({ gold, knownBad, factSheet: 'facts', seed: 'frozen' });
  assert.equal(packets.length, 22);
  assert.equal(packets.every((packet) => !JSON.stringify(packet).includes('known-bad') && !JSON.stringify(packet).includes('gold')), true);
  assert.equal(Object.isFrozen(JUDGE_INSTRUCTIONS), true);
  assert.match(JUDGE_INSTRUCTIONS, /Ordinary coffee advice.*is a suggestion, not a proposal/);
  assert.match(JUDGE_INSTRUCTIONS, /fact sheet is your correctness key, not proof that every fact was available/);
  assert.match(JUDGE_INSTRUCTIONS, /coffee-level tasting that is old or unlinked cannot diagnose today's specific brew/);
});

test('Anthropic judge adapter uses frozen instructions and parses streamed usage without printing auth', async () => {
  const prior = process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS; process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS = '100';
  try {
    const result = judged(4);
    const response = { ok: true, headers: { get: () => 'text/event-stream' }, text: async () => `data: ${JSON.stringify({ type: 'message_start', message: { model: 'claude-sonnet-5', usage: { input_tokens: 10 } }})}\n\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: JSON.stringify(result) }})}\n\ndata: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 10 }})}\n\n` };
    const adapter = createAnthropicJudgeAdapter({ token: 'canary-token', fetchImpl: async (_url, request) => { assert.equal(request.headers['x-api-key'], 'canary-token'); const body = JSON.parse(request.body); assert.match(body.system, /friendNotForm/); assert.equal(body.tool_choice.name, 'submit_result'); assert.equal(body.tools[0].input_schema.additionalProperties, false); return response; } });
    const envelope = await adapter({ promptVersion: 'v1' });
    assert.equal(envelope.provider, 'anthropic');
    assert.equal(envelope.usage.input_tokens, 10);
    assert.equal(validateJudgeResult(envelope.result).valid, true);
  } finally { if (prior === undefined) delete process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS; else process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS = prior; }
});

test('Anthropic judge accepts a forced structured tool result', async () => {
  const prior = process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS; process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS = '100';
  try {
    const result = { ...judged(5), schemaVersion: 'model-invented-version', mean: 1, rationale: `  ${'bounded '.repeat(100)}  ` };
    const response = { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'tool_use', name: 'submit_result', input: result }] }) };
    const envelope = await createAnthropicJudgeAdapter({ token: 'canary-token', fetchImpl: async () => response })({ promptVersion: 'v1' });
    assert.equal(envelope.result.schemaVersion, JUDGE_SCHEMA_VERSION);
    assert.equal(envelope.result.mean, 5);
    assert.equal(envelope.result.rationale.length, 500);
    assert.equal(envelope.result.rationale.startsWith('bounded'), true);
    assert.equal(validateJudgeResult(envelope.result).valid, true);
  } finally { if (prior === undefined) delete process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS; else process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS = prior; }
});
