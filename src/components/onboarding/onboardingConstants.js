// Centralized onboarding timing constants + chapter map.
//
// Previously these lived as inline magic numbers scattered across screens
// (R08PermissionPriming, R09Processing, R12TrialTimeline, R13Paywall,
// useOnboardingPaywall, OnboardingFlow). Centralizing them here means a
// single source of truth for anyone tuning onboarding pacing, and the
// CHAPTERS map gives OnboardingTopBar a single place to read the
// three-chapter progress structure from (see CREATIVE_SPEC.md §1).

// R09Processing — total palate-chart assembly sequence duration (5 axis
// beats, 600ms apart, plus a short hold) before auto-advancing to R10.
// Replaces the old PROCESSING_MS (grepped: unused elsewhere, removed).
export const R09_ASSEMBLY_MS = 3200;

// R09Processing — reduced-motion dwell: chart + labels render complete
// instantly, single caption, then advance.
export const R09_REDUCE_DWELL_MS = 800;

// R08PermissionPriming — dynamic `@capacitor/camera` module import timeout.
export const CAMERA_IMPORT_TIMEOUT_MS = 4000;

// R08PermissionPriming — Camera.requestPermissions() timeout.
export const CAMERA_PERMISSION_TIMEOUT_MS = 8000;

// R10Demo — hard timeout wrapping the scanBeanLabel() Gemini call so a slow
// network never strands the user on the RuphusThinking loader; timeout
// routes silently to the variant-(b) fallback card (CREATIVE_SPEC.md §2 R10).
export const SCAN_TIMEOUT_MS = 12000;

// R05: hold after the 5th swipe before auto-advancing (CREATIVE_SPEC: 300ms).
export const R05_LAST_SWIPE_HOLD_MS = 300;

// R08: dwell on the denied message before auto-advancing.
export const R08_DENIED_DWELL_MS = 800;

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

// R13Paywall / R13bNudge — redemption success celebration dwell (mascot
// swaps to fist-pump, headline crossfades to "You're in, brewer.") before
// finish() commits and hands off to the app.
export const REDEEM_CELEBRATE_MS = 900;

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
