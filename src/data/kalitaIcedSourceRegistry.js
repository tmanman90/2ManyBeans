import { kalitaDoseBounds } from './kalitaConfiguration.js';

export const KALITA_ICED_SOURCE_REGISTRY_VERSION = 'kalita-iced-sources-v1';

export const KALITA_ICED_SOURCES = Object.freeze([
  Object.freeze({
    id: 'kurasu-wave-ice-after-v1',
    author: 'Kurasu / Runatsu',
    canonicalUrl: 'https://kurasu.kyoto/blogs/recipe/new-kalita-wave-iced-coffee-recipe',
    publishedAt: '2024-11-18',
    evidenceType: 'primary',
    executable: true,
    configuration: 'kalita:any:wave-paper',
    sizes: ['155', '185'],
    doseGrams: 16,
    hotWaterGrams: 150,
    recipeIceGrams: 140,
    initialBrewIceGrams: null,
    postBrewIceGrams: 140,
    finalBeverageWaterTargetGrams: null,
    requiresCompleteMelt: false,
    temperatureC: 90,
    grind: 'medium-coarse',
    odeGen2Setting: '8.2',
    geometry: 'slow consistent circular pour around the center; avoid a spiral',
    agitation: 'none during brew; stir after pouring over ice until cold',
    guideSeconds: 99,
    guideRangeSeconds: [97, 100],
    steps: [
      { timeSeconds: 0, waterTotal: 50, action: 'Pour slowly in a small circle around the center to 50g; do not spiral or swirl.' },
      { timeSeconds: 30, waterTotal: 100, action: 'Repeat the same small center circle to 100g total; do not widen into a spiral or swirl.' },
      { timeSeconds: 60, waterTotal: 150, action: 'Finish to 150g total with the same slow center circle; do not spiral or swirl, then let the coffee drip through.' },
    ],
    postBrewInstruction: 'After Finish Brew, add 140g ice to a glass, pour the hot coffee over it, and stir until cold. The source does not require every gram of ice to melt.',
  }),
  Object.freeze({
    id: 'espresso-parts-wave-185-direct-v1',
    author: 'Espresso Parts',
    canonicalUrl: 'https://www.espressoparts.com/blogs/news/kalita-wave-iced-coffee-tutorial',
    publishedAt: '2024-06-27',
    evidenceType: 'professional',
    executable: true,
    configuration: 'kalita:185:wave-paper',
    sizes: ['185'],
    doseGrams: 20,
    hotWaterGrams: 160,
    recipeIceGrams: 160,
    initialBrewIceGrams: 160,
    postBrewIceGrams: null,
    finalBeverageWaterTargetGrams: null,
    requiresCompleteMelt: false,
    temperatureRangeC: [91, 96],
    temperatureC: 94,
    grind: 'medium',
    geometry: 'continuous controlled circles',
    agitation: 'no separate agitation step specified',
    guideSeconds: 105,
    guideRangeSeconds: [90, 120],
    steps: [
      { timeSeconds: 0, waterTotal: 60, action: 'Bloom from the center to 60g, wetting the bed evenly; do not add a separate swirl.' },
      { timeSeconds: 30, waterTotal: 160, action: 'Pour continuously in small controlled circles to 160g total; keep the stream on the coffee bed and do not stir or swirl.' },
    ],
    postBrewInstruction: 'After Finish Brew, gently swirl the server to chill the coffee, then pour over fresh serving ice. Complete melt is not assumed.',
  }),
  Object.freeze({
    id: 'frothy-monkey-wave-large-direct-v1',
    author: 'Frothy Monkey',
    canonicalUrl: 'https://frothymonkey.com/blog/iced-kalita-wave-brewing-guide/',
    publishedAt: null,
    evidenceType: 'professional',
    executable: true,
    configuration: 'kalita:185:wave-paper',
    sizes: ['185'],
    doseGrams: 33,
    hotWaterGrams: 300,
    recipeIceGrams: 200,
    initialBrewIceGrams: 200,
    postBrewIceGrams: null,
    finalBeverageWaterTargetGrams: 500,
    requiresCompleteMelt: true,
    temperatureRangeC: [91, 96],
    temperatureC: 94,
    grind: 'medium-fine',
    geometry: 'uniform spirals from the middle outward',
    agitation: 'no separate agitation; swirl server after drawdown until ice melts',
    guideSeconds: 165,
    guideRangeSeconds: [150, 180],
    steps: [
      { timeSeconds: 0, waterTotal: 70, action: 'Bloom from the center to 70g and wet all grounds evenly; do not add a separate swirl.' },
      { timeSeconds: 40, waterTotal: 200, action: 'Pour in uniform spirals from the middle outward to 200g total; stay off the paper and do not stir or swirl.' },
      { timeSeconds: 55, waterTotal: 250, action: 'Add a controlled 50g spiral pulse to 250g total; keep the stream low and do not stir or swirl.' },
      { timeSeconds: 70, waterTotal: 300, action: 'Finish with one controlled spiral pulse to 300g total; do not stir or swirl, and let it draw down.' },
    ],
    postBrewInstruction: 'After Finish Brew, swirl the server until the recipe ice fully melts, then pour over fresh serving ice.',
  }),
  Object.freeze({
    id: 'little-waves-wave-185-context-v1', author: 'Little Waves Coffee Roasters',
    canonicalUrl: 'https://littlewaves.coffee/products/iced-coffee-brew-guide', evidenceType: 'professional', executable: false,
    configuration: 'kalita:185:wave-paper', reason: 'Useful corroboration, but its recipe is a range rather than one canonical executable schedule.',
  }),
  Object.freeze({
    id: 'apollons-wave-filter-context-v1', author: "Apollon's Gold",
    canonicalUrl: 'https://shop.apollons-gold.com/pages/iced-pourover-recipe', evidenceType: 'context', executable: false,
    configuration: 'origami-air-s:wave-155-filter', reason: 'Different dripper; cannot set production Kalita Wave parameters without physical validation.',
  }),
  Object.freeze({
    id: 'gota-155-discovery-v1', author: 'Gota Coffee Experts',
    canonicalUrl: 'https://gota.cafe/en/recipes/kalita-wave-155/kalita-155-iced', evidenceType: 'aggregator', executable: false,
    configuration: 'kalita:155:wave-paper', reason: 'Discovery only; its attribution does not match the linked Frothy Monkey source.',
  }),
]);

