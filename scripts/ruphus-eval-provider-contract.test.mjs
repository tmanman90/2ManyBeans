import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenAIAdapter, buildOpenAIRequest } from './ruphus-eval/provider-openai.mjs';
import { createAnthropicAdapter, buildAnthropicRequest } from './ruphus-eval/provider-anthropic.mjs';

const usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 5 } };

test('OpenAI Responses adapter is stateless, strict, and preserves streamed function items', async () => {
  const calls = [];
  const client = { responses: { create: async (request) => { calls.push(request); return (async function* () {
    yield { type: 'response.output_item.done', item: { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'readCoffee', arguments: '{}' } };
    yield { type: 'response.output_text.delta', delta: 'done' };
    yield { type: 'response.completed', response: { id: 'resp-1', model: 'gpt-5.6-luna', status: 'completed', output: [{ type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'readCoffee', arguments: '{}' }], usage } };
  })(); } } };
  const adapter = createOpenAIAdapter({ client });
  const result = await adapter.runTurn({ model: 'gpt-5.6-luna', instructions: 'coffee', input: [{ role: 'user', content: 'read' }], previousOutputItems: [{ type: 'reasoning', encrypted_content: 'opaque' }], tools: [{ type: 'function', name: 'readCoffee', parameters: { type: 'object', properties: {}, additionalProperties: false } }], effort: 'medium' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].stream, true);
  assert.equal(calls[0].previous_response_id, undefined);
  assert.deepEqual(calls[0].input[0], { type: 'reasoning', encrypted_content: 'opaque' });
  assert.equal(calls[0].tools[0].strict, true);
  assert.equal(result.requestId, 'resp-1');
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
  const client = { messages: { create: async (request) => { calls.push(request); return (async function* () {
    yield { type: 'message_start', message: { id: 'msg-1', model: 'claude-sonnet-5', usage: { input_tokens: 100, cache_read_input_tokens: 10 } } };
    yield { type: 'content_block_start', content_block: { type: 'thinking', thinking: 'opaque' } };
    yield { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool-1', name: 'readCoffee', input: {} } };
    yield { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } };
    yield { type: 'message_stop' };
  })(); } } };
  const adapter = createAnthropicAdapter({ client });
  const result = await adapter.runTurn({ model: 'claude-sonnet-5', system: 'coffee', messages: [{ role: 'user', content: 'read' }], tools: [{ name: 'readCoffee', description: 'Read Coffee', input_schema: { type: 'object', properties: {}, additionalProperties: false } }], thinking: 'adaptive', effort: 'high' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stream, true);
  assert.deepEqual(calls[0].thinking, { type: 'adaptive' });
  assert.equal(calls[0].tools[0].strict, true);
  assert.equal(result.requestId, 'msg-1');
  assert.equal(result.toolCalls[0].callId, 'tool-1');
  assert.equal(result.thinkingBlocks.length, 1);
  assert.equal(result.usage.inputTokens, 100);
  assert.equal(result.usage.outputTokens, 20);
});

test('Anthropic request rejects non-function tool types', () => {
  assert.throws(() => buildAnthropicRequest({ model: 'claude-sonnet-5', tools: [{ type: 'computer' }] }), /custom function/);
  assert.throws(() => buildAnthropicRequest({ model: 'claude-sonnet-5', tools: [{ name: 'readCoffee', strict: false }] }), /must be strict/);
});
