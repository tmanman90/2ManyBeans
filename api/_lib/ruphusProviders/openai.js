import OpenAI from 'openai';
import { buildDynamicEvidenceBlock } from '../ruphusPrompt.js';

export const RUPHUS_OPENAI_MODEL = 'gpt-5.6-luna';
export const RUPHUS_REASONING_EFFORT = 'medium';

function outputParts(response) {
  const text = typeof response?.output_text === 'string' ? response.output_text : '';
  const toolCalls = [];
  for (const item of response?.output || []) {
    if (item.type === 'function_call') {
      let args = {};
      try { args = JSON.parse(item.arguments || '{}'); } catch { throw Object.assign(new Error('provider returned malformed tool arguments'), { code: 'provider_schema' }); }
      toolCalls.push({ callId: item.call_id, name: item.name, args });
    }
  }
  return { text, toolCalls, outputItems: response?.output || [], requestId: response?.id || null, usage: response?.usage || null, retryCount: 0, model: response?.model || RUPHUS_OPENAI_MODEL };
}

export function buildOpenAIRequest({ instructions, input, tools, model = RUPHUS_OPENAI_MODEL, maxOutputTokens }) {
  if (model !== RUPHUS_OPENAI_MODEL) throw Object.assign(new Error('unsupported Ruphus model'), { code: 'provider_model' });
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) throw Object.assign(new Error('provider output cap must be configured'), { code: 'provider_config' });
  return { model, instructions, input, tools, store: false, reasoning: { effort: RUPHUS_REASONING_EFFORT }, max_output_tokens: maxOutputTokens };
}

export function createOpenAIProvider({ client, instructions = '', maxOutputTokens } = {}) {
  // Retries must be visible to the orchestrator. The default adapter makes
  // one provider request per turn; stream retry policy remains a separate
  // client transport concern.
  const sdk = client || new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const inputSequences = new Map();
  return Object.freeze({
    async runTurn({ turnId = 'default', context, userText, conversation = [], tools, previous, toolResult, correctiveInstruction, regeneration = false }) {
      const results = (toolResult?.results || (toolResult ? [toolResult] : [])).map((item) => ({ type: 'function_call_output', call_id: item.callId || item.name, output: JSON.stringify(item.result) }));
      const launchContext = context?.launchContext || context?.context || {};
      const evidenceBlock = buildDynamicEvidenceBlock(context || {});
      const recentConversation = (Array.isArray(conversation) ? conversation : [])
        .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string');
      const correction = correctiveInstruction ? [{ role: 'developer', content: correctiveInstruction }] : [];
      const priorInput = inputSequences.get(turnId) || [];
      const knownToolCalls = new Set(priorInput.filter((item) => item?.type === 'function_call_output').map((item) => item.call_id));
      const missingEvidence = results.filter((item) => !knownToolCalls.has(item.call_id));
      const input = (regeneration || correctiveInstruction)
        ? [...priorInput, ...(previous?.outputItems || []), ...missingEvidence, ...correction]
        : previous && toolResult
        ? [...(inputSequences.get(turnId) || []), ...(previous.outputItems || []), ...results]
        : [
            { role: 'developer', content: `Starting Coffee context (live tool results and the user's latest corrections supersede this):\n${JSON.stringify(launchContext)}${evidenceBlock}` },
            ...(recentConversation.length ? recentConversation : [{ role: 'user', content: userText }]),
          ];
      inputSequences.set(turnId, input);
      const response = await sdk.responses.create(buildOpenAIRequest({ instructions, input, tools, maxOutputTokens }));
      return outputParts(response);
    },
  });
}

export { outputParts };
