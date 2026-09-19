import assert from 'node:assert/strict';
import test from 'node:test';

import { proposalHandoff, runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { absentRecipeSourceHash } from '../src/lib/ruphus/recipeSourceState.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { createAgentFrameParser, resolveAgentStreamResult } from '../src/lib/ruphus/streamAgent.js';

const envelope = (text, intent = 'information', state = 'answered', coffeeRef = null, slot = null) => ({ intent, state, text, coffeeRef, slot });
const contextFor = (extra = {}) => ({
  userText: 'Tell me about this coffee.',
  evidenceHash: 'evidence-hash',
  proposalState: {},
  __ruphusRefs: { c1: 'bean-1' },
  ...extra,
});

test('source quantity handoffs preserve native units and never stringify structured values', () => {
  for (const unit of ['F', 'C']) {
    const before = unit === 'F' ? 200 : 93;
    const after = unit === 'F' ? 205 : 96;
    const text = proposalHandoff({ changedPaths: ['temperature'], before: { temperature: { value: before, unit } }, after: { temperature: { value: after, unit } } });
    assert.ok(text.includes(`${before}°${unit} to ${after}°${unit}`));
    assert.doesNotMatch(text, /\[object Object\]/);
  }
  const range = proposalHandoff({ changedPaths: ['temperature'], before: { temperature: { value: { min: 195, max: 205 }, unit: 'F' } }, after: { temperature: { value: 205, unit: 'F' } } });
  assert.match(range, /one recipe change.*review/);
  assert.doesNotMatch(range, /\[object Object\]/);
});

test('named technique handoff uses one rationale instead of repeating the source difference', () => {
  const techniqueExperiment = { kind: 'manual_source_technique', name: 'Switch bloom hybrid', differences: ['An open bloom is followed by immersion.'] };
  const explained = proposalHandoff({ techniqueExperiment, explanation: 'The open bloom then closed steep gives you a different experiment.' });
  assert.match(explained, /Try Switch bloom hybrid/);
  assert.match(explained, /open bloom then closed steep/);
  assert.doesNotMatch(explained, /An open bloom is followed/);
  assert.match(proposalHandoff({ techniqueExperiment }), /An open bloom is followed by immersion/);
});

test('absent manual handoffs describe drafts without dereferencing a nonexistent saved recipe', () => {
  for (const slotKey of ['v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced']) {
    const text = proposalHandoff({ slotKey, sourceState: 'absent', before: null,
      after: { ratio: '1:15', coffeeGrams: 20, waterGrams: 300 }, changedPaths: ['ratio'] });
    assert.match(text, /draft.*review/i);
    assert.match(text, /nothing has been saved/i);
    assert.doesNotMatch(text, /undefined|null|instead of|from .* to|→/);
  }
});

test('first Aiden handoff describes a new draft without inventing a prior ratio', () => {
  const text = proposalHandoff({ slotKey: 'aiden', sourceState: 'absent', before: null, after: { ratio: 17 } });
  assert.match(text, /new Aiden profile/i);
  assert.doesNotMatch(text, /undefined|null|adjusted|→/);
  assert.match(text, /nothing.*saved/i);
});

test('actionable recipe questions cannot end as prose-only answers', async () => {
  const context = contextFor({ userText: 'Can you give me a V60 recipe for Jar one?', rotationSnapshot: { setup: { grinder: 'fellow-ode-gen2' } },
    proposalState: { target: { coffeeRef: 'c1', slot: 'v60_hot' }, previewReady: true, diagnosisReady: true, userAgreed: true },
    __ruphusResolvedTargets: new Map([['c1:v60_hot', { coffeeRef: 'c1', coffeeId: 'bean-1', sourceHash: 'source-1', before: { coffeeGrams: 20, waterGrams: 320 }, sourceState: 'present' }]]) });
  const frames = [];
  let providerCalls = 0;
  const result = await runRuphusTurn({ turnId: 'recipe-card-required', context, userText: context.userText,
    emit: frame => frames.push(frame),
    provider: { runTurn: async input => {
      providerCalls += 1;
      if (providerCalls === 1) return { text: 'Try a pulse recipe with a coarse grind.', envelope: envelope('Try a pulse recipe with a coarse grind.', 'recipe_preview', 'answered', 'c1', 'v60_hot'), toolCalls: [] };
      assert.equal(input.regeneration, true);
      assert.match(input.correctiveInstruction, /matching review card for this turn/i);
      return { text: 'Here is the recipe to review.', envelope: envelope('Here is the recipe to review.', 'recipe_preview', 'answered', 'c1', 'v60_hot'), toolCalls: [{ callId: 'proposal-1', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 16 } } }] };
    } },
    tools: { names: ['propose_recipe_change'], definitions: [{ name: 'propose_recipe_change' }], call: async () => ({
      ok: true,
      artifact: { type: 'recipe_proposal', id: 'proposal-1', coffeeId: 'bean-1', coffeeRef: 'c1', slotKey: 'v60_hot', sourceState: 'present', before: { coffeeGrams: 20, waterGrams: 320 }, after: { coffeeGrams: 20, waterGrams: 320, ratio: '1:16' }, actions: [],
      },
    }) },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(providerCalls, 2);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
});

test('information requests do not inherit recipe intent from action words or old readiness', async () => {
  for (const userText of ['Can you suggest coffee storage tips?', 'Show me why different techniques change flavor.', 'Washed versus natural: what should I expect?']) {
    const context = contextFor({ userText, proposalState: { previewReady: true, target: { coffeeRef: 'c1', slot: 'v60_hot' } } });
    let calls = 0;
    const result = await runRuphusTurn({ turnId: 'information-only', context, userText,
      provider: { runTurn: async () => { calls++; return { text: 'Storage, processing, and pouring affect different parts of the cup.', envelope: envelope('Storage, processing, and pouring affect different parts of the cup.') }; } },
      tools: { names: ['propose_recipe_change'], definitions: [{ name: 'propose_recipe_change' }], call: async () => { throw Error('Information must not force a recipe'); } },
    });
    assert.equal(result.ok, true, result.code);
    assert.equal(calls, 1);
    assert.equal(result.artifacts.length, 0);
  }
});

test('water quantities remain water controls rather than being rewritten as serving dose', async () => {
  const context = contextFor({ userText: 'Use 320g of water.', proposalState: { previewReady: true, target: { coffeeRef: 'c1', slot: 'v60_hot' } } });
  const args = { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'water', value: 320 }, servingDoseGrams: null };
  context.__ruphusResolvedTargets = new Map([['c1:v60_hot', { coffeeRef: 'c1', coffeeId: 'bean-1', sourceHash: 'source-1' }]]);
  const result = await runRuphusTurn({ turnId: 'water-not-dose', context, userText: context.userText,
    provider: { runTurn: async () => ({ toolCalls: [{ callId: 'water', name: 'propose_recipe_change', args }] }) },
    tools: { names: ['propose_recipe_change'], definitions: [], call: async (_name, actual) => {
      assert.deepEqual(actual, args);
      return { ok: true, artifact: { type: 'recipe_proposal', id: 'water', coffeeId: 'bean-1', slotKey: 'v60_hot', before: { coffeeGrams: 20, waterGrams: 300 }, after: { coffeeGrams: 20, waterGrams: 320 } } };
    } },
  });
  assert.equal(result.ok, true, result.code);
});

