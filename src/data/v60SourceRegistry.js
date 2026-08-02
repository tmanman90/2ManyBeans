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
    ratio: 500 / 30, temperatureC: 100, grind: 'medium-fine', guideSeconds: 210, bloomGrams: 60,
    pourTargets: [{ seconds: 45, grams: 300 }, { seconds: 75, grams: 500 }],
    geometry: 'center bloom and staged spirals; source does not prohibit filter contact', agitation: 'stir and swirl after the final pour',
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
    ratio: 330 / 20, temperatureC: 97, grind: null, guideSeconds: 255, guideRangeSeconds: [240, 270], bloomGrams: 60,
    geometry: 'aggressive bloom spin then two gentle spins', agitation: 'aggressive bloom spin and two gentle spins',
  },
  {
    id: 'heart-continuous-v1', author: 'Heart Roasters',
    canonicalUrl: 'https://www.heartroasters.com/pages/v60', publication: 'V60 brew guide',
    evidenceType: 'primary', status: 'original', brewer: 'V60 02', doseGrams: 22,
    ratio: 360 / 22, temperatureC: 95, temperatureRangeC: [93, 96], grind: 'medium-fine', guideSeconds: 145, guideRangeSeconds: [140, 150], bloomRangeGrams: [40, 50],
    geometry: 'vigorous bloom stir, slow center pour', agitation: 'vigorous bloom stir and final stir',
  },
  {
    id: 'kurasu-controlled-pulses-v1', author: 'Kurasu',
    canonicalUrl: 'https://kurasu.kyoto/blogs/kurasu-journal/kurasu-coffee-brew-guide-2022', publication: 'controlled pulse guide',
    evidenceType: 'primary', status: 'adapted', brewer: 'V60 01', supportedV60_02: false, doseGrams: 14,
    ratio: null, temperatureC: null, grind: null, guideSeconds: 150,
    geometry: 'first and final spoon agitation', agitation: 'spoon agitation', changedFields: ['brewer', 'dose', 'ratio', 'temperature', 'grind', 'cadence'],
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
    if (source.supportedV60_02 !== false && source.brewer !== 'V60 02') errors.push(`${source.id}:unsupported-brewer`);
    if (!Number.isFinite(source.doseGrams)) errors.push(`${source.id}:non-finite-dose`);
    if (source.supportedV60_02 !== false && (!Number.isFinite(source.ratio) || !Number.isFinite(source.temperatureC))) errors.push(`${source.id}:non-finite-physical-field`);
  }
  for (const technique of Object.values(V60_TECHNIQUES)) {
    if (!technique.sourceIds.every((id) => sourceById(id))) errors.push(`${technique.id}:missing-source`);
  }
  return { valid: errors.length === 0, errors };
}
