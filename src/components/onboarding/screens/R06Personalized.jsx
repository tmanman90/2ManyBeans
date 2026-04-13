// Phase 1 placeholder — personalized mirror + feature cards ship in Phase 2.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R06Personalized() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Personalized"
      subtitle="R6 placeholder — mirror copy + feature cards ship in Phase 2."
      ruphusLine="Here's how I'll actually help — starting today."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r7' }),
      }}
    />
  );
}
