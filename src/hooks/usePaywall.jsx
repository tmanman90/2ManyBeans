// usePaywall: open/close the global paywall sheet.
//
// All gating logic now lives at the call site (each AI feature catches
// 403 / free_tier_exhausted from fetchWithRetry and calls openPaywall).
// The four `require*` helpers from the original design were dead code —
// every call site uses openPaywall directly. See review todo 019.

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

const PaywallContext = createContext(null);

/**
 * Provider wraps the app once. Exposes the paywall state and the openPaywall
 * helper. Renders children + the actual PaywallSheet (imported lazily by
 * main.jsx to avoid pulling it on web boots that will never show it).
 */
export function PaywallProvider({ children }) {
  const [paywallContext, setPaywallContext] = useState(null);

  const close = useCallback(() => setPaywallContext(null), []);

  const openPaywall = useCallback(
    ({ feature = 'generic', promote = 'pro' } = {}) => {
      setPaywallContext({ trigger: feature, promote });
    },
    []
  );

  const value = useMemo(
    () => ({ paywallContext, openPaywall, close }),
    [paywallContext, openPaywall, close]
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
