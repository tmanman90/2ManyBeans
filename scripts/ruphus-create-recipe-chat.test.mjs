import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { recentProposalReviews } from '../src/lib/ruphus/proposalContinuity.js';
import { bindRuphusTurn } from '../api/_lib/ruphusTurnBinder.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { equipmentClarificationAnswer } from '../src/lib/ruphus/methodResolver.js';

function harness(recipe, userText, prior = []) {
  const context = {
    userText, sessionId: 'create-recipe', conversation: [],
    rotationSnapshot: { refs: { c1: 'coffee-1' }, coffees: [{ refKey: 'c1', name: 'Jar one', recipes: recipe ? [recipe.device === 'kalita' ? 'kalita_hot' : 'v60_hot'] : [] }], setup: { grinder: 'fellow-ode-gen2' } },
    proposalState: { target: null },
    __ruphusPriorProposals: prior,
  };
  const tools = createRuphusTools({ uid: 'owner', context, readers: { readRecipe: async () => recipe } });
  return { tools, context };
}

async function propose(tools, slot, options) {
  const selected = options.options.find(item => item.executable);
  assert.ok(selected, 'a complete source recipe is available without a matching saved base');
  return tools.call('propose_recipe_change', { coffeeRef: 'c1', slot,
    experiment: { kind: options.sourceOptions ? 'manual_source_technique' : 'v60_technique', techniqueId: selected.id } });
}

test('semantic recipe-preview requests do not depend on magic words and finish with a real card', async () => {
  for (const userText of [
    'Can you suggest a unique v60 recipe for jar 2',
    'Surprise me with something to brew in my V60',
    'I fancy a new way to brew this tomorrow',
  ]) {
    const { tools, context } = harness(null, userText);
    const frames = [];
    let rounds = 0;
    const result = await runRuphusTurn({ turnId: `semantic-${userText.length}`, context, userText, tools,
      emit: frame => frames.push(frame), provider: { runTurn: async input => {
        rounds++;
        if (rounds === 1) return { toolCalls: [{ callId: 'source-options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' } }] };
        if (rounds === 2) return { text: 'Try a pulse-driven V60 with five pours.' };
        const options = input.toolResult.results[0].result;
        const selected = options.options.find(item => item.executable);
        return { toolCalls: [{ callId: 'source-preview', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', experiment: { kind: options.sourceOptions ? 'manual_source_technique' : 'v60_technique', techniqueId: selected.id } } }] };
      } } });
    assert.equal(result.ok, true, JSON.stringify(result));
    const card = frames.find(frame => frame.type === 'artifact_ready')?.artifact;
    assert.ok(card?.after?.sourceLineage || card?.after?.sourceProjection, `request must deliver a complete source card: ${userText}`);
    assert.ok(card.after.steps?.length || card.after.sourceProjection?.stages?.length, 'complete pour instructions');
    assert.equal(card.before, null, 'do not invent an existing saved V60');
    assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
  }
});

test('semantic information intent does not create unsolicited cards even for technique vocabulary', async () => {
  const { tools, context } = harness(null, 'Explain the different V60 methods I could try');
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'information' });
  assert.ok(options.options.some(item => item.executable), 'information can still inspect complete sources');
  assert.equal(context.proposalState.techniqueReady, undefined);
  const denied = await propose(tools, 'v60_hot', options);
  assert.equal(denied.ok, false);
  let calls = 0;
  const frames = [];
  const result = await runRuphusTurn({ turnId: 'information-only', context, userText: context.userText, tools, emit: frame => frames.push(frame), provider: { runTurn: async () => {
    if (++calls === 1) return { toolCalls: [{ name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'information' } }] };
    assert.equal(calls, 2, 'explanation must not trigger a forced preview continuation');
    return { text: 'Some methods split the water into pulses; others use a continuous pour.' };
  } } });
  assert.equal(result.ok, true);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 0);
});

test('semantic intent never bypasses source availability or owner scope', async () => {
  const { tools, context } = harness({ code: 'permission_denied' }, 'Something fun to brew');
  const unavailable = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' });
  assert.equal(unavailable.actionable, false);
  assert.equal(context.proposalState.techniqueReady, undefined);
  await assert.rejects(tools.call('read_technique_options', { coffeeRef: 'other-owner', slot: 'v60_hot', intent: 'recipe_preview' }));
});

test('155 to 185 correction prepares a real 185 draft while retaining the actual 155 before-state', async () => {
  const saved = generateKalitaRecipe({}, { size: '155', dose: 13 });
  const before = structuredClone(saved);
  const { tools } = harness(saved, 'Actually I mean the 185');
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(options.actionable, true);
  assert.ok(options.options.filter(item => item.executable).every(item => item.sourceConfiguration.size === '185'));
  const result = await propose(tools, 'kalita_hot', options);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifact.before.kalitaSize, '155');
  assert.equal(result.artifact.after.kalitaSize, '185');
  assert.deepEqual(saved, before, 'draft creation does not replace saved recipe or rewrite its size');
});

