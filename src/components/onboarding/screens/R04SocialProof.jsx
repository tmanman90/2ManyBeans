import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

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
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar step="R4 · YOU'RE IN GOOD COMPANY" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-reading-book.mp4" height={410} />

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 26,
          lineHeight: 1.15,
          color: C.text,
          textAlign: 'center',
        }}>
          You're in good company.
        </div>

        <NoteBubble style={{ marginTop: 4 }}>
          I'm not the only one who believes in this — look what brewers are saying.
        </NoteBubble>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {testimonials.map((t, i) => (
            <div key={i} style={{
              background: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: C.text, marginBottom: 6 }}>
                &ldquo;{t.quote}&rdquo;
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 700 }}>
                — {t.author}
              </div>
            </div>
          ))}
        </div>
      </div>

      <OnboardingCtaBar
        label="Continue"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r5' })}
      />
    </div>
  );
}
