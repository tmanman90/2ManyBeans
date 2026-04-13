import { C, fonts } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { RuphusSpeechBubble } from '../RuphusSpeechBubble';
import { useOnboarding } from '../OnboardingContext';

// R1 — the first impression. Static hero + warm Ruphus intro + single CTA.
// Hero art is the existing onboarding-welcome.webp (MVP stand-in; final art
// is a future asset swap, not a phase gate). backDisabled — there's nowhere
// to go back to.
export default function R01Welcome() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      backDisabled
      primaryCta={{
        label: 'Get started',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r2' }),
      }}
    >
      {/* Hero image — fills a big square card at the top of the screen */}
      <div style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        marginTop: 4,
        marginBottom: 24,
      }}>
        <img
          src="/images/onboarding-welcome.webp"
          alt="Welcome to Coffee Hub"
          style={{
            width: '100%',
            maxWidth: 320,
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            borderRadius: 20,
          }}
        />
      </div>

      {/* Display headline in the script font — this is the brand moment */}
      <div style={{
        fontFamily: fonts.title,
        fontSize: 40,
        lineHeight: 1.05,
        color: C.accent,
        textAlign: 'center',
        marginBottom: 8,
      }}>
        Brew coffee you're proud of
      </div>

      <div style={{
        fontSize: 16,
        color: C.textMuted,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 1.4,
      }}>
        Let me show you around.
      </div>

      {/* Ruphus intro bubble — positioned under the hero instead of the
          shell's default `ruphusLine` slot so the hero stays above it. */}
      <RuphusSpeechBubble variant="large">
        I'm Professor Ruphus. Glad you're here. Give me a minute to learn how
        you brew — I'll take good care of you.
      </RuphusSpeechBubble>
    </OnboardingScreenShell>
  );
}
