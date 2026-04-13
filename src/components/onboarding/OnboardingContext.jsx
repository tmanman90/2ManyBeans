import { createContext, useContext } from 'react';

// File-scoped context for the onboarding flow. Screens read answers, dispatch
// reducer actions, and fire analytics through this — no prop drilling across
// 14 screens. Value shape: { answers, dispatch, logEvent, user }.
export const OnboardingContext = createContext(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used inside <OnboardingContext.Provider>');
  }
  return ctx;
}
