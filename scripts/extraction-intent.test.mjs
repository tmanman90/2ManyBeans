import assert from 'node:assert/strict';
import { buildExtractionIntent } from '../src/lib/extractionIntent.js';

const input = { process: 'washed', roastLevel: 'light', sourceInsights: { brewGuidance: 'Gentle pour' } };
const first = buildExtractionIntent(input, { cupStructureFamily: 'washed-floral-clarity' });
assert.deepEqual(first, buildExtractionIntent(input, { cupStructureFamily: 'washed-floral-clarity' }));
assert.equal(first.finesRisk, 'unknown');
const floralGuidance = buildExtractionIntent({
  process: 'washed',
  roastLevel: 'light',
  brewingRec: '13-14g coffee to 245g water (1:17.5-19), brew temp 93-97C',
}, { cupStructureFamily: 'washed-floral-clarity', extractionNotes: 'Keep agitation moderate.' });
assert.equal(floralGuidance.targetRatio, 18.3);
assert.equal(floralGuidance.targetTemperatureC, 95);
assert.equal(floralGuidance.techniquePreference, 'center-to-spiral-pulse');
const natural = buildExtractionIntent({ process: 'Anaerobic Natural', roastLevel: 'light' }, {
  cupStructureFamily: 'clean-natural-fruit', extractionNotes: 'Grind slightly coarser and control contact time.',
});
assert.equal(natural.techniquePreference, 'balanced');
assert.ok(natural.grindAdjustmentMicrons > 0);
const sparse = buildExtractionIntent({}, null);
assert.equal(sparse.confidence, 'low');
assert.ok(sparse.reasonCodes.includes('LOW_CONFIDENCE_DEFAULT'));

const denseWithoutFlowEvidence = buildExtractionIntent(
  { process: 'washed', roastLevel: 'light' },
  { densityEstimate: 'high', cupStructureFamily: 'washed-floral-clarity' },
);
assert.equal(denseWithoutFlowEvidence.finesRisk, 'unknown');
assert.equal(denseWithoutFlowEvidence.reasonCodes.includes('EXPLICIT_FLOW_RISK_GUARD'), false);

const modelOnlyFlowInference = buildExtractionIntent(
  { process: 'washed', roastLevel: 'light' },
  { extractionNotes: 'This coffee may produce a slow drawdown or stall.', cupStructureFamily: 'washed-floral-clarity' },
);
assert.equal(modelOnlyFlowInference.finesRisk, 'unknown');
assert.equal(modelOnlyFlowInference.reasonCodes.includes('EXPLICIT_FLOW_RISK_GUARD'), false);

const explicitFlowRisk = buildExtractionIntent(
  { process: 'washed', roastLevel: 'light', brewingRec: 'This coffee produces fines and may stall; reduce agitation.' },
  { densityEstimate: 'high', cupStructureFamily: 'washed-floral-clarity' },
);
assert.equal(explicitFlowRisk.finesRisk, 'high');
assert.ok(explicitFlowRisk.reasonCodes.includes('EXPLICIT_FLOW_RISK_GUARD'));

const denseNatural = buildExtractionIntent(
  { process: 'natural', roastLevel: 'light' },
  { densityEstimate: 'high', cupStructureFamily: 'clean-natural-fruit' },
);
assert.equal(denseNatural.finesRisk, 'moderate');
assert.equal(denseNatural.reasonCodes.some((code) => /WASHED_FLATBED/.test(code)), false);
console.log('extraction intent passed');
