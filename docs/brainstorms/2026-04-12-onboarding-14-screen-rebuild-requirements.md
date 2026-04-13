---
date: 2026-04-12
topic: onboarding-14-screen-rebuild
---

# Onboarding Rebuild (14-Screen Framework → 13 Shipped Screens)

## Problem Frame

The current `OnboardingWizard.jsx` is a single-page form (name, grinder, brew method, marketing consent). It works functionally but it's the opposite of what the research says drives install-to-trial conversion: no demo, no emotional hook, no paywall sequencing, no Ruphus personality, no processing moment, no value delivery.

The research (Finch $2M/mo, Cal AI $3M/mo, Filtru, and the `adamlyttleapps/claude-skill-app-onboarding-questionnaire` framework) converges on a 14-screen psychological flow: demo-first welcome → goal + pain questionnaire → social proof → personalization → processing moment → value delivery → trial timeline → soft paywall. Coffee Hub has all the raw ingredients (Ruphus character, Gemini bean scan, Aiden recipe engine, existing two-card PaywallSheet) to ship a version of this flow that is uniquely its own.

Goal: replace the current wizard with a framework-aligned flow (13 shipped screens — see Key Decisions for the framework mapping) that maximizes install-to-trial conversion without breaking the existing freemium model.

## Requirements

### Flow screens (R1-R13)

- **R1. Welcome hero.** Screen 1 opens with a **static hero image** of the bean-scan magic moment (a bag on a counter with a partially-filled bean card overlay) plus a subtle parallax/shimmer on the scan line. Hero copy: "Brew coffee you're proud of." No form fields. Single "Get started" CTA. **MVP ships static.** A looping video version is a Phase 2 upgrade once production pipeline is figured out (not AI video — screen capture or motion graphic).

- **R2. Goal question.** Screen 2 asks "What do you want to brew better?" as a single-select, method-first:
  - V60 / Pour Over
  - Aeropress
  - French Press
  - Espresso
  - All of them
  Ruphus narrates in character. The answer branches R6's personalization copy and nudges which features get emphasized.

- **R3. Pain points.** Screen 3 asks "What's getting in your way?" as a single-select hybrid (3 practical + 1 aspirational):
  - My brews are inconsistent
  - I forget which beans are fresh
  - I want to actually taste what's in the cup
  - I want to brew like a pro *(aspirational soft target)*
  Ruphus narrates with empathy copy. The aspirational option is the signal we can upsell hardest in R6.

- **R4. Social proof.** Screen 4 shows 2-3 testimonials and the real App Store star count. Testimonial selection may be lightly tailored to R2+R3 answers (exact tailoring rule deferred). Ruphus intro line.

- **R5. Tinder cards.** Screen 5 presents **exactly 5 swipeable cards**, each mapped 1:1 to a palate chart axis. Each "yes" nudges the corresponding axis toward one pole; each "no" nudges it the other way. The five axes (and candidate card prompts — exact copy deferred):
  - **Sweetness:** "I want my coffee to taste sweet, not sharp"
  - **Acidity:** "I want bright, fruity acidity — lemon, apricot, berries"
  - **Body:** "I want a heavy, syrupy mouthfeel"
  - **Clean ↔ funky:** "I trust washed coffees over naturals and anaerobics"
  - **Fruit ↔ nutty:** "I'd rather taste chocolate and nuts than fruit"
  The card mechanic is both engagement AND the input to R11's chart. No card is purely decorative.

- **R6. Personalized solution.** Screen 6 mirrors their answers back ("You chose V60 and want cleaner extractions — here's how I'll help...") and presents the 3-4 Coffee Hub features most relevant to their answers (Aiden recipes, tasting coach, bean scan, Ruphus chat). Ruphus delivers the pitch. **No fabricated statistics.** Numerical anchors must come from real telemetry or be omitted.

- **R7. Preferences (equipment).** Screen 7 collects grinder + brew method (Aiden vs Hand Brew), matching the data the current wizard already collects and the app actually uses. Do **not** add extra gear fields the app does not consume. Ruphus framing: "Let's set up your kit."

- **R8. Permission priming.** Screen 8 primes the iOS camera permission (for bean scan) with Ruphus copy BEFORE the iOS system prompt. "I'll need your camera to read the back labels on your bags" — then trigger the native prompt. Notification permission is **out of scope for this screen** until the app actually uses notifications.

