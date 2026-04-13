// Single-flight preload of the RevenueCat offerings cache.
//
// Fired from R7 mount so the result is cached by the time R13 renders.
// R9's processing animation is the wall-clock race the preload needs to
// beat; R7 → R9 gives us one extra screen of headroom over the original
// plan of starting the preload at R8.
//
// Guarantees:
// - One in-flight request at a time (React StrictMode mounts effects
//   twice in dev; the module-level sentinel prevents both mounts from
//   firing `getOfferings` in parallel).
// - A prior success is never clobbered by a later failure.
// - On resolution/rejection the cache is written to `window.__rcOfferingsCache`
//   which R13's hook reads synchronously.

import { getOfferings, isRevenueCatAvailable } from '../../lib/revenuecat';
import { logOnboardingEvent } from '../../lib/onboardingAnalytics';

let inflight = null;

function hasSuccess() {
  const cache = typeof window !== 'undefined' ? window.__rcOfferingsCache : null;
  return !!(cache && !cache.error);
}

export function warmPaywallOfferings() {
  if (typeof window === 'undefined') return null;
  if (hasSuccess()) return null;
  if (inflight) return inflight;
  if (!isRevenueCatAvailable()) {
    window.__rcOfferingsCache = { error: new Error('rc_unavailable'), fetchedAt: Date.now() };
    return null;
  }

  inflight = getOfferings()
    .then((offerings) => {
      // Don't clobber a prior success if two frames somehow resolved.
      if (!hasSuccess()) {
        window.__rcOfferingsCache = { offerings, fetchedAt: Date.now() };
      }
    })
    .catch((error) => {
      if (!window.__rcOfferingsCache) {
        window.__rcOfferingsCache = { error, fetchedAt: Date.now() };
      }
      logOnboardingEvent('onboarding_offerings_fetch_failed', {
        error: String(error?.message || error || '').slice(0, 200),
      });
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
