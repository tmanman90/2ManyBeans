// Phase 1 placeholder — replaced with the real hero + Ruphus intro in Phase 2.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R01Welcome() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Welcome"
      subtitle="R1 placeholder — hero + Ruphus intro ships in Phase 2."
      ruphusLine="Glad you're here, brewer. Let me show you around."
      backDisabled
      primaryCta={{
        label: 'Get started',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r2' }),
      }}
    />
  );
}
