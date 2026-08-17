// Dev-app-only stand-in for a RevenueCat offering.
//
// WHY THIS EXISTS
// The dev app ships under bundle id `com.talmeltzer.coffeehub.dev`, but every
// StoreKit product (`com.talmeltzer.coffeehub.pro.annual`, ...) lives under the
// PRODUCTION app record `com.talmeltzer.coffeehub`. StoreKit resolves in-app
// purchase products against the running app's bundle id, so the dev app can
// never load real products — `Purchases.getOfferings()` fails there and always
// will, regardless of which paywall UI is rendered. That makes the paywall
// impossible to review on the dev app, which is the only place it gets
// reviewed before TestFlight.
//
// This returns a shape-compatible offering so the whole flow (prices, savings
// math, trial copy, selection, fineprint) can be exercised on-device. Purchases
// still cannot complete — tapping the CTA will fail at the StoreKit boundary,
// which is correct and expected.
//
// SAFETY: gated on the dev build variant AND used only after a real fetch has
// already failed. It cannot execute in a production build; `__APP_VARIANT__` is
// a compile-time define (vite.config.js), so this module is dead code that gets
// tree-shaken out of the prod bundle. The paywall also renders a visible DEV
// PRICES marker whenever these values are in use, so they can never be mistaken
// for the real thing.

/** True only in the dev-variant build. */
export function devOfferingsEnabled() {
  try {
    return typeof __APP_VARIANT__ !== 'undefined' && __APP_VARIANT__ === 'dev';
  } catch {
    return false;
  }
}

// Mirrors ASC: 3-day free introductory offer on all four products.
function freeIntro() {
  return {
    price: 0,
    priceString: '$0.00',
    period: 'P3D',
    periodUnit: 'DAY',
    periodNumberOfUnits: 3,
  };
}

function pkg(identifier, productId, price, priceString) {
  return {
    identifier,
    packageType: identifier,
    // RevenueCat's purchasePackage() requires this key and throws
    // "package argument did not have presentedOfferingContext" without it.
    // Purchases still cannot complete on the dev app — the paywall
    // short-circuits before calling the SDK — but the shape stays honest.
    presentedOfferingContext: {
      offeringIdentifier: 'dev_stub',
      placementIdentifier: null,
      targetingContext: null,
    },
    offeringIdentifier: 'dev_stub',
    product: {
      identifier: productId,
      price,
      priceString,
      currencyCode: 'USD',
      introPrice: freeIntro(),
    },
  };
}

/**
 * An offering shaped like RevenueCat's, carrying the four real product ids so
 * the paywall's product-id substring matching works unchanged.
 * Prices mirror App Store Connect but are NOT authoritative — they are only
 * ever shown on the dev app, behind the DEV PRICES marker.
 */
export function devOffering() {
  return {
    identifier: 'dev_stub',
    serverDescription: 'Local dev stand-in — not a real RevenueCat offering',
    availablePackages: [
      pkg('$rc_monthly', 'com.talmeltzer.coffeehub.pro.monthly', 4.99, '$4.99'),
      pkg('$rc_annual', 'com.talmeltzer.coffeehub.pro.annual', 49.99, '$49.99'),
      pkg('ultra_monthly', 'com.talmeltzer.coffeehub.ultra.monthly', 9.99, '$9.99'),
      pkg('ultra_annual', 'com.talmeltzer.coffeehub.ultra.annual', 99.99, '$99.99'),
    ],
  };
}