test('an empty Kalita slot can prepare a complete named source draft', async () => {
  const { tools } = harness(null, 'Try a Kalita 185 technique for Jar one');
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const result = await propose(tools, 'kalita_hot', options);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifact.before, null, 'absence is not a fabricated recipe');
  assert.equal(result.artifact.after.kalitaSize, '185');
});

test('classic V60 to explicit Switch03 prepares a Switch source, not an adaptation of the classic recipe', async () => {
  const saved = generateV60Recipe({}, { dose: 20 });
  const { tools } = harness(saved, 'Try full immersion with the Switch 03 for Jar one');
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  const result = await propose(tools, 'v60_hot', options);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifact.after.variant, 'switch');
  assert.equal(result.artifact.after.v60Size, '03');
  assert.notEqual(result.artifact.before.variant, 'switch');
});

test('empty standard V60 slot can prepare a named draft using the selected source serving', async () => {
  const { tools } = harness(null, 'Try a different V60 02 technique for Jar one');
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  const result = await propose(tools, 'v60_hot', options);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifact.before, null);
  assert.ok(result.artifact.after.coffeeGrams > 0);
});

test('unknown Wave size asks only for the equipment detail instead of sending user away', async () => {
  const { tools } = harness(null, 'Try a different Kalita technique');
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(options.actionable, false);
  assert.match(options.message, /155.*185/);
  assert.doesNotMatch(options.message, /Rotation|saved.*before|generate one/i);
});

test('a short Switch size answer completes the in-chat clarification instead of using classic V60', async () => {
  const { tools, context } = harness(generateV60Recipe({}, { dose: 20 }), '03');
  context.conversation = [{ role: 'user', content: 'Try a Switch technique' }, { role: 'assistant', content: 'Which Switch size are you using—02 or 03?' }];
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  const result = await propose(tools, 'v60_hot', options);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifact.after.variant, 'switch');
  assert.equal(result.artifact.after.v60Size, '03');
});

test('native-shaped Switch answer loads source options before any model-selected history read', async () => {
  const saved = generateV60Recipe({}, { dose: 20 });
  const readers = { listCoffees: async () => [{ id: 'coffee-1', name: 'Columbia', status: 'ACTIVE', jarSlot: 1 }], readRecipe: async () => saved };
  const context = await buildRuphusContext({ uid: 'owner', contextRef: { surface: 'direct' }, evidenceByteCap: 10000,
    userText: '03', readers,
    conversation: [{ role: 'user', content: 'Make a switch recipe for jar one' }, { role: 'assistant', content: 'Got it—jar one is Columbia. Which Switch size are you using: 02 or 03?' }, { role: 'user', content: '03' }],
    ledger: { entries: [{ kind: 'coffee_focus', status: 'available', namedCoffees: ['Columbia'] }, { kind: 'method_focus', status: 'available', namedCoffees: ['Columbia'], methodFocus: { displayName: 'hot Kalita' } }] },
  });
  assert.equal(context.methodBinding.displayName, 'hot Switch 03');
  const tools = createRuphusTools({ uid: 'owner', context, readers });
  const frames = [];
  let calls = 0;
  const result = await runRuphusTurn({ turnId: 'native-switch-answer', context, userText: '03', tools, emit: f => frames.push(f), provider: { runTurn: async input => {
    calls++;
    assert.equal(calls, 1, 'the answer needs one model dispatch after its trusted option read');
    const read = input.toolResult.results[0];
    assert.equal(read.name, 'read_technique_options');
    assert.equal(read.result.actionable, true);
    const selected = read.result.options.find(item => item.executable);
    return { toolCalls: [{ callId: 'prepare-switch', name: 'propose_recipe_change', args: { coffeeRef: context.turnBinding.coffeeRef, slot: 'v60_hot', experiment: { kind: 'manual_source_technique', techniqueId: selected.id } } }] };
  } } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const card = frames.find(f => f.type === 'artifact_ready')?.artifact;
  assert.equal(card?.after.variant, 'switch');
  assert.equal(card?.after.v60Size, '03');
  assert.equal(card?.before.v60Size, '02');
});

test('equipment answers are immediate, constrained, and do not reinterpret ordinary numbers', () => {
  const question = [{ role: 'assistant', content: 'Which Switch size are you using—02 or 03?' }];
  assert.equal(equipmentClarificationAnswer('03', []) , null);
  assert.equal(equipmentClarificationAnswer('03', [...question, { role: 'user', content: 'Something else' }]), null);
  assert.equal(equipmentClarificationAnswer('03', [{ role: 'assistant', content: 'Your Switch size is 03.' }]), null);
  assert.equal(equipmentClarificationAnswer('185', question), null);
  assert.equal(equipmentClarificationAnswer("It's 03", question)?.size, '03');
  assert.equal(equipmentClarificationAnswer('02', question)?.size, '02');
  assert.equal(equipmentClarificationAnswer('03', [...question, { role: 'user', content: '03' }])?.size, '03');
  assert.equal(equipmentClarificationAnswer('03', [{ role: 'assistant', content: 'Got it—Columbia, on the Switch. Which size do you have: 02 or 03?' }])?.size, '03');
  assert.equal(equipmentClarificationAnswer('03', [{ role: 'user', content: 'Make a Switch recipe for jar one' }, { role: 'assistant', content: 'Which size do you have: 02 or 03?' }])?.size, '03');
  assert.equal(equipmentClarificationAnswer('03', [{ role: 'user', content: '0' }, { role: 'assistant', content: 'Do you mean the Switch 01 size?' }, { role: 'user', content: '03' }])?.size, '03');
  assert.equal(equipmentClarificationAnswer('03', [{ role: 'assistant', content: 'How did your Switch coffee taste?' }]), null);
  assert.equal(equipmentClarificationAnswer('03', [{ role: 'user', content: 'Make an iced Switch recipe' }, ...question]), null);
});

test('a clarified Switch02 stays reference-only and never borrows the 03 schedule', async () => {
  const { tools, context } = harness(generateV60Recipe({}, { dose: 20 }), '02');
  context.conversation = [{ role: 'assistant', content: 'Which Switch size are you using—02 or 03?' }];
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(options.actionable, false);
  assert.ok(!(options.options || []).some(item => item.executable));
  assert.equal(context.proposalState.techniqueReady, undefined);
});

test('recipe_missing is absence but unavailable evidence never creates a draft', async () => {
  const missing = harness({ code: 'recipe_missing' }, 'Try a Kalita 185 technique');
  const options = await missing.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const result = await propose(missing.tools, 'kalita_hot', options);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifact.before, null);
  const unavailable = harness({ code: 'permission_denied' }, 'Try a Kalita 185 technique');
  const denied = await unavailable.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(denied.ok, false);
  assert.equal(denied.actionable, false);
});

test('another after a 185 draft stays on 185 even while the saved recipe is 155', async () => {
  const saved = generateKalitaRecipe({}, { size: '155', dose: 13 });
  const first = harness(saved, 'Actually I mean the 185');
  const options = await first.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const draft = (await propose(first.tools, 'kalita_hot', options)).artifact;
  const next = harness(saved, 'Show me another one', [draft]);
  const alternatives = await next.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(alternatives.actionable, true);
  const result = await propose(next.tools, 'kalita_hot', alternatives);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifact.after.kalitaSize, '185');
  assert.notEqual(result.artifact.techniqueExperiment.sourceId, draft.techniqueExperiment.sourceId);
});

