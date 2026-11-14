import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools, isContextualTechniqueFollowupRequest } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { techniqueSelectionsFromSession } from '../api/ruphus-agent.js';
import { isTechniqueExplorationRequest } from '../src/lib/ruphus/conversationContract.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';

const recipe = () => generateV60Recipe({}, { dose: 20, grinder: 'fellow-ode-gen2' });
const contextFor = (userText) => ({
  rotationSnapshot: {
    coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['v60_hot'] }],
    refs: { c1: 'coffee-1' },
  },
  __ruphusRefs: { c1: 'coffee-1' },
  userText,
  conversation: [],
  sessionId: 'technique-conversation',
  proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
});

const toolsFor = (context, readRecipe = recipe) => createRuphusTools({
  uid: 'owner-1',
  context,
  readers: { readRecipe: async () => readRecipe() },
});

function optionFrom(toolResult) {
  return toolResult?.results?.find((item) => item.name === 'read_technique_options')?.result?.options?.[0] || null;
}

test('explicit named brewing approaches are actionable without the technique keyword', () => {
  assert.equal(isTechniqueExplorationRequest('Try full immersion for El Vergel with the Switch'), true);
  assert.equal(isTechniqueExplorationRequest('Use a hybrid approach for this coffee on the V60'), true);
  assert.equal(isTechniqueExplorationRequest('Try pulse pours with the Kalita'), true);
  assert.equal(isTechniqueExplorationRequest('How does full immersion work with the Switch?'), false);
  assert.equal(isTechniqueExplorationRequest('Compare hybrid and pulse pours for the V60'), false);
  assert.equal(isTechniqueExplorationRequest('Try full immersion for El Vergel'), false);
  assert.equal(isTechniqueExplorationRequest('I like full immersion with the Switch'), false);
  assert.equal(isTechniqueExplorationRequest("Don't try full immersion with the Switch"), false);
});

test('expanded and contracted recommendation questions prepare a same-turn card', async () => {
  const userText = 'What is an interesting different technique for jar one with the v60?';
  assert.equal(isTechniqueExplorationRequest(userText), true);
  assert.equal(isTechniqueExplorationRequest("What's an interesting different technique for jar one with the v60?"), true);
  const context = contextFor(userText);
  const tools = toolsFor(context);
  const frames = [];
  let providerCalls = 0;
  let selected;
  const result = await runRuphusTurn({
    turnId: 'technique-live-prompt-card', context, userText, tools, emit: (frame) => frames.push(frame),
    provider: { runTurn: async ({ toolResult }) => {
      providerCalls += 1;
      if (providerCalls === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      if (providerCalls === 2) {
        selected = optionFrom(toolResult);
        return { text: `Try ${selected.name} for a distinct pour cadence.`, toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: {
          coffeeRef: 'c1', slot: 'v60_hot', change: null,
          experiment: { kind: 'v60_technique', techniqueId: selected.id },
        } }] };
      }
      return { text: 'I can prepare one exact source-backed option after the technique is selected.' };
    } },
  });

  assert.equal(providerCalls, 2);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].techniqueExperiment.name, selected.name);
  assert.equal(frames.filter((frame) => frame.type === 'artifact_ready').length, 1);
});

test('explicit V60 exploration turns one exact structured selection into a native card in the same turn', async () => {
  const userText = 'What’s an interesting V60 technique for Jar #1?';
  assert.equal(isTechniqueExplorationRequest(userText), true);
  const context = contextFor(userText);
  const tools = toolsFor(context);
  const frames = [];
  let providerCalls = 0;
  let selected;
  const result = await runRuphusTurn({
    turnId: 'technique-prose-card', context, userText, tools, emit: (frame) => frames.push(frame),
    provider: { runTurn: async ({ toolResult }) => {
      providerCalls += 1;
      if (providerCalls === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      selected = optionFrom(toolResult);
      return {
        text: `Try ${selected.name}; it uses a distinct pour cadence for this brew.`,
        toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: {
          coffeeRef: 'c1', slot: 'v60_hot', change: null,
          experiment: { kind: 'v60_technique', techniqueId: selected.id },
        } }],
      };
    } },
  });

  assert.equal(providerCalls, 2);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.toolCalls, 2, 'the synthetic proposal is counted as a bounded tool call');
  assert.deepEqual(result.toolNames, ['read_technique_options', 'propose_recipe_change']);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].techniqueExperiment.name, selected.name);
  assert.equal(result.artifacts[0].after.techniqueLabel, selected.name);
  assert.equal(frames.filter((frame) => frame.type === 'artifact_ready').length, 1);
  assert.equal(result.grader.ordinary.some((item) => item.code === 'C9_PROPOSAL_MISSING'), false);
  assert.doesNotMatch(result.text, /ask(?:ing)? for another yes/i);
  assert.equal(context.proposalState.techniqueReady.coffeeRef, 'c1');
  assert.equal(context.proposalState.previewReady, true);
});

