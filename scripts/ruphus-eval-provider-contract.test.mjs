import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenAIAdapter, buildOpenAIRequest, normalizeOpenAIResponse } from './ruphus-eval/provider-openai.mjs';
import { createAnthropicAdapter, buildAnthropicRequest } from './ruphus-eval/provider-anthropic.mjs';
import { MODEL_ARMS } from './ruphus-eval/models.mjs';
import { createEvaluationRequest } from './ruphus-eval/tournament.mjs';

const usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 5 } };

test('OpenAI Responses adapter is stateless, strict, and preserves streamed function items', async () => {
  const calls = [];
  const client = { responses: { create: async (request) => { calls.push(request); const stream = (async function* () {
    yield { type: 'response.output_item.done', item: { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'readCoffee', arguments: '{}' } };
    yield { type: 'response.output_text.delta', delta: 'done' };
    yield { type: 'response.completed', response: { id: 'resp-1', model: 'gpt-5.6-luna', status: 'completed', output: [{ type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'readCoffee', arguments: '{}' }], usage } };
  })(); stream._request_id = 'sdk-openai-1'; return stream; } } };
  const adapter = createOpenAIAdapter({ client });
  const result = await adapter.runTurn({ model: 'gpt-5.6-luna', instructions: 'coffee', input: [{ role: 'user', content: 'read' }], previousOutputItems: [{ type: 'reasoning', encrypted_content: 'opaque' }], tools: [{ type: 'function', name: 'readCoffee', parameters: { type: 'object', properties: {}, additionalProperties: false } }], effort: 'medium' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].stream, true);
  assert.equal(calls[0].previous_response_id, undefined);
  assert.deepEqual(calls[0].input[0], { type: 'reasoning', encrypted_content: 'opaque' });
  assert.equal(calls[0].tools[0].strict, true);
  assert.equal(result.requestId, 'sdk-openai-1');
  assert.equal(result.responseId, 'resp-1');
  assert.equal(result.model, 'gpt-5.6-luna');
  assert.equal(result.toolCalls[0].callId, 'call-1');
  assert.equal(result.toolCalls[0].name, 'readCoffee');
  assert.equal(result.usage.inputTokens, 100);
  assert.equal(result.usage.cacheReadTokens, 10);
  assert.equal(result.usage.cacheWriteTokens, 5);
});

test('OpenAI request rejects hosted tools and accepts only stateless replay', () => {
  assert.throws(() => buildOpenAIRequest({ model: 'gpt-5.6-luna', tools: [{ type: 'web_search' }] }), /custom function/);
  assert.throws(() => buildOpenAIRequest({ model: 'gpt-5.6-luna', tools: [{ name: 'readCoffee', strict: false }] }), /must be strict/);
  const request = buildOpenAIRequest({ model: 'gpt-5.6-luna', input: 'next', previousOutputItems: [{ type: 'reasoning', encrypted_content: 'x' }] });
  assert.deepEqual(request.input, [{ type: 'reasoning', encrypted_content: 'x' }, 'next']);
  assert.equal(request.store, false);
});

test('Anthropic Messages adapter preserves thinking/tool blocks and usage', async () => {
  const calls = [];
  const client = { messages: { create: async (request) => { calls.push(request); const stream = (async function* () {
    yield { type: 'message_start', message: { id: 'msg-1', model: 'claude-sonnet-5', usage: { input_tokens: 100, cache_read_input_tokens: 10 } } };
    yield { type: 'content_block_start', content_block: { type: 'thinking' } };
    yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'opa' } };
    yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'que' } };
    yield { type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'sig-1' } };
    yield { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool-1', name: 'readCoffee', input: {} } };
    yield { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } };
    yield { type: 'message_stop' };
  })(); stream._request_id = 'sdk-anthropic-1'; return stream; } } };
  const adapter = createAnthropicAdapter({ client });
  const result = await adapter.runTurn({ model: 'claude-sonnet-5', system: 'coffee', messages: [{ role: 'user', content: 'read' }], tools: [{ name: 'readCoffee', description: 'Read Coffee', input_schema: { type: 'object', properties: {}, additionalProperties: false } }], thinking: 'adaptive', effort: 'high' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stream, true);
  assert.deepEqual(calls[0].thinking, { type: 'adaptive' });
  assert.deepEqual(calls[0].output_config, { effort: 'high' });
  assert.equal(calls[0].effort, undefined);
  assert.equal(calls[0].tools[0].strict, true);
  assert.equal(result.requestId, 'sdk-anthropic-1');
  assert.equal(result.responseId, 'msg-1');
  assert.equal(result.toolCalls[0].callId, 'tool-1');
  assert.equal(result.thinkingBlocks.length, 1);
  assert.equal(result.thinkingBlocks[0].thinking, 'opaque');
  assert.equal(result.thinkingBlocks[0].signature, 'sig-1');
  assert.equal(result.usage.inputTokens, 100);
  assert.equal(result.usage.outputTokens, 20);
});

