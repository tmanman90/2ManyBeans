// Vercel serverless proxy for OpenAI API
// Keeps OPENAI_API_KEY server-side only
import OpenAI from 'openai';
import { withCorsAuthPro } from './_lib/cors-auth.js';

const FALLBACK_MODEL = 'gpt-5.4-mini';
const ALLOWED_MODELS = ['gpt-5.4', 'gpt-5.4-mini'];
const MAX_TOKENS_CAP = 4000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

// Recipes, stories, tasting score extraction. Pro or Ultra required.
export default withCorsAuthPro(async (req, res) => {
  try {
    const {
      model: requestedModel = 'gpt-5.4',
      messages,
      maxTokens = 1000,
      responseFormat,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'gpt-5.4';
    const safeMaxTokens = Math.min(maxTokens || 1000, MAX_TOKENS_CAP);

    const params = {
      model,
      messages,
      max_completion_tokens: safeMaxTokens,
    };

    // Only allow json_object response format (used by Aiden recipe generation)
    if (responseFormat?.type === 'json_object') {
      params.response_format = { type: 'json_object' };
    }

    let response;
    try {
      response = await client.chat.completions.create(params);
    } catch (primaryError) {
      if ([429, 529].includes(primaryError.status) && model !== FALLBACK_MODEL) {
        console.warn(`Primary model ${model} unavailable (${primaryError.status}), falling back to ${FALLBACK_MODEL}`);
        params.model = FALLBACK_MODEL;
        response = await client.chat.completions.create(params);
      } else {
        throw primaryError;
      }
    }

    const text = response.choices?.[0]?.message?.content || '';
    const usage = response.usage || {};

    return res.status(200).json({ text, usage });
  } catch (error) {
    console.error('OpenAI API error:', error);
    const status = error.status || 500;
    const detail = error.error?.message || error.message || 'Unknown OpenAI error';
    return res.status(status).json({ error: detail });
  }
});
