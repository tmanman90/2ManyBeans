import { useEffect, useRef } from 'react';
import { C, fonts } from '../../../styles/theme';
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
  // The PaywallSheet itself will close after a short success toast,
  // which fires the dismiss-vs-purchase effect below. But we ALSO
  // watch hasPro here because the RC listener can flip before the
  // paywall close callback fires — the first signal wins, and
  // flowCompletedRef stops a double-commit.
  //
  // Purchased path: skip R13b entirely. Call finish() directly with
  // completedVia='paywall' — Gate 5 will re-render into the main app
  // as soon as profile.onboardingComplete flips true.
  const prevHasSubRef = useRef(false);
  useEffect(() => {
    const hasSub = hasPro || hasUltra;
    if (hasSub && !prevHasSubRef.current && !flowCompletedRef.current) {
      flowCompletedRef.current = true;
      closePaywall();
      logOnboardingEvent('onboarding_paywall_trial_started', {
        tier: hasUltra ? 'ultra' : 'pro',
      });
      finish?.({ completedVia: 'paywall' });
    }
    prevHasSubRef.current = hasSub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPro, hasUltra]);

  // Wire PaywallSheet's own close signal through the disambig timer.
  // We piggyback on the same global paywall state: when paywallContext
  // goes null (the sheet is closed), we trigger the dismiss flow.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const nowOpen = paywallContext !== null;
    if (wasOpenRef.current && !nowOpen) {
      // Sheet just closed — could be purchase OR dismiss. The hook
      // owns the flowCompletedRef latch: it only calls one of these
      // callbacks (at most), so we don't re-check or re-assign the
      // ref here. The callbacks are guaranteed single-fire per
      // disambig window.
      handleDismissOrPurchase(
        () => {
          // onPurchased — late-propagating hasPro signal. The
          // purchase transition effect above may have already fired
          // finish() first; the OnboardingFlow.finish() `finishing`
          // guard makes the second call a no-op.
          finish?.({ completedVia: 'paywall' });
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

  // Non-blocking fallback UI — shows during hydration, skip paths, or
  // behind the paywall sheet. Always mounted so the reducer
  // transitions have somewhere to land.
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
      {status === 'hydrating' ? (
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
        <div style={{ fontSize: 14, color: C.textMuted }}>
          &nbsp;
        </div>
      )}
    </div>
  );
}

