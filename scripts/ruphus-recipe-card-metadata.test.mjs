import test from 'node:test';
import assert from 'node:assert/strict';
import { recipeCardMetadata } from '../src/lib/ruphus/recipeCardMetadata.js';

test('source cards keep exact hardware, native volume and original provenance', () => {
  const facts = recipeCardMetadata({ sourceProjection: {
    equipment: { brewer: 'switch', size: '03' },
    coffeeGrams: 36, water: { value: 440, unit: 'mL' },
    adaptation: { status: 'original' },
  } }, 'v60_hot');
  assert.deepEqual(facts, { brewerLabel: 'Switch 03', sourceSummary: '36g coffee · 440mL water', adaptationLabel: 'Original source recipe' });
  assert.doesNotMatch(facts.sourceSummary, /440g|1:/);
});

test('source cards disclose adaptation only from explicit projection state', () => {
  assert.equal(recipeCardMetadata({}, 'v60_hot').adaptationLabel, null);
  assert.equal(recipeCardMetadata({ sourceProjection: {
    equipment: { brewer: 'kalita', size: '155' }, coffeeGrams: 20,
    water: { value: 300, unit: 'g' }, adaptation: { status: 'scaled' },
  } }, 'kalita_hot').adaptationLabel, 'Scaled to 20g');
  assert.equal(recipeCardMetadata({ kalitaSize: '185' }, 'kalita_iced').brewerLabel, 'Iced Kalita 185');
});
