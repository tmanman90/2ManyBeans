import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenAIRequest, createOpenAIProvider, outputParts, RUPHUS_OPENAI_MODEL } from '../api/_lib/ruphusProviders/openai.js';

test('OpenAI adapter is pinned, stateless, and provider-neutral', () => {
  const request = buildOpenAIRequest({ instructions: 'coach', input: [{ role: 'user', content: 'coffee' }], tools: [], maxOutputTokens: 1 });
  assert.equal(request.model, RUPHUS_OPENAI_MODEL); assert.equal(request.store, false); assert.equal(request.tools.length, 0);
  assert.equal(request.reasoning.effort, 'medium');
  assert.throws(() => buildOpenAIRequest({ instructions: '', input: [], tools: [], model: 'gpt-4o' }), /unsupported/);
});
test('provider output rejects malformed tool arguments and preserves attribution', () => {
  assert.deepEqual(outputParts({ id: 'resp-1', model: RUPHUS_OPENAI_MODEL, output_text: 'hi', output: [] }), { text: 'hi', toolCalls: [], outputItems: [], requestId: 'resp-1', usage: null, model: RUPHUS_OPENAI_MODEL });
  assert.throws(() => outputParts({ output: [{ type: 'function_call', name: 'read_coffee', arguments: '{' }] }), /malformed/);
});

test('OpenAI continuation replays prior response items alongside every tool result', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async (request) => { requests.push(request); return { id: 'r-2', model: RUPHUS_OPENAI_MODEL, output_text: '', output: [] }; } } } });
  await provider.runTurn({ context: {}, userText: 'coffee', tools: [], previous: { outputItems: [{ type: 'reasoning', id: 'reasoning-1' }] }, toolResult: { results: [{ callId: 'call-1', result: { ok: true } }, { callId: 'call-2', result: { ok: true } }] } });
  assert.deepEqual(requests[0].input, [{ type: 'reasoning', id: 'reasoning-1' }, { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true}' }, { type: 'function_call_output', call_id: 'call-2', output: '{"ok":true}' }]);
});
