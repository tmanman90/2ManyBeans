// Vercel serverless proxy for Claude API
// Keeps ANTHROPIC_API_KEY server-side only
import Anthropic from '@anthropic-ai/sdk';
import { withCorsAuthMetered } from './_lib/cors-auth.js';
import { logApiUsage } from './_lib/costLogger.js';
import { ALLOWED_MODELS, FALLBACK_MODEL, RATE_LIMIT, buildClaudeParams } from './_lib/claudeShared.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

// Tasting coach + chat. Free users get 1 lifetime taste test; after that,
// Pro or Ultra is required. See subscription-paywall-prd.md for full rationale.
export default withCorsAuthMetered(async (req, res, decodedToken) => {
  try {
    const { system, messages, maxTokens = 1000, model: requestedModel = 'claude-sonnet-4-6', feature } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'claude-sonnet-4-6';
    let params = buildClaudeParams({ model, maxTokens, system, messages });

    let response;
    try {
      response = await client.messages.create(params);
    } catch (primaryError) {
      // On overload/rate-limit, fall back to Haiku
      if ([429, 529].includes(primaryError.status) && model !== FALLBACK_MODEL) {
        console.warn(`Primary model ${model} unavailable (${primaryError.status}), falling back to ${FALLBACK_MODEL}`);
        params = buildClaudeParams({ model: FALLBACK_MODEL, maxTokens, system, messages });
        response = await client.messages.create(params);
      } else {
        throw primaryError;
      }
    }

    // Cache observability headers — visible in DevTools Network tab without
    // pulling logs. Permanent (no revert step) per deepen-plan finding #6.
    // cache_read_input_tokens > 0 on consecutive requests proves the static
    // prefix is hitting Anthropic's prompt cache. If this is consistently 0
    // the static block is either below the model's cache floor or being
    // invalidated by a silent upstream change.
    res.setHeader('x-cache-read', response.usage?.cache_read_input_tokens ?? 0);
    res.setHeader('x-cache-create', response.usage?.cache_creation_input_tokens ?? 0);
    res.setHeader('x-input-tokens', response.usage?.input_tokens ?? 0);
    logApiUsage({ uid: decodedToken?.uid, provider: 'anthropic', model: params.model, feature, endpoint: '/api/claude', usage: response.usage });
    return res.status(200).json({ content: response.content, stop_reason: response.stop_reason, usage: response.usage });
  } catch (error) {
    console.error('Claude API error:', error);
    const status = error.status || 500;
    const detail = error.error?.error?.message || error.message || 'Unknown error';
    return res.status(status).json({ error: detail });
  }
}, { feature: 'tasteTests', freeLimit: 1, rateLimit: RATE_LIMIT });
