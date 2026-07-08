# Tasting Polish 2 — Bone Marker Reveal, Alien-Hardware Loader, Chat-Thread Reaction, Resume

**Date:** 2026-06-29 · **Branch:** redesign → Capgo `dev` · **Status:** plan (for `/loop-prompt` → `/goal`)

## Overview / Problem Frame
A second round of tasting-wizard polish from Tal's review. Craft + UX only, no data/logic change:
(1) the slider's expected marker should be a **dog-bone** glyph (mascot-fit) that stays **hidden while
the user sets their own value**; the first **Next** press commits that blind guess, reveals the
bone on the same page, holds for about a second, then auto-advances — so you guess unbiased,
compare, and move on with one tap (true predict-then-confirm; the always-visible marker was anchoring the answer). (2) Professor Ruphus's
AI reaction should read like a **chat thread**: his coaching line in one bubble, and the instant you
commit an answer a **loading bubble pops below it immediately** (no perceived lag), then his reaction replaces
the loader and the coaching bubble fades out. (3) The loader itself should be **"alien hardware"** —
a compact frosted-glass pill containing a **canvas dot-matrix with a scanning shimmer band** (the
real "liquid glass + dots" look), replacing the simpler CSS breathing dots. (4) Quitting a tasting
should not lose progress: the draft **persists in-session** so the user can **resume**, plus a
**confirm-on-X** so an accidental close doesn't discard. All WKWebView-safe, transform/opacity/canvas
only, reduced-motion-gated, design-bank clean, and verified on-device before "done".

Research backing: design-bank `liquid-glass-hud.md` (the canvas DotMatrix shimmer recipe + glass
pill), `motion-library.md`, `principles/05-motion.md` + `06-materials-depth.md`. Builds on the
shipped `RuphusThinking`/`RuphusReaction`/`AxisSlider`/`TastingWizard`.

## Requirements Trace
- **R1 — Bone marker, revealed on Next commit.** The AxisSlider expected marker is a crisp **lucide
  Bone icon** (not ◆, not emoji) at the predicted position. It stays **hidden before and while the
  user sets a value**, including touch/drag, then the first **Next** press commits the blind guess,
  **fades in** the bone (opacity only) on that same page, ignores rapid second taps, and auto-advances
  after about a second so the user answers unbiased, sees how close they were, and moves on with one tap.
  Stays revealed once shown; reduced-motion shows it instantly.
  The intro copy is reframed ("set yours first — then I'll show where I'd have landed, the 🦴").
- **R2 — Chat-thread reaction with instant loading bubble.** Ruphus's coaching line sits in its
  bubble. The MOMENT the user commits an answer to the step, a separate **loading bubble appears
  immediately below it** (the loader is NOT gated on the 700ms call-debounce — only the actual AI
  request is debounced). When the reaction resolves, it replaces the loader bubble and the original
  coaching bubble **fades out**, leaving Ruphus's reaction. Reacts to the CURRENT step's named input;
  pro-gated; deterministic core works with AI off (no loader/thread when no reaction is happening).
- **R3 — Alien-hardware canvas dot-matrix loader.** The loader is a compact **frosted-glass pill**
  (static `-webkit-backdrop-filter` + inset top-rim sheen — never animated, never mix-blend)
  containing a **canvas dot-matrix** rendering a scanning shimmer band (design-bank `liquid-glass-hud`
  DotMatrix `shimmer` mode), DPR-capped + paused offscreen. Replaces the CSS breathing-dots loader.
  Reduced-motion: a single calm static frame. `role="status"`. No SVG goo/feDisplacement filter, no
  animated backdrop-filter, no mix-blend sheen (all WKWebView-broken).
