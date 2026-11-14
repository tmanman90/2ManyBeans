import OpenAI from 'openai';
import { buildDynamicEvidenceBlock } from '../ruphusPrompt.js';
import { SLOT_KEYS } from '../../../src/lib/ruphus/contracts.js';

export const RUPHUS_OPENAI_MODEL = 'gpt-5.6-luna';
export const RUPHUS_REASONING_EFFORT = 'medium';

export const RUPHUS_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['information', 'recipe_preview'], description: 'Classify the user’s current task in conversation: recipe_preview for a recipe to use or an edit to the active recipe, including dose/equipment follow-ups; information for explanation/comparison alone. A failed recipe request remains recipe_preview with blocked or clarification state, never information just because no card was produced.' },
    state: { type: 'string', enum: ['answered', 'clarification', 'blocked'] },
    text: { type: 'string' },
    coffeeRef: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    slot: { anyOf: [{ type: 'string', enum: SLOT_KEYS }, { type: 'null' }] },
  },
  required: ['intent', 'state', 'text', 'coffeeRef', 'slot'],
});

const RESPONSE_KEYS = new Set(['intent', 'state', 'text', 'coffeeRef', 'slot']);
const providerError = (code, message, response = null) => Object.assign(new Error(message), {
  code,
  ...(response?.usage ? { usage: response.usage } : {}),
  ...(response?.id ? { requestId: response.id } : {}),
  ...(response?.model ? { model: response.model } : {}),
});

function classifyTransportError(error) {
  if (error?.code && String(error.code).startsWith('provider_')) return error;
  const status = Number(error?.status || error?.statusCode || error?.response?.status);
  const timedOut = error?.name === 'AbortError'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNABORTED'
    || /(?:timeout|timed out)/i.test(String(error?.message || ''));
  const classifiedCode = timedOut
    ? 'provider_timeout'
    : status === 429
      ? 'provider_rate_limited'
      : status >= 500
        ? 'provider_unavailable'
        : 'provider_transport';
  const classified = providerError(classifiedCode, timedOut
    ? 'provider request timed out'
    : status === 429
      ? 'provider request was rate limited'
      : status >= 500
        ? 'provider service was unavailable'
        : 'provider request failed');
  if (Number.isFinite(status)) classified.status = status;
  return classified;
}

export function parseResponseEnvelope(value, response = null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw providerError('provider_schema', 'provider returned malformed final response', response); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).some((key) => !RESPONSE_KEYS.has(key))
    || !['information', 'recipe_preview'].includes(parsed.intent)
    || !['answered', 'clarification', 'blocked'].includes(parsed.state)
    || typeof parsed.text !== 'string'
    || !parsed.text.trim()
    || !(parsed.coffeeRef === null || typeof parsed.coffeeRef === 'string')
    || !(parsed.slot === null || SLOT_KEYS.includes(parsed.slot))) {
    throw providerError('provider_schema', 'provider returned an invalid final response', response);
  }
  return parsed;
}

const responseIsIncomplete = (response) => Boolean(response?.status === 'incomplete' || response?.incomplete_details);
const responseHasRefusal = (response) => Boolean(
  Array.isArray(response?.output)
  && response.output.some((item) => item?.type === 'refusal'
    || (item?.type === 'message' && Array.isArray(item.content)
      && item.content.some((part) => part?.type === 'refusal' || part?.refusal))),
);

function outputParts(response) {
  if (responseIsIncomplete(response)) throw providerError('provider_incomplete', 'provider response was incomplete', response);
  if (responseHasRefusal(response)) throw providerError('provider_refusal', 'provider declined to provide a final response', response);
  const rawText = typeof response?.output_text === 'string' ? response.output_text : '';
  const envelope = parseResponseEnvelope(rawText, response);
  const text = envelope?.text || '';
  const toolCalls = [];
  for (const item of response?.output || []) {
    if (item.type === 'function_call') {
      let args = {};
      try { args = JSON.parse(item.arguments || '{}'); } catch { throw providerError('provider_schema', 'provider returned malformed tool arguments', response); }
      toolCalls.push({ callId: item.call_id, name: item.name, args });
    }
  }
  return { text, envelope, toolCalls, outputItems: response?.output || [], requestId: response?.id || null, usage: response?.usage || null, retryCount: 0, model: response?.model || RUPHUS_OPENAI_MODEL };
}

