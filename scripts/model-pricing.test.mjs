import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCost, normalizeUsage, MODEL_PRICING } from '../api/_lib/modelPricing.js';
test('normalizes provider usage and bills reasoning once', () => {
  const usage = normalizeUsage('openai', { input_tokens: 1_000, output_tokens: 500, output_tokens_details: { reasoning_tokens: 200 } });
  assert.equal(usage.totalTokens, 1500); assert.equal(usage.reasoningTokens, 200);
  assert.equal(calculateCost('gpt-5.6-luna', usage), 0.0008);
});
test('anthropic cache categories are priced separately', () => {
  const usage = normalizeUsage('anthropic', { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 200, cache_creation_input_tokens: 300, thinking_tokens: 80 });
  assert.equal(calculateCost('claude-sonnet-5', usage), 0.00379);
  assert.equal(usage.thinkingTokens, 80);
});
test('OpenAI cached input is discounted, not charged twice', () => {
  const usage = normalizeUsage('openai', { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 400 } });
  assert.equal(calculateCost('gpt-5.6-terra', usage), 0.00248);
});
test('OpenAI cache writes are inclusive input and billed at 1.25x', () => {
  const usage = normalizeUsage('openai', { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 } });
  assert.equal(calculateCost('gpt-5.6-terra', usage), 0.00299);
  assert.equal(normalizeUsage('openai', { input_tokens: 100, output_tokens: 1, input_tokens_details: { cached_tokens: 80, cache_write_tokens: 21 } }), null);
});
test('known production model rates remain available', () => {
  assert.equal(calculateCost('gpt-5.4', normalizeUsage('openai', { input_tokens: 100, output_tokens: 10 })), 0.0004);
  assert.equal(calculateCost('gpt-5.4-mini', normalizeUsage('openai', { input_tokens: 100, output_tokens: 10 })), 0.00012);
  assert.ok(calculateCost('claude-haiku-4-5-20251001', normalizeUsage('anthropic', { input_tokens: 100, output_tokens: 10 })) > 0);
  assert.ok(calculateCost('gemini-2.5-flash', normalizeUsage('gemini', { promptTokenCount: 100, candidatesTokenCount: 10 })) > 0);
});
test('invalid token buckets fail closed', () => {
  assert.equal(normalizeUsage('openai', { input_tokens: 100, output_tokens: 1, input_tokens_details: { cached_tokens: 101 } }), null);
  assert.equal(normalizeUsage('anthropic', { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: -1 }), null);
  assert.equal(normalizeUsage('openai', { input_tokens: 1, output_tokens: 1, output_tokens_details: { reasoning_tokens: Number.NaN } }), null);
  assert.equal(normalizeUsage('openai', { input_tokens: null, output_tokens: null }), null);
  assert.equal(normalizeUsage('openai', { input_tokens: 1, output_tokens: 1, input_tokens_details: { cache_write_tokens: 'not-a-number' } }), null);
});
test('Anthropic cache write TTL buckets retain their distinct rates', () => {
  const usage = normalizeUsage('anthropic', { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 300, cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 }, output_tokens_details: { thinking_tokens: 7 } });
  assert.equal(usage.thinkingTokens, 7);
  assert.equal(calculateCost('claude-sonnet-5', usage), 0.001204);
});
test('unknown/incomplete data cannot become zero-cost evidence', () => {
  assert.equal(calculateCost('not-a-model', { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }), null);
  assert.equal(normalizeUsage('openai', { input_tokens: 1 }), null);
  assert.ok(MODEL_PRICING['gpt-5.6-luna']);
});
