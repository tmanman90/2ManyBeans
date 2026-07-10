import { useState } from 'react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

export default function R13bNudge() {
  const { finish, answers } = useOnboarding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canScan = answers?.cameraPermission === 'granted';
  const primaryLabel = canScan ? "Yes, let's scan" : 'Add a bag manually';

  const handlePrimary = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      logOnboardingEvent('onboarding_nudge_accepted', {});
      await finish?.({ postCompleteAction: canScan ? 'scan' : 'manual_add' });
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  const handleMaybeLater = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await finish?.({ postCompleteAction: 'none' });
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

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

      <MascotStage src="/images/ruphus-animations/ruphus-waving.mp4" height={320} />

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
        }}
      >
        {/* Warm heading in Caveat — intentional rare accent use */}
        <m.div variants={listItem} style={{
          fontFamily: fonts.title,
          fontSize: 38,
          lineHeight: 1.0,
          color: C.accent,
          textAlign: 'center',
          marginTop: -4,
        }}>
          One more tiny thing
        </m.div>

        <m.div variants={listItem}>
          <NoteBubble style={{ marginTop: 0 }}>
            No worries, brewer. Your first scan is on me — want to try it now?
            It's the fastest way to see how this all fits together.
          </NoteBubble>
        </m.div>

        {/* Warm benefit card */}
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
              {canScan ? '📸' : '✍️'}
            </div>
            <div>
              <div style={{ ...t.h3, color: C.text, marginBottom: 2 }}>
                {canScan ? 'Scan your first bag' : 'Add your first bag'}
              </div>
              <div style={{ ...t.body, color: C.textMuted }}>
                {canScan
                  ? 'Point at the back label — I do the rest.'
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
      </m.div>

      <OnboardingCtaBar
        label={primaryLabel}
        onClick={handlePrimary}
        disabled={busy}
        secondary={{
          label: 'Maybe later',
          onClick: handleMaybeLater,
        }}
      />
    </div>
  );
}
