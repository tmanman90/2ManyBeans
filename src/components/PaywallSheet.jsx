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
import { C, fonts, shadows, radius, glass, type as typeScale } from '../styles/theme';
import { m, spring, fadeUp, sheet as sheetVariant, scrim, popIn } from '../lib/motion';
import { AnimatePresence } from 'framer-motion';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatAvailable,
  deriveEntitlements,
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
  product_shot: {
    headline: "You've used your free product shots",
    subtext: 'Upgrade to Pro for unlimited studio-style bean photos and scans.',
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

// Feature row icons (SVG inline, no external deps)
function CheckIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="7" cy="7" r="7" fill={color} fillOpacity="0.15" />
      <path d="M4 7l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    if (trialLabel) return `Start ${trialLabel} — ${tierName} ${cycleName}`;
    return `Subscribe — ${tierName} ${cycleName}`;
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
      const { hasPro, hasUltra } = deriveEntitlements(result.customerInfo);
      if (!hasPro && !hasUltra) {
        setError('Purchase confirmed, but the subscription is still syncing. Tap Restore Purchases in Settings.');
        setPurchasing(false);
        return;
      }
      // Success — purchasePackage publishes customerInfo so SubscriptionContext unlocks immediately.
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
      const { hasPro, hasUltra } = deriveEntitlements(info);
      if (hasPro || hasUltra) {
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
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <m.div
            key="paywall-scrim"
            {...scrim}
            style={styles.backdrop}
            onClick={onClose}
          />

          {/* Sheet */}
          <m.div
            key="paywall-sheet"
            {...sheetVariant}
            style={styles.sheet}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Grabber */}
            <div style={styles.grabber} />

            {/* Close button */}
            <button style={styles.close} onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {/* Header */}
            {showMarketing ? (
              <m.div style={styles.header} {...fadeUp}>
                <div style={styles.eyebrow}>Coffee Hub</div>
                <h2 style={styles.headline}>{copy.headline}</h2>
                <p style={styles.sub}>{copy.subtext}</p>
              </m.div>
            ) : isErrorState ? (
              <div style={styles.header}>
                <h2 style={styles.headline}>Hmm, that didn't work</h2>
              </div>
            ) : (
              <div style={styles.header}>
                <div style={styles.eyebrow}>Coffee Hub</div>
                <h2 style={styles.headline}>{copy.headline}</h2>
                <p style={styles.sub}>{copy.subtext}</p>
              </div>
            )}

            {isWeb ? (
              <div style={styles.webNotice}>
                Subscriptions are available in the 2manybeans iOS app.
              </div>
            ) : loading ? (
              <div style={styles.loading}>
                <div style={styles.loadingDots}>
                  <span style={{ ...styles.dot, animationDelay: '0s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.15s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.3s' }} />
                </div>
                <p style={styles.loadingText}>Loading subscription options...</p>
              </div>
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
                    label="Pro"
                    selected={tier === 'pro'}
                    onSelect={() => setTier('pro')}
                    features={FEATURES_PRO}
                    monthly={proMonthly}
                    annual={proAnnual}
                    cycle={tier === 'pro' ? cycle : null}
                    onCycleChange={setCycle}
                  />
                  <TierCard
                    label="Ultra"
                    badge="Best Value"
                    selected={tier === 'ultra'}
                    onSelect={() => setTier('ultra')}
                    features={FEATURES_ULTRA}
                    monthly={ultraMonthly}
                    annual={ultraAnnual}
                    cycle={tier === 'ultra' ? cycle : null}
                    onCycleChange={setCycle}
                  />
                </div>

                <m.button
                  style={{ ...styles.cta, opacity: purchasing || !selectedPackage ? 0.6 : 1 }}
                  onClick={handlePurchase}
                  disabled={purchasing || !selectedPackage}
                  whileTap={purchasing || !selectedPackage ? {} : { scale: 0.97 }}
                  transition={spring.snappy}
                >
                  {purchasing ? 'Processing...' : ctaLabel}
                </m.button>

                {selectedPackage && (
                  <p style={styles.fineprint}>
                    {trialLabel
                      ? `${trialLabel}, then ${selectedPackage.product?.priceString}/${cycle === 'annual' ? 'year' : 'month'}. `
                      : `${selectedPackage.product?.priceString}/${cycle === 'annual' ? 'year' : 'month'}. `}
                    Cancel anytime.
                  </p>
                )}

                {error && <div style={styles.errorInline}>{error}</div>}

                <div style={styles.footerLinks}>
                  <a href="https://2manybeans.vercel.app/terms.html" target="_blank" rel="noopener noreferrer" style={styles.link}>
                    Terms of Use
                  </a>
                  <span style={styles.separator}>·</span>
                  <a href="https://2manybeans.vercel.app/privacy-policy.html" target="_blank" rel="noopener noreferrer" style={styles.link}>
                    Privacy Policy
                  </a>
                  <span style={styles.separator}>·</span>
                  <button type="button" onClick={handleRestore} style={styles.linkButton}>
                    Restore Purchases
                  </button>
                </div>
              </>
            )}

            {toast && (
              <m.div style={styles.toast} {...popIn}>
                {toast}
              </m.div>
            )}
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TierCard({ label, badge, selected, onSelect, features, monthly, annual, cycle, onCycleChange }) {
  const monthlyPrice = monthly?.product?.priceString ?? '—';
  const annualPrice = annual?.product?.priceString ?? '—';

  const savingsLabel = (() => {
    const mo = monthly?.product?.price;
    const yr = annual?.product?.price;
    if (!mo || !yr || mo <= 0) return null;
    const pct = Math.round((1 - yr / (mo * 12)) * 100);
    return pct > 0 ? `Save ${pct}%` : null;
  })();

  const cardStyle = {
    ...styles.card,
    borderColor: selected ? C.accent : C.borderLight,
    borderWidth: selected ? 2 : 1,
    background: selected ? C.accentSoft : C.card,
    boxShadow: selected ? shadows.e3 : shadows.e1,
  };

  return (
    <m.button
      type="button"
      onClick={onSelect}
      style={cardStyle}
      whileTap={{ scale: 0.98 }}
      transition={spring.soft}
      animate={{ y: selected ? -3 : 0 }}
    >
      {badge && (
        <div style={styles.badge}>
          <span style={styles.badgeText}>{badge}</span>
        </div>
      )}

      {/* Tier label */}
      <div style={styles.cardLabelRow}>
        <span style={{
          ...styles.cardLabel,
          color: selected ? C.accent : C.textMuted,
        }}>
          {label}
        </span>
        {selected && (
          <span style={styles.selectedDot} />
        )}
      </div>

      {/* Price stack */}
      <div style={styles.priceStack}>
        <button
          type="button"
          style={{
            ...styles.priceOption,
            background: selected && cycle === 'annual' ? C.accent : 'transparent',
            color: selected && cycle === 'annual' ? '#FFF' : C.text,
            border: selected && cycle !== 'annual' ? `1px solid ${C.borderLight}` : '1px solid transparent',
          }}
          onClick={(e) => {
            if (selected) {
              e.stopPropagation();
              onCycleChange?.('annual');
            }
          }}
        >
          <div style={styles.priceLine1}>{annualPrice}/yr</div>
          {savingsLabel && (
            <div style={{
              ...styles.priceLine2,
              color: selected && cycle === 'annual' ? 'rgba(255,255,255,0.8)' : C.green,
            }}>
              {savingsLabel}
            </div>
          )}
        </button>

        <button
          type="button"
          style={{
            ...styles.priceOption,
            background: selected && cycle === 'monthly' ? C.accent : 'transparent',
            color: selected && cycle === 'monthly' ? '#FFF' : C.text,
            border: selected && cycle !== 'monthly' ? `1px solid ${C.borderLight}` : '1px solid transparent',
          }}
          onClick={(e) => {
            if (selected) {
              e.stopPropagation();
              onCycleChange?.('monthly');
            }
          }}
        >
          <div style={styles.priceLine1}>{monthlyPrice}/mo</div>
        </button>
      </div>

      {/* Feature list */}
      <ul style={styles.features}>
        {features.map((f) => (
          <li key={f} style={styles.feature}>
            <CheckIcon color={selected ? C.accent : C.textMuted} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </m.button>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: glass.scrim,
    // Above any in-app modal (Modal.jsx uses zIndex 1000). The paywall must
    // always be on top because it can be triggered from inside another modal
    // (e.g. ScanSheet scan flow → free tier exhausted).
    zIndex: 2000,
  },
  sheet: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2001,
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
    background: glass.sheet,
    backdropFilter: glass.blur,
    WebkitBackdropFilter: glass.blur,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTop: `1px solid ${glass.chromeBorder}`,
    padding: '8px 20px 0',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)',
    boxShadow: shadows.modal,
    maxHeight: '92dvh',
    overflowY: 'auto',
    fontFamily: fonts.body,
    color: C.text,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    background: C.hairline,
    margin: '8px auto 16px',
    flexShrink: 0,
  },
  close: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    border: `1px solid ${C.borderLight}`,
    background: C.card,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  header: {
    textAlign: 'center',
    marginBottom: 24,
    paddingTop: 4,
    paddingLeft: 32,
    paddingRight: 32,
  },
  eyebrow: {
    ...typeScale.label,
    color: C.accent,
    marginBottom: 8,
  },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
    margin: '0 0 8px',
    color: C.text,
  },
  sub: {
    fontSize: 14,
    color: C.textMuted,
    margin: 0,
    lineHeight: 1.5,
  },

  // Plan cards
  cards: {
    display: 'flex',
    gap: 10,
    marginBottom: 20,
    alignItems: 'stretch',
  },
  card: {
    flex: 1,
    padding: '16px 12px 14px',
    borderRadius: radius.lg,
    border: `1px solid ${C.borderLight}`,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    color: 'inherit',
    position: 'relative',
    minHeight: 280,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: -11,
    left: '50%',
    transform: 'translateX(-50%)',
    background: C.accent,
    borderRadius: radius.pill,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#FFF',
  },
  cardLabelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    transition: 'color 0.15s',
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    background: C.accent,
    display: 'inline-block',
  },
  priceStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    marginBottom: 14,
  },
  priceOption: {
    borderRadius: radius.sm,
    padding: '7px 9px',
    textAlign: 'center',
    transition: 'background 0.15s, color 0.15s',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
    WebkitTapHighlightColor: 'transparent',
    minHeight: 44,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceLine1: { fontSize: 15, fontWeight: 700, lineHeight: 1.2 },
  priceLine2: { fontSize: 11, marginTop: 2, fontWeight: 600 },

  // Feature rows
  features: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    flex: 1,
  },
  feature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 7,
    padding: '5px 0',
    borderTop: `1px solid ${C.hairline}`,
    fontSize: 12,
    color: C.text,
    lineHeight: 1.4,
  },

  // CTA
  cta: {
    width: '100%',
    padding: '16px 20px',
    background: C.accent,
    backgroundImage: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDark} 100%)`,
    color: '#FFF',
    border: 'none',
    borderRadius: radius.md,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: `${shadows.button}, 0 4px 14px rgba(168,106,56,0.32)`,
    transition: 'opacity 0.2s',
    minHeight: 52,
    letterSpacing: '-0.01em',
    WebkitTapHighlightColor: 'transparent',
  },

  fineprint: {
    fontSize: 11,
    color: C.textLight,
    textAlign: 'center',
    margin: '10px 0 0',
    lineHeight: 1.45,
  },

  errorInline: {
    color: C.red,
    background: C.redBg,
    padding: '10px 14px',
    borderRadius: radius.sm,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
    border: `1px solid rgba(182,92,69,0.15)`,
  },

  errorWithRetry: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    padding: '28px 0',
  },
  error: {
    color: C.red,
    background: C.redBg,
    padding: '10px 14px',
    borderRadius: radius.sm,
    fontSize: 13,
    textAlign: 'center',
    border: `1px solid rgba(182,92,69,0.15)`,
  },
  retryBtn: {
    background: C.accent,
    color: '#FFF',
    border: 'none',
    borderRadius: radius.md,
    padding: '13px 28px',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    minHeight: 48,
    WebkitTapHighlightColor: 'transparent',
  },

  webNotice: {
    padding: '24px 20px',
    textAlign: 'center',
    color: C.textMuted,
    fontSize: 14,
    lineHeight: 1.5,
    background: C.card,
    borderRadius: radius.md,
    border: `1px dashed ${C.border}`,
    marginBottom: 8,
  },

  loading: {
    padding: '40px 0 32px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  loadingDots: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    background: C.accentLight,
    animation: 'paywallDotPulse 1.2s ease-in-out infinite',
  },
  loadingText: {
    fontSize: 13,
    color: C.textLight,
    margin: 0,
  },

  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
    paddingBottom: 4,
  },
  link: {
    color: C.textLight,
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 500,
    borderBottom: `1px solid ${C.borderLight}`,
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: C.textLight,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
    borderBottom: `1px solid ${C.borderLight}`,
    WebkitTapHighlightColor: 'transparent',
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
  },
  separator: { color: C.borderLight, fontSize: 12 },

  toast: {
    position: 'absolute',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
    left: '50%',
    transform: 'translateX(-50%)',
    background: C.accentDark,
    color: '#FFF',
    padding: '10px 20px',
    borderRadius: radius.pill,
    fontSize: 14,
    fontWeight: 600,
    boxShadow: shadows.e3,
    whiteSpace: 'nowrap',
  },
};
