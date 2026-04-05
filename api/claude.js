// Vercel serverless proxy for Claude API
// Keeps ANTHROPIC_API_KEY server-side only
import Anthropic from '@anthropic-ai/sdk';
import { withCorsAuth } from './lib/cors-auth.js';

const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
const MAX_TOKENS_CAP = 4000;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

export default withCorsAuth(async (req, res) => {
  try {
    const { system, messages, maxTokens = 1000, model: requestedModel = 'claude-sonnet-4-6' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'claude-sonnet-4-6';
    const safeMaxTokens = Math.min(maxTokens || 1000, MAX_TOKENS_CAP);

    const params = {
      model,
      max_tokens: safeMaxTokens,
      messages,
    };

    if (system) {
      params.system = system;
    }

    let response;
    try {
      response = await client.messages.create(params);
    } catch (primaryError) {
      // On overload/rate-limit, fall back to Haiku
      if ([429, 529].includes(primaryError.status) && model !== FALLBACK_MODEL) {
        console.warn(`Primary model ${model} unavailable (${primaryError.status}), falling back to ${FALLBACK_MODEL}`);
        params.model = FALLBACK_MODEL;
        response = await client.messages.create(params);
      } else {
        throw primaryError;
      }
    }

    return res.status(200).json({ content: response.content, stop_reason: response.stop_reason, usage: response.usage });
  } catch (error) {
    console.error('Claude API error:', error);
    const status = error.status || 500;
    const detail = error.error?.error?.message || error.message || 'Unknown error';
    return res.status(status).json({ error: detail });
  }
});
