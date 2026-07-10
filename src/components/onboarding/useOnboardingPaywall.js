// useOnboardingPaywall — R13's branching brain.
//
// R13 has to disambiguate several mutually-exclusive signals against
// the RevenueCat hydration state:
//
//   - status: 'hydrating' | 'skip_web' | 'skip_no_rc' |
//              'skip_already_subscribed' | 'ready'
//
// and it has to tell apart these cases on the terminal close event:
//
//   - The user purchased → proceed to home screen, skip R13b
//   - The user dismissed → 500ms pause (to let the hasPro listener
//     propagate) → if still not subscribed, drop into R13b
//
// The purchase-vs-dismiss ambiguity exists because PaywallSheet's own
// close handler fires for BOTH outcomes, and the hasPro signal may
// arrive slightly after the close due to the SubscriptionContext
// listener timing. A 500ms disambiguation timer + a flowCompleted
// ref handles this without racing.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { isRevenueCatAvailable } from '../../lib/revenuecat';
import { PAYWALL_DISMISS_DISAMBIG_MS as DISMISS_DISAMBIG_MS } from './onboardingConstants';

export function useOnboardingPaywall() {
  const { firestoreLoaded, rcHydrated, hasPro, hasUltra } = useSubscription();
  const { openPaywall, close: closePaywall } = usePaywall();

  // Refs so the disambig timer can read the latest values without
  // rebinding itself on every hasPro tick.
  const hasProRef = useRef(hasPro);
  const hasUltraRef = useRef(hasUltra);
  useEffect(() => { hasProRef.current = hasPro; }, [hasPro]);
  useEffect(() => { hasUltraRef.current = hasUltra; }, [hasUltra]);

  const flowCompletedRef = useRef(false);
  const dismissTimerRef = useRef(null);

  const status = useMemo(() => {
    // Test seam (additive, no-op in prod): forces a specific status so the
    // onboarding harness can exercise R13's 'ready' recap + redemption paths
    // without a real RevenueCat/native environment.
    const forced = window.__ONBOARDING_TEST__?.paywall?.status;
    if (forced) return forced;
    if (!firestoreLoaded || !rcHydrated) return 'hydrating';
    if (!Capacitor.isNativePlatform()) return 'skip_web';
    if (!isRevenueCatAvailable()) return 'skip_no_rc';
    if (hasPro || hasUltra) return 'skip_already_subscribed';
    return 'ready';
  }, [firestoreLoaded, rcHydrated, hasPro, hasUltra]);

  const openOnboardingPaywall = useCallback(() => {
    openPaywall({ feature: 'onboarding', promote: 'pro' });
  }, [openPaywall]);

  // Called when PaywallSheet's own close handler fires. We don't know
  // yet whether this close was caused by a successful purchase or a
  // dismiss, so we wait DISMISS_DISAMBIG_MS for hasPro/hasUltra to
  // (maybe) propagate, then decide.
  //
  // onPurchased / onDismissed are caller-provided callbacks; the caller
  // owns the "what to do next" side of the decision (typically
  // dispatching COMPLETE or advancing to R13b).
  const handleDismissOrPurchase = useCallback((onPurchased, onDismissed) => {
    if (flowCompletedRef.current) return;
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      if (flowCompletedRef.current) return;
      flowCompletedRef.current = true;
      if (hasProRef.current || hasUltraRef.current) {
        onPurchased?.();
      } else {
        onDismissed?.();
      }
    }, DISMISS_DISAMBIG_MS);
  }, []);

  // Cleanup the timer if the hook unmounts (e.g. user navigates away
  // during the disambiguation window).
  useEffect(() => () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  return {
    status,
    openOnboardingPaywall,
    handleDismissOrPurchase,
    closePaywall,
    flowCompletedRef,
  };
}
