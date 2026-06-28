# Tasting Tab — Editorial Journal + Immersive Coach 100x

**Branch:** `redesign` → Capgo `dev` channel only. Production untouched.
**Date:** 2026-06-28
**Constraint (standing):** Don't touch Firebase, the tasting data model, or any AI/proxy logic
(claude/gemini libs, score extraction, coaching prompts). Don't lose any feature. Full reign on UI/UX.
**Novice-taster rule:** all AI tasting interactions stay step-by-step coached/scaffolded — never vague
open questions. The 6-step guided flow and the glossary teach-me are sacred.

## Problem Frame

The Tasting tab is Tal's *learning* surface and his palate record, but the design reads as
AI-vibe-coded slop while burying the two things that make it special — the **guided coaching** and the
**taste profile** of each cup. Same slop tells we just killed in Archive, plus a few of its own:
- "learn what you taste" **eyebrow over the H1** + a 48×3 **gradient accent bar**.
- **Gradient chrome** on every primary button (145°/180°) and a **radial glow** mask on the empty-state.
- **accentSoft pill spam** — the cup-count badge and the "6 steps · ~5 min · auto-logs" sub-promise pills.
- **Decorative bean SVG motifs** on the invitation card (filler).
- **Text glyphs masquerading as icons** (⌄ ⌃ ● ·) and **crushed letter-spacing** on caps labels.
- **Twee copy** ("the more you taste, the more you taste", "Let's taste something together").
- A **uniform journal list with a 3px caramel left-stripe on every card** — the single most reliable
  AI tell (`01-anti-slop`: "thick colored left-border card").

Goal: 100x the craft to Apple-caliber while making the **tasting itself the hero** — each journal cup
becomes an editorial entry led by its rating + words, carrying a **radar "taste-fingerprint"** of its
aroma/acidity/sweetness/body/finish (a distinctive, coffee-specific signature no generic app has) — AND
the **6-step guided coaching flow is kept and elevated** into a calm, immersive learning moment.

## Direction (decided with Tal)

A hybrid of "journal as taste-fingerprints" + "coach-first immersive flow" — do BOTH, don't lose the
guided tasting. The journal becomes a beautiful palate record; the guided coaching becomes a focused,
characterful learning environment with Ruphus.

## Design System (design-bank spine + motion-library)

- **Taste-fingerprint:** reuse the existing radar/spider (SpiderChart / CupSheet radar) as a small
  per-entry glyph rendering the cup's aroma/acidity/sweetness/body/finish shape. This is the signature
  element — each cup has a recognizable flavor "shape." Degrades gracefully when axes are sparse.
- **Tasting-as-hero entries:** rating + one-word lead each card; the note is an editorial pull-quote
  (Fraunces italic), not a chip. No 3px left-stripe — hairline grouping + the surface ladder.
- **Immersive coach:** a calm focused step environment — refined step spine (no glow), editorial Ruphus
  message cards, the **taste-fingerprint builds live** as axes are captured, glossary terms stay
  tappable, the extraction-review card is refined. Ruphus mascot present (the [[feedback_mascot_video_implementation]] pattern).
- **Scarcity + materials:** gold = primary CTA + rating + active state only (kill accentSoft chrome and
  all gradient button fills → solid/material-honest). Hairline borders, warm surface ladder, no glow.
- **Type/number:** Fraunces display + Nunito body, `tabular-nums` on counts, open up (not crush) caps
  tracking, real hierarchy. (`03/04/06`.)
- **Motion:** scroll-reveal stagger on the journal, spring + haptics on tap, the fingerprint animates in;
  transform/opacity only, ≤300ms/spring, reduced-motion gated.
- **Icons/copy:** replace ⌄ ⌃ ● · glyphs with intentional SVG/lucide (or remove); tighten twee copy to
  concrete, novice-friendly coaching language; keep all glossary scaffolding.

## Requirements Trace

- **R1** — Masthead de-slop: no "learn what you taste" eyebrow-over-H1, no gradient accent bar; a clean
  Fraunces "Tasting" title + a single `tabular-nums` stat line (cups logged), hairline base.
