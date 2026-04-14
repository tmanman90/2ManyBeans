import { Cpu, Droplets, FlaskConical, Coffee, Zap, Sparkles } from 'lucide-react';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { SingleSelectList } from './SingleSelectList';
import { useOnboarding } from '../OnboardingContext';

// Options are ordered by Coffee Hub's actual strength: Fellow Aiden
// first (first-class integration, automatic profile push), then hand
// brew methods, then "all of them" as a catch-all. The icons come from
// lucide-react so they inherit the selected/unselected color state.
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
