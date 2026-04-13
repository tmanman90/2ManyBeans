// Phase 1 placeholder — real 5-card tinder + atomic palate compute in Phase 2.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R05Tinder() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Tinder"
      subtitle="R5 placeholder — 5-card palate tinder ships in Phase 2."
      ruphusLine="Quick round. Swipe right if it sounds like you, left if it doesn't."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r6' }),
      }}
    />
  );
}
