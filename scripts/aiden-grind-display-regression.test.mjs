// Aiden grind display regression — pins the corrected micron calibration
// (Honest Coffee Guide measured ranges, 2026-07) through every display path.
// aidenGrind is stored in Ode Gen 2 steps; UI must translate per grinder.
import assert from 'node:assert/strict';
import {
  formatAidenGrindLabel,
  formatAidenGrindValues,
  odeStepToMicrons,
  grinderSettingToMicrons,
} from '../src/lib/brewMethods.js';

const odeRecipeGrind = {
  singleServe: 5.1,
  batch: 7,
};

// Calibration anchors (Ode Gen 2: 275µm at 1, ~88.5µm per whole number)
assert.equal(odeStepToMicrons(1), 275);
assert.equal(odeStepToMicrons(5), 629);
assert.equal(odeStepToMicrons(7), 806);
assert.equal(odeStepToMicrons(11), 1160);
// Real-world anchor: tylerxcoffee's published recipe — Ode Gen 2 7.0 ≈ 800µm
assert.ok(Math.abs(odeStepToMicrons(7) - 800) <= 15);

// Ode user sees raw dial numbers, unchanged
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'fellow-ode-gen2',
    grindSizeDisplay: 'default',
  }),
  'Ode Gen 2: SS 5.1 / Batch 7'
);

// Micron display mode reflects the corrected scale
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'fellow-ode-gen2',
    grindSizeDisplay: 'microns',
  }),
  'SS ~638µm / Batch ~806µm'
);

// Opus translation (230µm base, 93µm/number)
const opusValues = formatAidenGrindValues(odeRecipeGrind, {
  grinder: 'fellow-opus',
  grindSizeDisplay: 'default',
});
assert.deepEqual(opusValues, {
  grinderName: 'Fellow Opus',
  singleServe: '5.4',
  batch: '7.2',
  singleServeText: '~5.4',
  batchText: '~7.2',
  mode: 'grinder',
});
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, { grinder: 'fellow-opus', grindSizeDisplay: 'default' }),
  'Fellow Opus: SS ~5.4 / Batch ~7.2'
);

// Comandante (30µm/click): translated clicks must land within ~30µm of source
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, { grinder: 'comandante-c40', grindSizeDisplay: 'default' }),
  'Comandante C40: SS ~21 clicks / Batch ~27 clicks'
);
assert.ok(Math.abs(grinderSettingToMicrons(21, 'comandante-c40') - 638) <= 30);

// JX-Pro rotation notation (4.6µm/click)
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, { grinder: '1zpresso-jx-pro', grindSizeDisplay: 'default' }),
  'JX-Pro: SS ~3.1.9 / Batch ~4.1.5'
);

// Encore ESP + Virtuoso+
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, { grinder: 'baratza-encore-esp', grindSizeDisplay: 'default' }),
  'Encore ESP: SS ~14.2 / Batch ~20'
);
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, { grinder: 'baratza-virtuoso-plus', grindSizeDisplay: 'default' }),
  'Virtuoso+: SS ~17.5 / Batch ~24.2'
);

// Custom grinder falls back to raw Ode display with custom name
assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'other',
    grinderCustomName: 'My Grinder',
    grindSizeDisplay: 'default',
  }),
  'My Grinder: SS 5.1 / Batch 7'
);

console.log('Aiden grind display regression passed');
