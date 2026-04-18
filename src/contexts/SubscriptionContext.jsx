// Client-side subscription state.
//
// Two sources of truth, merged:
//   1. Firestore `users/{uid}.subscription` — written by the RevenueCat
//      webhook. Authoritative for status changes (active, cancelled,
//      expired) and works on web + native. CAN UPGRADE OR DOWNGRADE.
//   2. RevenueCat SDK customer info — native only, updated in real-time
//      after purchase/restore/renewal. ADDITIVE ONLY (can unlock but never
//      downgrade) so an empty SDK response on a TestFlight build that
//      predates the plugin install can't wipe out a Firestore-confirmed
//      paying user.
//
// State is reset to INITIAL on every uid change so a previous user's
// entitlements never leak into a new user's session on a shared device.

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
  cancelAtPeriodEnd: false,
  freeUsage: { aiScans: 0, tasteTests: 0 },
  loading: true,
  firestoreLoaded: false,
  // rcHydrated flips true once the RC side has "tried" at least once:
  // first getCustomerInfo() resolution (success OR failure), first
  // onCustomerInfoUpdate callback, OR immediately on platforms where RC
  // won't run (web, missing plugin). Consumers gating on subscription
  // status (e.g. onboarding R13 skip-already-subscribed check) should
  // wait for BOTH firestoreLoaded AND rcHydrated before reading hasPro.
  rcHydrated: false,
};

export function SubscriptionProvider({ uid, children }) {
  const [state, setState] = useState(INITIAL_STATE);

  // Source 1: Firestore listener (authoritative — can upgrade and downgrade).
  useEffect(() => {
    // Reset on every uid change so a previous user's state can't leak into
    // the new user's session. Without this, a paying user signing out and
    // a free user signing in on the same device would inherit hasPro=true.
    setState(INITIAL_STATE);

    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const sub = snap.data()?.subscription ?? {};
        // Defensive expiresAt check: if a webhook (RC cancel/expire) or a
        // redemption grant never fires a follow-up "no longer active"
        // event, the stale status=active would otherwise grant Pro forever
        // on the client. Mirrors api/lib/checkEntitlement.js:79-86.
        const notExpired =
          !sub.expiresAt ||
          (() => {
            const t = new Date(sub.expiresAt);
            return isNaN(t.getTime()) || t > new Date();
          })();
        const active =
          notExpired && (sub.status === 'active' || sub.status === 'trial');
        const plan = sub.plan ?? null;
        const isUltraPlan = typeof plan === 'string' && plan.startsWith('ultra');
        const isProPlan = typeof plan === 'string' && (plan.startsWith('pro') || isUltraPlan);

        // Direct assignment from Firestore — this is the canonical source
        // of truth. A cancellation or expiration event flipping `active` to
        // false MUST be reflected here, otherwise the UI keeps showing Pro
        // for the lifetime of the mount.
        setState((prev) => ({
          ...prev,
          hasPro: active && isProPlan,
          hasUltra: active && isUltraPlan,
          plan,
          status: sub.status ?? null,
          cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
          freeUsage: {
            aiScans: sub.freeUsage?.aiScans ?? 0,
            tasteTests: sub.freeUsage?.tasteTests ?? 0,
          },
          loading: false,
          firestoreLoaded: true,
        }));
      },
      (err) => {
        console.error('[SubscriptionContext] Firestore listener error', err);
        // Flip firestoreLoaded even on error so downstream gates (R13
        // paywall hydration check) don't trap the user in a forever
        // spinner. Default subscription state is already "no sub",
        // which is the safe fallback.
        setState((prev) => ({ ...prev, loading: false, firestoreLoaded: true }));
      }
    );

    return unsub;
  }, [uid]);

  // Source 2: RevenueCat SDK on native — additive ONLY.
  //
  // The SDK can UNLOCK entitlements (right after a purchase, before the
  // webhook has written to Firestore) but it must NEVER downgrade them.
  // Firestore is authoritative for cancellation/expiry. This is the
  // critical asymmetry that makes the merge correct: SDK refreshes can
  // unlock instantly, while cancellations always come from Firestore.
  useEffect(() => {
    // On platforms where RC will never run (web, missing plugin, non-native),
    // mark hydrated immediately so consumers gating on rcHydrated don't hang.
    if (!uid || !isRevenueCatAvailable() || !Capacitor.isNativePlatform()) {
      if (uid) setState((prev) => ({ ...prev, rcHydrated: true }));
      return;
    }

    let cancelled = false;

    getCustomerInfo()
      .then((info) => {
        if (cancelled) return;
        if (!info) {
          // Still count this as hydrated — we asked and got nothing.
          setState((prev) => ({ ...prev, rcHydrated: true }));
          return;
        }
        const { hasPro, hasUltra } = deriveEntitlements(info);
        setState((prev) => ({
          ...prev,
          hasPro: prev.hasPro || hasPro,
          hasUltra: prev.hasUltra || hasUltra,
          loading: false,
          rcHydrated: true,
        }));
      })
      .catch((err) => {
        // Plugin missing (old TF build) or SDK init failed. Don't touch
        // entitlement state -- Firestore remains the source of truth --
        // but DO mark rcHydrated so gates don't hang waiting for a
        // response that will never come.
        console.error('[SubscriptionContext] getCustomerInfo failed', err);
        if (!cancelled) setState((prev) => ({ ...prev, rcHydrated: true }));
      });

    const unsub = onCustomerInfoUpdate((info) => {
      const { hasPro, hasUltra } = deriveEntitlements(info);
      setState((prev) => ({
        ...prev,
        hasPro: prev.hasPro || hasPro,
        hasUltra: prev.hasUltra || hasUltra,
        rcHydrated: true,
      }));
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
