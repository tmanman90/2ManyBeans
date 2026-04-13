// Phase 1 placeholder — real processing animation + cancel token ship in Phase 3.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R09Processing() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Processing"
      subtitle="R9 placeholder — animation + paywall preload race ships in Phase 3."
      ruphusLine="Studying your palate..."
      backDisabled
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r10' }),
      }}
    />
  );
}
