# Intelligent Tasting Wizard — "Taste this bean with a pro" (Phase 1 + 2)

**Branch:** `redesign` → Capgo `dev` channel only. Production untouched.
**Date:** 2026-06-29
**Grounding:** `docs/research/2026-06-29-tasting-methodology-brief.md` (Hoffmann *World Atlas of Coffee*
§8 + the app's coffee-knowledge files). Read it first — every coaching decision traces to it.
**Constraint (standing):** Don't change Firebase, the tasting/bean data model, or the AI EXTRACTION
OUTPUT SHAPE (the 6-axis `tastingScores` + the tasting fields). Preserve manual entry and the existing
tasting record format. Keep free-text input + LLM understanding. Full reign on UI/UX + the guided flow.

## Problem Frame

We reskinned the guided-tasting coach but never changed the *experience*: it's still "read a paragraph from
Ruphus, type a paragraph back, six times." For Tal (a novice trying to genuinely develop his palate) that's
high-friction and a blank-page problem, and it doesn't actually *teach* — it logs. The research shows the app
already has ~80% of the "brain" (a 35-origin knowledge base, per-axis coaching, 6-axis scoring) trapped in prose
and a stripped 6-step flow that drops the two most important teaching beats (naming Flavor, judging Balance) and
omits the techniques that actually improve perception (slurp, break the crust, taste warm).

Goal: turn the guided tasting into an **intelligent, reactive, tap-first wizard** where Professor Ruphus
**predicts what *this specific bean* should taste like** (origin × process × roast × altitude), coaches you
step-by-step through the real Hoffmann arc to *find* it, reacts and recalibrates, and **develops your palate over
time** — while keeping free-text + the LLM, and making it beautiful and fun. This is a flagship, "the app that
teaches you to taste," differentiator.

## Direction (decided with Tal)

- Build the **full plan in one pass** (Phase 1 core wizard + Phase 2 progression/reactions), run overnight via `/goal`.
- **Comparative two-bean tasting = Phase 3, separate, NOT in this plan.**
- Use the research brief as the source of truth.
- Ruphus tone: **confident-but-celebratory** (knows what to expect, tells you what to hunt for, celebrates your
  catches, gently corrects) — the research's recommended learning stance.
- Keep typing + LLM understanding; the wizard is tap-first, not tap-only.

## Architecture (the spine that makes this autonomously buildable)

- **Deterministic core (fully harness-testable, works with NO live AI):** the per-bean expectations engine, the
  Hoffmann step machine, axis sliders + gated flavor-wheel chips, the fingerprint built from real slider values,
  the end-of-session reveal, the progression gating, and Ruphus reaction states (reusing EXISTING mascot assets).
- **LLM-reactive layer (additive enrichment, never a gate):** Ruphus's natural-language per-step coaching +
  reactions to free-text, built on the EXISTING `claude.js` tasting coach. If the AI is slow/unavailable, the
  wizard still fully works on the deterministic templated coaching. The LLM never changes the extraction OUTPUT
  shape (sliders/chips already produce the 6-axis scores directly).
- **Output:** the wizard produces the SAME tasting record the app already stores (rating, oneWord, aroma,
  acidity/sweetness/body/finish, notes, 6-axis `tastingScores`) saved via the existing `addTasting`. No new
  Firebase fields; progression is DERIVED from existing tasting history.
- **Ruphus character art:** Phase 1/2 reuse EXISTING Ruphus mascot videos/images (sniffing-beans, cupping,
  thinking, thumbs-up, celebrating, magnifying-glass…) for reaction states. Generating NEW Higgsfield poses is a
  SEPARATE interactive track (not in the autonomous run — Higgsfield MCP may be absent headless and needs visual
  judgment).

## Requirements Trace

- **R1** — Full Hoffmann step spine: the wizard walks the real arc — Smell (dry fragrance + wet aroma, with a
  "break the crust" cue), First sip (with a **slurp** + **taste-warm** cue), Acidity, Sweetness, Body, **Flavor**
  (new), Finish, **Balance** (new) — one attribute per screen.
- **R2** — Predict-then-confirm intelligence: for the selected bean, Ruphus pre-loads a structured expected
  profile (from origin × process × roast × altitude) and, each step, tells the user what to expect and coaches
  them to find it; on answer he confirms / celebrates / gently recalibrates (e.g. "that 'sour' is acidity — the
  good kind").
- **R3** — Tap-first, type-anytime: axis steps use a **slider** with novice labels (from the glossary); flavor
  naming uses **gated flavor-wheel chips** (Tier 1 → 2 → 3); a free-text field is always available and the LLM
  layer understands it.
- **R4** — Real fingerprint: slider values feed the 6-axis `tastingScores` directly (no fabricated magnitudes),
  and the FlavorRadar builds live as the user progresses.
- **R5** — End-of-session reveal: a calibration screen comparing what the user found vs the bag/expected profile
  ("you nailed the bright acidity; the bag also calls jasmine — did you catch it?"), then save.
- **R6** — Ruphus character: reaction states (sniffing / delighted / thinking / nice-catch / celebrating) using
  EXISTING mascot assets, confident-but-celebratory voice; tappable glossary terms preserved.
- **R7** — Palate progression: a palate level derived from tasting history (cups logged, axes engaged, calibration
  vs bag); **texture-first → flavor-naming**: the Tier-3 specific-flavor chips unlock as the user levels up; a
  small "your palate" surface shows progress.
- **R8** — Replace + preserve: the wizard becomes the guided-tasting entry (the "Start guided tasting" CTA opens
  it); **manual entry stays** as an escape hatch; the produced tasting saves in the EXISTING record shape and
  existing tastings/Flavor Card/journal are unaffected.
- **R9** — Craft: the wizard matches the redesign — Liquid Glass controls, editorial type, tasteful
  transform/opacity transitions, the sliding/step motion, haptics.
- **R10** — Reduced-motion gated; iOS keyboard + safe-area correct on the free-text step; accessible controls
  (44px targets, labelled sliders).
- **R11** — No Firebase / tasting-data-model / extraction-output-shape change; the LLM coaching extends `claude.js`
  additively; the deterministic core works without live AI; paywall/subscription gating preserved.

## Scope Boundaries (do NOT touch)

- `api/`, `src/firebase.js`, `src/hooks/useAppData.js`, contexts, the tasting/bean data model, the `tastingScores`
  shape, any Firestore call. The wizard reads bean fields + writes a tasting via existing `addTasting`/`updateTasting`.
- The AI EXTRACTION output contract (`---EXTRACT---`, `convertTastingScores`, the 6 axes) — reuse; do not change
  what's stored. The LLM coaching prompt may be EXTENDED (it's the feature) but must not change the stored shape.
- The Flavor Card detail (`TastingDetailCard`), the journal, the share card, the spider/CupSheet — reuse; the
  wizard feeds them the same data.
- **Phase 3 (comparative two-bean tasting) — do NOT build.**
- **Higgsfield NEW-asset generation — do NOT attempt in the autonomous run** (separate interactive track; use
  existing mascot assets).
- No production deploy / merge to main (dev channel only).

## Key Technical Decisions

- **KTD-1 (expectations engine):** `src/lib/tastingExpectations.js` — pure `predict(bean)` deriving
  `{ acidity, sweetness, body, finish: {level 0-10, label}, heroDescriptors: [...], cues: {...} }` from the
  existing `coffeeKnowledge` `ORIGIN_PROFILES` + process + roast + altitude rules (structure the prose into a
  queryable schema). Deterministic, unit-coverable, no AI.
- **KTD-2 (flavor wheel + axes):** `src/lib/flavorWheel.js` — the §B gated Tier1→2→3 tree + the §C axis configs
  (slider notches + glossary labels). Pure data; the chip gating reads the palate level.
- **KTD-3 (step machine):** a config-driven wizard (`TASTING_WIZARD_STEPS`) the new `TastingWizard` component
  walks; each step declares its input type (smell-cue | slurp-cue | axis-slider | flavor-chips | balance-tap |
  freetext), its expected-profile hook, and its Ruphus reaction asset. Replaces the chat takeover for guided mode.
- **KTD-4 (scores from sliders):** axis sliders write directly into the 6-axis `tastingScores` (acidity/sweetness/
  body/+ flavor/balance derived from chips/tap; fragranceAroma from the smell step) — the fingerprint is real, and
  `convertTastingScores` is bypassed for slider-driven values (still available for free-text).
- **KTD-5 (LLM additive):** Ruphus's per-step line = a deterministic templated reaction (compare input vs expected)
  by default; when online + Pro, enrich via the existing `claude.js` coach. The wizard never blocks on the AI.
- **KTD-6 (progression derived):** `src/lib/palate.js` — pure `palateLevel(tastings)` + `unlockedTiers(level)`;
  no new storage. Gates the Tier-3 flavor chips and drives the "your palate" surface.
- **KTD-7 (reactions reuse assets):** map reaction states → existing `/images/ruphus-animations/*` (already
  CDN-served on native). No new art in this run.

## Implementation Units (one delivery each, for the overnight `/goal`)

- **U1** — `tastingExpectations.js`: structure origin/process/roast/altitude → `predict(bean)` expected profile. Pure + tested.
- **U2** — `flavorWheel.js` (gated chip tree) + axis slider configs (glossary labels). Pure + tested.
- **U3** — `palate.js`: derive palate level + unlocked tiers from tasting history. Pure + tested.
- **U4** — Wizard shell + step machine (`TastingWizard` + `TASTING_WIZARD_STEPS`): the full Hoffmann arc, card-based,
  replaces the guided-tasting takeover; manual entry preserved.
- **U5** — Per-step inputs: `AxisSlider`, `FlavorWheelPicker` (gated chips), free-text field, Ruphus reaction stage
  (existing assets) — Liquid Glass craft, reduced-motion gated.
- **U6** — Predict-then-confirm coaching: wire expectations into each step (what-to-expect + deterministic reactions
  comparing input vs expected); additive LLM enrichment via existing `claude.js`; live FlavorRadar from sliders.
- **U7** — End-of-session reveal (your-vs-expected/bag) + save via existing `addTasting`; the "your palate" progression surface.
- **U8** — `scripts/verify-wizard.mjs` + harness + gates: drive the deterministic wizard end-to-end (steps advance,
  sliders→scores, chips gate by level, expectations + reveal render, fingerprint builds, manual entry preserved,
  reduced-motion, zero errors); run build + verify-wizard + verify-tasting/archive/inventory/morph/chat regressions
  + codex + on-device sign-off.

## Verification Strategy

- **Programmatic:** `npx vite build` exit 0; `node scripts/verify-wizard.mjs` PASS — a Playwright harness over a
  committed `wizard-harness.html` with mock beans (a washed Ethiopian, a natural Brazilian, etc.) that drives the
  deterministic flow with NO live AI: the full step spine advances Smell→…→Balance; an axis slider sets a value
  and it lands in the 6-axis scores + the live FlavorRadar grows; flavor-wheel chips are gated by palate level
  (Tier-3 locked for a beginner, unlocked for a higher level); the per-bean expected profile renders ("expect
  bright + floral"); the reveal compares found-vs-expected; manual entry still opens; reduced-motion disables the
  motion; zero console/page errors. `verify-tasting` + `verify-archive` + `verify-inventory` + `verify-morph` +
  `verify-chat` all still PASS (shared TasteFingerprint/FlavorRadar/journal untouched in behavior).
- **Judge (codex):** scoped review — the step spine matches the Hoffmann arc (incl. Flavor + Balance + slurp/break/
  warm cues); predict-then-confirm uses the structured expectations; sliders feed real scores (no fabricated
  magnitudes); the reveal calibrates vs bag/expected; progression gating is derived (no new Firebase); the LLM
  layer is additive (wizard works without it) and doesn't change the stored tasting shape; manual entry + existing
  tastings preserved; motion transform/opacity-only + reduced-motion-gated; no data/AI-output/Firebase changes.
- **Human:** on-device sign-off via `/ship-dev` — run a full guided tasting on a real bean and confirm it feels
  like a pro mentor: Ruphus predicts the profile, the slurp/smell/slider/chip steps flow, the fingerprint builds,
  the reveal teaches, and it's fun + beautiful; manual entry still works.

## Requirements Trace → Evidence

| Req | Proven by |
|---|---|
| R1 full Hoffmann spine | verify-wizard (steps Smell→Balance incl. Flavor/Balance) + judge + human |
| R2 predict-then-confirm | verify-wizard (expected profile renders) + judge + human |
| R3 tap-first + type | verify-wizard (slider + gated chips + freetext) + human |
| R4 real fingerprint | verify-wizard (slider→scores, radar grows) |
| R5 reveal | verify-wizard (found-vs-expected) + human |
| R6 Ruphus reactions | judge + human |
| R7 progression | verify-wizard (chip gating by level) + judge |
| R8 replace + preserve manual | verify-wizard (manual opens; tasting saved shape) + judge |
| R9 craft | judge + human |
| R10 reduced-motion/iOS | verify-wizard (reduced-motion) + human (keyboard) |
| R11 no data/AI-shape/Firebase change | judge (diff audit) + regression harnesses |

## Risks

- **Big greenfield feature built autonomously** → the deterministic core is fully harness-tested and works without
  the AI; the LLM/Higgsfield risk is isolated as additive/deferred so an autonomous run can't half-break the flow.
- **Structuring 35 origins' expectations** → start from the existing `ORIGIN_PROFILES` prose; fall back to a
  sensible default profile for unknown origins; the predict() never crashes on missing data.
- **Replacing the guided flow could regress logging** → the wizard outputs the EXACT existing tasting shape via the
  EXISTING `addTasting`; manual entry stays; existing tastings/journal/Flavor Card unaffected; codex audits the
  output contract.
- **Slider-vs-LLM score conflict** → sliders are the source of truth for the axes they cover; `convertTastingScores`
  only fills gaps from free-text. One writer per axis.
- **Progression feeling gimmicky / gating frustration** → texture-first is the research-backed default; gating only
  the *specific* Tier-3 chips (axes + Tier-1/2 always available); human sign-off catches it.
- **iOS keyboard on the free-text step** → reuse the existing `useNativeKeyboard` + safe-area patterns; human verifies.