- **R9. Processing moment.** Screen 9 is a 3-5s animated "Ruphus is preparing your coffee journey..." transition with progress bar + rotating Ruphus quips. **During this screen, the paywall offerings are fetched and cached** (RevenueCat `getOfferings`) so the paywall screen renders instantly with no loader. Critical: per @c__basso research, loader-free paywalls deliver ~2× install-to-trial conversion vs. paywalls that spin on open.

- **R10. App demo.** Screen 10 shows a pre-rendered "demo scan" — a canned bag image with the fill-in animation playing against a baked-in Gemini result. User taps to advance. No live Gemini call, no camera access, no data persistence. Keeps the magic moment reliable for every user regardless of network or API health, costs zero API tokens per install.

- **R11. Value delivery.** Screen 11 is the climactic payoff:
  - A **palate profile spider chart** with 5 axes (from R5 Tinder card results — not guessed). Each axis ranges -1 to +1.
  - A **Ruphus letter** (~3-5 lines, warm mentor tone) summarizing who they are as a brewer and what he'll teach them, computed from R2+R3+R5.
  - A **"scan your first bag" CTA** that becomes the next action, handing them directly into the real bean scan flow as their first mission.
  - **No fake inventory data** — we do not pre-fill beans or recipes.

- **R12. Trial timeline.** Screen 12 is a dedicated "How your free trial works" screen before the paywall. Three-step visual timeline: **Now** (full access) → **In 3 days** (charged unless cancelled) → **Into the future** (stay subscribed). Ruphus walks through it in character with zero sales pressure. Filtru's pattern — primes trust, removes buyer anxiety before the ask. Easy to A/B remove later if it hurts conversion.

- **R13. Paywall.** Screen 13 uses the existing `PaywallSheet` component with a new `onboarding` context entry in `CONTEXT_COPY`. **Pro Annual pre-selected for everyone** (matches current default, LTV-maximizing, non-aggressive for first impression). Ruphus delivers the pitch in warm mentor voice. Soft gate: clear "Maybe later" option.

  **On "Maybe later" dismiss:** instead of silently dropping to the home screen, show a one-screen Ruphus nudge that reframes the dismiss as a micro-win: "No worries, brewer. Your first scan is on me — want to try it now?" with a primary CTA that hands them directly into the real bean scan flow. Declining the nudge drops to the home screen. This converts dismissers into day-1 activators.

### Cross-cutting requirements (R14-R21)

- **R14. Ruphus voice throughout.** Every screen has at least one line of Ruphus copy in the established **warm mentor** tone — genuinely excited to meet you, uses "we" a lot, drops coffee nerdery gently, sincere (never cloying). Maps to Ruphus's existing golden-retriever-professor voice. Where the flow lacks a natural Ruphus moment, the line appears in a subtitle bubble under the question.

- **R15. Returning-user gate.** The `profile.onboardingComplete` flag (already used by `useUserProfile`) remains the gate. Users who have completed onboarding once never see the new flow on subsequent launches — they land directly on the home screen as they do today. No "redo onboarding" option in Phase 1 production builds (see R19 for dev-only exception).

- **R16. Failure states.** The flow must survive common failures without breaking conversion:
  - If offerings fail to load during R9, the paywall (R13) falls back to a fetch-on-open with a non-blocking spinner and the "Maybe later" option is still present.
  - If the user dismisses the paywall, they land on the home screen with `onboardingComplete = true`.
  - Onboarding survives app backgrounding at any screen (see R17 for resume logic).

