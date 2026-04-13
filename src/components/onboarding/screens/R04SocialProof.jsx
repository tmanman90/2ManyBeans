// Phase 1 placeholder — real testimonials + star count ships in Phase 2.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R04SocialProof() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Social proof"
      subtitle="R4 placeholder — testimonials ship in Phase 2."
      ruphusLine="I'm not the only one who believes in this."
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r5' }),
      }}
    />
  );
}
