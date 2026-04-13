import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';
import { OnboardingPalateChart } from '../OnboardingPalateChart';
import { RuphusSpeechBubble } from '../RuphusSpeechBubble';

// R11 — value delivery. This is the emotional apex of the flow:
// user sees the palate chart we computed from R5, reads Ruphus's warm
// mentor letter templated from their r2+r3 answers, then taps a
// single clear CTA to start scanning.
//
// The CTA label and the action both branch on cameraPermission. If
// denied/unavailable, we switch from "Scan my first bag" → "Add my
// first bag" and persist postCompleteAction accordingly — that gets
// read by App.jsx on mount after onboarding completes.

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

// Convert the {sweetness, acidity, body, clean_funky, fruit_nutty}
// chart into a short "your palate at a glance" line. Pick the two
// strongest axes and mention them by name.
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
    <OnboardingScreenShell
      title="Your palate, in five axes."
      primaryCta={{
        label: ctaLabel,
        onClick: () => {
          dispatch({
            type: 'ADVANCE',
            next: 'r12',
            answersPatch: {
              postCompleteAction: canScan ? 'scan' : 'manual_add',
            },
          });
        },
      }}
    >
      {/* Chart — dominates the upper half */}
      <div style={{ marginTop: 4, marginBottom: 18 }}>
        <OnboardingPalateChart chart={answers?.palateChart} size={260} />
      </div>

      {snapshot && (
        <div style={{
          textAlign: 'center',
          fontFamily: fonts.heading,
          fontSize: 16,
          color: C.text,
          marginBottom: 18,
          lineHeight: 1.3,
        }}>
          {snapshot}
        </div>
      )}

      {/* Ruphus letter — warm mentor, templated from r2+r3 */}
      <div style={{ marginBottom: 14 }}>
        <RuphusSpeechBubble>
          {intro}{' '}{body}{' '}
          Ready to start? Your first bag is one tap away.
        </RuphusSpeechBubble>
      </div>

      {/* Tiny footer note — manages expectations if the user declined
          the camera, so the CTA label doesn't feel jarring. */}
      {!canScan && (
        <div style={{
          fontSize: 12,
          color: C.textMuted,
          textAlign: 'center',
          padding: '8px 12px',
          background: C.amberBg,
          border: `1px solid #E8D5A0`,
          borderRadius: radius.sm,
          lineHeight: 1.4,
          fontFamily: fonts.body,
        }}>
          Camera's off for now — I'll help you add bags by hand. You can flip
          it back on anytime from Settings.
        </div>
      )}
    </OnboardingScreenShell>
  );
}