test('a bare another-one follow-up is actionable only for a delivered same-target technique card', async () => {
  const firstText = 'What is an interesting different technique for jar one with the v60?';
  const firstContext = contextFor(firstText);
  const firstTools = toolsFor(firstContext);
  let firstCalls = 0;
  let firstOption;
  const first = await runRuphusTurn({
    turnId: 'technique-contextual-first', context: firstContext, userText: firstText, tools: firstTools,
    provider: { runTurn: async ({ toolResult }) => {
      firstCalls += 1;
      if (firstCalls === 1) return { toolCalls: [{ callId: 'first-options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      firstOption = optionFrom(toolResult);
      return { toolCalls: [{ callId: 'first-proposal', name: 'propose_recipe_change', args: {
        coffeeRef: 'c1', slot: 'v60_hot', change: null, experiment: { kind: 'v60_technique', techniqueId: firstOption.id },
      } }] };
    } },
  });
  assert.equal(first.ok, true, first.code);
  const firstArtifact = first.artifacts[0];

  const followupText = 'Show me another one';
  const followupContext = contextFor(followupText);
  Object.defineProperty(followupContext, '__ruphusTechniqueSelections', {
    value: techniqueSelectionsFromSession({ boundaryIndex: 0, messages: [{ artifacts: [firstArtifact] }] }, { c1: 'coffee-1' }),
    enumerable: false,
  });
  assert.equal(isTechniqueExplorationRequest(followupText), false, 'the global classifier stays conservative');
  assert.equal(isContextualTechniqueFollowupRequest(followupText, followupContext, { coffeeRef: 'c1', slot: 'v60_hot' }), true);

  const followupTools = toolsFor(followupContext);
  let followupCalls = 0;
  let nextOption;
  const followup = await runRuphusTurn({
    turnId: 'technique-contextual-followup', context: followupContext, userText: followupText, tools: followupTools,
    provider: { runTurn: async ({ toolResult }) => {
      followupCalls += 1;
      if (followupCalls === 1) return { toolCalls: [{ callId: 'next-options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      if (followupCalls === 2) {
        nextOption = optionFrom(toolResult);
        assert.notEqual(nextOption.sourceId, firstArtifact.techniqueExperiment.sourceId);
        return { toolCalls: [{ callId: 'next-recipe', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      }
      return { toolCalls: [{ callId: 'next-proposal', name: 'propose_recipe_change', args: {
        coffeeRef: 'c1', slot: 'v60_hot', change: null, experiment: { kind: 'v60_technique', techniqueId: nextOption.id },
      } }] };
    } },
  });

  assert.equal(followupCalls, 3);
  assert.equal(followup.ok, true, followup.code);
  assert.deepEqual(followup.toolNames, ['read_technique_options', 'read_recipe', 'propose_recipe_change']);
  assert.equal(followup.artifacts.length, 1);
  assert.equal(followup.artifacts[0].techniqueExperiment.sourceId, nextOption.sourceId);
});

test('bare another-one intent does not cross comparison, new-chat, or coffee boundaries', () => {
  const followupText = 'Show me another one';
  const artifact = {
    type: 'recipe_proposal', id: 'proposal-delivered', coffeeId: 'coffee-1', slotKey: 'v60_hot',
    techniqueExperiment: { kind: 'v60_technique', techniqueId: 'kasuya-coarse-pulses', familyId: 'kasuya-46', sourceId: 'kasuya-46-v1' },
  };
  const context = contextFor(followupText);
  Object.defineProperty(context, '__ruphusTechniqueSelections', {
    value: techniqueSelectionsFromSession({ messages: [{ artifacts: [artifact] }] }, { c1: 'coffee-1' }),
    enumerable: false,
  });

  assert.equal(isContextualTechniqueFollowupRequest('Compare that with another one', context, { coffeeRef: 'c1', slot: 'v60_hot' }), false);
  assert.equal(isContextualTechniqueFollowupRequest(followupText, context, { coffeeRef: 'c2', slot: 'v60_hot' }), false);
  const newChat = contextFor(followupText);
  Object.defineProperty(newChat, '__ruphusTechniqueSelections', {
    value: techniqueSelectionsFromSession({ boundaryIndex: 1, messages: [{ artifacts: [artifact] }, { role: 'user', text: 'new chat' }] }, { c1: 'coffee-1' }),
    enumerable: false,
  });
  assert.equal(isContextualTechniqueFollowupRequest(followupText, newChat, { coffeeRef: 'c1', slot: 'v60_hot' }), false);
});

test('provider prose cannot select a technique by negation or comparison', async () => {
  const userText = 'Try a different V60 technique for Jar #1.';
  const context = contextFor(userText);
  const tools = toolsFor(context);
  let providerCalls = 0;
  const result = await runRuphusTurn({
    turnId: 'technique-untrusted-prose', context, userText, tools,
    provider: { runTurn: async ({ toolResult }) => {
      providerCalls += 1;
      if (providerCalls === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      const options = toolResult?.results?.find((item) => item.name === 'read_technique_options')?.result?.options || [];
      const first = options[0]?.name || 'the first method';
      const second = options[1]?.name || 'the second method';
      return providerCalls === 2
        ? { text: `Don't try ${first}; compare ${first} with ${second} before choosing.` }
        : { text: `I can compare ${first} and ${second}, but I still need one exact selection.` };
    } },
  });

  assert.equal(providerCalls, 3);
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 0);
  assert.match(result.text, /couldn’t prepare its review recipe safely/i);
  assert.equal(context.proposalState.proposalIssued, false);
});

test('information-only technique questions never mint executable readiness or a card', async () => {
  const userText = 'How does the Kasuya 4:6 technique work?';
  assert.equal(isTechniqueExplorationRequest(userText), false);
  assert.equal(isTechniqueExplorationRequest('Tell me about an interesting V60 technique.'), false);
  assert.equal(isTechniqueExplorationRequest('Compare the different V60 techniques.'), false);
  const context = contextFor(userText);
  const tools = toolsFor(context);
  let providerCalls = 0;
  const result = await runRuphusTurn({
    turnId: 'technique-info-only', context, userText, tools,
    provider: { runTurn: async ({ toolResult }) => {
      providerCalls += 1;
      if (providerCalls === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      return { text: `Kasuya’s 4:6 method uses five pulses; here are the source-backed alternatives I can discuss.` };
    } },
  });

  assert.equal(providerCalls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 0);
  assert.equal(context.proposalState.techniqueReady, undefined);
  assert.equal(context.proposalState.previewReady, undefined);
  assert.equal(result.grader.ordinary.some((item) => item.code === 'C9_PROPOSAL_MISSING'), false);
});

test('prose without an exact trusted option gets one bounded continuation and honest recovery', async () => {
  const userText = 'Show me a different V60 technique for Jar #1.';
  const context = contextFor(userText);
  const tools = toolsFor(context);
  let providerCalls = 0;
  const result = await runRuphusTurn({
    turnId: 'technique-recovery', context, userText, tools,
    provider: { runTurn: async () => {
      providerCalls += 1;
      if (providerCalls === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      return { text: providerCalls === 2 ? 'Several source-backed methods could work here.' : 'A method could be prepared after you choose one.' };
    } },
  });

  assert.equal(providerCalls, 3);
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 0);
  assert.match(result.text, /couldn’t prepare its review recipe safely/i);
  assert.doesNotMatch(result.text, /\bprepared\b|ready to review/i);
});

test('bounded continuation can still complete the selected option as a native card', async () => {
  const userText = 'Show me another V60 technique for Jar #1.';
  const context = contextFor(userText);
  const tools = toolsFor(context);
  let providerCalls = 0;
  let selectedId;
  const result = await runRuphusTurn({
    turnId: 'technique-continuation-card', context, userText, tools,
    provider: { runTurn: async ({ toolResult }) => {
      providerCalls += 1;
      if (providerCalls === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      if (providerCalls === 2) return { text: 'I would compare the eligible source-backed methods first.' };
      const option = optionFrom(toolResult);
      selectedId = option.id;
      return { toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', change: null, experiment: { kind: 'v60_technique', techniqueId: option.id } } }] };
    } },
  });

  assert.equal(providerCalls, 3);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].techniqueExperiment.techniqueId, selectedId);
});

test('cancellation while preparing a technique card emits no late artifact', async () => {
  const userText = 'Try a different V60 technique for Jar #1.';
  const context = contextFor(userText);
  const baseTools = toolsFor(context);
  const originalCall = baseTools.call;
  let proposalStarted;
  const proposalStartedPromise = new Promise((resolve) => { proposalStarted = resolve; });
  let cancelledArtifact;
  const controller = new AbortController();
  const tools = { ...baseTools, call: async (name, args) => {
    if (name === 'propose_recipe_change') {
      proposalStarted();
      const result = await originalCall(name, args);
      cancelledArtifact = result.artifact;
      controller.abort();
      return result;
    }
    return originalCall(name, args);
  } };
  const frames = [];
  let providerCalls = 0;
  const run = runRuphusTurn({
    turnId: 'technique-cancelled', context, userText, tools, signal: controller.signal, emit: (frame) => frames.push(frame),
    provider: { runTurn: async () => {
      providerCalls += 1;
      if (providerCalls === 1) return { toolCalls: [{ callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      return {
        text: 'Try the selected source-backed technique for a five-pulse alternative.',
        toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: {
          coffeeRef: 'c1', slot: 'v60_hot', change: null,
          experiment: { kind: 'v60_technique', techniqueId: 'kasuya-46-v1' },
        } }],
      };
    } },
  });
  await proposalStartedPromise;
  const result = await run;

  assert.equal(result.ok, false);
  assert.equal(result.code, 'turn_cancelled');
  assert.equal(result.artifacts.length, 0);
  assert.equal(frames.some((frame) => frame.type === 'artifact_ready'), false);
  assert.equal(frames.at(-1).type, 'turn_interrupted');
  assert.doesNotMatch(frames.filter((frame) => frame.type === 'text_delta').map((frame) => frame.text).join(' '), /\bprepared\b|ready to review/i);
  assert.equal(context.proposalState.proposalIssued, false, 'cancellation leaves the proposal eligible for retry');
  assert.ok(cancelledArtifact, 'the cancelled tool did produce a deterministic candidate internally');

  let retryCalls = 0;
  const retry = await runRuphusTurn({
    turnId: 'technique-cancelled-retry', context, userText, tools: toolsFor(context),
    provider: { runTurn: async ({ toolResult }) => {
      retryCalls += 1;
      if (retryCalls === 1) return { toolCalls: [{ callId: 'retry-options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      const options = toolResult?.results?.find((item) => item.name === 'read_technique_options')?.result?.options || [];
      const option = options.find((item) => [item.id, item.familyId, item.sourceId].includes(cancelledArtifact.techniqueExperiment.techniqueId)) || optionFrom(toolResult);
      return { toolCalls: [{ callId: 'retry-proposal', name: 'propose_recipe_change', args: {
        coffeeRef: 'c1', slot: 'v60_hot', change: null,
        experiment: { kind: 'v60_technique', techniqueId: option.id },
      } }] };
    } },
  });
  assert.equal(retry.ok, true, retry.code);
  assert.equal(retry.artifacts.length, 1);
  assert.deepEqual(retry.artifacts[0], cancelledArtifact, 'retry reproduces the same deterministic card');
  assert.equal(retry.artifacts[0].techniqueExperiment.kind, 'v60_technique');
});

test('invalid technique selection is a helpful option error, not a network failure', async () => {
  const userText = 'Try a different V60 technique for Jar #1.';
  const context = contextFor(userText);
  const tools = toolsFor(context);
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  const invalid = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', change: null,
    experiment: { kind: 'v60_technique', techniqueId: 'made-up-technique' },
  });
  assert.equal(options.actionable, true);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'technique_option_required');
  assert.match(invalid.message, /supported techniques/i);
});

test('a prepared claim without an artifact is replaced by honest recovery', async () => {
  const userText = 'Show me a different V60 technique.';
  const context = contextFor(userText);
  const tools = toolsFor(context);
  const frames = [];
  const result = await runRuphusTurn({
    turnId: 'technique-unbacked-prepared', context, userText, tools,
    emit: frame => frames.push(frame),
    provider: { runTurn: async () => ({ text: 'Prepared for review.' }) },
  });
  assert.equal(result.ok, false, 'an unfulfilled recipe request is not a successful turn');
  assert.equal(result.artifacts.length, 0);
  assert.match(result.text, /haven’t prepared a recipe card yet/i);
  assert.match(result.text, /saved recipe is unchanged/i);
  assert.equal(frames.some(frame => frame.type === 'turn_completed'), false);
  assert.equal(frames.at(-1).type, 'turn_interrupted');
});
