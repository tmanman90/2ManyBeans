import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { addRuphusSourceFormatCapability, RUPHUS_SOURCE_FORMAT_CAPABILITY } from '../src/lib/ruphus/streamAgent.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';

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
  assert.match(run.result.text, /Switch 03 source technique experiment/i);
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

test('Switch source route fails closed for size/filter mismatches and keeps standard V60 generic', async () => {
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
  assert.equal(standardRead.sourceOptions, undefined);
  assert.ok(standardRead.options.length > 0);
  assert.equal(standardRead.options.some((option) => option.sourceId?.startsWith('hario-switch-03-')), false);
});

test('stream client advertises the source-format capability without mutating caller state', () => {
  const body = { turnId: 'switch-capability', commandCapabilities: ['existing-capability', RUPHUS_SOURCE_FORMAT_CAPABILITY] };
  const enriched = addRuphusSourceFormatCapability(body);
  assert.deepEqual(body.commandCapabilities, ['existing-capability', RUPHUS_SOURCE_FORMAT_CAPABILITY]);
  assert.deepEqual(enriched.commandCapabilities, ['existing-capability', RUPHUS_SOURCE_FORMAT_CAPABILITY]);
  assert.notEqual(enriched, body);
  assert.equal(addRuphusSourceFormatCapability({}).commandCapabilities.includes(RUPHUS_SOURCE_FORMAT_CAPABILITY), true);
});
