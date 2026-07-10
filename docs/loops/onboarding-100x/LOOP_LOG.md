# onboarding-100x loop log (orchestrator decisions)

- D1 (U2): `:` added to palateSummaryLine sanitize charset to match the spec's example format. APPROVED.
- D2 (U2): TastingWizard/RotationTab lacked profile access; orchestrator wired `onboardingPalate` prop App→RotationTab (getRecommendations 3rd arg) and App→TastingTab→TastingWizard (applyPalateTiebreak around predict). Defaults null; existing users identical.
- D3 (U9): R08 "Not now" uses the shared OnboardingCtaBar secondary slot (14px) instead of the spec's 15px one-off. APPROVED: shared-primitive consistency beats a 1px literal.
- D4 (U10): posters generated for celebrating + writing-notes (current R09/R10 videos) so reduced-motion is never broken pre-Phase-2; 19/19 videos now have posters.
- D5 (spec): R10 fallback exemplar is Appendix A5 (Bombe Bensa, Ethiopia · Natural) and supersedes §2(b)'s "washed" wording. Real bean, real notes.
- D6 (U9): ALL_STEPS derived in onboardingConstants (not imported from OnboardingFlow) to avoid a circular import; verified byte-identical to STEPS.
- D7 (U8): Appendix A1 acknowledgment map keyed by R02's stored goal values (aiden/v60/aeropress/french_press/espresso/all), mapped 1:1 in list order. APPROVED.
- D8 (U3/U8): motion-law clarification. Onboarding mounts in-tree (Gate 5), NOT in a portal, so existing framer listContainer/listItem top-level entrances are safe and stay (sibling convention); CSS keyframes are used for precise per-item staggers (R04 rows, R09 axis beats). The portal ban applies to portaled overlays.
- D9 (orchestrator): R03 fallback acknowledgment em dash replaced with a period (copy law); U3's AXIS_LABELS approved as non-duplicate of the chart's short legend; R11 FEATURES-trim interpretation approved; PROCESSING_MS removed (grep-verified unused).
