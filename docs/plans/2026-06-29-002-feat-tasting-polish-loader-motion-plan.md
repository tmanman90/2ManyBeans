# Tasting Wizard Polish — Liquid-Glass AI Loader, Premium Selection Motion, Tap-to-Expand Fix

**Date:** 2026-06-29 · **Branch:** redesign → Capgo `dev` · **Status:** plan (for `/loop-prompt` → `/goal`)

## Overview / Problem Frame
After Tal's on-device review of the intelligent tasting wizard, four quality gaps remain. They are
UX/motion-craft issues, not data/logic: (1) Professor Ruphus's AI coaching line takes ~15s to
arrive and shows generic placeholder text meanwhile, so the user doesn't know it's coming — it
needs a best-in-class "thinking" loader (the liquid-glass animated-dots look). (2) The quick-pick
buttons and chips are flat/AI-sloppy — selecting a different option should make the highlight
visually *slide* from the old choice to the new one (shared-element "magic move"), with premium
press feel. (3) The expected-value marker reads too prominent/early. (4) Tapping a logged tasting
on a bean card does nothing on Rotation/Archive (only Inventory was wired, and even that was never
verified). All work is WKWebView-safe, transform/opacity-only, reduced-motion-gated, design-bank
clean, and **verified on-device before "done"** (no "confirm on your device").

Research backing: design-bank `liquid-glass-hud.md` (the @Aurelien_Gz dot-matrix recipe),
`motion-library.md` (`layoutId` shared-element), plus web research (WebKit goo-filter bug #184601;
Build UI animated-tabs spring; Samuel Kraft / Emil Kowalski segmented patterns).

## Requirements Trace
- **R1 — Liquid-glass "thinking" loader.** A `RuphusThinking` indicator: static frosted-glass pill
  (`-webkit-backdrop-filter: blur(16px) saturate(160%)` + inset top-rim sheen — NOT mix-blend-mode)
  containing breathing CSS dots (`transform: scale` + `opacity` only; 1.4s ease, 0.18s/0.36s
  stagger) and a shimmer caption (`-webkit-background-clip:text` + animated `background-position`)
  that ROTATES micro-copy every ~3.5s ("Reading your cup…" → "Checking the roast…" → "Writing your
  note…"). Reduced-motion: dots/shimmer freeze (calm), `@media (prefers-reduced-motion: reduce)`.
  `role="status"`. No SVG goo filter, no animated `backdrop-filter`, no `mix-blend-mode` sheen.
- **R2 — Reaction flow uses the loader, no jarring swap.** While the AI reaction is in flight, the
  speech bubble shows the loader (R1) in a SAME-HEIGHT slot (no layout shift); when it resolves the
  real line cross-fades in (~200ms opacity). The deterministic coaching cue is NOT shown as fake
  placeholder that later swaps to a comment about a *different* step. Fix correspondence: the AI
  reaction reflects the step the user just answered and is shown on the screen where its loader
  appeared. Deterministic core still works with AI off/free tier (loader only shows when a reaction
  is actually loading). An `aiLoading` state drives this.
- **R3 — Single-select slide (quick-picks).** SIP picks (single-select) get a shared `layoutId`
  highlight that slides between buttons across rows. Chips `position:relative`; the highlight's
  `borderRadius`/`boxShadow` set via inline `style` (so Motion scale-corrects, no corner warp);
  spring `{ type:'spring', bounce:0.2, duration:0.6 }` (or matched 420/34/0.7) — the "flew over"
  glide; `haptic.selection()` fired synchronously in onClick. Reduced-motion snaps.
- **R4 — Multi-select premium fill (chips).** Flavor + aroma chips (multi-select) DON'T use a shared
  highlight (structurally impossible). Each chip animates its own fill crisply — short ease-out
  (~150ms `cubic-bezier(0.23,1,0.32,1)`) on background/color, `whileTap={{scale:0.96}}`, haptic on
  tap. Premium, not slop; clearly distinct from the single-select slide.
- **R5 — Expected-marker subtlety.** The slider's "◆ Professor Ruphus" expected marker is
  de-emphasized so it's a gentle guide, not a prominent shouting label (smaller/quieter; still
  legible and explained once in the intro). Stays "Professor Ruphus" naming.
