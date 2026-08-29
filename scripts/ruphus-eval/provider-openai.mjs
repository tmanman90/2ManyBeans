import { immutableSnapshot } from './contracts.mjs';
import { normalizeUsage } from '../../api/_lib/modelPricing.js';

export const OPENAI_PROVIDER = 'openai';
export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';
export const OPENAI_PROBE_MIN_OUTPUT_TOKENS = 16;

function exactObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function assertNoHostedFeatures(tools = []) {
  if (!Array.isArray(tools)) throw new Error('OpenAI tools must be an array');
  if (tools.some((tool) => !exactObject(tool) || tool.type && tool.type !== 'function' || typeof tool.name !== 'string' || !tool.name)) throw new Error('OpenAI evaluation only permits named custom function tools');
  if (tools.some((tool) => tool.strict != null && tool.strict !== true)) throw new Error('OpenAI evaluation tools must be strict');
  if (tools.some((tool) => { const schema = tool.parameters || tool.input_schema || tool.inputSchema; return schema && (schema.type !== 'object' || !exactObject(schema.properties) || schema.additionalProperties !== false); })) throw new Error('OpenAI evaluation tools require strict object schemas');
}

function normalizeTool(tool) {
  const parameters = tool.parameters || tool.input_schema || tool.inputSchema || { type: 'object', properties: {}, additionalProperties: false };
  return { type: 'function', name: tool.name, description: tool.description || '', parameters, strict: tool.strict !== false };
}

export function buildOpenAIRequest({ model, instructions, input, previousOutputItems = [], tools = [], toolChoice = null, maxOutputTokens = 1800, effort, signal } = {}) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('OpenAI model is required');
  if (typeof maxOutputTokens !== 'number' || !Number.isFinite(maxOutputTokens) || maxOutputTokens <= 0) throw new Error('OpenAI output ceiling must be positive');
  assertNoHostedFeatures(tools);
  const replay = Array.isArray(previousOutputItems) ? previousOutputItems.map((item) => immutableSnapshot(item)) : [];
  const currentInput = Array.isArray(input) ? input : input == null ? [] : [input];
  const request = {
    model,
    input: [...replay, ...currentInput],
    tools: tools.map((tool) => immutableSnapshot(normalizeTool(tool))),
    max_output_tokens: maxOutputTokens,
    store: false,
    stream: true,
  };
  if (instructions != null) request.instructions = instructions;
  if (toolChoice != null) {
    if (!exactObject(toolChoice) || typeof toolChoice.name !== 'string' || toolChoice.name !== 'submit_result') throw new Error('OpenAI evaluation only permits the frozen submit_result tool choice');
    request.tool_choice = { type: 'function', name: toolChoice.name };
  }
  if (effort != null) request.reasoning = { effort };
  if (Object.hasOwn(request, 'previous_response_id')) throw new Error('OpenAI evaluation forbids provider-stored continuation state');
  if (signal) request.signal = signal;
  return immutableSnapshot(request);
}

function mergeUsage(current, next) {
  if (!next || typeof next !== 'object') return current;
  return { ...(current || {}), ...next };
}

function absorbEvent(state, event) {
  if (!event || typeof event !== 'object') return;
  const response = event.response || event.message;
  if (response && typeof response === 'object') {
    state.response = response;
    if (response.usage) state.usage = mergeUsage(state.usage, response.usage);
    if (Array.isArray(response.output)) state.outputItems = response.output.slice();
    if (typeof response.output_text === 'string') state.text = response.output_text;
    if (typeof response.model === 'string') state.model = response.model;
    if (typeof response.id === 'string') state.responseId = response.id;
    if (response.status) state.stopReason = response.status;
  }
  if (event.usage) state.usage = mergeUsage(state.usage, event.usage);
  if (event.type === 'response.output_item.done' && event.item) state.outputItems.push(event.item);
  if ((event.type === 'response.output_text.delta' || event.type === 'response.text.delta') && typeof event.delta === 'string') state.text += event.delta;
  if (event.type === 'response.completed') {
    state.stopReason = event.response?.status || state.stopReason || 'completed';
    if (event.response?.usage) state.usage = mergeUsage(state.usage, event.response.usage);
  }
  if (event._request_id) state.requestId = event._request_id;
}

