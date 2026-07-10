import { useLayoutEffect } from 'react';
import { C, fonts, type, shadows, radius, cardBase } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar } from './OnboardingPrimitives';

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

// Feature icon mapping (emoji — no extra imports needed)
const FEATURE_ICONS = {
  recipes: '📖',
  rotation: '🫙',
  tasting: '👅',
  scan: '📷',
  ruphus: '🦊',
  aiden: '⚙️',
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
  const features = featureKeys.map((k) => ({ ...FEATURE_LIBRARY[k], icon: FEATURE_ICONS[k], key: k })).filter(Boolean);
  const goalLabel = GOAL_COPY[answers?.goal] || 'your brew';
  const painLabel = PAIN_COPY[answers?.pain] || 'dialing in';

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

      <MascotStage src="/images/ruphus-animations/ruphus-presenting.mp4" height={360} />

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
          color: C.accent,
          textAlign: 'center',
        }}>
          Your personalized plan
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
          Here's how I'll help.
        </m.div>

        {/* Personalization callout */}
        <m.div variants={listItem} style={{
          ...type.bodyL,
          color: C.textMuted,
          textAlign: 'center',
          marginTop: -4,
        }}>
          Focused on {painLabel} — starting today.
        </m.div>

        {/* Note bubble */}
        <m.div variants={listItem}>
          <NoteBubble style={{ marginTop: 2 }}>
            Here's how I'll actually help — starting today.
          </NoteBubble>
        </m.div>

        {/* Feature cards — staggered */}
        <m.div
          variants={listContainer}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}
        >
          {features.map((f) => (
            <m.div key={f.key} variants={listItem} style={{
              ...cardBase,
              borderRadius: radius.md,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
            }}>
              {/* Feature icon bubble */}
              <div style={{
                width: 44,
                height: 44,
                borderRadius: radius.sm,
                background: C.accentSoft,
                border: `1px solid ${C.accentLight}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 22,
              }}>
                {f.icon}
              </div>

              {/* Text block */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: fonts.heading,
                  fontSize: type.h3.fontSize,
                  fontWeight: type.h3.fontWeight,
                  lineHeight: type.h3.lineHeight,
                  color: C.text,
                  marginBottom: 4,
                }}>
                  {f.title}
                </div>
                <div style={{
                  ...type.body,
                  color: C.textMuted,
                  lineHeight: 1.45,
                }}>
                  {f.body}
                </div>
              </div>
            </m.div>
          ))}
        </m.div>
      </m.div>

      <OnboardingCtaBar
        label="Sounds good"
        onClick={() => dispatch({ type: 'ADVANCE', next: 'r7' })}
      />
    </div>
  );
}
