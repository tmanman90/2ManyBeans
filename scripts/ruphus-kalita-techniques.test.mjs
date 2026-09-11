import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { recentProposalReviews } from '../src/lib/ruphus/proposalContinuity.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { techniqueSelectionsFromSession } from '../api/ruphus-agent.js';

const refs = { c1: 'coffee-1' };

function contextFor({ userText, recipe, selections = null, proposalReviews = [], sessionId = 'kalita-test' }) {
  const context = {
    rotationSnapshot: {
      coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['kalita_hot'] }],
      refs,
      setup: { grinder: 'fellow-ode-gen2' },
    },
    __ruphusRefs: refs,
    userText,
    conversation: [],
    sessionId,
    proposalReviews,
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  if (selections instanceof Map) {
    Object.defineProperty(context, '__ruphusTechniqueSelections', {
      value: selections,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
  return context;
}

function toolsFor(context, recipe) {
  return createRuphusTools({
    uid: 'owner-1',
    context,
    readers: { readRecipe: async () => recipe },
  });
}

function readDefinition(tools, name) {
  return tools.definitions.find((definition) => definition.name === name);
}

async function runSelectedTechnique({ recipe, userText, sourceId, selections = null, proposalReviews = [], sessionId }) {
  const context = contextFor({ userText, recipe, selections, proposalReviews, sessionId });
  const tools = toolsFor(context, recipe);
  const frames = [];
  let providerCalls = 0;
  let selected;
  const result = await runRuphusTurn({
    turnId: [sessionId || 'kalita', 'turn'].join('-'),
    context,
    userText,
    tools,
    emit: (frame) => frames.push(frame),
    provider: {
      runTurn: async ({ toolResult }) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            toolCalls: [{
              callId: 'kalita-options',
              name: 'read_technique_options',
              args: { coffeeRef: 'c1', slot: 'kalita_hot' },
            }],
          };
        }
        const read = toolResult?.results?.find((item) => item.name === 'read_technique_options')?.result;
        selected = read?.options?.find((option) => option.sourceId === sourceId)
          || read?.options?.find((option) => option.executable === true);
        assert.ok(selected, 'trusted reader returned ' + (sourceId || 'an executable Kalita source'));
        return {
          toolCalls: [{
            callId: 'kalita-proposal',
            name: 'propose_recipe_change',
            args: {
              coffeeRef: 'c1',
              slot: 'kalita_hot',
              change: null,
              experiment: { kind: 'manual_source_technique', techniqueId: selected.sourceId },
            },
          }],
        };
      },
    },
  });
  return { context, tools, result, frames, selected, providerCalls };
}

test('Kalita 155 route exposes exact-size source options through the provider schema and native review card', async () => {
  const recipe = generateKalitaRecipe({}, { dose: 14, size: '155' });
  const userText = 'Show me a different Kalita technique for the 155.';
  const context = contextFor({ userText, recipe });
  const tools = toolsFor(context, recipe);
  const readSchema = readDefinition(tools, 'read_technique_options');
  const proposalSchema = readDefinition(tools, 'propose_recipe_change');

  assert.deepEqual(readSchema.parameters.properties.slot.enum, ['v60_hot', 'kalita_hot']);
  assert.ok(proposalSchema.parameters.properties.experiment.anyOf, 'proposal schema keeps the nullable experiment envelope');
  const experimentSchema = proposalSchema.parameters.properties.experiment.anyOf
    .find((schema) => schema.type === 'object');
  assert.deepEqual(experimentSchema.properties.kind.anyOf[0].enum, ['v60_technique', 'manual_source_technique']);

  const read = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(read.ok, true);
  assert.equal(read.sourceOptions, true);
  assert.ok(read.options.length > 0);
  assert.ok(read.options.every((option) => option.sourceConfiguration.size === '155'));
  assert.ok(read.options.every((option) => option.sourceConfiguration.filter === 'wave-155'));
  assert.equal(read.options.some((option) => option.sourceConfiguration.size === '185'), false);
  const exactDose = read.options.find((option) => option.executable === true);
  assert.equal(exactDose.targetDoseGrams, 14, 'a requested dose is not silently promoted to a generic serving floor');
  assert.match(read.options.find((option) => option.sourceId === 'foundation-wave-155').differences[0], /one gradual main pour/i);
  assert.match(read.options.find((option) => option.sourceId === 'art-of-brew-wave-155-pulse-2024').differences[0], /staged pulse pours rather than one main pour/i);

  const run = await runSelectedTechnique({
    recipe,
    userText,
    sourceId: 'foundation-wave-155',
    sessionId: 'kalita-155',
  });
  assert.equal(run.providerCalls, 2);
  assert.equal(run.result.ok, true, run.result.code);
  assert.equal(run.result.artifacts.length, 1);
  const artifact = run.result.artifacts[0];
  assert.equal(artifact.techniqueExperiment.kind, 'manual_source_technique');
  assert.equal(artifact.techniqueExperiment.sourceId, 'foundation-wave-155');
  assert.equal(artifact.after.device, 'kalita');
  assert.equal(artifact.after.kalitaSize, '155');
  assert.equal(artifact.after.coffeeGrams, 14);
  assert.equal(artifact.after.sourceNativeWaterUnit, 'g');
  assert.equal(artifact.after.waterMilliliters, undefined);
  assert.equal(artifact.after.sourceProjection.sourceConfiguration.size, '155');
  assert.equal(artifact.after.sourceProjection.sourceId, 'foundation-wave-155');
  assert.ok(artifact.after.stages.length >= 2);
  assert.ok(artifact.after.stages.every((stage) => stage.trigger));
  assert.equal(run.result.text, `Try ${run.selected.name}. A short bloom is followed by one gradual main pour to the final water target. Here’s the recipe to review.`);
  assert.equal(run.frames.filter((frame) => frame.type === 'artifact_ready').length, 1);
});

