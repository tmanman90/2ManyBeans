// Single source of truth for enrichable bean fields.
// Used by AddBeanForm (scan + AI Fill), QuickRecipeFlow (ephemeral enrichment),
// and useProfessorRuphus (silent Ruphus-triggered enrichment).

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
];

// Subset that gates Ruphus-triggered enrichment. bagNotes is handled separately
// because it uses the '(not logged)' sentinel and comes from summarizeNotes(redditNotes).
const RUPHUS_ENRICH_GATE_FIELDS = ['altitude', 'region', 'farm', 'variety', 'producer'];

export function isBagNotesEmpty(bean) {
  return !bean.bagNotes || bean.bagNotes === '(not logged)';
}

export function beanNeedsRuphusEnrichment(bean) {
  if (!bean || !bean.id) return false;
  if (bean.enrichedAt) return false;
  if (isBagNotesEmpty(bean)) return true;
  return RUPHUS_ENRICH_GATE_FIELDS.some(f => !bean[f]);
}
