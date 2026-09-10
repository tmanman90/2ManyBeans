import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { KALITA_SOURCES } from '../src/data/manualSources/kalita.js';
import { SWITCH_SOURCES } from '../src/data/manualSources/switch.js';
import { V60_SOURCES } from '../src/data/manualSources/v60.js';
import {
  confirmManualSourceEvent,
  resolveManualSourceStage,
} from '../src/lib/manualSourceTiming.js';
import {
  listManualSourceRecords,
  manualSourceCompatibility,
  manualSourceReadiness,
  projectManualSource,
  validateManualSourceProjection,
} from '../src/lib/manualSourceProjection.js';
import { validateManualSourceRecord } from '../src/lib/manualRecipeContract.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/ruphus-techniques/primary-cases.json', import.meta.url), 'utf8'));
const records = [...KALITA_SOURCES, ...SWITCH_SOURCES, ...V60_SOURCES];
const byId = new Map(records.map((record) => [record.id, record]));

function atPath(value, path) {
  return path.split('.').reduce((current, key) => current == null ? undefined : current[key], value);
}

function record(id) {
  const result = byId.get(id);
  assert.ok(result, `missing source record ${id}`);
  return result;
}

function configFor(source, overrides = {}) {
  const device = source.equipment.brewer === 'switch' ? 'v60' : source.equipment.brewer;
  return {
    device,
    variant: source.equipment.brewer === 'switch' ? 'switch' : source.equipment.brewer === 'v60' ? 'classic' : null,
    size: source.equipment.size === 'any' ? source.equipment.supportedSizes?.[0] : source.equipment.size,
    model: source.equipment.model,
    filter: source.equipment.filter,
    material: source.equipment.material,
    mode: source.mode,
    ...overrides,
  };
}

test('independent primary fixture matches every scoped source fact', () => {
  assert.equal(fixture.sourceFoundationCommit, '9f1b547');
  assert.ok(fixture.cases.length >= 7);
  for (const expectedCase of fixture.cases) {
    const source = record(expectedCase.id);
    for (const [path, expected] of Object.entries(expectedCase.assertions)) {
      assert.deepEqual(atPath(source, path), expected, `${expectedCase.id} ${path}`);
    }
    const structural = validateManualSourceRecord(source);
    assert.equal(structural.valid, true, `${expectedCase.id}: ${structural.errors.join(', ')}`);
    if (expectedCase.expectedReadiness) {
      const readiness = manualSourceReadiness(source);
      for (const [key, expected] of Object.entries(expectedCase.expectedReadiness)) {
        assert.equal(readiness[key], expected, `${expectedCase.id} readiness.${key}`);
      }
    }
  }
});

test('source projections preserve identity, typed native units and readiness', () => {
  const kurasu = record('kurasu-wave-155-2023');
  const kurasuProjection = projectManualSource(kurasu, configFor(kurasu));
  assert.equal(kurasuProjection.timerReady, true);
  assert.deepEqual(kurasuProjection.water, { value: 200, unit: 'g' });
  assert.deepEqual(kurasuProjection.stages.map((stage) => stage.water), [
    { value: 30, unit: 'g' },
    { value: 60, unit: 'g' },
    { value: 200, unit: 'g' },
  ]);
  assert.equal(kurasuProjection.sourceId, kurasu.id);
  assert.equal(kurasuProjection.sourceRevision, 1);
  assert.equal(validateManualSourceProjection(kurasuProjection).valid, true);
  assert.equal(Object.isFrozen(kurasuProjection.sourceSnapshot), true);
  assert.equal(Object.isFrozen(kurasuProjection.stages), true);

  const switch03 = record('hario-switch-03-matt-winton-hybrid-24-2022');
  const switchProjection = projectManualSource(switch03, configFor(switch03));
  assert.equal(switchProjection.timerReady, true);
  assert.deepEqual(switchProjection.water, { value: 360, unit: 'mL' });
  assert.deepEqual(switchProjection.stages[0].water, { value: 50, unit: 'g' });
  assert.deepEqual(switchProjection.stages[2].water, { value: 360, unit: 'mL' });
  assert.equal(switchProjection.stages[0].valve, 'open');
  assert.equal(switchProjection.stages[1].valve, 'closed');
  assert.equal(switchProjection.stages[3].valve, 'open');
  assert.equal(validateManualSourceProjection(switchProjection).valid, true);

  const immersion03 = record('hario-switch-03-instruction-manual-36-2023');
  const immersionProjection = projectManualSource(immersion03, configFor(immersion03));
  assert.equal(immersionProjection.timerReady, true);
  assert.deepEqual(immersionProjection.water, { value: 440, unit: 'mL' });
  assert.deepEqual(immersionProjection.stages[1].water, { value: 440, unit: 'mL' });
  assert.equal(immersionProjection.stages[1].trigger.event, 'main-pour:complete');
  assert.equal(immersionProjection.stages[1].trigger.seconds, 120);
  assert.equal(immersionProjection.stages[0].valve, 'closed');
  assert.equal(immersionProjection.stages[2].valve, 'open');
  assert.equal(validateManualSourceProjection(immersionProjection).valid, true);

  const ozone155 = record('ozone-wave-155-scaled-from-185-2026');
  const ozoneProjection = projectManualSource(ozone155, configFor(ozone155));
  assert.equal(ozoneProjection.timerReady, false);
  assert.ok(ozoneProjection.readiness.blockers.some((reason) => /155.*timing|timing.*155/i.test(reason)));
  assert.equal(ozoneProjection.adaptation.status, 'adapted');
});

