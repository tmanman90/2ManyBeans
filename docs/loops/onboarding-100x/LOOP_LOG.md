# onboarding-100x loop log (orchestrator decisions)

- D1 (U2): `:` added to palateSummaryLine sanitize charset to match the spec's example format. APPROVED.
- D2 (U2): TastingWizard/RotationTab lacked profile access; orchestrator wired `onboardingPalate` prop App→RotationTab (getRecommendations 3rd arg) and App→TastingTab→TastingWizard (applyPalateTiebreak around predict). Defaults null; existing users identical.
- D3 (U9): R08 "Not now" uses the shared OnboardingCtaBar secondary slot (14px) instead of the spec's 15px one-off. APPROVED: shared-primitive consistency beats a 1px literal.
- D4 (U10): posters generated for celebrating + writing-notes (current R09/R10 videos) so reduced-motion is never broken pre-Phase-2; 19/19 videos now have posters.
- D5 (spec): R10 fallback exemplar is Appendix A5 (Bombe Bensa, Ethiopia · Natural) and supersedes §2(b)'s "washed" wording. Real bean, real notes.
- D6 (U9): ALL_STEPS derived in onboardingConstants (not imported from OnboardingFlow) to avoid a circular import; verified byte-identical to STEPS.