test('micron and temperature numbers do not trigger an Ode-label correction', async () => {
  for (const text of ['The source grind is about 550 microns.', 'Keep the grind at 6 and raise the temperature to 96°C.']) {
    let calls = 0;
    const context = contextFor({ rotationSnapshot: { setup: { grinder: 'fellow-ode-gen2' } } });
    const result = await runRuphusTurn({ turnId: 'grind-units', context, userText: 'Explain those values.',
      provider: { runTurn: async () => { calls++; return { text, envelope: envelope(text), toolCalls: [] }; } },
      tools: { names: [], definitions: [], call: async () => { throw Error('No tool needed'); } },
    });
    assert.equal(result.ok, true, result.code);
    assert.equal(calls, 1);
  }
});

test('successful first Aiden proposal after JIT read does not request another draft', async () => {
  const context = contextFor({ proposalState: {} });
  let calls = 0;
  const result = await runRuphusTurn({ turnId: 'first-aiden-once', context, userText: 'Make me an Aiden recipe.',
    provider: { runTurn: async () => { calls++; return { toolCalls: [{ callId: 'aiden', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', aidenProfile: { ratio: 16 } } }] }; } },
    tools: { names: ['read_recipe', 'propose_recipe_change'], definitions: [{ name: 'propose_recipe_change' }], call: async (name) => {
      if (name === 'read_recipe') {
        context.proposalState.previewReady = true;
        context.proposalState.target = { coffeeRef: 'c1', slot: 'aiden' };
        context.__ruphusResolvedTargets = new Map([['c1:aiden', { coffeeRef: 'c1', coffeeId: 'bean-1', sourceHash: 'absent', sourceState: 'absent', before: null }]]);
        return { ok: true, slot: 'aiden', recipe: null, sourceState: 'absent' };
      }
      return { ok: true, artifact: { type: 'recipe_proposal', id: 'aiden', coffeeId: 'bean-1', slotKey: 'aiden', sourceState: 'absent', before: null, after: { ratio: 16 } } };
    } },
  });
  assert.equal(result.ok, true, result.code);
  assert.equal(calls, 1);
  assert.equal(result.artifacts.length, 1);
});

test('invalid first Aiden draft gets one correction, with repeated failure explicitly unfulfilled', async () => {
  for (const repeatFailure of [false, true]) {
    const context = contextFor({
      userText: 'Please make an Aiden recipe for this coffee.',
      __ruphusResolvedTargets: new Map([['c1:aiden', { coffeeRef: 'c1', coffeeId: 'bean-1', sourceHash: 'absent', before: null, sourceState: 'absent' }]]),
      proposalState: { target: { coffeeRef: 'c1', slot: 'aiden' }, previewReady: true, proposalIssued: false },
    });
    let calls = 0;
    let proposals = 0;
    const result = await runRuphusTurn({ turnId: `aiden-correct-${repeatFailure}`, context, userText: context.userText,
      provider: { async runTurn(input) {
        calls += 1;
        if (calls > 1) assert.equal(input.regeneration, true);
        return { toolCalls: [{ callId: `draft-${calls}`, name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', aidenProfile: {} } }] };
      } },
      tools: { names: ['propose_recipe_change'], definitions: [{ name: 'propose_recipe_change' }], async call() {
        proposals += 1;
        return proposals === 1 || repeatFailure
          ? { ok: false, code: 'invalid_aiden_candidate', message: 'The draft needs matching pulse temperatures.' }
          : { ok: true, artifact: { type: 'recipe_proposal', id: 'first-aiden', coffeeId: 'bean-1', slotKey: 'aiden', sourceState: 'absent', before: null, after: { title: 'Aiden draft', ratio: 16 }, actions: [] } };
      } },
    });
    assert.equal(calls, 2);
    assert.equal(proposals, 2);
    assert.equal(result.ok, !repeatFailure);
    assert.equal(result.artifacts.length, repeatFailure ? 0 : 1);
    if (repeatFailure) assert.equal(result.code, 'invalid_aiden_candidate');
  }
});

function parseFrames(frames) {
  const parser = createAgentFrameParser();
  parser.push(frames.map((frame) => JSON.stringify(frame)).join('\n'));
  parser.flush();
  return frames;
}

test('parallel thrown reads emit one safe paired failure each before interruption', async () => {
  const frames = [];
  const provider = { runTurn: async () => ({ toolCalls: [
    { callId: 'read-a', name: 'read_coffee_evidence', args: {} },
    { callId: 'read-b', name: 'read_recipe', args: {} },
  ] }) };
  const tools = {
    names: ['read_coffee_evidence', 'read_recipe'], definitions: [],
    call: async (name) => {
      if (name === 'read_coffee_evidence') {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw Object.assign(new Error('secret firestore path should never leak'), { code: 'read_failed' });
      }
      return { ok: true, recipe: { status: 'available' } };
    },
  };
  const result = await runRuphusTurn({ turnId: 'u3-parallel', context: contextFor(), userText: 'Read both.', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'read_failed');
  const wire = JSON.stringify(frames);
  assert.doesNotMatch(wire, /secret firestore path/);
  const parsed = parseFrames(frames);
  const results = parsed.filter((frame) => frame.type === 'tool_result');
  assert.equal(results.length, 2);
  assert.deepEqual(results.find((frame) => frame.callId === 'read-a')?.result, { ok: false, code: 'read_failed', message: 'I couldn’t complete that safely. Your saved recipe is unchanged.' });
  assert.equal(parsed.at(-1).type, 'turn_interrupted');
});

test('parallel successful reads settle both tool results before the final response', async () => {
  const frames = [];
  const provider = { runTurn: async (input) => input?.toolResult
    ? { text: 'I checked both records.', envelope: envelope('I checked both records.', 'information', 'answered', null, null) }
    : { toolCalls: [
      { callId: 'read-a', name: 'read_coffee_evidence', args: {} },
      { callId: 'read-b', name: 'read_recipe', args: {} },
    ] } };
  const tools = {
    names: ['read_coffee_evidence', 'read_recipe'], definitions: [],
    call: async (name) => {
      if (name === 'read_coffee_evidence') await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, source: name };
    },
  };
  const result = await runRuphusTurn({ turnId: 'u3-parallel-ok', context: contextFor(), userText: 'Read both.', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true);
  const resultFrames = frames.filter((frame) => frame.type === 'tool_result');
  assert.deepEqual(resultFrames.map((frame) => frame.callId).sort(), ['read-a', 'read-b']);
  assert.equal(frames.at(-1).type, 'turn_completed');
});

test('recipe envelope without a matching current-turn card gets one bounded recovery', async () => {
  let calls = 0;
  const provider = { runTurn: async () => {
    calls += 1;
    return calls === 1
      ? { text: 'Here is the card.', envelope: envelope('Here is the card.', 'recipe_preview', 'answered', 'c1', 'v60_hot') }
      : { text: 'I need the exact saved recipe first.', envelope: envelope('I need the exact saved recipe first.', 'recipe_preview', 'blocked', null, null) };
  } };
  const frames = [];
  const result = await runRuphusTurn({ turnId: 'u3-recovery', context: contextFor(), userText: 'Make a recipe.', provider, tools: { names: [], definitions: [], call: async () => ({}) }, emit: (frame) => frames.push(frame) });
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'response_blocked');
  assert.equal(result.state, 'blocked');
  assert.equal(result.text, 'I need the exact saved recipe first.');
  assert.equal(frames.at(-1).type, 'turn_interrupted');
  assert.equal(frames.some((frame) => frame.type === 'turn_completed'), false);
});

test('repeated missing recipe artifact is a typed bounded failure, not turn_completed ok', async () => {
  let calls = 0;
  const provider = { runTurn: async () => {
    calls += 1;
    return { text: `Missing card ${calls}.`, envelope: envelope(`Missing card ${calls}.`, 'recipe_preview', 'answered', 'c1', 'v60_hot') };
  } };
  const frames = [];
  const result = await runRuphusTurn({ turnId: 'u3-exhausted', context: contextFor(), userText: 'Make a recipe.', provider, tools: { names: [], definitions: [], call: async () => ({}) }, emit: (frame) => frames.push(frame) });
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'recipe_artifact_required');
  assert.equal(frames.at(-1).type, 'turn_interrupted');
  assert.equal(frames.some((frame) => frame.type === 'turn_completed'), false);
});

test('clarification envelope is an explicit non-fulfillment state', async () => {
  const result = await runRuphusTurn({
    turnId: 'u3-clarification', context: contextFor(), userText: 'Which brewer?',
    provider: { runTurn: async () => ({ text: 'Which brewer made this cup?', envelope: envelope('Which brewer made this cup?', 'information', 'clarification', null, null) }) },
    tools: { names: [], definitions: [], call: async () => ({}) },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'clarification');
  assert.equal(result.intent, 'information');
  assert.equal(result.artifacts.length, 0);
});

test('answered recipe envelope requires positive coffee and brewer identity', async () => {
  let calls = 0;
  const provider = { runTurn: async () => {
    calls += 1;
    return calls === 1
      ? { text: 'A card is ready.', envelope: envelope('A card is ready.', 'recipe_preview', 'answered', null, null) }
      : { text: 'Which coffee and brewer should I use?', envelope: envelope('Which coffee and brewer should I use?', 'information', 'clarification', null, null) };
  } };
  const result = await runRuphusTurn({ turnId: 'u3-subject-required', context: contextFor(), userText: 'Make a recipe.', provider, tools: { names: [], definitions: [], call: async () => ({}) } });
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'clarification');
  assert.equal(result.artifacts.length, 0);
});

for (const userText of ['Only 20 grams please.', 'Can I brew that with 20g instead?', 'I have twenty grams left; resize this one.']) test(`typed Switch resize reads the exact draft: ${userText}`, async () => {
  const source = generateManualSourceTechniqueOption('hario-switch-03-matt-winton-hybrid-24-2022', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 24,
  }).recipe;
  const context = contextFor({
    userText,
    methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot Switch', source: 'M2' },
    proposalState: {},
  });
  Object.defineProperty(context, '__ruphusPriorProposals', { value: [{
    id: 'switch-draft', type: 'recipe_proposal', status: 'proposed', coffeeId: 'bean-1', slotKey: 'v60_hot',
    before: null, after: source, sourceState: 'absent', sourceHash: absentRecipeSourceHash('v60_hot'),
  }], enumerable: false });
  const calls = [];
  const provider = { runTurn: async () => ({ text: 'I’ll prepare that.', toolCalls: [
    { callId: 'premature-proposal', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: null, servingDoseGrams: 20 } },
  ] }) };
  const rawTools = createRuphusTools({
    uid: 'owner', context,
    readers: { readRecipe: async () => ({ code: 'recipe_missing' }) },
    proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });
  const tools = { ...rawTools, call: async (name, args) => { calls.push(name); return rawTools.call(name, args); } };
  const result = await runRuphusTurn({ turnId: 'u3-jit-read', context, userText: context.userText, provider, tools });
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(calls, ['read_recipe', 'propose_recipe_change']);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].after.variant, 'switch');
  assert.equal(result.artifacts[0].after.v60Size, '03');
  assert.equal(result.artifacts[0].after.waterMilliliters, 300);
  assert.equal(result.artifacts[0].after.ratio, source.ratio);
  assert.deepEqual(result.artifacts[0].after.sourceProjection.stages.map((stage) => stage.valve), source.sourceProjection.stages.map((stage) => stage.valve));
  assert.deepEqual(result.artifacts[0].after.sourceProjection.stages.map((stage) => stage.trigger), source.sourceProjection.stages.map((stage) => stage.trigger));
});

test('serving-dose follow-up infers a typed preview when provider omits intent', async () => {
  const context = contextFor({ userText: 'Only 20 grams please.', proposalState: {} });
  Object.defineProperty(context, '__ruphusRefs', { value: { c1: 'bean-1' }, enumerable: false, writable: true });
  const calls = [];
  const provider = { runTurn: async () => ({ toolCalls: [{
    callId: 'resize-without-intent', name: 'propose_recipe_change',
    args: { coffeeRef: 'c1', slot: 'v60_hot', change: null, servingDoseGrams: 20 },
  }] }) };
  const tools = {
    names: ['read_recipe', 'propose_recipe_change'], definitions: [],
    call: async (name, args) => {
      calls.push(name);
      if (name === 'read_recipe') {
        context.proposalState.target = { coffeeRef: args.coffeeRef, slot: args.slot };
        context.__ruphusResolvedTargets = new Map([[`${args.coffeeRef}:${args.slot}`, {
          coffeeRef: args.coffeeRef, coffeeId: 'bean-1', slotKey: args.slot, sourceHash: 'source-1',
        }]]);
        return { ok: true, coffeeRef: args.coffeeRef, slot: args.slot, recipe: { coffeeGrams: 20, waterGrams: 300 } };
      }
      return { ok: true, artifact: { type: 'recipe_proposal', id: 'resize', coffeeId: 'bean-1', slotKey: 'v60_hot', before: { coffeeGrams: 20, waterGrams: 300 }, after: { coffeeGrams: 20, waterGrams: 300 } } };
    },
  };
  const result = await runRuphusTurn({ turnId: 'u3-jit-omitted-intent', context, userText: context.userText, provider, tools });
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(calls, ['read_recipe', 'propose_recipe_change']);
  assert.equal(result.artifacts.length, 1);
});

test('typed serving resize retains its explicit dose instead of timing-blocking', async () => {
  const context = contextFor({ userText: 'Only 20 grams please.', proposalState: {}, methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot Switch 03', source: 'M2' } });
  Object.defineProperty(context, '__ruphusRefs', { value: { c1: 'bean-1' }, enumerable: false, writable: true });
  const calls = [];
  const provider = { runTurn: async () => ({ toolCalls: [{ callId: 'resize-technique', name: 'propose_recipe_change', args: {
    coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: null, servingDoseGrams: 20,
    experiment: null,
  } }] }) };
  const tools = { names: ['read_recipe', 'propose_recipe_change'], definitions: [], call: async (name, args) => {
    calls.push(name);
    if (name === 'read_recipe') {
      context.proposalState.target = { coffeeRef: args.coffeeRef, slot: args.slot };
      context.__ruphusResolvedTargets = new Map([[`${args.coffeeRef}:${args.slot}`, { coffeeRef: args.coffeeRef, coffeeId: 'bean-1', slotKey: args.slot, sourceHash: 'source-1' }]]);
      return { ok: true, coffeeRef: args.coffeeRef, slot: args.slot, recipe: { coffeeGrams: 24, waterGrams: 360 } };
    }
    assert.equal(args.experiment, null);
    assert.equal(args.intent, 'recipe_preview');
    return { ok: true, artifact: { type: 'recipe_proposal', id: 'resize', coffeeId: 'bean-1', slotKey: 'v60_hot', before: { coffeeGrams: 24, waterGrams: 360 }, after: { coffeeGrams: 20, waterGrams: 300 } } };
  } };
  const result = await runRuphusTurn({ turnId: 'u3-jit-stale-technique', context, userText: context.userText, provider, tools });
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(calls, ['read_recipe', 'propose_recipe_change']);
  assert.equal(result.artifacts.length, 1);
});

test('serving resize still fulfills after a preceding technique-options read', async () => {
  const context = contextFor({ userText: 'Only 20 grams please.', proposalState: {}, methodBinding: { status: 'locked', slot: 'v60_hot', displayName: 'hot Switch 03', source: 'M2' } });
  Object.defineProperty(context, '__ruphusRefs', { value: { c1: 'bean-1' }, enumerable: false, writable: true });
  let providerCalls = 0;
  const calls = [];
  const provider = { runTurn: async () => {
    providerCalls += 1;
    return providerCalls === 1
      ? { toolCalls: [{ callId: 'tech', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'information' } }] }
      : { toolCalls: [{ callId: 'resize', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: null, servingDoseGrams: 20, experiment: null } }] };
  } };
  const tools = { names: ['read_technique_options', 'read_recipe', 'propose_recipe_change'], definitions: [], call: async (name, args) => {
    calls.push({ name, args });
    if (name === 'read_technique_options') return { ok: true, actionable: false, options: [] };
    if (name === 'read_recipe') {
      context.proposalState.target = { coffeeRef: args.coffeeRef, slot: args.slot };
      context.__ruphusResolvedTargets = new Map([[`${args.coffeeRef}:${args.slot}`, { coffeeRef: args.coffeeRef, coffeeId: 'bean-1', slotKey: args.slot, sourceHash: 'source-1' }]]);
      return { ok: true, coffeeRef: args.coffeeRef, slot: args.slot, recipe: { coffeeGrams: 24, waterGrams: 360 } };
    }
    assert.equal(args.experiment, null);
    assert.equal(args.intent, 'recipe_preview');
    assert.equal(args.change, null);
    assert.equal(args.servingDoseGrams, 20);
    return { ok: true, artifact: { type: 'recipe_proposal', id: 'resize', coffeeId: 'bean-1', slotKey: 'v60_hot', before: { coffeeGrams: 24, waterGrams: 360 }, after: { coffeeGrams: 20, waterGrams: 300 } } };
  } };
  const result = await runRuphusTurn({ turnId: 'u3-jit-after-technique-read', context, userText: context.userText, provider, tools });
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifacts.length, 1);
  assert.deepEqual(calls.map(call => call.name), ['read_technique_options', 'read_recipe', 'propose_recipe_change']);
});

test('JIT read is paired with the original provider output during bounded proposal recovery', async () => {
  const context = contextFor({ userText: 'Make this ratio 1:16.', proposalState: {} });
  let providerCalls = 0;
  let proposalCalls = 0;
  const provider = { runTurn: async (input) => {
    providerCalls += 1;
    if (providerCalls > 1) {
      assert.ok(input.previous.outputItems.some((item) => item.call_id === 'jit-exact-recipe'));
      assert.ok(input.toolResult.results.some((item) => item.callId === 'jit-exact-recipe'));
    }
    return { toolCalls: [{ callId: `proposal-${providerCalls}`, name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 16 } } }] };
  } };
  const tools = {
    names: ['read_recipe', 'propose_recipe_change'], definitions: [],
    call: async (name, args) => {
      if (name === 'read_recipe') {
        context.proposalState.target = { coffeeRef: args.coffeeRef, slot: args.slot };
        context.__ruphusResolvedTargets = new Map([[`${args.coffeeRef}:${args.slot}`, { coffeeRef: args.coffeeRef, coffeeId: 'bean-1', slotKey: args.slot, sourceHash: 'source-1' }]]);
        return { ok: true, coffeeRef: args.coffeeRef, slot: args.slot, recipe: { coffeeGrams: 20, waterGrams: 300 } };
      }
      proposalCalls += 1;
      return proposalCalls === 1
        ? { ok: false, code: 'invalid_ratio_preview', message: 'bounded ratio check failed' }
        : { ok: true, proposal: { id: 'proposal-recovered' }, artifact: { type: 'recipe_proposal', id: 'proposal-recovered', coffeeId: 'bean-1', slotKey: 'v60_hot', before: { coffeeGrams: 20, waterGrams: 300 }, after: { coffeeGrams: 20, waterGrams: 320 } } };
    },
  };
  const result = await runRuphusTurn({ turnId: 'u3-jit-paired-recovery', context, userText: context.userText, provider, tools });
  assert.equal(result.ok, true, result.code);
  assert.equal(providerCalls, 2);
  assert.equal(proposalCalls, 2);
});

