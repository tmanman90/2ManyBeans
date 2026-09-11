import assert from 'node:assert/strict';
import test from 'node:test';

import {
  V60_SWITCH_SOURCE_REGISTRY_VERSION,
  sourceById,
} from '../src/data/v60SwitchSourceRegistry.js';
import {
  listV60SwitchTechniqueReferences,
  listV60TechniqueOptions,
} from '../src/lib/ruphus/techniqueOptions.js';
import { RUPHUS_SYSTEM_PROMPT } from '../api/_lib/ruphusPrompt.js';

test('Switch dual-temperature reference projects exact registry facts without a family or execution path', () => {
  const source = sourceById('kasuya-hybrid-resolved');
  const references = listV60SwitchTechniqueReferences();

  assert.equal(references.length, 1);
  const reference = references[0];
  assert.equal(reference.sourceId, source.id);
  assert.equal(reference.id, source.id);
  assert.equal(reference.familyId, null);
  assert.equal(reference.familyKey, null);
  assert.equal(reference.name, source.author);
  assert.equal(reference.label, source.publication);
  assert.equal(reference.brewer, source.brewer);
  assert.equal(reference.sourceDoseGrams, source.doseGrams);
  assert.equal(reference.sourceRatio, source.ratio);
  assert.deepEqual(reference.temperaturePhases, {
    phase1C: source.temperaturePhase1C,
    phase2C: source.temperaturePhase2C,
  });
  assert.equal(reference.structure, source.structure);
  assert.deepEqual(reference.valveTiming, {
    closeTimeSeconds: source.valveCloseTimeSeconds,
    openTimeSeconds: source.valveOpenTimeSeconds,
  });
  assert.equal(reference.attribution.evidenceTier, source.evidenceTier);
  assert.equal(reference.sourceRegistryVersion, V60_SWITCH_SOURCE_REGISTRY_VERSION);
  assert.equal(reference.referenceKind, 'dual-temperature');
  assert.equal(reference.referenceOnly, true);
  assert.equal(reference.executable, false);
  assert.equal(reference.timerReady, false);
  assert.match(reference.reason, /90°C then 70°C/);
  assert.match(reference.reason, /single-temperature/);
  assert.match(reference.reason, /silently approximated/);
  assert.equal(listV60TechniqueOptions().some((option) => option.sourceId === source.id), false);
});

test('Ruphus prompt turns the God/Devil request into useful reference guidance', () => {
  assert.match(RUPHUS_SYSTEM_PROMPT, /Tetsu Kasuya God\/Devil dual-temperature Switch method/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /90°C first phase, 70°C second phase, percolation-first hybrid/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /do not say it is missing or ask the user to send its recipe/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /single-temperature Switch guide the original or an implicit approximation/);
  assert.match(RUPHUS_SYSTEM_PROMPT, /not an executable option or a family/);
});

console.log('Ruphus Switch technique reference guidance passed');
