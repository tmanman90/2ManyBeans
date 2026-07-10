import { useCallback, useEffect, useRef, useState } from 'react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, listContainer, listItem, spring } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { useOnboardingPaywall } from '../useOnboardingPaywall';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { usePaywall } from '../../../hooks/usePaywall.jsx';
import { onboardingBg } from './OnboardingPrimitives';
import { PAYWALL_HYDRATION_TIMEOUT_MS as HYDRATION_TIMEOUT_MS } from '../onboardingConstants';

// Visual plan card data — no logic, purely presentational labels
const PLANS = [
  {
    key: 'pro',
    label: 'Pro',
    tagline: 'Everything you need to track your beans.',
    perks: ['Unlimited bean inventory', 'Tasting log', 'Freshness tracking'],
    recommended: false,
  },
  {
    key: 'ultra',
    label: 'Ultra',
    tagline: 'The full experience, nothing held back.',
    perks: ['Everything in Pro', 'AI Aiden brew recipes', 'Professor Ruphus stories', 'Priority support'],
    recommended: true,
  },
];

export default function R13Paywall() {
  const { dispatch, finish } = useOnboarding();
  const { hasPro, hasUltra } = useSubscription();
  const { paywallContext } = usePaywall();
  const {
    status,
    openOnboardingPaywall,
    handleDismissOrPurchase,
    closePaywall,
    flowCompletedRef,
  } = useOnboardingPaywall();

  const [finalizeError, setFinalizeError] = useState(null);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);

  useEffect(() => {
    if (status !== 'hydrating') return;
    const timer = setTimeout(() => setHydrationTimedOut(true), HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const finalizePurchase = useCallback(async () => {
    try {
      setFinalizeError(null);
      await finish?.({ completedVia: 'paywall' });
    } catch (err) {
      flowCompletedRef.current = false;
      setFinalizeError(err?.message || 'Could not finish setting up your account.');
    }
  }, [finish, flowCompletedRef]);

  const openedRef = useRef(false);
  useEffect(() => {
    if (status !== 'ready') return;
    if (openedRef.current) return;
    openedRef.current = true;
    openOnboardingPaywall();
    logOnboardingEvent('onboarding_paywall_shown', {});
  }, [status, openOnboardingPaywall]);

  useEffect(() => {
    if (
      status === 'skip_web' ||
      status === 'skip_no_rc' ||
      status === 'skip_already_subscribed'
    ) {
      if (flowCompletedRef.current) return;
      flowCompletedRef.current = true;
      dispatch({ type: 'COMPLETE', via: 'skipped_paywall' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const prevHasSubRef = useRef(false);
  useEffect(() => {
    const hasSub = hasPro || hasUltra;
    if (hasSub && !prevHasSubRef.current && !flowCompletedRef.current) {
      flowCompletedRef.current = true;
      closePaywall();
      logOnboardingEvent('onboarding_paywall_trial_started', {
        tier: hasUltra ? 'ultra' : 'pro',
      });
      finalizePurchase();
    }
    prevHasSubRef.current = hasSub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPro, hasUltra]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    const nowOpen = paywallContext !== null;
    if (wasOpenRef.current && !nowOpen) {
      handleDismissOrPurchase(
        () => { finalizePurchase(); },
        () => {
          logOnboardingEvent('onboarding_paywall_dismissed', {});
          dispatch({ type: 'COMPLETE', via: 'maybe_later' });
        }
      );
    }
    wasOpenRef.current = nowOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paywallContext]);

  return (
    <div style={{
      minHeight: '100dvh',
      background: onboardingBg,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: fonts.body,
    }}>
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '32px 24px calc(32px + env(safe-area-inset-bottom))',
        textAlign: 'center',
      }}>
        {finalizeError ? (
          <m.div
            {...fadeUp}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              maxWidth: 360,
            }}
          >
            <div style={{
              ...t.display,
              color: C.accent,
            }}>
              Almost there.
            </div>
            <div style={{
              ...t.bodyL,
              color: C.textMuted,
              maxWidth: 300,
            }}>
              Your subscription is active, but I couldn't save your setup
              yet. Tap below to try again — you won't be charged twice.
            </div>
            <m.button
              onClick={finalizePurchase}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              style={{
                minHeight: 52,
                width: '100%',
                maxWidth: 300,
                padding: '14px 28px',
                ...t.bodyL,
                fontWeight: 700,
                background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDark} 100%)`,
                color: '#fff',
                border: 'none',
                borderRadius: radius.md,
                cursor: 'pointer',
                boxShadow: `0 2px 8px rgba(168,106,56,0.28), 0 8px 24px rgba(168,106,56,0.18)`,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Finish setting up
            </m.button>
            <div style={{
              ...t.caption,
              color: C.textLight,
              maxWidth: 260,
            }}>
              {finalizeError}
            </div>
          </m.div>

        ) : status === 'hydrating' ? (
          <m.div
            {...fadeUp}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            {/* Premium spinner — accent on hairline track */}
            <div style={{ position: 'relative', width: 40, height: 40 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: `3px solid ${C.hairline}`,
                borderTopColor: C.accent,
                animation: 'onboarding-spinner 0.9s linear infinite',
              }} />
            </div>
            <style>{`
              @media (prefers-reduced-motion: no-preference) {
                @keyframes onboarding-spinner {
                  from { transform: rotate(0deg); }
                  to   { transform: rotate(360deg); }
                }
              }
            `}</style>
            <div style={{ ...t.body, color: C.textMuted }}>
              One second...
            </div>

            {hydrationTimedOut && (
              <m.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => {
                  if (flowCompletedRef.current) return;
                  flowCompletedRef.current = true;
                  dispatch({ type: 'COMPLETE', via: 'skipped_paywall' });
                }}
                whileTap={{ scale: 0.97 }}
                style={{
                  marginTop: 8,
                  minHeight: 44,
                  padding: '12px 24px',
                  ...t.bodyL,
                  fontWeight: 600,
                  background: 'transparent',
                  color: C.accent,
                  border: `1.5px solid ${C.accent}`,
                  borderRadius: radius.md,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Continue without subscription
              </m.button>
            )}
          </m.div>

        ) : (
          /* "ready" — paywall native sheet is open, show warm backdrop content */
          <m.div
            {...fadeUp}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
              width: '100%',
              maxWidth: 360,
            }}
          >
            {/* Plan preview cards — decorative context, no purchase logic */}
            <div style={{
              ...t.h1,
              color: C.text,
              textAlign: 'center',
            }}>
              Choose your plan.
            </div>

            <div style={{
              ...t.body,
              color: C.textMuted,
              textAlign: 'center',
              maxWidth: 280,
            }}>
              7 days free, then choose what fits.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              {PLANS.map((plan) => (
                <div key={plan.key} style={{
                  ...cardBase,
                  position: 'relative',
                  padding: '16px 16px',
                  borderRadius: radius.lg,
                  border: plan.recommended
                    ? `2px solid ${C.accent}`
                    : `1.5px solid ${C.border}`,
                  background: plan.recommended ? C.accentSoft : C.cream,
                  boxShadow: plan.recommended ? shadows.e3 : shadows.e1,
                  textAlign: 'left',
                }}>
                  {plan.recommended && (
                    <div style={{
                      position: 'absolute',
                      top: -1,
                      right: 14,
                      background: C.accent,
                      color: '#fff',
                      ...t.label,
                      padding: '3px 10px',
                      borderRadius: `0 0 ${radius.xs}px ${radius.xs}px`,
                    }}>
                      Recommended
                    </div>
                  )}
                  <div style={{
                    ...t.h2,
                    color: plan.recommended ? C.accent : C.text,
                    marginBottom: 4,
                  }}>
                    {plan.label}
                  </div>
                  <div style={{
                    ...t.body,
                    color: C.textMuted,
                    marginBottom: 10,
                  }}>
                    {plan.tagline}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {plan.perks.map((perk) => (
                      <div key={perk} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <div style={{
                          width: 16, height: 16,
                          borderRadius: '50%',
                          background: plan.recommended ? C.accent : C.accentSoft,
                          border: plan.recommended ? 'none' : `1.5px solid ${C.accent}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path d="M1 3l2 2 4-4" stroke={plan.recommended ? '#fff' : C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <span style={{ ...t.body, color: C.text }}>{perk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              ...t.caption,
              color: C.textLight,
              textAlign: 'center',
              maxWidth: 260,
              lineHeight: 1.5,
            }}>
              Prices shown in the native payment sheet. Cancel anytime during your trial.
            </div>
          </m.div>
        )}
      </div>
    </div>
  );
}
