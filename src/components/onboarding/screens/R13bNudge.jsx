import { useCallback, useEffect, useRef, useState } from 'react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';
import RedemptionInline from './RedemptionInline';
import { haptic } from '../../../lib/haptics';
import { REDEEM_CELEBRATE_MS } from '../onboardingConstants';

export default function R13bNudge() {
  const { finish, answers } = useOnboarding();
  const { hasPro, hasUltra } = useSubscription();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // cross-handler finish guard (codex P23 finding 3)
  const [error, setError] = useState(null);
  const [celebrating, setCelebrating] = useState(false);

  // R7 fix (loop log D10): a scan already completed in R10/R11 is held as
  // answers.pendingScanBean. When present, the primary CTA goes straight to
  // the shelf instead of re-offering the scan/manual fork, and it must not
  // clobber the postCompleteAction that's already set.
  const hasPendingScan = !!answers?.pendingScanBean;
  const canScan = answers?.cameraPermission === 'granted';
  const showScanBenefit = hasPendingScan || canScan;
  const primaryLabel = hasPendingScan
    ? 'Take me to my shelf'
    : (canScan ? "Yes, let's scan" : 'Add a bag manually');

  const handlePrimary = async () => {
    if (busy || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      logOnboardingEvent('onboarding_nudge_accepted', {});
      const postCompleteAction = hasPendingScan
        ? (answers?.postCompleteAction != null ? answers.postCompleteAction : 'scan')
        : (canScan ? 'scan' : 'manual_add');
      await finish?.({ postCompleteAction });
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleMaybeLater = async () => {
    if (busy || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      // Preserve a postCompleteAction already set by R11 (e.g. a completed
      // scan/manual-add) — "Maybe later" must never downgrade a held scan.
      // Only fall back to 'none' when nothing was set yet (R8 fix).
      const heldAction = answers?.postCompleteAction;
      await finish?.({ postCompleteAction: heldAction != null ? heldAction : 'none' });
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Redemption — same contract as R13: verify the entitlement actually
  // reached useSubscription before celebrating (polled, up to 3s), then
  // finish() straight into the app with completedVia: 'code_redeemed'
  // (mirrors the purchase path, which also skips back through this screen).
  const hasProRef = useRef(hasPro);
  const hasUltraRef = useRef(hasUltra);
  useEffect(() => { hasProRef.current = hasPro; }, [hasPro]);
  useEffect(() => { hasUltraRef.current = hasUltra; }, [hasUltra]);

  const waitForEntitlementRefresh = useCallback(() => new Promise((resolve) => {
    const deadline = Date.now() + 3000;
    const tick = () => {
      if (hasProRef.current || hasUltraRef.current) { resolve(true); return; }
      if (Date.now() >= deadline) { resolve(false); return; }
      setTimeout(tick, 150);
    };
    tick();
  }), []);

  const handleRedeemed = useCallback(async () => {
    if (busyRef.current) return; // a finish is already in flight (Maybe later / primary)
    busyRef.current = true;
    setBusy(true);
    const confirmed = await waitForEntitlementRefresh();
    if (!confirmed) {
      // Server-side redemption succeeded but the entitlement listener hasn't
      // caught up: never show the celebration on an unconfirmed state. Finish
      // straight into the app; the entitlement lands via the live listener.
      try {
        await finish?.({ completedVia: 'code_redeemed' });
      } catch (err) {
        busyRef.current = false;
        setBusy(false);
        setError(err?.message || 'Something went wrong. Please try again.');
      }
      return;
    }
    setCelebrating(true);
    haptic.medium();
    setTimeout(async () => {
      try {
        await finish?.({ completedVia: 'code_redeemed' });
      } catch (err) {
        busyRef.current = false;
        setBusy(false);
        setCelebrating(false);
        setError(err?.message || 'Something went wrong. Please try again.');
      }
    }, REDEEM_CELEBRATE_MS);
  }, [waitForEntitlementRefresh, finish]);

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar hideBack overlay />

      {/* Celebration swaps the SAME MascotStage slot to fist-pump — this
          screen's mascot is already a full center-top hero (unlike R13's
          small corner treatment), so no separate poster-only fallback is
          needed here; MascotStage already handles poster + reduced-motion. */}
      <MascotStage
        src={celebrating
          ? '/images/ruphus-animations/ruphus-fist-pump.mp4'
          : '/images/ruphus-animations/ruphus-waving.mp4'}
        height={320}
      />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 24px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
          // Scrollable so the expanding invite-code input (and the keyboard
          // it summons) can never clip behind the CTA bar on short phones
          // (codex P23 finding 8).
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Warm heading in Caveat — intentional rare accent use. Crossfades
            to the redemption success line (240ms, CSS, key-remount pattern
            matching OnboardingTopBar's chapter-label crossfade). */}
        <div
          key={celebrating ? 'celebrate' : 'normal'}
          className="r13b-headline-x"
          style={{
            fontFamily: fonts.title,
            fontSize: 38,
            lineHeight: 1.0,
            color: C.accent,
            textAlign: 'center',
            marginTop: -4,
          }}
        >
          {celebrating ? "You're in, brewer." : 'One more tiny thing'}
        </div>

        {!celebrating && (
          <>
            <m.div variants={listItem}>
              <NoteBubble style={{ marginTop: 0 }}>
                No worries, brewer. Your first scan is on me. Want to try it now?
                It's the fastest way to see how this all fits together.
              </NoteBubble>
            </m.div>

            {/* Warm benefit card — scan-variant copy also shown when a scan
                already happened (pendingScanBean held), even if the camera
                permission flag is stale. */}
            {!error && (
              <m.div variants={listItem} style={{
                ...cardBase,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: radius.lg,
                border: `1.5px solid ${C.accentLight}`,
                background: C.accentSoft,
              }}>
                <div style={{
                  width: 40, height: 40,
                  borderRadius: radius.md,
                  background: C.cream,
                  border: `1px solid ${C.accentLight}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  flexShrink: 0,
                  boxShadow: shadows.e1,
                }}>
                  {showScanBenefit ? '📸' : '✍️'}
                </div>
                <div>
                  <div style={{ ...t.h3, color: C.text, marginBottom: 2 }}>
                    {showScanBenefit ? 'Scan your first bag' : 'Add your first bag'}
                  </div>
                  <div style={{ ...t.body, color: C.textMuted }}>
                    {showScanBenefit
                      ? 'Point at the back label. I do the rest.'
                      : 'A few fields and your rotation is live.'}
                  </div>
                </div>
              </m.div>
            )}

            {error && (
              <m.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  ...t.body,
                  color: C.red,
                  background: C.redBg,
                  border: `1px solid rgba(182,92,69,0.25)`,
                  borderRadius: radius.md,
                  padding: '10px 14px',
                  lineHeight: 1.45,
                  textAlign: 'center',
                }}
              >
                {error}
              </m.div>
            )}

            <m.div variants={listItem} style={{ marginTop: 'auto' }}>
              <RedemptionInline onRedeemed={handleRedeemed} />
            </m.div>
          </>
        )}
      </m.div>

      {!celebrating && (
        <OnboardingCtaBar
          label={primaryLabel}
          onClick={handlePrimary}
          disabled={busy}
          secondary={{
            label: 'Maybe later',
            onClick: handleMaybeLater,
          }}
        />
      )}

      <style>{`
        .r13b-headline-x { opacity: 1; }
        @media (prefers-reduced-motion: no-preference) {
          .r13b-headline-x {
            animation: r13bHeadlineFade 240ms ease-out;
          }
          @keyframes r13bHeadlineFade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
