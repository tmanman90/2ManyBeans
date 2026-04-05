// OpenAI API helpers -- all calls go through /api/openai serverless proxy
// No OpenAI SDK in the browser. No API key in client code.
import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';

const PROXY_URL = `${API_BASE}/api/openai`;

export async function callOpenAI({ model = 'gpt-5.4', messages, maxTokens = 1000, responseFormat, retries = 2 }) {
  const body = { model, messages, maxTokens };
  if (responseFormat) body.responseFormat = responseFormat;
  return fetchWithRetry({ url: PROXY_URL, body, retries, serviceName: 'OpenAI' });
}
