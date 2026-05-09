import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingOptionList, onboardingBg } from './OnboardingPrimitives';

const PAIN_OPTIONS = [
  { key: 'inconsistent', label: 'My brews are inconsistent' },
  { key: 'forget_freshness', label: 'I forget which beans are fresh' },
  { key: 'too_many_beans', label: 'I have 2manybeans to keep track of' },
  { key: 'taste_more', label: 'I want to actually taste what’s in the cup' },
  { key: 'brew_like_pro', label: 'I want to brew like a pro' },
];

export default function R03Pain() {
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
      <OnboardingTopBar step="R3 · PAIN POINT" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-listening.mp4" height={290} />

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
          No judgement here. Pick the one that bugs you most — I've got you.
        </NoteBubble>

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 24,
          lineHeight: 1.15,
          color: C.text,
          marginTop: 4,
        }}>
          What bugs you most right now?
        </div>

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
      </div>
    </div>
  );
}
