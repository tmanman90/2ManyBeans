import { C, fonts, type, shadows, radius, cardBase } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar } from './OnboardingPrimitives';

const TESTIMONIALS_BY_PAIN = {
  inconsistent: [
    { quote: "I was dialing in my V60 by vibes. Ruphus walked me through grind, dose, and pour, and every cup since has tasted like the last good one.", author: 'Dan R.' },
    { quote: "Two weeks in and I'm hitting the same brew every morning. I didn't realize how much I was flying blind before.", author: 'Maya K.' },
    { quote: "The recipes are tuned to my actual grinder and beans, not some generic ratio.", author: 'Sam T.' },
  ],
  forget_freshness: [
    { quote: "I used to have four open bags and no idea which was fresh. Now Ruphus tells me which jar to grab every morning.", author: 'Maya K.' },
    { quote: "Peak window notifications are quietly the killer feature. I drink my beans at their best now, every time.", author: 'Dan R.' },
    { quote: "Coffee Hub caught a bag sliding past peak before I did. It saved a $24 Gesha from going stale.", author: 'Sam T.' },
  ],
  too_many_beans: [
    { quote: "I literally had 2manybeans — a drawer stuffed with bags. Now I actually drink them all before they go stale.", author: 'Dan R.' },
    { quote: "I stopped forgetting about the bags in the back of my freezer. Everything's in one place and every bag has a recipe waiting.", author: 'Maya K.' },
    { quote: "I was a coffee hoarder. This is the first app that made my habit feel organized instead of chaotic.", author: 'Sam T.' },
  ],
  taste_more: [
    { quote: "The palate chart made everything click. I buy better beans now and I actually enjoy them.", author: 'Sam T.' },
    { quote: "Ruphus asks the right questions. I never knew what 'bright acidity' meant until I started tasting with this coach.", author: 'Maya K.' },
    { quote: "I can finally tell you why I like a cup. That's not a small thing.", author: 'Dan R.' },
  ],
  brew_like_pro: [
    { quote: "Ruphus nailed the tasting note I was missing. I finally know why my morning cup is so good.", author: 'Maya K.' },
    { quote: "I've read Hoffmann's book twice. Coffee Hub actually turns all that theory into something I apply every morning.", author: 'Dan R.' },
    { quote: "The recipes feel pro-level. They're tuned to my beans, my grinder, my water. That's the whole game.", author: 'Sam T.' },
  ],
};

const DEFAULT_TESTIMONIALS = TESTIMONIALS_BY_PAIN.inconsistent;

export default function R04SocialProof() {
  const { dispatch, answers } = useOnboarding();
  const testimonials = TESTIMONIALS_BY_PAIN[answers?.pain] || DEFAULT_TESTIMONIALS;

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
          Real brewers
        </m.div>

        {/* Headline */}
        <m.div variants={listItem} style={{
          fontFamily: fonts.heading,
          fontSize: type.h1.fontSize,
          fontWeight: type.h1.fontWeight,
          lineHeight: type.h1.lineHeight,
          letterSpacing: type.h1.letterSpacing,
          color: C.text,
          textAlign: 'center',
          marginTop: -4,
        }}>
          You're in good company.
        </m.div>

        {/* Note bubble */}
        <m.div variants={listItem}>
          <NoteBubble style={{ marginTop: 2 }}>
            I'm not the only one who believes in this — look what brewers are saying.
          </NoteBubble>
        </m.div>

        {/* Testimonial cards — staggered */}
        <m.div
          variants={listContainer}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}
        >
          {testimonials.map((t, i) => (
            <m.div key={i} variants={listItem} style={{
              ...cardBase,
              borderRadius: radius.md,
              padding: '14px 16px',
              position: 'relative',
            }}>
              {/* Quote mark accent */}
              <div style={{
                position: 'absolute',
                top: 10,
                left: 14,
                fontFamily: fonts.heading,
                fontSize: 36,
                lineHeight: 1,
                color: C.accentLight,
                opacity: 0.6,
                userSelect: 'none',
                pointerEvents: 'none',
              }}>"</div>
              <div style={{
                ...type.body,
                color: C.text,
                marginBottom: 8,
                paddingTop: 14,
                lineHeight: 1.5,
              }}>
                {t.quote}
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {/* Avatar initial */}
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: radius.pill,
                  background: C.accentSoft,
                  border: `1px solid ${C.accentLight}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{
                    ...type.caption,
                    color: C.accent,
                    fontWeight: 700,
                  }}>
                    {t.author.charAt(0)}
                  </span>
                </div>
                <div style={{
                  ...type.caption,
                  color: C.textMuted,
                  fontWeight: 700,
                }}>
                  {t.author}
                </div>
              </div>
            </m.div>
          ))}
        </m.div>
      </m.div>

      <OnboardingCtaBar
        label="Continue"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r5' })}
      />
    </div>
  );
}