export function buildOpenAIRequest({ instructions, input, tools, model = RUPHUS_OPENAI_MODEL, maxOutputTokens }) {
  if (model !== RUPHUS_OPENAI_MODEL) throw Object.assign(new Error('unsupported Ruphus model'), { code: 'provider_model' });
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) throw Object.assign(new Error('provider output cap must be configured'), { code: 'provider_config' });
  return {
    model,
    instructions,
    input,
    tools,
    store: false,
    reasoning: { effort: RUPHUS_REASONING_EFFORT },
    max_output_tokens: maxOutputTokens,
    text: { format: { type: 'json_schema', name: 'ruphus_turn', strict: true, schema: RUPHUS_RESPONSE_SCHEMA } },
  };
}

export function createOpenAIProvider({ client, instructions = '', maxOutputTokens } = {}) {
  // Retries must be visible to the orchestrator. The default adapter makes
  // one provider request per turn; stream retry policy remains a separate
  // client transport concern.
  const sdk = client || new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const inputSequences = new Map();
  return Object.freeze({
    async runTurn({ turnId = 'default', context, userText, conversation = [], tools, previous, toolResult, correctiveInstruction, regeneration = false }) {
      const evidence = toolResult?.results || (toolResult ? [toolResult] : []);
      const results = evidence.filter(item => item.callId).map((item) => ({ type: 'function_call_output', call_id: item.callId, output: JSON.stringify(item.result) }));
      const appEvidence = evidence.filter(item => !item.callId);
      const launchContext = context?.launchContext || context?.context || {};
      const evidenceBlock = buildDynamicEvidenceBlock(context || {});
      const recentConversation = (Array.isArray(conversation) ? conversation : [])
        .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string');
      const latest = recentConversation.at(-1);
      const currentUserTurn = latest?.role === 'user' && latest.content === userText
        ? []
        : [{ role: 'user', content: userText }];
      const correction = [
        ...(appEvidence.length ? [{ role: 'developer', content: `App-verified evidence (not a provider tool call):\n${JSON.stringify(appEvidence)}` }] : []),
        ...(correctiveInstruction ? [{ role: 'developer', content: correctiveInstruction }] : []),
      ];
      const currentContext = { role: 'developer', content: `Starting Coffee context (live tool results and the user's latest corrections supersede this):\n${JSON.stringify(launchContext)}${evidenceBlock}` };
      const storedInput = inputSequences.get(turnId);
      const priorInput = storedInput ? [currentContext, ...storedInput.slice(1)] : [
        currentContext,
        ...recentConversation,
        ...currentUserTurn,
      ];
      const knownToolCalls = new Set(priorInput.filter((item) => item?.type === 'function_call_output').map((item) => item.call_id));
      const missingEvidence = results.filter((item) => !knownToolCalls.has(item.call_id));
      const input = (regeneration || correctiveInstruction)
        ? [...priorInput, ...(previous?.outputItems || []), ...missingEvidence, ...correction]
        : previous && toolResult
        ? [...priorInput, ...(previous.outputItems || []), ...results, ...correction]
        : [
            currentContext,
            ...recentConversation,
            ...currentUserTurn,
          ];
      inputSequences.set(turnId, input);
      let response;
      try {
        response = await sdk.responses.create(buildOpenAIRequest({ instructions, input, tools, maxOutputTokens }));
      } catch (error) {
        // Keep provider failures typed and secret-free. The orchestrator and
        // client can give truthful recovery guidance without exposing SDK
        // messages, request bodies, or credentials.
        throw classifyTransportError(error);
      }
      return outputParts(response);
    },
  });
}

export { outputParts };
