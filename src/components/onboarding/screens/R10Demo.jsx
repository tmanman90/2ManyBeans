import { useState } from 'react';
import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

// R10 — canned scan demo. The real Gemini scan is gated behind the
// paywall and (more importantly) costs money per invocation, so this
// screen shows a pre-rendered screenshot with a CSS reveal animation
// over it. Zero network, zero tokens, zero camera access.
//
// Asset `public/images/onboarding/demo-scan.webp` is a TODO — fall
// back to the existing onboarding-welcome.webp until the real demo
// asset lands. Phase 5 verifies the file exists and is <500KB.
export default function R10Demo() {
  const { dispatch } = useOnboarding();
  const [imageError, setImageError] = useState(false);

  return (
    <OnboardingScreenShell
      title="Here's what a scan looks like."
      ruphusLine="Just tap a bag and I'll read the label for you."
      backDisabled
      primaryCta={{
        label: 'Got it',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r11' }),
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 340,
          aspectRatio: '3 / 4',
          margin: '4px auto 18px',
          borderRadius: radius.lg,
          overflow: 'hidden',
          background: C.card,
          border: `1px solid ${C.borderLight}`,
        }}
      >
        <img
          src={imageError ? '/images/onboarding-welcome.webp' : '/images/onboarding/demo-scan.webp'}
          alt="Example bag scan result"
          onError={() => setImageError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {/* Fill-in sweep overlay — hints at the scanner reading the
            label top-to-bottom without actually running one. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, ${C.accent}00 0%, ${C.accent}25 50%, ${C.accent}00 100%)`,
            animation: 'onboarding-demo-sweep 2.4s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
        <style>{`
          @keyframes onboarding-demo-sweep {
            0%   { transform: translateY(-100%); }
            50%  { transform: translateY(100%); }
            100% { transform: translateY(100%); }
          }
        `}</style>
      </div>

      <div style={{
        fontSize: 14,
        color: C.textMuted,
        textAlign: 'center',
        lineHeight: 1.5,
        fontFamily: fonts.body,
      }}>
        No typing. No guessing. Just the stuff on the back of the bag,
        turned into something you can actually use.
      </div>
    </OnboardingScreenShell>
  );
}
