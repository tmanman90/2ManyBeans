import { C, fonts, type } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingOptionList } from './OnboardingPrimitives';

const PAIN_OPTIONS = [
  { key: 'inconsistent', label: 'My brews are inconsistent' },
  { key: 'forget_freshness', label: 'I forget which beans are fresh' },
  { key: 'too_many_beans', label: 'I have 2manybeans to keep track of' },
  { key: 'taste_more', label: 'I want to actually taste what’s in the cup' },
  { key: 'brew_like_pro', label: 'I want to brew like a pro' },
];

// Goal-keyed acknowledgment — CREATIVE_SPEC.md Appendix A1 (verbatim). Keyed
// by R02Goal's stored goal answer values. Unknown/missing goal falls back to
// the original bubble copy, unchanged.
const GOAL_ACKNOWLEDGMENTS = {
  aiden: "The Aiden. Precision brewing, meet precision coaching. Now, what's getting in the way?",
  v60: "V60. A brewer after my own heart. Now, what's getting in the way?",
  aeropress: "The Aeropress. Small brewer, huge ceiling. Now, what's getting in the way?",
  french_press: "French press. Honest, full-bodied brewing. Now, what's getting in the way?",
  espresso: "Espresso. The deep end. I like it. Now, what's getting in the way?",
  all: "All of them. A true generalist. Now, what's getting in the way?",
};
const FALLBACK_ACKNOWLEDGMENT = "No judgement here. Pick the one that bugs you most. I've got you.";

export default function R03Pain() {
  const { dispatch, answers } = useOnboarding();
  const acknowledgment = GOAL_ACKNOWLEDGMENTS[answers?.goal] || FALLBACK_ACKNOWLEDGMENT;
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

      <MascotStage src="/images/ruphus-animations/ruphus-listening.mp4" height={260} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Note bubble */}
        <m.div variants={listItem}>
          <NoteBubble>
            {acknowledgment}
          </NoteBubble>
        </m.div>

        {/* Eyebrow */}
        <m.div variants={listItem} style={{
          ...type.label,
          color: C.textLight,
          marginTop: 4,
        }}>
          Pain point
        </m.div>

        {/* Headline */}
        <m.div variants={listItem} style={{
          fontFamily: fonts.heading,
          fontSize: type.h1.fontSize,
          fontWeight: type.h1.fontWeight,
          lineHeight: type.h1.lineHeight,
          letterSpacing: type.h1.letterSpacing,
          color: C.text,
          marginTop: -6,
        }}>
          What bugs you most right now?
        </m.div>

        {/* Option list */}
        <m.div variants={listItem}>
          <OnboardingOptionList
            options={PAIN_OPTIONS}
            value={answers?.pain}
            onSelect={(key) => dispatch({
              type: 'ADVANCE',
              next: 'r4',
              answersPatch: { pain: key },
            })}
            compact
          />
        </m.div>
      </m.div>
    </div>
  );
}
