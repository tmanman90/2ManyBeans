import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveProposalReadiness } from '../api/ruphus-agent.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';

const conversation = [
  { role: 'user', content: 'I brewed the coffee in jar #1 with the Kalita 155 recipe. It tasted watered down. What should I change?' },
  { role: 'assistant', content: 'Got it—on the Kalita 155, was the cup thin but sweet/clean, or did it taste sour, sharp, or muted?' },
];
const answers = ['Tasted sour', 'Sour', 'It was sharp.', 'A bit muted', 'Sweet and clean', 'Not sour, just bitter', 'It felt dry and harsh'];

test('an unready card after the read budget falls back to conversation, never dispatching the card', async () => {
  let calls = 0; const dispatched = []; const frames = [];
  const names = ['read_coffee_evidence', 'read_recipe', 'propose_recipe_change'];
  const result = await runRuphusTurn({ turnId: 'uncertain-answer', context: { proposalState: { target: { coffeeRef: 'c1', slot: 'kalita_hot' }, diagnosisReady: false, userAgreed: false } }, userText: 'I cannot tell',
    tools: { names, definitions: [], call: async name => { dispatched.push(name); return { ok: true }; } },
    provider: { runTurn: async input => {
      calls += 1;
      if (calls <= 3) return { toolCalls: [{ name: names[calls - 1], args: { coffeeRef: 'c1', slot: 'kalita_hot' } }] };
      assert.equal(calls, 4); assert.deepEqual(input.tools, []);
      assert.match(input.correctiveInstruction, /not.*prepared|not.*saved/i);
      return { text: 'That’s okay. Let the cup cool a little and taste again; we can leave the recipe unchanged for now.' };
    } }, emit: frame => frames.push(frame) });
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(dispatched, names.slice(0, 2));
  assert.equal(result.artifacts.length, 0);
  assert.match(result.text, /That’s okay/);
  assert.equal(frames.at(-1).type, 'turn_completed');
});

test('natural answers to the sensory question earn a grounded review, not another yes', () => {
  for (const userText of answers) {
    assert.deepEqual(deriveProposalReadiness({ conversation, ledger: { entries: [{ status: 'available' }] }, userText }), { diagnosisReady: true, userAgreed: true }, userText);
    assert.equal(deriveProposalReadiness({ conversation, ledger: { entries: [] }, userText }).diagnosisReady, false);
  }
  for (const userText of ['Not sure', 'Maybe sour', 'Not sour', 'Was it sour?', 'What if it tasted sour?', 'Wait, do not change anything', 'Yes']) {
    assert.equal(deriveProposalReadiness({ conversation, ledger: { entries: [{ status: 'available' }] }, userText }).diagnosisReady, false, userText);
  }
});

test('sensory answers complete two real evidence reads and a recipe card without a round-limit failure', async () => {
  for (const userText of answers) {
    const before = generateKalitaRecipe({}, { dose: 13 });
    const original = structuredClone(before); const proposals = []; const frames = [];
    const context = { userText, conversation, sessionId: `sensory-${userText}`, launchContext: { surface: 'direct' },
      rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Columbia', jarSlot: 1, recipes: ['kalita_hot'] }], refs: { c1: 'bean-1' } },
      ledger: { entries: [], namedCoffees: [] }, proposalState: { target: null, diagnosisReady: false, userAgreed: false } };
    const tools = createRuphusTools({ uid: 'owner', context, readers: {
      readCoffee: async () => ({ name: 'Columbia' }), readRecipe: async () => before,
      readBrews: async () => [], readTastings: async () => [],
    }, proposalStore: async input => { proposals.push(input); return { ...input, id: 'review-1' }; } });
    let calls = 0;
    const requests = [
      { name: 'read_coffee_evidence', args: { coffeeRef: 'c1', windowDays: 14 } },
      { name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'kalita_hot' } },
      { name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'temperature', value: 95 } } },
    ];
    const result = await runRuphusTurn({ turnId: `followup-${userText}`, context, userText, tools,
      provider: { runTurn: async () => { assert.ok(calls < 3); return { toolCalls: [requests[calls++]] }; } }, emit: frame => frames.push(frame) });
    assert.equal(result.ok, true, `${userText}: ${result.code}`);
    assert.equal(calls, 3); assert.equal(proposals.length, 1);
    assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
    assert.equal(frames.at(-1).type, 'turn_completed');
    assert.deepEqual(before, original, 'Only a review is created; the saved recipe is not changed');
  }
});