test('dose adaptation is explicit and never silently restores timer readiness', () => {
  const source = record('kurasu-wave-155-2023');
  assert.throws(
    () => projectManualSource(source, configFor(source, { dose: 13 })),
    (error) => error.code === 'dose-adaptation-not-authorized',
  );
  const projection = projectManualSource(source, configFor(source, { dose: 13, allowDoseAdaptation: true }));
  assert.equal(projection.timerReady, false);
  assert.equal(projection.adaptation.status, 'scaled');
  assert.equal(projection.adaptation.timing, 'requires-explicit-validation');
  assert.deepEqual(projection.water, { value: 185.71, unit: 'g' });
  assert.deepEqual(projection.stages[0].water, { value: 27.86, unit: 'g' });
  assert.equal(validateManualSourceProjection(projection).valid, true);

  const switch03 = record('hario-switch-03-matt-winton-hybrid-24-2022');
  const switchProjection = projectManualSource(switch03, configFor(switch03, { dose: 20, allowDoseAdaptation: true }));
  assert.equal(switchProjection.timerReady, false);
  assert.deepEqual(switchProjection.water, { value: 300, unit: 'mL' });
  assert.equal(switchProjection.stages[0].water.unit, 'g');
  assert.equal(switchProjection.stages[2].water.unit, 'mL');
});

test('dose adaptation keeps source prose verbatim and discloses typed-field scaling', () => {
  const source = record('kurasu-wave-155-2023');
  const projection = projectManualSource(source, configFor(source, { dose: 13, allowDoseAdaptation: true }));
  assert.equal(projection.stages[0].label, source.stages[0].label);
  assert.deepEqual(projection.preparation, source.preparation);
  assert.deepEqual(projection.sourceExecution.preparation, source.preparation);
  assert.ok(projection.adaptation.disclosure.includes('verbatim'));
  assert.equal(projection.adaptation.changes.some((change) => /label|preparation|aftercare/.test(change.path)), false);
});

test('ranged source doses stay ranges unless an explicit sourceDoseSelection is supplied', () => {
  const source = structuredClone(record('kurasu-wave-155-2023'));
  source.coffeeGrams = { min: 12, max: 16 };
  const configuration = configFor(source);
  const preserved = projectManualSource(source, configuration);
  assert.deepEqual(preserved.coffeeGrams, { min: 12, max: 16 });
  assert.equal(preserved.adaptation.factor, null);
  assert.equal(preserved.timerReady, false);
  assert.ok(preserved.readiness.blockers.includes('source-dose-range-unresolved'));
  assert.throws(
    () => projectManualSource(source, { ...configuration, dose: 14 }),
    (error) => error.code === 'source-dose-selection-required',
  );
  const selected = projectManualSource(source, { ...configuration, sourceDoseSelection: 14 });
  assert.equal(selected.coffeeGrams, 14);
  assert.equal(selected.adaptation.sourceDoseSelection, 14);
  assert.equal(selected.timerReady, false);
});

test('configuration compatibility refuses size, variant and unresolved hardware transfers', () => {
  const switch03 = record('hario-switch-03-matt-winton-hybrid-24-2022');
  const wrongSize = manualSourceCompatibility(switch03, configFor(switch03, { size: '02' }));
  assert.equal(wrongSize.compatible, false);
  assert.ok(wrongSize.reasons.includes('different-size'));
  assert.throws(
    () => projectManualSource(switch03, configFor(switch03, { size: '02' })),
    (error) => error.code === 'source-configuration-mismatch',
  );

  const immersion = record('kurasu-switch-immersion-10-2022');
  const unresolved03 = manualSourceCompatibility(immersion, configFor(immersion, { size: '03', filter: 'v60-03-paper', material: 'glass' }));
  assert.equal(unresolved03.compatible, false);
  assert.ok(unresolved03.reasons.includes('unverified-size-transfer'));
  assert.ok(unresolved03.reasons.includes('different-filter'));
  assert.ok(unresolved03.reasons.includes('unverified-material-transfer'));

  const partners = record('hario-partners-manufacturer');
  const partners03 = manualSourceCompatibility(partners, configFor(partners, { size: '03', filter: 'v60-03-paper', material: 'glass' }));
  assert.equal(partners03.compatible, false);
  assert.ok(partners03.reasons.includes('unverified-size-transfer'));
  assert.ok(partners03.reasons.includes('unverified-filter-transfer'));
});

