import { useLayoutEffect } from 'react';
import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

// R6 — mirror the user's r2+r3 answers back at them and tee up 3 real
// feature cards (no fabricated statistics). Features are picked from
// a goal+pain dispatch table; if the combo isn't in the table, we
// fall back to a sensible default set that leads with the recipe
// engine and the bean-tracking angle — the two lines Tal flagged as
// the core pitch.

const GOAL_COPY = {
  aiden: 'your Fellow Aiden',
  v60: 'V60 / pour over',
  aeropress: 'the Aeropress',
  french_press: 'French press',
  espresso: 'espresso',
  all: 'every method you touch',
};

const PAIN_COPY = {
  inconsistent:
    "chasing consistency",
  forget_freshness:
    "tracking freshness",
  too_many_beans:
    "taming your bean collection",
  taste_more: 'actually tasting your coffee',
  brew_like_pro: 'brewing like a pro',
};

// Small, honest feature cards. Two are load-bearing per Tal's feedback:
//   - `recipes`: Hoffmann-trained AI that tunes recipes to YOUR bean
//     and YOUR grinder (not generic ratios)
//   - `rotation`: bean library that replaces whiteboards / spreadsheets
// Everything else is secondary and gets swapped in based on goal.
const FEATURE_LIBRARY = {
  recipes: {
    title: 'Recipes tuned to you',
    body:
      "I've read every coffee book worth reading — Hoffmann, Perger, Rao — " +
      "and I use all of it to pull a brew recipe tuned to the bean on your " +
      "counter and the grinder you actually own. No generic ratios.",
  },
  rotation: {
    title: 'Finally a home for every bag',
    body:
      "No whiteboards. No Excel. No Notes app graveyard. I track every bag — " +
      "roast date, peak window, origin, tasting notes — and I tell you which " +
      "jar to grab this morning.",
  },
  tasting: {
    title: 'Guided tasting coach',
    body:
      "Step-by-step coaching that meets you where you are. No vague \"what do " +
      "you taste?\" questions — real scaffolded notes you can act on.",
  },
  scan: {
    title: 'Snap the bag, get the whole story',
    body:
      "Point at the back label. I'll read the origin, process, altitude, and " +
      "roast level, then turn all of it into a recipe.",
  },
  ruphus: {
    title: 'Professor Ruphus',
    body:
      "Stories and brewing lessons tied to the beans actually in your rotation.",
  },
  aiden: {
    title: 'Fellow Aiden profiles',
    body:
      "Every bag gets a custom Aiden profile pushed straight to your brewer — " +
      "origin-aware, roast-aware, one tap away from your cup.",
  },
};

// Goal → ordered feature keys. `recipes` and `rotation` lead nearly
// every combination because they're the two strongest selling points.
const GOAL_FEATURE_MAP = {
  aiden:        ['aiden', 'recipes', 'rotation'],
  v60:          ['recipes', 'rotation', 'tasting'],
  aeropress:    ['recipes', 'rotation', 'tasting'],
  french_press: ['recipes', 'rotation', 'ruphus'],
  espresso:     ['recipes', 'scan', 'rotation'],
  all:          ['recipes', 'rotation', 'tasting'],
};

const DEFAULT_FEATURES = ['recipes', 'rotation', 'tasting'];

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
