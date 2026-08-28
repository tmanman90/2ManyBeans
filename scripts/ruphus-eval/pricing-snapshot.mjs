import { createHash } from 'node:crypto';
import { snapshotPricing, MODEL_PRICING, PRICING_REGISTRY_VERSION } from '../../api/_lib/modelPricing.js';
export function canonicalJson(value) { return JSON.stringify(value, Object.keys(value || {}).sort()); }
export function createPricingSnapshot(registry = MODEL_PRICING) {
  const snapshot = snapshotPricing(registry);
  const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return Object.freeze({ ...snapshot, hash });
}
export function assertPricingSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== PRICING_REGISTRY_VERSION || !snapshot.hash || !snapshot.models) throw new Error('invalid pricing snapshot');
  const copy = { ...snapshot }; delete copy.hash;
  const expected = createHash('sha256').update(JSON.stringify(copy)).digest('hex');
  if (expected !== snapshot.hash) throw new Error('pricing snapshot checksum mismatch');
  return true;
}
if (process.argv[1] && process.argv[1].endsWith('pricing-snapshot.mjs')) console.log(JSON.stringify(createPricingSnapshot(), null, 2));
