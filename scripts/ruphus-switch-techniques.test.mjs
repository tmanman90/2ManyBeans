import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools, isExplicitTechniqueReuseRequest, isHistoricalTechniqueInspectionRequest } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { addRuphusSourceFormatCapability, RUPHUS_SOURCE_FORMAT_CAPABILITY } from '../src/lib/ruphus/streamAgent.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { recentProposalReviews } from '../src/lib/ruphus/proposalContinuity.js';

const refs = { c1: 'coffee-1' };

function contextFor({ userText, recipe, capability = true }) {
  const context = {
    rotationSnapshot: {
      coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['v60_hot'] }],
      refs,
    },
    __ruphusRefs: refs,
    userText,
    conversation: [],
    sessionId: 'switch-test',
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  Object.defineProperty(context, '__ruphusSourceFormatCapability', {
    value: capability,
    enumerable: false,
    writable: true,
    configurable: true,
  });
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

async function runSelectedTechnique({ recipe, userText, sourceId, sessionId = 'switch-run' }) {
  const context = contextFor({ userText, recipe });
  context.sessionId = sessionId;
  const tools = toolsFor(context, recipe);
  const frames = [];
  let providerCalls = 0;
  let selected;
  const result = await runRuphusTurn({
    turnId: [sessionId, 'turn'].join('-'),
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
              callId: 'switch-options',
              name: 'read_technique_options',
              args: { coffeeRef: 'c1', slot: 'v60_hot' },
            }],
          };
        }
        const read = toolResult?.results?.find((item) => item.name === 'read_technique_options')?.result;
        selected = read?.options?.find((option) => option.sourceId === sourceId)
          || read?.options?.find((option) => option.executable === true);
        assert.ok(selected, 'trusted reader returned ' + (sourceId || 'an executable Switch source'));
        return {
          toolCalls: [{
            callId: 'switch-proposal',
            name: 'propose_recipe_change',
            args: {
              coffeeRef: 'c1',
              slot: 'v60_hot',
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

test('Switch 03 exposes both hybrid and full-immersion source choices through the provider schema', async () => {
  const recipe = generateV60SwitchRecipe({}, { dose: 24, size: '03' });
  const context = contextFor({ userText: 'Show me a different Switch technique.', recipe });
  const tools = toolsFor(context, recipe);
  const readSchema = readDefinition(tools, 'read_technique_options');
  const proposalSchema = readDefinition(tools, 'propose_recipe_change');

  assert.deepEqual(readSchema.parameters.properties.slot.enum, ['v60_hot', 'kalita_hot']);
  const experimentSchema = proposalSchema.parameters.properties.experiment.anyOf
    .find((schema) => schema.type === 'object');
  assert.ok(experimentSchema.properties.kind.anyOf[0].enum.includes('manual_source_technique'));

  const read = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(read.ok, true);
  assert.equal(read.sourceOptions, true);
  assert.deepEqual(read.options.map((option) => option.sourceId), [
    'hario-switch-03-matt-winton-hybrid-24-2022',
    'hario-switch-03-instruction-manual-36-2023',
  ]);
  assert.ok(read.options.every((option) => option.sourceConfiguration.size === '03'));
  assert.ok(read.options.every((option) => option.sourceConfiguration.model === 'V60 Switch'));
  assert.ok(read.options.every((option) => option.sourceConfiguration.filter === 'v60-03-paper'));
  assert.ok(read.options.every((option) => option.executable === true && option.timerReady === true));
  assert.deepEqual(read.references.map((reference) => reference.sourceId), ['kasuya-hybrid-resolved']);
  assert.ok(read.references.every((reference) => reference.referenceOnly && reference.executable === false && reference.familyId === null));
  assert.match(read.options[0].differences[0], /open-valve bloom.*closed immersion.*release to drain/i);
  assert.match(read.options[1].differences[0], /stays closed through the pour and steep.*releases to drain/i);
});

test('an explicit new Switch technique name is not mistaken for the prior HARIO card', async () => {
  const recipe = generateV60SwitchRecipe({}, { dose: 24, size: '03' });
  const priorSourceId = 'hario-switch-03-matt-winton-hybrid-24-2022';
  const context = contextFor({ userText: 'Try the HARIO full immersion Switch technique.', recipe });
  context.proposalReviews = [{
    coffeeRef: 'c1', slot: 'v60_hot', sourceId: priorSourceId, familyId: priorSourceId,
    name: 'HARIO Switch 03 Matt Winton bloom hybrid', proposalId: 'proposal-first',
  }];
  Object.defineProperty(context, '__ruphusTechniqueSelections', {
    value: new Map([['c1:v60_hot', { selectedIds: [priorSourceId], proposalIds: ['proposal-first'] }]]),
    enumerable: false,
  });

  const read = await toolsFor(context, recipe).call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(read.ok, true);
  assert.equal(read.actionable, true);
  assert.deepEqual(read.options.map((option) => option.sourceId), ['hario-switch-03-instruction-manual-36-2023']);
  assert.notEqual(read.options[0].sourceId, priorSourceId);
});

test('ordinal historical Switch inspection re-emits the chronological card as a read-only frame', async () => {
  const recipe = generateV60SwitchRecipe({}, { dose: 24, size: '03' });
  const first = generateManualSourceTechniqueOption('hario-switch-03-matt-winton-hybrid-24-2022', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 15,
  });
  const second = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 15,
  });
  const firstSourceId = first.sourceId;
  const secondSourceId = second.sourceId;
  const card = (id, option) => ({
    id, type: 'recipe_proposal', status: 'attempt_created', coffeeId: 'coffee-1', coffeeName: 'El Vergel', slotKey: 'v60_hot',
    before: recipe, after: option.recipe,
    techniqueExperiment: { kind: 'manual_source_technique', techniqueId: option.id, familyId: option.familyId, sourceId: option.sourceId, name: option.name, differences: option.differences },
    actions: [],
  });
  const firstCard = card('proposal-first', first);
  const secondCard = card('proposal-second', second);
  const context = contextFor({ userText: 'Show me the first one again.', recipe });
  context.proposalReviews = [
    { coffeeRef: 'c1', slot: 'v60_hot', sourceId: firstSourceId, familyId: first.familyId, name: first.name, proposalId: firstCard.id },
    { coffeeRef: 'c1', slot: 'v60_hot', sourceId: secondSourceId, familyId: second.familyId, name: second.name, proposalId: secondCard.id },
  ];
  Object.defineProperty(context, '__ruphusTurnBinding', {
    value: { status: 'locked', coffeeRef: 'c1', coffee: { id: 'coffee-1', name: 'El Vergel' }, techniqueSlot: 'v60_hot', techniqueKind: 'manual_source_technique' },
    enumerable: false,
  });
  Object.defineProperty(context, '__ruphusPriorProposals', { value: [firstCard, secondCard], enumerable: false });

  assert.equal(isHistoricalTechniqueInspectionRequest(context.userText), true);
  assert.equal(isExplicitTechniqueReuseRequest(context.userText), false, 'ordinal show remains inspection, not fresh reuse');
  const calls = [];
  const rawTools = toolsFor(context, recipe);
  const tools = { ...rawTools, call: async (...args) => { calls.push(args); return rawTools.call(...args); } };
  const frames = [];
  let providerCalls = 0;
  const result = await runRuphusTurn({
    turnId: 'switch-history-inspection', context, userText: context.userText, tools,
    emit: (frame) => frames.push(frame),
    provider: { runTurn: async (input) => {
      providerCalls += 1;
      assert.equal(providerCalls, 1);
      assert.deepEqual(input.context.proposalReviews.map((review) => review.sourceId), [firstSourceId, secondSourceId]);
      assert.ok(Array.isArray(input.tools));
      return { text: 'The first delivered technique is the hybrid.' };
    } },
  });
  assert.equal(result.ok, true, result.code);
  assert.equal(providerCalls, 1);
  assert.deepEqual(calls.map(([name]) => name), ['read_technique_options']);
  assert.equal(result.text, `Here’s ${first.name} as a read-only recipe.`);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].id, firstCard.id);
  assert.equal(result.artifacts[0].status, 'superseded');
  assert.equal(result.artifacts[0].historyOnly, true);
  assert.deepEqual(result.artifacts[0].actions, []);
  assert.deepEqual(result.artifacts[0].after, firstCard.after);
  assert.equal(result.artifacts[0].after.sourceProjection.water.unit, 'mL');
  assert.equal(frames.filter((frame) => frame.type === 'artifact_ready').length, 1);
  assert.equal(context.proposalState.target, null, 'historical inspection does not create action target state');
  assert.equal(context.proposalState.techniqueReady, undefined, 'historical inspection does not authorize a new proposal');
});

