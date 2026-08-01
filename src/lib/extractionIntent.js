import { normalizeRecipeEvidence } from './recipeEvidence.js';

const stable = (value) => JSON.parse(JSON.stringify(value));

export function buildExtractionIntent(evidenceOrBean = {}, research = null) {
  const evidence = evidenceOrBean?.facts ? evidenceOrBean : normalizeRecipeEvidence(evidenceOrBean, research);
  const process = evidence.facts.find((fact) => fact.field === 'process')?.value?.toLowerCase() || '';
  const roast = evidence.facts.find((fact) => fact.field === 'roastLevel')?.value?.toLowerCase()
    || evidence.research?.roastLevel?.toLowerCase() || '';
  const family = evidence.research?.cupStructureFamily || (process.includes('natural') ? 'body-natural' : process.includes('washed') ? 'generic-washed' : 'unknown');
  const guidance = evidence.sourceInsights?.brewGuidance?.toLowerCase() || '';
  const dark = roast.includes('dark');
  const natural = /natural|anaerobic|honey|co-ferment/.test(process);
  const washed = process.includes('washed');
  const highFinesRisk = washed && !dark;
  const lowEnergy = dark || guidance.includes('lower temperature');
  const intent = {
    version: 1,
    family,
    cupDirection: dark || natural ? { clarity: 'balanced', body: 'supported', sweetness: 'high' } : { clarity: 'high', body: 'balanced', sweetness: 'high' },
    solubilityRisk: dark || natural ? 'high' : highFinesRisk ? 'moderate' : 'unknown',
    finesRisk: highFinesRisk ? 'high' : natural ? 'moderate' : 'unknown',
    energyTendency: lowEnergy ? 'lower' : washed ? 'higher' : 'conservative',
    desiredStrength: dark ? 'standard' : 'balanced',
    confidence: evidence.confidence,
    uncertainty: evidence.unknowns,
    conflicts: evidence.conflicts,
    reasonCodes: [
      highFinesRisk && 'WASHED_FLATBED_FINES_GUARD', natural && 'HIGH_SOLUBILITY_GENTLE_EXTRACTION',
      dark && 'DARK_ROAST_LOWER_ENERGY', guidance && 'SOURCE_GUIDANCE_PRESENT',
      evidence.conflicts.length && 'EVIDENCE_CONFLICT_CONSERVATIVE_DEFAULT',
      evidence.confidence === 'low' && 'LOW_CONFIDENCE_DEFAULT',
    ].filter(Boolean),
    evidenceHash: evidence.sourceContextHash,
  };
  return stable(intent);
}
