// Two-card paywall sheet.
//
// Apple rejection patterns this design avoids (Q1 2026):
//   - NO toggle paywall. Apple mass-rejected these in Jan 2026 under 3.1.2.
//   - Prices pulled from Purchases.getOfferings() via package.product.priceString,
//     never hardcoded, so paywall price always matches App Store Connect exactly.
//   - Monthly + annual price shown for each tier simultaneously.
//   - Trial language only appears when the selected package has a real intro price.
//   - Terms of Use + Privacy Policy links in the paywall UI (not just settings).
//   - Restore Purchases link always visible.
//
// Promotion logic: if the paywall was triggered by an Ultra-only feature
// (Fellow Aiden push, multi-brewer), the Ultra card is pre-selected and
// the copy emphasizes Fellow integration. Otherwise Pro Annual is the
// default to maximize LTV.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { C, fonts, shadows, radius } from '../styles/theme';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatAvailable,
} from '../lib/revenuecat';

const CONTEXT_COPY = {
  scan_cap: {
    headline: "You've used your free scans",
    subtext: 'Unlock unlimited bean scanning and tasting coach with Coffee Hub Pro.',
  },
  taste_cap: {
    headline: 'Ready to level up your tasting?',
    subtext: 'Unlimited AI tasting coach, unlimited bean scans, and more.',
  },
  aiden: {
    headline: 'Send recipes straight to your Aiden',
    subtext: 'Ultra unlocks direct Fellow Aiden push and multi-brewer support.',
  },
  generic: {
    headline: 'Unlock AI-powered brewing',
    subtext: 'Get AI tasting coach, bean scanning, and personalized recipes.',
  },
  onboarding: {
    headline: "Want me to guide you all the way?",
    subtext:
      "Unlimited scans, the tasting coach, Aiden recipes — this is where we shake on it.",
  },
};

const FEATURES_PRO = [
  'AI tasting coach with guided scoring',
  'Unlimited bean scanning',
  'Personalized hand brew recipes',
  'Coffee chat with expert knowledge',
];

const FEATURES_ULTRA = [
  'Everything in Pro, unlimited',
  'Push recipes directly to Fellow Aiden',
  'Multi-brewer support (V60, Chemex, AeroPress)',
  'Priority model routing',
];

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

function introTrialLabel(pkg) {
  const intro = pkg?.product?.introPrice;
  if (!intro) return null;
  if (intro.priceString === '$0.00' || intro.price === 0) {
    // 3-day free trial format. RevenueCat returns periodNumberOfUnits/periodUnit
    // but the exact shape varies by SDK version — fall back gracefully.
    const units = intro.periodNumberOfUnits ?? intro.period?.value;
    const unit = intro.periodUnit ?? intro.period?.unit;
    if (units && unit) return `${units}-${String(unit).toLowerCase()} free trial`;
    return 'Free trial';
  }
  return null;
}

