// Machine-readable, human-audited hot V60 02 source registry.
// Numeric fields are starting evidence, not universal guarantees. Adapters
// record when a source recipe is scaled or bounded for the app.
export const V60_SOURCE_REGISTRY_VERSION = 'v60-hot-sources-v1';

export const V60_SOURCES = Object.freeze([
  {
    id: 'hoffmann-one-cup-v1', author: 'James Hoffmann',
    canonicalUrl: 'https://www.youtube.com/watch?v=1oB1oDrDkHM', publication: 'one-cup V60',
    evidenceType: 'primary', status: 'original', brewer: 'V60 02', doseGrams: 15,
    ratio: 16.67, temperatureC: 100, grind: 'medium-fine', guideSeconds: 210,
    geometry: 'center bloom, controlled spiral, keep stream off paper', agitation: 'one gentle swirl after final pour',
  },
  {
    id: 'hoffmann-large-batch-v1', author: 'James Hoffmann / Hario',
    canonicalUrl: 'https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-uitimate-v60-technique', publication: 'large-batch V60',
    evidenceType: 'primary', status: 'original', brewer: 'V60 02', doseGrams: 30,
    ratio: 16.67, temperatureC: 100, grind: 'medium', guideSeconds: 300,
    geometry: 'center bloom, staged spirals, avoid paper', agitation: 'controlled swirl only when bed is uneven',
  },
  {
    id: 'kasuya-46-v1', author: 'Tetsu Kasuya / Hario',
    canonicalUrl: 'https://www.hario-europe.com/blogs/hario-community/v60-ambassadors-tetsu-kasuya', publication: '4:6 method',
    evidenceType: 'primary', status: 'original', brewer: 'V60 02', doseGrams: 20,
    ratio: 15, temperatureC: 92, grind: 'coarse', guideSeconds: 210,
    geometry: 'five centered pulses with restrained spiral', agitation: 'no final swirl',
  },
  {
    id: 'rao-two-stage-v1', author: 'Scott Rao / Hario',
    canonicalUrl: 'https://www.hario.co.uk/blogs/hario-ambassadors/hario-v60-recipe-interview-with-hario-ambassador-scott-rao', publication: 'two-stage V60',
    evidenceType: 'primary', status: 'original', brewer: 'V60 02', doseGrams: 20,
    ratio: 16.5, temperatureC: 98, grind: 'medium-fine', guideSeconds: 210,
    geometry: 'aggressive bloom then two controlled spirals', agitation: 'one settling spin only for low-fines beds',
  },
  {
    id: 'heart-continuous-v1', author: 'Heart Roasters',
    canonicalUrl: 'https://www.heartroasters.com/pages/v60', publication: 'V60 brew guide',
    evidenceType: 'primary', status: 'original', brewer: 'V60 02', doseGrams: 20,
    ratio: 16, temperatureC: 96, grind: 'medium', guideSeconds: 210,
    geometry: 'low center-to-spiral stream, keep water off paper', agitation: 'low agitation, no final swirl',
  },
  {
    id: 'kurasu-controlled-pulses-v1', author: 'Kurasu',
    canonicalUrl: 'https://kurasu.kyoto/blogs/kurasu-journal/kurasu-coffee-brew-guide-2022', publication: 'controlled pulse guide',
    evidenceType: 'primary', status: 'adapted', brewer: 'V60 02', doseGrams: 20,
    ratio: 16, temperatureC: 94, grind: 'coarse-medium', guideSeconds: 210,
    geometry: 'small-radius pulses, avoid paper walls', agitation: 'source-specific gentle agitation',
  },
]);

export const V60_TECHNIQUES = Object.freeze({
  smallPulse: { id: 'hoffmann-small-pulses', sourceIds: ['hoffmann-one-cup-v1'], label: 'balanced small-dose pulses' },
  largeBatch: { id: 'hoffmann-large-batch', sourceIds: ['hoffmann-large-batch-v1'], label: 'dedicated large-batch pours' },
  coarse46: { id: 'kasuya-coarse-pulses', sourceIds: ['kasuya-46-v1'], label: 'coarse controlled pulses' },
  twoStage: { id: 'rao-two-stage', sourceIds: ['rao-two-stage-v1'], label: 'high-energy two-stage brewing' },
  gentle: { id: 'gentle-main-pour', sourceIds: ['heart-continuous-v1'], label: 'gentle continuous main pour' },
  controlled: { id: 'kurasu-controlled-pulses', sourceIds: ['kurasu-controlled-pulses-v1'], label: 'controlled low-radius pulses' },
});

export function sourceById(id) { return V60_SOURCES.find((source) => source.id === id) || null; }

export function validateV60Registry() {
  const errors = [];
  for (const source of V60_SOURCES) {
    for (const key of ['id', 'author', 'canonicalUrl', 'publication', 'evidenceType', 'brewer', 'geometry', 'agitation']) {
      if (!source[key]) errors.push(`${source.id}:missing-${key}`);
    }
    if (source.brewer !== 'V60 02') errors.push(`${source.id}:unsupported-brewer`);
    if (!Number.isFinite(source.doseGrams) || !Number.isFinite(source.ratio) || !Number.isFinite(source.temperatureC)) errors.push(`${source.id}:non-finite-physical-field`);
  }
  for (const technique of Object.values(V60_TECHNIQUES)) {
    if (!technique.sourceIds.every((id) => sourceById(id))) errors.push(`${technique.id}:missing-source`);
  }
  return { valid: errors.length === 0, errors };
}
