// OpenAI API helpers — all calls go through /api/openai serverless proxy
// No OpenAI SDK in the browser. No API key in client code.
import { API_BASE } from './apiBase';

const PROXY_URL = `${API_BASE}/api/openai`;

const FRIENDLY_ERRORS = {
  429: 'AI is rate-limited — please wait a moment and try again',
  529: 'AI service is temporarily busy — please try again in a moment',
  503: 'AI service is temporarily unavailable — please try again shortly',
};

export async function callOpenAI({ model = 'gpt-5.4', messages, maxTokens = 1000, responseFormat, retries = 2 }) {
  const body = { model, messages, maxTokens };
  if (responseFormat) body.responseFormat = responseFormat;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return response.json();
    }

    if ([429, 529, 503].includes(response.status) && attempt < retries) {
      lastError = response.status;
      continue;
    }

    const friendly = FRIENDLY_ERRORS[response.status];
    if (friendly) throw new Error(friendly);

    try {
      const data = await response.json();
      throw new Error(data.error || `OpenAI API error: ${response.status}`);
    } catch (e) {
      if (e.message && e.message !== 'Unexpected token') throw e;
      throw new Error(`OpenAI API error: ${response.status}`);
    }
  }

  const friendly = FRIENDLY_ERRORS[lastError];
  throw new Error(friendly || `OpenAI API error: ${lastError}`);
}
