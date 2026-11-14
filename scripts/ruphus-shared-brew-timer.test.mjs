import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { KALITA_SOURCES } from '../src/data/manualSources/kalita.js';
import { SWITCH_SOURCES } from '../src/data/manualSources/switch.js';
import { V60_SOURCES } from '../src/data/manualSources/v60.js';
import { allManualSourceRecords, generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { projectManualSource } from '../src/lib/manualSourceProjection.js';
import {
  initialManualBrewState,
  manualBrewView,
  transitionManualBrew,
  validateManualBrewState,
} from '../src/lib/ruphus/sourceTimerState.js';
import {
  buildTimerSteps,
  resumeSourceTimerState,
  saveBrewTimingEvent,
  sourceRestoreStartedAt,
  sourceTimerDisplayStages,
  sourceTimerMode,
  sourceTimerTotalSeconds,
} from '../src/lib/brewTimerSteps.js';

const records = [...KALITA_SOURCES, ...SWITCH_SOURCES, ...V60_SOURCES]
  .filter((record) => record.admission?.status === 'ready');

const recipeFor = (record) => ({
  timerReady: true,
  sourceProjection: {
    timerReady: true,
    sourceExecution: record,
    stages: record.stages,
    finish: record.finish,
  },
});

test('elapsed-only first-water sources use ordinary automatic timer cues', () => {
  const onyx = records.find((record) => record.id === 'onyx-monarch-wave-185');
  const recipe = recipeFor(onyx);
  assert.equal(sourceTimerMode(recipe), 'automatic');
  assert.equal(sourceTimerTotalSeconds(recipe), 210);
  const steps = buildTimerSteps(recipe);
  assert.deepEqual(steps.map((step) => step.startSeconds), [0, 30, 45, 65, 90, 120]);
  assert.deepEqual(steps.map((step) => step.step.waterTotal), [50, 160, 220, 280, 340, 400]);
  assert.ok(steps.every((step) => step.step.waterUnit === 'g'));
});

test('automatic and confirmed timer presentation reuse rounded consumer checkpoints', () => {
  const onyx = generateManualSourceTechniqueOption('onyx-monarch-wave-185', {}, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 23,
  }).recipe;
  assert.deepEqual(buildTimerSteps(onyx).map((step) => step.step.waterTotal), [46, 147, 202, 258, 313, 368]);

  const immersion = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 20,
  }).recipe;
  assert.equal(sourceTimerMode(immersion), 'confirmed');
  assert.deepEqual(sourceTimerDisplayStages(immersion).slice(0, 2).map((stage) => stage.water.value), [244, 244]);
  assert.deepEqual(immersion.sourceProjection.stages.slice(0, 2).map((stage) => stage.water.value), [244.44, 244.44]);
});

test('a tampered immutable projection never reaches the timer', () => {
  const onyx = records.find((record) => record.id === 'onyx-monarch-wave-185');
  const projection = projectManualSource(onyx, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot',
  });
  const tampered = structuredClone(projection);
  tampered.stages[0].water.value += 1;
  const envelope = {
    timerReady: true,
    totalBrewTimeSeconds: 180,
    steps: [{ timeSeconds: 0, action: 'Pour water' }],
    sourceProjection: tampered,
  };
  assert.equal(sourceTimerMode(envelope), null);
  assert.equal(buildTimerSteps(envelope), null);
});

test('automatic legacy restoration accepts only the exact source identity', () => {
  const onyx = records.find((record) => record.id === 'onyx-monarch-wave-185');
  const projection = projectManualSource(onyx, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot',
  });
  const recipe = { sourceProjection: projection };
  const binding = {
    sourceId: projection.sourceId,
    sourceRevision: projection.sourceRevision,
    sourceConfiguration: projection.sourceConfiguration,
    configurationKey: projection.configurationKey,
    fingerprint: projection.sourceFingerprint || null,
    dose: projection.coffeeGrams,
  };
  const started = transitionManualBrew(
    projection.sourceExecution,
    initialManualBrewState(projection.sourceExecution, binding),
    'start',
    1_000,
    binding,
  );
  assert.equal(sourceRestoreStartedAt(recipe, started), 1_000);
  assert.equal(sourceRestoreStartedAt(recipe, { ...started, sourceId: 'foreign-source' }), null);
  assert.equal(sourceRestoreStartedAt(recipe, started, { sourceConfiguration: { ...projection.sourceConfiguration, size: '155' } }), null);
});

