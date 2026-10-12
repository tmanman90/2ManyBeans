import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnsupportedSensoryInference } from '../api/_lib/ruphusSensoryConsistency.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { fruktFixture } from './fixtures/ruphus-frukt-brew.mjs';
const bad = 'Taste for more sweetness and body; if it turns sharp, that points away from more extraction.';
const good = 'Treat this as a test; compare sweetness and body with the last cup, and note any bitterness or drying sensation. Sharpness alone does not determine extraction direction.';
const now = Date.parse('2026-10-12T00:00:00Z');
async function harness() {
  const f = fruktFixture(); const writes = [];
  const context = { userText: 'Could finer grinding help the last cup?', rotationSnapshot: { coffees: [{ refKey: 'c1', name: f.coffee.name, recipes: ['kalita_hot'] }], refs: { c1: f.coffee.id }, setup: { grinder: 'fellow-ode-gen2' } }, proposalState: { diagnosisReady: true, userAgreed: true } };
  const tools = createRuphusTools({ uid: 'fixture-owner', context, readers: { readCoffee: async () => f.coffee, readRecipe: async () => f.saved, readAttempts: async () => [f.attempt], readTastings: async () => [] }, proposalStore: async input => { writes.push(input); return { ...input, status: 'proposed' }; } });
  const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  const args = { coffeeRef: 'c1', slot: 'kalita_hot', baseline: evidence.recentBrews[0].brewRef, intent: 'recipe_preview', change: { control: 'grind', value: 6 }, explanation: bad };
  return { ...f, tools, context, writes, args };
}
test('the observed sharp/extraction reversal and categorical paraphrases are caught', () => {
  for (const text of [bad, 'Sharpness means over-extraction.', 'A sharp cup proves under-extraction.', 'Sharp coffee means you must grind coarser.', 'Sharpness confirms too much extraction.']) assert.equal(hasUnsupportedSensoryInference(text), true, text);
});
test('uncertainty, negated claims, comparative reports and clarifications remain allowed', () => {
  for (const text of [good, 'Sharpness could mean acidity or a drying texture.', 'Sharpness doesn’t prove over-extraction.', 'Sharpness does not point away from more extraction.', 'What does sharp mean here: sour acidity or drying bitterness?', 'The finer test was harsher and drying; return to the previous setting and compare.', 'If the cup gains sweetness and body without drying, keep this test.']) assert.equal(hasUnsupportedSensoryInference(text), false, text);
});
test('bad explanation is rejected before publication or persistence; a corrected one preserves the experiment', async () => {
  const h = await harness();
  const rejected = await h.tools.call('propose_recipe_change', h.args);
  assert.equal(rejected.code, 'sensory_claim_uncertain'); assert.equal(h.writes.length, 0); assert.equal(h.context.proposalState.proposalIssued, undefined);
  const accepted = await h.tools.call('propose_recipe_change', { ...h.args, explanation: good });
  assert.equal(accepted.ok, true); assert.equal(h.writes.length, 1);
  assert.equal(accepted.artifact.after.coffeeGrams, 18); assert.equal(accepted.artifact.after.waterGrams, 279);
  assert.equal(accepted.artifact.after.grindSize.setting, '6');
  assert.deepEqual(accepted.artifact.after.steps, h.executed.steps);
  assert.equal(accepted.artifact.explanation, good);
});
test('uncertainty guard does not prescribe a universal grind direction or control', async () => {
  for (const change of [{ control: 'grind', value: 6 }, { control: 'grind', value: 6.6 }, { control: 'temperature', value: 94 }, { control: 'ratio', value: 15 }]) {
    const h = await harness();
    const result = await h.tools.call('propose_recipe_change', { ...h.args, change, explanation: good });
    assert.equal(result.ok, true, JSON.stringify({ change, result }));
    assert.equal(h.writes.length, 1);
  }
});
test('real proposal recovery is bounded to one explanatory repair without publishing the rejected claim', async () => {
  const h = await harness(); const frames = []; let calls = 0;
  const result = await runRuphusTurn({ turnId: 'sensory-repair', context: h.context, userText: h.context.userText, tools: h.tools, emit: frame => frames.push(frame), provider: { runTurn: async input => {
    calls++;
    if (calls === 2) assert.match(input.correctiveInstruction, /Sharpness alone/);
    assert.ok(calls <= 2);
    return { toolCalls: [{ callId: `call-${calls}`, name: 'propose_recipe_change', args: { ...h.args, explanation: calls === 1 ? bad : good } }] };
  } } });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 2); assert.equal(h.writes.length, 1);
  const published = frames.filter(frame => ['artifact_ready', 'text_delta', 'turn_completed'].includes(frame.type));
  assert.doesNotMatch(JSON.stringify(published), /points away from more extraction/);
  assert.equal(published.filter(frame => frame.type === 'artifact_ready').length, 1);
});
test('repeated unsupported proposal rationale stops after one repair, without a stored or shown proposal', async () => {
  const h = await harness(); let calls = 0;
  const result = await runRuphusTurn({ turnId: 'sensory-stop', context: h.context, userText: h.context.userText, tools: h.tools, provider: { runTurn: async () => ({ toolCalls: [{ callId: `call-${++calls}`, name: 'propose_recipe_change', args: h.args }] }) } });
  assert.equal(result.ok, false); assert.equal(calls, 2); assert.equal(h.writes.length, 0); assert.deepEqual(result.artifacts, []);
});
test('a prose-only extraction claim receives one uncertainty correction and no recipe is invented', async () => {
  let calls = 0;
  const result = await runRuphusTurn({ turnId: 'sensory-prose', context: {}, userText: 'What does sharp tell you?', tools: { names: [], definitions: [], call: async () => assert.fail('No recipe tool should run') }, provider: { runTurn: async input => {
    calls++;
    if (calls === 2) assert.match(input.correctiveInstruction, /Sharpness alone/);
    return { text: calls === 1 ? bad : 'Do you mean sour acidity, bitterness, or a drying sensation?' };
  } } });
  assert.equal(result.ok, true); assert.equal(calls, 2); assert.equal(result.artifacts.length, 0); assert.match(result.text, /Do you mean/);
});
test('repeated unsupported prose is withheld, not delivered after the retry budget', async () => {
  let calls = 0; const frames = [];
  const result = await runRuphusTurn({ turnId: 'sensory-prose-stop', context: {}, userText: 'What does sharp tell you?', tools: { names: [], definitions: [], call: async () => assert.fail('No tools') }, emit: frame => frames.push(frame), provider: { runTurn: async () => { calls++; return { text: bad }; } } });
  assert.equal(result.ok, false); assert.equal(calls, 2); assert.equal(frames.some(frame => frame.type === 'text_delta' && frame.text.includes('points away')), false);
});
test('a published valid card stays fixed when surrounding model prose makes the unsupported inference', async () => {
  const h = await harness(); let calls = 0; const frames = [];
  const result = await runRuphusTurn({ turnId: 'sensory-published-card', context: h.context, userText: h.context.userText, tools: h.tools, emit: frame => frames.push(frame), provider: { runTurn: async () => {
    calls++;
    return { text: bad, toolCalls: [{ callId: 'valid-card', name: 'propose_recipe_change', args: { ...h.args, explanation: good } }] };
  } } });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 1); assert.equal(h.writes.length, 1);
  assert.equal(result.artifacts.length, 1); assert.equal(result.artifacts[0].after.grindSize.setting, '6');
  assert.doesNotMatch(result.text, /points away from more extraction/);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
});
test('ordinary negation and independent conditional advice do not spend a repair call', async () => {
  for (const text of ['Sourness alone never proves under-extraction.', 'If you grind finer, that means more extraction; stop if the cup turns sharp or drying.', 'Sharpness is not proof of over-extraction.', 'If it tastes sour, try a finer setting and compare sweetness.', 'Sharpness might mean under-extraction.']) {
    assert.equal(hasUnsupportedSensoryInference(text), false, text);
    let calls = 0;
    const result = await runRuphusTurn({ turnId: 'allowed-sensory', context: {}, userText: 'How should I compare the next cup?', tools: { names: [], definitions: [], call: async () => assert.fail('No tool expected') }, provider: { runTurn: async () => { calls++; return { text }; } } });
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 1, text);
  }
  assert.equal(hasUnsupportedSensoryInference('Sharpness proves over-extraction, although the next test may help.'), true, 'unrelated qualification cannot excuse a categorical claim');
});
test('explanation repair cannot replace the baseline, control, dose, equipment or other recipe arguments', async () => {
  for (const patch of [
    { baseline: 'saved_recipe', change: { control: 'ratio', value: 14.5 } },
    { change: { control: 'grind', value: 6.6 } },
    { servingDoseGrams: 24 }, { slot: 'v60_hot' }, { coffeeRef: 'c2' },
    { afterRecipe: { coffeeGrams: 24, waterGrams: 348 } },
  ]) {
    const h = await harness(); const frames = []; let calls = 0;
    const result = await runRuphusTurn({ turnId: 'sensory-drift', context: h.context, userText: h.context.userText, tools: h.tools, emit: frame => frames.push(frame), provider: { runTurn: async () => ({ toolCalls: [{ callId: `call-${++calls}`, name: 'propose_recipe_change', args: calls === 1 ? h.args : { ...h.args, ...patch, explanation: good } }] }) } });
    assert.equal(result.ok, false, JSON.stringify(patch)); assert.equal(result.code, 'sensory_correction_changed_recipe');
    assert.equal(calls, 2); assert.equal(h.writes.length, 0); assert.equal(result.artifacts.length, 0);
    assert.ok(frames.some(frame => frame.type === 'text_delta' && /No new card/.test(frame.text)));
    assert.ok(frames.some(frame => frame.type === 'turn_interrupted'));
  }
});
test('repair rejects an extra read but accepts equivalent numeric and nullable schema representations', async () => {
  for (const extraRead of [false, true]) {
    const h = await harness(); let calls = 0;
    const result = await runRuphusTurn({ turnId: 'sensory-contract', context: h.context, userText: h.context.userText, tools: h.tools, provider: { runTurn: async () => {
      calls++;
      return { toolCalls: [calls === 2 && extraRead
        ? { callId: 'extra-read', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'kalita_hot' } }
        : { callId: `call-${calls}`, name: 'propose_recipe_change', args: calls === 1 ? h.args : { ...h.args, explanation: good, change: { control: 'grind', value: '6.0' }, servingDoseGrams: null, experiment: null } }] };
    } } });
    assert.equal(calls, 2); assert.equal(result.ok, !extraRead); assert.equal(h.writes.length, extraRead ? 0 : 1);
    if (extraRead) assert.deepEqual(result.toolNames, ['propose_recipe_change']);
  }
});
test('explicitly rejected diagnoses are allowed without exempting a separate asserted claim', () => {
  for (const text of ['Do not assume sharpness means over-extraction.', 'It would be wrong to say sharpness proves under-extraction.', 'Avoid saying a sharp cup means too much extraction.', 'The claim “sharpness means over-extraction” is unsupported.']) {
    assert.equal(hasUnsupportedSensoryInference(text), false, text);
  }
  assert.equal(hasUnsupportedSensoryInference('Do not assume sharpness means over-extraction; sourness proves under-extraction.'), true);
});
test('a blocked repair cannot echo the rejected claim through recovery text', async () => {
  let calls = 0; const frames = [];
  const result = await runRuphusTurn({ turnId: 'sensory-blocked-echo', context: {}, userText: 'What does sharp tell you?', tools: { names: [], definitions: [], call: async () => assert.fail('No tools') }, emit: frame => frames.push(frame), provider: { runTurn: async () => {
    calls++;
    return { text: 'Sharpness means over-extraction.', ...(calls === 2 ? { envelope: { state: 'blocked', intent: 'information', text: 'Sharpness means over-extraction.' } } : {}) };
  } } });
  assert.equal(result.ok, false); assert.equal(calls, 2);
  assert.doesNotMatch(result.text, /means over-extraction/);
  assert.doesNotMatch(JSON.stringify(frames.filter(frame => ['text_delta', 'turn_completed'].includes(frame.type))), /means over-extraction/);
  assert.ok(frames.some(frame => frame.type === 'turn_interrupted'));
});