for (const modelChoice of ['prose', 'fresh-proposal', 'history-read']) test(`standard V60 historical inspection retains its original card despite ${modelChoice}`, async () => {
  const recipe = generateV60Recipe({}, { dose: 20 });
  const card = {
    id: 'v60-original', type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_hot',
    before: recipe, after: recipe,
    techniqueExperiment: { kind: 'v60_technique', techniqueId: 'hoffmann-one-cup', name: 'Hoffmann one-cup' },
  };
  const context = contextFor({ userText: 'Show me the first one again.', recipe });
  context.proposalReviews = recentProposalReviews({ messages: [{ artifacts: [card] }] }, refs);
  Object.defineProperty(context, '__ruphusTurnBinding', {
    value: { status: 'locked', coffeeRef: 'c1', coffee: { id: 'coffee-1', name: 'El Vergel' }, techniqueSlot: 'v60_hot', techniqueKind: 'v60_technique' }, enumerable: false,
  });
  Object.defineProperty(context, '__ruphusPriorProposals', { value: [card], enumerable: false });
  const rawTools = toolsFor(context, recipe);
  const dispatched = [];
  const tools = { ...rawTools, call: async (...args) => { dispatched.push(args[0]); return rawTools.call(...args); } };
  const frames = [];
  let providerCalls = 0;
  const result = await runRuphusTurn({
    turnId: 'v60-history', context, userText: context.userText, tools,
    emit: (frame) => frames.push(frame),
    provider: { runTurn: async () => {
      providerCalls += 1;
      assert.equal(providerCalls, 1, 'read-only history does not need another model round');
      if (modelChoice === 'prose') return { text: 'The first technique was Hoffmann.' };
      return { toolCalls: [{ callId: 'read-old-card', name: modelChoice === 'fresh-proposal' ? 'propose_recipe_change' : 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
    } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(dispatched, ['read_technique_options'], 'inspection never dispatches a fresh proposal');
  assert.equal(result.artifacts[0]?.id, card.id);
  assert.deepEqual(result.artifacts[0]?.after, recipe);
  assert.equal(result.artifacts[0]?.historyOnly, true);
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
  assert.equal(card.status, 'proposed', 'inspection does not mutate the original card');
});

test('Switch 03 immersion becomes a native mL timed proposal without generic Switch aliases', async () => {
  const recipe = generateV60SwitchRecipe({}, { dose: 24, size: '03' });
  const run = await runSelectedTechnique({
    recipe,
    userText: 'Try a different Switch technique.',
    sourceId: 'hario-switch-03-instruction-manual-36-2023',
    sessionId: 'switch-immersion',
  });

  assert.equal(run.providerCalls, 2);
  assert.equal(run.result.ok, true, run.result.code);
  assert.equal(run.result.artifacts.length, 1);
  const artifact = run.result.artifacts[0];
  assert.equal(artifact.techniqueExperiment.kind, 'manual_source_technique');
  assert.equal(artifact.techniqueExperiment.sourceId, 'hario-switch-03-instruction-manual-36-2023');
  assert.equal(artifact.after.device, 'v60');
  assert.equal(artifact.after.variant, 'switch');
  assert.equal(artifact.after.v60Size, '03');
  assert.equal(artifact.after.sourceNativeWaterUnit, 'mL');
  assert.equal(artifact.after.waterMilliliters, 293.33);
  assert.equal(artifact.after.waterGrams, undefined);
  assert.equal(artifact.after.ratio, undefined);
  assert.equal(artifact.after.sourceProjection.temperature, null);
  assert.equal(artifact.after.sourceProjection.clock.origin, 'after-main-pour');
  assert.equal(artifact.after.sourceProjection.sourceSnapshot.coffeeGrams, 36);
  assert.equal(artifact.after.sourceProjection.sourceSnapshot.water.brewMilliliters, 440);
  assert.equal(artifact.after.sourceProjection.sourceSnapshot.manufacturerContext.finishedCapacityMillilitersApprox, 360);
  const stages = artifact.after.sourceProjection.stages;
  assert.equal(stages[0].valve, 'closed');
  assert.deepEqual(stages[1].trigger, { type: 'after', event: 'main-pour:complete', seconds: 120 });
  assert.equal(stages[1].valve, 'closed');
  assert.equal(stages[2].valve, 'open');
  assert.equal(stages[3].trigger.type, 'condition');
  assert.equal(stages[3].valve, 'open');
  assert.equal(artifact.after.timerReady, true);
  assert.equal(run.result.text, `Try ${run.selected.name}. The full brew stays closed through the pour and steep, then releases to drain. Here’s the recipe to review.`);
  assert.equal(run.frames.filter((frame) => frame.type === 'artifact_ready').length, 1);
});

test('older clients can read Switch source details but cannot prepare an executable source card', async () => {
  const recipe = generateV60SwitchRecipe({}, { dose: 24, size: '03' });
  const userText = 'Show me a different Switch technique.';
  const context = contextFor({ userText, recipe, capability: false });
  const tools = toolsFor(context, recipe);
  const read = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });

  assert.equal(read.ok, true);
  assert.equal(read.actionable, false);
  assert.equal(read.sourceFormatSupported, false);
  assert.ok(read.options.length > 0);
  assert.ok(read.options.every((option) => option.executable === false
    && option.timerReady === false
    && option.referenceOnly === true
    && option.capabilityRequired === RUPHUS_SOURCE_FORMAT_CAPABILITY));
  assert.match(read.message, /needs an update|update the app/i);

  const blocked = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: 'v60_hot',
    change: null,
    experiment: { kind: 'manual_source_technique', techniqueId: read.options[0].sourceId },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'source_format_unsupported');
});

test('Switch source route fails closed for size/filter mismatches and keeps standard V60 requests generic', async () => {
  const switch03 = generateV60SwitchRecipe({}, { dose: 24, size: '03' });
  const wrongSize = { ...switch03, v60Size: '02', configurationKey: 'v60:02:standard-paper:switch:hot' };
  const wrongFilter = { ...switch03, sourceConfiguration: { filter: 'v60-02-paper' } };

  for (const recipe of [wrongSize, wrongFilter]) {
    const context = contextFor({ userText: 'Show me a different Switch technique.', recipe });
    const read = await toolsFor(context, recipe).call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
    assert.equal(read.ok, true);
    assert.equal(read.actionable, false);
    assert.deepEqual(read.options, []);
    assert.equal(read.sourceOptions, true);
  }

  const standard = generateV60Recipe({}, { dose: 20 });
  const standardContext = contextFor({ userText: 'Show me a different Switch technique.', recipe: standard });
  const standardRead = await toolsFor(standardContext, standard).call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(standardRead.ok, true);
  assert.equal(standardRead.actionable, false);
  assert.equal(standardRead.sourceOptions, true);
  assert.deepEqual(standardRead.options, []);
  assert.match(standardRead.message, /classic V60.*ribbed Switch|saved classic V60/i);

  const genericContext = contextFor({ userText: 'Show me a different V60 technique.', recipe: standard });
  const genericRead = await toolsFor(genericContext, standard).call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(genericRead.ok, true);
  assert.equal(genericRead.actionable, true);
  assert.ok(genericRead.options.length > 0);
  assert.equal(genericRead.options.some((option) => option.sourceId?.startsWith('hario-switch-03-')), false);
});

test('stream client advertises the source-format capability without mutating caller state', () => {
  const body = { turnId: 'switch-capability', commandCapabilities: ['existing-capability', RUPHUS_SOURCE_FORMAT_CAPABILITY] };
  const enriched = addRuphusSourceFormatCapability(body);
  assert.deepEqual(body.commandCapabilities, ['existing-capability', RUPHUS_SOURCE_FORMAT_CAPABILITY]);
  assert.deepEqual(enriched.commandCapabilities, ['existing-capability', RUPHUS_SOURCE_FORMAT_CAPABILITY]);
  assert.notEqual(enriched, body);
  assert.equal(addRuphusSourceFormatCapability({}).commandCapabilities.includes(RUPHUS_SOURCE_FORMAT_CAPABILITY), true);
});
