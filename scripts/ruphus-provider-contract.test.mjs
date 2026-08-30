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
  assert.deepEqual(outputParts({ id: 'resp-1', model: RUPHUS_OPENAI_MODEL, output_text: 'hi', output: [] }), { text: 'hi', toolCalls: [], outputItems: [], requestId: 'resp-1', usage: null, retryCount: 0, model: RUPHUS_OPENAI_MODEL });
  assert.throws(() => outputParts({ output: [{ type: 'function_call', name: 'read_coffee', arguments: '{' }] }), /malformed/);
});

test('OpenAI continuation replays prior response items alongside every tool result', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async (request) => { requests.push(request); return { id: 'r-2', model: RUPHUS_OPENAI_MODEL, output_text: '', output: [] }; } } } });
  await provider.runTurn({ context: {}, userText: 'coffee', tools: [], previous: { outputItems: [{ type: 'reasoning', id: 'reasoning-1' }] }, toolResult: { results: [{ callId: 'call-1', result: { ok: true } }, { callId: 'call-2', result: { ok: true } }] } });
  assert.deepEqual(requests[0].input, [{ type: 'reasoning', id: 'reasoning-1' }, { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true}' }, { type: 'function_call_output', call_id: 'call-2', output: '{"ok":true}' }]);
});

test('stateless continuation accumulates the complete multi-round input sequence', async () => {
  const requests = [];
  const responses = [
    { id: 'r-1', model: RUPHUS_OPENAI_MODEL, output: [{ type: 'function_call', call_id: 'call-1', name: 'read_coffee', arguments: '{}' }] },
    { id: 'r-2', model: RUPHUS_OPENAI_MODEL, output: [{ type: 'function_call', call_id: 'call-2', name: 'read_recipe', arguments: '{}' }] },
    { id: 'r-3', model: RUPHUS_OPENAI_MODEL, output_text: 'done', output: [] },
  ];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async (request) => { requests.push(request); return responses.shift(); } } } });
  const first = await provider.runTurn({ turnId: 'turn-1', context: { coffeeId: 'bean-1' }, userText: 'diagnose', tools: [] });
  const second = await provider.runTurn({ turnId: 'turn-1', context: { coffeeId: 'bean-1' }, userText: 'diagnose', tools: [], previous: first, toolResult: { results: [{ callId: 'call-1', result: { ok: true, data: 'coffee' } }] } });
  await provider.runTurn({ turnId: 'turn-1', context: { coffeeId: 'bean-1' }, userText: 'diagnose', tools: [], previous: second, toolResult: { results: [{ callId: 'call-2', result: { ok: true, data: 'recipe' } }] } });
  assert.equal(requests[2].input[0].role, 'developer');
  assert.equal(requests[2].input[1].role, 'user');
  assert.equal(requests[2].input.filter((item) => item.type === 'function_call_output').length, 2);
  assert.deepEqual(requests[2].input.slice(-3), [
    { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true,"data":"coffee"}' },
    { type: 'function_call', call_id: 'call-2', name: 'read_recipe', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call-2', output: '{"ok":true,"data":"recipe"}' },
  ]);
});

test('regeneration replays every prior tool result and includes corrective instruction', async () => {
  const requests = [];
  const responses = [
    { id: 'r-1', model: RUPHUS_OPENAI_MODEL, output: [{ type: 'function_call', call_id: 'call-1', name: 'read_coffee', arguments: '{}' }] },
    { id: 'r-2', model: RUPHUS_OPENAI_MODEL, output_text: 'bad {"dose":16}', output: [] },
    { id: 'r-3', model: RUPHUS_OPENAI_MODEL, output_text: 'fresh coffee reply', output: [] },
  ];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async (request) => { requests.push(request); return responses.shift(); } } } });
  const first = await provider.runTurn({ turnId: 'regen-1', context: {}, userText: 'diagnose', tools: [] });
  const second = await provider.runTurn({ turnId: 'regen-1', context: {}, userText: 'diagnose', tools: [], previous: first, toolResult: { results: [{ callId: 'call-1', result: { coffee: 'El Vergel', dose: 15 } }] } });
  await provider.runTurn({ turnId: 'regen-1', context: {}, userText: 'diagnose', tools: [], previous: second, correctiveInstruction: 'Return a fresh complete reply with no JSON.', priorToolEvidence: [{ callId: 'call-1', result: { coffee: 'El Vergel', dose: 15 } }], toolResult: { results: [{ callId: 'call-1', result: { coffee: 'El Vergel', dose: 15 } }] }, regeneration: true });
  const regenInput = requests[2].input;
  assert.equal(regenInput.filter((item) => item.type === 'function_call_output').length, 1);
  assert.match(regenInput.at(-1).content, /fresh complete reply/);
});
