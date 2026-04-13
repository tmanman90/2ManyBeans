---
date: 2026-04-12
topic: handbrew-modal-fixes
---

# Hand-Brew Modal: Ratio Card Polish + Dynamic Coffee Dose

## Problem Frame

Two issues surfaced on the first real-device test of the hand-brew timer:

1. **Ratio card visual bug.** The param grid at the top of the recipe has three cards — COFFEE, WATER, RATIO. COFFEE and WATER render `[icon] / LABEL / VALUE` top-to-bottom. RATIO has no icon and its value/label float to the top of the card, making it look visually inconsistent and slightly broken. File: `src/components/HandBrewModal.jsx:100`.

2. **Dose is frozen at the AI's choice.** The AI picks a coffee dose (typically 20g) and the user cannot deviate without regenerating the whole recipe or doing mental math. Real brewing flow: Tal wants to pull out 18g today because that's what he feels like, and the whole recipe should scale proportionally (water, per-step water totals) so the timer shows the right numbers without him re-calculating in his head.

## Requirements

- **R1.** The RATIO card in the param grid at `HandBrewModal.jsx:100` matches the structural layout of COFFEE and WATER: `[icon] / LABEL / VALUE` from top to bottom. Use the lucide `Scale` icon. Icon color matches the existing `C.accent` (caramel).

- **R2.** The COFFEE card is interactive. The user can tap a `–` button to decrement and `+` button to increment the coffee dose by 1 gram. The base number is the recipe's current dose. The stepper UI sits inside the COFFEE card (replaces the static `20g` display with `– 20g +` or equivalent).

- **R3.** Long-pressing the `–` or `+` button accelerates the adjustment (continuous change while held). Exact cadence is a planning-time detail, but the intent is: adjusting from 20g to 25g should not take 5 individual taps for a user who knows what they want.

- **R4.** When the coffee dose changes, the displayed recipe recalculates:
  - Water total = coffee × ratio (ratio stays fixed). Round to nearest whole gram.
  - Each step's `waterTotal` is scaled by `newCoffee / originalCoffee` and rounded to nearest whole gram.
  - Grind, water temperature, technique, total brew time, step time strings, and step actions all stay exactly as the AI generated them.

- **R5.** Hard dose range: **10g minimum, 40g maximum.** The `–` button is disabled at 10g, the `+` button at 40g. Range is enforced to prevent nonsense values and to keep the UI from entering batch-brewer territory we don't support.

- **R6.** The adjusted dose persists per bean. Save as a new field on the bean document (e.g. `handBrewRecipe.userCoffeeGrams`) alongside the existing AI-generated `coffeeGrams`. On next modal open for the same bean, restore the user's last dose. Each bean remembers its own override independently.

- **R7.** **Regenerating the recipe resets the override.** When the user taps "Regenerate Recipe", the new AI-generated recipe comes back at its AI-chosen dose, and any prior `userCoffeeGrams` override is cleared. Clean-slate contract: regenerate = fresh start.

- **R8.** The Brew Timer reads the *adjusted* recipe. If the user sets 18g before tapping "Start Brew", the BrewTimer's step pills and water total callouts show the scaled water amounts. Step `time` values are unchanged (time is time regardless of dose). The `timerReady` gate from the existing Phase 0 data hardening still applies — dose adjustment should not break it.

- **R9.** The BrewTimer, once open, does NOT live-update if the dose changes underneath it. Out of scope. Users who want to adjust after starting the timer must close and reopen.

## Success Criteria

- The RATIO card visually matches COFFEE and WATER — no special-case layout remains.
- Tal can tap the coffee grams on any existing hand-brew recipe, change it from 20g to 18g in under 5 seconds, and see water + per-step totals update in-place.
- Opening a bean's hand-brew recipe after a prior dose adjustment restores that dose automatically.
- Tapping Regenerate on a bean with an overridden dose returns the AI's fresh dose (not the override).
- The BrewTimer started from an 18g-adjusted recipe shows the scaled water totals in the step pills.
- No fractional-gram values anywhere in the UI (all displays are whole grams).

