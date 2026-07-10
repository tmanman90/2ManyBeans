import { C, fonts, type } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar } from './OnboardingPrimitives';

export default function R01Welcome() {
  const { dispatch } = useOnboarding();
  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar hideBack overlay />

      <div className="onb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {/* Mascot with warm vignette */}
        <div style={{
          position: 'relative',
          flexShrink: 0,
          WebkitMaskImage: 'radial-gradient(ellipse 92% 88% at 50% 44%, #000 50%, rgba(0,0,0,0.7) 68%, rgba(0,0,0,0) 100%)',
          maskImage: 'radial-gradient(ellipse 92% 88% at 50% 44%, #000 50%, rgba(0,0,0,0.7) 68%, rgba(0,0,0,0) 100%)',
        }}>
          <MascotStage src="/images/ruphus-animations/ruphus-welcome-v2.mp4" height={170} />
        </div>

        {/* Content */}
        <m.div
          variants={listContainer}
          initial="initial"
          animate="animate"
          style={{
            padding: '8px 24px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Eyebrow */}
          <m.div variants={listItem} style={{
            ...type.label,
            color: C.accent,
            textAlign: 'center',
            letterSpacing: '0.1em',
          }}>
            Your personal brew coach
          </m.div>

          {/* Display headline */}
          <m.div variants={listItem} style={{
            fontFamily: fonts.heading,
            fontSize: type.display.fontSize,
            fontWeight: type.display.fontWeight,
            lineHeight: type.display.lineHeight,
            letterSpacing: type.display.letterSpacing,
            color: C.text,
            textAlign: 'center',
            marginTop: -2,
          }}>
            Brew coffee<br />
            <span style={{ color: C.accent }}>you're proud of</span>
          </m.div>

          {/* Subhead */}
          <m.div variants={listItem} style={{
            ...type.bodyL,
            color: C.textMuted,
            textAlign: 'center',
            marginTop: -4,
          }}>
            Let me show you around.
          </m.div>

          {/* Note bubble */}
          <m.div variants={listItem} style={{ marginTop: 2 }}>
            <NoteBubble>
              I'm Professor Ruphus. Glad you're here. Give me a minute to learn how
              you brew. I'll take good care of you.
            </NoteBubble>
          </m.div>
        </m.div>
      </div>

      <OnboardingCtaBar
        label="Get started"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r2' })}
      />
    </div>
  );
}
