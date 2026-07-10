# Onboarding Audit — Coffee Hub (2026-07-09)

Inputs: full code map of `src/components/onboarding/` (R01–R13b + OnboardingFlow + primitives), design-bank principles, Mobbin references (Brilliant, Calm, Skillshare, Vivino, Moonly, Breathwrk, Blank Street), and a sourced 2025–2026 research brief (RevenueCat, Adapty, Superwall, Apple HIG, growth.design; see `docs/research/` companion sources in the plan).

## Verdict in one paragraph
The bones are genuinely good — mascot-as-coach narration, a swipe-deck palate quiz, permission priming, a Blinkist-style trial timeline, atomic completion writes, resume-safe state. The flow shape matches what top apps run. What holds it back from award-caliber: the personalization is **theater** (answers are collected and never used), the **aha moment never actually happens** (R10 shows a *picture* of a scan instead of a scan), the paywall's first page is generic instead of "your plan is ready," and a layer of craft debt (fake testimonials, bare-"Ruphus" copy, reduced-motion gaps, dead code) reads as slop under scrutiny.

## A. What already matches best practice (keep)
- **Mascot-as-coach** (research pattern: Duolingo owl) — every screen is Professor Ruphus talking, with 13 distinct videos. This is the app's unfair advantage; nobody in coffee does it.
- **R05 palate swipe deck** — predict-then-confirm input, fun, haptic, on-trend (Vivino's like/dislike cards).
- **R12 trial timeline** — the Blinkist "honest paywall" pattern (+23% conv, −55% complaints in the canonical test) is already built.
- **R08 permission priming** before the OS camera dialog (primed apps ~65% vs 25–35% opt-in).
- **Warm paywall preload from R07**, native RC sheet, purchase-skips-nudge branching.
- **Mechanics**: uid-scoped resume, one-save-per-transition, atomic `createProfile`/`completeOnboarding`, 44pt targets, 16px inputs, haptics throughout.

## B. Findings, ranked

### B1. BLOCKER-CLASS (the audit's headline)
1. **Write-only personalization.** `goal`, `pain`, `tinderCards`, `palateChart`, `cameraPermission`, `completedVia` are written to Firestore and **never read by the app** (only `postCompleteAction` is consumed, App.jsx:134). The palate chart renders once at R11 and is discarded. This is the exact growth.design critique: questions that don't change the experience burn the user's motivation budget. The quiz currently buys us nothing after the last onboarding screen.
   → Fix direction: pipe answers into the live app — palate chart seeds the Tasting Wizard expectations + chat context + recommendations; goal/pain tune starter prompts and Aiden defaults. And reference them *inside* onboarding ("Since you brew V60 and chase acidity…").
2. **No real aha before the paywall.** R10 is a canned image with a scanning animation. The research is unambiguous: conversion follows a *real* value moment (PhotoRoom's paywall after first background removal; Greg's +400% trials; "the product's first scan IS the onboarding" in taste domains). Users are already authed at Gate 5, so a real scan (or a real palate→prediction reveal) is feasible pre-paywall.
3. **Paywall page one is generic.** R13 backdrop says "Choose your plan." with static Pro/Ultra cards. Best practice (Superwall +37%: multi-page): (1) personalized "Your coffee profile is ready" recap built from the quiz, (2) trial timeline, (3) plans. We have the pieces (R11 palate chart, R12 timeline) but they sit *before* the paywall as separate screens instead of forming its narrative.

### B2. BUGS
4. **postCompleteAction overwrite** — R11 writes `scan`, then R13b "Maybe later" silently overwrites to `none`; the user's stated scan intent is lost (R11ValueDelivery.jsx:178, R13bNudge.jsx).
5. **Dead step labels** — R07–R13b pass `step="R7 · YOUR KIT"` etc.; OnboardingTopBar never renders them (only parses the index). Writer intent was visible chapter labels; users see nothing.

### B3. CRAFT / TRUST
6. **Fabricated testimonials** (R04: "Dan R., Maya K., Sam T." ×15 quotes). Fake social proof is an App Review risk and a trust/slop tell. Replace with honest value framing, real TestFlight quotes, or cut R04 and put honest proof (laurels/ratings) later.
7. **"Professor Ruphus" naming violations** — bare "Ruphus" in 4 R04 testimonials + OnboardingErrorBoundary.jsx:55.
8. **R09 labor illusion is thin** — 3s of rotating quips with nothing real behind it. We *actually compute* a palate chart at R05; the loader should visibly assemble it (real labor, not fake).
9. **Progress bar is flat** — 13 undifferentiated segments, no chapters, no endowed progress, no `role="progressbar"`. Best practice: sectioned ("You · Your taste · Your plan") and starting partially filled.

### B4. ACCESSIBILITY / HIG
10. **Reduced motion not honored** by MascotStage `<video autoPlay loop>` or the CSS keyframes (r09-fill, r10-scan, spinner) — framer is gated, these aren't.
11. **R08 has no decline affordance** — only "Allow Camera Access"; declining requires rejecting the OS dialog. HIG + a11y want an explicit "Not now."
12. R05 swipe deck lacks set/position semantics; progress divs lack ARIA.

### B5. HYGIENE
13. Dead code: `OnboardingScreenShell.jsx`, `RuphusSpeechBubble.jsx` (only user of the professor-ruphus.webp avatar), `SingleSelectList.jsx`, 6 unused mascot videos.
14. Inline timing constants everywhere; `MARKETING_CONSENT_VERSION` hardcoded; brand appears as both "Coffee Hub" and "2manybeans."

## C. Research anchors (why the fixes are these)
- Paywall placement: value-context → paywall = 15% vs 2% trial opt-in (RevenueCat). 89–90% of trial starts happen Day 0 — onboarding IS the revenue moment. 80% of subscription revenue comes from the first paywall (Adapty 2026).
- Multi-page paywall sequence beats single page +37% (Superwall 2026, 40M opens).
- Quiz length is not the variable; visible personalization per question is (Adapty 2026; growth.design). Our 5-swipe deck + 2 questions is the right length — it just has to *do something*.
- Duolingo mechanics with Merlin manners is the synthesis for a hobby-expert app: character-led quiz, real value first, honest pricing, everything skippable.
- Anti-patterns we currently trip: decorative personalization, fake social proof, thin labor illusion, permission screen without decline.

## D. Proposed shape (for the plan discussion — not final)
Keep 13 screens ± 1; same spine, three structural moves:
1. **Make it real**: R09 loader assembles the *actual* palate chart → R11 becomes "Your coffee profile" (chart + a concrete prediction: "You'll probably love washed Ethiopians — bright, tea-like"). Persist the profile; Tasting Wizard, chat, and recommendations read it (additive Firestore fields, no breaking change).
2. **Move the aha pre-paywall**: offer the real first scan at R10/R11 for camera-granted users (fallback: prediction reveal). Paywall follows the aha directly.
3. **Paywall as chapter, not interruption**: R13 page one = personalized recap ("Your profile is ready — here's what Pro keeps alive"), R12 timeline folds into the sequence, honest plan cards, visible close from the start, post-decline nudge preserved (fix the postCompleteAction bug).
Plus the full craft pass: copy fixes, real/no social proof, chaptered progress, reduced-motion gating, R08 "Not now," dead-code removal, ARIA.

## E. Open questions for Tal
1. Real scan inside onboarding (camera → Gemini scan pre-paywall): yes, or too heavy/costly for v1 of this upgrade?
2. R04 testimonials: cut, replace with real TestFlight quotes, or replace with honest non-quote proof?
3. Paywall posture: keep fully skippable (current), or Greg-style firmer gating on ongoing-value features? (Current free tier + App Review posture matters.)
4. Scope: single overnight /goal loop (like chat-100x) covering all of D, or split into "make-it-real data plumbing" + "flow/paywall redesign" loops?