export const KALITA_ICED_RULES = Object.freeze({
  'kalita-iced-dose-scaling-v1': Object.freeze({
    allowedFields: ['dose', 'hotWater', 'recipeIce', 'cadence', 'guide'],
    bounds: {
      '155': [kalitaDoseBounds('155').minDose, kalitaDoseBounds('155').maxDose],
      '185': [kalitaDoseBounds('185').minDose, kalitaDoseBounds('185').maxDose],
    },
    sourceIds: ['kurasu-wave-ice-after-v1', 'espresso-parts-wave-185-direct-v1', 'frothy-monkey-wave-large-direct-v1'],
  }),
  'kalita-iced-grind-translation-v1': Object.freeze({
    allowedFields: ['grind'], bounds: { microns: [600, 1000] },
    sourceIds: ['kurasu-wave-ice-after-v1', 'espresso-parts-wave-185-direct-v1', 'frothy-monkey-wave-large-direct-v1'],
  }),
  'kalita-iced-temperature-range-v1': Object.freeze({
    allowedFields: ['temperature'], bounds: { temperatureC: [90, 96] },
    sourceIds: ['kurasu-wave-ice-after-v1', 'espresso-parts-wave-185-direct-v1', 'frothy-monkey-wave-large-direct-v1'],
  }),
  'kalita-iced-explicit-flow-guard-v1': Object.freeze({
    allowedFields: ['geometry', 'grind'], bounds: { micronDelta: [0, 40] }, defaultMicronDelta: 30,
    sourceIds: ['kurasu-wave-ice-after-v1', 'espresso-parts-wave-185-direct-v1', 'frothy-monkey-wave-large-direct-v1'],
  }),
  'user-configuration': Object.freeze({ allowedFields: ['dose', 'grinder', 'size'] }),
});

export const KALITA_ICED_TECHNIQUES = Object.freeze({
  kurasuIceAfter: Object.freeze({ id: 'kurasu-center-circles-ice-after', sourceId: 'kurasu-wave-ice-after-v1', label: 'center circles, ice after brewing' }),
  espressoPartsDirect: Object.freeze({ id: 'wave-185-controlled-circles-direct', sourceId: 'espresso-parts-wave-185-direct-v1', label: 'controlled circles over ice' }),
  frothyLargeDirect: Object.freeze({ id: 'wave-185-large-spiral-direct', sourceId: 'frothy-monkey-wave-large-direct-v1', label: 'large-dose spiral pulses over ice' }),
});

export function kalitaIcedSourceById(id) {
  return KALITA_ICED_SOURCES.find((source) => source.id === id) || null;
}

export function isKnownKalitaIcedParameterSource(id) {
  return Boolean(kalitaIcedSourceById(id) || KALITA_ICED_RULES[id]);
}

export function validateKalitaIcedRegistry() {
  const errors = [];
  for (const source of KALITA_ICED_SOURCES.filter((entry) => entry.executable)) {
    if (!source.id || !source.author || !source.canonicalUrl || !['primary', 'professional'].includes(source.evidenceType)) errors.push(`${source.id || 'unknown'}:provenance`);
    if (!Array.isArray(source.sizes) || !source.sizes.length || !Number.isFinite(source.doseGrams)) errors.push(`${source.id}:configuration`);
    for (const key of ['hotWaterGrams', 'recipeIceGrams', 'temperatureC', 'guideSeconds']) if (!Number.isFinite(source[key])) errors.push(`${source.id}:${key}`);
    if (source.initialBrewIceGrams != null && source.postBrewIceGrams != null) errors.push(`${source.id}:ambiguous-ice-timing`);
    if (source.initialBrewIceGrams == null && source.postBrewIceGrams == null) errors.push(`${source.id}:missing-ice-timing`);
    if (source.requiresCompleteMelt && source.finalBeverageWaterTargetGrams !== source.hotWaterGrams + source.recipeIceGrams) errors.push(`${source.id}:final-water-math`);
    if (!source.requiresCompleteMelt && source.finalBeverageWaterTargetGrams != null) errors.push(`${source.id}:unsupported-final-water-claim`);
    if (!Array.isArray(source.steps) || source.steps.length < 2 || source.steps[0]?.timeSeconds !== 0 || source.steps.at(-1)?.waterTotal !== source.hotWaterGrams) errors.push(`${source.id}:steps`);
    let lastTime = -1; let lastWater = -1;
    for (const step of source.steps || []) {
      if (!Number.isFinite(step.timeSeconds) || step.timeSeconds <= lastTime || !Number.isFinite(step.waterTotal) || step.waterTotal <= lastWater || !step.action) errors.push(`${source.id}:step-sequence`);
      lastTime = step.timeSeconds; lastWater = step.waterTotal;
    }
  }
  for (const blocked of KALITA_ICED_SOURCES.filter((entry) => !entry.executable)) {
    if (!blocked.reason) errors.push(`${blocked.id}:missing-non-executable-reason`);
  }
  return { valid: errors.length === 0, errors };
}
