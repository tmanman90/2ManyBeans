import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { absentRecipeSourceHash } from '../src/lib/ruphus/recipeSourceState.js';
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

test('absent V60 creation exposes reviewed bounds and rejects out-of-range ratios with a typed result', async () => {
  const { tools } = harness({ code: 'recipe_missing' }, 'Make a new V60 recipe for Jar one');
  const read = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.deepEqual(read.creation.configurations[0].bounds.ratio, [15, 18.5]);
  assert.deepEqual(read.creation.configurations[0].bounds.temperatureC, [92, 100]);
  assert.equal(read.creation.configurations[1].bounds, undefined, 'Switch configuration must not inherit classic V60 bounds');
  const rejected = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 14 },
    servingDoseGrams: null, aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'invalid_ratio_preview');
  assert.match(rejected.message, /between 15 and 18\.5/);
  const valid = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 17 },
    servingDoseGrams: null, aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(valid.artifact.after.ratio, '1:17');

  const iced = harness({ code: 'recipe_missing' }, 'Make a new iced V60 recipe for Jar one');
  const icedRead = await iced.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_iced' });
  assert.equal(icedRead.creation.configurations[0].bounds, undefined, 'iced V60 has a separate temperature/ration contract');
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

test('an unsaved V60 draft remains the exact base after an absent-slot evidence follow-up', async () => {
  const first = harness(null, 'Try a V60 technique for Jar one');
  const options = await first.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' });
  const selected = options.options.find((item) => item.executable);
  const draft = (await first.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview',
    experiment: { kind: 'v60_technique', techniqueId: selected.id },
  })).artifact;
  assert.equal(draft.sourceState, 'absent');
  assert.equal(draft.before, null);

  const next = harness({ code: 'recipe_missing' }, 'Make this stronger please', [draft]);
  const evidence = await next.tools.call('read_coffee_evidence', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(evidence.sourceState, 'absent');
  assert.equal(evidence.selectedRecipe, null);
  assert.equal(evidence.draft.sourceState, 'absent');
  assert.equal(evidence.draft.recipe.technique, draft.after.technique);
  const exact = await next.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(exact.sourceState, 'absent');
  assert.equal(exact.draft.recipe.technique, draft.after.technique);

  const strongerContinuation = await next.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview',
    change: { control: 'ratio', value: 14 }, servingDoseGrams: null,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(strongerContinuation.ok, true, JSON.stringify(strongerContinuation));
  assert.equal(strongerContinuation.artifact.before, null, 'saved source remains genuinely absent');
  assert.equal(strongerContinuation.artifact.after.ratio, '1:14');
  assert.equal(strongerContinuation.artifact.after.waterGrams, 210);
  assert.equal(strongerContinuation.artifact.after.sourceLineage.adaptationRuleId, 'v60-explicit-ratio-adaptation-v1');

  const continuation = await next.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview',
    change: { control: 'ratio', value: 15.5 }, servingDoseGrams: null,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(continuation.ok, true, JSON.stringify(continuation));
  assert.equal(continuation.artifact.before, null, 'saved source remains genuinely absent');
  assert.equal(continuation.artifact.after.technique, draft.after.technique, 'continuation retains the selected draft technique');
  assert.equal(continuation.artifact.after.ratio, '1:15.5');

  const sizedTemperature = await next.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview',
    change: { control: 'temperature', value: 95 }, servingDoseGrams: 18,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(sizedTemperature.ok, true, JSON.stringify(sizedTemperature));
  assert.equal(sizedTemperature.artifact.after.coffeeGrams, 18, 'serving size is retained with a diagnostic control');
  assert.equal(sizedTemperature.artifact.after.waterTemp.celsius, 95, 'the requested temperature is not dropped');
});