test('asking what a 185 is does not authorize a new recipe card', async () => {
  const { tools, context } = harness(generateKalitaRecipe({}, { size: '155', dose: 13 }), 'What is the Kalita 185?');
  await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(context.proposalState.techniqueReady, undefined);
});

test('empty-slot draft survives review history and authenticates another/inspection after returning', async () => {
  const { tools } = harness(null, 'Try a Kalita 185 technique');
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const draft = (await propose(tools, 'kalita_hot', options)).artifact;
  const reviews = recentProposalReviews({ messages: [{ role: 'assistant', artifacts: [draft] }] }, { c1: 'coffee-1' });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].before, null);
  assert.match(reviews[0].comparisonBasis, /No saved recipe/);
  const bound = bindRuphusTurn({ userText: 'Show me another one', coffees: [{ id: 'coffee-1', name: 'Jar one' }], refs: { c1: 'coffee-1' }, priorTechniqueProposals: [draft] });
  assert.equal(bound.status, 'locked');
  assert.equal(bound.techniqueSlot, 'kalita_hot');
  const next = harness(null, 'Show me the first recipe', [draft]);
  next.context.proposalReviews = reviews;
  const inspected = await next.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(inspected.historical, true);
  assert.equal(inspected.artifact.id, draft.id);
  assert.equal(inspected.artifact.historyOnly, true);
});

test('runtime continues a corrected-equipment option read into a real card when the model stops at prose', async () => {
  const { tools, context } = harness(generateKalitaRecipe({}, { size: '155', dose: 13 }), 'Actually I mean the 185');
  const frames = [];
  let rounds = 0;
  const result = await runRuphusTurn({ turnId: 'corrected-size', context, userText: context.userText, tools,
    emit: frame => frames.push(frame), provider: { runTurn: async (input) => {
      rounds++;
      if (rounds === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'kalita_hot' } }] };
      if (rounds === 2) return { text: 'I can prepare a Kalita 185 recipe.' };
      const selected = input.toolResult.results[0].result.options.find(item => item.executable);
      return { toolCalls: [{ callId: 'draft', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'kalita_hot', experiment: { kind: 'manual_source_technique', techniqueId: selected.id } } }] };
    } } });
  assert.notEqual(result.status, 'failed');
  const card = frames.find(frame => frame.type === 'artifact_ready')?.artifact;
  assert.ok(card, 'a supported correction must not end on a promise or navigation advice');
  assert.equal(card.after.kalitaSize, '185');
  assert.equal(card.before.kalitaSize, '155');
});
