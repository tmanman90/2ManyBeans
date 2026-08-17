// Mock of @revenuecat/purchases-capacitor for the paywall screenshot harness.
// Aliased in vite.paywall-harness.config.mjs so src/lib/revenuecat.js runs its
// REAL code path (isRevenueCatAvailable → initRevenueCat → getOfferings) against
// a fake StoreKit payload instead of the native bridge.
//
// Prices mirror docs/prds/subscription-paywall-prd.md. Trial length is driven by
// the `?trial=` query param (e.g. ?trial=3day, ?trial=7day, ?trial=none) so we can
// screenshot exactly what each App Store Connect intro-offer config would render.
//
// `?purchase=slow` holds purchasePackage() open indefinitely so
// usePaywallPurchase's `purchasing` state (spinner + disabled CTA) is
// screenshot-able — it resolves synchronously otherwise.

const params = new URLSearchParams(window.location.search);
const trial = params.get('trial') ?? '3day';

function introPrice() {
  if (trial === 'none') return null;
  const m = /^(\d+)(day|week|month)$/.exec(trial);
  if (!m) return null;
  return {
    price: 0,
    priceString: '$0.00',
    period: `P${m[1]}${m[2][0].toUpperCase()}`,
    periodUnit: m[2].toUpperCase(),
    periodNumberOfUnits: Number(m[1]),
    cycles: 1,
  };
}

function pkg(identifier, packageType, productId, price, priceString) {
  return {
    identifier,
    packageType,
    offeringIdentifier: 'default',
    product: {
      identifier: productId,
      description: productId,
      title: productId,
      price,
      priceString,
      currencyCode: 'USD',
      introPrice: introPrice(),
    },
  };
}

const OFFERING = {
  identifier: 'default',
  serverDescription: 'Coffee Hub default offering',
  metadata: {},
  availablePackages: [
    pkg('$rc_monthly', 'MONTHLY', 'com.talmeltzer.coffeehub.pro.monthly', 4.99, '$4.99'),
    pkg('$rc_annual', 'ANNUAL', 'com.talmeltzer.coffeehub.pro.annual', 49.99, '$49.99'),
    pkg('ultra_monthly', 'CUSTOM', 'com.talmeltzer.coffeehub.ultra.monthly', 9.99, '$9.99'),
    pkg('ultra_annual', 'CUSTOM', 'com.talmeltzer.coffeehub.ultra.annual', 99.99, '$99.99'),
  ],
};

export const LOG_LEVEL = { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

export const Purchases = {
  async setLogLevel() {},
  async configure() {},
  async addCustomerInfoUpdateListener() { return { remove() {} }; },
  async getOfferings() {
    // Small delay so the loading state is reachable for a screenshot.
    await new Promise((r) => setTimeout(r, params.get('slow') ? 60000 : 120));
    if (params.get('offerings') === 'empty') {
      return { current: { ...OFFERING, availablePackages: [] }, all: {} };
    }
    if (params.get('offerings') === 'null') return { current: null, all: {} };
    return { current: OFFERING, all: { default: OFFERING } };
  },
  async purchasePackage() {
    if (params.get('purchase') === 'slow') await new Promise((r) => setTimeout(r, 60000));
    return { customerInfo: { entitlements: { active: {} } } };
  },
  async restorePurchases() { return { customerInfo: { entitlements: { active: {} } } }; },
  async getCustomerInfo() { return { customerInfo: { entitlements: { active: {} } } }; },
};

export default { Purchases, LOG_LEVEL };
