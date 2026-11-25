// OpenAI API helpers -- all calls go through /api/openai serverless proxy
// No OpenAI SDK in the browser. No API key in client code.
import { ruphusApiUrl } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';

const PROXY_URL = ruphusApiUrl('/api/openai');

export async function callOpenAI({ model, messages, maxTokens = 1000, responseFormat, reasoningEffort, webSearch = false, metered = false, retries = 2, feature }) {
  const body = { model, messages, maxTokens };
  if (responseFormat) body.responseFormat = responseFormat;
  if (reasoningEffort) body.reasoningEffort = reasoningEffort;
  if (webSearch) body.webSearch = true;
  if (metered) body.metered = true;
  if (feature) body.feature = feature;
  return fetchWithRetry({ url: PROXY_URL, body, retries, serviceName: 'OpenAI' });
}
