import { useState } from 'react';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

export default function R13bNudge() {
  const { finish, answers } = useOnboarding();
  const [busy, setBusy] = useState(false);

  const canScan = answers?.cameraPermission === 'granted';
  const primaryLabel = canScan ? "Yes, let's scan" : 'Add a bag manually';

  const handlePrimary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      logOnboardingEvent('onboarding_nudge_accepted', {});
      await finish?.({ postCompleteAction: canScan ? 'scan' : 'manual_add' });
    } catch {
      setBusy(false);
    }
  };

  const handleMaybeLater = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await finish?.({ postCompleteAction: 'none' });
    } catch {
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
      <OnboardingTopBar step="R13b · ONE LAST THING" hideBack overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-waving.mp4" height={320} />

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
      }}>
        <div style={{
          fontFamily: fonts.title,
          fontSize: 36, lineHeight: 1.0,
          color: C.accent,
          textAlign: 'center',
          marginTop: -4,
        }}>
          One more tiny thing
        </div>

        <NoteBubble style={{ marginTop: 4 }}>
          No worries, brewer. Your first scan is on me — want to try it now?
          It's the fastest way to see how this all fits together.
        </NoteBubble>
      </div>

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
