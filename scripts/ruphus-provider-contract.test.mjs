import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenAIRequest, createOpenAIProvider, outputParts, RUPHUS_OPENAI_MODEL } from '../api/_lib/ruphusProviders/openai.js';
import { RUPHUS_SYSTEM_PROMPT } from '../api/_lib/ruphusPrompt.js';

test('provider instructions preserve partial sensory answers and evidence-backed brewer choices', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ instructions: RUPHUS_SYSTEM_PROMPT, maxOutputTokens: 1, client: { responses: { create: async (request) => {
    requests.push(request);
    return { id: 'sensory-guidance', model: RUPHUS_OPENAI_MODEL, output_text: '', output: [] };
  } } } });
  await provider.runTurn({ context: {}, userText: 'Thin', conversation: [
    { role: 'user', content: 'I used the Kalita recipe and it felt watered down.' },
    { role: 'assistant', content: 'Was it thin but sweet and clean, or sour and sharp?' },
  ], tools: [] });
  const instructions = requests[0].instructions;
  assert.doesNotMatch(instructions, /ask whether they used Aiden, V60, or Kalita/i);
  assert.match(instructions, /"thin" alone does not establish/i);
  assert.match(instructions, /Treat a partial answer as partial/i);
  assert.match(instructions, /do not promise that extraction will stay unchanged/i);
  assert.equal(requests[0].input.at(-1).content, 'Thin');
});

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

test('provider appends the newest user turn after authoritative history', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async (request) => { requests.push(request); return { id: 'r-history', model: RUPHUS_OPENAI_MODEL, output_text: 'done', output: [] }; } } } });
  await provider.runTurn({ turnId: 'history-turn', context: {}, userText: 'Now tell me about El Vergel.', conversation: [
    { role: 'user', content: 'It tasted watery.' },
    { role: 'assistant', content: 'Try one step finer.' },
  ], tools: [] });
  assert.deepEqual(requests[0].input.slice(-3), [
    { role: 'user', content: 'It tasted watery.' },
    { role: 'assistant', content: 'Try one step finer.' },
    { role: 'user', content: 'Now tell me about El Vergel.' },
  ]);
});

test('continuation refreshes trusted brewer context without losing paired tool history', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async request => {
    requests.push(request); return { output_text: 'Which taste?', output: [] };
  } } } });
  const context = { methodBinding: { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita', source: 'M2' } };
  await provider.runTurn({ turnId: 'fresh-binding', context, userText: 'How about the Aidan?', tools: [] });
  context.methodBinding = { status: 'locked', slot: 'aiden', displayName: 'Aiden', source: 'M2' };
  await provider.runTurn({ turnId: 'fresh-binding', context, userText: 'How about the Aidan?', tools: [],
    previous: { outputItems: [{ type: 'function_call', call_id: 'read-aiden', name: 'read_recipe', arguments: '{}' }] },
    toolResult: { results: [{ callId: 'read-aiden', result: { slot: 'aiden', recipe: { ratio: 16 } } }] } });
  assert.match(requests[1].input[0].content, /previous recipe focus was Aiden/);
  assert.doesNotMatch(requests[1].input[0].content, /hot Kalita/);
  assert.equal(requests[1].input.filter(item => item.type === 'function_call_output').length, 1);
});

test('app-side evidence without a provider call id is not sent as an orphan function output', async () => {
  const requests=[];
  const provider=createOpenAIProvider({maxOutputTokens:1,client:{responses:{create:async request=>{requests.push(request);return {output_text:'Ready',output:[]};}}}});
  await provider.runTurn({context:{},userText:'Review it',tools:[],regeneration:true,previous:{outputItems:[]},
    toolResult:{results:[{name:'propose_recipe_change',result:{ok:true,summary:'Review ready'}}]}});
  assert.equal(requests[0].input.some(item=>item.type==='function_call_output'),false);
  assert.ok(requests[0].input.some(item=>item.role==='developer'&&item.content.includes('Review ready')));
});

test('OpenAI continuation replays prior response items alongside every tool result', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async (request) => { requests.push(request); return { id: 'r-2', model: RUPHUS_OPENAI_MODEL, output_text: '', output: [] }; } } } });
  await provider.runTurn({ context: {}, userText: 'coffee', tools: [], previous: { outputItems: [{ type: 'reasoning', id: 'reasoning-1' }] }, toolResult: { results: [{ callId: 'call-1', result: { ok: true } }, { callId: 'call-2', result: { ok: true } }] } });
  assert.equal(requests[0].input[0].role, 'developer');
  assert.deepEqual(requests[0].input[1], { role: 'user', content: 'coffee' });
  assert.deepEqual(requests[0].input.slice(2), [{ type: 'reasoning', id: 'reasoning-1' }, { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true}' }, { type: 'function_call_output', call_id: 'call-2', output: '{"ok":true}' }]);
});

test('provider adapter keeps app-initiated technique continuation outputs paired', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ maxOutputTokens: 1, client: { responses: { create: async (request) => {
    requests.push(request);
    return { id: 'r-contextual-technique', model: RUPHUS_OPENAI_MODEL, output_text: '', output: [] };
  } } } });
  const callId = 'contextual-technique-options';
  await provider.runTurn({
    turnId: 'contextual-technique-turn',
    context: {},
    userText: 'Show me another one',
    tools: [],
    previous: {
      outputItems: [{
        type: 'function_call',
        call_id: callId,
        name: 'read_technique_options',
        arguments: JSON.stringify({ coffeeRef: 'coffee-1', slot: 'v60_hot' }),
      }],
    },
    toolResult: {
      results: [{
        callId,
        name: 'read_technique_options',
        result: { ok: true, actionable: true, options: [{ id: 'trusted-option' }] },
      }],
    },
    regeneration: true,
  });
  const input = requests[0].input;
  assert.equal(input[0].role, 'developer', 'an app-initiated first read keeps the starting context');
  assert.ok(input.some(item => item.role === 'user' && item.content === 'Show me another one'));
  const call = input.find((item) => item.type === 'function_call' && item.call_id === callId);
  const output = input.find((item) => item.type === 'function_call_output' && item.call_id === callId);
  assert.equal(call?.name, 'read_technique_options');
  assert.equal(output?.output, '{"ok":true,"actionable":true,"options":[{"id":"trusted-option"}]}');
  const functionCallIds = new Set(input.filter((item) => item.type === 'function_call').map((item) => item.call_id));
  for (const item of input.filter((candidate) => candidate.type === 'function_call_output')) {
    assert.ok(functionCallIds.has(item.call_id), `orphan function_call_output: ${item.call_id}`);
  }
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
