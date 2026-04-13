---
title: "feat: Hand-Brew Modal — Ratio Card Fix + Dynamic Coffee Dose"
type: feat
status: active
date: 2026-04-12
deepened: 2026-04-12
origin: docs/brainstorms/2026-04-12-handbrew-modal-fixes-requirements.md
---

# Hand-Brew Modal — Ratio Card Fix + Dynamic Coffee Dose

Two tightly-coupled fixes on the `HandBrewModal` surface: (1) a cosmetic layout bug on the RATIO param card, and (2) a new interactive stepper on the COFFEE param card that lets the user adjust the coffee dose and see the whole recipe rescale proportionally in-place. Both changes live in the same modal and share some helper plumbing, so they ship together.

## Enhancement Summary

**Deepened on:** 2026-04-12
**Research agents used:** iOS stepper touch patterns (Apple HIG, react-aria, Radix, WebKit docs, Capacitor 8) + codebase integration audit (useHandBrew, QuickRecipeFlow, BrewTimer, ParamCard, Firestore write infrastructure).

### Key Corrections to the Plan

1. **Cadence corrected to 500ms initial + 120ms repeat (not 400/80).** My initial 400/80 numbers were too fast for a 30-unit range — ticking would blast past the target. 500/120 matches iOS UIStepper exactly (500ms initial press, ~100-120ms repeat, no acceleration). At 120ms the full 10→40g range takes ~3.6s which is the UIStepper feel.
2. **Haptic fires every 5 ticks, not every tick.** The Taptic Engine can't cleanly render impacts faster than ~80-100ms apart, and per-tick haptics at 120ms feels like a buzzing vibrate, not discrete feedback. UIStepper does NOT haptic per repeat. Pattern: `haptic.light()` on initial press, `haptic.selection()` every 5th tick (like a picker wheel detent), `haptic.medium()` when hitting the min/max boundary.
3. **Pointer events, not touch events.** Capacitor 8 + iOS 15+ fully supports Pointer Events. They give us `pointerleave` for swipe-off cancellation for free (no manual distance math), and react-aria/Radix/Framer Motion all migrated years ago. The existing `useLongPress` hook stays on touch events — we don't touch it. `useRepeatPress` is net-new and goes pointer-first.
4. **`-webkit-touch-callout: none` is the critical CSS** I missed. `user-select: none` alone does NOT suppress the iOS Copy/Look Up/Share callout on iOS 15+. The canonical full suppression combo is documented in the new Research Insights section below. Also: the `–` / `+` glyphs must be wrapped in `<span aria-hidden="true" style={{ pointerEvents: 'none' }}>` to prevent the iOS 17.4+ loupe from appearing on very long holds (>1.2s).
5. **Don't `disabled={true}` at range limits — just stop ticking.** Disabling a button mid-hold causes iOS WebKit to synthesize `pointercancel` AND stop dispatching events, which can leak an interval if cleanup is in the event handler. Instead, keep the button interactive, stop calling `onTick`, fire `haptic.medium()` as a boundary bump. UIStepper does exactly this. The button's opacity/color can still change to show "I'm at the limit" but it remains tap-responsive.
6. **Cleanup lives in `useEffect([pressing])`, not event handlers.** A `useEffect` cleanup keyed to the pressing state survives disable, unmount, and prop changes. Imperative cleanup in `pointerup` handlers has edge cases — skip them.

### Codebase Audit Results

**Verified correct (no plan changes needed):**
- `useHandBrew.js:95-103` — the regenerate write is a full object replacement (`handBrewRecipe: { ...newRecipe }`), so prior `userCoffeeGrams` is implicitly cleared. No explicit null-out required.
- `useHandBrew.js:37-46` — cached recipe hydration is a passthrough, so a new `userCoffeeGrams` field on `bean.handBrewRecipe` flows automatically.
- `useAppData.js:213-221` — `updateBean` uses native `updateDoc`, which supports Firestore dot-path writes natively. `{ 'handBrewRecipe.userCoffeeGrams': 18 }` will merge as a nested field without touching siblings.
- `BrewTimer.jsx:213` — `useBrewTimer(recipe)` is a direct prop passthrough. Passing a scaled recipe object works without any BrewTimer or hook changes.
- `HandBrewModal.jsx:11-23` — confirmed ParamCard is a text-centered block container (not flex/grid internally). DoseStepperCard must match `background: C.bg`, `borderRadius: 10`, `padding: '10px 12px'`, `textAlign: 'center'`, and use `fonts.title` at 20px for the numeric value to stay aligned with COFFEE/WATER/RATIO.

**One real deviation from the plan (flagged as a NEW REQUIREMENT below):**
- `QuickRecipeFlow.jsx:247-250` — the current `handleAutoSave()` spreads `handBrew.handBrewRecipe` into `beanData.handBrewRecipe` without any plumbing for the modal's local `userCoffeeGrams` override. The plan's original approach (modal owns the override, persists on close) doesn't work for ephemeral beans because the modal's local state lives below QuickRecipeFlow and isn't readable from the auto-save site. **Fix: lift `userCoffeeGrams` state from `HandBrewModal` to the parent** (RotationTab / InventoryTab / ChatTab / QuickRecipeFlow) via a controlled-component pattern. See R10 in Requirements and the expanded Persistence section.

### New Considerations Discovered

