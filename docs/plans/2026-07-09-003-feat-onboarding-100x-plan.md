---
type: feat
date: 2026-07-09
origin: docs/research/2026-07-09-onboarding-audit.md
status: approved-pending-budget
deepened: 2026-07-09
---

# Onboarding 100x — premium, personal, unbreakable (+ grind on the card)

## Overview / Problem Frame
The 13-screen onboarding has the right spine (mascot-as-coach, palate swipe deck, priming, trial timeline) but fails the two tests that separate premium from theater: the personalization is write-only (no answer is ever read again), and the aha moment never happens (R10 shows a *picture* of a scan; the real scan is post-paywall). Plus craft debt: fabricated testimonials, bare-"Ruphus" copy, dead chapter labels, reduced-motion gaps, no camera decline, dead code, and a postCompleteAction overwrite bug. Tal's constraints: ONE overnight loop; everything perfect; must feel PREMIUM and CANNOT BE BROKEN; Reddit users will arrive with invite codes and must be able to redeem trivially during onboarding. Separately: grind size must be readable on the trading card without complicating it.

Research anchors (docs/research/2026-07-09-onboarding-audit.md §C): value-context→paywall 15% vs 2%; ~90% of trial starts on Day 0; multi-page paywall +37%; quiz length irrelevant, visible personalization per question is the variable; honest-paywall timeline +23% conv −55% complaints.

