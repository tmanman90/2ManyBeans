import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

export default function R10Demo() {
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
      <OnboardingTopBar step="R10 · SCAN DEMO" hideBack overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-writing-notes.mp4" height={230} />

      <div style={{
        flex: 1,
        padding: '4px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto',
      }}>
        <NoteBubble>
          Just tap a bag and I'll read the label for you.
        </NoteBubble>

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 23, lineHeight: 1.2,
          color: C.text,
          marginTop: 2,
        }}>
          Here's what a scan looks like.
        </div>

        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: 340,
          aspectRatio: '3 / 4',
          margin: '4px auto 0',
          borderRadius: 16,
          overflow: 'hidden',
          background: C.card,
          border: `1px solid ${C.borderLight}`,
        }}>
          <img
            src="/images/onboarding/demo-scan.webp"
            alt="Example bag scan result"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <div style={{
              position: 'absolute',
              left: 0, right: 0, height: 3,
              background: C.accent,
              boxShadow: `0 0 14px ${C.accent}, 0 0 28px ${C.accent}aa`,
              animation: 'r10-scan 2.6s ease-in-out infinite',
              top: 0,
            }} />
          </div>
          <style>{`
            @keyframes r10-scan {
              0%   { top: 0%;  opacity: 0; }
              8%   { opacity: 1; }
              92%  { opacity: 1; }
              100% { top: 96%; opacity: 0; }
            }
          `}</style>
        </div>

        <div style={{
          fontSize: 13, color: C.textMuted,
          textAlign: 'center', marginTop: 8, lineHeight: 1.4,
        }}>
          No typing. No guessing. Just the back of the bag, turned into something useful.
        </div>
      </div>

      <OnboardingCtaBar
        label="Got it"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r11' })}
      />
    </div>
  );
}
