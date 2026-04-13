// Phase 1 placeholder — grinder + brew method + display name + paywall warm
// in Phase 2/3.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R07Preferences() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Preferences"
      subtitle="R7 placeholder — grinder / brew method / display name ship in Phase 2."
      ruphusLine="Last bit. Tell me what you've got and I'll set up your kit."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r8' }),
      }}
    />
  );
}
