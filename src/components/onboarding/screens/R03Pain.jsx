import { OnboardingScreenShell } from './OnboardingScreenShell';
import { SingleSelectList } from './SingleSelectList';
import { useOnboarding } from '../OnboardingContext';

// Hybrid: 4 concrete pain points + 1 aspirational. The aspirational
// option is intentional — some users don't have a pain, they have an
// ambition, and forcing them to pick one of the concrete ones feels
// wrong. The "2manybeans" option winks at the app name and captures
// the bag-pile hoarder use case Tal flagged as a common reality.
const PAIN_OPTIONS = [
  { key: 'inconsistent', label: 'My brews are inconsistent' },
  { key: 'forget_freshness', label: 'I forget which beans are fresh' },
  { key: 'too_many_beans', label: 'I have 2manybeans to keep track of' },
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