test('typed preview JIT read fails closed without dispatching proposal on unavailable or mismatched targets', async (t) => {
  for (const [label, readResult, extra] of [
    ['unavailable', { ok: false, code: 'recipe_unavailable' }, {}],
    ['invalid', { ok: false, code: 'recipe_invalid' }, {}],
    ['mismatch', { ok: true, coffeeRef: 'c2', slot: 'v60_hot', recipe: { coffeeGrams: 20 } }, {}],
    ['explicit-method-conflict', { ok: true, recipe: { coffeeGrams: 20 } }, { methodBinding: { status: 'locked', slot: 'kalita_iced', displayName: 'iced Kalita', source: 'M1' } }],
    ['read-budget', { ok: true, recipe: { coffeeGrams: 20 } }, { maxToolCalls: 1 }],
  ]) {
    await t.test(label, async () => {
      const context = contextFor({ userText: 'Only 20 grams please.', proposalState: {}, ...extra });
      const calls = [];
      let providerCalls = 0;
      const provider = { runTurn: async (input) => {
        providerCalls += 1;
        if (label === 'unavailable' && input?.toolResult) {
          assert.match(input.correctiveInstruction, /exact target|unavailable|invalid/i);
          assert.doesNotMatch(input.correctiveInstruction, /sensory question/i);
          assert.equal(input.toolResult.results.some((item) => item.result?.code === 'recipe_unavailable'), true);
        }
        return input?.toolResult
          ? { text: 'I could not safely prepare that change.', envelope: envelope('I could not safely prepare that change.', 'information', 'answered', null, null) }
          : { toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview', change: null, servingDoseGrams: 20 } }] };
      } };
      const tools = {
        names: ['read_recipe', 'propose_recipe_change'], definitions: [],
        call: async (name, args) => {
          calls.push(name);
          if (name === 'read_recipe') {
            if (readResult.ok && readResult.recipe && readResult.coffeeRef === undefined) {
              context.proposalState.target = { coffeeRef: args.coffeeRef, slot: args.slot };
              context.__ruphusResolvedTargets = new Map([[`${args.coffeeRef}:${args.slot}`, { coffeeRef: args.coffeeRef, coffeeId: 'bean-1', slotKey: args.slot, sourceHash: 'source-1' }]]);
            }
            return readResult;
          }
          throw new Error('proposal must not be dispatched after a failed JIT read');
        },
      };
      const result = await runRuphusTurn({ turnId: `u3-jit-${label}`, context, userText: context.userText, provider, tools, maxToolCalls: extra.maxToolCalls });
      assert.equal(calls.includes('propose_recipe_change'), false);
      assert.equal(result.artifacts.length, 0);
      if (label === 'read-budget' || label === 'explicit-method-conflict') assert.equal(calls.length, 0);
      else assert.deepEqual(calls, ['read_recipe']);
      assert.ok(providerCalls >= 1);
    });
  }
});

test('blocked provider text is sanitized before the terminal frame', async () => {
  const frames = [];
  const result = await runRuphusTurn({
    turnId: 'u3-blocked-redaction', context: contextFor(), userText: 'Make a recipe.',
    provider: { runTurn: async () => ({ text: '{"internal_debug":"unexpected provider draft"}', envelope: envelope('{"internal_debug":"unexpected provider draft"}', 'recipe_preview', 'blocked', null, null) }) },
    tools: { names: [], definitions: [], call: async () => ({}) }, emit: (frame) => frames.push(frame),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'response_blocked');
  assert.equal(result.text, 'I haven’t prepared a recipe card yet. Your saved recipe is unchanged.');
  assert.doesNotMatch(JSON.stringify(frames), /internal_debug|unexpected provider draft/);
});

test('information answer claiming a prepared recipe cannot become successful without a card', async () => {
  let calls = 0;
  const provider = { runTurn: async (input) => {
    calls += 1;
    if (calls === 2) {
      // The bounded correction must force the typed non-fulfillment states;
      // prose saying "no card" could itself trip the preparation claim.
      assert.match(input.correctiveInstruction, /typed clarification or blocked/i);
      assert.doesNotMatch(input.correctiveInstruction, /explain that no card was prepared/i);
      return { text: 'I haven’t prepared a recipe card yet. Your saved recipe is unchanged.', envelope: envelope('I haven’t prepared a recipe card yet. Your saved recipe is unchanged.', 'information', 'answered', null, null) };
    }
    return { text: 'Prepared: the recipe is ready to review.', envelope: envelope('Prepared: the recipe is ready to review.', 'information', 'answered', null, null) };
  } };
  const result = await runRuphusTurn({ turnId: 'u3-preparation-claim', context: contextFor(), userText: 'Tell me about this coffee.', provider, tools: { names: [], definitions: [], call: async () => ({}) } });
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'response_validation_failed');
  assert.equal(result.text, 'I haven’t prepared a recipe card yet. Your saved recipe is unchanged.');
});

test('answered preview rejects a card bound to the wrong coffee', async () => {
  let calls = 0;
  const provider = { runTurn: async () => {
    calls += 1;
    return {
      text: 'Here is the card.',
      envelope: envelope('Here is the card.', 'recipe_preview', 'answered', 'c2', 'v60_hot'),
      toolCalls: calls === 1 ? [{ callId: 'proposal', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', intent: 'recipe_preview' } }] : [],
    };
  } };
  const context = contextFor({
    __ruphusRefs: { c1: 'bean-1', c2: 'bean-2' },
    proposalState: { target: { coffeeRef: 'c1', slot: 'v60_hot' }, previewReady: true },
    __ruphusResolvedTargets: new Map([['c1:v60_hot', { coffeeRef: 'c1', coffeeId: 'bean-1', slotKey: 'v60_hot', sourceHash: 'source-1' }]]),
  });
  const frames = [];
  const result = await runRuphusTurn({
    turnId: 'u3-wrong-subject', context, userText: 'Make a recipe.', provider,
    tools: { names: ['propose_recipe_change'], definitions: [], call: async () => ({ ok: true, proposal: { id: 'p1' }, artifact: { type: 'recipe_proposal', coffeeId: 'bean-1', slotKey: 'v60_hot', id: 'p1' } }) },
    emit: (frame) => frames.push(frame),
  });
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'recipe_subject_mismatch');
  assert.equal(frames.some((frame) => frame.type === 'turn_completed'), false);
});

test('trial recovery action receipt is a valid current-turn recipe preview artifact', async () => {
  const provider = { runTurn: async () => ({
    text: 'Here is the trial card.',
    envelope: envelope('Here is the trial card.', 'recipe_preview', 'answered', 'c1', 'v60_hot'),
    toolCalls: [{ callId: 'trial', name: 'review_trial_recipe', args: { coffeeRef: 'c1', slot: 'v60_hot', trialRef: 'trial-1' } }],
  }) };
  const context = contextFor({ proposalState: { target: null } });
  const result = await runRuphusTurn({
    turnId: 'u3-trial-card', context, userText: 'Show me that trial recipe.', provider,
    tools: { names: ['review_trial_recipe'], definitions: [], call: async () => ({ ok: true, artifact: { type: 'action_receipt', mode: 'brew_once', coffeeId: 'bean-1', slotKey: 'v60_hot', promoteAvailable: true } }) },
  });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts[0].type, 'action_receipt');
  assert.equal(result.state, 'answered');
});

test('stream parser preserves a terminal provider category through stream-result recovery', () => {
  const turnId = 'u3-terminal-category';
  const frame = (type, fields = {}) => ({ version: 1, protocol: 'ruphus-agent-v3', type, turnId, ...fields });
  const parser = createAgentFrameParser();
  parser.push([
    frame('turn_accepted'),
    frame('context_loading'),
    frame('turn_interrupted', { code: 'provider_incomplete', message: 'safe' }),
  ].map((item) => JSON.stringify(item)).join('\n'));
  parser.flush();
  const result = resolveAgentStreamResult({ terminalType: parser.terminalType, terminalCode: parser.terminalCode, usageSeen: false });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'provider_incomplete');
  const missingTrailer = resolveAgentStreamResult({
    terminalType: parser.terminalType, terminalCode: parser.terminalCode,
    usageSeen: false, transportError: Object.assign(new Error('No usage trailer'), { code: 'stream_incomplete' }),
  });
  assert.equal(missingTrailer.error.code, 'provider_incomplete', 'missing usage must not erase a known terminal failure');
  const malformed = Object.assign(new Error('Malformed stream'), { code: 'malformed_stream' });
  assert.equal(resolveAgentStreamResult({ terminalType: parser.terminalType, terminalCode: parser.terminalCode, transportError: malformed }).error, malformed);
});

test('provider dispatch stays within the configured bounded loop', async () => {
  let calls = 0;
  const provider = { runTurn: async () => {
    calls += 1;
    return calls < 3
      ? { toolCalls: [{ callId: `read-${calls}`, name: 'read_recipe', args: {} }] }
      : { text: 'I checked the available coffee information.', envelope: envelope('I checked the available coffee information.', 'information', 'answered', null, null) };
  } };
  const result = await runRuphusTurn({
    turnId: 'u3-provider-bound', context: contextFor(), userText: 'Tell me about it.', provider,
    maxToolRounds: 1,
    tools: { names: ['read_recipe'], definitions: [], call: async () => ({ ok: true }) },
  });
  assert.equal(calls, 3, 'one initial call + one configured read round + one bounded prose recovery');
  assert.equal(result.ok, true);
});