test('choice listing separates timer-ready choices from readable references', () => {
  const hot185 = listManualSourceRecords(records, {
    device: 'kalita', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot',
  });
  assert.deepEqual(hot185.map((source) => source.id), [
    'onyx-monarch-wave-185',
    'onyx-eu-la-soledad-sidra-wave-185',
    'ozone-wave-185-2026',
  ]);

  const hot155WithReferences = listManualSourceRecords(records, {
    device: 'kalita', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot',
  }, { includeReferenceOnly: true });
  assert.deepEqual(hot155WithReferences.map((source) => source.id), [
    'kurasu-wave-155-2023',
    'vibrant-wave-155',
    'fuglen-wave-155',
    'foundation-wave-155',
    'art-of-brew-wave-155-pulse-2024',
    'drop-wave-155',
    'ozone-wave-155-scaled-from-185-2026',
  ]);
  assert.ok(hot155WithReferences.some((source) => source.id === 'vibrant-wave-155'));
  const hot155 = listManualSourceRecords(records, {
    device: 'kalita', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot',
  });
  assert.deepEqual(hot155.map((source) => source.id), [
    'kurasu-wave-155-2023',
    'fuglen-wave-155',
    'foundation-wave-155',
    'art-of-brew-wave-155-pulse-2024',
  ]);
  const kurasu155 = hot155.find((source) => source.id === 'kurasu-wave-155-2023');
  const foundation155 = hot155.find((source) => source.id === 'foundation-wave-155');
  const artOfBrew155 = hot155.find((source) => source.id === 'art-of-brew-wave-155-pulse-2024');
  assert.notDeepEqual(
    kurasu155.stages.map((stage) => [stage.kind, stage.trigger, stage.waterToGrams]),
    foundation155.stages.map((stage) => [stage.kind, stage.trigger, stage.waterToGrams]),
  );
  assert.deepEqual(artOfBrew155.stages.map((stage) => stage.trigger.seconds), [0, 30, 50, 70, 90, 110]);
  assert.deepEqual(artOfBrew155.stages.map((stage) => stage.waterToGrams), [37.5, 75, 100, 125, 150, 200]);
  assert.notDeepEqual(
    kurasu155.stages.map((stage) => [stage.kind, stage.trigger, stage.waterToGrams]),
    artOfBrew155.stages.map((stage) => [stage.kind, stage.trigger, stage.waterToGrams]),
  );
  assert.equal(kurasu155.source.url.includes('kurasu.kyoto'), true);
  assert.equal(foundation155.source.url.includes('foundationroasters.'), true);
  assert.equal(artOfBrew155.source.url.includes('youtube.com/watch?v=VTlI3SmlYSQ'), true);
  assert.equal(artOfBrew155.temperature, null);
  assert.equal(listManualSourceRecords(records, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot',
  }).map((source) => source.id).join(','), 'hario-switch-03-matt-winton-hybrid-24-2022,hario-switch-03-instruction-manual-36-2023');
});

test('source clock keeps absolute checkpoints and waits anchored to confirmed events', () => {
  const source = record('kurasu-wave-155-2023');
  const events = { 'first-water': 1_000, 'bloom:complete': 11_000 };
  const before = resolveManualSourceStage(source, 'second', events, 30_000);
  assert.equal(before.status, 'countdown');
  assert.equal(before.dueAtMs, 41_000);
  const atCheckpoint = resolveManualSourceStage(source, 'second', events, 41_000);
  assert.equal(atCheckpoint.status, 'ready');
  const late = resolveManualSourceStage(source, 'second', events, 45_000);
  assert.equal(late.status, 'checkpoint-passed');
  assert.equal(late.dueAtMs, 41_000);

  const once = confirmManualSourceEvent(events, 'second:complete', 50_000);
  assert.equal(once['second:complete'], 50_000);
  const again = confirmManualSourceEvent(once, 'second:complete', 90_000);
  assert.deepEqual(again, once);
  assert.throws(() => confirmManualSourceEvent(once, 'third:complete', 40_000), /chronological/);

  const vibrant = record('vibrant-wave-155');
  const final = resolveManualSourceStage(vibrant, 'last', { 'first-water': 0, 'bloom:complete': 5_000, 'main:complete': 61_000 }, 62_000);
  assert.equal(final.status, 'awaiting-observation');
  assert.match(final.condition, /one inch/i);

  const immersion03 = record('hario-switch-03-instruction-manual-36-2023');
  const immersionEvents = { 'main-pour:complete': 1_000 };
  const steep = resolveManualSourceStage(immersion03, 'steep', immersionEvents, 120_000);
  assert.equal(steep.status, 'countdown');
  assert.equal(steep.dueAtMs, 121_000);
  const steepReady = resolveManualSourceStage(immersion03, 'steep', immersionEvents, 121_000);
  assert.equal(steepReady.status, 'ready');
});
