import { Cpu, Droplets, FlaskConical, Coffee, Zap, Sparkles } from 'lucide-react';
import { C, fonts, type, radius } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingOptionList } from './OnboardingPrimitives';

const GOAL_OPTIONS = [
  { key: 'aiden', label: 'Fellow Aiden', icon: Cpu },
  { key: 'v60', label: 'V60 / Pour Over', icon: Droplets },
  { key: 'aeropress', label: 'Aeropress', icon: FlaskConical },
  { key: 'french_press', label: 'French Press', icon: Coffee },
  { key: 'espresso', label: 'Espresso', icon: Zap },
  { key: 'all', label: 'All of them', icon: Sparkles },
];

export default function R02Goal() {
  const { dispatch, answers } = useOnboarding();
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

      <div className="onb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <MascotStage src="/images/ruphus-animations/ruphus-thinking.mp4" height={150} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          padding: '4px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Note bubble */}
        <m.div variants={listItem}>
          <NoteBubble>
            Right, tell me what you're chasing. I'll tailor everything around it.
          </NoteBubble>
        </m.div>

        {/* Eyebrow */}
        <m.div variants={listItem} style={{
          ...type.label,
          color: C.textLight,
          marginTop: 4,
        }}>
          Brew goal
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
          What do you want to brew better?
        </m.div>

        {/* Option list — staggered */}
        <m.div variants={listItem}>
          <OnboardingOptionList
            options={GOAL_OPTIONS}
            value={answers?.goal}
            onSelect={(key) => dispatch({
              type: 'ADVANCE',
              next: 'r3',
              answersPatch: { goal: key },
            })}
            compact
          />
        </m.div>
      </m.div>
      </div>
    </div>
  );
}