test('confirmed-source pause/resume shifts anchors so paused time never becomes brew time', () => {
  const record = SWITCH_SOURCES.find((candidate) => candidate.id === 'hario-switch-03-matt-winton-hybrid-24-2022');
  const binding = {
    sourceConfiguration: {
      device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot',
    },
    configurationKey: 'switch:03:V60-Switch:v60-03-paper:hot',
    fingerprint: 'pause-test',
  };
  const started = transitionManualBrew(record, initialManualBrewState(record, binding), 'start', 1_000, binding);
  const paused = { ...started, sharedTimerPauseStartedAtMs: 5_000 };
  const resumed = resumeSourceTimerState(paused, 10_000);
  assert.equal(resumed.events['first-water'], 6_000);
  assert.equal(resumed.events['bloom:start'], 6_000);
  assert.equal(manualBrewView(record, resumed, 10_000, binding).elapsedMs, 4_000);
  assert.equal(validateManualBrewState(record, resumed, binding).valid, true);
  assert.equal(Object.hasOwn(resumed, 'sharedTimerPauseStartedAtMs'), false);
});

test('open-ended elapsed schedules keep automatic cues without inventing a finish target', () => {
  const artOfBrew = records.find((record) => record.id === 'art-of-brew-wave-155-pulse-2024');
  const recipe = recipeFor(artOfBrew);
  assert.equal(sourceTimerMode(recipe), 'automatic');
  assert.equal(sourceTimerTotalSeconds(recipe), null);
  const final = buildTimerSteps(recipe).at(-1);
  assert.equal(final.openEnded, true);
  assert.equal(final.durationSeconds, null);
});

test('event-relative, conditional, manual and non-first-water records retain confirmed semantics', () => {
  for (const record of records) {
    const expected = record.clock?.origin === 'first-water'
      && record.stages.every((stage) => stage.trigger?.type === 'elapsed')
      ? 'automatic'
      : 'confirmed';
    const recipe = recipeFor(record);
    assert.equal(sourceTimerMode(recipe), expected, record.id);
    if (expected === 'confirmed') assert.equal(buildTimerSteps(recipe), null, `${record.id} must not be flattened to guessed timestamps`);
  }
});

test('every currently timer-ready admitted registry source has a shared-timer route', () => {
  const timerReady = [];
  for (const record of allManualSourceRecords.filter((candidate) => candidate.admission?.status === 'ready')) {
    const equipment = record.equipment || {};
    const size = equipment.size === 'any' ? equipment.supportedSizes[0] : equipment.size;
    const filter = equipment.size === 'any' ? equipment.supportedFiltersBySize[size][0] : equipment.filter;
    const projection = projectManualSource(record, {
      device: equipment.brewer === 'switch' ? 'v60' : equipment.brewer,
      variant: equipment.brewer === 'switch' ? 'switch' : equipment.brewer === 'v60' ? 'classic' : 'wave',
      size,
      model: equipment.model,
      filter,
      material: equipment.material,
      mode: record.mode,
    });
    if (!projection.timerReady) continue;
    timerReady.push(record.id);
    const recipe = { sourceProjection: projection };
    const mode = sourceTimerMode(recipe);
    assert.ok(mode === 'confirmed' || (mode === 'automatic' && buildTimerSteps(recipe)), record.id);
  }
  assert.equal(timerReady.length, 14);
});

test('the shared shell accepts legacy attempt state and persists source ledger fields', () => {
  const timer = readFileSync(new URL('../src/components/BrewTimer.jsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/hooks/useBrewTimer.js', import.meta.url), 'utf8');
  assert.match(timer, /sourceTimerState/);
  assert.match(timer, /onSourceTimerStateChange/);
  assert.match(timer, /sourceTimerBinding/);
  assert.match(timer, /timingRecordVersion: 2/);
  assert.match(timer, /sourceEvents/);
  assert.match(timer, /sourceCorrections/);
  assert.match(timer, /phase === 'paused'.*manualBrewView/s);
  assert.match(timer, /if \(phase !== 'idle'\) reset\(\)/);
  assert.match(timer, /function BrewTimer\(props\)/);
  assert.match(hook, /sourceRestoreStartedAt\(recipe, options\.sourceTimerState, options\.sourceTimerBinding\)/);
});

test('a rejected timing write becomes retryable instead of leaving completion stuck saving', async () => {
  let attempts = 0;
  const save = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('offline');
    return { status: 'saved' };
  };
  assert.equal(await saveBrewTimingEvent(save, { sessionId: 'source-attempt' }), 'failed');
  assert.equal(await saveBrewTimingEvent(save, { sessionId: 'source-attempt' }), 'saved');
  assert.equal(attempts, 2);
});
