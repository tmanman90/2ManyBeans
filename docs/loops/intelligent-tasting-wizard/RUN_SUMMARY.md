# Intelligent Tasting Wizard — /goal run summary

**Branch:** `redesign` · **Status:** all programmatic + judge gates GREEN; v6 (Tal device sign-off) pending.

## What shipped
Replaces the linear chat coach with a reactive, predict-then-confirm guided tasting where Professor
Ruphus predicts what *this* bean should taste like and coaches the user to find it.

### Units
- **U1** `src/lib/tastingExpectations.js` — `predict(bean)` over origin×process×roast×altitude → all 6
  radar axes (levels + labels), hero descriptors, per-step coaching cues, summary. Pure.
- **U2** `src/lib/flavorWheel.js` — SCA descriptor tree + gated chips + 4 axis slider configs.
- **U3** `src/lib/palate.js` — `palateLevel(tastings)` + `unlockedTiers(level)`, derived from history (no new Firebase).
- **U4** `src/lib/tastingWizardSteps.js` — 8-beat Hoffmann step machine → existing record shape;
  `buildTastingFromAnswers` writes `tastingScores` directly (real fingerprint). Pure + tested.
- **U5** custom controls — `AxisSlider` (Liquid Glass thumb, haptic detents, predict ghost marker),
  `FlavorWheelPicker` (palate-gated tiers), `RuphusReaction` (existing nobg poses).
- **U6** `RadarLightSweep` — signature canvas specular sweep + live real radar + completion bloom;
  additive `reactToTastingStep` in claude.js (pro-gated, non-gating).
- **U7** `TastingWizard` shell — predict intro → step cards → found-vs-expected reveal + palate surface;
  saves via existing `addTasting`. Integrated into `TastingTab` (list CTA + BrewTimer bridge).
- **U8** `scripts/verify-wizard.mjs` + `wizard-harness.*` — drives the real wizard end-to-end.
- **U9** `scripts/audit-wizard.mjs` — design/frame audit; frames in `sim/wizard/`.

## Gate results
- v1-build: PASS · v2-harness (verify-wizard, R1–R5/R7/R8/R10): PASS · v3-regression (tasting,
  archive, inventory, morph, chat): PASS · v4-audit (R12/R13): PASS · motion-on smoke: PASS
- v5-review (codex): round 1 FAIL (R2,R8,R9,R10,R13) → fixed in d6799ae → **round 2 PASS** (all 13 + SCOPE).
- v6-human: PENDING — Tal runs a full guided tasting on the dev app.

## Scope held
No Firebase / tasting-data-model / extraction-output-shape change. Deterministic core works with no
live AI (LLM reaction is additive + pro-gated). Manual entry preserved. No Phase-3 two-bean. No new
Higgsfield assets (reused existing Ruphus poses).

## Known follow-up (not blocking)
The old chat takeover render block in `TastingTab.jsx` (`mode==='chat'`, ~280 lines + its helpers) is
now unreachable dead code — left in place to keep this diff safe. Optional cleanup pass.
