// Phase 1 placeholder — scan-CTA nudge + postCompleteAction handoff ship in
// Phase 4. Placeholder finalizes onboarding via the parent flow's complete
// callback so a fresh user can actually reach the main app.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R13bNudge() {
  const { finish } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="One more thing"
      subtitle="R13b placeholder — scan-CTA nudge ships in Phase 4."
      ruphusLine="No worries, brewer. Let's get you into the app."
      backDisabled
      primaryCta={{
        label: 'Finish',
        onClick: () => finish?.(),
      }}
    />
  );
}