test('draft continuation fails closed across method, source-hash, and availability boundaries', async () => {
  const first = harness(null, 'Try a V60 technique for Jar one');
  const options = await first.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' });
  const selected = options.options.find((item) => item.executable);
  const draft = (await first.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', experiment: { kind: 'v60_technique', techniqueId: selected.id } })).artifact;

  const corrected = harness({ code: 'recipe_missing' }, 'Make this stronger please', [draft]);
  corrected.context.methodBinding = { status: 'locked', slot: 'v60_hot', displayName: 'hot Switch 03', source: 'equipment-answer' };
  const correctedRead = await corrected.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(correctedRead.draft, undefined, 'a classic draft cannot cross a Switch correction');
  const correctedProposal = await corrected.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 15.5 }, servingDoseGrams: null, aidenProfile: null, experiment: null, explanation: null });
  assert.equal(correctedProposal.ok, true, JSON.stringify(correctedProposal));
  assert.equal(correctedProposal.artifact.after.variant, 'switch');
  assert.equal(correctedProposal.artifact.after.v60Size, '03');

  const wrongHash = harness({ code: 'recipe_missing' }, 'Make this stronger please', [{ ...draft, sourceHash: 'stale-source-hash' }]);
  const wrongHashRead = await wrongHash.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(wrongHashRead.draft, undefined, 'a draft from another absence hash cannot become the target');

  const revoked = harness({ code: 'recipe_missing' }, 'Make this stronger please', [{ ...draft, status: 'undone' }]);
  const revokedRead = await revoked.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(revokedRead.draft, undefined, 'an undone draft cannot be resurrected as the current base');
  const revokedProposal = await revoked.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 15.5 }, servingDoseGrams: null, aidenProfile: null, experiment: null, explanation: null });
  assert.equal(revokedProposal.ok, true, JSON.stringify(revokedProposal));
  assert.equal(revokedProposal.artifact.techniqueExperiment, undefined, 'a new explicit proposal must not silently revive the revoked technique draft');

  const unavailable = harness({ code: 'permission_denied' }, 'Make this stronger please', [draft]);
  const unavailableRead = await unavailable.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(unavailableRead.status, 'unavailable');
  assert.equal(unavailableRead.draft, undefined);
  const blocked = await unavailable.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 15.5 }, servingDoseGrams: null, aidenProfile: null, experiment: null, explanation: null });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'proposal_target_required');
});

test('an unsaved draft never silently regenerates when a follow-up has no bounded change', async () => {
  const first = harness(null, 'Try a V60 technique for Jar one');
  const options = await first.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' });
  const selected = options.options.find((item) => item.executable);
  const draft = (await first.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview',
    experiment: { kind: 'v60_technique', techniqueId: selected.id },
  })).artifact;
  const next = harness({ code: 'recipe_missing' }, 'Make this stronger please', [draft]);
  const read = await next.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.ok(read.draft);
  const rejected = await next.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: null,
    servingDoseGrams: null, aidenProfile: { title: 'untrusted replacement' }, experiment: null, explanation: null,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'draft_change_required');
  assert.equal(rejected.artifact, undefined);
});