test('Kalita 185 route preserves the 185 hardware boundary and selects a named source schedule', async () => {
  const recipe = generateKalitaRecipe({}, { dose: 25, size: '185' });
  const userText = 'Try a different Kalita technique for the 185.';
  const context = contextFor({ userText, recipe });
  const tools = toolsFor(context, recipe);
  const read = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });

  assert.equal(read.ok, true);
  assert.ok(read.options.length > 0);
  assert.ok(read.options.every((option) => option.sourceConfiguration.size === '185'));
  assert.equal(read.options.some((option) => option.sourceConfiguration.size === '155'), false);
  assert.ok(read.options.some((option) => option.sourceId === 'onyx-monarch-wave-185'));

  const run = await runSelectedTechnique({
    recipe,
    userText,
    sourceId: 'onyx-monarch-wave-185',
    sessionId: 'kalita-185',
  });
  assert.equal(run.result.ok, true, run.result.code);
  const artifact = run.result.artifacts[0];
  assert.equal(artifact.techniqueExperiment.sourceId, 'onyx-monarch-wave-185');
  assert.equal(artifact.after.device, 'kalita');
  assert.equal(artifact.after.kalitaSize, '185');
  assert.equal(artifact.after.sourceProjection.sourceConfiguration.size, '185');
  assert.equal(artifact.after.sourceNativeWaterUnit, 'g');
  assert.ok(artifact.after.stages.every((stage) => stage.trigger));
});

test('Kalita source route fails closed for a mismatched size or filter instead of adapting hardware', async () => {
  const base = generateKalitaRecipe({}, { dose: 25, size: '185' });
  const wrongSize = { ...base, kalitaSize: '165', configurationKey: 'kalita:165:wave-paper:hot' };
  const wrongFilter = { ...base, sourceConfiguration: { filter: 'wave-155' } };

  for (const recipe of [wrongSize, wrongFilter]) {
    const userText = 'Show me a different Kalita technique.';
    const context = contextFor({ userText, recipe });
    const read = await toolsFor(context, recipe).call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
    assert.equal(read.ok, true);
    assert.equal(read.actionable, false);
    assert.deepEqual(read.options, []);
    assert.equal(read.sourceOptions, true);
  }
});

test('source-native grind descriptors survive an Ode setup while ordinary Ode changes keep click validation', async () => {
  const recipe = generateKalitaRecipe({}, { dose: 14, size: '155', grinder: 'fellow-ode-gen2' });
  const context = contextFor({ userText: 'Try a different Kalita technique for the 155.', recipe });
  const tools = toolsFor(context, recipe);
  const read = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const selected = read.options.find((option) => option.sourceId === 'art-of-brew-wave-155-pulse-2024');
  assert.ok(selected?.executable);

  const sourceProposal = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'kalita_hot', change: null,
    experiment: { kind: 'manual_source_technique', techniqueId: selected.sourceId },
  });
  assert.equal(sourceProposal.ok, true, sourceProposal.code);
  assert.deepEqual(sourceProposal.artifact.after.grind, {
    description: 'Medium', microns: null, native: { grinder: '1ZPresso K-Plus', setting: '70 clicks' },
  });
  assert.equal(sourceProposal.artifact.after.grindSize, undefined);

  const ordinaryContext = contextFor({ userText: 'Change the Kalita grind.', recipe });
  ordinaryContext.proposalState.previewReady = true;
  ordinaryContext.proposalState.diagnosisReady = true;
  ordinaryContext.proposalState.userAgreed = true;
  const ordinaryTools = toolsFor(ordinaryContext, recipe);
  await ordinaryTools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const ordinaryProposal = await ordinaryTools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'grind', value: '5.7' }, experiment: null,
  });
  assert.equal(ordinaryProposal.ok, false);
  assert.equal(ordinaryProposal.code, 'physical_grind_required');

  let staleRecipe = recipe;
  const staleContext = contextFor({ userText: 'Try a different Kalita technique for the 155.', recipe });
  const staleTools = createRuphusTools({ uid: 'owner-1', context: staleContext, readers: { readRecipe: async () => staleRecipe } });
  const staleRead = await staleTools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  const staleSelection = staleRead.options.find((option) => option.sourceId === 'foundation-wave-155');
  staleRecipe = generateKalitaRecipe({}, { dose: 15, size: '155', grinder: 'fellow-ode-gen2' });
  const staleProposal = await staleTools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'kalita_hot', change: null,
    experiment: { kind: 'manual_source_technique', techniqueId: staleSelection.sourceId },
  });
  assert.equal(staleProposal.ok, false);
  assert.equal(staleProposal.code, 'proposal_target_stale');
  const afterFailureRead = await staleTools.call('read_technique_options', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.ok(afterFailureRead.options.some((option) => option.sourceId === staleSelection.sourceId), 'a failed proposal does not consume the source family');
});

