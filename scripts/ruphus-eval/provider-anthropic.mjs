import { immutableSnapshot } from './contracts.mjs';
import { normalizeUsage } from '../../api/_lib/modelPricing.js';

export const ANTHROPIC_PROVIDER = 'anthropic';
export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

function exactObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function assertTools(tools = []) {
  if (!Array.isArray(tools)) throw new Error('Anthropic tools must be an array');
  if (tools.some((tool) => !exactObject(tool) || tool.type && tool.type !== 'function' || typeof tool.name !== 'string' || !tool.name)) throw new Error('Anthropic evaluation only permits named custom function tools');
  if (tools.some((tool) => tool.strict != null && tool.strict !== true)) throw new Error('Anthropic evaluation tools must be strict');
  if (tools.some((tool) => { const schema = tool.input_schema || tool.parameters || tool.inputSchema; return schema && (schema.type !== 'object' || !exactObject(schema.properties) || schema.additionalProperties !== false); })) throw new Error('Anthropic evaluation tools require strict object schemas');
}

export function buildAnthropicRequest({ model, system, messages = [], tools = [], maxOutputTokens = 1800, thinking = 'disabled', effort, signal } = {}) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('Anthropic model is required');
  if (!Array.isArray(messages)) throw new Error('Anthropic messages must be an array');
  if (typeof maxOutputTokens !== 'number' || !Number.isFinite(maxOutputTokens) || maxOutputTokens <= 0) throw new Error('Anthropic output ceiling must be positive');
  assertTools(tools);
  const request = {
    model,
    max_tokens: maxOutputTokens,
    messages: messages.map((message) => immutableSnapshot(message)),
    tools: tools.map((tool) => immutableSnapshot({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.input_schema || tool.parameters || tool.inputSchema || { type: 'object', properties: {}, additionalProperties: false },
      strict: tool.strict !== false,
    })),
    stream: true,
  };
  if (system != null) request.system = system;
  if (thinking !== 'disabled') {
    request.thinking = { type: thinking === 'adaptive' ? 'adaptive' : 'enabled' };
    if (effort != null) request.effort = effort;
  }
  if (signal) request.signal = signal;
  return immutableSnapshot(request);
}

function mergeUsage(current, next) {
  if (!next || typeof next !== 'object') return current;
  return { ...(current || {}), ...next };
}

function absorbEvent(state, event) {
  if (!event || typeof event !== 'object') return;
  if (event.message && typeof event.message === 'object') {
    state.message = event.message;
    if (Array.isArray(event.message.content)) state.content = event.message.content.slice();
    if (event.message.usage) state.usage = mergeUsage(state.usage, event.message.usage);
    state.requestId ||= event.message.id || null;
    state.model ||= event.message.model || null;
    state.stopReason ||= event.message.stop_reason || null;
  }
  if (event.usage) state.usage = mergeUsage(state.usage, event.usage);
  if (event.type === 'content_block_start' && event.content_block) state.content.push(event.content_block);
  if (event.type === 'content_block_delta' && event.delta) {
    const block = state.content.at(-1);
    if (event.delta.type === 'text_delta' && typeof event.delta.text === 'string') state.text += event.delta.text;
    if (block && event.delta.type === 'input_json_delta') state.content[state.content.length - 1] = { ...block, input: `${typeof block.input === 'string' ? block.input : ''}${event.delta.partial_json || ''}` };
  }
  if (event.type === 'message_delta') {
    state.stopReason = event.delta?.stop_reason || state.stopReason;
    if (event.usage) state.usage = mergeUsage(state.usage, event.usage);
  }
  if (event.type === 'message_start') {
    state.requestId ||= event.message?.id || null;
    state.model ||= event.message?.model || null;
    if (event.message?.usage) state.usage = mergeUsage(state.usage, event.message.usage);
  }
  if (event.type === 'message_stop') state.stopReason ||= 'end_turn';
}

async function collectResponse(response) {
  const state = { message: null, content: [], text: '', usage: null, requestId: null, model: null, stopReason: null };
  if (response && typeof response[Symbol.asyncIterator] === 'function') {
    for await (const event of response) absorbEvent(state, event);
    state.requestId ||= response._request_id || response.request_id || null;
  } else absorbEvent(state, response);
  const final = state.message || (response && typeof response === 'object' ? response : null) || {};
  if (Array.isArray(final.content) && state.content.length === 0) state.content = final.content.slice();
  if (final.usage) state.usage = mergeUsage(state.usage, final.usage);
  state.requestId ||= final.id || final._request_id || final.request_id || null;
  state.model ||= final.model || null;
  state.stopReason ||= final.stop_reason || null;
  return state;
}

function toolCalls(content) {
  return content.filter((block) => block?.type === 'tool_use').map((block) => {
    let args = block.input ?? null;
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = null; } }
    return immutableSnapshot({ type: 'tool_use', callId: block.id || null, name: block.name || null, args });
  });
}

export function normalizeAnthropicResponse(state, requestedModel) {
  const content = Array.isArray(state?.content) ? state.content : [];
  const rawUsage = state?.usage || null;
  return immutableSnapshot({
    provider: ANTHROPIC_PROVIDER,
    model: state?.model || requestedModel || null,
    requestId: state?.requestId || null,
    content,
    text: state?.text || content.filter((block) => block?.type === 'text').map((block) => block.text || '').join(''),
    toolCalls: toolCalls(content),
    thinkingBlocks: content.filter((block) => block?.type === 'thinking' || block?.type === 'redacted_thinking'),
    stopReason: state?.stopReason || null,
    rawUsage,
    usage: normalizeUsage(ANTHROPIC_PROVIDER, rawUsage),
    streaming: true,
  });
}

export async function runAnthropicTurn({ client, ...options } = {}) {
  if (!client?.messages || typeof client.messages.create !== 'function') throw new Error('Anthropic Messages client is required');
  const request = buildAnthropicRequest(options);
  const { signal, ...providerRequest } = request;
  const response = await client.messages.create(providerRequest, signal ? { signal } : undefined);
  const state = await collectResponse(response);
  return normalizeAnthropicResponse(state, options.model);
}

export function createAnthropicAdapter({ client } = {}) {
  return Object.freeze({ provider: ANTHROPIC_PROVIDER, endpoint: ANTHROPIC_ENDPOINT, runTurn: (options) => runAnthropicTurn({ client, ...options }) });
}

export const createAnthropicProvider = createAnthropicAdapter;
