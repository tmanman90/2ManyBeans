export const V60_ICED_SOURCE_REGISTRY_VERSION = 'v60-iced-sources-v1';

export const V60_ICED_SOURCES = Object.freeze([
  {
    id: 'hoffmann-flash-6040-v1', author: 'James Hoffmann',
    canonicalUrl: 'https://www.youtube.com/watch?v=PApBycDrPo0', publication: 'iced filter coffee',
    evidenceType: 'primary', status: 'original', doseGrams: 32.5, hotWaterGrams: 325, iceGrams: 216.7,
    ratio: 20, family: 'classic-60-40', geometry: 'center bloom and controlled spirals', agitation: 'gentle settling only', guideSeconds: 240,
  },
  {
    id: 'partners-flash-6733-v1', author: 'Partners Coffee',
    canonicalUrl: 'https://help.partnerscoffee.com/en-US/flash-brew-413883', publication: 'flash brew',
    evidenceType: 'primary', status: 'original', doseGrams: 20, hotWaterGrams: 200, iceGrams: 100,
    ratio: 15, family: 'pulse-67-33', geometry: 'center bloom and pulse pour', agitation: 'no final swirl', guideSeconds: 180,
  },
  {
    id: 'kurasu-iced-staged-v1', author: 'Kurasu',
    canonicalUrl: 'https://kurasu.kyoto/blogs/recipe/japanese-brew-guide-on-iced-pour-over-coffee', publication: 'Japanese iced V60',
    evidenceType: 'primary', status: 'original', doseGrams: 16, hotWaterGrams: 150, iceGrams: 70,
    ratio: 13.75, family: 'pulse-67-33', geometry: 'small-radius staged pours', agitation: 'source-specific staged agitation', guideSeconds: 180,
  },
  {
    id: 'counterculture-flash-v1', author: 'Counter Culture Coffee',
    canonicalUrl: 'https://counterculturecoffee.com/pages/flash-brew', publication: 'flash brew',
    evidenceType: 'primary', status: 'original', doseGrams: 30, hotWaterGrams: 335, iceGrams: 165,
    ratio: 16.67, family: 'pulse-67-33', geometry: 'center bloom with controlled pulses', agitation: 'avoid aggressive swirl', guideSeconds: 210,
  },
]);

export const V60_ICED_TECHNIQUES = Object.freeze({
  classic6040: { id: 'classic-60-40-flash', sourceIds: ['hoffmann-flash-6040-v1'], label: 'classic 60/40 flash concentrate' },
  pulse6733: { id: 'pulse-67-33-flash', sourceIds: ['partners-flash-6733-v1'], label: 'pulse-driven 67/33 flash brew' },
  kurasuStaged: { id: 'kurasu-staged-flash', sourceIds: ['kurasu-iced-staged-v1'], label: 'Kurasu staged flash brew' },
});

export function icedSourceById(id) { return V60_ICED_SOURCES.find((source) => source.id === id) || null; }

export function validateV60IcedRegistry() {
  const errors = [];
  for (const source of V60_ICED_SOURCES) {
    if (!source.id || !source.author || !source.canonicalUrl || source.evidenceType !== 'primary') errors.push(`${source.id || 'unknown'}:missing-provenance`);
    if (![source.doseGrams, source.hotWaterGrams, source.iceGrams, source.ratio].every(Number.isFinite)) errors.push(`${source.id}:non-finite-math`);
  }
  return { valid: errors.length === 0, errors };
}