- **R2** — Journal entries are editorial taste-fingerprints: each leads with **★ rating + one-word + a
  note pull-quote** and shows a **radar fingerprint glyph** of its axes; the **3px left-stripe is gone**;
  entries degrade gracefully when rating/words/axes are sparse.
- **R3** — Invitation/coach hero de-slop: remove the decorative bean-motif SVGs, gradient fills, and the
  accentSoft "6 steps · ~5 min · auto-logs" pills; a clean scaffolded "Start guided tasting" CTA with the
  on-deck bean picker preserved.
- **R4** — Immersive coaching flow elevated: the 6-step guided session keeps all steps and renders a
  refined step spine (no glow), editorial Ruphus message cards, a **live-building taste fingerprint**, the
  tappable glossary teach-me sheets, the spider/scorecard peek, and the extraction-review card.
- **R5** — Icon/glyph cleanup: the ⌄ ⌃ ● · text glyphs are replaced with proper icons or removed; no
  emoji/glyph-as-icon; default-Lucide used intentionally (sized/treated), not raw.
- **R6** — Motion: journal scroll-reveal stagger + spring + haptics on tap + the fingerprint animates in;
  all transform/opacity-only, ≤300ms or spring (bounce ≤0.2), **reduced-motion** disables reveal/animation.
- **R7** — Copy + scarcity: twee filler removed for concrete, coached, novice-friendly language; gold is
  scarce (CTA + rating + active state); no gradient button chrome; no accentSoft structural fills.
- **R8** — Every feature preserved: add (guided + manual), edit, delete, rating, all 9 tasting fields, AI
  score extraction + the 6-step coaching, glossary teach-me, spider/scorecard, share-card capture, sort,
  the subscription/paywall gate, and the BrewTimer→tasting cross-tab handoff — all behave identically.
- **R9** — No Firebase/data-model/AI-logic touched (claude/gemini libs, extraction, prompts untouched);
  reduced-motion honored; other tabs (esp. shared StarRating/SpiderChart) not regressed.

## Scope Boundaries (do NOT touch)

- `api/`, `src/firebase.js`, `src/hooks/useAppData.js`, contexts, the tasting/bean data model, any
  Firestore call. Read tasting fields only (rating/oneWord/aroma/firstSip/acidity/sweetness/body/finish/
  notes/changeTomorrow).
- AI logic: `lib/claude.js` (`buildTastingSystemPrompt`, `sendTastingMessage`), `lib/professorRuphus.js`
  (`convertTastingScores`), `lib/gemini.js`, `lib/tastingGlossary.js` parsing — reskin their OUTPUT, never
  the prompts/markers/extraction.
- The 6-step flow, glossary content, spider math, share-capture, paywall gating, cross-tab handoff — reuse
  verbatim; only restyle.
- Shared components (StarRating, SpiderChart) — additive/opt-in changes only; must not regress
  Archive/Rotation/Inventory.
- Do not deploy to production or merge to main (dev channel only).

## Key Technical Decisions

- **KTD-1 (fingerprint glyph):** build a small `TasteFingerprint` from the existing SpiderChart/CupSheet
  radar — pure, derives the polygon from the tasting's axis descriptors (reuse the existing
  text→score mapping; do NOT invent new scoring). Renders at a tiny size on cards and larger in the coach.
- **KTD-2 (axis→shape mapping):** reuse `convertTastingScores` / the existing CupSheet axis logic so the
  fingerprint matches the spider already shown; sparse axes → a smaller/partial shape, never a crash.
- **KTD-3 (entry hero reuse):** reuse the Archive `entryHero`/pull-quote pattern conceptually for the
  journal (rating + one-word + note quote), adapted to tasting fields. Keep Fraunces/Nunito hierarchy.
- **KTD-4 (coach immersion, presentation-only):** restyle the chat-takeover portal (step spine, Ruphus
  cards, input, sheets) without changing the message/marker/extraction flow or step state machine.
- **KTD-5 (motion gating):** `useReducedMotion` gates reveal + fingerprint animation; honor the app-wide
  `MotionConfig`. Haptics via `lib/haptics` (no-op on web).
- **KTD-6 (scarcity):** introduce no gradient button fills; convert accentSoft chrome to neutral; gold for
  CTA + rating + active only.