- **R4 — Resume an exited tasting + confirm-on-exit.** The in-progress draft (answers, step index,
  phase) is **lifted so it survives the wizard closing and tab navigation** and persists **in-session** (in-memory; NO
  Firebase, NO new persisted field). Tapping the wizard's ✕ **with real progress** shows a confirm
  ("Leave this tasting? Your progress is saved — pick it back up. [Keep tasting] [Leave]"). When a
  draft exists, the guided-tasting entry offers **Resume** (e.g. the CTA becomes "Resume your <bean>
  tasting →"); starting fresh / saving / leaving clears the draft appropriately. Manual entry still
  works. (Surviving a full app restart is explicitly OUT — in-session only.)
- **R5 — Design excellence / WKWebView-safe.** All new motion transform/opacity/canvas-rAF only,
  reduced-motion-gated; one accent (the dot-matrix stays monochrome+caramel, no second hue); liquid
  glass = static blur+saturate + inset-rim sheen; no goo/feDisplacement/mix-blend/animated
  backdrop-filter; design-bank anti-slop clean; tabular-nums where numeric; no emoji-as-icon (lucide).
- **R6 — On-device verification (hard gate).** Every changed element is driven + screenshotted on the
  real engine (sim-from-vite): the bone marker hidden (before answering) AND revealed (after), the
  canvas dot-matrix loader live, the chat-thread (coaching + loader, then reaction), and the
  resume/confirm-on-exit flow. No deferring verification to Tal.

## Scope Boundaries (do NOT)
- No Firebase / tasting-bean data-model / AI-extraction-output-shape change. The draft is in-memory
  only (no persisted resume across app restarts in this round).
- No API-proxy streaming rebuild; the reaction call shape is unchanged (only WHEN the loader shows +
  the bubble structure change).
- Don't change the deterministic coaching content, the Hoffmann step spine, or the saved record shape.
- Keep the CSS-driven visibility approach (framer `animate` stays OFF for visibility-critical content;
  new motion is CSS/canvas + framer only for layoutId/whileTap). Don't regress the shipped loader/
  slide/fill/marker/tap-to-expand or the reaction-on-named-input trigger.
- Reuse existing mascot assets; no new Higgsfield assets. Dev channel only; no prod/main.

## Implementation Units
- **U1 — Bone marker + reveal-on-Next-commit** (`AxisSlider.jsx`): lucide `Bone` glyph at expected
  position, gated on the step's committed/revealed state, opacity fade-in (CSS), reduced-motion instant; intro copy reframed in
  `TastingWizard.jsx`. (R1, R5)
- **U2 — Canvas DotMatrix loader** (`RuphusThinking.jsx` rework or new `DotMatrixLoader.jsx` + CSS):
  glass pill + canvas dot-matrix scanning shimmer; DPR-cap, offscreen-pause, reduced-motion static;
  replace the CSS breathing-dots. (R3, R5)
- **U3 — Chat-thread reaction** (`TastingWizard.jsx` + `RuphusReaction.jsx`): coaching bubble +
  immediate loading bubble on answer-commit (decouple loader visibility from the call debounce) +
  reaction replaces loader while coaching fades out. (R2)
- **U4 — Resume + confirm-on-exit** (`App.jsx` + `TastingTab.jsx` + `TastingWizard.jsx`): lift draft state to
  survive close and tab navigation (in-session), confirm dialog on ✕ with progress, Resume entry affordance, draft
  lifecycle (clear on save/leave/fresh-start). (R4)
- **U5 — Verify + on-device evidence** (`scripts/verify-wizard.mjs`, `scripts/audit-wizard.mjs`,
  `scripts/verify-polish-evidence.mjs` updated for the new frames): harness assertions (bone hidden
  vs revealed, dot-matrix canvas present, thread structure, resume prompt) + audit + sim-from-vite
  evidence capture + regressions + codex. (R6)

## Verification Gates (for loop.yaml)
- v1-build: `npx vite build` exit 0.
- v2-harness: `node scripts/verify-wizard.mjs` (R1 bone hidden before touch, still hidden after touch,
  then revealed by one Next before timed auto-advance; R2 thread + instant
  loader, R3 canvas loader present, R4 resume restores draft — deterministic, no live AI).
- v3-regression: verify-tasting + verify-inventory + verify-archive + verify-morph + verify-chat.
- v4-audit: `node scripts/audit-wizard.mjs` (R5 design + frames).
- v5-review: codex adversarial (R1-R5; WKWebView-safe; one-accent; no goo/mix-blend/animated-
  backdrop-filter; scope clean; no regression to shipped polish).
- v7-evidence: `node scripts/verify-polish-evidence.mjs` (updated frame set: bone-hidden, bone-
  revealed, loader-matrix, thread, resume) — fails unless real fresh device screenshots exist.
- v6-human: Tal on the dev app — bone stays hidden while you answer, then reveals when Next commits
  the guess, holds for about a second, and advances by itself; the alien-hardware loader looks sick,
  the chat-thread feels natural + instant, and an exited tasting resumes.

## Evidence Map
R1→v2-harness · R2→v2-harness · R3→v4-audit · R4→v2-harness · R5→v5-review · R6→v7-evidence.
(v6-human is the final human gate over all.)
