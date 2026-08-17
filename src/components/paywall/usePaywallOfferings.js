import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getOfferings, isRevenueCatAvailable } from '../../lib/revenuecat';
import { devOffering, devOfferingsEnabled } from '../../lib/devOfferings';

function findPackage(offering, match) {
  if (!offering?.availablePackages) return null;
  return offering.availablePackages.find(match) || null;
}

// Match by the StoreKit product identifier, not the RC package identifier.
// Package identifiers like `$rc_monthly` are ambiguous when an offering
// contains both Pro and Ultra tiers — we must look at the real product ID.
function matchProMonthly(pkg) {
  const productId = pkg.product?.identifier || '';
  return productId.includes('pro.monthly');
}
function matchProAnnual(pkg) {
  const productId = pkg.product?.identifier || '';
  return productId.includes('pro.annual');
}
function matchUltraMonthly(pkg) {
  const productId = pkg.product?.identifier || '';
  return productId.includes('ultra.monthly');
}
function matchUltraAnnual(pkg) {
  const productId = pkg.product?.identifier || '';
  return productId.includes('ultra.annual');
}

export function usePaywallOfferings({ open }) {
  const [offering, setOffering] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isDevMock, setIsDevMock] = useState(false);

  // The dev app cannot load real products: its bundle id is
  // com.talmeltzer.coffeehub.dev, while every StoreKit product lives under the
  // production app record. Rather than leave the paywall permanently
  // un-reviewable on the only device build we review on, fall back to a
  // shape-compatible stand-in AFTER a real fetch has failed. Dev variant only,
  // and the UI shows a DEV PRICES marker whenever it is in use.
  function useDevFallback(reason) {
    if (!devOfferingsEnabled()) return false;
    console.warn(`[PaywallRoast] ${reason} — falling back to dev offerings stub. Purchases will NOT complete.`);
    setOffering(devOffering());
    setIsDevMock(true);
    setError(null);
    setLoading(false);
    return true;
  }

  // Fetch offerings on open (native only). `retryCount` is in the deps so
  // tapping the retry button re-runs the effect.
  useEffect(() => {
    if (!open) return;
    if (!isRevenueCatAvailable()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOfferings()
      .then((o) => {
        if (cancelled) return;
        if (!o) {
          // RC has no offerings at all (dashboard misconfig).
          console.error('[PaywallRoast] getOfferings returned null — RC dashboard has no offerings');
          if (useDevFallback('getOfferings returned null')) return;
          setError('Subscription options not available yet. Please try again in a moment.');
          setLoading(false);
          return;
        }
        if (!o.availablePackages || o.availablePackages.length === 0) {
          // RC returned the offering but StoreKit couldn't load any products.
          // This is ALWAYS an App Store Connect issue (Paid Apps Agreement
          // not signed, products still in Missing Metadata, bundle ID
          // mismatch, or no sandbox account signed in on device).
          console.error('[PaywallRoast] Offering has zero packages — App Store Connect / StoreKit issue', {
            offeringId: o.identifier,
            metadata: o.metadata,
            serverDescription: o.serverDescription,
            rawPackagesLength: o.availablePackages?.length,
          });
          if (useDevFallback('offering has zero packages')) return;
          setError('Subscription options not available yet. Please try again in a moment.');
          setLoading(false);
          return;
        }
        setOffering(o);
        setIsDevMock(false);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[PaywallRoast] getOfferings failed', {
          message: err?.message,
          code: err?.code,
          underlying: err?.underlyingErrorMessage,
        });
        if (cancelled) return;
        if (useDevFallback('getOfferings threw')) return;
        setError('Could not load subscription options. Please try again.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, retryCount]);

  const proMonthly = useMemo(() => findPackage(offering, matchProMonthly), [offering]);
  const proAnnual = useMemo(() => findPackage(offering, matchProAnnual), [offering]);
  const ultraMonthly = useMemo(() => findPackage(offering, matchUltraMonthly), [offering]);
  const ultraAnnual = useMemo(() => findPackage(offering, matchUltraAnnual), [offering]);

  function retry() {
    setRetryCount((c) => c + 1);
  }

  const isWeb = !Capacitor.isNativePlatform();

  return {
    offering,
    packages: { proMonthly, proAnnual, ultraMonthly, ultraAnnual },
    loading,
    error,
    retry,
    isWeb,
    isDevMock,
  };
}
