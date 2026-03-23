// Vercel serverless proxy for OpenAI API
// Keeps OPENAI_API_KEY server-side only
import OpenAI from 'openai';

const FALLBACK_MODEL = 'gpt-5.4-mini';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

const ALLOWED_ORIGINS = [
  'https://2manybeans.vercel.app',
  'capacitor://localhost',
  'http://localhost',
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.some(o => origin?.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      model = 'gpt-5.4',
      messages,
      maxTokens = 1000,
      responseFormat,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const params = {
      model,
      messages,
      max_completion_tokens: maxTokens,
    };

    if (responseFormat) {
      params.response_format = responseFormat;
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
}
