import { hashValue, immutableSnapshot } from './contracts.mjs';
import { SHIPPING_BASELINE } from './models.mjs';

export const PRODUCT_BASELINE_VERSION = 'ruphus-u6-shipping-baseline-v1';

/**
 * The shipping chat is architecture context only. It is never accepted by
 * tournament ranking, hard gates, finalist selection, or common-envelope
 * denominators.
 */
export function createProductBaseline({ observations = [], source = 'offline-shipping-context' } = {}) {
  if (!Array.isArray(observations)) throw new Error('baseline observations must be an array');
  const safe = observations.map((observation) => {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) throw new Error('baseline observation must be an object');
    return immutableSnapshot({
      caseId: typeof observation.caseId === 'string' ? observation.caseId : null,
      outcome: typeof observation.outcome === 'string' ? observation.outcome : 'unobserved',
      evidenceTier: observation.evidenceTier || 'synthetic/mock',
      checksum: typeof observation.checksum === 'string' ? observation.checksum : hashValue(observation),
    });
  });
  return immutableSnapshot({
    type: 'shipping-product-baseline', version: PRODUCT_BASELINE_VERSION,
    source, arm: SHIPPING_BASELINE, rankingEligible: false,
    observations: safe, baselineHash: hashValue(safe),
  });
}

export function assertProductBaselineSeparate(value) {
  if (!value || value.type !== 'shipping-product-baseline' || value.rankingEligible !== false || value.arm?.rankingEligible !== false) throw new Error('shipping baseline is ranking-ineligible');
  return true;
}

export const PRODUCT_BASELINE = createProductBaseline();
