// Phase 1 placeholder — real single-select brew-goal question ships in Phase 2.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R02Goal() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Goal"
      subtitle="R2 placeholder — brew-goal picker ships in Phase 2."
      ruphusLine="What are you chasing in the cup?"
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r3' }),
      }}
    />
  );
}