## Requirements Trace
- **R1 Grind on card** — BeanDetailCard front stat bar third cell becomes contextual: ACTIVE beans show GRIND (the component's existing `grindText`), non-active beans keep WEIGHT; null `grindText` falls back to Weight. No new chrome, hairline row unchanged.
- **R2 Answers become live data** — the app READS onboarding answers: (a) chat dynamic context gains a one-line palate/goal summary (sanitized, capped, NOT in cached static block); (b) Tasting Wizard expectation seeding consults the onboarding palate when a bean-level prediction is ambiguous; (c) recommendations tie-break using goal/pain. All reads additive + null-safe for the ~all existing users who have no answers.
- **R3 R09 real labor** — the processing screen visibly assembles the REAL palate chart from the user's swipes (staged axis reveal, CSS keyframes, reduce-gated), replacing quip-only theater. Duration stays ~3s.
- **R4 R11 = "Your coffee profile"** — palate chart + a concrete deterministic taste prediction derived from `src/lib/onboardingPalate.js` (e.g. "You'll probably love washed Ethiopians — bright, tea-like") + copy that names the user's goal and pain. This screen's content is the paywall's setup beat.
- **R5 Real first scan pre-paywall** — camera-granted users get a live "scan your first bag now" moment (native camera → existing `scanBeanLabel`) with the result rendered as the aha card. Scanned data is HELD in onboarding state and committed via the existing bean pipeline immediately after `finish()` succeeds. Hard fallback matrix — camera denied/unavailable, user skips, scan timeout (12s), API error → prediction-reveal path continues seamlessly; NO path blocks or dead-ends the flow; skip is always visible.
- **R6 Paywall as narrative** — R13 backdrop page one becomes a personalized recap ("Your coffee profile is ready" + what Pro/Ultra keeps alive, referencing their goal), visually continuous with R12's timeline; native RC sheet stays the only purchase surface; close/skip visible from the start; no dark patterns (Apple 2026 rejection classes: hidden close, price obfuscation, toggle-trial tricks).
- **R7 Invite-code path** — "Have an invite code?" affordance on R13 (and R13b) opening an inline redemption input wired to existing `redeemCode()` (src/lib/redeemCode.js); 16px input, keyboard-safe, paste-friendly, uppercase-normalized; success → celebration beat → `finish({completedVia:'code_redeemed'})` (additive enum value) → straight into the app with entitlement active; failure → friendly inline error, retry, never stuck.
- **R8 postCompleteAction bug** — R13b defaults to R11's stated intent; "Maybe later" on R13b no longer silently downgrades `scan` to `none` unless the user explicitly declines the scan nudge itself.
- **R9 Honest social proof + naming** — R04's fabricated testimonials removed; replaced with an honest credibility screen (what Professor Ruphus is actually built on: the Hoffmann tasting arc, the SCA flavor wheel, roaster-profile knowledge — verifiable claims only, no invented humans). ALL bare-"Ruphus" user-facing copy fixed (R04 quotes, OnboardingErrorBoundary).
- **R10 Chaptered progress** — segmented progress bar with three rendered chapters ("You · Your taste · Your plan"), endowed start (first segment pre-filled on R01), `role="progressbar"` + aria-valuenow; the dead `step` label strings become the real rendered chapter labels or are deleted.
- **R11 Camera decline** — R08 gets an explicit "Not now" secondary action (writes `cameraPermission:'denied'`, advances); copy stays honest about what the camera is for.
- **R12 Reduced motion** — MascotStage videos render poster-frame (no autoplay) and all onboarding CSS keyframes (r09-fill, r10-scan, spinner, new reveals) are gated behind `prefers-reduced-motion`.
- **R13 Hygiene** — delete dead `OnboardingScreenShell.jsx`, `RuphusSpeechBubble.jsx`, `SingleSelectList.jsx`; timing constants + `MARKETING_CONSENT_VERSION` into one constants module; unused mascot-video list documented (files stay — CDN-served).
- **R14 Onboarding harness** — new `scripts/verify-onboarding.mjs` (Playwright WebKit, mock-injected camera/RC/scan/Firestore adapters): traverses fresh full flow, resume-mid-flow, back-nav (incl. R05 wipe guard), camera-denied path, scan-fallback matrix, paywall skip, code redemption success+failure, R13b both paths, reduced-motion pass, aria assertions, zero console errors. Must close browser in finally + process.exit (lessons.md rule).
- **R15 Device evidence gate** — new `scripts/verify-onboarding-evidence.mjs` (modeled on verify-polish-evidence.mjs): fails unless fresh, resolution-valid sim frames exist for EVERY screen incl. the scan aha, paywall recap, and code-redemption states.
- **R16 Regression** — all existing verify-* gates stay green; completion write shape unchanged (additive fields only); auth gate, free-tier gating, RC purchase mechanics untouched.

## Scope Boundaries (do NOT)
- No data-model breaking changes: `onboardingAnswers` keys are additive; existing users without answers must be unaffected everywhere new reads land.
- No new purchase UI: the native RevenueCat sheet remains the only purchase surface; `redeemCode()` is reused, not reimplemented.
- Don't touch: auth (useAuth/reauth), Firestore rules, api proxies (scan uses the existing client helper), tab surfaces beyond the R1 stat cell + the three additive R2 read sites, keyboard/safe-area plumbing.
- Don't rebuild MascotStage or re-encode videos; don't add new video assets to the OTA bundle (76MB CDN lesson).
- No prod deploy, no main merge: dev channel only, `-devapp.<ts>` labels.
- Deferred: post-decline 24h welcome offer; real user quotes (swap in when they exist); push-notification priming; localization.

## Key Technical Decisions
- **Scan commit timing**: scanned bean data lives in onboarding localStorage state; the bean write happens AFTER the atomic profile commit inside `finish()` (best-effort, non-fatal — failure surfaces as the normal in-app add path via postCompleteAction fallback). Keeps `createProfile`/`completeOnboarding` atomicity intact.
- **Palate reads are pull-based**: new `src/lib/palateProfile.js` exposes `getOnboardingPalate(profile)` normalizing null/legacy shapes; chat/wizard/recs consume through it (single seam, testable, additive).
- **completedVia 'code_redeemed'**: additive enum value; grep confirms no validating consumers of the existing three values before shipping.
- **WKWebView rules** (lessons.md): CSS keyframes for all entrance/visibility; framer only for whileTap/layoutId/drag; no animated backdrop-filter; videos poster-gated under reduced motion.
- **Codex pre-brief**: Liquid Glass gradients are approved material; ambient loops exempt from 300ms; MascotStage videos are the established mascot pattern.

## Implementation Units
- **U1 Grind stat cell** — `src/components/BeanDetailCard.jsx`. Test: active bean shows GRIND w/ grinder-step value; sealed shows WEIGHT; null grindText falls back; FitText handles long labels. (evidence frame + codex)
- **U2 Palate plumbing** — new `src/lib/palateProfile.js`; reads in `src/tabs/ChatTab.jsx` dynamic block, `src/lib/tastingExpectations.js`, `src/lib/recommendations.js`. Tests in harness: seeded answers alter wizard expectation + chat context string; absent answers = identical-to-today behavior.
- **U3 R09 real assembly** — `screens/R09Processing.jsx` + CSS. Test: axes revealed match computed palateChart; reduce-motion renders final state instantly.
- **U4 R11 profile reveal** — `screens/R11ValueDelivery.jsx`, `src/lib/onboardingPalate.js` (prediction fn). Test: prediction string is deterministic per palate fixture; goal/pain named in copy.
- **U5 Real scan step** — `screens/R10Demo.jsx` → live-scan variant + fallback, `OnboardingFlow.jsx` state, post-finish commit. Tests: granted+success renders scanned card; each fallback row (denied, skip, timeout, API error) lands on prediction path; bean committed exactly once after finish; no double-commit on resume.
- **U6 Paywall narrative** — `R13Paywall.jsx`, `R12TrialTimeline.jsx`. Tests: recap references profile; skip visible at t=0; hydration timeout path intact; purchase path skips R13b (unchanged).
- **U7 Invite code** — `R13Paywall.jsx`, `R13bNudge.jsx`, reuse `src/lib/redeemCode.js`. Tests: success → finish with entitlement + completedVia 'code_redeemed'; failure → inline error + retry; input 16px, keyboard-safe, uppercase-normalized.
- **U8 Social proof + copy + bug** — `R04SocialProof.jsx` rebuild, `OnboardingErrorBoundary.jsx`, `R13bNudge.jsx`/`R11ValueDelivery.jsx` (postCompleteAction). Tests: zero invented humans; zero bare-"Ruphus" (grep gate); R11 scan intent survives R13b "Maybe later".
- **U9 Progress + a11y + decline** — `OnboardingPrimitives.jsx` (chaptered bar + aria), `R08PermissionPriming.jsx` ("Not now"). Tests: chapter labels render; aria-valuenow advances; decline writes denied + advances.
- **U10 Hygiene** — delete 3 dead files, constants module. Test: build green, no dangling imports.
- **U11 Harness** — `scripts/verify-onboarding.mjs` + injectable adapters in onboarding code (camera/RC/scan mocks via existing patterns from wizard-harness). Must pass full matrix above.
- **U12 Evidence gate** — `scripts/verify-onboarding-evidence.mjs` + sim frame capture of every screen/state.
- **U13 Final polish** — preship checklist (design-bank 08), fresh codex full-diff review, dev ship, loop report.

## Risks & Dependencies
- Scan-in-onboarding depends on authed Gemini proxy from the native app (works today post-auth; Gate 5 is post-auth). Timeout + fallback mandatory; scan cost per onboard ≈ one scanBeanLabel call.
- RevenueCat redeem: `redeemCode()` is our custom code system (Settings uses it) — confirm entitlement refresh propagates to `useSubscription` before celebrating; harness stubs it.
- R05→R09→R11 data dependency: back-nav wipe (existing) must also invalidate the held scan + prediction.
- Existing-user safety: every new read null-safe; regression gate carries the proof.

## Verification
- `npx vite build` green; new verify-onboarding.mjs green; all existing verify-* green; verify-onboarding-evidence green (sim frames); fresh-codex adversarial review (pre-briefed); Tal device sign-off (fresh account or DEV flag onboarding replay) as the human gate.
