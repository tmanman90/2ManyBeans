import { useCallback, useEffect, useRef, useState } from 'react';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { useOnboardingPaywall } from '../useOnboardingPaywall';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { usePaywall } from '../../../hooks/usePaywall.jsx';
import { onboardingBg } from './OnboardingPrimitives';

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
      <video
        src="/images/ruphus-animations/ruphus-confident.mp4"
        autoPlay muted loop playsInline preload="auto"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 30%',
        }}
      />

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: '74%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.92) 22%, #FFFFFF 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '32px 24px',
        textAlign: 'center',
      }}>
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
                borderRadius: 12,
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 4px 12px rgba(176,117,64,0.18)',
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
              width: 36, height: 36, borderRadius: '50%',
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
              One second...
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: C.textMuted }}>&nbsp;</div>
        )}
      </div>
    </div>
  );
}
