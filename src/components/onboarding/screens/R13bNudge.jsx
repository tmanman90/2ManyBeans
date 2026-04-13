import { useState } from 'react';
import { C, fonts } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { RuphusSpeechBubble } from '../RuphusSpeechBubble';
import { useOnboarding } from '../OnboardingContext';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';

// R13b — the soft nudge after a paywall dismiss. Goal: convert some
// "maybe later" users into day-1 activators by offering a single
// scan-CTA. The Phase 1 finish() callback lives on the onboarding
// context — here we just attach the postCompleteAction first, then
// fire it.
//
// If the user granted the camera, the primary CTA scans a bag; if
// they didn't, we show the manual-add variant (same postCompleteAction
// enum, App.jsx handles the branch on the other side).

export default function R13bNudge() {
  const { finish, answers } = useOnboarding();
  const [busy, setBusy] = useState(false);

  const canScan = answers?.cameraPermission === 'granted';
  const primaryLabel = canScan ? "Yes, let's scan" : 'Add a bag manually';

  const handlePrimary = async () => {
    if (busy) return;
    setBusy(true);
    logOnboardingEvent('onboarding_nudge_accepted', {});
    // `finish` in OnboardingFlow writes the final atomic setDoc with
    // whatever answers we've accumulated. We overwrite
    // postCompleteAction right before calling so App.jsx knows what
    // to do on mount.
    await finish?.({ postCompleteAction: canScan ? 'scan' : 'manual_add' });
  };

  const handleMaybeLater = async () => {
    if (busy) return;
    setBusy(true);
    await finish?.({ postCompleteAction: 'none' });
  };

  return (
    <OnboardingScreenShell
      title="One more tiny thing."
      backDisabled
      primaryCta={{
        label: primaryLabel,
        onClick: handlePrimary,
        disabled: busy,
      }}
      secondaryCta={{
        label: 'Maybe later',
        onClick: handleMaybeLater,
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 16,
      }}>
        <img
          src="/images/professor-ruphus.webp"
          alt="Professor Ruphus"
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: `3px solid ${C.borderLight}`,
            marginBottom: 18,
          }}
        />
      </div>

      <RuphusSpeechBubble variant="large">
        No worries, brewer. Your first scan is on me — want to try it now?
        It's the fastest way to see how this all fits together.
      </RuphusSpeechBubble>

      {!canScan && (
        <div style={{
          marginTop: 14,
          fontSize: 12,
          color: C.textMuted,
          textAlign: 'center',
          fontFamily: fonts.body,
          lineHeight: 1.4,
        }}>
          Camera's off — I'll walk you through adding a bag by hand.
        </div>
      )}
    </OnboardingScreenShell>
  );
}
