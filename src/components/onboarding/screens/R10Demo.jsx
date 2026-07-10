import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, listContainer, listItem } from '../../../lib/motion';
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
      <OnboardingTopBar hideBack overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-writing-notes.mp4" height={230} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <m.div variants={listItem}>
          <NoteBubble>
            Just tap a bag and I'll read the label for you.
          </NoteBubble>
        </m.div>

        <m.div variants={listItem} style={{
          ...t.h1,
          color: C.text,
          marginTop: 2,
        }}>
          Here's what a scan looks like.
        </m.div>

        {/* Premium demo card */}
        <m.div
          variants={listItem}
          style={{
            ...cardBase,
            position: 'relative',
            width: '100%',
            maxWidth: 340,
            aspectRatio: '3 / 4',
            margin: '4px auto 0',
            borderRadius: radius.lg,
            overflow: 'hidden',
            boxShadow: shadows.e3,
          }}
        >
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

          {/* Scanning line overlay */}
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
              left: 0, right: 0, height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${C.accent} 20%, ${C.accentLight} 50%, ${C.accent} 80%, transparent 100%)`,
              boxShadow: `0 0 12px ${C.accent}cc, 0 0 24px ${C.accent}66`,
              animation: 'r10-scan 2.6s ease-in-out infinite',
              top: 0,
            }} />
          </div>

          {/* Corner brackets — scanner UI detail */}
          {[
            { top: 10, left: 10, borderTop: `2px solid ${C.accent}`, borderLeft: `2px solid ${C.accent}` },
            { top: 10, right: 10, borderTop: `2px solid ${C.accent}`, borderRight: `2px solid ${C.accent}` },
            { bottom: 10, left: 10, borderBottom: `2px solid ${C.accent}`, borderLeft: `2px solid ${C.accent}` },
            { bottom: 10, right: 10, borderBottom: `2px solid ${C.accent}`, borderRight: `2px solid ${C.accent}` },
          ].map((s, i) => (
            <div
              key={i}
              aria-hidden
              style={{
                position: 'absolute',
                width: 18, height: 18,
                pointerEvents: 'none',
                ...s,
              }}
            />
          ))}

          <style>{`
            @media (prefers-reduced-motion: no-preference) {
              @keyframes r10-scan {
                0%   { top: 0%;  opacity: 0; }
                8%   { opacity: 1; }
                92%  { opacity: 1; }
                100% { top: 96%; opacity: 0; }
              }
            }
          `}</style>
        </m.div>

        <m.div variants={listItem} style={{
          ...t.body,
          color: C.textMuted,
          textAlign: 'center',
          marginTop: 4,
          lineHeight: 1.5,
        }}>
          No typing. No guessing. Just the back of the bag, turned into something useful.
        </m.div>
      </m.div>

      <OnboardingCtaBar
        label="Got it"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r11' })}
      />
    </div>
  );
}
