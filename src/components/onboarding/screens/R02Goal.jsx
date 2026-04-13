import { OnboardingScreenShell } from './OnboardingScreenShell';
import { SingleSelectList } from './SingleSelectList';
import { useOnboarding } from '../OnboardingContext';

const GOAL_OPTIONS = [
  { key: 'v60', label: 'V60 / Pour Over', emoji: '☕' },
  { key: 'aeropress', label: 'Aeropress', emoji: '🧪' },
  { key: 'french_press', label: 'French Press', emoji: '🫖' },
  { key: 'espresso', label: 'Espresso', emoji: '⚡' },
  { key: 'all', label: 'All of them', emoji: '🌟' },
];

export default function R02Goal() {
  const { dispatch, answers } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="What do you want to brew better?"
      ruphusLine="Right — tell me what you're chasing. I'll tailor everything after this around it."
    >
      <SingleSelectList
        options={GOAL_OPTIONS}
        value={answers?.goal}
        onSelect={(key) => dispatch({
          type: 'ADVANCE',
          next: 'r3',
          answersPatch: { goal: key },
        })}
      />
    </OnboardingScreenShell>
  );
}