async function collectResponse(response) {
  const state = { response: null, outputItems: [], text: '', usage: null, requestId: null, responseId: null, model: null, stopReason: null };
  if (response && typeof response[Symbol.asyncIterator] === 'function') {
    for await (const event of response) absorbEvent(state, event);
    state.requestId ||= response._request_id || response.request_id || null;
  } else absorbEvent(state, response);
  const final = state.response || (response && typeof response === 'object' ? response : null) || {};
  if (Array.isArray(final.output) && state.outputItems.length === 0) state.outputItems = final.output.slice();
  if (typeof final.output_text === 'string' && !state.text) state.text = final.output_text;
  if (final.usage) state.usage = mergeUsage(state.usage, final.usage);
  state.requestId ||= final._request_id || final.request_id || null;
  state.responseId ||= final.id || null;
  state.model ||= final.model || null;
  state.stopReason ||= final.status || null;
  return state;
}

function toolCalls(outputItems) {
  return outputItems.filter((item) => item?.type === 'function_call').map((item) => {
    const argumentsText = typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {});
    let args = null;
    try { args = JSON.parse(argumentsText); } catch { /* malformed tool JSON is a semantic candidate failure */ }
    return immutableSnapshot({ type: 'function_call', callId: item.call_id || item.id || null, name: item.name || null, argumentsText, args });
  });
}

export function normalizeOpenAIResponse(state, requestedModel) {
  const outputItems = Array.isArray(state?.outputItems) ? state.outputItems : [];
  const rawUsage = state?.usage || null;
  return immutableSnapshot({
    provider: OPENAI_PROVIDER,
    model: state?.model || requestedModel || null,
    // A response id identifies the response, not the billable provider
    // request. Keep the two fields distinct and fail closed when the SDK did
    // not expose its request id.
    requestId: state?.requestId || null,
    responseId: state?.responseId || null,
    outputItems,
    text: state?.text || '',
    toolCalls: toolCalls(outputItems),
    stopReason: state?.stopReason || null,
    rawUsage,
    usage: normalizeUsage(OPENAI_PROVIDER, rawUsage),
    streaming: true,
    store: false,
  });
}

async function probeOpenAI({ client, arm } = {}) {
  if (!arm || arm.provider !== OPENAI_PROVIDER || typeof arm.model !== 'string' || !arm.model) throw new Error('OpenAI probe requires a canonical OpenAI arm');
  try {
    const result = await runOpenAITurn({
      client, model: arm.model, effort: arm.effort,
      instructions: 'Return a minimal probe acknowledgement.',
      input: [{ role: 'user', content: 'probe' }], maxOutputTokens: OPENAI_PROBE_MIN_OUTPUT_TOKENS, tools: [],
    });
    const completeUsage = Boolean(result.rawUsage && result.usage && Number.isFinite(result.usage.inputTokens) && Number.isFinite(result.usage.outputTokens));
    return immutableSnapshot({
      returnedModel: result.model, providerHost: OPENAI_ENDPOINT,
      modelAccess: result.model === arm.model, streaming: result.streaming === true,
      completeUsage, requestId: typeof result.requestId === 'string' && result.requestId ? result.requestId : null,
    });
  } catch (error) {
    return immutableSnapshot({ returnedModel: null, providerHost: OPENAI_ENDPOINT, modelAccess: false, streaming: false, completeUsage: false, requestId: null, errorCode: typeof error?.code === 'string' ? error.code : 'PROBE_FAILED' });
  }
}

export async function runOpenAITurn({ client, ...options } = {}) {
  if (!client?.responses || typeof client.responses.create !== 'function') throw new Error('OpenAI Responses client is required');
  const request = buildOpenAIRequest(options);
  const { signal, ...providerRequest } = request;
  const response = await client.responses.create(providerRequest, signal ? { signal } : undefined);
  const state = await collectResponse(response);
  return normalizeOpenAIResponse(state, options.model);
}

export function createOpenAIAdapter({ client } = {}) {
  return Object.freeze({ provider: OPENAI_PROVIDER, endpoint: OPENAI_ENDPOINT, runTurn: (options) => runOpenAITurn({ client, ...options }), probe: (arm) => probeOpenAI({ client, arm }) });
}

export const createOpenAIProvider = createOpenAIAdapter;
