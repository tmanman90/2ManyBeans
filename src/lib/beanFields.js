export const PROCESS_TYPES = [
  'Washed', 'Natural', 'Honey', 'Black Honey', 'White Honey',
  'Anaerobic Washed', 'Anaerobic Natural', 'Anaerobic Honey',
  'Anaerobic White Honey', 'Advanced Natural', 'Carbonic Maceration',
  'Lactic Fermentation', 'Double Washed', 'Wet-Hulled',
  'Infused / Co-Fermented', 'Other',
];

export const ENRICHABLE_FIELDS = [
  'altitude',
  'region',
  'farm',
  'roastLevel',
  'cupScore',
  'brewingRec',
  'sourcedBy',
  'variety',
  'process',
  'producer',
  'roastedIn',
  'roasterLocation',
  'roasterDescription',
  'roasterFounded',
  'redditNotes',
];

export function isBagNotesEmpty(bean) {
  return !bean.bagNotes || bean.bagNotes === '(not logged)';
}

export function classifyFamilyFallback(bean, defaultFamily = 'generic-washed') {
  const origin = (bean.origin || '').toLowerCase();
  const process = (bean.process || '').toLowerCase();
  const variety = (bean.variety || '').toLowerCase();
  const roastLevel = (bean.roastLevel || '').toLowerCase();
  const notes = (bean.bagNotes || '').toLowerCase();

  if (roastLevel.includes('dark')) return 'dark-roast';
  if (roastLevel === 'medium-dark') return 'dark-roast';

  if (roastLevel === 'medium' && process.includes('washed')) return 'medium-washed';

  if (variety.includes('sl28') || variety.includes('sl34') || variety === 'sl') return 'washed-kenya-clarity';

  if (process.includes('honey') || process.includes('anaerobic') || process.includes('co-ferment')
    || process.includes('carbonic') || process.includes('lactic')) return 'processed-clarity';

  if (variety.includes('gesha') || variety.includes('geisha')) {
    if (process.includes('natural')) return 'clean-natural-fruit';
    return 'washed-floral-clarity';
  }
  if (variety.includes('pink bourbon') && (notes.includes('floral') || notes.includes('jasmine'))) return 'washed-floral-clarity';

  if (process.includes('natural') && origin.includes('ethiopia')) return 'clean-natural-fruit';

  if (process.includes('washed') || process.includes('wet-hulled')
    || (!process.includes('natural') && !process.includes('honey'))) {
    if (origin.includes('kenya') || origin.includes('burundi')) return 'washed-kenya-clarity';
    if (origin.includes('ethiopia')) return 'washed-ethiopia-clarity';
    if (notes.includes('jasmine') || notes.includes('bergamot') || notes.includes('floral') || notes.includes('honeysuckle')) return 'washed-floral-clarity';
  }

  if (variety.includes('pacamara') || variety.includes('maragogipe')) {
    if (process.includes('natural')) return 'body-natural';
    return 'processed-clarity';
  }

  if (process.includes('natural')) return 'clean-natural-fruit';

  return defaultFamily;
}
