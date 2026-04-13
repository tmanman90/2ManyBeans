// Phase 1 placeholder — spider chart + Ruphus letter + scan CTA ship in Phase 3.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R11ValueDelivery() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Your palate"
      subtitle="R11 placeholder — spider chart + Ruphus letter ship in Phase 3."
      ruphusLine="Ready to start? Scan your first bag and we'll get moving."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r12' }),
      }}
    />
  );
}