test('first, another, compare, then explicit first reuse selects a fresh current-base source proposal', async () => {
  const recipe = generateKalitaRecipe({}, { dose: 14, size: '155' });
  const firstText = 'Show me a different Kalita technique for the 155.';
  const first = await runSelectedTechnique({
    recipe,
    userText: firstText,
    sourceId: 'kurasu-wave-155-2023',
    sessionId: 'continuity-first',
  });
  const firstArtifact = first.result.artifacts[0];
  assert.equal(firstArtifact.techniqueExperiment.sourceId, 'kurasu-wave-155-2023');

  const firstSession = {
    boundaryIndex: 0,
    messages: [{ artifacts: [firstArtifact] }],
  };
  const selectionsAfterFirst = techniqueSelectionsFromSession(firstSession, refs);
  const second = await runSelectedTechnique({
    recipe,
    userText: 'Show me another Kalita technique for the 155.',
    sourceId: 'foundation-wave-155',
    selections: selectionsAfterFirst,
    sessionId: 'continuity-another',
  });
  const secondArtifact = second.result.artifacts[0];
  assert.equal(secondArtifact.techniqueExperiment.sourceId, 'foundation-wave-155');
  assert.notEqual(secondArtifact.techniqueExperiment.sourceId, firstArtifact.techniqueExperiment.sourceId);

  const session = {
    boundaryIndex: 0,
    messages: [{ artifacts: [firstArtifact] }, { artifacts: [secondArtifact] }],
  };
  const reviews = recentProposalReviews(session, refs);
  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].sourceId, 'kurasu-wave-155-2023');
  assert.equal(reviews[1].sourceId, 'foundation-wave-155');
  assert.equal(reviews[0].proposed.water.unit, 'g');

  const compareContext = contextFor({
    userText: 'Compare those two Kalita techniques.',
    recipe,
    selections: techniqueSelectionsFromSession(session, refs),
    proposalReviews: reviews,
    sessionId: 'continuity-compare',
  });
  const compareTools = toolsFor(compareContext, recipe);
  let compareCalls = 0;
  const comparison = await runRuphusTurn({
    turnId: 'continuity-compare-turn',
    context: compareContext,
    userText: compareContext.userText,
    tools: compareTools,
    provider: { runTurn: async () => {
      compareCalls += 1;
      return { text: 'Kurasu uses a short wetting sequence, while Foundation keeps one main pour.' };
    } },
  });
  assert.equal(compareCalls, 1);
  assert.equal(comparison.ok, true, comparison.code);
  assert.equal(comparison.artifacts.length, 0);
  assert.equal(compareContext.proposalState.techniqueReady, undefined);

  const reused = await runSelectedTechnique({
    recipe,
    userText: 'Use the first one again for the 155.',
    sourceId: 'kurasu-wave-155-2023',
    selections: techniqueSelectionsFromSession(session, refs),
    proposalReviews: reviews,
    sessionId: 'continuity-reuse',
  });
  assert.equal(reused.result.ok, true, reused.result.code);
  assert.equal(reused.result.artifacts.length, 1);
  const reusedArtifact = reused.result.artifacts[0];
  assert.equal(reusedArtifact.techniqueExperiment.sourceId, 'kurasu-wave-155-2023');
  assert.notEqual(reusedArtifact.id, firstArtifact.id, 'reuse mints a fresh review artifact');
  assert.equal(reusedArtifact.before.coffeeGrams, 14);
  assert.equal(reusedArtifact.after.sourceProjection.sourceId, 'kurasu-wave-155-2023');
  assert.doesNotMatch(reused.result.text, /saved recipe|old action|proposal id/i);
});
