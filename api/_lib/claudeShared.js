export const CHAT_MODEL = 'claude-sonnet-5-5';
export const FALLBACK_MODEL = 'claude-haiku-5-5';
export const ALLOWED_MODELS = [CHAT_MODEL, FALLBACK_MODEL];
export const MAX_TOKENS_CAP = 4000;
export const RATE_LIMIT = { key: 'claude', limit: 120, windowMs: 60 * 60 * 1000 };

// Every app call is a short reply with no tools, so neither model should
// spend the token cap on thinking. Sonnet 5.5 rejects `thinking: disabled`
// (400), so it gets `between_tools`, which never thinks without tools.
const THINKING_OFF = {
  [CHAT_MODEL]: { type: 'between_tools' },
  [FALLBACK_MODEL]: { type: 'disabled' },
};

export function buildClaudeParams({ model, maxTokens, system, messages }) {
  const next = {
    model,
    max_tokens: Math.min(maxTokens || 1000, MAX_TOKENS_CAP),
    messages,
    thinking: THINKING_OFF[model],
    output_config: { effort: 'low' },
  };
  if (system) next.system = system;
  return next;
}
