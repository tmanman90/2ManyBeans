export const V60_ICED_SOURCE_REGISTRY_VERSION = 'v60-iced-sources-v1';
export const V60_ICED_RULES = Object.freeze({
  'v60-iced-dose-scaling-v1': { allowedFields: ['dose', 'hotWater', 'brewIce', 'cadence', 'guide'], bounds: { dose: [12, 30] }, sourceIds: ['hoffmann-flash-6040-v1', 'partners-flash-6733-v1', 'kurasu-iced-staged-v1', 'counterculture-flash-v1'] },
  'v60-iced-adaptation-bounded-v1': { allowedFields: ['configuration', 'agitation', 'guide'], sourceIds: ['kurasu-iced-staged-v1', 'counterculture-flash-v1'] },
  'v60-iced-grind-baseline-v1': { allowedFields: ['grind'], bounds: { microns: [655, 725] }, sourceIds: ['hoffmann-flash-6040-v1', 'partners-flash-6733-v1', 'kurasu-iced-staged-v1', 'counterculture-flash-v1'] },
  'v60-iced-temperature-bounds-v1': { allowedFields: ['temperature'], bounds: { temperatureC: [91, 100] }, sourceIds: ['hoffmann-flash-6040-v1', 'partners-flash-6733-v1', 'kurasu-iced-staged-v1', 'counterculture-flash-v1'] },
  'user-configuration': { allowedFields: ['dose', 'grinder'] },
});

export const V60_ICED_SOURCES = Object.freeze([
  {
    id: 'hoffmann-flash-6040-v1', author: 'James Hoffmann',
    canonicalUrl: 'https://www.youtube.com/watch?v=PApBycDrPo0', publication: 'iced filter coffee',
    evidenceType: 'primary', status: 'original', doseGrams: 32.5, hotWaterGrams: 300, iceGrams: 200, temperatureC: 100, grind: 'medium-fine',
    finalWaterGrams: 500, ratio: 500 / 32.5, family: 'classic-60-40', geometry: 'center bloom and controlled spirals', agitation: 'gentle settling only', guideSeconds: 240,
  },
  {
    id: 'partners-flash-6733-v1', author: 'Partners Coffee',
    canonicalUrl: 'https://help.partnerscoffee.com/en-US/flash-brew-413883', publication: 'flash brew',
    evidenceType: 'primary', status: 'original', doseGrams: 20, hotWaterGrams: 200, iceGrams: 100, temperatureC: 96, temperatureRangeC: [93, 96], grind: 'medium-fine',
    finalWaterGrams: 300, ratio: 15, family: 'pulse-67-33', geometry: 'center bloom and pulse pour', agitation: 'gentle carafe swirl', guideSeconds: 180, guideRangeSeconds: [160, 200], pourTargets: [{ seconds: 0, grams: 60 }, { seconds: 40, grams: 120 }, { seconds: 80, grams: 200 }], postBrewInstruction: 'After drawdown, give the gentle carafe swirl from the source.',
  },
  {
    id: 'kurasu-iced-staged-v1', author: 'Kurasu',
    canonicalUrl: 'https://kurasu.kyoto/blogs/recipe/japanese-brew-guide-on-iced-pour-over-coffee', publication: 'Japanese iced V60',
    evidenceType: 'primary', status: 'original', doseGrams: 16, hotWaterGrams: 150, iceGrams: 70, temperatureC: 91, grind: 'medium-fine',
    finalWaterGrams: 220, ratio: 13.75, family: 'pulse-67-33', geometry: 'small-radius staged pours', agitation: 'source-specific staged agitation', guideSeconds: 130, guideRangeSeconds: [125, 135], pourTargets: [{ seconds: 0, grams: 40 }, { seconds: 40, grams: 100 }, { seconds: 70, grams: 150 }], postBrewInstruction: 'After drawdown, melt the recipe ice before serving; serving ice is separate.',
  },
  {
    id: 'counterculture-flash-v1', author: 'Counter Culture Coffee',
    canonicalUrl: 'https://counterculturecoffee.com/pages/flash-brew', publication: 'flash brew',
    evidenceType: 'primary', status: 'corroboration', doseGrams: 30, hotWaterGrams: 335, iceGrams: 165, temperatureC: 93, grind: 'medium-fine',
    finalWaterGrams: 500, ratio: 500 / 30, family: 'pulse-67-33', geometry: 'circular pulse cadence', agitation: null, bloomGrams: 30, guideSeconds: null, guideRangeSeconds: null,
  },
]);

export const V60_ICED_TECHNIQUES = Object.freeze({
  classic6040: { id: 'classic-60-40-flash', sourceIds: ['hoffmann-flash-6040-v1'], label: 'classic 60/40 flash concentrate' },
  pulse6733: { id: 'pulse-67-33-flash', sourceIds: ['partners-flash-6733-v1'], label: 'pulse-driven 67/33 flash brew' },
  kurasuStaged: { id: 'kurasu-staged-flash', sourceIds: ['kurasu-iced-staged-v1'], label: 'Kurasu staged flash brew' },
  countercultureAdapted: { id: 'counterculture-adapted-flash', sourceIds: ['counterculture-flash-v1'], label: 'Counter Culture adapted pulse flash brew' },
});

export function icedSourceById(id) { return V60_ICED_SOURCES.find((source) => source.id === id) || null; }
export function isKnownV60IcedParameterSource(id) { return Boolean(icedSourceById(id) || V60_ICED_RULES[id]); }

export function validateV60IcedRegistry() {
  const errors = [];
  for (const source of V60_ICED_SOURCES) {
    if (!source.id || !source.author || !source.canonicalUrl || source.evidenceType !== 'primary') errors.push(`${source.id || 'unknown'}:missing-provenance`);
    if (!Number.isFinite(source.temperatureC) || !source.grind) errors.push(`${source.id}:missing-temperature-or-grind`);
    if (![source.doseGrams, source.hotWaterGrams, source.iceGrams, source.finalWaterGrams, source.ratio].every(Number.isFinite)) errors.push(`${source.id}:non-finite-math`);
    if (source.hotWaterGrams + source.iceGrams !== source.finalWaterGrams) errors.push(`${source.id}:water-sum-mismatch`);
    if (Math.abs(source.finalWaterGrams / source.doseGrams - source.ratio) > 0.01) errors.push(`${source.id}:ratio-mismatch`);
    const fraction = source.hotWaterGrams / source.finalWaterGrams;
    if (source.family === 'classic-60-40' && Math.abs(fraction - 0.6) > 0.01) errors.push(`${source.id}:classic-fraction-mismatch`);
    if (source.family === 'pulse-67-33' && source.id !== 'kurasu-iced-staged-v1' && Math.abs(fraction - 2 / 3) > 0.01) errors.push(`${source.id}:pulse-fraction-mismatch`);
  }
  return { valid: errors.length === 0, errors };
}