- **R6 — Tap-to-expand on ALL bean-card surfaces.** A logged tasting on the bean-card back opens the
  full `TastingDetailCard` from Inventory, Rotation, AND Archive. Wire `onOpenTasting` + the
  `TastingDetailCard z={5000}` render in RotationTab and ArchiveTab (replicate InventoryTab), and
  verify the Inventory path actually works. Each surface verified on-device.
- **R7 — Design excellence / WKWebView-safe.** All new motion transform/opacity-only,
  reduced-motion-gated; liquid glass = static blur+saturate + inset-rim sheen; no goo filter, no
  animated backdrop-filter, no mix-blend-mode sheen; design-bank anti-slop clean; tabular-nums on
  numbers; one-accent discipline (no second hue).
- **R8 — On-device verification (the discipline gate).** EVERY changed interactive element is
  driven + screenshotted on the real engine (sim-from-vite, HMR) before done: the loader during a
  real (or mocked-slow) reaction, the single-select slide, the multi-select fill, the marker
  subtlety, and tap-to-expand opening the detail on Inventory + Rotation + Archive. No deferring
  verification to Tal.

## Scope Boundaries (do NOT)
- No Firebase / tasting-bean data-model / AI-extraction-output-shape change.
- No API-proxy streaming/SSE rebuild (loader is the deliverable; streaming noted as future).
- Don't change the deterministic coaching content, the Hoffmann step spine, or the tasting flow.
- Don't regress the wizard's CSS-driven visibility fixes (framer `animate` stays off for
  visibility-critical content; the loader uses CSS/canvas + framer only for `layoutId`/`whileTap`).
- Reuse existing mascot assets; no new Higgsfield assets.
- Single-select vs multi-select use DIFFERENT mechanisms — don't force one to serve both.
- Dev channel only; no prod deploy / main merge.

## Implementation Units
- **U1 — `RuphusThinking` loader component** (`src/components/tasting/RuphusThinking.jsx` + CSS in
  global.css). Glass pill + breathing dots + rotating shimmer caption. Pure/visual, WKWebView-safe,
  reduced-motion calm, role=status. (R1, R7)
- **U2 — Reaction-flow integration.** Add `aiLoading` state in TastingWizard; show `RuphusThinking`
  in the RuphusReaction speech slot while loading; cross-fade real line in; same-height slot; fix
  step correspondence + clear-on-advance; loader only when a reaction is genuinely loading. (R2)
- **U3 — Single-select slide group.** Generalize the SegmentedControl `layoutId` pattern into a
  wrap-friendly single-select highlight; apply to SIP picks (StepInput `kind==='sip'`). (R3, R7)
- **U4 — Multi-select chip upgrade.** Premium per-chip fill + press for FlavorWheelPicker `Chip`
  (flavor/aroma multi-select). Ease-out fill, whileTap, haptic. (R4, R7)
- **U5 — Expected-marker subtlety.** De-emphasize the AxisSlider expected marker. (R5)
- **U6 — Tap-to-expand wiring across surfaces.** RotationTab + ArchiveTab: `onOpenTasting` +
  `TastingDetailCard z={5000}`; verify Inventory. (R6)
- **U7 — Verification.** Extend `scripts/verify-wizard.mjs` (loader shows on a mocked-slow reaction;
  single-select highlight present + slides; multi-select fill; marker present-but-subtle) +
  `scripts/audit-wizard.mjs` frames; run build + verify-wizard + verify-tasting/inventory/archive/
  morph/chat regressions; AND a documented sim-from-vite on-device click-through of every changed
  element on all 3 surfaces with screenshots. (R8)

## Verification Gates (for loop.yaml)
- v1-build: `npx vite build` exit 0.
- v2-harness: `node scripts/verify-wizard.mjs` (R1–R6 functional, deterministic, mock-slow reaction
  drives the loader).
- v3-regression: verify-tasting + verify-inventory + verify-archive + verify-morph + verify-chat.
- v4-audit: `node scripts/audit-wizard.mjs` (R7 design + frames).
- v5-review: codex adversarial (R7 anti-slop; layoutId single-select-only; multi-select distinct;
  WKWebView-safe; no scope breach).
- v6-human: Tal on the dev app — loader feels premium, selection slides, multi-select crisp, marker
  subtle, tap-to-expand works on Inventory/Rotation/Archive.

## Evidence Map
R1→v4-audit · R2→v2-harness · R3→v2-harness · R4→v2-harness · R5→v4-audit · R6→v2-harness ·
R7→v4-audit+v5-review · R8→v6-human (+ the sim click-through is a hard pre-`done` step in U7).