- The existing `src/styles/global.css` likely has `touch-action: manipulation` set globally already (research flagged that hint). Verify and add `-webkit-touch-callout: none` at the global level if so — this is a one-line fix that will also help the existing `BrewButton` long-press hit-rate, which has been flaky in iOS QA.
- The existing `haptic.medium()` method can serve as the boundary-bump haptic. Check `src/lib/haptics.js` for existing methods (the recent rip-it run added `haptic.heavy()`) — if `medium` exists, use it. If not, use `haptic.heavy()` for the boundary and `haptic.light()` for initial press.
- Don't use `setPointerCapture` inside the stepper handlers — pointer capture SUPPRESSES `pointerleave`, defeating the swipe-off behavior. No capture + `pointerleave` is the right combo for a stepper.
- `pointercancel` MUST stop the repeat loop. iOS fires this when it decides the gesture became a scroll. Treating it the same as `pointerup` is non-negotiable or the button "sticks" incrementing forever. This is documented as the #1 pointer-events bug in React apps.

## Overview

The hand-brew timer shipped in the prior `/rip-it` run surfaced two issues on first real-device use:

1. **Ratio card visual bug.** The COFFEE and WATER param cards have an `[icon] / LABEL / VALUE` layout top-to-bottom; RATIO has no icon, so the label and value float to the top and the card looks visually broken. Fix: pass a `Scale` icon to `ParamCard` at `src/components/HandBrewModal.jsx:100`.

2. **Dose is frozen at the AI's pick.** The AI chooses 20g (or whatever it picks) and the user has no way to say "actually brew me 18g today" without regenerating the recipe or doing mental arithmetic on every step's water total. Real brewing flow: dose varies bean-to-bean and day-to-day, and the timer has to show the right scaled water numbers or it's useless.

The origin brainstorm (`docs/brainstorms/2026-04-12-handbrew-modal-fixes-requirements.md`) resolved all product decisions: stepper UI with long-press acceleration, persist per bean as an override, regenerate clears the override, BrewTimer reads the adjusted recipe, range 10g–40g, whole grams only. This plan is HOW to implement those decisions.

## Problem Statement

Cached hand-brew recipes on every existing bean have exactly one coffee dose — whatever GPT picked at generation time. Tal's actual brewing pattern varies the dose day-to-day based on how he feels or how much coffee he wants to drink. Without dose adjustment, the timer either (a) forces him to pull 20g every time, or (b) forces him to mentally scale every step's water total while the timer is running. Both are friction. The whole point of the timer is to remove that friction.

Separately, the RATIO card inconsistency is small but visible and was caught on the first real-device test. Shipping the fix in the same commit as the stepper is cheap and avoids a second deploy.

## Proposed Solution

### Architecture

**New files:**

| File | Purpose |
|------|---------|
| `src/hooks/useRepeatPress.js` | Press-and-hold repeat hook using **Pointer Events**. Fires `onTick` immediately on press, then at `initialDelay` (500ms), then at `interval` (120ms) while held. Uses `useEffect([pressing])` for interval cleanup (not event handlers). Cleans up on release, pointerleave (swipe-off), pointercancel (iOS scroll takeover), or unmount. |
| `src/components/DoseStepperCard.jsx` | Dedicated variant of `ParamCard` that renders the `– {dose}g +` stepper. Keeps `ParamCard` free of interactive state. |
| `src/lib/recipeScaling.js` | Pure helpers: `parseRatioDivisor(ratioStr)`, `scaleRecipeForDose(recipe, newDose)`. No React, no Firestore, fully testable. |

**Modified files:**

| File | Change |
|------|--------|
| `src/components/HandBrewModal.jsx` | Render `DoseStepperCard` in place of the COFFEE `ParamCard`; pass `Scale` icon to the RATIO `ParamCard`; derive displayed water + per-step totals from `scaleRecipeForDose()`; own the `userCoffeeGrams` local state and write it on modal close / Start Brew press. |
| `src/components/BrewTimer.jsx` | Accept the scaled recipe from `HandBrewModal` (no internal scaling logic) — ensures the timer reads the same numbers the modal shows. |
| `src/hooks/useHandBrew.js` | Expose the current `userCoffeeGrams` (if any) alongside `handBrewRecipe` so the modal can hydrate from Firestore on open, and persist back via a new helper on close/regenerate. |
| `src/lib/handbrew.js` | On `Regenerate Recipe` — the existing generation path writes the new recipe to Firestore. Add a companion write that clears `handBrewRecipe.userCoffeeGrams` so regeneration resets the override (origin R7). |

### Data Model

The override lives on the bean document alongside the existing `handBrewRecipe` object:

```
bean.handBrewRecipe = {
  ...existing fields (coffeeGrams, waterGrams, ratio, steps, totalBrewTimeSeconds, timerReady, ...),
  userCoffeeGrams: number | undefined,  // NEW — absent until the user adjusts
}
```

