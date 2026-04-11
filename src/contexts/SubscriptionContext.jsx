// Client-side subscription state.
//
// Two sources of truth, merged:
//   1. Firestore `users/{uid}.subscription` — written by the RevenueCat
//      webhook. Works on web + native, persists across app restarts,
//      authoritative for server-side checks.
//   2. RevenueCat SDK customer info — native only, updated in real-time
//      after purchase/restore/renewal. Unlocks the UI instantly without
//      waiting for the webhook round-trip.
//
// The context exposes:
//   - hasPro / hasUltra  (boolean entitlement flags)
//   - plan / status      (from Firestore, e.g. "pro_annual" / "active")
//   - freeUsage          ({ aiScans, tasteTests } counters for metered gates)
//   - loading            (true until first read resolves)

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';
import {
  deriveEntitlements,
  getCustomerInfo,
  isRevenueCatAvailable,
  onCustomerInfoUpdate,
} from '../lib/revenuecat';

const SubscriptionContext = createContext(null);

const INITIAL_STATE = {
  hasPro: false,
  hasUltra: false,
  plan: null,
  status: null,
  freeUsage: { aiScans: 0, tasteTests: 0 },
  loading: true,
};

export function SubscriptionProvider({ uid, children }) {
  const [state, setState] = useState(INITIAL_STATE);

  // Source 1: Firestore listener for subscription data (works everywhere).
  useEffect(() => {
    if (!uid) {
      setState(INITIAL_STATE);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const sub = snap.data()?.subscription ?? {};
        const active = sub.status === 'active' || sub.status === 'trial';
        const plan = sub.plan ?? null;
        const isUltraPlan = typeof plan === 'string' && plan.startsWith('ultra');
        const isProPlan = typeof plan === 'string' && (plan.startsWith('pro') || isUltraPlan);

        setState((prev) => ({
          ...prev,
          hasPro: prev.hasPro || (active && isProPlan),
          hasUltra: prev.hasUltra || (active && isUltraPlan),
          plan,
          status: sub.status ?? null,
          freeUsage: {
            aiScans: sub.freeUsage?.aiScans ?? 0,
            tasteTests: sub.freeUsage?.tasteTests ?? 0,
          },
          loading: false,
        }));
      },
      (err) => {
        console.error('[SubscriptionContext] Firestore listener error', err);
        setState((prev) => ({ ...prev, loading: false }));
      }
    );

    return unsub;
  }, [uid]);

  // Source 2: RevenueCat SDK on native — real-time entitlement state.
  useEffect(() => {
    if (!uid || !isRevenueCatAvailable() || !Capacitor.isNativePlatform()) return;

    let cancelled = false;

    getCustomerInfo()
      .then((info) => {
        if (cancelled || !info) return;
        const { hasPro, hasUltra } = deriveEntitlements(info);
        setState((prev) => ({ ...prev, hasPro, hasUltra, loading: false }));
      })
      .catch((err) => {
        console.error('[SubscriptionContext] getCustomerInfo failed', err);
      });

    const unsub = onCustomerInfoUpdate((info) => {
      const { hasPro, hasUltra } = deriveEntitlements(info);
      setState((prev) => ({ ...prev, hasPro, hasUltra }));
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  const value = useMemo(() => state, [state]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return ctx;
}