- **R17. Resume state.** Onboarding state (current screen index + all answers collected so far) is persisted to `localStorage` on every screen change. On re-open, if `onboardingComplete` is false AND a saved state exists, resume from the last seen screen with prior answers intact. No timeout — always resume. No Firestore writes until R13 is reached (or R20's persistence fires, whichever comes first).

- **R18. Onboarding answers schema (full persistence).** When the user reaches R13 (via any path, including "Maybe later"), write a new `onboardingAnswers` object to the user's Firestore profile containing:
  - `goal` (R2 answer)
  - `pain` (R3 answer)
  - `tinderCards` (R5 raw swipe results)
  - `preferences` (R7 grinder + brew method — already in existing schema)
  - `palateChart` (R11 computed 5-axis values, -1 to +1 each)
  - `completedAt` (serverTimestamp)
  This object is source-of-truth for Ruphus memory across the app (chat tab, tasting coach). Schema extension: `userProfile.onboardingAnswers` — additive, non-breaking for existing users.

- **R19. Dev-only onboarding replay.** Add a "Replay onboarding" button to `SettingsPage` that sets `onboardingComplete = false` and reloads. Gated by a `__DEV__`-style check (import.meta.env.DEV OR a hardcoded email allowlist for Tal). Not visible in production for end users. Zero data loss — only the gate flag resets, beans/tastings/palate chart all remain.

- **R20. Firebase Analytics instrumentation.** Log per-screen events for funnel analysis:
  - `onboarding_screen_view` (params: `screen` = 1..13) on every screen mount
  - `onboarding_screen_complete` (params: `screen`) on forward navigation
  - `onboarding_completed` when R13 is reached
  - `onboarding_paywall_shown`
  - `onboarding_paywall_trial_started`
  - `onboarding_paywall_dismissed`
  - `onboarding_resumed` (params: `from_screen`)
  No new SDKs; uses the Firebase Analytics already installed. Enough to compute a per-screen funnel in the Firebase console and see where users drop off.

- **R21. Accessibility + device support minimum.**
  - Every tappable has an `aria-label` / accessible name for VoiceOver.
  - Every tap target is ≥44pt (Apple HIG) — already enforced by project iOS layout rules.
  - iPhone portrait only. iPad and landscape are out of scope.
  - Dynamic type, high contrast, and reduced motion are Phase 2.

## Success Criteria

- **Primary metric:** install-to-trial-start rate = (RevenueCat trials started within 24h of first app open) ÷ (unique installs). Baseline = current wizard's conversion (unknown today — must be measured before/during rollout).
- **Secondary metric:** onboarding completion rate = users who reach R13 ÷ users who reach R1. Target: ≥75%.
- **Activation metric:** day-1 bean scan rate = users who scan at least one real bag within 24h ÷ users who completed onboarding. Target: ≥50%. **Dismissers who follow R13's soft nudge into the scan flow count toward this metric** — the nudge exists to lift it.
- **Per-screen funnel:** measured via R20 Firebase Analytics events. No specific target, but the team should review per-screen drop-off after the first ~200 fresh installs and fix the biggest leak.
- **Qualitative:** Tal (as dogfood user) feels Ruphus's personality carries the flow without feeling pushy.

### First experiment to run
Once the flow ships, the first A/B to run is **R12 trial timeline on vs. off** — remove the trial-timeline screen for 50% of users and compare install-to-trial rates. Rationale: the timeline adds one screen and the Filtru pattern claim hasn't been independently validated in a coffee context. Firebase Remote Config flag is sufficient; no SuperWall needed for this.

## Scope Boundaries

- **Out of scope (Phase 1):** anonymous Firebase auth + upgrade at a late screen (Firebase sign-in stays BEFORE onboarding; deferred to Phase 2).
- **Out of scope:** pre-filled inventory with recommended beans (breaks app premise).
- **Out of scope:** SuperWall integration (RevenueCat already in place).
- **Out of scope:** review prompt before paywall (optional Phase 2 enhancement).
- **Out of scope (Phase 1):** the Screen 1 welcome loop video. MVP ships a static hero image + parallax. Video production (screen capture, motion graphic, or AI assist) is a Phase 2 upgrade with its own scope.
- **Out of scope:** Mixpanel/Segment/PostHog. Firebase Analytics only (R20).
- **Out of scope:** iPad, landscape orientation, dynamic type, high-contrast mode, reduced motion.
- **Out of scope:** dark mode tuning for the new screens (tracked separately in `2026-04-12-002-feat-dark-mode-plan.md`).

## Key Decisions

- **Full framework-aligned rebuild, not a targeted upgrade.** Rationale: the current wizard's ceiling is too low; research converges on the 14-screen framework. Framework mapping: shipped 13 screens = 12 from the original framework (Welcome, Goal, Pain, Social proof, Tinder, Personalized, Preferences, Permission, Processing, Demo, Value delivery, Paywall) + 1 insert (R12 Trial timeline). Dropped: Comparison Table (framework-optional, no value here) and Account Gate (Firebase auth sits before onboarding in Phase 1).
- **Hero angle: "Brew coffee you're proud of."** Craft/skill positioning. Matches Filtru.
- **Ruphus narrates every screen in warm mentor tone.** Genuinely excited, uses "we", sincere. Biggest product differentiator from generic framework clones.
- **Screen 1 demo = bean scan magic moment** (static image in Phase 1, video in Phase 2). The scan→Gemini→filled-card is Coffee Hub's most distinctive wow moment.
- **Auth stays before onboarding in Phase 1.** Anonymous-auth upgrade is a planned Phase 2 follow-up (~half-day effort).
- **Value delivery = palate chart + Ruphus letter + scan CTA.** Chart axes come directly from R5 Tinder results, not guessed.
- **Paywall default = Pro Annual for everyone.** Safest first-impression choice, LTV-maximizing, Ultra remains visible as the alternative card.
- **Paywall preloaded during R9** for ~2× conversion lift (per @c__basso research).
- **"Maybe later" triggers a scan-CTA nudge**, turning dismissers into day-1 activators.
- **Mid-flow resume from last screen.** localStorage state, no timeout.
- **Full answer persistence** to a new `onboardingAnswers` profile object. Enables Ruphus memory across the app.
- **Rollout: hard swap on next production deploy.** Old OnboardingWizard.jsx deleted, new flow replaces it in one Capgo OTA + Vercel deploy. Justified by solo-dev + small user base. No feature flag overhead.

## Dependencies / Assumptions

- The existing `PaywallSheet` is Apple-rejection-safe (per its header comment) and will accept a new `onboarding` context in `CONTEXT_COPY` without a refactor.
- Ruphus copy can be either hand-written or generated by the Ruphus helper.
- Screen 10's demo is a canned asset, so it does NOT depend on Gemini uptime or token budget at first-run.
- RevenueCat offerings return within a few seconds of the app opening, making the R9 preload viable.
- The onboarding gate in `useUserProfile` (`profile.onboardingComplete`) is authoritative — the new flow writes this flag exactly where the current wizard does, preserving the returning-user path.
- Firebase Analytics is wired into the app and can accept custom events. If not, R20 scope includes adding it.
- Adding an `onboardingAnswers` object to user profiles is non-breaking (additive) for existing users.
- Ruphus character is established enough elsewhere in-app that users coming out of onboarding recognize him in later interactions.

## Outstanding Questions

### Resolve Before Planning
(None — all critical product decisions are resolved above.)

### Deferred to Planning
- **[Affects R2, R3, R5, R6, R11, R12, R13, R14][Needs draft]** Exact Ruphus copy for every screen in warm-mentor tone. Generate candidates via the Ruphus helper and hand-edit, OR hand-write and review. Produce 2-3 variants per screen for voice testing.
- **[Affects R4][Needs research]** Real testimonials: pull from existing App Store reviews if available; otherwise placeholder copy flagged for post-launch replacement.
- **[Affects R4]** Tailoring rule for testimonials per user persona — hard-code R2/R3→testimonial mapping, or show the same 3 for everyone.
- **[Affects R5, R11][Needs design]** Exact card copy for the 5 Tinder cards (candidates in R5). Validate that each card cleanly nudges its axis and reads naturally. Also confirm the axis-weight function — single-axis or cross-axis weights?
- **[Affects R6][Needs research]** Numerical anchors ("brewers improve X") require real telemetry. Decide whether to ship without numbers or instrument first.
- **[Affects R9, R13][Technical]** Validate RevenueCat offerings cache behavior on iOS Capacitor specifically — does an early `getOfferings()` call during R9 cause R13 to render with no loader?
- **[Affects R11][Technical]** Palate chart component: reuse the existing `SpiderChart` or build an onboarding variant with different styling?
- **[Affects R10][Technical]** Canned demo-scan asset production: screen-capture of a real scan OR scripted animation? Affects asset pipeline.
- **[Affects R1][Phase 2]** Screen 1 welcome video production (deferred from Phase 1). Phase 1 ships a static hero.
- **[Affects R13][Phase 2]** Review prompt (native StoreKit `requestReview`) injected between R11 and R13 — Cal AI's "ask while excited" pattern.
- **[Affects overall][Phase 2]** Anonymous-auth-first + late-stage upgrade so users experience the full flow before sign-in. Est. ~half-day incl. Firestore rules audit and Google/Apple link testing on native.
- **[Affects R18][Technical]** Firestore rules audit: confirm the new `onboardingAnswers` field is covered by existing user-profile rules (should be, since it's a sub-field of the profile doc).
- **[Affects iteration speed, Phase 3]** SuperWall consideration for remote paywall A/B testing — only if the first experiment (R12 on vs off) shows meaningful lift worth iterating on.

## Next Steps

→ `/ce:plan` for structured implementation planning
