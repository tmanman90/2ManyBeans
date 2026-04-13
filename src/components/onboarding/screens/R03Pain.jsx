import { OnboardingScreenShell } from './OnboardingScreenShell';
import { SingleSelectList } from './SingleSelectList';
import { useOnboarding } from '../OnboardingContext';

// Hybrid: 3 concrete pain points + 1 aspirational. The aspirational
// option is intentional — some users don't have a pain, they have an
// ambition, and forcing them to pick one of the first three feels wrong.
const PAIN_OPTIONS = [
  { key: 'inconsistent', label: 'My brews are inconsistent' },
  { key: 'forget_freshness', label: 'I forget which beans are fresh' },
  { key: 'taste_more', label: 'I want to actually taste what’s in the cup' },
  { key: 'brew_like_pro', label: 'I want to brew like a pro' },
];

export default function R03Pain() {
  const { dispatch, answers } = useOnboarding();
  return (
    <OnboardingScreenShell
      title="What bugs you most right now?"
      ruphusLine="No judgement here. Pick the one that bugs you most — I've got you."
    >
      <SingleSelectList
        options={PAIN_OPTIONS}
        value={answers?.pain}
        onSelect={(key) => dispatch({
          type: 'ADVANCE',
          next: 'r4',
          answersPatch: { pain: key },
        })}
      />
    </OnboardingScreenShell>
  );
}
