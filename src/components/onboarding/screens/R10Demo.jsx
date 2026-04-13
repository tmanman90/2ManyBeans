// Phase 1 placeholder — real canned scan-demo asset ships in Phase 3.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R10Demo() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Demo"
      subtitle="R10 placeholder — canned bean-scan demo ships in Phase 3."
      ruphusLine="Here's what a scan looks like."
      backDisabled
      primaryCta={{
        label: 'Got it',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r11' }),
      }}
    />
  );
}
