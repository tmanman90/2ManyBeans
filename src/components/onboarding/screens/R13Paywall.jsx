// Phase 1 placeholder — PaywallSheet handoff + useOnboardingPaywall ship in
// Phase 4. Placeholder just advances to R13b so the full flow is reachable.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R13Paywall() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Paywall"
      subtitle="R13 placeholder — PaywallSheet handoff ships in Phase 4."
      ruphusLine="Want me to guide you all the way?"
      backDisabled
      primaryCta={{
        label: 'Continue',
        onClick: () => dispatch({ type: 'COMPLETE', via: 'skipped_paywall' }),
      }}
    />
  );
}
