// usePaywall: gate AI features behind the subscription.
//
// Provides a set of `require*` helpers that wrap an action:
//   - requirePro(action)            → Pro or Ultra required
//   - requireUltra(action, opts)    → Ultra only (Aiden push, multi-brewer)
//   - requireScanQuota(action)      → Free gets 3 lifetime, else Pro
//   - requireTasteQuota(action)     → Free gets 1 lifetime, else Pro
//
// If the check passes, the action runs. Otherwise the paywall opens with
// a context hint ("scan_cap" / "aiden" / etc.) so the paywall UI can
// promote the right tier (Pro for general AI, Ultra when a Fellow-Aiden-
// specific feature was blocked).
//
// Pair with the PaywallSheet component which reads the context and
// renders accordingly.

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';

const PaywallContext = createContext(null);

/**
 * Provider wraps the app once. Exposes the paywall state and the require*
 * helpers. Renders children + the actual PaywallSheet (imported lazily by
 * main.jsx to avoid pulling it on web boots that will never show it).
 */
export function PaywallProvider({ children }) {
  const { hasPro, hasUltra, freeUsage } = useSubscription();
  const [paywallContext, setPaywallContext] = useState(null);

  const close = useCallback(() => setPaywallContext(null), []);

  const requirePro = useCallback(
    (action, { feature = 'generic', promote = 'pro' } = {}) => {
      if (hasPro) return action?.();
      setPaywallContext({ trigger: feature, promote });
      return undefined;
    },
    [hasPro]
  );

  const requireUltra = useCallback(
    (action, { feature = 'aiden' } = {}) => {
      if (hasUltra) return action?.();
      setPaywallContext({ trigger: feature, promote: 'ultra' });
      return undefined;
    },
    [hasUltra]
  );

  const requireScanQuota = useCallback(
    (action) => {
      if (hasPro) return action?.();
      if ((freeUsage?.aiScans ?? 0) >= 3) {
        setPaywallContext({ trigger: 'scan_cap', promote: 'pro' });
        return undefined;
      }
      return action?.();
    },
    [hasPro, freeUsage?.aiScans]
  );

  const requireTasteQuota = useCallback(
    (action) => {
      if (hasPro) return action?.();
      if ((freeUsage?.tasteTests ?? 0) >= 1) {
        setPaywallContext({ trigger: 'taste_cap', promote: 'pro' });
        return undefined;
      }
      return action?.();
    },
    [hasPro, freeUsage?.tasteTests]
  );

  const openPaywall = useCallback(
    ({ feature = 'generic', promote = 'pro' } = {}) => {
      setPaywallContext({ trigger: feature, promote });
    },
    []
  );

  const value = useMemo(
    () => ({
      paywallContext,
      openPaywall,
      close,
      requirePro,
      requireUltra,
      requireScanQuota,
      requireTasteQuota,
    }),
    [paywallContext, openPaywall, close, requirePro, requireUltra, requireScanQuota, requireTasteQuota]
  );

  return <PaywallContext.Provider value={value}>{children}</PaywallContext.Provider>;
}

export function usePaywall() {
  const ctx = useContext(PaywallContext);
  if (!ctx) {
    throw new Error('usePaywall must be used within a PaywallProvider');
  }
  return ctx;
}
