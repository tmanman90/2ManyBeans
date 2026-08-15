// Guards the trial-copy derivation. The bug this exists to prevent: onboarding
// promised a "7-day free trial" while App Store Connect had a 3-day intro offer
// on all four products.
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const {
  introOfferFromPackage,
  trialFromOffering,
  trialTimelineSteps,
  readWarmedTrial,
} = await import('../src/lib/trialOffer.js');

const pkg = (productId, introPrice) => ({ product: { identifier: productId, introPrice } });
const free = (periodNumberOfUnits, periodUnit) => ({ price: 0, priceString: '$0.00', periodNumberOfUnits, periodUnit });

// --- introOfferFromPackage -------------------------------------------------
assert.equal(introOfferFromPackage(pkg('x.pro.annual', free(3, 'DAY'))).label, '3-day free trial');
assert.equal(introOfferFromPackage(pkg('x.pro.annual', free(3, 'DAY'))).days, 3);
assert.equal(introOfferFromPackage(pkg('x', free(1, 'WEEK'))).label, '7-day free trial', 'weeks read as days');
assert.equal(introOfferFromPackage(pkg('x', free(1, 'MONTH'))).label, '1-month free trial');
assert.equal(introOfferFromPackage(pkg('x', { price: 0, priceString: '$0.00', period: { value: 3, unit: 'DAY' } })).days, 3, 'legacy period shape');

// No offer / paid intro offer must NEVER read as a trial.
assert.equal(introOfferFromPackage(pkg('x', null)), null);
assert.equal(introOfferFromPackage(pkg('x', undefined)), null);
assert.equal(introOfferFromPackage(pkg('x', { price: 1.99, priceString: '$1.99', periodNumberOfUnits: 1, periodUnit: 'MONTH' })), null, 'discounted intro is not a free trial');
assert.equal(introOfferFromPackage(pkg('x', free(undefined, 'DAY'))), null, 'unparseable period yields no promise');
assert.equal(introOfferFromPackage(null), null);

// --- trialFromOffering -----------------------------------------------------
const offering = {
  availablePackages: [
    pkg('com.talmeltzer.coffeehub.pro.monthly', free(3, 'DAY')),
    pkg('com.talmeltzer.coffeehub.pro.annual', free(3, 'DAY')),
  ],
};
assert.equal(trialFromOffering(offering).days, 3);
assert.equal(trialFromOffering({ availablePackages: [] }), null);
assert.equal(trialFromOffering(null), null);
// Falls back to any package carrying a free offer when Pro annual has none.
assert.equal(trialFromOffering({
  availablePackages: [pkg('x.pro.annual', null), pkg('x.ultra.annual', free(3, 'DAY'))],
}).days, 3);

// --- trialTimelineSteps ----------------------------------------------------
const three = trialTimelineSteps({ days: 3 });
assert.deepEqual(three.map(s => s.day), ['Today', 'Day 2', 'Day 3']);
const seven = trialTimelineSteps({ days: 7 });
assert.deepEqual(seven.map(s => s.day), ['Today', 'Day 6', 'Day 7']);
assert.deepEqual(trialTimelineSteps({ days: 1 }).map(s => s.day), ['Today', 'Day 1'], 'no middle beat on a 1-day trial');
assert.equal(trialTimelineSteps(null), null, 'no trial => caller renders the no-trial variant');

// --- readWarmedTrial -------------------------------------------------------
window.__rcOfferingsCache = undefined;
assert.equal(readWarmedTrial(), null);
window.__rcOfferingsCache = { error: new Error('rc_unavailable') };
assert.equal(readWarmedTrial(), null, 'a failed warm never invents a trial');
window.__rcOfferingsCache = { offerings: offering };
assert.equal(readWarmedTrial().label, '3-day free trial');

console.log('trial-offer.test.mjs: all assertions passed');