## Scope Boundaries

- **Not in scope:** changing the ratio itself (stronger/weaker brew). Ratio adjustment is a different feature — user can regenerate if they want a different strength.
- **Not in scope:** profile-level default dose ("always use 18g for pour-over"). Per-bean only.
- **Not in scope:** live dose updates propagating to an already-open BrewTimer. Close and reopen.
- **Not in scope:** batch-brewer territory (40g+). Hard limit at 40g.
- **Not in scope:** sub-gram precision (0.5g, 0.1g). Whole grams only.
- **Not in scope:** water stepper. Only coffee is adjustable — water is derived.
- **Not in scope:** AidenModal. Aiden recipes are machine-driven, dose is fixed there.

## Key Decisions

- **Stepper, not inline edit, not modal/sheet.** Chosen for speed: the realistic use case is ±1-3g from the AI default, and a stepper avoids opening a keyboard or blocking the modal. Long-press acceleration handles the rare multi-gram jump.
- **Per-bean persistence.** The dose depends on the bean's density and your current cup size, not on a global preference. Each bean remembering its own last-used dose matches how people actually brew.
- **Regenerate resets the override.** Rationale: regeneration is a rare, deliberate action, and the user's mental model for "regenerate" is "give me a new recipe". Preserving the override across regenerations is a surprising behavior. The simpler contract wins.
- **Round to whole grams.** Pour-over scales show 0.1g but no recipe book targets fractional grams. 284g is cleaner than 283.5g. Users will round anyway.
- **Water derived, never stored.** Only `coffeeGrams` (and `userCoffeeGrams` override) are persisted. Water totals in the UI are always computed from `coffee × ratio` at render time. This avoids stale-data bugs where the stored water drifts from the displayed water.
- **Step waterTotal scaling is computed at render time, not mutated in place.** The original AI-generated `recipe.steps[n].waterTotal` stays untouched in Firestore. The HandBrewModal and BrewTimer compute display values from `step.waterTotal × (userCoffeeGrams / coffeeGrams)` at render. This keeps the recipe document pristine and makes the undo/reset semantics trivial.

## Dependencies / Assumptions

- `recipe.coffeeGrams` already exists and is the AI-generated dose.
- `recipe.ratio` is a string like `"1:15.75"` that `HandBrewModal` already parses for display. Extracting the numeric divisor (15.75) for recalculation requires a small parse helper — trivial.
- `recipe.steps[n].waterTotal` is a number in grams (confirmed via the Phase 0 data hardening).
- Firestore writes on every ± tap would be wasteful. The `userCoffeeGrams` save should debounce or only persist on modal close / Start Brew.
- The existing Phase 0 `timerReady` flag on the recipe is independent of dose. Scaling the water doesn't invalidate it.

## Outstanding Questions

### Resolve Before Planning

(none — all product decisions resolved in brainstorm)

### Deferred to Planning

- **[Affects R3][Technical]** Exact long-press acceleration cadence (e.g. first tick after 400ms, then every 80ms) — pick a feel that matches iOS system steppers.
- **[Affects R6][Technical]** Persistence write strategy: debounce N milliseconds after the last tap, or persist on modal close / Start Brew button press? Planner should pick whichever is simpler and avoids Firestore write spam.
- **[Affects R2][Technical]** Exact stepper layout inside the COFFEE card: `– 20g +` horizontal, or `20g` large with `–` / `+` as two small chips below? Pick whichever fits the existing ParamCard aesthetic without making the other two cards look imbalanced.
- **[Affects R8][Needs code check]** Confirm that `QuickRecipeFlow` ephemeral beans (no Firestore id yet) handle the `userCoffeeGrams` write correctly. Ephemeral bean flow stores recipe in local state; the override should live there until the bean is auto-saved.
- **[Affects R4][Technical]** Ratio parse helper — regex vs. split on `":"`. Trivial, but the planner should pick a robust form since ratio strings can include descriptors like `"1:15.5 to 1:16"`. Take the first numeric divisor found.

## Next Steps

→ `/ce:plan` for structured implementation planning
