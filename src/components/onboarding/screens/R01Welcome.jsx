import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

export default function R01Welcome() {
  const { dispatch } = useOnboarding();
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
      <OnboardingTopBar step="R1 · WELCOME" hideBack overlay />

      <div style={{
        position: 'relative',
        flexShrink: 0,
        WebkitMaskImage: 'radial-gradient(ellipse 95% 92% at 50% 42%, #000 55%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0) 100%)',
        maskImage: 'radial-gradient(ellipse 95% 92% at 50% 42%, #000 55%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0) 100%)',
      }}>
        <MascotStage src="/images/ruphus-animations/ruphus-welcome-v2.mp4" height={390} />
      </div>

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 0,
      }}>
        <div style={{
          fontFamily: fonts.title,
          fontSize: 38,
          lineHeight: 1.0,
          color: C.accent,
          textAlign: 'center',
          marginTop: -4,
        }}>
          Brew coffee you're proud of
        </div>
        <div style={{
          fontSize: 15,
          color: C.textMuted,
          textAlign: 'center',
          marginTop: -6,
        }}>
          Let me show you around.
        </div>

        <NoteBubble style={{ marginTop: 6 }}>
          I'm Professor Ruphus. Glad you're here. Give me a minute to learn how
          you brew — I'll take good care of you.
        </NoteBubble>
      </div>

      <OnboardingCtaBar
        label="Get started"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r2' })}
      />
    </div>
  );
}
