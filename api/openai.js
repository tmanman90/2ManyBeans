// Vercel serverless proxy for OpenAI API
// Keeps OPENAI_API_KEY server-side only
import OpenAI from 'openai';
import { withCorsAuthMetered } from './_lib/cors-auth.js';
import { logApiUsage } from './_lib/costLogger.js';

const FALLBACK_MODEL = 'gpt-5.4-mini';
const ALLOWED_MODELS = ['gpt-5.4-mini', 'gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol'];
const ALLOWED_EFFORTS = new Set(['none', 'low', 'medium', 'high']);
const MAX_TOKENS_CAP = 4000;
const RATE_LIMIT = { key: 'openai', limit: 120, windowMs: 60 * 60 * 1000 };

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

// Chat Completions for plain calls; the Responses API only when the caller
// asks for web search, because that tool exists only there.
async function complete({ model, messages, maxTokens, reasoningEffort, json, webSearch }) {
  if (webSearch) {
    const r = await client.responses.create({
      model,
      input: messages,
      tools: [{ type: 'web_search' }],
      max_output_tokens: maxTokens,
      ...(reasoningEffort && { reasoning: { effort: reasoningEffort } }),
    });
    const sources = r.output
      .filter(item => item.type === 'message')
      .flatMap(item => item.content || [])
      .flatMap(part => part.annotations || [])
      .filter(a => a.type === 'url_citation' && a.url)
      .map(a => ({ title: a.title || '', url: a.url }));
    return { text: r.output_text || '', usage: r.usage || {}, finishReason: r.incomplete_details?.reason || null, sources };
  }
  const r = await client.chat.completions.create({
    model,
    messages,
    max_completion_tokens: maxTokens,
    ...(reasoningEffort && { reasoning_effort: reasoningEffort }),
    ...(json && { response_format: { type: 'json_object' } }),
  });
  return { text: r.choices?.[0]?.message?.content || '', usage: r.usage || {}, finishReason: r.choices?.[0]?.finish_reason || null };
}

// Recipes, stories, research, tasting coach, recommendations, chat search
// and bag scan. Pro or Ultra required, except a metered bag scan, which
// spends one of the free user's aiScans credits (same counter as the
// Gemini proxy used before).
export default withCorsAuthMetered(async (req, res, decodedToken) => {
  try {
    const {
      model: requestedModel = FALLBACK_MODEL,
      messages,
      maxTokens = 1000,
      responseFormat,
      reasoningEffort,
      webSearch = false,
      feature,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const request = {
      model: ALLOWED_MODELS.includes(requestedModel) ? requestedModel : FALLBACK_MODEL,
      messages,
      maxTokens: Math.min(maxTokens || 1000, MAX_TOKENS_CAP),
      reasoningEffort: ALLOWED_EFFORTS.has(reasoningEffort) ? reasoningEffort : undefined,
      json: responseFormat?.type === 'json_object',
      webSearch: webSearch === true,
    };

    let result;
    try {
      result = await complete(request);
    } catch (primaryError) {
      if ([429, 529].includes(primaryError.status) && request.model !== FALLBACK_MODEL) {
        console.warn(`Primary model ${request.model} unavailable (${primaryError.status}), falling back to ${FALLBACK_MODEL}`);
        request.model = FALLBACK_MODEL;
        request.reasoningEffort = undefined;
        result = await complete(request);
      } else {
        throw primaryError;
      }
    }

    logApiUsage({ uid: decodedToken?.uid, provider: 'openai', model: request.model, feature, endpoint: '/api/openai', usage: result.usage });
    return res.status(200).json(result);
  } catch (error) {
    console.error('OpenAI API error:', error);
    const status = error.status || 500;
    const detail = error.error?.message || error.message || 'Unknown OpenAI error';
    return res.status(status).json({ error: detail });
  }
}, { feature: 'aiScans', freeLimit: 3, rateLimit: RATE_LIMIT });
