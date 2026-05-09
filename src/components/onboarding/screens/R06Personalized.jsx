import { useLayoutEffect } from 'react';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

const GOAL_COPY = {
  aiden: 'your Fellow Aiden',
  v60: 'V60 / pour over',
  aeropress: 'the Aeropress',
  french_press: 'French press',
  espresso: 'espresso',
  all: 'every method you touch',
};

const PAIN_COPY = {
  inconsistent: "chasing consistency",
  forget_freshness: "tracking freshness",
  too_many_beans: "taming your bean collection",
  taste_more: 'actually tasting your coffee',
  brew_like_pro: 'brewing like a pro',
};

const FEATURE_LIBRARY = {
  recipes: {
    title: 'Recipes tuned to you',
    body: "I've read every coffee book worth reading and I use all of it to pull a brew recipe tuned to your bean and your grinder. No generic ratios.",
  },
  rotation: {
    title: 'Finally a home for every bag',
    body: "No whiteboards. No spreadsheets. I track every bag and tell you which one to grab this morning.",
  },
  tasting: {
    title: 'Guided tasting coach',
    body: "Step-by-step coaching that meets you where you are. Real, scaffolded notes you can act on.",
  },
  scan: {
    title: 'Snap the bag, get the whole story',
    body: "Point at the back label. I'll read the origin, process, altitude, and roast level, then turn all of it into a recipe.",
  },
  ruphus: {
    title: 'Professor Ruphus',
    body: "Stories and brewing lessons tied to the beans actually in your rotation.",
  },
  aiden: {
    title: 'Fellow Aiden profiles',
    body: "Every bag gets a custom Aiden profile pushed straight to your brewer, one tap away from your cup.",
  },
};

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
      <OnboardingTopBar step="R6 · YOUR PLAN" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-presenting.mp4" height={410} />

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
          Here's how I'll help.
        </div>
        <div style={{
          fontSize: 15,
          color: C.textMuted,
          textAlign: 'center',
          marginTop: -4,
          lineHeight: 1.4,
        }}>
          We'll focus on {painLabel} together — starting today.
        </div>

        <NoteBubble style={{ marginTop: 4 }}>
          Here's how I'll actually help — starting today.
        </NoteBubble>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {features.map((f) => (
            <div key={f.title} style={{
              background: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}>
              <div style={{
                fontFamily: fonts.heading, fontSize: 16, color: C.text,
                marginBottom: 3,
              }}>
                {f.title}
              </div>
              <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.4 }}>
                {f.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <OnboardingCtaBar
        label="Sounds good"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r7' })}
      />
    </div>
  );
}
