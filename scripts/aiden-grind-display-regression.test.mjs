import assert from 'node:assert/strict';
import {
  formatAidenGrindLabel,
  formatAidenGrindValues,
} from '../src/lib/brewMethods.js';

const opusPreferences = {
  grinder: 'fellow-opus',
  grindSizeDisplay: 'default',
};

const odeRecipeGrind = {
  singleServe: 5.1,
  batch: 7,
};

const displayValues = formatAidenGrindValues(odeRecipeGrind, opusPreferences);

assert.deepEqual(displayValues, {
  grinderName: 'Fellow Opus',
  singleServe: '6.1',
  batch: '7.3',
  singleServeText: '~6.1',
  batchText: '~7.3',
  mode: 'grinder',
});

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, opusPreferences),
  'Fellow Opus: SS ~6.1 / Batch ~7.3'
);

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'fellow-ode-gen2',
    grindSizeDisplay: 'default',
  }),
  'Ode Gen 2: SS 5.1 / Batch 7'
);

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'fellow-opus',
    grindSizeDisplay: 'microns',
  }),
  'SS ~487\u00b5m / Batch ~620\u00b5m'
);

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'baratza-encore-esp',
    grindSizeDisplay: 'default',
  }),
  'Encore ESP: SS ~26 / Batch ~29'
);

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'comandante-c40',
    grindSizeDisplay: 'default',
  }),
  'Comandante C40: SS ~26 clicks / Batch ~32 clicks'
);

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: '1zpresso-jx-pro',
    grindSizeDisplay: 'default',
  }),
  'JX-Pro Red Dot: SS ~3.9.2 / Batch ~4.8.0'
);

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: '1zpresso-jx-pro-grey',
    grindSizeDisplay: 'default',
  }),
  'JX-Pro Grey Dot: SS ~3.5.3 / Batch ~4.4.3'
);

assert.equal(
  formatAidenGrindLabel(odeRecipeGrind, {
    grinder: 'baratza-virtuoso-plus',
    grindSizeDisplay: 'default',
  }),
  'Virtuoso+: SS ~23 / Batch ~30'
);

console.log('Aiden grind display regression passed');
