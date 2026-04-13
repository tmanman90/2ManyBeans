import { useLayoutEffect } from 'react';
import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

// R6 — mirror the user's r2+r3 answers back at them and tee up 3 real
// feature cards (no fabricated statistics). The feature pick is a
// dispatch table keyed on (goal, pain) — if the user's combo isn't in
// the table, we fall back to a sensible default set.

const GOAL_COPY = {
  v60: 'V60 / pour over',
  aeropress: 'the Aeropress',
  french_press: 'French press',
  espresso: 'espresso',
  all: 'every method you touch',
};

const PAIN_COPY = {
  inconsistent: "chasing consistency",
  forget_freshness: "tracking freshness",
  taste_more: 'actually tasting your coffee',
  brew_like_pro: 'brewing like a pro',
};

// Small, honest feature cards. Keep descriptions grounded — no claims
// like "used by 50,000 brewers." These are all real Coffee Hub features.
const FEATURE_LIBRARY = {
  rotation: {
    title: 'Peak rotation',
    body: "I'll tell you which jar is in its window so you're drinking beans at their best.",
  },
  tasting: {
    title: 'Guided tasting',
    body: "Step-by-step tasting coach that meets you where you are. No vague questions.",
  },
  scan: {
    title: 'Bag scanner',
    body: "Snap the back label and I'll pull origin, altitude, and brew recs.",
  },
  ruphus: {
    title: 'Professor Ruphus',
    body: "Stories and brewing lessons tied to the beans actually in your rotation.",
  },
  aiden: {
    title: 'Fellow Aiden recipes',
    body: "I'll hand your Aiden a custom profile for every bag, based on origin and roast level.",
  },
};

// Dispatch table: goal → 3 feature keys. Pain adds a nudge at the end.
const GOAL_FEATURE_MAP = {
  v60: ['rotation', 'tasting', 'scan'],
  aeropress: ['rotation', 'tasting', 'scan'],
  french_press: ['rotation', 'scan', 'ruphus'],
  espresso: ['scan', 'aiden', 'rotation'],
  all: ['rotation', 'tasting', 'scan'],
};

const DEFAULT_FEATURES = ['rotation', 'tasting', 'scan'];

export default function R06Personalized() {
  const { dispatch, answers } = useOnboarding();

  const hasPalate =
    Array.isArray(answers?.tinderCards) &&
    answers.tinderCards.length === 5 &&
    !!answers?.palateChart;

  // Guard per plan: if we somehow land here without a full palate result,
  // bounce back to R5 to finish it. useLayoutEffect + a render-time null
  // return keep the stale R6 content from flashing on screen.
  useLayoutEffect(() => {
    if (!hasPalate) dispatch({ type: 'ADVANCE', next: 'r5' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasPalate) return null;

  const featureKeys = GOAL_FEATURE_MAP[answers?.goal] || DEFAULT_FEATURES;
  const features = featureKeys.map((k) => FEATURE_LIBRARY[k]).filter(Boolean);

  const goalLabel = GOAL_COPY[answers?.goal] || 'your brew';
  const painLabel = PAIN_COPY[answers?.pain] || 'dialing in';

  return (
    <OnboardingScreenShell
      title={`Here's how I'll help with ${goalLabel}.`}
      subtitle={`We'll focus on ${painLabel} together — starting today.`}
      ruphusLine="Here's how I'll actually help — starting today."
      primaryCta={{
        label: 'Sounds good',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r7' }),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              background: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: radius.md,
              padding: '14px 16px',
            }}
          >
            <div style={{
              fontFamily: fonts.heading,
              fontSize: 18,
              color: C.text,
              marginBottom: 4,
            }}>
              {f.title}
            </div>
            <div style={{
              fontSize: 14,
              color: C.textMuted,
              lineHeight: 1.45,
            }}>
              {f.body}
            </div>
          </div>
        ))}
      </div>
    </OnboardingScreenShell>
  );
}