test('a real two-turn runtime carries the unsaved draft through evidence and exact reads', async () => {
  const first = harness(null, 'Try a V60 technique for Jar one');
  const options = await first.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' });
  const selected = options.options.find((item) => item.executable);
  const draft = (await first.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', experiment: { kind: 'v60_technique', techniqueId: selected.id } })).artifact;
  const next = harness({ code: 'recipe_missing' }, 'Make this stronger please', [draft]);
  const frames = [];
  let dispatches = 0;
  const result = await runRuphusTurn({ turnId: 'unsaved-draft-followup', context: next.context, userText: next.context.userText, tools: next.tools, emit: (frame) => frames.push(frame), provider: {
    runTurn: async () => {
      dispatches += 1;
      if (dispatches === 1) return { toolCalls: [{ callId: 'evidence', name: 'read_coffee_evidence', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      if (dispatches === 2) return { toolCalls: [{ callId: 'exact', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      if (dispatches === 3) return { toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 15.5 }, servingDoseGrams: null, aidenProfile: null, experiment: null, explanation: null } }] };
      throw new Error('the successful proposal should complete without an extra provider dispatch');
    },
  } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(dispatches, 3, 'the draft continuation should need no extra discovery or final-text hop');
  const card = frames.find((frame) => frame.type === 'artifact_ready')?.artifact;
  assert.ok(card);
  assert.equal(card.before, null);
  assert.equal(card.after.technique, draft.after.technique);
  assert.equal(card.after.ratio, '1:15.5', 'the bounded ratio adjustment is preserved');
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

test('active iced review is typed and continues the exact draft without hot technique discovery', async () => {
  const draftRecipe = generateV60IcedRecipe({}, { dose: 20 });
  const draft = {
    type: 'recipe_proposal', id: 'review-iced-1', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_iced',
    sourceState: 'absent', sourceHash: absentRecipeSourceHash('v60_iced'), before: null, after: draftRecipe,
  };
  const next = harness({ code: 'recipe_missing' }, 'Make it 25 grams instead', [draft]);
  next.context.methodBinding = { status: 'locked', slot: 'v60_iced', displayName: 'iced V60', source: 'M2' };
  const read = await next.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_iced' });
  assert.equal(read.sourceState, 'absent');
  assert.equal(read.currentReview?.editable, true);
  assert.equal(read.currentReview?.mode, 'iced');
  const wrongReader = await next.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(wrongReader.code, 'active_review_target_required');
  const proposal = await next.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_iced', intent: 'recipe_preview', change: null, servingDoseGrams: 25,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  assert.equal(proposal.artifact.before, null);
  assert.equal(proposal.artifact.after.coffeeGrams, 25);
  assert.equal(proposal.artifact.after.hotWaterGrams, 250, 'iced hot-water total scales with the retained draft ratio');
  assert.equal(proposal.artifact.after.iceGrams, 125, 'iced ice total scales with the retained draft ratio');
});

test('active review statuses and exact method identity fail closed', async () => {
  const recipe = generateV60IcedRecipe({}, { dose: 20 });
  const base = { type: 'recipe_proposal', id: 'review', coffeeId: 'coffee-1', slotKey: 'v60_iced', sourceState: 'absent', sourceHash: absentRecipeSourceHash('v60_iced'), before: null, after: recipe };
  for (const status of ['kept', 'undone', 'stale']) {
    const next = harness({ code: 'recipe_missing' }, 'Make it 25 grams instead', [{ ...base, status }]);
    next.context.methodBinding = { status: 'locked', slot: 'v60_iced', displayName: 'iced V60', source: 'M2' };
    const read = await next.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_iced' });
    assert.equal(read.currentReview, undefined, status);
    assert.equal(read.draft, undefined, status);
  }
  const wrongMethod = harness({ code: 'recipe_missing' }, 'Make it 25 grams instead', [{ ...base, status: 'proposed' }]);
  wrongMethod.context.methodBinding = { status: 'locked', slot: 'v60_hot', displayName: 'hot V60', source: 'M1' };
  const read = await wrongMethod.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_iced' });
  assert.equal(read.currentReview, undefined);
  assert.equal(read.draft, undefined);
});

test('runtime/provider follows the typed iced review context in two dispatches', async () => {
  const draftRecipe = generateV60IcedRecipe({}, { dose: 20 });
  const draft = {
    type: 'recipe_proposal', id: 'runtime-iced-review', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_iced',
    sourceState: 'absent', sourceHash: absentRecipeSourceHash('v60_iced'), before: null, after: draftRecipe,
  };
  const next = harness({ code: 'recipe_missing' }, 'Make it 25 grams instead', [draft]);
  next.context.methodBinding = { status: 'locked', slot: 'v60_iced', displayName: 'iced V60', source: 'M2' };
  const frames = [];
  let dispatches = 0;
  const result = await runRuphusTurn({ turnId: 'runtime-iced-review', context: next.context, userText: next.context.userText, tools: next.tools,
    emit: (frame) => frames.push(frame), provider: { runTurn: async (input) => {
      dispatches += 1;
      if (dispatches === 1) return { toolCalls: [{ callId: 'exact-iced', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'v60_iced' } }] };
      assert.equal(dispatches, 2);
      assert.equal(input.toolResult.results[0].result.currentReview.editable, true);
      return { toolCalls: [{ callId: 'dose-iced', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_iced', intent: 'recipe_preview', change: null, servingDoseGrams: 25, aidenProfile: null, experiment: null, explanation: null } }] };
    } } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(dispatches, 2);
  const card = frames.find((frame) => frame.type === 'artifact_ready')?.artifact;
  assert.equal(card?.after.coffeeGrams, 25);
  assert.equal(card?.after.hotWaterGrams, 250);
  assert.equal(card?.after.iceGrams, 125);
});

test('rebuilt context carries an absent iced Kalita 185 draft into a bounded grind edit', async () => {
  const first = harness({ code: 'recipe_missing' }, 'Make a new iced Kalita 185 recipe for Jar one with 25 grams.');
  const exact = await first.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_iced' });
  assert.equal(exact.sourceState, 'absent');
  const draftResult = await first.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'kalita_iced', intent: 'recipe_preview',
    change: null, servingDoseGrams: 25,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(draftResult.ok, true, JSON.stringify(draftResult));
  assert.equal(draftResult.artifact.after.kalitaSize, '185');

  const next = await buildRuphusContext({
    uid: 'owner', contextRef: { surface: 'direct', coffeeRef: 'coffee-1' }, userText: 'One click finer please.', conversation: [],
    evidenceByteCap: 8000, priorTechniqueProposals: [draftResult.artifact],
    readers: {
      listCoffees: async () => [{ id: 'coffee-1', name: 'Jar one', recipes: [] }],
      readSetup: async () => ({}),
    },
  });
  Object.defineProperty(next, '__ruphusPriorProposals', { value: [draftResult.artifact], enumerable: false, writable: true, configurable: true });
  assert.equal(next.methodBinding.displayName, 'iced Kalita 185');
  const rebuilt = createRuphusTools({
    uid: 'owner', context: next,
    readers: { readRecipe: async () => ({ code: 'recipe_missing', slotKey: 'kalita_iced' }) },
  });
  const coffeeRef = Object.entries(next.__ruphusRefs).find(([, coffeeId]) => coffeeId === 'coffee-1')?.[0];
  assert.ok(coffeeRef);
  const evidence = await rebuilt.call('read_coffee_evidence', { coffeeRef, slot: 'kalita_iced', windowDays: null });
  assert.equal(evidence.sourceState, 'absent');
  assert.equal(evidence.draft.recipe.kalitaSize, '185');
  const continuation = await rebuilt.call('propose_recipe_change', {
    coffeeRef, slot: 'kalita_iced', intent: 'recipe_preview',
    change: { control: 'grind', value: '5.2' }, servingDoseGrams: null,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(continuation.ok, true, JSON.stringify(continuation));
  assert.equal(continuation.artifact.after.kalitaSize, '185');
  assert.equal(continuation.artifact.after.mode, 'iced');
  assert.equal(continuation.artifact.after.sourceState, undefined, 'source lineage stays inside the artifact envelope');
});

test('rebuilt context carries an absent Switch 03 source draft into native-mL serving scaling', async () => {
  const first = harness(null, 'Try a Switch 03 technique for Jar one.');
  const options = await first.tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' });
  const selected = options.options.find((option) => option.executable);
  const draftResult = await first.tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: null,
    servingDoseGrams: null, aidenProfile: null,
    experiment: { kind: 'manual_source_technique', techniqueId: selected.id }, explanation: null,
  });
  assert.equal(draftResult.ok, true, JSON.stringify(draftResult));
  assert.equal(draftResult.artifact.after.variant, 'switch');
  assert.equal(draftResult.artifact.after.v60Size, '03');
  const sourceStages = draftResult.artifact.after.sourceProjection.stages;
  const next = await buildRuphusContext({
    uid: 'owner', contextRef: { surface: 'direct', coffeeRef: 'coffee-1' }, userText: 'Only 20 grams please.', conversation: [],
    evidenceByteCap: 8000, priorTechniqueProposals: [draftResult.artifact],
    readers: {
      listCoffees: async () => [{ id: 'coffee-1', name: 'Jar one', recipes: [] }],
      readSetup: async () => ({}),
    },
  });
  Object.defineProperty(next, '__ruphusPriorProposals', { value: [draftResult.artifact], enumerable: false, writable: true, configurable: true });
  assert.equal(next.methodBinding.displayName, 'hot Switch 03');
  const rebuilt = createRuphusTools({ uid: 'owner', context: next, readers: { readRecipe: async () => ({ code: 'recipe_missing', slotKey: 'v60_hot' }) } });
  const coffeeRef = Object.entries(next.__ruphusRefs).find(([, coffeeId]) => coffeeId === 'coffee-1')?.[0];
  const evidence = await rebuilt.call('read_coffee_evidence', { coffeeRef, slot: 'v60_hot', windowDays: null });
  assert.equal(evidence.draft.recipe.v60Size, '03');
  const continuation = await rebuilt.call('propose_recipe_change', {
    coffeeRef, slot: 'v60_hot', intent: 'recipe_preview', change: null, servingDoseGrams: 20,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(continuation.ok, true, JSON.stringify(continuation));
  assert.equal(continuation.artifact.after.variant, 'switch');
  assert.equal(continuation.artifact.after.v60Size, '03');
  assert.equal(continuation.artifact.after.sourceProjection.water.unit, 'mL');
  assert.equal(continuation.artifact.after.waterMilliliters, 300);
  assert.deepEqual(continuation.artifact.after.sourceProjection.stages.map((stage) => stage.valve), sourceStages.map((stage) => stage.valve));
  assert.deepEqual(continuation.artifact.after.sourceProjection.stages.map((stage) => stage.trigger), sourceStages.map((stage) => stage.trigger));
});
