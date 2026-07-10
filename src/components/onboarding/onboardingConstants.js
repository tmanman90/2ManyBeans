// Centralized onboarding timing constants + chapter map.
//
// Previously these lived as inline magic numbers scattered across screens
// (R08PermissionPriming, R09Processing, R12TrialTimeline, R13Paywall,
// useOnboardingPaywall, OnboardingFlow). Centralizing them here means a
// single source of truth for anyone tuning onboarding pacing, and the
// CHAPTERS map gives OnboardingTopBar a single place to read the
// three-chapter progress structure from (see CREATIVE_SPEC.md §1).

// R09Processing — auto-advance dwell before the "building your plan" beat
// hands off to R10.
export const PROCESSING_MS = 3000;

// R08PermissionPriming — dynamic `@capacitor/camera` module import timeout.
export const CAMERA_IMPORT_TIMEOUT_MS = 4000;

// R08PermissionPriming — Camera.requestPermissions() timeout.
export const CAMERA_PERMISSION_TIMEOUT_MS = 8000;

// R13Paywall — how long we wait for RevenueCat/Firestore hydration before
// offering a "continue without subscription" escape hatch.
export const PAYWALL_HYDRATION_TIMEOUT_MS = 5000;

// useOnboardingPaywall — disambiguation window between "user purchased" and
// "user dismissed" after PaywallSheet's close handler fires.
export const PAYWALL_DISMISS_DISAMBIG_MS = 500;

// OnboardingFlow.finish() — network timeout for the terminal createProfile /
// completeOnboarding write.
export const FINISH_TIMEOUT_MS = 12000;

// R12TrialTimeline — marketing consent version tag persisted alongside the
// consent checkbox answer.
export const MARKETING_CONSENT_VERSION = 'onboarding-v1-2026-04-12';

// Three-chapter progress map (CREATIVE_SPEC.md §1). Each step key matches
// OnboardingFlow.STEPS. OnboardingTopBar derives the current chapter + its
// fill fraction by finding which chapter's `steps` array contains the
// current step.
export const CHAPTERS = [
  { label: 'You', steps: ['r1', 'r2', 'r3', 'r4'] },
  { label: 'Your taste', steps: ['r5', 'r6', 'r7', 'r8', 'r9'] },
  { label: 'Your plan', steps: ['r10', 'r11', 'r12', 'r13', 'r13b'] },
];

// Flattened step order, derived from CHAPTERS (single source of truth) rather
// than duplicated from OnboardingFlow.STEPS — importing OnboardingFlow.jsx
// from here would be circular (OnboardingFlow -> screens -> OnboardingPrimitives
// -> onboardingConstants). 14 entries, indices 0-13, matching
// aria-valuemin=0 / aria-valuemax=13 in CREATIVE_SPEC.md §1.
export const ALL_STEPS = CHAPTERS.flatMap((chapter) => chapter.steps);