Only `userCoffeeGrams` is persisted. Water, per-step `waterTotal`, and any other derived numbers stay exactly as the AI generated them. **Display values are computed at render time** via `scaleRecipeForDose()`. This is intentional (origin: *Step waterTotal scaling is computed at render time, not mutated in place*) so:
- The pristine AI recipe stays addressable forever.
- Reset on regenerate is trivial — just delete `userCoffeeGrams`.
- No stale-data risk from drifting stored water values vs displayed values.
- `timerReady` stays valid (it was computed against the original numbers and those don't change).

### Scaling Math (`src/lib/recipeScaling.js`)

Pure helpers, no side effects. Full spec:

```js
// Extract the numeric divisor from a ratio string. Handles:
//   "1:16"            → 16
//   "1:15.75"         → 15.75
//   "1:15.5 to 1:16"  → 15.5 (first numeric)
//   "1:15.5-1:16"     → 15.5 (first numeric)
//   garbage / missing → null
export function parseRatioDivisor(ratioStr) { ... }

// Return a NEW recipe object with the same shape as the input,
// with coffeeGrams/waterGrams/steps[n].waterTotal scaled for the new dose.
// Everything else (steps[n].time, step actions, grind, temp, technique,
// totalBrewTimeSeconds, timerReady) is copied through unchanged.
//
// Rounding: nearest whole gram for water and step waterTotals. Fractional
// grams never escape this function.
//
// If newDose is null / undefined / out of range / ratio is unparseable,
// returns the recipe unchanged (idempotent fallback).
export function scaleRecipeForDose(recipe, newDose) { ... }
```

**Example:**
```
Input: { coffeeGrams: 20, waterGrams: 315, ratio: "1:15.75",
         steps: [{time:"0:00", waterTotal:50}, {time:"0:30", waterTotal:120}, ...] }
newDose: 18

Output: { coffeeGrams: 18, waterGrams: 284,  // round(18 × 15.75)
          ratio: "1:15.75",
          steps: [{time:"0:00", waterTotal:45}, {time:"0:30", waterTotal:108}, ...] }
```

`scaleRecipeForDose()` is the single source of truth for what the user sees — used by both `HandBrewModal` (for the vertical step timeline + total water) and `BrewTimer` (for the step pill water totals). No code path renders a scaled water number without going through this function.

### Stepper UI (`src/components/DoseStepperCard.jsx`)

Visual layout matches the existing `ParamCard` but with interactive `–` / `+` buttons flanking the value:

```
┌─────────────────────┐
│       [Coffee icon] │
│       COFFEE        │
│   [–]  20g  [+]     │
└─────────────────────┘
```

Same background (`C.bg`), same border-radius, same padding as `ParamCard` so the three cards in the grid stay visually aligned. The `–` and `+` buttons are `44×44pt` hit targets per iOS HIG (even though the visual circle is smaller — invisible padding expands the touch area), positioned left/right of the value with consistent spacing.

Behavior:
- **Tap `+`**: `dose = Math.min(40, dose + 1)`
- **Tap `–`**: `dose = Math.max(10, dose - 1)`
- **Hold `+` / `–`**: `useRepeatPress` hook. First tick fires immediately on press, then after a **500ms delay** the hook starts repeating at **120ms intervals** until release, pointerleave, or pointercancel. Each tick calls the same clamped increment/decrement function. Matches iOS UIStepper cadence.
- **Range-limit behavior**: at dose = 10 (or 40), the `–` (or `+`) button still receives taps but `onTick` no-ops. The button fires `haptic.medium()` as a boundary bump instead of ticking. The button is visually dimmed (`opacity: 0.4`) to communicate the limit, but is NOT `disabled={true}` — disabling a button mid-hold causes WebKit to synthesize `pointercancel` and stop dispatching events, which leaks intervals. Keep it interactive, stop ticking, bump the haptic.
- **Haptic pattern**: `haptic.light()` on initial press. `haptic.selection()` every 5th tick (picker-wheel detent). `haptic.medium()` at range boundary. NO per-tick haptic — at 120ms intervals the Taptic Engine can't render discrete impacts, it becomes a buzzing vibrate. Mirrors iOS UIStepper's haptic pattern.

Props:
```js
<DoseStepperCard
  dose={currentDose}      // number, 10-40
  onChange={(newDose) => setDose(newDose)}
  min={10}
  max={40}
  icon={Coffee}           // lucide icon, same as ParamCard
/>
```

### Repeat-Press Hook (`src/hooks/useRepeatPress.js`)

**Uses Pointer Events**, not touch events. Does NOT replace `useLongPress` — they serve different purposes (`useLongPress` distinguishes tap from long-press; `useRepeatPress` is specifically for "hold to repeat" like a stepper or scrubber). The existing `useLongPress` stays unchanged.

Key design decisions (all from Research Insights below):

1. **Pointer events over touch events.** Capacitor 8 + iOS 15+ ship full pointer-events support. PE give us `pointerleave` for swipe-off cancellation for free — no manual `touchmove` distance math. This is how react-aria, Radix, and Framer Motion all work in 2026.
2. **NO `setPointerCapture`.** Capture suppresses `pointerleave`, defeating swipe-off. For a stepper we want no capture + pointerleave — finger drifts off the button, ticking stops.
3. **`pointercancel` MUST stop the repeat loop.** iOS fires this when it decides the gesture became a scroll. Treating it identically to `pointerup` is non-negotiable or the button "sticks" ticking forever. This is the #1 pointer-events bug in React steppers.
4. **Cleanup lives in `useEffect([pressing])`.** React-idiomatic, survives disable / unmount / prop change / state race. Do NOT put `clearInterval` in `pointerup` handlers — edge cases will bite.
5. **First tick fires immediately on press, then 500ms pause, then 120ms repeats.** Matches iOS UIStepper exactly.

```js
/**
 * Press-and-hold repeat hook — pointer events, useEffect cleanup.
 *
 * Usage:
 *   const handlers = useRepeatPress({
 *     onTick: handleIncrement,
 *     canTick: () => dose < 40,       // return false to no-op the tick (boundary)
 *     onBoundary: () => haptic.medium(),  // fired when canTick returns false
 *     initialDelay: 500,
 *     interval: 120,
 *   });
 *   <button {...handlers}>+</button>
 */
export function useRepeatPress({ onTick, canTick = () => true, onBoundary, initialDelay = 500, interval = 120 }) {
  const [pressing, setPressing] = useState(false);
  const tickCountRef = useRef(0);

  useEffect(() => {
    if (!pressing) return;

    const fireTick = () => {
      if (!canTick()) {
        onBoundary?.();
        return;
      }
      onTick();
      tickCountRef.current += 1;
      if (tickCountRef.current % 5 === 0) haptic.selection().catch(() => {});
    };

    // First tick on press + initial haptic
    fireTick();
    haptic.light().catch(() => {});

    // Delayed repeat loop — setTimeout → setInterval chain
    let intervalId = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(fireTick, interval);
    }, initialDelay);

    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
      tickCountRef.current = 0;
    };
  }, [pressing, onTick, canTick, onBoundary, initialDelay, interval]);

  return {
    onPointerDown: useCallback((e) => { e.preventDefault(); setPressing(true); }, []),
    onPointerUp:     useCallback(() => setPressing(false), []),
    onPointerCancel: useCallback(() => setPressing(false), []),  // iOS scroll takeover
    onPointerLeave:  useCallback(() => setPressing(false), []),  // swipe-off
    onContextMenu:   useCallback((e) => e.preventDefault(), []), // suppress iOS callout
  };
}
```

The stepper button markup wraps the `–` / `+` glyph in an `aria-hidden` span with `pointer-events: none` to prevent the iOS 17.4+ loupe from appearing on very long holds — the button element itself stays the touch target, but the text node inside it is unreachable:

```jsx
<button
  {...repeatPressHandlers}
  style={{
    /* 44x44 hit area, -webkit-touch-callout: none, user-select: none, ... */
  }}
  aria-label="Decrease coffee dose"
>
  <span aria-hidden="true" style={{ pointerEvents: 'none' }}>–</span>
</button>
```

### Persistence Strategy

**Lifted state.** The codebase audit confirmed that the original plan's "modal owns the override" approach doesn't work for ephemeral beans in `QuickRecipeFlow`: the modal's local state lives below the flow and isn't readable from `handleAutoSave()`. Fix: the parent (`RotationTab`, `InventoryTab`, `ChatTab`, and `QuickRecipeFlow`) owns `userCoffeeGrams` state, passes it as a controlled prop to `HandBrewModal`, and provides an `onCoffeeGramsChange` callback. The modal is a pure controlled component with respect to dose.

```jsx
// Pattern at each HandBrewModal call site:
const [userCoffeeGrams, setUserCoffeeGrams] = useState(undefined);

// Reset to undefined when the cached recipe loads / the hook returns a new
// recipe identity (regenerate path).
useEffect(() => {
  setUserCoffeeGrams(handBrew.handBrewRecipe?.userCoffeeGrams);
}, [handBrew.handBrewRecipe]);

<HandBrewModal
  ...
  userCoffeeGrams={userCoffeeGrams}
  onCoffeeGramsChange={setUserCoffeeGrams}
/>
```

**On modal close (user taps X or backdrop) AND on Start Brew press:**
- If `userCoffeeGrams` is defined AND different from `bean.handBrewRecipe.userCoffeeGrams`:
  - Call `updateBean(bean.id, { 'handBrewRecipe.userCoffeeGrams': userCoffeeGrams })` — Firestore dot-path merge, touches only this field. The codebase audit confirmed `useAppData.js:213-221`'s `updateBean` passes `updates` directly to `updateDoc`, which supports Firestore v9+ dot-path notation natively.
- Ephemeral beans (`bean.id == null`): skip the write. The override lives in lifted state until the flow's `handleAutoSave()` runs.

**On regenerate press:**
- Existing `onRegenerate` callback runs → new recipe generated → `updateBean(bean.id, { handBrewRecipe: {...newRecipe} })`. The codebase audit confirmed this is a **full object replacement**, which implicitly clears any prior `userCoffeeGrams` from Firestore — no explicit null-out needed.
- A `useEffect` on the hook's new recipe identity resets local `userCoffeeGrams` to the new recipe's value (undefined if AI regenerated clean).

**No debounce.** Every `+` / `–` tap is free (it's local React state). The Firestore write happens once per session, on the terminal actions.

**Ephemeral beans (`QuickRecipeFlow`).** The bean has no Firestore id yet. The override lives in the flow's lifted state. When `handleAutoSave()` runs at `QuickRecipeFlow.jsx:247-250`, it must merge the current `userCoffeeGrams` into `beanData.handBrewRecipe` before calling `addBean()`. The audit identified this as the one real codebase deviation from the original plan — the current `handleAutoSave` has no plumbing for the override. Implementation requirement (R10 below) captures the needed change.

### BrewTimer Integration

`HandBrewModal` computes the scaled recipe once per render via:
```js
const scaledRecipe = useMemo(
  () => scaleRecipeForDose(recipe, userCoffeeGrams ?? recipe?.coffeeGrams),
  [recipe, userCoffeeGrams]
);
```

Both the in-modal step timeline AND the `BrewTimer` receive `scaledRecipe` (not the raw `recipe`). BrewTimer's existing `useBrewTimer(recipe)` hook continues to receive a recipe with the same shape — it doesn't know or care that scaling happened.

**Explicit non-goal:** Once BrewTimer is open, changing the dose in HandBrewModal has no effect on the running timer (origin R9). The BrewTimer captured the recipe it was handed at open time. This is a natural consequence of the `scaledRecipe` being passed as a prop — if the user wants to adjust mid-brew, they stop the timer, tap `–` / `+`, and tap Start Brew again.

### Regenerate Flow

When the user taps "Regenerate Recipe" in HandBrewModal:
1. The existing `onRegenerate` callback runs → new recipe generated → written to Firestore via `updateBean`.
2. The modal's local `userCoffeeGrams` state is reset to `undefined`.
3. The stepper re-renders with the new AI dose.
4. Firestore write for regenerate uses `updateBean(bean.id, { 'handBrewRecipe': newRecipe })` which replaces the whole `handBrewRecipe` object — so any prior `userCoffeeGrams` is implicitly deleted as part of the replacement. **Verify** during implementation that the regenerate path uses a full replacement, not a merge with the old object.

## Technical Considerations

### iOS Layout

The stepper sits in a grid cell that's ~1/3 of the modal width. On the narrowest iPhone (SE, 320pt viewport minus modal padding), each card has about 95pt of width. The `–`, value, `+` layout with 44pt hit targets fits comfortably but leaves little room — the `20g` value text needs to stay compact. Use `fontFamily: fonts.title` at 20pt (same as existing ParamCard) to stay inside the cell.

Touch targets: the VISIBLE `–` / `+` circle can be ~32pt (design), but the invisible tappable area via padding must be 44pt minimum per iOS HIG. Same pattern the existing BrewTimer controls use.

### iOS WebKit Text-Selection / Callout / Loupe Suppression

Prior iOS QA run showed that iOS WebKit hijacks long-press on webview elements and surfaces the system Copy/Look Up/Share callout. Research confirmed the canonical suppression combo — `user-select: none` and `touch-action: manipulation` alone are NOT sufficient on iOS 15+. Full required combo on every stepper button:

```css
.stepper-btn {
  -webkit-touch-callout: none;       /* CRITICAL — kills the Copy/Look Up callout */
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;  /* kills the blue tap flash */
  touch-action: manipulation;        /* kills 300ms double-tap-zoom delay */
  -webkit-user-drag: none;
}
```

Plus:
- `onContextMenu={e => e.preventDefault()}` — belt-and-suspenders, suppresses the right-click menu on web as well.
- Wrap the `–` / `+` glyph in a `<span aria-hidden="true" style={{ pointerEvents: 'none' }}>`. This is a known iOS 17.4+ bug: on very long holds (>1.2s), WebKit can STILL trigger the magnifier loupe if the button element contains a text node. Making the text unreachable via `pointer-events: none` on the span forces the touch target to be the button element only, which doesn't have the loupe behavior.

Also verify `src/styles/global.css` has these declarations at the global level — if so, the BrewButton long-press hit-rate (which has been flaky in iOS QA) will improve as a side effect of adding `-webkit-touch-callout: none` globally. If the global CSS doesn't have it, add it in this plan.

### Firestore Write Contract

Use dot-path updates like `{ 'handBrewRecipe.userCoffeeGrams': 18 }` to merge only this one field without touching the rest of the `handBrewRecipe` object. This is already the pattern in `useHandBrew.js` for recipe writes — verify it matches.

### Null / Undefined Safety

`userCoffeeGrams` is `undefined` for every existing bean in Firestore (the field didn't exist before this plan). The modal treats `undefined` as "no override" and falls back to `recipe.coffeeGrams`. `scaleRecipeForDose(recipe, undefined)` must return the recipe unchanged — no scaling, no NaN, no crashes.

### Range Boundary Behavior

At dose = 10g, the `–` button is visually dimmed (`opacity: 0.4`) but stays tap-responsive. Pressing it fires `canTick()` which returns false, and the hook fires `haptic.medium()` as a boundary bump instead of ticking. Same at dose = 40g for `+`. NOT `disabled={true}` — disabling a button mid-hold causes iOS WebKit to synthesize `pointercancel` and can leak timers. The dimmed opacity is the visual signal; the boundary haptic is the tactile signal.

### Fractional-gram Rounding Quirks

Example: `13g × 15.75 = 204.75g`. Rounding → 205g. Each step's scale factor is `13/20 = 0.65`. Step 1 (50g) → `32.5g` → 33g. Step 2 (120g) → `78g` exact. Step 3 (200g) → `130g` exact. Step 4 (250g) → `162.5g` → 163g.

All whole grams. No fractional values leak into the UI. Rounding is `Math.round()` per-value — we do NOT try to adjust step waterTotals to sum exactly to the total. Pour-over recipes aren't that precise and the tiny rounding differences (±1g per step) are well within the tolerance of any scale.

### Ratio String Robustness

The AI sometimes returns `"1:15.5 to 1:16"` or `"1:15.5-1:16"`. `parseRatioDivisor` should extract the first numeric divisor it finds (15.5 in that case). If no numeric can be found, return `null` and `scaleRecipeForDose` falls back to returning the recipe unchanged — the stepper still works, but the water and step totals don't update. This is an acceptable graceful-degradation: the coffee grams are still right, the user just doesn't get the proportional water scaling.

### No Regression on `timerReady`

`scaleRecipeForDose` never touches `recipe.timerReady`, `recipe.steps[n].time`, `recipe.steps[n].timeSeconds`, or `recipe.totalBrewTimeSeconds`. The BrewTimer's existing timer-ready gate and step-time parsing stays identical. Verify in tests.

## Acceptance Criteria

- [ ] **R1:** The RATIO `ParamCard` at `src/components/HandBrewModal.jsx:100` renders with a `Scale` icon at the top. Visual layout (icon / LABEL / VALUE) matches COFFEE and WATER cards.
- [ ] **R2:** The COFFEE card is an interactive `DoseStepperCard` with `–` and `+` buttons flanking the gram value. Tapping either button changes the dose by 1 gram.
- [ ] **R3:** Holding `–` or `+` fires repeat ticks — first tick immediately, then after **500ms initial delay** the hook repeats at **120ms intervals** until release, pointerleave, or pointercancel. The stepper visually updates in real-time during the hold. Uses Pointer Events (not touch events).
- [ ] **R4:** When the dose changes, the displayed total water and every step's water total update in-place. All displayed values are rounded to whole grams. Grind, temp, technique, total brew time string, and step time strings stay unchanged.
- [ ] **R5:** At dose = 10g the `–` button stops ticking (`canTick` returns false) and fires `haptic.medium()` as a boundary bump. At dose = 40g the `+` button does the same. The buttons are visually dimmed (`opacity: 0.4`) but NOT `disabled={true}` — disabling a button mid-hold causes iOS WebKit to synthesize `pointercancel` and stop dispatching events, which leaks intervals.
- [ ] **R6:** On modal close or Start Brew press, the current dose is persisted to Firestore as `handBrewRecipe.userCoffeeGrams` on the bean document (skipped if unchanged from what's already persisted).
- [ ] **R7:** Tapping Regenerate Recipe clears any `userCoffeeGrams` override: the new AI-generated recipe displays at its AI-chosen dose, and the stepper resets to that dose.
- [ ] **R8:** When the user taps Start Brew after adjusting the dose, the BrewTimer step pills and water totals show the scaled values. The step `time` values are unchanged.
- [ ] **R9:** Once BrewTimer is open, changing the dose in HandBrewModal does NOT update the running timer. (Not testable live — verify by code review.)
- [ ] Reopening a bean's hand-brew recipe after a prior dose adjustment restores that dose automatically from Firestore.
- [ ] `parseRatioDivisor("1:15.75")` returns `15.75`. `parseRatioDivisor("1:15.5 to 1:16")` returns `15.5`. `parseRatioDivisor("garbage")` returns `null`.
- [ ] `scaleRecipeForDose(recipe, undefined)` returns the recipe unchanged (no scaling, no crash).
- [ ] `scaleRecipeForDose(recipe, 18)` with ratio `"1:15.75"` and `coffeeGrams: 20` returns `coffeeGrams: 18` and `waterGrams: 284`.
- [ ] Every displayed water value in HandBrewModal AND BrewTimer is a whole integer (no `283.5g` or `42.5g` strings).
- [ ] iOS touch targets: both stepper buttons have ≥44pt hit areas even if the visible glyph is smaller.
- [ ] **R10:** `userCoffeeGrams` is lifted to the parent (each HandBrewModal call site — RotationTab, InventoryTab, ChatTab, QuickRecipeFlow) and passed into `HandBrewModal` as a controlled prop with an `onCoffeeGramsChange` callback. `QuickRecipeFlow.handleAutoSave()` merges the lifted value into `beanData.handBrewRecipe` at line 247 before calling `addBean()`, so ephemeral beans persist with the override applied.
- [ ] iOS text-selection / callout / loupe does NOT appear when pressing or holding the stepper buttons, even on holds >1.2s. Requires: `-webkit-touch-callout: none`, `-webkit-user-select: none`, `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`, `onContextMenu={e => e.preventDefault()}`, AND the `–` / `+` glyph wrapped in `<span aria-hidden="true" style={{ pointerEvents: 'none' }}>`.
- [ ] `pointercancel` event (iOS scroll takeover) stops the repeat loop immediately — the button must not "stick" ticking forever. Verified by scrolling the modal body while a `+` button is held.
- [ ] `timerReady` on the original recipe stays valid after scaling (integration test: open BrewTimer with a scaled recipe, verify it renders the timer UI not the "missing timer data" fallback).
- [ ] `QuickRecipeFlow` ephemeral bean: user adjusts dose, taps Start Brew, BrewTimer shows the scaled water. After `handleAutoSave()`, the saved bean document has `handBrewRecipe.userCoffeeGrams` populated.

## Implementation Phases

### Phase 0: Helpers + Ratio Icon (foundational, non-interactive)

- Create `src/lib/recipeScaling.js` with `parseRatioDivisor` and `scaleRecipeForDose`. Unit-test both via inline Node script (no full Jest setup needed in this repo — follow the Phase 0 `parseTimeString` test pattern from the prior rip-it run: `/tmp/test-handbrew.mjs`).
- Test cases for `parseRatioDivisor`: `"1:16"`, `"1:15.75"`, `"1:15.5 to 1:16"`, `"1:15.5-1:16"`, `"1: 15.5"`, `"garbage"`, `null`, `undefined`, `""`.
- Test cases for `scaleRecipeForDose`: happy path, `undefined` dose, dose at range limits, ratio unparseable, empty steps array, step with no `waterTotal`.
- Create `src/hooks/useRepeatPress.js` following the `useLongPress` pattern. Unit test manually via a throwaway React page if needed — otherwise integration-test in Phase 1.
- Modify `src/components/HandBrewModal.jsx` line 100: pass `icon={Scale}` (from lucide) to the RATIO `ParamCard`. Import `Scale` from `lucide-react` alongside the existing `Coffee`, `Droplets`, `Thermometer`, `RefreshCw`, `Play`.
- Verify no visual regression on COFFEE/WATER cards.
- Estimated: 0.25 day

### Phase 1: Stepper UI + Lifted Persistence + BrewTimer Integration

- Create `src/components/DoseStepperCard.jsx`. Reuse `ParamCard` visual tokens (background, border-radius, padding, text-align). Value layout is a 3-col flex row: `– {dose}g +`. Stepper buttons have 44×44pt hit areas via invisible padding, visible glyph ~32pt. Wrap `–` / `+` glyphs in `<span aria-hidden="true" style={{ pointerEvents: 'none' }}>` to block the iOS loupe.
- Apply full iOS callout suppression CSS on the stepper buttons (see Technical Considerations § iOS WebKit Text-Selection): `-webkit-touch-callout: none`, `-webkit-user-select: none`, `user-select: none`, `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`, `-webkit-user-drag: none`, plus `onContextMenu={e => e.preventDefault()}`.
- Check `src/styles/global.css` for existing `-webkit-touch-callout: none` at the global level. If missing, add it — this also helps the flaky `BrewButton` long-press.
- Integrate `useRepeatPress` with: `canTick: () => dose > min (or < max)`, `onBoundary: () => haptic.medium()`, `initialDelay: 500`, `interval: 120`.
- Modify `HandBrewModal.jsx`:
  - Accept new props: `userCoffeeGrams` (optional, number | undefined) and `onCoffeeGramsChange` (callback). Pure controlled component — no local state for dose.
  - Replace the COFFEE `ParamCard` at line 98 with `DoseStepperCard` wired to the controlled props.
  - Import `Scale` from `lucide-react`, pass `icon={Scale}` to the RATIO `ParamCard` at line 100 (R1).
  - `useMemo` the scaled recipe: `scaleRecipeForDose(recipe, userCoffeeGrams ?? recipe?.coffeeGrams)`.
  - Pass `scaledRecipe` (not `recipe`) to the step timeline rendering in the modal body.
  - Pass `scaledRecipe` (not `recipe`) as the `recipe` prop to `<BrewTimer>`.
  - On modal close (`onClose`): if `bean?.id` AND `userCoffeeGrams !== undefined` AND `userCoffeeGrams !== bean.handBrewRecipe?.userCoffeeGrams`, call `updateBean(bean.id, { 'handBrewRecipe.userCoffeeGrams': userCoffeeGrams })`. Skip the write for ephemeral beans (`!bean?.id`) — the lifted state persists via `handleAutoSave()` in QuickRecipeFlow.
  - On Start Brew press: persist BEFORE opening the timer (same call pattern).
- **Lift state at each HandBrewModal call site** (R10):
  - `RotationTab.jsx`, `InventoryTab.jsx`, `ChatTab.jsx`, `QuickRecipeFlow.jsx`: each adds `const [userCoffeeGrams, setUserCoffeeGrams] = useState(undefined)` and a `useEffect` that resets to `handBrew.handBrewRecipe?.userCoffeeGrams` whenever the hook's recipe identity changes (handles regenerate + cached-hydration paths).
  - Each passes `userCoffeeGrams={userCoffeeGrams}` and `onCoffeeGramsChange={setUserCoffeeGrams}` to `<HandBrewModal>`.
- **Wire QuickRecipeFlow ephemeral bean persistence** (R10):
  - In `QuickRecipeFlow.jsx:247-250`, where `beanData.handBrewRecipe = { ...handBrew.handBrewRecipe, generatedAt: ... }` is constructed, also set `beanData.handBrewRecipe.userCoffeeGrams = userCoffeeGrams` if the lifted state has a value.
  - This is the one real codebase deviation flagged by the audit — the current `handleAutoSave` has no plumbing for the override.
- Regenerate path: the existing `useHandBrew.js:95-103` full-replacement write naturally clears `userCoffeeGrams`. The lifted-state `useEffect([handBrew.handBrewRecipe])` picks up the new recipe identity and resets local state to `undefined`. No changes to `useHandBrew.js` needed (audit confirmed).
- Verify `src/lib/haptics.js` has `haptic.medium()` — if not, it was added for the timer feature. If truly missing, use `haptic.heavy()` as the boundary bump.
- Manual test: cached recipe → adjust dose → close → reopen → dose restored. Adjust dose → Start Brew → BrewTimer shows scaled water. Regenerate → dose resets to AI default. Scroll modal body while holding `+` → `pointercancel` fires → ticking stops.
- Estimated: 1 day (bumped from 0.75d to account for lifted state at 4 call sites and pointer-events ergonomics)

### Phase 2: (intentionally empty — out of scope)

- No Phase 2. This is a single-surface feature with minimal branching.
- Live mid-brew dose updates: explicitly out of scope per origin R9.
- Water stepper: explicitly out of scope — water is derived.
- Ratio adjustment: explicitly out of scope per origin (regenerate if you want a different strength).

## System-Wide Impact

### Interaction Graph

- User taps `+` on DoseStepperCard → `useRepeatPress` fires `onTick` → `setUserCoffeeGrams(d => d + 1)` → React re-renders HandBrewModal → `useMemo` recomputes scaled recipe → step timeline and water total update → haptic.light() fires.
- User taps X (close) → `onClose` prop fires → HandBrewModal's cleanup effect calls `updateBean` with dot-path update → Firestore write fires → `useAppData` receives the snapshot update → next mount of the modal reads the new override.
- User taps Start Brew → HandBrewModal flips `timerOpen` state → `scaledRecipe` passed to BrewTimer → BrewTimer's `useBrewTimer` reads `recipe.steps[n].waterTotal` which is now the scaled value → step pills show scaled numbers.
- User taps Regenerate → existing `onRegenerate` callback → `useHandBrew` dispatches recipe regeneration → GPT call → `repairHandBrewRecipe` runs → `updateBean` writes new recipe (`handBrewRecipe: {...}` replacement, NOT merge) → HandBrewModal's local `userCoffeeGrams` state resets to `undefined` via a `useEffect([recipe])` that detects the new recipe identity.

### Error & Failure Propagation

- `scaleRecipeForDose` never throws. On bad input it returns the original recipe. Defense in depth: even if ratio is unparseable or dose is nonsense, the UI still renders the AI defaults.
- `parseRatioDivisor` returns `null` on failure — never throws.
- Firestore write failures inside `updateBean`: existing error handling applies. If the write fails, the local state still reflects the user's adjustment, and the next session will reopen with the AI default dose (as if the adjustment never happened). This is acceptable — dose is a per-session detail, and the user can re-adjust.
- `useRepeatPress` cleanup: if the component unmounts mid-hold, `useEffect` cleanup clears the timer. If the touchend event is missed (e.g. finger drags off the button), `onTouchMove` and `onTouchCancel` handlers fire cleanup.

### State Lifecycle Risks

- **No orphaned data.** The override is a single optional field on the bean doc. Deleting a bean deletes the override. Regenerating the recipe replaces the whole `handBrewRecipe` object and implicitly clears the override.
- **No persistence race.** The Firestore write happens on terminal actions only (close, Start Brew). Two concurrent modals for the same bean aren't possible in this app.
- **Hydration race on open.** If Firestore is still syncing the latest override when the modal opens, the modal shows the AI default briefly, then updates when the snapshot arrives. The `useEffect([recipe?.userCoffeeGrams])` reconciles local state with Firestore state on every update.

### API Surface Parity

- HandBrewModal is the ONLY surface that exposes hand-brew recipes interactively. No other component edits dose.
- AidenModal explicitly does not get a dose stepper (origin: out of scope). Aiden recipes are machine-driven.
- BeanCard shows `bean.handBrewRecipe.coffeeGrams` as part of the "Last Brew" summary. This shows the ORIGINAL AI dose, not the override — that's fine for an at-a-glance summary. If we want the override to show, that's a separate decision (not in this plan).

### Integration Test Scenarios

These cross-layer scenarios would slip past unit tests:

1. **Regenerate clears override and next open shows fresh dose.** Start at 20g AI default → adjust to 18g → close → reopen → verify 18g → tap Regenerate → new recipe generates (might be 21g) → verify stepper shows 21g, not 18g.
2. **Start Brew after adjustment passes scaled recipe to timer.** Cached recipe with 20g, 315g water, steps [50, 120, 200, 250] → adjust to 18g → tap Start Brew → verify BrewTimer's step pills show 45g, 108g, 180g, 225g.
3. **Backgrounding preserves local state mid-adjustment.** Adjust to 18g → don't close → background the app → return → verify stepper still shows 18g and scaled values.
4. **QuickRecipeFlow ephemeral bean.** Scan a bean → recipe generates → adjust dose → tap Start Brew → timer shows scaled water → close timer → tap Quick Rate (which calls `handleAutoSave`) → verify the saved bean doc in Firestore has `handBrewRecipe.userCoffeeGrams` populated.
5. **Unparseable ratio.** Force a recipe with `ratio: "garbage"` → adjust dose → verify stepper still works, coffeeGrams updates in-place, water and step totals do NOT update (gracefully degraded).

## Sources & References

### Origin

- **Origin document:** `docs/brainstorms/2026-04-12-handbrew-modal-fixes-requirements.md`
- **Key decisions carried forward:**
  - Stepper (not inline input, not modal) for speed
  - Persist per bean as `handBrewRecipe.userCoffeeGrams` override
  - Regenerate resets the override (simpler contract)
  - Whole grams only, round each value independently, no sum-balancing
  - Water and step totals computed at render time — recipe document stays pristine
  - 10g-40g hard range
  - BrewTimer does not live-update mid-brew (origin R9)

### Internal References

- `src/components/HandBrewModal.jsx:41` — current component signature (`bean` prop already threaded from Phase 0 of prior rip-it).
- `src/components/HandBrewModal.jsx:9-21` — `ParamCard` definition to mirror in `DoseStepperCard`.
- `src/components/HandBrewModal.jsx:96-101` — the param grid where COFFEE/WATER/RATIO live. Line 100 is the RATIO bug site.
- `src/components/HandBrewModal.jsx:175-213` — the step timeline rendering. Must consume `scaledRecipe.steps[n].waterTotal`, not `recipe.steps[n].waterTotal`.
- `src/lib/handbrew.js:280-300` — `repairHandBrewRecipe` step 5/6 where `timeSeconds`, `timerReady`, and `totalBrewTimeSeconds` are set. None of these are touched by scaling.
- `src/hooks/useHandBrew.js:95-100` — the Firestore write on recipe generation. Verify this is a full replacement (`handBrewRecipe: {...}`) so regenerate naturally clears `userCoffeeGrams`.
- `src/hooks/useLongPress.js` — pattern to follow for `useRepeatPress.js` (timer refs, cleanup on unmount, touch event handlers, context menu suppression).
- `src/components/BrewTimer.jsx:186` — `useBrewTimer(recipe)` hook call. Once `HandBrewModal` passes the scaled recipe, this hook doesn't need any changes.
- `src/components/QuickRecipeFlow.jsx:229-264` — `handleAutoSave()`. When saving an ephemeral bean, the current `userCoffeeGrams` must flow into the bean document alongside the recipe.
- `src/styles/theme.js` — `C.accent`, `C.bg`, `C.textMuted`, `fonts.title` used for card styling. Same tokens as existing ParamCard.
- `.claude/rules/ios-layout.md` — iOS touch target guidelines (44×44pt minimum, text-selection avoidance).

### Related Prior Work

- **`docs/plans/2026-04-12-001-feat-hand-brew-timer-plan.md`** — the plan that shipped the BrewTimer feature. Phase 0 hardened the recipe data model (`timeSeconds`, `timerReady`, `totalBrewTimeSeconds`). This plan builds on that foundation.
- **`docs/solutions/logic-errors/regex-parser-malformed-structural-fallthrough.md`** — compound lesson from the prior rip-it run. Apply the same "preflight check for malformed structural inputs" pattern to `parseRatioDivisor` if tier fallback is used.
- **`docs/rip-it-runs/2026-04-13-031852.md`** — the prior rip-it report that shipped the BrewTimer. Phase 0 test pattern (`/tmp/test-handbrew.mjs` inline unit tests) is the template for `recipeScaling.js` tests.
