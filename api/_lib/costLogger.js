import { getDb } from './cors-auth.js';
import { FieldValue } from 'firebase-admin/firestore';

// Per-million-token rates in USD. Update when models or pricing change.
const RATES = {
  'claude-sonnet-4-6':              { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001':      { input: 0.80,  output: 4.00,  cacheRead: 0.08, cacheWrite: 1.00 },
  'gpt-5.4':                        { input: 2.50,  output: 10.00 },
  'gpt-5.4-mini':                   { input: 0.15,  output: 0.60  },
  'gemini-2.5-flash':               { input: 0.15,  output: 0.60  },
  'gemini-2.5-flash-preview-05-20': { input: 0.15,  output: 0.60  },
  'gemini-3.1-flash-image-preview': { input: 0.15,  output: 0.60  },
};

function normalizeUsage(provider, usage) {
  if (!usage) return null;

  if (provider === 'anthropic') {
    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    return { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, totalTokens: input + output };
  }

  if (provider === 'openai') {
    const input = usage.prompt_tokens || 0;
    const output = usage.completion_tokens || 0;
    return { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: input + output };
  }

  if (provider === 'gemini') {
    const input = usage.promptTokenCount || 0;
    const output = usage.candidatesTokenCount || 0;
    const total = usage.totalTokenCount || (input + output);
    return { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: total };
  }

  return null;
}

function calculateCost(model, tokens) {
  const rate = RATES[model];
  if (!rate) {
    console.warn(`[costLogger] Unknown model "${model}" — estimatedCost will be 0`);
    return 0;
  }
  const perM = 1_000_000;
  let cost = (tokens.inputTokens * rate.input + tokens.outputTokens * rate.output) / perM;
  if (rate.cacheRead) cost += (tokens.cacheReadTokens * rate.cacheRead) / perM;
  if (rate.cacheWrite) cost += (tokens.cacheWriteTokens * rate.cacheWrite) / perM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function logApiUsage({ uid, provider, model, feature, endpoint, usage }) {
  const tokens = normalizeUsage(provider, usage);
  if (!tokens) return;

  const doc = {
    provider,
    model,
    feature: feature || 'unknown',
    endpoint,
    ...tokens,
    estimatedCost: calculateCost(model, tokens),
    createdAt: FieldValue.serverTimestamp(),
  };

  if (uid) doc.uid = uid;

  try {
    const db = getDb();
    db.collection('apiUsage').add(doc).catch((err) => {
      console.error('[costLogger] Firestore write failed:', err.message);
    });
  } catch (err) {
    console.error('[costLogger] getDb() failed:', err.message);
  }
}
