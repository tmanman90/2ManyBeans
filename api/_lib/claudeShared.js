export const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
export const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
export const MAX_TOKENS_CAP = 4000;
export const RATE_LIMIT = { key: 'claude', limit: 120, windowMs: 60 * 60 * 1000 };

export function buildClaudeParams({ model, maxTokens, system, messages }) {
  const next = {
    model,
    max_tokens: Math.min(maxTokens || 1000, MAX_TOKENS_CAP),
    messages,
  };
  if (system) next.system = system;
  if (model === 'claude-sonnet-5') {
    next.thinking = { type: 'disabled' };
  }
  return next;
}
