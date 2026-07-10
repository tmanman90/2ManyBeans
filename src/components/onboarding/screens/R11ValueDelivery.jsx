import { C, fonts, type as t, radius, cardBase } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { OnboardingPalateChart } from '../OnboardingPalateChart';
import { palateArchetype, palatePrediction } from '../../../lib/onboardingPalate';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

const GOAL_INTRO = {
  v60: "You're a V60 brewer who cares about every pour.",
  aeropress: "You love the Aeropress. Quick, forgiving, endlessly variable.",
  french_press: "You're a French press brewer chasing that full, heavy cup.",
  espresso: "Espresso is your thing. Precision, shot after shot.",
  all: "You'll brew across every method, and you want each one to shine.",
};

const PAIN_BODY = {
  inconsistent:
    "We'll lock in your routine so your next cup tastes like the last one. On purpose, not by luck.",
  forget_freshness:
    "I'll watch the clock on every bag so you always know which one's in its window.",
  taste_more:
    "We'll work on your palate together. No vague questions, just clear, honest notes you can act on.",
  brew_like_pro:
    "I'll push you: origin, grind size, recipe tweaks, the whole thing. You'll get there.",
};

// Feature highlight rows — trimmed to exactly two per CREATIVE_SPEC.md §2 R11
// ("keep existing map, trim to 2"). Copy kept verbatim; the third row
// ("Tasting log") is deleted, not just hidden.
const FEATURES = [
  { icon: '⏱', label: 'Freshness tracking', body: 'Peak window always visible, per bag.' },
  { icon: '🎯', label: 'Dialed-in recipes', body: 'Brew settings tuned to your grinder and method.' },
];

export default function R11ValueDelivery() {
  const { dispatch, answers } = useOnboarding();

  const intro = GOAL_INTRO[answers?.goal] || "You care about your cup, and that's where we start.";
  const body = PAIN_BODY[answers?.pain] || "We'll build you a routine you actually trust.";
  const canScan = answers?.cameraPermission === 'granted';
  // A scan already happened in R10: the CTA is a plain continue (spec: the
  // scan label only appears when no scan has happened yet).
  const hasHeldScan = !!answers?.pendingScanBean;
  const ctaLabel = hasHeldScan ? 'Continue' : (canScan ? 'Scan my first bag' : 'Add my first bag');

  const archetype = palateArchetype(answers?.palateChart);
  const prediction = palatePrediction(archetype.n);

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
      <OnboardingTopBar overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-cupping.mp4" height={410} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 24px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <m.div variants={listItem} style={{
          ...t.eyebrow,
          color: C.textLight,
          textAlign: 'center',
        }}>
          YOUR COFFEE PROFILE
        </m.div>

        <m.div variants={listItem} style={{
          ...t.display,
          color: C.text,
          textAlign: 'center',
          marginTop: -4,
        }}>
          {archetype.title}
        </m.div>

        <m.div variants={listItem} style={{
          ...t.body,
          fontSize: 15,
          color: C.textMuted,
          textAlign: 'center',
          marginTop: -6,
        }}>
          {archetype.subtitle}
        </m.div>

        {/* Chart already assembled in R09 — renders complete here, single
            240ms CSS fade only, no re-assembly/re-stagger. */}
        <div className="r11-chart-fade" style={{ marginTop: 4 }}>
          <OnboardingPalateChart chart={answers?.palateChart} size={220} />
        </div>

        <m.div variants={listItem} style={{
          fontFamily: fonts.heading,
          fontStyle: 'italic',
          fontSize: 18,
          color: C.text,
          textAlign: 'center',
          lineHeight: 1.35,
        }}>
          First guess: you'll love {prediction}.
        </m.div>

        <m.div variants={listItem}>
          <NoteBubble>
            {intro} {body} Ready to start? Your first bag is one tap away.
          </NoteBubble>
        </m.div>

        {/* Feature highlight cards — exactly two */}
        <m.div variants={listItem} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          {FEATURES.map((f) => (
            <div key={f.label} style={{
              ...cardBase,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              borderRadius: radius.md,
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: radius.sm,
                background: C.accentSoft,
                border: `1px solid ${C.accentLight}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ ...t.h3, color: C.text, marginBottom: 1 }}>
                  {f.label}
                </div>
                <div style={{ ...t.body, color: C.textMuted }}>
                  {f.body}
                </div>
              </div>
            </div>
          ))}
        </m.div>

        {!canScan && (
          <m.div variants={listItem} style={{
            ...t.caption,
            color: C.textMuted,
            textAlign: 'center',
            padding: '10px 14px',
            background: C.amberBg,
            border: `1px solid ${C.accentLight}`,
            borderRadius: radius.md,
            lineHeight: 1.45,
          }}>
            Camera's off for now. I'll help you add bags by hand. You can flip
            it back on anytime from Settings.
          </m.div>
        )}
      </m.div>

      <OnboardingCtaBar
        label={ctaLabel}
        onClick={() => dispatch({
          type: 'ADVANCE',
          next: 'r12',
          answersPatch: { postCompleteAction: canScan ? 'scan' : 'manual_add' },
        })}
      />

      <style>{`
        .r11-chart-fade { opacity: 1; }
        @media (prefers-reduced-motion: no-preference) {
          .r11-chart-fade {
            opacity: 0;
            animation: r11ChartIn 240ms cubic-bezier(0.22,1,0.36,1) both;
          }
          @keyframes r11ChartIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