test('Anthropic request rejects non-function tool types', () => {
  assert.throws(() => buildAnthropicRequest({ model: 'claude-sonnet-5', tools: [{ type: 'computer' }] }), /custom function/);
  assert.throws(() => buildAnthropicRequest({ model: 'claude-sonnet-5', tools: [{ name: 'readCoffee', strict: false }] }), /must be strict/);
});

test('provider-neutral scored requests preserve instructions and evidence across adapters', () => {
  const common = createEvaluationRequest({ caseDefinition: { id: 'dec-parity', userPrompt: 'Diagnose this coffee result.', fixture: { phase: 'decision', evidence: { method: 'v60', condition: 'canonical' } }, expected: { terminal: 'read-only', provenance: {}, ledger: { mutation: false } }, grader: { name: 'recall', deterministic: true, assertions: ['no-mutation'], criticalFailures: ['fabricated-canonical-data'] } } });
  const openai = buildOpenAIRequest({ model: MODEL_ARMS[0].model, instructions: common.instructions, input: common.input, maxOutputTokens: common.maxOutputTokens });
  const anthropic = buildAnthropicRequest({ model: MODEL_ARMS[4].model, instructions: common.instructions, input: common.input, maxOutputTokens: common.maxOutputTokens });
  assert.equal(openai.instructions, anthropic.system);
  assert.deepEqual(openai.input, anthropic.messages);
  assert.deepEqual(openai.input, common.input);
  const transmitted = JSON.parse(openai.input[1].content);
  assert.ok(transmitted.evidenceContract.r.includes('terminal'));
  assert.equal(Object.hasOwn(transmitted, 'expected'), false);
  assert.equal(Object.hasOwn(transmitted.evidenceContract, 'expected'), false);
  assert.deepEqual(JSON.parse(anthropic.messages[1].content).evidenceContract, transmitted.evidenceContract);
  assert.deepEqual(transmitted.evidenceContract, common.evidenceContractWire);
});

test('probe uses the provider minimum and never substitutes a response id for request id', async () => {
  let openAIRequest;
  const openAI = createOpenAIAdapter({ client: { responses: { create: async (request) => { openAIRequest = request; const stream = (async function* () { yield { type: 'response.completed', response: { id: 'response-only', model: request.model, status: 'completed', usage } }; })(); return stream; } } } });
  const probe = await openAI.probe(MODEL_ARMS[0]);
  assert.equal(probe.completeUsage, true);
  assert.equal(openAIRequest.max_output_tokens, 16);
  assert.equal(probe.requestId, null);
  assert.equal(normalizeOpenAIResponse({ model: 'gpt-5.6-luna', responseId: 'response-only', usage }, 'gpt-5.6-luna').requestId, null);
});

test('Anthropic streaming withResponse preserves SDK request id and adaptive effort shape', async () => {
  let requestSeen;
  const client = { messages: { stream: (request) => {
    requestSeen = request;
    const stream = (async function* () {
      yield { type: 'message_start', message: { id: 'message-only', model: 'claude-sonnet-5', usage: { input_tokens: 1 } } };
      yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } };
      yield { type: 'message_stop' };
    })();
    stream.withResponse = async () => ({ response: { _request_id: 'sdk-header-request' } });
    return stream;
  } } };
  const result = await createAnthropicAdapter({ client }).runTurn({ model: 'claude-sonnet-5', thinking: 'adaptive', effort: 'high', messages: [{ role: 'user', content: 'probe' }] });
  assert.deepEqual(requestSeen.output_config, { effort: 'high' });
  assert.equal(requestSeen.effort, undefined);
  assert.equal(result.requestId, 'sdk-header-request');
  assert.equal(result.responseId, 'message-only');
});
