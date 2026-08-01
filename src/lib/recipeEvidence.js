import { buildSourceContextHash, normalizeSourceInsights, sanitizeSourceText } from './sourceInsights.js';

const ALLOWED_FAMILIES = new Set([
  'washed-floral-clarity', 'washed-kenya-clarity', 'washed-ethiopia-clarity',
  'washed-washed', 'clean-natural-fruit', 'processed-clarity', 'medium-washed', 'dark-roast', 'body-natural', 'generic-washed',
]);

const clean = (value, max = 180) => sanitizeSourceText(value, max);
const sourceFact = (field, value, confidence = 'high') => value ? { field, value: clean(value), sourceKind: 'source-insights', confidence, state: 'sourced' } : null;
const storedFact = (field, value) => value ? { field, value: clean(value), sourceKind: 'bean-record', confidence: 'medium', state: 'stored' } : null;
const modelFact = (field, value) => value ? { field, value: clean(value), sourceKind: 'model-inference', confidence: 'low', state: 'inferred' } : null;

export function normalizeResearchResult(research) {
  if (!research || typeof research !== 'object' || Array.isArray(research)) return { value: null, failure: 'missing-or-malformed-research' };
  const result = {};
  for (const key of ['roastLevel', 'processingNuance', 'densityEstimate', 'flavorExpectations', 'extractionNotes', 'cupStructureFamily', 'roasterStyle', 'altitude']) {
    if (typeof research[key] === 'string' && clean(research[key])) result[key] = clean(research[key]);
  }
  if (result.cupStructureFamily && !ALLOWED_FAMILIES.has(result.cupStructureFamily)) return { value: null, failure: 'invalid-cup-structure-family' };
  return { value: result, failure: null };
}

export function normalizeRecipeEvidence(bean = {}, research = null) {
  const source = normalizeSourceInsights(bean.sourceInsights);
  const normalizedResearch = normalizeResearchResult(research);
  const facts = [
    sourceFact('brewGuidance', source?.brewGuidance),
    sourceFact('sensoryDescriptors', source?.sensoryDescriptors?.join(', '), source?.sensoryDescriptors?.length ? 'high' : undefined),
    sourceFact('roasterContext', source?.roasterContext),
    storedFact('process', bean.process), storedFact('roastLevel', bean.roastLevel),
    storedFact('bagNotes', bean.bagNotes), storedFact('brewingRec', bean.brewingRec),
    storedFact('origin', bean.origin), storedFact('altitude', bean.altitude),
    modelFact('cupStructureFamily', normalizedResearch.value?.cupStructureFamily),
    modelFact('densityEstimate', normalizedResearch.value?.densityEstimate),
    modelFact('extractionNotes', normalizedResearch.value?.extractionNotes),
    modelFact('flavorExpectations', normalizedResearch.value?.flavorExpectations),
    modelFact('processingNuance', normalizedResearch.value?.processingNuance),
    modelFact('roasterStyle', normalizedResearch.value?.roasterStyle),
  ].filter(Boolean);
  const conflicts = [];
  const sourceText = [source?.brewGuidance, bean.brewingRec, bean.bagNotes].filter(Boolean).join(' ').toLowerCase();
  const modelFamily = normalizedResearch.value?.cupStructureFamily;
  if (/(?:low|lower) temperature/.test(sourceText) && /washed-(floral|kenya|ethiopia)-clarity/.test(modelFamily || '')) conflicts.push('source-guidance-vs-model-energy');
  if (/natural/.test(String(bean.process || '').toLowerCase()) && modelFamily?.startsWith('washed-')) conflicts.push('stored-process-vs-model-family');
  const confidence = source ? 'high' : normalizedResearch.value ? 'low' : 'low';
  return {
    version: 1,
    sourceContextHash: buildSourceContextHash({ ...bean, beanResearch: normalizedResearch.value || bean.beanResearch }),
    facts,
    sourceInsights: source,
    research: normalizedResearch.value,
    researchFailure: normalizedResearch.failure,
    conflicts,
    confidence,
    unknowns: [!source && 'no-source-insights', !normalizedResearch.value && 'no-valid-model-inference', !bean.roastDate && 'no-roast-date'].filter(Boolean),
  };
}
