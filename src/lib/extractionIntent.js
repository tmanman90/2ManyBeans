import { normalizeRecipeEvidence } from './recipeEvidence.js';

const stable = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function factValue(evidence, field) {
  return evidence.facts.find((fact) => fact.field === field)?.value || '';
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function parseTemperatureBand(text) {
  const values = [];
  for (const match of String(text || '').matchAll(/(\d{2,3})(?:\s*[-–]\s*(\d{2,3}))?\s*(?:°\s*)?C\b/gi)) {
    values.push(Number(match[1]));
    if (match[2]) values.push(Number(match[2]));
  }
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function parseRatioBand(text) {
  const values = [];
  for (const match of String(text || '').matchAll(/(?:^|[^\d])1\s*:\s*(\d+(?:\.\d+)?)(?:\s*[-–]|\s+to\s+)?\s*(?:1\s*:\s*)?(\d+(?:\.\d+)?)?/gi)) {
    values.push(Number(match[1]));
    if (match[2]) values.push(Number(match[2]));
  }
  if (!values.length) return null;
  return clamp(Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10, 15.5, 19);
}

function firstHint(parser, sources) {
  for (const source of sources) {
    const value = parser(source);
    if (value != null) return value;
  }
  return null;
}

export function buildExtractionIntent(evidenceOrBean = {}, research = null) {
  const evidence = evidenceOrBean?.facts ? evidenceOrBean : normalizeRecipeEvidence(evidenceOrBean, research);
  const process = factValue(evidence, 'process').toLowerCase();
  const roast = (factValue(evidence, 'roastLevel') || evidence.research?.roastLevel || '').toLowerCase();
  const family = evidence.research?.cupStructureFamily
    || (process.includes('natural') ? 'body-natural' : process.includes('washed') ? 'generic-washed' : 'unknown');
  const sourceGuidance = evidence.sourceInsights?.brewGuidance || '';
  const storedGuidance = [factValue(evidence, 'brewingRec'), factValue(evidence, 'bagNotes')].filter(Boolean).join(' ');
  const researchGuidance = [
    evidence.research?.processingNuance,
    evidence.research?.extractionNotes,
    evidence.research?.flavorExpectations,
    evidence.research?.roasterStyle,
  ].filter(Boolean).join(' ');
  const allGuidance = [sourceGuidance, storedGuidance, researchGuidance].filter(Boolean).join(' ').toLowerCase();
  const dark = roast.includes('dark');
  const natural = /natural|anaerobic|honey|co-ferment/.test(`${process} ${evidence.research?.processingNuance || ''}`.toLowerCase());
  const washed = process.includes('washed');
  const evidenceBackedFines = /fines|stall|clog|permeability|high[- ]density|dense/.test(allGuidance)
    || String(evidence.research?.densityEstimate || '').toLowerCase().includes('high');
  const highFinesRisk = evidenceBackedFines;
  const sourceTemperature = firstHint(parseTemperatureBand, [sourceGuidance]);
  const storedTemperature = firstHint(parseTemperatureBand, [storedGuidance]);
  const researchTemperature = firstHint(parseTemperatureBand, [researchGuidance]);
  const targetTemperatureC = sourceTemperature ?? storedTemperature ?? researchTemperature
    ?? (dark ? 93 : natural ? 96 : 96);
  const sourceRatio = firstHint(parseRatioBand, [sourceGuidance]);
  const storedRatio = firstHint(parseRatioBand, [storedGuidance]);
  const researchRatio = firstHint(parseRatioBand, [researchGuidance]);
  const targetRatio = sourceRatio ?? storedRatio ?? researchRatio
    ?? (dark ? 15.5 : family.includes('floral') || family.includes('ethiopia') ? 17.5 : natural ? 16.5 : 16.5);
  const finerHints = countMatches(allGuidance, /\bfiner\b|medium-fine|increase contact|higher extraction/g);
  const coarserHints = countMatches(allGuidance, /\bcoarser\b|coarsen|avoid(?:ing)?\s+(?:pushing )?too fine|reduce agitation|shorten contact/g);
  let grindAdjustmentMicrons = evidence.research?.densityEstimate?.toLowerCase().includes('high') ? -20 : 0;
  if (finerHints > coarserHints) grindAdjustmentMicrons -= 15;
  if (coarserHints > finerHints) grindAdjustmentMicrons += 20;
  if (natural && finerHints === 0 && coarserHints === 0) grindAdjustmentMicrons += 10;
  const explicitLowAgitation = /low[- ]agitation|reduce agitation|gentle (?:pour|agitation)|do not swirl|avoid(?:ing)?\s+(?:excessive|over-?aggressive)\s+agitation/.test(allGuidance);
  const explicitPulse = /pulse|staged pours?|multiple pours?/.test(allGuidance);
  const explicitModerate = /moderate agitation|steady drawdown|even saturation|center-to-spiral/.test(allGuidance);
  const techniquePreference = natural && explicitPulse
    ? 'bloom-led-pulse'
    : explicitLowAgitation
      ? 'low-agitation-center'
      : explicitPulse || explicitModerate || family.includes('floral') || family.includes('ethiopia')
        ? 'center-to-spiral-pulse'
        : 'balanced';
  const explicitContactAdjustment = /extend contact|increase contact|longer contact|slow drawdown/.test(allGuidance)
    ? 15
    : /avoid over-?extended|shorten contact|shorter contact|reduce contact/.test(allGuidance)
      ? -15
      : null;
  const contactTimeAdjustmentSeconds = explicitContactAdjustment ?? (targetRatio >= 18 ? 15 : targetRatio >= 17.5 ? 10 : 0);
  const lowEnergy = dark || /lower temperature|reduce temperature|avoid pushing too hot/.test(allGuidance) || targetTemperatureC <= 95;
  const energyTendency = lowEnergy ? 'lower' : washed ? 'higher' : 'conservative';
  const intent = {
    version: 3,
    methodNeutral: true,
    // Adapters own technique names. These fields describe physical intent only
    // and can be consumed by Kalita, hot V60, or iced V60 independently.
    extractionDemand: dark ? 'lower-energy' : highFinesRisk ? 'careful-even-saturation' : energyTendency === 'higher' ? 'higher-energy' : 'balanced',
    balancedCupGoal: 'balanced',
    temperatureTendency: energyTendency,
    agitationTendency: explicitLowAgitation ? 'low' : explicitPulse ? 'pulsed' : 'moderate',
    bloomBehavior: natural ? 'freshness-restraint' : 'standard-wet-bed',
    softPriors: { process: natural ? 'fruit-processed' : washed ? 'washed' : 'unknown', roast: dark ? 'developed' : roast || 'unknown' },
    family,
    cupDirection: dark || natural ? { clarity: 'balanced', body: 'supported', sweetness: 'high' } : { clarity: 'high', body: 'balanced', sweetness: 'high' },
    solubilityRisk: dark || natural ? 'high' : highFinesRisk ? 'moderate' : 'unknown',
    finesRisk: highFinesRisk ? 'high' : natural ? 'moderate' : 'unknown',
    energyTendency,
    desiredStrength: dark ? 'stronger' : 'balanced',
    targetTemperatureC: clamp(targetTemperatureC, 93, 100),
    targetRatio,
    grindAdjustmentMicrons: clamp(grindAdjustmentMicrons, -45, 45),
    techniquePreference,
    contactTimeAdjustmentSeconds,
    confidence: evidence.confidence,
    uncertainty: evidence.unknowns,
    conflicts: evidence.conflicts,
    reasonCodes: [
      highFinesRisk && 'WASHED_FLATBED_FINES_GUARD', natural && 'HIGH_SOLUBILITY_GENTLE_EXTRACTION',
      dark && 'DARK_ROAST_LOWER_ENERGY', sourceGuidance && 'SOURCE_GUIDANCE_PRESENT',
      (sourceTemperature || storedTemperature || researchTemperature) && 'TEMPERATURE_GUIDANCE_PRESENT',
      (sourceRatio || storedRatio || researchRatio) && 'RATIO_GUIDANCE_PRESENT',
      !explicitContactAdjustment && contactTimeAdjustmentSeconds > 0 && 'RATIO_CONTACT_BAND',
      explicitLowAgitation && 'LOW_AGITATION_GUIDANCE', explicitModerate && 'MODERATE_AGITATION_GUIDANCE',
      evidence.conflicts.length && 'EVIDENCE_CONFLICT_CONSERVATIVE_DEFAULT',
      evidence.confidence === 'low' && 'LOW_CONFIDENCE_DEFAULT',
    ].filter(Boolean),
    evidenceHash: evidence.sourceContextHash,
    sourceRecipes: evidence.sourceInsights?.brewRecipes || [],
  };
  return stable(intent);
}