export function PaywallSheet({ open, context, onClose }) {
  const [offering, setOffering] = useState(null);
  const [tier, setTier] = useState('pro'); // 'pro' | 'ultra'
  const [cycle, setCycle] = useState('annual'); // 'monthly' | 'annual'
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Track open transitions so we only reset state on a fresh open, not on
  // every re-render where `context.promote` happens to be a new object
  // reference (usePaywall creates a new context object on every openPaywall).
  const wasOpenRef = useRef(false);

  // Hold the close-after-purchase timer so we can clear it on unmount or
  // on close. Without this, a tap-to-close during the 600ms window can
  // close a freshly-reopened paywall instance.
  const closeTimerRef = useRef(null);

  // mounted ref for safe cross-async setState
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Pre-select Ultra when the paywall was opened by an Ultra-only feature.
  // Only reset on the open false→true transition so the user's manual
  // tier/cycle picks aren't blown away by an unrelated re-render.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setError(null);
      setTier(context?.promote === 'ultra' ? 'ultra' : 'pro');
      setCycle('annual');
    }
    wasOpenRef.current = open;
    if (!open && closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [open, context?.promote]);

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
          console.error('[PaywallSheet] getOfferings returned null — RC dashboard has no offerings');
          setError('Subscription options not available yet. Please try again in a moment.');
          setLoading(false);
          return;
        }
        if (!o.availablePackages || o.availablePackages.length === 0) {
          // RC returned the offering but StoreKit couldn't load any products.
          // This is ALWAYS an App Store Connect issue (Paid Apps Agreement
          // not signed, products still in Missing Metadata, bundle ID
          // mismatch, or no sandbox account signed in on device).
          console.error('[PaywallSheet] Offering has zero packages — App Store Connect / StoreKit issue', {
            offeringId: o.identifier,
            metadata: o.metadata,
            serverDescription: o.serverDescription,
            rawPackagesLength: o.availablePackages?.length,
          });
          setError('Subscription options not available yet. Please try again in a moment.');
          setLoading(false);
          return;
        }
        setOffering(o);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[PaywallSheet] getOfferings failed', {
          message: err?.message,
          code: err?.code,
          underlying: err?.underlyingErrorMessage,
        });
        if (!cancelled) {
          setError('Could not load subscription options. Please try again.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [open, retryCount]);

  const proMonthly = useMemo(() => findPackage(offering, matchProMonthly), [offering]);
  const proAnnual = useMemo(() => findPackage(offering, matchProAnnual), [offering]);
  const ultraMonthly = useMemo(() => findPackage(offering, matchUltraMonthly), [offering]);
  const ultraAnnual = useMemo(() => findPackage(offering, matchUltraAnnual), [offering]);

  const selectedPackage = useMemo(() => {
    if (tier === 'pro') return cycle === 'annual' ? proAnnual : proMonthly;
    return cycle === 'annual' ? ultraAnnual : ultraMonthly;
  }, [tier, cycle, proAnnual, proMonthly, ultraAnnual, ultraMonthly]);

  const trialLabel = useMemo(
    () => (selectedPackage ? introTrialLabel(selectedPackage) : null),
    [selectedPackage]
  );

  const ctaLabel = useMemo(() => {
    if (!selectedPackage) return 'Subscribe';
    const tierName = tier === 'pro' ? 'Pro' : 'Ultra';
    const cycleName = cycle === 'annual' ? 'Annual' : 'Monthly';
    if (trialLabel) return `Start ${trialLabel} → ${tierName} ${cycleName}`;
    return `Subscribe → ${tierName} ${cycleName}`;
  }, [selectedPackage, tier, cycle, trialLabel]);

  const copy = CONTEXT_COPY[context?.trigger] ?? CONTEXT_COPY.generic;

  async function handlePurchase() {
    if (!selectedPackage) return;
    setPurchasing(true);
    setError(null);
    try {
      const result = await purchasePackage(selectedPackage);
      if (!mountedRef.current) return;
      if (result.userCancelled) {
        setPurchasing(false);
        return;
      }
      // Success — the SubscriptionContext listener will unlock the UI.
      // Close the paywall after a short delay so the user sees the state flip.
      setToast('Subscription active');
      closeTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setPurchasing(false);
        setToast(null);
        onClose?.();
        closeTimerRef.current = null;
      }, 600);
    } catch (err) {
      console.error('[PaywallSheet] purchase failed', err);
      if (!mountedRef.current) return;
      setError(err?.message || 'Purchase failed. Please try again.');
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setError(null);
    try {
      const info = await restorePurchases();
      if (!mountedRef.current) return;
      const active = info?.entitlements?.active || {};
      if (active.pro || active.ultra) {
        setToast('Subscription restored');
        closeTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setToast(null);
          onClose?.();
          closeTimerRef.current = null;
        }, 800);
      } else {
        setToast('No active subscription found');
        setTimeout(() => { if (mountedRef.current) setToast(null); }, 1800);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError('Could not restore purchases. Please try again.');
    }
  }

  function handleRetryOfferings() {
    setRetryCount((c) => c + 1);
  }

  if (!open) return null;

  const isWeb = !Capacitor.isNativePlatform();

  // Suppress the marketing copy when we're in an error/loading state — it's
  // confusing to see "You've used your free scans, unlock unlimited..." right
  // above an error message about not being able to load options.
  const showMarketing = !loading && !error && offering;
  const isErrorState = !isWeb && error && !offering;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button style={styles.close} onClick={onClose} aria-label="Close">×</button>

        {showMarketing ? (
          <div style={styles.header}>
            <h2 style={styles.headline}>{copy.headline}</h2>
            <p style={styles.sub}>{copy.subtext}</p>
          </div>
        ) : isErrorState ? (
          <div style={styles.header}>
            <h2 style={styles.headline}>Hmm, that didn't work</h2>
          </div>
        ) : (
          <div style={styles.header}>
            <h2 style={styles.headline}>{copy.headline}</h2>
            <p style={styles.sub}>{copy.subtext}</p>
          </div>
        )}

        {isWeb ? (
          <div style={styles.webNotice}>
            Subscriptions are available in the 2manybeans iOS app.
          </div>
        ) : loading ? (
          <div style={styles.loading}>Loading subscription options...</div>
        ) : error && !offering ? (
          <div style={styles.errorWithRetry}>
            <div style={styles.error}>{error}</div>
            <button style={styles.retryBtn} onClick={handleRetryOfferings}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div style={styles.cards}>
              <TierCard
                label="PRO"
                selected={tier === 'pro'}
                onSelect={() => setTier('pro')}
                features={FEATURES_PRO}
                monthly={proMonthly}
                annual={proAnnual}
                cycle={tier === 'pro' ? cycle : null}
                onCycleChange={setCycle}
              />
              <TierCard
                label="ULTRA"
                badge="BEST VALUE"
                selected={tier === 'ultra'}
                onSelect={() => setTier('ultra')}
                features={FEATURES_ULTRA}
                monthly={ultraMonthly}
                annual={ultraAnnual}
                cycle={tier === 'ultra' ? cycle : null}
                onCycleChange={setCycle}
              />
            </div>

            <button
              style={{ ...styles.cta, opacity: purchasing || !selectedPackage ? 0.6 : 1 }}
              onClick={handlePurchase}
              disabled={purchasing || !selectedPackage}
            >
              {purchasing ? 'Processing...' : ctaLabel}
            </button>

            {selectedPackage && (
              <p style={styles.fineprint}>
                {trialLabel
                  ? `${trialLabel}, then ${selectedPackage.product?.priceString}/${cycle === 'annual' ? 'year' : 'month'}. `
                  : `${selectedPackage.product?.priceString}/${cycle === 'annual' ? 'year' : 'month'}. `}
                Cancel anytime.
              </p>
            )}

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.footerLinks}>
              <a href="https://2manybeans.vercel.app/terms.html" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Terms of Use
              </a>
              <span style={styles.dot}>·</span>
              <a href="https://2manybeans.vercel.app/privacy-policy.html" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Privacy Policy
              </a>
              <span style={styles.dot}>·</span>
              <button type="button" onClick={handleRestore} style={styles.linkButton}>
                Restore Purchases
              </button>
            </div>
          </>
        )}

        {toast && <div style={styles.toast}>{toast}</div>}
      </div>
    </div>
  );
}

