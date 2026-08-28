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
