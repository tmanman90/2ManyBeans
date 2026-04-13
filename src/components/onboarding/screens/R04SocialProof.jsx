import { Star } from 'lucide-react';
import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

// Placeholder testimonials. Real App Store review strings land before
// launch — TODO: pull from App Store reviews via ASC export.
//
// The numeric star count + review count is intentionally gated on
// `REVIEW_COUNT >= 10` so we never ship social proof that reads
// "rated 5.0 stars (2 reviews)". If we haven't crossed the threshold,
// the numeric block is hidden and only the testimonials render.
const TESTIMONIALS = [
  {
    quote: "Ruphus nailed the tasting note I was missing. I finally know why my morning cup is so good.",
    author: 'Maya K.',
  },
  {
    quote: "I'd been scared of my V60 for a year. Two weeks in and I'm dialing in like I know what I'm doing.",
    author: 'Dan R.',
  },
  {
    quote: "The palate chart made everything click. I buy better beans now and I actually enjoy them.",
    author: 'Sam T.',
  },
];

// Flip these to true + real numbers once App Store reviews cross 10.
const REVIEW_COUNT = 0;
const STAR_AVERAGE = 5.0;

export default function R04SocialProof() {
  const { dispatch } = useOnboarding();
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
        {TESTIMONIALS.map((t, i) => (
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
