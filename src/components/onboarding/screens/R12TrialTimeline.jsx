// Phase 1 placeholder — trial timeline + marketing consent ship in Phase 4.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R12TrialTimeline() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Your free trial"
      subtitle="R12 placeholder — trial timeline + consent checkbox ship in Phase 4."
      ruphusLine="Here's what the next few days look like."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r13' }),
      }}
    />
  );
}
