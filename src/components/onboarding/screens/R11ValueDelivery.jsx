import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { OnboardingPalateChart } from '../OnboardingPalateChart';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

const GOAL_INTRO = {
  v60: "You're a V60 brewer who cares about every pour.",
  aeropress: "You love the Aeropress — quick, forgiving, endlessly variable.",
  french_press: "You're a French press brewer chasing that full, heavy cup.",
  espresso: "Espresso is your thing — precision, shot after shot.",
  all: "You'll brew across every method, and you want each one to shine.",
};

const PAIN_BODY = {
  inconsistent:
    "We'll lock in your routine so your next cup tastes like the last one — on purpose, not by luck.",
  forget_freshness:
    "I'll watch the clock on every bag so you always know which one's in its window.",
  taste_more:
    "We'll work on your palate together. No vague questions, just clear, honest notes you can act on.",
  brew_like_pro:
    "I'll push you — origin, grind size, recipe tweaks, the whole thing. You'll get there.",
};

function palateOneLiner(chart) {
  if (!chart || typeof chart !== 'object') return '';
  const axes = [
    { key: 'sweetness', yes: 'sweet', no: 'sharp' },
    { key: 'acidity', yes: 'bright and fruity', no: 'smooth and mellow' },
    { key: 'body', yes: 'heavy-bodied', no: 'light and clean' },
    { key: 'clean_funky', yes: 'washed and clean', no: 'wild and fermented' },
    { key: 'fruit_nutty', yes: 'nutty and chocolatey', no: 'fruit-forward' },
  ];
  const ranked = axes
    .map((a) => ({ ...a, score: chart[a.key] || 0 }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const top = ranked.slice(0, 2).map((a) => (a.score >= 0 ? a.yes : a.no));
  if (!top.length) return '';
  return top.join(' · ');
}

export default function R11ValueDelivery() {
  const { dispatch, answers } = useOnboarding();

  const intro = GOAL_INTRO[answers?.goal] || "You care about your cup — and that's where we start.";
  const body = PAIN_BODY[answers?.pain] || "We'll build you a routine you actually trust.";
  const snapshot = palateOneLiner(answers?.palateChart);
  const canScan = answers?.cameraPermission === 'granted';
  const ctaLabel = canScan ? 'Scan my first bag' : 'Add my first bag';

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
      <OnboardingTopBar step="R11 · YOUR PALATE" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-cupping.mp4" height={410} />

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
          fontSize: 26, lineHeight: 1.15,
          color: C.text,
          textAlign: 'center',
        }}>
          Your palate, in five axes.
        </div>

        <div style={{ marginTop: 4 }}>
          <OnboardingPalateChart chart={answers?.palateChart} size={220} />
        </div>

        {snapshot && (
          <div style={{
            textAlign: 'center',
            fontFamily: fonts.heading,
            fontSize: 16,
            color: C.text,
            lineHeight: 1.3,
            marginTop: 4,
          }}>
            {snapshot}
          </div>
        )}

        <NoteBubble>
          {intro} {body} Ready to start? Your first bag is one tap away.
        </NoteBubble>

        {!canScan && (
          <div style={{
            fontSize: 12,
            color: C.textMuted,
            textAlign: 'center',
            padding: '8px 12px',
            background: C.amberBg,
            border: '1px solid #E8D5A0',
            borderRadius: 8,
            lineHeight: 1.4,
          }}>
            Camera's off for now — I'll help you add bags by hand. You can flip
            it back on anytime from Settings.
          </div>
        )}
      </div>

      <OnboardingCtaBar
        label={ctaLabel}
        onClick={() => dispatch({
          type: 'ADVANCE',
          next: 'r12',
          answersPatch: { postCompleteAction: canScan ? 'scan' : 'manual_add' },
        })}
      />
    </div>
  );
}