## Implementation Units

- **U1** — Masthead + journal stat line de-slop (R1): kill eyebrow + gradient bar; Fraunces title + clean
  `tabular-nums` stat line + hairline.
- **U2** — `TasteFingerprint` glyph (from SpiderChart) + editorial journal card (R2): rating-led +
  one-word + note pull-quote + fingerprint; remove the 3px left-stripe; graceful degrade.
- **U3** — Invitation/coach hero de-slop (R3): remove motifs/gradients/sub-promise pills; scaffolded CTA;
  on-deck picker preserved.
- **U4** — Immersive coaching flow (R4): step-spine de-glow, editorial Ruphus cards, live-building
  fingerprint, glossary/spider/extraction preserved + restyled.
- **U5** — Icon/glyph + copy pass (R5, R7): replace ⌄ ⌃ ● ·; de-twee to concrete coaching copy; kill
  gradient/accentSoft chrome.
- **U6** — Motion pass (R6): journal reveal stagger + spring + haptics + fingerprint animate-in,
  reduced-motion gated.
- **U7** — Verify harness + gates: `scripts/verify-tasting.mjs` (journal rating-led + fingerprint present,
  no left-stripe, no eyebrow/gradient-bar, coach takeover renders the step spine, reduced-motion, zero
  errors); run build + verify-tasting + verify-archive/verify-inventory regressions + codex + on-device.

## Verification Strategy

- **Programmatic:** `npx vite build` exit 0; `node scripts/verify-tasting.mjs` PASS (Playwright over a
  committed tasting-harness with mock beans + tastings): journal entries lead with a ★ rating + show a
  radar fingerprint SVG; NO 3px left-stripe border on cards; NO "learn what you taste" eyebrow and NO
  gradient accent bar; the "Start guided tasting" hero renders without bean-motif decoration; the guided
  session opens to a step spine (static render, no live AI); reduced-motion disables entry reveal; zero
  console/page errors. `verify-archive.mjs` + `verify-inventory.mjs` still PASS (shared-component safety).
- **Judge (codex):** scoped review (redesign baseline approved); rubric = all listed slop tells gone, the
  tasting is the visible hero (rating + words + fingerprint), the 6-step coaching + glossary + spider +
  extraction + share + paywall + handoff are all preserved and reskinned only, motion is
  transform/opacity-only + reduced-motion-gated, gold scarce, no AI/data/Firebase logic touched, no
  regression to shared components.
- **Human:** on-device sign-off via `/ship-dev` — the journal feels Apple-caliber with each cup's
  fingerprint, and a full guided tasting with Ruphus feels immersive and still teaches.

## Requirements Trace → Evidence

| Req | Proven by |
|---|---|
| R1 masthead de-slop | verify-tasting (no eyebrow/gradient-bar) + human |
| R2 journal fingerprints | verify-tasting (rating-led + radar svg, no left-stripe) + human |
| R3 hero de-slop | verify-tasting (no motif) + judge + human |
| R4 immersive coach | judge (flow preserved + reskinned) + human (full session) |
| R5 icon/glyph cleanup | judge + human |
| R6 motion | verify-tasting (reduced-motion) + judge |
| R7 copy + scarcity | judge + human |
| R8 features preserved | judge (diff audit) + human (add/edit/delete/share/coach) |
| R9 no logic touched; no regression | judge + verify-archive/verify-inventory |

## Risks

- **Fingerprint from sparse/qualitative axes** (descriptors not numbers) → reuse the existing
  text→score mapping; sparse → partial shape, never crash; human verifies it reads right.
- **Coach-flow reskin breaking the step/marker/extraction machine** → presentation-only; do not touch
  message parsing/state; codex audits; human runs a real session.
- **Shared SpiderChart/StarRating change regressing other tabs** → additive/opt-in; regression harnesses.
- **Harness can't exercise live AI coaching** → cover journal + hero + static step-spine render
  programmatically; the live session is codex + human (documented, not silently skipped).
- **Accent-scarcity overcorrection → lifeless** → keep gold for CTA + rating + fingerprint accent; human
  sign-off catches it.
