// Phase 1 placeholder — real camera permission priming ships in Phase 3.
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

export default function R08PermissionPriming() {
  const { dispatch } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="Camera"
      subtitle="R8 placeholder — camera permission priming ships in Phase 3."
      ruphusLine="I'll need your camera to read the back labels on your bags."
      primaryCta={{
        label: 'Allow camera',
        onClick: () => dispatch({ type: 'ADVANCE', next: 'r9' }),
      }}
    />
  );
}
