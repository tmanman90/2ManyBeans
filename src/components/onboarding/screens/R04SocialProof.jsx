import { BookOpen, CircleDot, Package } from 'lucide-react';
import { C, fonts, type, radius } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar } from './OnboardingPrimitives';

// Copy bank — CREATIVE_SPEC.md §2 R04 (contract law, verbatim). No invented
// humans, no star ratings, no laurels we don't have — three hairline-bordered
// credibility rows instead of testimonials.
const CREDIBILITY_ROWS = [
  {
    Icon: BookOpen,
    title: 'The Hoffmann tasting method',
    body: 'Smell, slurp, structure. The same arc pros use, one beat at a time.',
  },
  {
    Icon: CircleDot,
    title: 'The SCA flavor wheel',
    body: "Every note you'll ever taste, organized the way judges do it.",
  },
  {
    Icon: Package,
    title: 'Your actual shelf',
    body: 'I read your bags, your roasters, your grinder. Advice about YOUR coffee, not coffee in general.',
  },
];

export default function R04SocialProof() {
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
      <OnboardingTopBar overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-reading-book.mp4" height={370} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 24px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Eyebrow */}
        <m.div variants={listItem} style={{
          ...type.label,
          color: C.textLight,
          textAlign: 'center',
        }}>
          YOUR COACH
        </m.div>

        {/* Headline */}
        <m.div variants={listItem} style={{
          fontFamily: fonts.title,
          fontSize: 34,
          fontWeight: 600,
          lineHeight: 1.04,
          letterSpacing: '-0.022em',
          color: C.text,
          textAlign: 'center',
          marginTop: -4,
        }}>
          What I'm trained on.
        </m.div>

        {/* Note bubble */}
        <m.div variants={listItem}>
          <NoteBubble style={{ marginTop: 2 }}>
            I'm not here to guess. Everything I coach comes from the real canon, and from your own shelf.
          </NoteBubble>
        </m.div>

        {/* Credibility rows — hairline-bordered, NOT cards-in-cards. Entrance
            is CSS keyframe stagger per the motion law (entrances = CSS only). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
          {CREDIBILITY_ROWS.map(({ Icon, title, body }, i) => (
            <div
              key={title}
              className="r04-row"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                border: `1px solid ${C.hairline}`,
                borderRadius: radius.md,
                padding: 14,
                animationDelay: `${i * 60}ms`,
              }}
            >
              <Icon size={18} color={C.text} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontFamily: fonts.body, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                  {title}
                </div>
                <div style={{ fontFamily: fonts.body, fontSize: 14, fontWeight: 500, color: C.textMuted, lineHeight: 1.4 }}>
                  {body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </m.div>

      <OnboardingCtaBar
        label="Continue"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r5' })}
      />

      <style>{`
        .r04-row { opacity: 1; }
        @media (prefers-reduced-motion: no-preference) {
          .r04-row {
            opacity: 0;
            animation: r04RowIn 240ms cubic-bezier(0.22,1,0.36,1) both;
          }
          @keyframes r04RowIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        }
      `}</style>
    </div>
  );
}
