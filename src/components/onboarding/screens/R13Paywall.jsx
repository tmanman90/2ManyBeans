import { useCallback, useEffect, useRef, useState } from 'react';
import { C, fonts, radius, shadows } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { useOnboardingPaywall } from '../useOnboardingPaywall';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { usePaywall } from '../../../hooks/usePaywall.jsx';

// R13 — the decision screen. Most of the heavy lifting is delegated
// to PaywallSheet (which mounts globally via main.jsx PaywallMount).
// This screen's job is:
//
//   1. Wait for hydration of both firestoreLoaded AND rcHydrated.
//   2. Short-circuit any skip path (web, no RC, already subscribed).
//   3. Ask the shared paywall to open with `feature: 'onboarding'`.
//   4. Detect a successful purchase via the hasPro/hasUltra
//      transition, then complete and go to the home screen.
//   5. Detect a dismiss via the 500ms disambig timer in
//      useOnboardingPaywall, then dispatch COMPLETE with
//      via='maybe_later' and fall through to R13b.
//
// R13 is backDisabled — once you're here, there's no rewind.

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

  // Local error state for finalize failures. When non-null, R13
  // renders an error + retry UI so the purchased user isn't stranded
  // on a blank screen.
  const [finalizeError, setFinalizeError] = useState(null);

  // Wraps finish() for the purchase path: logs telemetry, handles
  // write failure by clearing the flowCompletedRef latch (so the
  // retry button can re-enter) and surfacing an error.
  const finalizePurchase = useCallback(async () => {
    try {
      setFinalizeError(null);
      await finish?.({ completedVia: 'paywall' });
      // Happy path unmounts R13 as soon as profile.onboardingComplete
      // flips — nothing else to do here.
    } catch (err) {
      // Clear the latch so either retry button or a late second
      // signal can re-enter cleanly.
      flowCompletedRef.current = false;
      setFinalizeError(err?.message || 'Could not finish setting up your account.');
    }
  }, [finish, flowCompletedRef]);

  // Open the paywall exactly once, on the first render where status
  // transitions to 'ready'. StrictMode guarded via openedRef.
  const openedRef = useRef(false);
  useEffect(() => {
    if (status !== 'ready') return;
    if (openedRef.current) return;
    openedRef.current = true;
    openOnboardingPaywall();
    logOnboardingEvent('onboarding_paywall_shown', {});
  }, [status, openOnboardingPaywall]);

  // Skip paths — flip to R13b immediately without ever opening the
  // paywall. All three collapse to `completedVia: 'skipped_paywall'`.
  // R13b is the terminal nudge; the final commit happens there.
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

  // Detect a successful purchase via hasPro / hasUltra transition.
  // PaywallSheet will close on its own after a success toast, which
  // fires the dismiss/purchase effect below. But we ALSO watch hasPro
  // here because the RC listener can flip before the paywall close
  // callback fires — whichever signal wins first locks the latch.
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

  // Wire PaywallSheet's own close signal through the disambig timer.
  // When paywallContext goes null (the sheet closed), we trigger the
  // dismiss/purchase fork.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const nowOpen = paywallContext !== null;
    if (wasOpenRef.current && !nowOpen) {
      // Sheet just closed — could be purchase OR dismiss. The hook
      // owns the single-fire latch: it only calls one of these
      // callbacks (at most).
      handleDismissOrPurchase(
        () => {
          // onPurchased — late-propagating hasPro signal.
          finalizePurchase();
        },
        () => {
          // onDismissed — user closed without buying within the
          // 500ms propagation window. Fall through to R13b.
          logOnboardingEvent('onboarding_paywall_dismissed', {});
          dispatch({ type: 'COMPLETE', via: 'maybe_later' });
        }
      );
    }
    wasOpenRef.current = nowOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paywallContext]);

  // Non-blocking fallback UI — shows during hydration, skip paths,
  // or behind the paywall sheet. Surfaces a retry UI if the final
  // commit write failed after a successful purchase.
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        fontFamily: fonts.body,
        textAlign: 'center',
      }}
    >
      {finalizeError ? (
        <>
          <div style={{
            fontFamily: fonts.title,
            fontSize: 30,
            color: C.accent,
            marginBottom: 10,
          }}>
            Almost there.
          </div>
          <div style={{
            fontSize: 15,
            color: C.textMuted,
            marginBottom: 20,
            maxWidth: 320,
            lineHeight: 1.45,
          }}>
            Your subscription is active, but I couldn't save your setup
            yet. Tap below to try again — you won't be charged twice.
          </div>
          <button
            onClick={finalizePurchase}
            style={{
              minHeight: 52,
              padding: '14px 28px',
              fontSize: 16,
              fontWeight: 700,
              fontFamily: fonts.body,
              background: C.accent,
              color: '#fff',
              border: 'none',
              borderRadius: radius.md,
              cursor: 'pointer',
              boxShadow: shadows.button,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Finish setting up
          </button>
          <div style={{
            fontSize: 12,
            color: C.textLight,
            marginTop: 12,
            maxWidth: 260,
            lineHeight: 1.4,
          }}>
            {finalizeError}
          </div>
        </>
      ) : status === 'hydrating' ? (
        <>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: `3px solid ${C.borderLight}`,
            borderTopColor: C.accent,
            animation: 'onboarding-spinner 0.9s linear infinite',
            marginBottom: 14,
          }} />
          <style>{`
            @keyframes onboarding-spinner {
              from { transform: rotate(0deg); }
              to   { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{ fontSize: 14, color: C.textMuted }}>
            One second…
          </div>
        </>
      ) : (
        <div style={{ fontSize: 14, color: C.textMuted }}>&nbsp;</div>
      )}
    </div>
  );
}
