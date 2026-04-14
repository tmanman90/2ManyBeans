import { Star } from 'lucide-react';
import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

// Testimonials are keyed off the user's R3 pain answer so the quotes
// they see actually reflect what they said bugs them. TODO: swap in
// real App Store review strings once we have ≥10 reviews — currently
// these are curated placeholder quotes that map one-to-one to the
// pain options.
//
// The numeric star count + review count is intentionally gated on
// `REVIEW_COUNT >= 10` so we never ship social proof that reads
// "rated 5.0 stars (2 reviews)". Until then the rating block is hidden
// and only the testimonials render.
const TESTIMONIALS_BY_PAIN = {
  inconsistent: [
    {
      quote: "I was dialing in my V60 by vibes. Ruphus walked me through grind, dose, and pour, and every cup since has tasted like the last good one.",
      author: 'Dan R.',
    },
    {
      quote: "Two weeks in and I'm hitting the same brew every morning. I didn't realize how much I was flying blind before.",
      author: 'Maya K.',
    },
    {
      quote: "The recipes are tuned to my actual grinder and beans, not some generic ratio. Consistency showed up on day three.",
      author: 'Sam T.',
    },
  ],
  forget_freshness: [
    {
      quote: "I used to have four open bags and no idea which was fresh. Now Ruphus tells me which jar to grab every morning.",
      author: 'Maya K.',
    },
    {
      quote: "Peak window notifications are quietly the killer feature. I drink my beans at their best now, every time.",
      author: 'Dan R.',
    },
    {
      quote: "Coffee Hub caught a bag sliding past peak before I did. It saved a $24 Gesha from going stale.",
      author: 'Sam T.',
    },
  ],
  too_many_beans: [
    {
      quote: "I literally had 2manybeans — a drawer stuffed with bags. Now I actually drink them all before they go stale.",
      author: 'Dan R.',
    },
    {
      quote: "I stopped forgetting about the bags in the back of my freezer. Everything's in one place and every bag has a recipe waiting.",
      author: 'Maya K.',
    },
    {
      quote: "I was a coffee hoarder. This is the first app that made my habit feel organized instead of chaotic.",
      author: 'Sam T.',
    },
  ],
  taste_more: [
    {
      quote: "The palate chart made everything click. I buy better beans now and I actually enjoy them.",
      author: 'Sam T.',
    },
    {
      quote: "Ruphus asks the right questions. I never knew what 'bright acidity' meant until I started tasting with this coach.",
      author: 'Maya K.',
    },
    {
      quote: "I can finally tell you why I like a cup. That's not a small thing.",
      author: 'Dan R.',
    },
  ],
  brew_like_pro: [
    {
      quote: "Ruphus nailed the tasting note I was missing. I finally know why my morning cup is so good.",
      author: 'Maya K.',
    },
    {
      quote: "I've read Hoffmann's book twice. Coffee Hub actually turns all that theory into something I apply every morning.",
      author: 'Dan R.',
    },
    {
      quote: "The recipes feel pro-level. They're tuned to my beans, my grinder, my water. That's the whole game.",
      author: 'Sam T.',
    },
  ],
};

const DEFAULT_TESTIMONIALS = TESTIMONIALS_BY_PAIN.inconsistent;

// Flip these to true + real numbers once App Store reviews cross 10.
const REVIEW_COUNT = 0;
const STAR_AVERAGE = 5.0;

export default function R04SocialProof() {
  const { dispatch, answers } = useOnboarding();
  const testimonials =
    TESTIMONIALS_BY_PAIN[answers?.pain] || DEFAULT_TESTIMONIALS;
  const showRating = REVIEW_COUNT >= 10;

  return (
    <OnboardingScreenShell
      title="You're in good company."
      ruphusLine="I'm not the only one who believes in this — look what brewers are saying."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r5' }),
      }}
    >
      {showRating && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }} aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={20} fill={C.amber} color={C.amber} />
            ))}
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, fontFamily: fonts.body }}>
            {STAR_AVERAGE.toFixed(1)} from {REVIEW_COUNT} brewers
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {testimonials.map((t, i) => (
          <div
            key={i}
            style={{
              background: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: radius.md,
              padding: '16px 18px',
            }}
          >
            <div style={{
              fontFamily: fonts.body,
              fontSize: 15,
              lineHeight: 1.45,
              color: C.text,
              marginBottom: 8,
            }}>
              &ldquo;{t.quote}&rdquo;
            </div>
            <div style={{
              fontSize: 13,
              color: C.textMuted,
              fontWeight: 600,
            }}>
              — {t.author}
            </div>
          </div>
        ))}
      </div>
    </OnboardingScreenShell>
  );
}
