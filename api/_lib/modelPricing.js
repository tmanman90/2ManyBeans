/** Single dated pricing authority shared by telemetry and evaluation. */
export const PRICING_REGISTRY_VERSION = '2026-08-28.1';
export const PRICING_REGISTRY_SOURCE = 'provider-pricing-pages-2026-08-28';
export const MODEL_PRICING = Object.freeze({
  'gpt-5.6-luna': Object.freeze({ input: 0.20, output: 1.20, cacheRead: 0.02, cacheWrite: 0.25, source: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna' }),
  'gpt-5.6-terra': Object.freeze({ input: 2, output: 12, cacheRead: 0.20, cacheWrite: 2.50, source: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra' }),
  'gpt-5.4': Object.freeze({ input: 2.50, output: 15, cacheRead: 0.25, cacheWrite: 3.125, source: 'https://developers.openai.com/api/docs/models' }),
  'gpt-5.4-mini': Object.freeze({ input: 0.75, output: 4.50, cacheRead: 0.075, cacheWrite: 0.9375, source: 'https://developers.openai.com/api/docs/models' }),
  'claude-sonnet-5': Object.freeze({ input: 2, output: 10, cacheRead: 0.20, cacheWrite: 2.50, cacheWrite1h: 4, source: 'https://platform.claude.com/docs/en/about-claude/pricing' }),
  'claude-sonnet-4-6': Object.freeze({ input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75, source: 'https://platform.claude.com/docs/en/about-claude/pricing' }),
  'claude-haiku-4-5-20251001': Object.freeze({ input: 0.80, output: 4, cacheRead: 0.08, cacheWrite: 1, source: 'https://platform.claude.com/docs/en/about-claude/pricing' }),
  'gemini-2.5-flash': Object.freeze({ input: 0.15, output: 0.60, cacheRead: 0, cacheWrite: 0, source: 'https://ai.google.dev/gemini-api/docs/pricing' }),
  'gemini-2.5-flash-preview-05-20': Object.freeze({ input: 0.15, output: 0.60, cacheRead: 0, cacheWrite: 0, source: 'https://ai.google.dev/gemini-api/docs/pricing' }),
  'gemini-3.1-flash-image-preview': Object.freeze({ input: 0.15, output: 0.60, cacheRead: 0, cacheWrite: 0, source: 'https://ai.google.dev/gemini-api/docs/pricing' }),
});
const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function getModelPrice(model, registry = MODEL_PRICING) {
  return registry?.[model] ? { ...registry[model], model, registryVersion: PRICING_REGISTRY_VERSION } : null;
}
export function normalizeUsage(provider, usage) {
  if (!usage || typeof usage !== 'object') return null;
  const has = (key) => Object.prototype.hasOwnProperty.call(usage, key);
  const required = provider === 'anthropic'
    ? [usage.input_tokens, usage.output_tokens]
    : provider === 'openai'
      ? [has('input_tokens') ? usage.input_tokens : usage.prompt_tokens, has('output_tokens') ? usage.output_tokens : usage.completion_tokens]
      : provider === 'gemini' ? [usage.promptTokenCount, usage.candidatesTokenCount] : [];
  if (required.length !== 2 || required.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null;
  const rawBuckets = provider === 'anthropic'
    ? [usage.cache_read_input_tokens, usage.cache_creation_input_tokens, usage.cache_creation?.ephemeral_5m_input_tokens, usage.cache_creation?.ephemeral_1h_input_tokens, usage.thinking_tokens, usage.output_tokens_details?.thinking_tokens]
    : provider === 'openai'
      ? [usage.input_tokens_details?.cached_tokens, usage.input_tokens_details?.cache_write_tokens, usage.input_token_details?.cached_tokens, usage.input_token_details?.cache_write_tokens, usage.prompt_tokens_details?.cached_tokens, usage.output_tokens_details?.reasoning_tokens, usage.completion_tokens_details?.reasoning_tokens, usage.reasoning_tokens]
      : [];
  if (rawBuckets.some((value) => value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0))) return null;
  let inputTokens; let outputTokens; let cacheReadTokens = 0; let cacheWriteTokens = 0; let cacheWrite5mTokens = 0; let cacheWrite1hTokens = 0; let reasoningTokens = 0; let thinkingTokens = 0;
  if (provider === 'anthropic') {
    inputTokens = finite(usage.input_tokens); outputTokens = finite(usage.output_tokens);
    cacheReadTokens = finite(usage.cache_read_input_tokens) ?? 0; cacheWriteTokens = finite(usage.cache_creation_input_tokens) ?? 0;
    cacheWrite5mTokens = finite(usage.cache_creation?.ephemeral_5m_input_tokens) ?? 0;
    cacheWrite1hTokens = finite(usage.cache_creation?.ephemeral_1h_input_tokens) ?? 0;
    if (cacheWrite5mTokens + cacheWrite1hTokens > 0) cacheWriteTokens = cacheWrite5mTokens + cacheWrite1hTokens;
    thinkingTokens = finite(usage.thinking_tokens ?? usage.output_tokens_details?.thinking_tokens) ?? 0;
  } else if (provider === 'openai') {
    inputTokens = finite(usage.input_tokens ?? usage.prompt_tokens); outputTokens = finite(usage.output_tokens ?? usage.completion_tokens);
    const detail = usage.output_tokens_details || usage.completion_tokens_details || {};
    reasoningTokens = finite(detail.reasoning_tokens) ?? finite(usage.reasoning_tokens) ?? 0;
    cacheReadTokens = finite(usage.input_tokens_details?.cached_tokens ?? usage.input_token_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens) ?? 0;
    cacheWriteTokens = finite(usage.input_tokens_details?.cache_write_tokens ?? usage.input_token_details?.cache_write_tokens) ?? 0;
  } else if (provider === 'gemini') {
    inputTokens = finite(usage.promptTokenCount); outputTokens = finite(usage.candidatesTokenCount); cacheReadTokens = finite(usage.cachedContentTokenCount) ?? 0;
  } else return null;
  const buckets = [cacheReadTokens, cacheWriteTokens, cacheWrite5mTokens, cacheWrite1hTokens, reasoningTokens, thinkingTokens];
  if (inputTokens == null || outputTokens == null || inputTokens < 0 || outputTokens < 0 || buckets.some((value) => !Number.isFinite(value) || value < 0)) return null;
  if (provider === 'openai' && cacheReadTokens + cacheWriteTokens > inputTokens) return null;
  return Object.freeze({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheWrite5mTokens, cacheWrite1hTokens, reasoningTokens, thinkingTokens,
    inputIncludesCache: provider === 'openai', totalTokens: inputTokens + outputTokens });
}
export function calculateCost(model, tokens, registry = MODEL_PRICING) {
  const price = getModelPrice(model, registry);
  if (!price || !tokens || !Number.isFinite(tokens.inputTokens) || !Number.isFinite(tokens.outputTokens)) return null;
  // OpenAI input_tokens includes cached input, so replace that portion with
  // the discounted bucket. Anthropic reports cache buckets separately.
  const inclusiveCache = tokens.inputIncludesCache ? (tokens.cacheReadTokens || 0) + (tokens.cacheWriteTokens || 0) : 0;
  const uncachedInput = tokens.inputIncludesCache ? Math.max(0, tokens.inputTokens - inclusiveCache) : tokens.inputTokens;
  const hasWriteBreakdown = (tokens.cacheWrite5mTokens || 0) + (tokens.cacheWrite1hTokens || 0) > 0;
  const fiveMinuteWrites = hasWriteBreakdown ? (tokens.cacheWrite5mTokens || 0) : (tokens.cacheWriteTokens || 0);
  const oneHourWrites = hasWriteBreakdown ? (tokens.cacheWrite1hTokens || 0) : 0;
  const value = (uncachedInput * price.input + tokens.cacheReadTokens * (price.cacheRead || 0) + tokens.outputTokens * price.output + fiveMinuteWrites * (price.cacheWrite || 0) + oneHourWrites * (price.cacheWrite1h || price.cacheWrite || 0)) / 1_000_000;
  return Math.round(value * 1_000_000) / 1_000_000;
}
export function priceUsage({ model, provider, usage }, registry = MODEL_PRICING) {
  const tokens = normalizeUsage(provider, usage); const cost = calculateCost(model, tokens, registry);
  return tokens && cost != null ? { tokens, cost, model, provider, pricingVersion: PRICING_REGISTRY_VERSION } : null;
}
export function snapshotPricing(registry = MODEL_PRICING) {
  return { version: PRICING_REGISTRY_VERSION, source: PRICING_REGISTRY_SOURCE, capturedAt: '2026-08-28', models: Object.fromEntries(Object.entries(registry).map(([model, price]) => [model, { ...price }])) };
}
