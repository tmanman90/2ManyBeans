import { Cpu, Droplets, FlaskConical, Coffee, Zap, Sparkles } from 'lucide-react';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingOptionList, onboardingBg } from './OnboardingPrimitives';

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
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar step="R2 · BREW GOAL" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-thinking.mp4" height={290} />

      <div style={{
        flex: 1,
        padding: '4px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 0,
        overflowY: 'auto',
      }}>
        <NoteBubble>
          Right — tell me what you're chasing. I'll tailor everything around it.
        </NoteBubble>

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 24,
          lineHeight: 1.15,
          color: C.text,
          marginTop: 4,
        }}>
          What do you want to brew better?
        </div>

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
      </div>
    </div>
  );
}
