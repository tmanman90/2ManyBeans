// Phase 1 placeholder — real pain-point picker ships in Phase 2.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R03Pain() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Pain point"
      subtitle="R3 placeholder — pain-point picker ships in Phase 2."
      ruphusLine="No judgement. Pick the one that bugs you most."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r4' }),
      }}
    />
  );
}
