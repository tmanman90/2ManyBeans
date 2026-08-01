import assert from 'node:assert/strict';
import { buildExtractionIntent } from '../src/lib/extractionIntent.js';

const input = { process: 'washed', roastLevel: 'light', sourceInsights: { brewGuidance: 'Gentle pour' } };
const first = buildExtractionIntent(input, { cupStructureFamily: 'washed-floral-clarity' });
assert.deepEqual(first, buildExtractionIntent(input, { cupStructureFamily: 'washed-floral-clarity' }));
assert.equal(first.finesRisk, 'high');
const sparse = buildExtractionIntent({}, null);
assert.equal(sparse.confidence, 'low');
assert.ok(sparse.reasonCodes.includes('LOW_CONFIDENCE_DEFAULT'));
console.log('extraction intent passed');
