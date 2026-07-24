---
title: "fix: Keep scaled brew-step copy aligned with water totals"
type: fix
status: active
date: 2026-07-24
origin: docs/brainstorms/2026-04-12-handbrew-modal-fixes-requirements.md
---

# fix: Keep scaled brew-step copy aligned with water totals

## Summary

Extend the existing render-time dose scaling so gram-denominated quantities inside each step's human-readable action scale with the structured recipe values. Keep the stored AI recipe pristine and let both HandBrewModal and BrewTimer continue consuming the same derived recipe.

## Requirements

- R1. Changing a recipe from 20 g coffee to 18 g must change both a bloom action's `40 g` instruction and its `waterTotal` to 36 g.
- R2. Every explicit gram quantity in a scaled step action must use the same dose scale factor and whole-gram rounding rule as structured recipe quantities, including coffee dose, cumulative water, and incremental water amounts. When an action quantity describes that step's cumulative total, it must equal the step's scaled `waterTotal`; independently rounded incremental quantities may differ by 1 g from the delta between two rounded cumulative totals.
- R3. Numbers without a gram unit, including times, multipliers, temperatures, and physical measurements, must remain unchanged.
- R4. Scaling must remain a render-time derivation: do not mutate the original recipe, stored Firestore data, step times, `timerReady`, or total brew duration.
- R5. For hot brews, both HandBrewModal and BrewTimer must receive aligned action copy and structured totals through their existing shared `displayRecipe` path.

The current report supersedes the origin document's R4 clause that step actions stay exactly as generated. That old constraint produced the user-visible contradiction this fix addresses; all other origin scope and persistence decisions remain unchanged.

## Scope Boundaries

- Do not regenerate or migrate saved recipes.
- Do not change ratio selection, dose persistence, timer timing, or brew-method generation prompts.
- Do not modify flash-brew transformation behavior. It receives the scaled hot `displayRecipe` as input, then passes its own transformed derived recipe and dose-derived ice instructions to BrewTimer.
- Do not broaden this work into repairs for the separate `scripts/manual-recipe-quality-audit.mjs` module-loading failure.

## Context & Research

### Relevant Code and Patterns

- `src/lib/recipeScaling.js` is the pure, render-time source of truth for dose-derived recipe display values.
- `src/components/HandBrewModal.jsx` derives `displayRecipe` once and passes the appropriate derived recipe into BrewTimer.
- `src/components/BrewTimer.jsx` renders `step.action` and `step.waterTotal` side by side, so alignment must be established before rendering.
- `scripts/manual-recipe-quality-audit.mjs` already expresses the desired action-copy assertions, but its broader audit currently fails before reaching them and is not part of the package test scripts.

### Institutional Learnings

- Verify the emitted downstream timer contract, not only the local scaling table.
- Regression assertions must discriminate against the old behavior by proving both structured and human-readable values change together.

## Key Technical Decisions

- Scale explicit gram-unit tokens inside `scaleRecipeForDose` rather than adding display-only rewriting to each UI component. This preserves a single derived-recipe contract across the modal and timer.
- Apply the existing `newDose / originalDose` factor and nearest-whole-gram rounding to positive integer or decimal quantities followed by optional whitespace and a case-insensitive whole unit token of `g`, `gram`, or `grams`. Preserve the original unit spelling and spacing; do not match embedded units such as `mg` or ordinary words beginning with `g`.
- Treat explicit gram quantities in generated hot-brew step actions as dose-derived recipe amounts. This is an accepted input invariant; the generator uses those quantities for coffee and water rather than fixed equipment capacities.
- Leave action text untouched when scaling is skipped by the helper's existing validation and fallback paths.
- Add a dedicated Node regression test for this pure helper and expose it through a focused package script so the check is repeatable without the unrelated manual audit.

## Implementation Units

- U1. **Add the stale-copy regression contract**

**Goal:** Capture the reported 20 g to 18 g mismatch and the boundaries of safe action-copy scaling before changing production behavior.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Create: `scripts/recipe-scaling.test.mjs`
- Modify: `package.json`

**Approach:**
- Exercise `scaleRecipeForDose` directly with representative generated action strings.
- Keep this test independent of handbrew-generation module loading so it runs hermetically with Node.

**Execution note:** Start with the failing regression test and confirm it fails because the action copy remains stale while `waterTotal` scales.

**Patterns to follow:**
- Node built-in assertions and direct ESM imports used by existing scripts.
- Existing whole-gram expectations in `scripts/manual-recipe-quality-audit.mjs`.

**Test scenarios:**
- Happy path: 20 g to 18 g changes `Bloom with 40 g water` to 36 g and changes `waterTotal` from 40 to 36.
- Happy path: one action containing cumulative and incremental quantities scales both, such as 160 g total and 120 g added becoming 144 g and 108 g.
- Happy path: an instruction containing the original coffee dose scales 20 g coffee to 18 g coffee.
- Edge case: `g`, spaced ` g`, `gram`, and `grams` unit forms preserve their unit form while scaling integer or decimal quantities.
- Edge case: `40.5 g` and `40 grams,` scale, while `50mg` and `5 gently` remain unchanged.
- Edge case: time values, `2x`, temperatures, and centimeter measurements remain unchanged.
- Edge case: scaling does not mutate the input recipe.
- Error path: invalid dose or unparseable ratio preserves the existing fallback behavior and action text.

**Verification:**
- The regression test fails against the pre-fix helper for stale action copy and passes after U2.

- U2. **Scale gram quantities in the derived step actions**

**Goal:** Make every derived step internally consistent without changing stored recipes or renderer-specific code.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `src/lib/recipeScaling.js`
- Test: `scripts/recipe-scaling.test.mjs`

**Approach:**
- Add a small pure action-scaling helper local to the recipe scaling module.
- Apply it while mapping steps, including steps that contain action copy but no `waterTotal`.
- Preserve existing early returns, object identity on fallback paths, timing fields, `timerReady`, and all unrelated recipe properties.

**Patterns to follow:**
- The pure, non-mutating mapping already used by `scaleRecipeForDose`.
- The existing whole-gram rounding used for `waterGrams` and `waterTotal`.

**Test scenarios:**
- Downstream contract: passing the derived recipe to `buildTimerSteps` preserves aligned action and `waterTotal` values plus unchanged timing data.
- Edge case: a step with action copy but no `waterTotal` still scales explicit coffee or water grams.
- Edge case: a null step, missing action, or non-string action remains safe and unchanged.

**Verification:**
- All focused regression scenarios pass.
- Lint and production build remain green.
- A source review confirms HandBrewModal and BrewTimer need no component-specific workaround.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A generated sentence contains a gram quantity unrelated to the recipe dose | Accept and document the generator invariant that explicit gram quantities in hot-brew step actions are dose-derived coffee or water amounts; keep the match grammar narrow and covered by false-positive tests. |
| Independently rounded incremental quantities differ from rounded cumulative deltas by 1 g | Prefer consistent proportional rounding for every displayed quantity and require exact chip agreement when the sentence describes the same cumulative total. |
| Renderer-specific fixes diverge later | Keep scaling in the shared derived recipe rather than either component. |

## Sources & References

- **Origin document:** `docs/brainstorms/2026-04-12-handbrew-modal-fixes-requirements.md`
- Related code: `src/lib/recipeScaling.js`
- Downstream consumers: `src/components/HandBrewModal.jsx`, `src/components/BrewTimer.jsx`
- Existing desired assertions: `scripts/manual-recipe-quality-audit.mjs`