function TierCard({ label, badge, selected, onSelect, features, monthly, annual, cycle, onCycleChange }) {
  const monthlyPrice = monthly?.product?.priceString ?? '—';
  const annualPrice = annual?.product?.priceString ?? '—';

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.card,
        borderColor: selected ? C.accent : C.border,
        background: selected ? '#FFF' : C.card,
        transform: selected ? 'translateY(-2px)' : 'none',
        boxShadow: selected ? '0 8px 20px rgba(160,113,75,0.20)' : shadows.card,
      }}
    >
      {badge && <div style={styles.badge}>{badge}</div>}
      <div style={styles.cardLabel}>{label}</div>

      <div style={styles.priceStack}>
        <div
          style={{
            ...styles.priceOption,
            background: selected && cycle === 'annual' ? C.accent : 'transparent',
            color: selected && cycle === 'annual' ? '#FFF' : C.text,
          }}
          onClick={(e) => {
            if (selected) {
              e.stopPropagation();
              onCycleChange?.('annual');
            }
          }}
        >
          <div style={styles.priceLine1}>{annualPrice}/yr</div>
          <div style={styles.priceLine2}>Save 17%</div>
        </div>
        <div
          style={{
            ...styles.priceOption,
            background: selected && cycle === 'monthly' ? C.accent : 'transparent',
            color: selected && cycle === 'monthly' ? '#FFF' : C.text,
          }}
          onClick={(e) => {
            if (selected) {
              e.stopPropagation();
              onCycleChange?.('monthly');
            }
          }}
        >
          <div style={styles.priceLine1}>{monthlyPrice}/mo</div>
        </div>
      </div>

      <ul style={styles.features}>
        {features.map((f) => (
          <li key={f} style={styles.feature}>{f}</li>
        ))}
      </ul>
    </button>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(43,27,14,0.55)',
    // Above any in-app modal (Modal.jsx uses zIndex 1000). The paywall must
    // always be on top because it can be triggered from inside another modal
    // (e.g. ScanSheet scan flow → free tier exhausted).
    zIndex: 2000,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    background: C.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: '24px 20px 32px',
    position: 'relative',
    boxShadow: shadows.modal,
    maxHeight: '92vh',
    overflowY: 'auto',
    fontFamily: fonts.body,
    color: C.text,
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    border: 'none',
    background: 'transparent',
    fontSize: 28,
    lineHeight: '32px',
    color: C.textMuted,
    cursor: 'pointer',
  },
  header: { textAlign: 'center', marginBottom: 20, paddingTop: 8 },
  headline: { fontFamily: fonts.heading, fontSize: 24, margin: '0 0 8px', color: C.text },
  sub: { fontSize: 14, color: C.textMuted, margin: 0, lineHeight: 1.5 },
  cards: { display: 'flex', gap: 12, marginBottom: 20 },
  card: {
    flex: 1,
    padding: '16px 12px',
    borderRadius: radius.lg,
    border: `2px solid ${C.border}`,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    color: 'inherit',
    position: 'relative',
    transition: 'all 0.2s',
    minHeight: 280,
  },
  badge: {
    position: 'absolute',
    top: -10,
    left: '50%',
    transform: 'translateX(-50%)',
    background: C.accent,
    color: '#FFF',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    padding: '4px 10px',
    borderRadius: radius.sm,
    whiteSpace: 'nowrap',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    color: C.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  priceStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 14,
  },
  priceOption: {
    borderRadius: radius.sm,
    padding: '8px 10px',
    textAlign: 'center',
    transition: 'all 0.15s',
  },
  priceLine1: { fontSize: 16, fontWeight: 700 },
  priceLine2: { fontSize: 11, opacity: 0.8, marginTop: 2 },
  features: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    fontSize: 12,
    color: C.text,
  },
  feature: { padding: '5px 0', borderTop: `1px solid ${C.borderLight}`, lineHeight: 1.4 },
  cta: {
    width: '100%',
    padding: '16px 20px',
    background: C.accent,
    color: '#FFF',
    border: 'none',
    borderRadius: radius.md,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: shadows.button,
    transition: 'opacity 0.2s',
  },
  fineprint: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: 'center',
    margin: '12px 0 0',
    lineHeight: 1.4,
  },
  error: {
    color: C.red,
    background: C.redBg,
    padding: '10px 14px',
    borderRadius: radius.sm,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  errorWithRetry: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '20px 0',
  },
  retryBtn: {
    background: C.accent,
    color: '#FFF',
    border: 'none',
    borderRadius: radius.md,
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  webNotice: {
    padding: '20px',
    textAlign: 'center',
    color: C.textMuted,
    fontSize: 14,
    background: C.card,
    borderRadius: radius.md,
    border: `1px dashed ${C.border}`,
  },
  loading: { padding: '32px', textAlign: 'center', color: C.textMuted },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    fontSize: 12,
  },
  link: { color: C.textMuted, textDecoration: 'underline' },
  linkButton: {
    background: 'none',
    border: 'none',
    color: C.textMuted,
    textDecoration: 'underline',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  dot: { color: C.textLight },
  toast: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    background: C.accentDark,
    color: '#FFF',
    padding: '10px 18px',
    borderRadius: radius.md,
    fontSize: 14,
    fontWeight: 600,
    boxShadow: shadows.button,
  },
};
